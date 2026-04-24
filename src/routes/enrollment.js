const express = require('express');
const router = express.Router();
const db = require('../database');
const { v4: uuidv4 } = require('uuid');
const QRCode = require('qrcode');
const jwt = require('jsonwebtoken');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { checkTrialStatus } = require('../middleware/trial');
const { getAppUrl } = require('../utils/appUrl');
const { getJwtSecret } = require('../config/jwtSecret');

// ── Generate enrollment token ─────────────────────────────────────────────────
// Third arg: expiry string, or { expiresIn, groupId } for org-scoped group enrollment
function generateEnrollmentToken(orgId, deviceType, expiresInOrOpts = '30d') {
  const isOpts = expiresInOrOpts && typeof expiresInOrOpts === 'object' && !Array.isArray(expiresInOrOpts);
  const expiresIn = isOpts ? (expiresInOrOpts.expiresIn || '30d') : expiresInOrOpts;
  const groupId = isOpts ? expiresInOrOpts.groupId : undefined;
  const body = { orgId, deviceType, type: 'enrollment' };
  if (groupId) body.groupId = groupId;
  return jwt.sign(body, getJwtSecret(), { expiresIn });
}

// ═ Public routes (no user session) — must be registered before admin middleware ═

// GET /api/enrollment/validate/:token — validate enrollment token
router.get('/validate/:token', async (req, res, next) => {
  try {
    let payload;
    try {
      payload = jwt.verify(req.params.token, getJwtSecret());
    } catch {
      return res.status(401).json({ error: 'Invalid or expired enrollment token.' });
    }

    if (payload.type !== 'enrollment') {
      return res.status(401).json({ error: 'Invalid token type.' });
    }

    const org = await db('orgs').where({ id: payload.orgId }).first();
    if (!org) return res.status(404).json({ error: 'Organisation not found.' });

    if (org.subscription_status === 'canceled') {
      return res.status(402).json({ error: 'Subscription inactive.' });
    }

    res.json({
      valid: true,
      orgId: org.id,
      orgName: org.name,
      deviceType: payload.deviceType,
      groupId: payload.groupId || null,
      plan: org.plan,
    });
  } catch (err) { next(err); }
});

// POST /api/enrollment/register — register device after install
router.post('/register', async (req, res, next) => {
  try {
    const { token, deviceName, deviceType, platform, osVersion, serialNumber } = req.body;

    if (!token) return res.status(400).json({ error: 'Enrollment token required.' });

    let payload;
    try {
      payload = jwt.verify(token, getJwtSecret());
    } catch {
      return res.status(401).json({ error: 'Invalid or expired enrollment token.' });
    }

    const org = await db('orgs').where({ id: payload.orgId }).first();
    if (!org) return res.status(404).json({ error: 'Organisation not found.' });

    const { n } = await db('devices')
      .where({ org_id: org.id }).count('id as n').first();
    if (parseInt(n, 10) >= (org.device_limit || 5)) {
      return res.status(402).json({
        error: 'Device limit reached. Please upgrade your plan.',
        limit: org.device_limit,
      });
    }

    const deviceId = uuidv4();
    const serial = serialNumber || deviceId;
    await db('devices').insert({
      id: deviceId,
      org_id: org.id,
      name: deviceName || `${platform} Device`,
      serial,
      os: platform || deviceType,
      os_version: osVersion || 'Unknown',
      source: 'agent',
      external_id: deviceId,
      status: 'online',
      security_score: 100,
      last_seen: new Date(),
      created_at: new Date(),
      updated_at: new Date(),
    }).onConflict(['org_id', 'serial']).merge({
      last_seen: new Date(),
      os_version: osVersion || 'Unknown',
      updated_at: new Date(),
    });

    const deviceRow = await db('devices').where({ org_id: org.id, serial }).first();
    const resolvedId = deviceRow?.id || deviceId;
    if (payload.groupId) {
      const g = await db('groups').where({ id: payload.groupId, org_id: org.id }).first();
      if (g) {
        await db('device_groups')
          .insert({ device_id: resolvedId, group_id: g.id })
          .onConflict(['device_id', 'group_id'])
          .ignore();
      }
    }

    const deviceToken = jwt.sign(
      { orgId: org.id, deviceId: resolvedId, type: 'device', platform },
      getJwtSecret(),
      { expiresIn: '365d' }
    );

    res.json({
      success: true,
      deviceId: resolvedId,
      deviceToken,
      orgName: org.name,
      apiUrl: process.env.APP_URL,
      checkInterval: platform === 'android' ? 360 : 240,
    });
  } catch (err) { next(err); }
});

function escapePsSingle(s) {
  return String(s).replace(/'/g, "''");
}

function buildAgentDownloadUrl(baseUrl, token, orgId, groupId) {
  const base = String(baseUrl || '').replace(/\/$/, '');
  const p = new URLSearchParams();
  p.set('token', String(token));
  p.set('org', String(orgId));
  if (groupId) p.set('group', String(groupId));
  return `${base}/api/agent/download?${p.toString()}`;
}

/** Full JSON for GET /api/orgs/me/enrollment (see also sendMeEnrollmentResponse). */
async function buildMeEnrollmentPayload(req) {
  const org = await db('orgs').where({ id: req.user.orgId }).first();
  if (!org) {
    return { _error: { status: 404, body: { error: 'Organization not found.' } } };
  }

  const { count } = await db('devices').where({ org_id: req.user.orgId }).count('id as count').first();
  const deviceCount = parseInt(count, 10);

  let baseUrl;
  try {
    baseUrl = getAppUrl();
  } catch {
    baseUrl = (process.env.APP_URL || '').trim().replace(/\/$/, '') || `${req.protocol}://${req.get('host')}`;
  }

  const rawGroup = req.query.groupId;
  let groupId = rawGroup;
  if (groupId === '' || groupId === undefined || groupId === null) groupId = null;
  if (groupId) {
    const g = await db('groups').where({ id: groupId, org_id: req.user.orgId }).first();
    if (!g) {
      return { _error: { status: 400, body: { error: 'Group not found.' } } };
    }
  }

  const tokenOpts = groupId ? { groupId } : undefined;
  const tokenWindows = generateEnrollmentToken(req.user.orgId, 'windows', tokenOpts);
  const tokenAndroid = generateEnrollmentToken(req.user.orgId, 'android', tokenOpts);
  const tokenChrome = generateEnrollmentToken(req.user.orgId, 'chromebook', tokenOpts);
  const tokenUniversal = generateEnrollmentToken(req.user.orgId, 'universal', tokenOpts);

  const enc = (t) => encodeURIComponent(t);
  const orgId = req.user.orgId;
  const extensionId = 'jpchjpcgcldplgfdjclgfljegdopkphc';

  const googleAdminPolicy = {
    policies: {
      ExtensionSettings: {
        [extensionId]: {
          installation_mode: 'force_installed',
          update_url: 'https://clients2.google.com/service/update2/crx',
          allowed_types: 'extension',
        },
      },
    },
  };

  const installScriptParams = new URLSearchParams();
  installScriptParams.set('token', tokenWindows);
  installScriptParams.set('org', orgId);
  if (groupId) installScriptParams.set('group', groupId);
  const msiQuery = new URLSearchParams();
  msiQuery.set('token', tokenWindows);
  msiQuery.set('org', orgId);
  if (groupId) msiQuery.set('group', groupId);

  return {
    orgId,
    orgName: org.name,
    deviceCount,
    token: orgId,
    installUrl: `${baseUrl}/install?org=${orgId}`,
    extensionId,
    chromeWebStoreUrl: `https://chrome.google.com/webstore/detail/fortdefend/${extensionId}`,
    googlePlayUrl: 'https://play.google.com/store/apps/details?id=com.fortdefend.app',
    appStoreUrl: 'https://apps.apple.com/app/fortdefend/id0000000000',
    links: {
      universalEnroll: `${baseUrl}/enroll?token=${enc(tokenUniversal)}&type=universal&org=${enc(orgId)}${groupId ? `&group=${enc(groupId)}` : ''}`,
      windowsAgent: buildAgentDownloadUrl(baseUrl, tokenWindows, orgId, groupId),
      windowsMsi: `${baseUrl}/download/fortdefend-setup.msi?${msiQuery.toString()}`,
      installScript: `${baseUrl}/api/enrollment/install-script?${installScriptParams.toString()}`,
      android: `${baseUrl}/enroll?token=${enc(tokenAndroid)}&type=android&org=${enc(orgId)}${groupId ? `&group=${enc(groupId)}` : ''}`,
      ios: `${baseUrl}/enroll?token=${enc(tokenUniversal)}&type=universal&org=${enc(orgId)}${groupId ? `&group=${enc(groupId)}` : ''}`,
      macPkg: `${baseUrl}/download/fortdefend-mac.pkg?${msiQuery.toString()}`,
      extensionCrx: `${baseUrl}/download/fortdefend-extension.crx?token=${enc(tokenChrome)}&org=${enc(orgId)}${groupId ? `&group=${enc(groupId)}` : ''}`,
      apk: `${baseUrl}/download/fortdefend.apk?${msiQuery.toString()}`,
    },
    tokens: {
      windows: tokenWindows,
      universal: tokenUniversal,
    },
    googleAdminPolicyJson: JSON.stringify(googleAdminPolicy, null, 2),
  };
}

/** Used when the full enrollment payload build throws (e.g. DB hiccup). */
async function buildMeEnrollmentFallback(req) {
  const org = await db('orgs').where({ id: req.user.orgId }).first();
  if (!org) {
    return { _error: { status: 404, body: { error: 'Organization not found.' } } };
  }

  let baseUrl;
  try {
    baseUrl = getAppUrl();
  } catch {
    baseUrl = (process.env.APP_URL || '').trim().replace(/\/$/, '') || `${req.protocol}://${req.get('host')}`;
  }

  const orgId = org.id;
  const enc = (t) => encodeURIComponent(t);
  const tokenWindows = generateEnrollmentToken(orgId, 'windows');
  const tokenAndroid = generateEnrollmentToken(orgId, 'android');
  const tokenChrome = generateEnrollmentToken(orgId, 'chromebook');
  const tokenUniversal = generateEnrollmentToken(orgId, 'universal');
  const extensionId = 'jpchjpcgcldplgfdjclgfljegdopkphc';
  const googleAdminPolicy = {
    policies: {
      ExtensionSettings: {
        [extensionId]: {
          installation_mode: 'force_installed',
          update_url: 'https://clients2.google.com/service/update2/crx',
          allowed_types: 'extension',
        },
      },
    },
  };

  let deviceCount = 0;
  try {
    const row = await db('devices').where({ org_id: orgId }).count('id as count').first();
    deviceCount = parseInt(row.count, 10);
  } catch {
    deviceCount = 0;
  }

  const installScriptParams = new URLSearchParams();
  installScriptParams.set('token', tokenWindows);
  installScriptParams.set('org', orgId);

  return {
    orgId,
    orgName: org.name,
    deviceCount,
    token: orgId,
    installUrl: `${baseUrl}/install?org=${orgId}`,
    extensionId,
    chromeWebStoreUrl: `https://chrome.google.com/webstore/detail/fortdefend/${extensionId}`,
    googlePlayUrl: 'https://play.google.com/store/apps/details?id=com.fortdefend.app',
    appStoreUrl: 'https://apps.apple.com/app/fortdefend/id0000000000',
    links: {
      universalEnroll: `${baseUrl}/enroll?token=${enc(tokenUniversal)}&type=universal&org=${enc(orgId)}`,
      windowsAgent: buildAgentDownloadUrl(baseUrl, tokenWindows, orgId, null),
      windowsMsi: `${baseUrl}/download/fortdefend-setup.msi?token=${enc(tokenWindows)}&org=${enc(orgId)}`,
      installScript: `${baseUrl}/api/enrollment/install-script?${installScriptParams.toString()}`,
      android: `${baseUrl}/enroll?token=${enc(tokenAndroid)}&type=android&org=${enc(orgId)}`,
      ios: `${baseUrl}/enroll?token=${enc(tokenUniversal)}&type=universal&org=${enc(orgId)}`,
      macPkg: `${baseUrl}/download/fortdefend-mac.pkg?token=${enc(tokenUniversal)}&org=${enc(orgId)}`,
      extensionCrx: `${baseUrl}/download/fortdefend-extension.crx?token=${enc(tokenChrome)}&org=${enc(orgId)}`,
      apk: `${baseUrl}/download/fortdefend.apk?token=${enc(tokenAndroid)}&org=${enc(orgId)}`,
    },
    tokens: {
      windows: tokenWindows,
      universal: tokenUniversal,
    },
    googleAdminPolicyJson: JSON.stringify(googleAdminPolicy, null, 2),
  };
}

async function sendMeEnrollmentResponse(req, res) {
  try {
    const payload = await buildMeEnrollmentPayload(req);
    if (payload._error) {
      return res.status(payload._error.status).json(payload._error.body);
    }
    return res.json(payload);
  } catch (err) {
    console.error('Get enrollment context error:', err);
    try {
      const fallback = await buildMeEnrollmentFallback(req);
      if (fallback._error) {
        return res.status(fallback._error.status).json(fallback._error.body);
      }
      return res.json(fallback);
    } catch (err2) {
      console.error('Enrollment fallback error:', err2);
      return res.status(500).json({ error: 'Failed to load enrollment data.' });
    }
  }
}

// GET /api/enrollment/install-script — returns PS1 (token in query; used on enrolled PCs)
router.get('/install-script', async (req, res, next) => {
  try {
    const { token, org, group } = req.query;
    if (!token) return res.status(400).json({ error: 'Token required.' });

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

    const appUrl = (process.env.APP_URL || 'https://app.fortdefend.com').replace(/\/$/, '');
    const orgId = org || payload.orgId;
    const groupId = (group || payload.groupId) || null;
    const downloadUrl = buildAgentDownloadUrl(appUrl, String(token), orgId, groupId);
    const script = generateWindowsInstallScript({ appUrl, token, orgId, groupId, downloadUrl });

    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Disposition', 'attachment; filename="fortdefend-install.ps1"');
    res.send(script);
  } catch (err) { next(err); }
});

function generateWindowsInstallScript({ appUrl, token, downloadUrl }) {
  const a = escapePsSingle(appUrl);
  const t = escapePsSingle(token);
  const d = escapePsSingle(downloadUrl);
  return `# FortDefend Windows Agent Installer
# Run as Administrator in PowerShell

$ErrorActionPreference = 'Stop'
$AppUrl = '${a}'
$EnrollToken = '${t}'
$AgentDownloadUrl = '${d}'
$InstallDir = 'C:\\ProgramData\\FortDefend'
$AgentExe = Join-Path $InstallDir 'fortdefend-agent.exe'
$NssmExe = Join-Path $InstallDir 'nssm.exe'

Write-Host "FortDefend Agent Installer" -ForegroundColor Blue
Write-Host "================================" -ForegroundColor Blue

# Check admin
if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Error "Please run as Administrator"
    exit 1
}

# Create install directory
New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
Write-Host "Created install directory" -ForegroundColor Green

# Download agent
Write-Host "Downloading FortDefend agent..." -ForegroundColor Yellow
try {
    Invoke-WebRequest -Uri $AgentDownloadUrl -OutFile $AgentExe -UseBasicParsing
    Write-Host "Agent downloaded" -ForegroundColor Green
} catch {
    Write-Error "Failed to download agent: $_"
    exit 1
}

# Download NSSM for Windows service management
Write-Host "Downloading NSSM..." -ForegroundColor Yellow
$NssmZip = Join-Path $env:TEMP 'nssm.zip'
try {
    Invoke-WebRequest -Uri 'https://nssm.cc/release/nssm-2.24.zip' -OutFile $NssmZip -UseBasicParsing
    Expand-Archive -Path $NssmZip -DestinationPath $env:TEMP -Force
    Copy-Item "$env:TEMP\\nssm-2.24\\win64\\nssm.exe" $NssmExe -Force
    Write-Host "NSSM ready" -ForegroundColor Green
} catch {
    Write-Warning "NSSM download failed - will run as scheduled task instead"
}

# Store enrollment token in registry
$RegPath = 'HKLM:\\SOFTWARE\\FortDefend'
New-Item -Path $RegPath -Force | Out-Null
Set-ItemProperty -Path $RegPath -Name 'Token' -Value $EnrollToken
Set-ItemProperty -Path $RegPath -Name 'ApiUrl' -Value $AppUrl
Set-ItemProperty -Path $RegPath -Name 'InstallDate' -Value (Get-Date -Format 'yyyy-MM-dd')
Write-Host "Configuration saved to registry" -ForegroundColor Green

# Install as Windows service using NSSM
if (Test-Path $NssmExe) {
    $ServiceName = 'FortDefendAgent'
    & $NssmExe stop $ServiceName 2>$null
    & $NssmExe remove $ServiceName confirm 2>$null
    & $NssmExe install $ServiceName $AgentExe
    & $NssmExe set $ServiceName DisplayName 'FortDefend Security Agent'
    & $NssmExe set $ServiceName Description 'FortDefend device verification and auto-healing agent'
    & $NssmExe set $ServiceName Start SERVICE_AUTO_START
    & $NssmExe set $ServiceName AppStdout (Join-Path $InstallDir 'logs\\agent.log')
    & $NssmExe set $ServiceName AppStderr (Join-Path $InstallDir 'logs\\agent-error.log')
    Start-Service $ServiceName
    Write-Host "FortDefend service installed and started" -ForegroundColor Green
} else {
    # Fallback: scheduled task
    $Action = New-ScheduledTaskAction -Execute $AgentExe
    $Trigger = New-ScheduledTaskTrigger -RepetitionInterval (New-TimeSpan -Minutes 15) -Once -At (Get-Date)
    $Settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Minutes 5) -RestartCount 3
    $Principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
    Register-ScheduledTask -TaskName 'FortDefendAgent' -Action $Action -Trigger $Trigger -Settings $Settings -Principal $Principal -Force
    Start-ScheduledTask -TaskName 'FortDefendAgent'
    Write-Host "FortDefend scheduled task created and started" -ForegroundColor Green
}

# Download Sysinternals tools
Write-Host "Downloading security tools..." -ForegroundColor Yellow
$SysDir = Join-Path $InstallDir 'sysinternals'
New-Item -ItemType Directory -Force -Path $SysDir | Out-Null
$Tools = @('autorunsc.exe', 'sigcheck.exe', 'tcpvcon.exe', 'accesschk.exe')
foreach ($Tool in $Tools) {
    try {
        Invoke-WebRequest -Uri "https://live.sysinternals.com/$Tool" -OutFile (Join-Path $SysDir $Tool) -UseBasicParsing
        Write-Host "Downloaded $Tool" -ForegroundColor Green
    } catch {
        Write-Warning "Could not download $Tool"
    }
}

Write-Host "" 
Write-Host "================================" -ForegroundColor Blue
Write-Host "FortDefend installed successfully!" -ForegroundColor Green
Write-Host "Device will appear in your dashboard within 2 minutes." -ForegroundColor Green
Write-Host "================================" -ForegroundColor Blue
`;
}

// ═ Admin-only enrollment management ═
router.use(requireAuth, requireAdmin, checkTrialStatus);

// GET /api/enrollment/links — get all enrollment links for org
router.get('/links', async (req, res, next) => {
  try {
    const org = await db('orgs').where({ id: req.user.orgId }).first();
    const baseUrl = process.env.APP_URL || 'https://app.fortdefend.com';

    const links = {
      chromebook: {
        type: 'chromebook',
        url: `${baseUrl}/enroll?token=${generateEnrollmentToken(org.id, 'chromebook')}&type=chromebook`,
        description: 'Send to users or deploy via Google Admin',
        installMethod: 'Chrome extension auto-installs when user visits link',
      },
      android: {
        type: 'android',
        url: `${baseUrl}/enroll?token=${generateEnrollmentToken(org.id, 'android')}&type=android`,
        description: 'Send via SMS, email, or QR code',
        installMethod: 'Opens Play Store to FortDefend app with org pre-linked',
      },
      windows: {
        type: 'windows',
        url: `${baseUrl}/enroll?token=${generateEnrollmentToken(org.id, 'windows')}&type=windows`,
        description: 'Send to Windows PC users or deploy via Intune',
        installMethod: 'Downloads and runs FortDefend agent installer',
      },
      universal: {
        type: 'universal',
        url: `${baseUrl}/enroll?token=${generateEnrollmentToken(org.id, 'universal')}&type=universal`,
        description: 'One link for all device types — auto-detects platform',
        installMethod: 'Detects device type and shows correct install method',
      },
    };

    res.json({ links, orgName: org.name });
  } catch (err) { next(err); }
});

// POST /api/enrollment/qr — generate QR code for enrollment
router.post('/qr', async (req, res, next) => {
  try {
    const { deviceType = 'universal', size = 300 } = req.body;
    const org = await db('orgs').where({ id: req.user.orgId }).first();
    const baseUrl = process.env.APP_URL || 'https://app.fortdefend.com';
    const token = generateEnrollmentToken(org.id, deviceType);
    const url = `${baseUrl}/enroll?token=${token}&type=${deviceType}`;

    const qrDataUrl = await QRCode.toDataURL(url, {
      width: size,
      margin: 2,
      color: { dark: '#185FA5', light: '#FFFFFF' },
    });

    res.json({
      qrDataUrl,
      url,
      deviceType,
      orgName: org.name,
      expiresIn: '30 days',
    });
  } catch (err) { next(err); }
});

module.exports = router;
module.exports.generateEnrollmentToken = generateEnrollmentToken;
module.exports.buildAgentDownloadUrl = buildAgentDownloadUrl;
module.exports.sendMeEnrollmentResponse = sendMeEnrollmentResponse;
