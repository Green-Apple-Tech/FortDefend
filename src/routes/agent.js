const express = require('express');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');

const db = require('../database');
const { getJwtSecret } = require('../config/jwtSecret');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

async function authByToken(token) {
  if (!token) return null;
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  const key = await db('api_keys')
    .where({ key_hash: hash, active: true })
    .where((q) => q.whereNull('expires_at').orWhere('expires_at', '>', new Date()))
    .first();
  return key || null;
}

function tryEnrollmentPayload(token) {
  if (!token) return null;
  try {
    const payload = jwt.verify(String(token), getJwtSecret());
    if (payload.type !== 'enrollment' || !payload.orgId) return null;
    return { orgId: payload.orgId, groupId: payload.groupId || null, payload };
  } catch {
    return null;
  }
}

async function tryPlainOrgIdToken(token) {
  if (!token || typeof token !== 'string') return null;
  const t = String(token).trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(t)) return null;
  const org = await db('orgs').where({ id: t }).first();
  if (!org) return null;
  if (org.subscription_status === 'canceled') return { rejected: 'subscription' };
  return { kind: 'enrollment', orgId: org.id, groupId: null, org };
}

async function authAgentRequest(token) {
  const fromApi = await authByToken(token);
  if (fromApi) return { kind: 'apiKey', orgId: fromApi.org_id, apiKey: fromApi };
  const plain = await tryPlainOrgIdToken(token);
  if (plain?.rejected === 'subscription') return { rejected: 'subscription' };
  if (plain) return plain;
  const enr = tryEnrollmentPayload(token);
  if (enr) {
    const org = await db('orgs').where({ id: enr.orgId }).first();
    if (!org) return null;
    if (org.subscription_status === 'canceled') return { kind: 'enrollment', rejected: 'subscription' };
    return { kind: 'enrollment', orgId: enr.orgId, groupId: enr.groupId, org };
  }
  return null;
}

async function addDeviceToGroupIfValid(deviceId, orgId, groupId) {
  if (!groupId) return;
  const g = await db('groups').where({ id: groupId, org_id: orgId }).first();
  if (!g) return;
  await db('device_groups')
    .insert({ device_id: deviceId, group_id: g.id })
    .onConflict(['device_id', 'group_id'])
    .ignore();
}

const DISK_FREE_ALERT_PCT = 2;
const SATURATION_SECONDS = 30;
const STALE_CHECKIN_MINUTES = 15;

function toNum(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toDateOrNull(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseSemver(version) {
  const match = String(version || '').trim().match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function compareSemver(a, b) {
  const av = parseSemver(a);
  const bv = parseSemver(b);
  if (!av || !bv) return 0;
  if (av[0] !== bv[0]) return av[0] - bv[0];
  if (av[1] !== bv[1]) return av[1] - bv[1];
  return av[2] - bv[2];
}

function buildAgentUpdateCommand(orgId, serverVersion) {
  const updateScript = `$url = 'https://app.fortdefend.com/api/agent/installer?org=${orgId}'; iex (irm $url)`;
  return {
    id: uuidv4(),
    type: 'run_script',
    payload: {
      scriptType: 'powershell',
      scriptContent: updateScript,
      scriptName: `Auto-update agent to ${serverVersion}`,
    },
    issuedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
  };
}

function normalizeOsName(value, fallback = 'Microsoft Windows') {
  const raw = String(value || '').trim();
  if (!raw) return fallback;
  const lower = raw.toLowerCase();
  if (lower === 'windows') return 'Microsoft Windows';
  if (lower === 'android') return 'Android';
  if (lower === 'ios') return 'iOS';
  if (lower === 'chromeos' || lower === 'chrome os') return 'ChromeOS';
  return raw;
}

async function ensureAlert({ orgId, deviceId, type, severity, message, aiAnalysis = null }) {
  const existing = await db('alerts')
    .where({ org_id: orgId, device_id: deviceId, type, resolved: false })
    .first();
  if (existing) {
    await db('alerts').where({ id: existing.id }).update({
      severity,
      message,
      ai_analysis: aiAnalysis,
      created_at: new Date(),
    });
    return existing.id;
  }
  const [row] = await db('alerts')
    .insert({
      id: db.raw('gen_random_uuid()'),
      org_id: orgId,
      device_id: deviceId,
      type,
      severity,
      message,
      ai_analysis: aiAnalysis,
      resolved: false,
      created_at: new Date(),
    })
    .returning(['id']);
  return row?.id;
}

async function resolveAlert({ orgId, deviceId, type }) {
  await db('alerts')
    .where({ org_id: orgId, device_id: deviceId, type, resolved: false })
    .update({ resolved: true, resolved_at: new Date() });
}

async function evaluateDeviceAlerts({ orgId, device }) {
  const now = new Date();
  const diskFreePct = toNum(device.disk_free_pct, null);
  if (diskFreePct != null && diskFreePct < DISK_FREE_ALERT_PCT) {
    await ensureAlert({
      orgId,
      deviceId: device.id,
      type: 'disk_free_critical',
      severity: 'critical',
      message: `${device.name}: disk free space is ${diskFreePct.toFixed(2)}% (< ${DISK_FREE_ALERT_PCT}%).`,
      aiAnalysis: 'Immediate cleanup recommended; critically low disk can destabilize endpoint health checks.',
    });
  } else {
    await resolveAlert({ orgId, deviceId: device.id, type: 'disk_free_critical' });
  }

  const cpuSince = toDateOrNull(device.high_cpu_since);
  if (cpuSince && now.getTime() - cpuSince.getTime() >= SATURATION_SECONDS * 1000) {
    await ensureAlert({
      orgId,
      deviceId: device.id,
      type: 'cpu_sustained_100',
      severity: 'critical',
      message: `${device.name}: CPU usage has remained at 100% for more than ${SATURATION_SECONDS} seconds.`,
      aiAnalysis: 'Likely process contention or runaway workload; investigate top CPU consumers.',
    });
  } else {
    await resolveAlert({ orgId, deviceId: device.id, type: 'cpu_sustained_100' });
  }

  const ramSince = toDateOrNull(device.high_ram_since);
  if (ramSince && now.getTime() - ramSince.getTime() >= SATURATION_SECONDS * 1000) {
    await ensureAlert({
      orgId,
      deviceId: device.id,
      type: 'ram_sustained_100',
      severity: 'critical',
      message: `${device.name}: RAM usage has remained at 100% for more than ${SATURATION_SECONDS} seconds.`,
      aiAnalysis: 'Likely memory pressure or leak; inspect memory-heavy processes.',
    });
  } else {
    await resolveAlert({ orgId, deviceId: device.id, type: 'ram_sustained_100' });
  }

  if (device.os_outdated === true) {
    await ensureAlert({
      orgId,
      deviceId: device.id,
      type: 'os_outdated',
      severity: 'warning',
      message: `${device.name}: OS version appears outdated (${device.os || 'unknown'} ${device.os_version || ''}).`,
      aiAnalysis: 'Outdated operating systems increase vulnerability exposure and patch lag risk.',
    });
  } else {
    await resolveAlert({ orgId, deviceId: device.id, type: 'os_outdated' });
  }

  if (device.security_agent_running === false) {
    await ensureAlert({
      orgId,
      deviceId: device.id,
      type: 'security_agent_stopped',
      severity: 'critical',
      message: `${device.name}: security agent appears missing or stopped.`,
      aiAnalysis: 'Endpoint protection not active; restore security service immediately.',
    });
  } else {
    await resolveAlert({ orgId, deviceId: device.id, type: 'security_agent_stopped' });
  }
}

async function evaluateStaleCheckins(orgId) {
  const cutoff = new Date(Date.now() - STALE_CHECKIN_MINUTES * 60 * 1000);
  const staleDevices = await db('devices')
    .where('org_id', orgId)
    .andWhere('source', 'agent')
    .whereNotNull('last_seen')
    .andWhere('last_seen', '<', cutoff)
    .select('id', 'name', 'last_seen');
  const staleIds = new Set(staleDevices.map((d) => d.id));

  for (const d of staleDevices) {
    await ensureAlert({
      orgId,
      deviceId: d.id,
      type: 'checkin_stale',
      severity: 'warning',
      message: `${d.name}: no heartbeat received in the last ${STALE_CHECKIN_MINUTES} minutes.`,
      aiAnalysis: 'Device may be offline, agent service may be down, or network path is blocked.',
    });
  }

  const activeAlerts = await db('alerts')
    .where({ org_id: orgId, type: 'checkin_stale', resolved: false })
    .select('id', 'device_id');
  const resolveIds = activeAlerts.filter((a) => !staleIds.has(a.device_id)).map((a) => a.id);
  if (resolveIds.length > 0) {
    await db('alerts')
      .whereIn('id', resolveIds)
      .update({ resolved: true, resolved_at: new Date() });
  }
}

const agentResourceDir = path.join(__dirname, '..', '..', 'agent');
const agentDistExe = path.join(__dirname, '../../agent/dist/FortDefendAgent.exe');
const agentInstallTemplate = path.join(agentResourceDir, 'install.ps1');
const agentUninstallScript = path.join(agentResourceDir, 'uninstall.ps1');

async function resolveOrgAndGroupForInstall(orgId, groupId) {
  const org = await db('orgs').where({ id: orgId }).first();
  if (!org) return { error: 404, message: 'organization not found' };
  if (groupId) {
    const g = await db('groups').where({ id: groupId, org_id: orgId }).first();
    if (!g) return { error: 400, message: 'group not found' };
  }
  return { org, groupId: groupId || '' };
}

function buildInstallScript(baseUrl, orgId, groupId) {
  const b = baseUrl.replace(/\/$/, '');
  const gq = groupId ? `&group=${encodeURIComponent(groupId)}` : '';
  const installScriptUrl = `${b}/api/agent/install.ps1?org=${encodeURIComponent(orgId)}${gq}`;
  const downloadUrl = `${b}/api/agent/download?org=${encodeURIComponent(orgId)}${gq}`;
  let src = fs.readFileSync(agentInstallTemplate, 'utf8');
  src = src
    .replace(/__INSTALL_SCRIPT_URL__/g, installScriptUrl)
    .replace(/__APP_URL__/g, b)
    .replace(/__ORG_ID__/g, orgId)
    .replace(/__GROUP_ID__/g, groupId || '')
    .replace(/__DOWNLOAD_URL__/g, downloadUrl);
  return src;
}

/**
 * One-file installer: hardcoded org/group, downloads EXE, writes ProgramData\\FortDefend\\config.json, registers task.
 */
function buildOneClickInstallerScript({ baseUrl, orgId, groupId, groupName }) {
  const b = baseUrl.replace(/\/$/, '');
  const qs = new URLSearchParams();
  qs.set('org', orgId);
  if (groupId) qs.set('group', groupId);
  const selfUrl = `${b}/api/agent/installer?${qs.toString()}`;
  const downloadUrl = `${b}/api/agent/download`;
  const cfg = {
    orgToken: orgId,
    groupId: groupId || '',
    groupName: groupName || 'General',
    serverUrl: b,
    heartbeatInterval: 30,
    version: '1.0.2',
  };
  const configJson = JSON.stringify(cfg, null, 2);
  const escSingle = (s) => String(s).replace(/'/g, "''");
  return `# FortDefend one-click installer (generated — do not edit; re-download to change org/group)
$ErrorActionPreference = 'Stop'

function Test-IsAdministrator {
  $id = [Security.Principal.WindowsIdentity]::GetCurrent()
  $p = [Security.Principal.WindowsPrincipal]$id
  return $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

if (-not (Test-IsAdministrator)) {
  Write-Host 'FortDefend: elevation required. Re-launching as administrator…' -ForegroundColor Yellow
  $u = '${escSingle(selfUrl)}'
  $arg = "-NoProfile -ExecutionPolicy Bypass -Command \`"& { iex (irm -UseBasicParsing '$u') }\`""
  Start-Process -FilePath powershell.exe -Verb RunAs -ArgumentList $arg
  exit
}

$DownloadUrl = '${escSingle(downloadUrl)}'
$InstallDir = 'C:\\ProgramData\\FortDefend'
$AgentPath = Join-Path $InstallDir 'FortDefendAgent.exe'
$ConfigPath = Join-Path $InstallDir 'config.json'
$LogDir = Join-Path $InstallDir 'logs'

Write-Host 'FortDefend: preparing directories…' -ForegroundColor Cyan
New-Item -ItemType Directory -Force -Path $InstallDir, $LogDir | Out-Null

Write-Host 'FortDefend: downloading FortDefendAgent.exe…' -ForegroundColor Cyan
Invoke-WebRequest -Uri $DownloadUrl -OutFile $AgentPath -UseBasicParsing
if (-not (Test-Path $AgentPath)) { throw 'Download failed: FortDefendAgent.exe not found' }

$ConfigJson = @'
${configJson}
'@
[System.IO.File]::WriteAllText($ConfigPath, $ConfigJson, [System.Text.UTF8Encoding]::new($false))
Write-Host 'FortDefend: wrote config.json' -ForegroundColor Cyan

$TaskName = 'FortDefend Agent'
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
$action = New-ScheduledTaskAction -Execute $AgentPath -WorkingDirectory $InstallDir
$trBoot = New-ScheduledTaskTrigger -AtStartup
$trRep = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 15) -RepetitionDuration (New-TimeSpan -Days 3650)
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
$principal = New-ScheduledTaskPrincipal -UserId 'S-1-5-18' -LogonType ServiceAccount -RunLevel Highest
Write-Host 'FortDefend: registering scheduled task…' -ForegroundColor Cyan
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger @($trBoot, $trRep) -Settings $settings -Principal $principal -Force

Write-Host 'FortDefend: starting agent…' -ForegroundColor Cyan
Start-Process -FilePath $AgentPath -WorkingDirectory $InstallDir -WindowStyle Hidden
Start-ScheduledTask -TaskName $TaskName

Write-Host 'FortDefend installed successfully!' -ForegroundColor Green
`;
}

// GET /api/agent/install.ps1?org=UUID&group= (optional) — install.ps1 with injected URLs (text/plain)
router.get('/install.ps1', async (req, res) => {
  try {
    const org = String(req.query.org || '').trim();
    if (!org) {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      return res.status(400).send('# Error: add ?org=<organization-id> (optional &group=)');
    }
    const group = String(req.query.group || '').trim();
    const check = await resolveOrgAndGroupForInstall(org, group || null);
    if (check.error) {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      return res.status(check.error).send(`# Error: ${check.message}`);
    }
    let baseUrl = (process.env.APP_URL || '').trim().replace(/\/$/, '');
    if (!baseUrl) {
      baseUrl = `${req.protocol}://${req.get('host')}`;
    }
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', 'inline; filename="fortdefend-install.ps1"');
    return res.send(buildInstallScript(baseUrl, org, group));
  } catch (err) {
    console.error('install.ps1 error:', err);
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.status(500).send('# Error: failed to load install script');
  }
});

// GET /api/agent/config.json?org=ORG_ID&group=GROUP_ID — dynamic config (org must exist in DB)
router.get('/config.json', async (req, res, next) => {
  try {
    const org = String(req.query.org || '').trim();
    if (!org) {
      return res.status(400).json({ error: 'Query parameter org is required.' });
    }
    const group = String(req.query.group || '').trim();
    const check = await resolveOrgAndGroupForInstall(org, group || null);
    if (check.error) {
      return res.status(check.error).json({ error: check.message });
    }
    let baseUrl = (process.env.APP_URL || '').trim().replace(/\/$/, '');
    if (!baseUrl) {
      baseUrl = `${req.protocol}://${req.get('host')}`;
    }
    let groupName = 'General';
    if (group) {
      const g = await db('groups').where({ id: group, org_id: org }).first();
      if (g && g.name) groupName = String(g.name);
    }
    const config = {
      orgToken: org,
      groupId: group || '',
      groupName,
      serverUrl: baseUrl,
      heartbeatInterval: 30,
      version: '1.0.2',
    };
    const configBuffer = Buffer.from(JSON.stringify(config), 'utf8');
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', 'attachment; filename="config.json"');
    return res.status(200).send(configBuffer);
  } catch (err) {
    return next(err);
  }
});

// GET /api/agent/installer?org=ORG_ID&group=GROUP_ID — one-file .ps1 with org/group baked in (downloads EXE, writes config, task)
router.get('/installer', async (req, res) => {
  try {
    const org = String(req.query.org || '').trim();
    if (!org) {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      return res.status(400).send('# Error: add ?org=<organization-id> (optional &group=)');
    }
    const group = String(req.query.group || '').trim();
    const check = await resolveOrgAndGroupForInstall(org, group || null);
    if (check.error) {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      return res.status(check.error).send(`# Error: ${check.message}`);
    }
    let baseUrl = (process.env.APP_URL || '').trim().replace(/\/$/, '');
    if (!baseUrl) {
      baseUrl = `${req.protocol}://${req.get('host')}`;
    }
    let groupName = 'General';
    if (group) {
      const g = await db('groups').where({ id: group, org_id: org }).first();
      if (g && g.name) groupName = String(g.name);
    }
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="FortDefend-Install.ps1"');
    return res.send(
      buildOneClickInstallerScript({
        baseUrl,
        orgId: org,
        groupId: group || '',
        groupName,
      }),
    );
  } catch (err) {
    console.error('installer error:', err);
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.status(500).send('# Error: failed to generate installer');
  }
});

// GET /api/agent/uninstall.ps1
router.get('/uninstall.ps1', (req, res) => {
  try {
    if (!fs.existsSync(agentUninstallScript)) {
      return res.status(404).type('text/plain').send('# Error: uninstall.ps1 not found on server');
    }
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', 'inline; filename="fortdefend-uninstall.ps1"');
    return res.sendFile(agentUninstallScript);
  } catch (err) {
    console.error('uninstall.ps1 error:', err);
    return res.status(500).type('text/plain').send('# Error: failed to load uninstall script');
  }
});

// POST /api/agent/heartbeat
router.post('/heartbeat', async (req, res) => {
  const heartbeatStartedAt = new Date().toISOString();
  const currentAgentVersion = process.env.AGENT_VERSION || '1.0.1';
  const orgToken = req.body?.orgToken || req.headers['x-org-token'];
  if (!orgToken || typeof orgToken !== 'string') {
    return res.status(400).json({ error: 'Invalid request' });
  }
  const safe200 = (body = {}) => {
    const status = body.ok === false ? 'error' : 'ok';
    const commands = Array.isArray(body.commands) ? body.commands : [];
    return res.status(200).json({
      ...body,
      status,
      commands,
      currentAgentVersion,
    });
  };
  try {
    console.log('[heartbeat] installedApps keys check:', Object.keys(req.body || {}));
    console.log('[heartbeat] body keys:', Object.keys(req.body || {}));
    console.log(
      '[heartbeat] agentVersion from body:',
      req.body?.agentVersion,
      req.body?.version,
      req.body?.telemetry?.agentVersion,
    );
    console.log('[agent/heartbeat] start', {
      at: heartbeatStartedAt,
      hasTokenHeader: Boolean(req.headers['x-org-token']),
      hasBodyToken: Boolean(req.body?.orgToken),
      hasBody: Boolean(req.body),
    });
    const token = orgToken;
    let auth = null;
    try {
      auth = await authAgentRequest(token);
    } catch (err) {
      console.error('[agent/heartbeat] auth lookup failed', {
        error: err?.message,
        stack: err?.stack,
      });
      return safe200({ ok: false, commands: [], error: 'Authentication lookup failed.' });
    }
    if (!auth) {
      console.error('[agent/heartbeat] auth failed: invalid token');
      return safe200({ ok: false, commands: [], error: 'Invalid org token.' });
    }
    if (auth.rejected === 'subscription') {
      console.error('[agent/heartbeat] auth rejected: subscription inactive', { orgId: auth.orgId || null });
      return safe200({ ok: false, commands: [], error: 'Subscription inactive.' });
    }

    const body = req.body || {};
    console.log('[heartbeat] metrics:', { cpu: body.cpuUsage, memUsed: body.memUsed, memTotal: body.memTotal });
    const payload = body;
    const orgSettings = await db('orgs')
      .where({ id: auth.orgId })
      .select('id', 'auto_update_agent')
      .first()
      .catch(() => null);
    const orgAutoUpdate = orgSettings?.auto_update_agent === true;
    const telemetry = payload.telemetry || {};
    const deviceVersion =
      req.body?.agentVersion ||
      req.body?.version ||
      req.body?.telemetry?.agentVersion ||
      req.body?.telemetry?.version ||
      null;
    console.log('[heartbeat] resolved deviceVersion:', deviceVersion);
    const installedApps = Array.isArray(payload.installedApps)
      ? payload.installedApps
      : Array.isArray(payload.apps)
        ? payload.apps
        : [];
    console.log('[heartbeat] received from device:', payload.deviceId, 'apps:', installedApps.length);
    const deviceName = payload.deviceName || payload.hostname || 'Unknown Device';
    const externalId = payload.deviceId || payload.machineGuid || payload.hostname || crypto.randomUUID();
    const source = 'agent';
    const orgId = auth.orgId;

    const groupFromBody =
      (payload.groupId != null && String(payload.groupId).trim() !== '')
        ? String(payload.groupId).trim()
        : (payload.enrollmentGroupId != null && String(payload.enrollmentGroupId).trim() !== '')
          ? String(payload.enrollmentGroupId).trim()
          : null;

    let existing = null;
    try {
      existing = await db('devices')
        .where({ org_id: orgId, source, external_id: externalId })
        .first();
    } catch (err) {
      console.error('[agent/heartbeat] failed to fetch existing device', {
        orgId,
        source,
        externalId,
        error: err?.message,
        stack: err?.stack,
      });
      return safe200({ ok: false, commands: [], error: 'Device lookup failed.' });
    }
    let deviceId = existing?.id;
    const rebootRequiredReason = ['windows_update', 'patch', 'pending_file_ops'].includes(telemetry.rebootRequiredReason)
      ? telemetry.rebootRequiredReason
      : null;
    const normalizedOs = normalizeOsName(telemetry.osName || payload.os || existing?.os || 'Microsoft Windows');
    const normalizedOsVersion = telemetry.osVersion || payload.osVersion || payload.os_version || existing?.os_version || null;
    const now = new Date();
    const cpuUsagePct = toNum(
      telemetry.cpuUsagePct ?? payload.cpuUsage ?? payload.cpu_usage_pct,
      existing?.cpu_usage_pct ?? null,
    );
    const ramUsagePct = toNum(telemetry.ramUsagePct, existing?.ram_usage_pct ?? null);
    const diskFreePct = toNum(telemetry.diskFreePct, null);
    const priorCpuSince = toDateOrNull(existing?.high_cpu_since);
    const priorRamSince = toDateOrNull(existing?.high_ram_since);
    const nextHighCpuSince = cpuUsagePct != null && cpuUsagePct >= 100 ? (priorCpuSince || now) : null;
    const nextHighRamSince = ramUsagePct != null && ramUsagePct >= 100 ? (priorRamSince || now) : null;
    const updateFields = {
      name: deviceName,
      hostname: payload.hostname || deviceName,
      serial: telemetry.serialNumber || payload.serialNumber || existing?.serial || null,
      os: normalizedOs,
      os_version: normalizedOsVersion,
      logged_in_user: telemetry.loggedInUser || existing?.logged_in_user || null,
      cpu_model: telemetry.cpuModel || existing?.cpu_model || null,
      cpu_usage_pct: toNum(telemetry.cpuUsagePct ?? payload.cpuUsage ?? payload.cpu_usage_pct, cpuUsagePct),
      mem_used_gb: toNum(payload.memUsed ?? payload.mem_used_gb ?? telemetry.memUsedGb, existing?.mem_used_gb ?? null),
      mem_total_gb: toNum(payload.memTotal ?? payload.mem_total_gb ?? telemetry.memTotalGb, existing?.mem_total_gb ?? null),
      ram_total_gb: toNum(telemetry.ramTotalGb ?? payload?.ram?.totalGb, existing?.ram_total_gb ?? null),
      ram_usage_pct: ramUsagePct,
      disk_total_gb: toNum(telemetry.diskTotalGb ?? payload?.disk?.totalGb, existing?.disk_total_gb ?? null),
      disk_free_gb: toNum(telemetry.diskFreeGb ?? payload?.disk?.freeGb ?? payload.diskFree, existing?.disk_free_gb ?? null),
      disk_usage_pct: toNum(telemetry.diskUsagePct, existing?.disk_usage_pct ?? null),
      disk_free_pct: diskFreePct,
      ip_address: telemetry.ipAddress || existing?.ip_address || null,
      agent_version:
        deviceVersion
        || telemetry.agent_version
        || payload.agent_version
        || existing?.agent_version
        || currentAgentVersion,
      os_outdated: telemetry.osOutdated === true,
      security_agent_running: telemetry.securityAgentRunning == null ? true : !!telemetry.securityAgentRunning,
      high_cpu_since: nextHighCpuSince,
      high_ram_since: nextHighRamSince,
      last_seen: now,
      status: 'online',
      security_score: payload.securityScore || existing?.security_score || 75,
      battery_level: Number.isFinite(Number(telemetry.batteryLevel)) ? Number(telemetry.batteryLevel) : null,
      battery_status: telemetry.batteryStatus || existing?.battery_status || null,
      battery_health: telemetry.batteryHealth || existing?.battery_health || null,
      on_ac_power: telemetry.onAcPower == null ? true : !!telemetry.onAcPower,
      active_user_session: !!telemetry.activeUserSession,
      idle_time_minutes: Number.isFinite(Number(telemetry.idleTimeMinutes)) ? Number(telemetry.idleTimeMinutes) : null,
      unsaved_word_docs: !!telemetry.unsavedWordDocs,
      unsaved_excel_docs: !!telemetry.unsavedExcelDocs,
      open_browser_count: Number.isFinite(Number(telemetry.openBrowserCount)) ? Number(telemetry.openBrowserCount) : 0,
      any_unsaved_changes: !!telemetry.anyUnsavedChanges,
      active_network_connections: Number.isFinite(Number(telemetry.activeNetworkConnections))
        ? Number(telemetry.activeNetworkConnections)
        : 0,
      reboot_required: !!telemetry.rebootRequired,
      reboot_required_reason: rebootRequiredReason,
      pending_update: existing?.pending_update === true,
    };

    const groupHint = req.headers['x-fortdefend-group'];
    let targetGroupId = auth.groupId || null;
    if (groupFromBody) {
      try {
        const gb = await db('groups')
          .where({ id: String(groupFromBody), org_id: orgId })
          .first();
        if (gb) targetGroupId = gb.id;
      } catch (err) {
        console.error('[agent/heartbeat] failed resolving group from body', {
          orgId,
          groupFromBody,
          error: err?.message,
          stack: err?.stack,
        });
      }
    }
    if (!targetGroupId && groupHint) {
      try {
        const g = await db('groups')
          .where({ id: String(groupHint), org_id: orgId })
          .first();
        if (g) targetGroupId = g.id;
      } catch (err) {
        console.error('[agent/heartbeat] failed resolving group from header hint', {
          orgId,
          groupHint,
          error: err?.message,
          stack: err?.stack,
        });
      }
    }

    try {
      if (!existing) {
        const [row] = await db('devices')
          .insert({
            id: db.raw('gen_random_uuid()'),
            org_id: orgId,
            name: deviceName,
            source,
            external_id: externalId,
            os: normalizedOs,
            ...updateFields,
          })
          .returning(['id']);
        deviceId = row.id;
      } else {
        await db('devices')
          .where('id', existing.id)
          .update({ ...updateFields, updated_at: new Date() });
      }
    } catch (err) {
      console.error('[agent/heartbeat] failed to upsert device', {
        orgId,
        deviceId,
        source,
        externalId,
        error: err?.message,
        stack: err?.stack,
      });
      return safe200({ ok: false, commands: [], error: 'Device update failed.' });
    }
    if (deviceVersion) {
      await db('devices').where({ id: deviceId }).update({ agent_version: deviceVersion });
    }

    let canPersistDeviceApps = false;
    if (installedApps.length > 0) {
      try {
        canPersistDeviceApps = await db.schema.hasTable('sm_device_apps');
      } catch (err) {
        console.error('[agent/heartbeat] failed checking sm_device_apps table', {
          orgId,
          deviceId,
          error: err?.message,
          stack: err?.stack,
        });
      }
      if (!canPersistDeviceApps) {
        console.error('[agent/heartbeat] skipping installedApps persistence: sm_device_apps table missing');
      }
    }
    if (installedApps.length > 0 && canPersistDeviceApps) {
      console.log('[heartbeat] saving apps:', installedApps?.length);
      const wingetIds = [
        ...new Set(
          installedApps
            .map((a) => {
              const id = a?.id ?? a?.wingetId ?? a?.Id ?? a?.winget_id;
              return id != null ? String(id).trim() : '';
            })
            .filter(Boolean),
        ),
      ];
      let known = [];
      try {
        known = wingetIds.length
          ? await db('sm_apps')
              .where('org_id', orgId)
              .whereIn('winget_id', wingetIds)
              .select('id', 'winget_id')
          : [];
      } catch (err) {
        console.error('[agent/heartbeat] failed loading sm_apps catalogue mapping', {
          orgId,
          deviceId,
          wingetIdCount: wingetIds.length,
          error: err?.message,
          stack: err?.stack,
        });
      }
      const knownByWinget = new Map(known.map((k) => [k.winget_id, k.id]));
      const nowStamp = new Date();
      for (const app of installedApps) {
        const appName = String(app?.name ?? app?.Name ?? '').trim();
        if (!appName) continue;
        const wingetIdRaw = app?.id ?? app?.wingetId ?? app?.Id ?? app?.winget_id ?? null;
        const wingetId =
          wingetIdRaw != null && String(wingetIdRaw).trim() !== '' ? String(wingetIdRaw).trim() : null;
        const installedVersion =
          app?.version == null && app?.Version == null ? null : String(app?.version ?? app?.Version ?? '');
        const latestVersion =
          app?.availableVersion == null && app?.AvailableVersion == null
            ? null
            : String(app?.availableVersion ?? app?.AvailableVersion ?? '');
        const updateAvailable =
          app?.update_available === true
          || (!!latestVersion && !!installedVersion && latestVersion !== installedVersion);
        const insertRow = {
          org_id: orgId,
          device_id: deviceId,
          app_name: appName,
          winget_id: wingetId,
          installed_version: installedVersion || null,
          latest_version: latestVersion || null,
          update_available: updateAvailable,
          catalogue_app_id: wingetId ? knownByWinget.get(wingetId) || null : null,
          last_scanned_at: nowStamp,
          created_at: nowStamp,
          updated_at: nowStamp,
        };
        const mergeFields = {
          org_id: orgId,
          winget_id: wingetId,
          installed_version: installedVersion || null,
          latest_version: latestVersion || null,
          update_available: updateAvailable,
          catalogue_app_id: wingetId ? knownByWinget.get(wingetId) || null : null,
          last_scanned_at: nowStamp,
          updated_at: nowStamp,
        };
        try {
          await db('sm_device_apps')
            .insert(insertRow)
            .onConflict(['device_id', 'app_name'])
            .merge(mergeFields);
        } catch (err) {
          const msg = String(err?.message || '').toLowerCase();
          const isSchemaIssue =
            msg.includes('sm_device_apps')
            && (msg.includes('does not exist') || msg.includes('column') || msg.includes('relation') || msg.includes('schema'));
          const isConflictTargetMissing =
            msg.includes('no unique or exclusion constraint matching the on conflict specification');
          if (isConflictTargetMissing) {
            try {
              const existingRow = await db('sm_device_apps')
                .where({ device_id: deviceId, app_name: appName })
                .first();
              if (existingRow) {
                await db('sm_device_apps').where({ id: existingRow.id }).update(mergeFields);
              } else {
                await db('sm_device_apps').insert(insertRow);
              }
            } catch (err2) {
              console.error('[agent/heartbeat] fallback upsert sm_device_apps failed', {
                orgId,
                deviceId,
                appName,
                error: err2?.message,
              });
            }
            continue;
          }
          if (isSchemaIssue) {
            console.error('[agent/heartbeat] skipping sm_device_apps insert due to schema mismatch', {
              orgId,
              deviceId,
              appName,
              error: err?.message,
            });
            break;
          }
          console.error('[agent/heartbeat] failed to upsert installed app row', {
            orgId,
            deviceId,
            appName,
            wingetId,
            error: err?.message,
            stack: err?.stack,
          });
        }
      }
    }

    try {
      const latestDevice = await db('devices').where({ id: deviceId, org_id: orgId }).first();
      if (latestDevice) {
        await evaluateDeviceAlerts({ orgId, device: latestDevice });
        await evaluateStaleCheckins(orgId);
      }
    } catch (err) {
      console.error('[agent/heartbeat] failed during alert evaluation', {
        orgId,
        deviceId,
        error: err?.message,
        stack: err?.stack,
      });
    }

    try {
      const firstGroup = await db('device_groups').where({ device_id: deviceId }).first();
      if (!firstGroup && targetGroupId) {
        await addDeviceToGroupIfValid(deviceId, orgId, targetGroupId);
      }
    } catch (err) {
      console.error('[agent/heartbeat] failed assigning group', {
        orgId,
        deviceId,
        targetGroupId,
        error: err?.message,
        stack: err?.stack,
      });
    }

    try {
      await db('scan_results').insert({
        id: db.raw('gen_random_uuid()'),
        org_id: orgId,
        device_id: deviceId,
        agent_name: 'fortdefend_windows_agent',
        result: payload,
        status: 'pass',
        ai_summary: 'Device check-in received successfully.',
      });
    } catch (err) {
      console.error('[agent/heartbeat] failed writing scan_results', {
        orgId,
        deviceId,
        error: err?.message,
        stack: err?.stack,
      });
    }

    let pendingCommands = [];
    try {
      pendingCommands = await db('sm_commands')
        .where({
          org_id: orgId,
          device_id: deviceId,
          status: 'pending',
        })
        .whereIn('command_type', ['run_script'])
        .orderBy('created_at', 'asc')
        .select('id', 'command_type', 'command_payload', 'created_at');
    } catch (err) {
      console.error('[agent/heartbeat] failed loading pending commands', {
        orgId,
        deviceId,
        error: err?.message,
        stack: err?.stack,
      });
    }

    try {
      if (auth.kind === 'apiKey') {
        await db('api_keys').where('id', auth.apiKey.id).update({ last_used_at: new Date() });
      }
    } catch (err) {
      console.error('[agent/heartbeat] failed updating api key usage', {
        orgId,
        error: err?.message,
        stack: err?.stack,
      });
    }
    const commands = pendingCommands.map((row) => ({
      id: row.id,
      type: row.command_type,
      payload: row.command_payload || {},
      createdAt: row.created_at,
      name: row.command_payload?.scriptName || row.command_type,
    }));

    const serverVersion = process.env.AGENT_VERSION || '1.0.1';
    const normalizedDeviceVersion = String(updateFields.agent_version || '').trim();
    const isOutdated = normalizedDeviceVersion && compareSemver(normalizedDeviceVersion, serverVersion) < 0;
    const forceRequested = existing?.pending_update === true;
    const shouldPushUpdate = isOutdated && (orgAutoUpdate || forceRequested);

    if (shouldPushUpdate) {
      commands.push(buildAgentUpdateCommand(orgId, serverVersion));
      await db('devices').where({ id: deviceId, org_id: orgId }).update({ pending_update: false, updated_at: new Date() });
    } else if (isOutdated) {
      await db('devices').where({ id: deviceId, org_id: orgId }).update({ pending_update: true, updated_at: new Date() });
    } else if (forceRequested) {
      await db('devices').where({ id: deviceId, org_id: orgId }).update({ pending_update: false, updated_at: new Date() });
    }

    return safe200({ ok: true, commands });
  } catch (err) {
    console.error('[agent/heartbeat] catch start raw error:', err);
    console.error('[agent/heartbeat] unhandled error', {
      error: err?.message,
      stack: err?.stack,
      bodyKeys: req.body ? Object.keys(req.body) : [],
      at: heartbeatStartedAt,
    });
    return safe200({ ok: false, commands: [], error: 'Failed to process heartbeat.' });
  }
});

router.get('/version', (req, res) => {
  return res.json({ version: process.env.AGENT_VERSION || '1.0.1' });
});

router.post('/force-update', requireAuth, async (req, res) => {
  try {
    const deviceIds = Array.isArray(req.body?.deviceIds) ? req.body.deviceIds.filter(Boolean) : [];
    let q = db('devices').where({ org_id: req.user.orgId });
    if (deviceIds.length > 0) q = q.whereIn('id', deviceIds);
    const flagged = await q.update({ pending_update: true, updated_at: new Date() });
    return res.json({ ok: true, flagged });
  } catch (err) {
    console.error('POST /api/agent/force-update error:', err);
    return res.status(500).json({ error: 'Failed to queue updates.' });
  }
});

router.post('/command-result', async (req, res) => {
  try {
    const token = req.headers['x-org-token'] || req.body?.orgToken;
    const auth = await authAgentRequest(token);
    if (!auth) return res.status(401).json({ error: 'Invalid org token.' });
    if (auth.rejected === 'subscription') {
      return res.status(402).json({ error: 'Subscription inactive.' });
    }

    const commandId = String(req.body?.commandId || '').trim();
    if (!commandId) return res.status(400).json({ error: 'commandId is required.' });
    const statusRaw = String(req.body?.status || '').toLowerCase();
    const status = ['running', 'success', 'failed', 'cancelled'].includes(statusRaw) ? statusRaw : null;
    if (!status) return res.status(400).json({ error: 'status must be running, success, failed, or cancelled.' });

    const updates = {
      status,
      updated_at: new Date(),
    };
    if (req.body?.stdout !== undefined) updates.output = req.body.stdout == null ? null : String(req.body.stdout);
    if (req.body?.errorMessage !== undefined) {
      updates.error_message = req.body.errorMessage == null ? null : String(req.body.errorMessage);
    } else if (req.body?.stderr !== undefined && String(req.body.stderr || '').trim()) {
      updates.error_message = String(req.body.stderr);
    }
    if (['success', 'failed', 'cancelled'].includes(status)) {
      updates.completed_at = new Date();
    }

    const updated = await db('sm_commands')
      .where({ id: commandId, org_id: auth.orgId })
      .update(updates)
      .returning(['id', 'status', 'updated_at', 'completed_at']);
    if (!updated.length) {
      return res.status(404).json({ error: 'Command not found.' });
    }
    const commandRow = await db('sm_commands')
      .where({ id: commandId, org_id: auth.orgId })
      .first();
    if (await db.schema.hasTable('command_results')) {
      const resultRow = {
        org_id: auth.orgId,
        device_id: commandRow?.device_id || null,
        command_id: commandId,
        command_type: commandRow?.command_type || 'run_script',
        command_input: commandRow?.command_payload ? JSON.stringify(commandRow.command_payload) : null,
        output: updates.output ?? null,
        status,
        completed_at: updates.completed_at || null,
      };
      if (resultRow.device_id) {
        await db('command_results')
          .insert(resultRow)
          .onConflict('command_id')
          .merge({
            output: resultRow.output,
            status: resultRow.status,
            completed_at: resultRow.completed_at,
          });
      }
    }

    return res.json({ ok: true, command: updated[0] });
  } catch (err) {
    console.error('Agent command-result error:', err);
    return res.status(500).json({ error: 'Failed to process command result.' });
  }
});

// GET /api/agent/download — FortDefendAgent.exe; ?org= / ?token= for tracked downloads (see below)
router.get('/download', async (req, res) => {
  try {
    const { token, org, group } = req.query;
    const hasOrg = org != null && String(org).trim() !== '';
    const hasToken = token != null && String(token).trim() !== '';
    if (!hasOrg && !hasToken) {
      if (group != null && String(group).trim() !== '') {
        return res.status(400).json({ error: 'Token or org query required when group is set.' });
      }
      if (!fs.existsSync(agentDistExe)) {
        return res.status(404).json({
          error: 'Agent binary not found. Build it: cd agent && npm install && npm run build:installer (or npm run build).',
        });
      }
      res.setHeader('Content-Disposition', 'attachment; filename="FortDefendAgent.exe"');
      return res.sendFile(agentDistExe);
    }
    if (org && !token) {
      const o = await db('orgs').where({ id: String(org) }).first();
      if (!o) return res.status(404).json({ error: 'Organization not found.' });
      if (group) {
        const g = await db('groups').where({ id: String(group), org_id: String(org) }).first();
        if (!g) return res.status(400).json({ error: 'Group not found.' });
      }
      if (!fs.existsSync(agentDistExe)) {
        return res.status(404).json({
          error: 'Agent binary not found. Build it: cd agent && npm install && npm run build:installer (or npm run build).',
        });
      }
      res.setHeader('Content-Disposition', 'attachment; filename="FortDefendAgent.exe"');
      return res.sendFile(agentDistExe);
    }
    if (!token) return res.status(400).json({ error: 'Token or org query required.' });
    let payload;
    try {
      payload = jwt.verify(String(token), getJwtSecret());
    } catch {
      return res.status(401).json({ error: 'Invalid or expired token.' });
    }
    if (payload.type !== 'enrollment' || !payload.orgId) {
      return res.status(401).json({ error: 'Invalid token type.' });
    }
    if (org && org !== payload.orgId) {
      return res.status(400).json({ error: 'Invalid org in URL.' });
    }
    if (group && (payload.groupId || '') !== String(group)) {
      return res.status(400).json({ error: 'Invalid group in URL.' });
    }
    const legacy = path.join(agentResourceDir, 'agent.exe');
    if (fs.existsSync(legacy)) {
      return res.download(legacy, 'agent.exe');
    }
    if (fs.existsSync(agentDistExe)) {
      res.setHeader('Content-Disposition', 'attachment; filename="FortDefendAgent.exe"');
      return res.sendFile(agentDistExe);
    }
    return res.status(404).json({ error: 'No agent package found on the server.' });
  } catch (err) {
    console.error('Agent download error:', err);
    return res.status(500).json({ error: 'Failed to download agent.' });
  }
});

// GET /api/agent/install — legacy alias, prefer GET /api/agent/installer?org=...
router.get('/install', async (req, res) => {
  if (String(req.query.org || '').trim()) {
    return res.redirect(302, `/api/agent/installer?${new URLSearchParams(req.query).toString()}`);
  }
  res.status(400).type('text/plain')
    .send('Use: GET /api/agent/installer?org=ORG_ID&group=GROUP_ID (group optional).');
});

module.exports = router;
