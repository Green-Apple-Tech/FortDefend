const express = require('express');
const router = express.Router();
const db = require('../database');
const { v4: uuidv4 } = require('uuid');
const QRCode = require('qrcode');
const jwt = require('jsonwebtoken');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { checkTrialStatus } = require('../middleware/trial');

router.use(requireAuth, requireAdmin, checkTrialStatus);

// ── Generate enrollment token ─────────────────────────────────────────────────
function generateEnrollmentToken(orgId, deviceType, expiresIn = '30d') {
  return jwt.sign(
    { orgId, deviceType, type: 'enrollment' },
    process.env.JWT_SECRET,
    { expiresIn }
  );
}

// ── GET /api/enrollment/links — get all enrollment links for org ───────────────
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

// ── POST /api/enrollment/qr — generate QR code for enrollment ────────────────
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

// ── GET /api/enrollment/validate/:token — validate enrollment token ───────────
// Public endpoint — no auth required
router.get('/validate/:token', async (req, res, next) => {
  try {
    let payload;
    try {
      payload = jwt.verify(req.params.token, process.env.JWT_SECRET);
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
      plan: org.plan,
    });
  } catch (err) { next(err); }
});

// ── POST /api/enrollment/register — register device after install ─────────────
// Called by extension/app/agent after install with enrollment token
router.post('/register', async (req, res, next) => {
  try {
    const { token, deviceName, deviceType, platform, osVersion, serialNumber } = req.body;

    if (!token) return res.status(400).json({ error: 'Enrollment token required.' });

    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      return res.status(401).json({ error: 'Invalid or expired enrollment token.' });
    }

    const org = await db('orgs').where({ id: payload.orgId }).first();
    if (!org) return res.status(404).json({ error: 'Organisation not found.' });

    // Check device limit
    const { n } = await db('devices')
      .where({ org_id: org.id }).count('id as n').first();
    if (parseInt(n, 10) >= (org.device_limit || 5)) {
      return res.status(402).json({
        error: 'Device limit reached. Please upgrade your plan.',
        limit: org.device_limit,
      });
    }

    // Register device
    const deviceId = uuidv4();
    await db('devices').insert({
      id: deviceId,
      org_id: org.id,
      name: deviceName || `${platform} Device`,
      serial: serialNumber || deviceId,
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

    // Generate device JWT for ongoing API calls
    const deviceToken = jwt.sign(
      { orgId: org.id, deviceId, type: 'device', platform },
      process.env.JWT_SECRET,
      { expiresIn: '365d' }
    );

    res.json({
      success: true,
      deviceId,
      deviceToken,
      orgName: org.name,
      apiUrl: process.env.APP_URL,
      checkInterval: platform === 'android' ? 360 : 240, // minutes
    });
  } catch (err) { next(err); }
});

// ── GET /api/enrollment/install-script — returns PS1 installer for Windows ───
router.get('/install-script', async (req, res, next) => {
  try {
    const { token } = req.query;
    if (!token) return res.status(400).json({ error: 'Token required.' });

    const appUrl = process.env.APP_URL || 'https://app.fortdefend.com';
    const script = generateWindowsInstallScript(token, appUrl);

    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Disposition', 'attachment; filename="fortdefend-install.ps1"');
    res.send(script);
  } catch (err) { next(err); }
});

function generateWindowsInstallScript(token, appUrl) {
  return `# FortDefend Windows Agent Installer
# Run as Administrator in PowerShell

$ErrorActionPreference = 'Stop'
$AppUrl = '${appUrl}'
$Token = '${token}'
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
    Invoke-WebRequest -Uri "$AppUrl/download/agent.exe" -OutFile $AgentExe -UseBasicParsing
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
Set-ItemProperty -Path $RegPath -Name 'Token' -Value $Token
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

module.exports = router;
