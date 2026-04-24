const express = require('express');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');

const db = require('../database');
const { getJwtSecret } = require('../config/jwtSecret');

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

function escapeForPsSingleQuoted(s) {
  return String(s).replace(/'/g, "''");
}

/** PowerShell body for GET /api/agent/install.ps1 */
function buildInstallPs1Content(baseUrl, orgId) {
  const b = escapeForPsSingleQuoted(baseUrl.replace(/\/$/, ''));
  const o = escapeForPsSingleQuoted(orgId);
  return [
    '# FortDefend Windows agent — install (generated)',
    '#Requires -RunAsAdministrator',
    "$ErrorActionPreference = 'Stop'",
    `$BaseUrl = '${b}'`,
    `$OrgId = '${o}'`,
    "$InstallDir = 'C:\\ProgramData\\FortDefend'",
    "$AgentPath = Join-Path $InstallDir 'agent.js'",
    '',
    "if (-not (Get-Command node -ErrorAction SilentlyContinue)) {",
    "  Write-Host 'Installing Node.js (winget)…' -ForegroundColor Cyan",
    "  if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {",
    "    throw 'Node.js is required. Install LTS from https://nodejs.org then re-run this script.'",
    '  }',
    '  winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements --silent',
    "  $env:Path = [System.Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [System.Environment]::GetEnvironmentVariable('Path','User')",
    "  if (-not (Get-Command node -ErrorAction SilentlyContinue)) {",
    "    throw 'Node was not found in PATH after install. Open a new Administrator PowerShell and run this install command again.'",
    '  }',
    '}',
    'New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null',
    "$dl = $BaseUrl + '/api/agent/download?org=' + [uri]::EscapeDataString($OrgId)",
    'Write-Host ("Downloading agent: $dl") -ForegroundColor Cyan',
    'Invoke-WebRequest -Uri $dl -OutFile $AgentPath -UseBasicParsing',
    "New-Item -Path 'HKLM:\\SOFTWARE\\FortDefend' -Force | Out-Null",
    "Set-ItemProperty -Path 'HKLM:\\SOFTWARE\\FortDefend' -Name 'Token' -Value $OrgId",
    "Set-ItemProperty -Path 'HKLM:\\SOFTWARE\\FortDefend' -Name 'ApiUrl' -Value $BaseUrl",
    "$nodeExe = (Get-Command node).Source",
    "$act = New-ScheduledTaskAction -Execute $nodeExe -Argument $AgentPath -WorkingDirectory $InstallDir",
    '$tr = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 15) -RepetitionDuration (New-TimeSpan -Days 3650)',
    '$st = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable',
    "$principal = New-ScheduledTaskPrincipal -UserId 'S-1-5-18' -LogonType ServiceAccount -RunLevel Highest",
    "Unregister-ScheduledTask -TaskName 'FortDefendAgent' -Confirm:$false -ErrorAction SilentlyContinue",
    "Register-ScheduledTask -TaskName 'FortDefendAgent' -Action $act -Trigger $tr -Settings $st -Principal $principal -Force",
    'Start-Process -FilePath $nodeExe -ArgumentList $AgentPath -WorkingDirectory $InstallDir -WindowStyle Hidden',
    "Start-ScheduledTask -TaskName 'FortDefendAgent'",
    "Write-Host 'FortDefend agent installed. Scheduled every 15 minutes; first run started.' -ForegroundColor Green",
  ].join('\n');
}

// GET /api/agent/install.ps1?org=UUID — inline PowerShell installer (text/plain)
router.get('/install.ps1', async (req, res) => {
  try {
    const org = String(req.query.org || '').trim();
    if (!org) {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      return res.status(400).send('# Error: add query parameter org=<your-organization-id>');
    }
    const row = await db('orgs').where({ id: org }).first();
    if (!row) {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      return res.status(404).send('# Error: organization not found');
    }
    let baseUrl = (process.env.APP_URL || '').trim().replace(/\/$/, '');
    if (!baseUrl) {
      baseUrl = `${req.protocol}://${req.get('host')}`;
    }
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', 'inline; filename="fortdefend-install.ps1"');
    return res.send(buildInstallPs1Content(baseUrl, org));
  } catch (err) {
    console.error('install.ps1 error:', err);
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.status(500).send('# Error: failed to build install script');
  }
});

// POST /api/agent/heartbeat
router.post('/heartbeat', async (req, res) => {
  try {
    const token = req.headers['x-org-token'] || req.body?.orgToken;
    const auth = await authAgentRequest(token);
    if (!auth) return res.status(401).json({ error: 'Invalid org token.' });
    if (auth.rejected === 'subscription') {
      return res.status(402).json({ error: 'Subscription inactive.' });
    }

    const payload = req.body || {};
    const telemetry = payload.telemetry || {};
    const deviceName = payload.deviceName || payload.hostname || 'Unknown Device';
    const externalId = payload.deviceId || payload.machineGuid || payload.hostname || crypto.randomUUID();
    const source = 'agent';
    const orgId = auth.orgId;

    const existing = await db('devices')
      .where({ org_id: orgId, source, external_id: externalId })
      .first();
    let deviceId = existing?.id;
    const rebootRequiredReason = ['windows_update', 'patch', 'pending_file_ops'].includes(telemetry.rebootRequiredReason)
      ? telemetry.rebootRequiredReason
      : null;
    const updateFields = {
      name: deviceName,
      last_seen: new Date(),
      status: 'online',
      security_score: payload.securityScore || existing?.security_score || 75,
      battery_level: Number.isFinite(Number(telemetry.batteryLevel)) ? Number(telemetry.batteryLevel) : null,
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
    };

    if (!existing) {
      const [row] = await db('devices')
        .insert({
          id: db.raw('gen_random_uuid()'),
          org_id: orgId,
          name: deviceName,
          source,
          external_id: externalId,
          os: 'windows',
          ...updateFields,
        })
        .returning(['id']);
      deviceId = row.id;
      if (auth.kind === 'enrollment' && auth.groupId) {
        await addDeviceToGroupIfValid(deviceId, orgId, auth.groupId);
      }
    } else {
      await db('devices')
        .where('id', existing.id)
        .update({ ...updateFields, updated_at: new Date() });
    }

    await db('scan_results').insert({
      id: db.raw('gen_random_uuid()'),
      org_id: orgId,
      device_id: deviceId,
      agent_name: 'fortdefend_windows_agent',
      result: payload,
      status: 'pass',
      ai_summary: 'Device check-in received successfully.',
    });

    if (auth.kind === 'apiKey') {
      await db('api_keys').where('id', auth.apiKey.id).update({ last_used_at: new Date() });
    }
    return res.json({ ok: true, commands: [] });
  } catch (err) {
    console.error('Agent heartbeat error:', err);
    return res.status(500).json({ error: 'Failed to process heartbeat.' });
  }
});

// GET /api/agent/download — ?org=UUID serves Node agent.js; ?token= JWT serves Windows agent.exe (legacy)
router.get('/download', async (req, res) => {
  try {
    const { token, org, group } = req.query;
    if (org && !token) {
      const o = await db('orgs').where({ id: String(org) }).first();
      if (!o) return res.status(404).json({ error: 'Organization not found.' });
      const agentJs = path.join(__dirname, '..', '..', 'agent', 'agent.js');
      if (!fs.existsSync(agentJs)) return res.status(404).json({ error: 'agent.js not found.' });
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
      return res.sendFile(agentJs);
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
    const p = path.join(__dirname, '..', '..', 'agent', 'agent.exe');
    if (!fs.existsSync(p)) return res.status(404).json({ error: 'agent.exe not found.' });
    return res.download(p, 'agent.exe');
  } catch (err) {
    console.error('Agent download error:', err);
    return res.status(500).json({ error: 'Failed to download agent.' });
  }
});

// GET /api/agent/install — local install.ps1 (token substituted)
router.get('/install', async (req, res) => {
  const p = path.join(__dirname, '..', '..', 'agent', 'install.ps1');
  if (!fs.existsSync(p)) return res.status(404).json({ error: 'install.ps1 not found.' });
  const template = fs.readFileSync(p, 'utf8');
  const token = String(req.query.token || '');
  const rendered = template.replace(/__ORG_TOKEN__/g, token).replace(/__APP_URL__/g, process.env.APP_URL || '');
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  return res.send(rendered);
});

module.exports = router;
