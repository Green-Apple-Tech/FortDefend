'use strict';

try {
  require('dotenv').config();
} catch (_) {}

const fetchImpl = typeof globalThis.fetch === 'function' ? globalThis.fetch.bind(globalThis) : require('node-fetch');

const { execFileSync, execSync, exec, spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { promisify } = require('util');
const execAsync = promisify(exec);

const LOG_DIR = 'C:\\ProgramData\\FortDefend\\logs';
const LOG_FILE = `${LOG_DIR}\\agent.log`;
const AGENT_INSTALL_DIR = 'C:\\ProgramData\\FortDefend';
const AGENT_EXE_PATH = `${AGENT_INSTALL_DIR}\\FortDefendAgent.exe`;
const AGENT_NEW_EXE_PATH = `${AGENT_INSTALL_DIR}\\FortDefendAgent_new.exe`;
const AGENT_UPDATER_PS1_PATH = `${AGENT_INSTALL_DIR}\\updater.ps1`;
const AGENT_TASK_NAME = 'FortDefend Agent';
const AGENT_VERSION = '1.0.1';
const AGENT_UPDATE_BASE_URL = 'https://app.fortdefend.com';
const REG_TOKEN_PATH = 'HKLM\\SOFTWARE\\FortDefend';
const REG_ORG_KEY = 'OrgToken';
const REG_TOKEN_KEY_LEGACY = 'Token';
const REG_GROUP_KEY = 'GroupId';
const REG_APIURL_KEY = 'ApiUrl';
const NO_ORG_TOKEN_MSG =
  'FortDefend: No org token found. Please run the installer script or set ORG_TOKEN environment variable.';

const DEFER_FILE = 'C:\\ProgramData\\FortDefend\\defer-state.json';
let warnedNoToken = false;
let scheduleTimer = null;
let lastFullInventoryAt = 0;
const MIN_HEARTBEAT_MS = 30 * 1000;
const FULL_INVENTORY_MS = 15 * 60 * 1000;

function safeLog(message) {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${message}\n`, 'utf8');
  } catch {}
}

function getRegistryStringValue(name) {
  try {
    const raw = execFileSync('reg', ['query', REG_TOKEN_PATH, '/v', name], { encoding: 'utf8', windowsHide: true });
    const parts = raw.trim().split(/\s{2,}/);
    return (parts[parts.length - 1] || '').trim();
  } catch (err) {
    return '';
  }
}

function readConfigJsonFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    const text = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(text);
  } catch (err) {
    safeLog(`config read failed ${filePath}: ${err.message}`);
    return null;
  }
}

function getExeConfigPath() {
  try {
    return path.join(path.dirname(process.execPath), 'config.json');
  } catch {
    return path.join(process.cwd(), 'config.json');
  }
}

/**
 * Merges file-based config. heartbeatInterval = seconds (default 900 = 15 min if omitted).
 */
function normalizeFileConfig(obj) {
  if (!obj || !obj.orgToken) return null;
  const su =
    (obj.serverUrl && String(obj.serverUrl).trim()) || process.env.APP_URL || 'http://localhost:3000';
  const hi = obj.heartbeatInterval;
  const intervalSec = Number.isFinite(Number(hi)) && Number(hi) > 0 ? Number(hi) : 900;
  return {
    token: String(obj.orgToken).trim(),
    appUrl: String(su).replace(/\/$/, ''),
    groupId: obj.groupId != null && String(obj.groupId).trim() !== '' ? String(obj.groupId).trim() : '',
    heartbeatInterval: intervalSec,
    groupName: obj.groupName != null ? String(obj.groupName) : '',
    version: obj.version != null ? String(obj.version) : '1.0.0',
  };
}

/**
 * 1) config.json next to EXE
 * 2) Windows registry
 * 3) ORG_TOKEN / APP_URL / FORTDEFEND_GROUP_ID env
 */
function resolveCredentials() {
  const beside = getExeConfigPath();
  const cFile = readConfigJsonFile(beside);
  const fromFile = cFile && normalizeFileConfig(cFile);
  if (fromFile) return fromFile;

  const regToken = (getRegistryStringValue(REG_ORG_KEY) || getRegistryStringValue(REG_TOKEN_KEY_LEGACY) || '').trim();
  if (regToken) {
    const u = (getRegistryStringValue(REG_APIURL_KEY) || process.env.APP_URL || 'http://localhost:3000').replace(
      /\/$/,
      '',
    );
    return {
      token: regToken,
      appUrl: u,
      groupId: (getRegistryStringValue(REG_GROUP_KEY) || '').trim(),
      heartbeatInterval: 900,
      groupName: '',
      version: '1.0.0',
    };
  }
  const envTok = (process.env.ORG_TOKEN || '').trim();
  if (envTok) {
    return {
      token: envTok,
      appUrl: (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, ''),
      groupId: (process.env.FORTDEFEND_GROUP_ID || process.env.ORG_GROUP_ID || '').trim(),
      heartbeatInterval: 900,
      groupName: '',
      version: '1.0.0',
    };
  }
  return {
    token: '',
    appUrl: (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, ''),
    groupId: '',
    heartbeatInterval: 900,
    groupName: '',
    version: '1.0.0',
  };
}

function heartbeatIntervalMs(creds) {
  const sec = Math.max(15, Number(creds.heartbeatInterval) > 0 ? Number(creds.heartbeatInterval) : 900);
  return sec * 1000;
}

function parseSemver(version) {
  const match = String(version || '').trim().match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

function compareSemver(a, b) {
  const av = parseSemver(a);
  const bv = parseSemver(b);
  if (!av || !bv) return 0;
  if (av.major !== bv.major) return av.major - bv.major;
  if (av.minor !== bv.minor) return av.minor - bv.minor;
  return av.patch - bv.patch;
}

async function fetchLatestAgentVersion() {
  const url = `${AGENT_UPDATE_BASE_URL}/api/agent/version`;
  const res = await fetchImpl(url, { method: 'GET' });
  if (!res.ok) {
    throw new Error(`version check failed (${res.status})`);
  }
  const body = await res.json().catch(() => ({}));
  const latest = String(body?.version || '').trim();
  if (!latest) {
    throw new Error('version check returned empty version');
  }
  return latest;
}

async function downloadLatestAgentBinary() {
  const url = `${AGENT_UPDATE_BASE_URL}/api/agent/download`;
  const res = await fetchImpl(url, { method: 'GET' });
  if (!res.ok) {
    throw new Error(`agent download failed (${res.status})`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (!buf.length) {
    throw new Error('agent download returned empty file');
  }
  fs.mkdirSync(AGENT_INSTALL_DIR, { recursive: true });
  fs.writeFileSync(AGENT_NEW_EXE_PATH, buf);
  safeLog(`auto-update: downloaded ${buf.length} bytes to ${AGENT_NEW_EXE_PATH}`);
}

function writeUpdaterScript() {
  const script = `
$ErrorActionPreference = 'Continue'
$TaskName = '${AGENT_TASK_NAME.replace(/'/g, "''")}'
$InstallDir = '${AGENT_INSTALL_DIR.replace(/'/g, "''")}'
$CurrentExe = '${AGENT_EXE_PATH.replace(/'/g, "''")}'
$NewExe = '${AGENT_NEW_EXE_PATH.replace(/'/g, "''")}'

try { Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue } catch {}
try { Get-Process FortDefendAgent -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue } catch {}
Start-Sleep -Seconds 2

if (Test-Path $NewExe) {
  Move-Item -Path $NewExe -Destination $CurrentExe -Force
}

try { Start-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue } catch {}
try { Start-Process -FilePath $CurrentExe -WorkingDirectory $InstallDir -WindowStyle Hidden } catch {}
`;
  fs.mkdirSync(AGENT_INSTALL_DIR, { recursive: true });
  fs.writeFileSync(AGENT_UPDATER_PS1_PATH, script, 'utf8');
}

async function runUpdaterAndExit() {
  writeUpdaterScript();
  const child = spawn(
    'powershell.exe',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', AGENT_UPDATER_PS1_PATH],
    { windowsHide: true, detached: true, stdio: 'ignore' },
  );
  child.unref();
  safeLog(`auto-update: updater started from ${AGENT_UPDATER_PS1_PATH}`);
  setTimeout(() => process.exit(0), 250);
}

async function checkForAgentUpdateOnStartup() {
  try {
    safeLog(`auto-update: current=${AGENT_VERSION}, checking latest`);
    const latest = await fetchLatestAgentVersion();
    safeLog(`auto-update: latest=${latest}`);
    if (compareSemver(latest, AGENT_VERSION) <= 0) {
      safeLog('auto-update: no newer version available');
      return false;
    }
    safeLog(`auto-update: update required (${AGENT_VERSION} -> ${latest})`);
    await downloadLatestAgentBinary();
    await runUpdaterAndExit();
    return true;
  } catch (err) {
    safeLog(`auto-update: skipped due to error: ${err.message}`);
    return false;
  }
}

async function checkForUpdate(serverVersion, creds) {
  const latest = String(serverVersion || '').trim();
  if (!latest) return;
  if (compareSemver(latest, AGENT_VERSION) <= 0) return;
  safeLog(`Update available: ${AGENT_VERSION} -> ${latest}, updating...`);
  try {
    const orgToken = String(creds?.token || '').trim();
    if (!orgToken) {
      safeLog('Auto-update skipped: missing org token.');
      return;
    }
    const escToken = orgToken.replace(/'/g, "''");
    const ps = `$url = 'https://app.fortdefend.com/api/agent/installer?org=${escToken}'; iex (irm $url)`;
    const cmd = `powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "${ps.replace(/"/g, '\\"')}"`;
    execSync(cmd, { timeout: 120000, windowsHide: true, stdio: 'ignore' });
  } catch (err) {
    safeLog(`Auto-update failed: ${err.message}`);
  }
}

function run(command) {
  try {
    return execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command], { encoding: 'utf8', windowsHide: true, timeout: 120000 });
  } catch (err) {
    safeLog(`command failed: ${command} :: ${err.message}`);
    return '';
  }
}

function runScriptByType(scriptType, scriptContent) {
  const type = String(scriptType || '').toLowerCase();
  const content = String(scriptContent || '');
  if (!content.trim()) {
    throw new Error('Script content is empty.');
  }
  if (type === 'powershell') {
    return execFileSync(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', content],
      { encoding: 'utf8', windowsHide: true, timeout: 180000, maxBuffer: 10 * 1024 * 1024 }
    );
  }
  if (type === 'cmd') {
    return execFileSync('cmd.exe', ['/c', content], {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 180000,
      maxBuffer: 10 * 1024 * 1024,
    });
  }
  if (type === 'python') {
    return execFileSync('python.exe', ['-c', content], {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 180000,
      maxBuffer: 10 * 1024 * 1024,
    });
  }
  throw new Error(`Unsupported scriptType for Windows agent: ${type}`);
}

function runJson(command) {
  try {
    const out = run(command);
    if (!out) return null;
    return JSON.parse(out);
  } catch {
    return null;
  }
}

function commandExistsWin(command) {
  try {
    execFileSync('cmd.exe', ['/c', `${command} --version`], { encoding: 'utf8', windowsHide: true, timeout: 20000 });
    return true;
  } catch {
    return false;
  }
}

function wingetVersion() {
  try {
    const out = execFileSync('winget', ['--version'], {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 20000,
    });
    return String(out || '').trim();
  } catch {
    return '';
  }
}

function installWinget() {
  safeLog('winget install: checking existing installation');
  const existing = wingetVersion();
  if (existing) {
    safeLog(`winget install: already installed (${existing})`);
    return true;
  }

  safeLog('winget install: method 1 (RegisterByFamilyName)');
  try {
    run('Add-AppxPackage -RegisterByFamilyName -MainPackage Microsoft.DesktopAppInstaller_8wekyb3d8bbwe');
  } catch (err) {
    safeLog(`winget install: method 1 failed: ${err.message}`);
  }
  const afterMethod1 = wingetVersion();
  if (afterMethod1) {
    safeLog(`winget install: method 1 succeeded (${afterMethod1})`);
    return true;
  }

  safeLog('winget install: method 2 (download MSIX bundle)');
  try {
    run(
      `$url = "https://github.com/microsoft/winget-cli/releases/latest/download/Microsoft.DesktopAppInstaller_8wekyb3d8bbwe.msixbundle"; ` +
      `$out = "$env:TEMP\\AppInstaller.msixbundle"; ` +
      `Invoke-WebRequest -Uri $url -OutFile $out; ` +
      `Add-AppxPackage $out`
    );
  } catch (err) {
    safeLog(`winget install: method 2 failed: ${err.message}`);
  }
  const afterMethod2 = wingetVersion();
  if (afterMethod2) {
    safeLog(`winget install: method 2 succeeded (${afterMethod2})`);
    return true;
  }

  safeLog('winget install: method 3 fallback (Get-Package inventory only)');
  return false;
}

function fallbackInstalledApps() {
  const pkgs = runJson('(Get-Package | Select-Object Name, Version | ConvertTo-Json -Depth 4)');
  const arr = Array.isArray(pkgs) ? pkgs : (pkgs ? [pkgs] : []);
  return arr.map((p) => ({
    Name: String(p?.Name || '').trim() || 'Unknown',
    Id: null,
    Version: p?.Version != null ? String(p.Version) : null,
    AvailableVersion: null,
    update_available: false,
  }));
}

function collectInstalledApps() {
  const hasWinget = !!wingetVersion();
  if (!hasWinget) return fallbackInstalledApps();
  try {
    const out = execFileSync(
      'winget',
      ['list', '--output', 'json', '--accept-source-agreements'],
      { encoding: 'utf8', windowsHide: true, timeout: 90000, maxBuffer: 20 * 1024 * 1024 }
    );
    const parsed = JSON.parse(out);
    const source = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.Sources) ? parsed.Sources : []);
    const apps = [];
    for (const block of source) {
      const pkgs = Array.isArray(block?.Packages) ? block.Packages : [];
      for (const p of pkgs) {
        const name = String(p?.PackageIdentifier || p?.Name || '').trim() || 'Unknown';
        const id = p?.PackageIdentifier || p?.Id || null;
        const version = p?.Version || null;
        const latest = p?.AvailableVersion || null;
        apps.push({
          Name: String(p?.Name || name),
          Id: id ? String(id) : null,
          Version: version ? String(version) : null,
          AvailableVersion: latest ? String(latest) : null,
          update_available: !!(latest && version && String(latest) !== String(version)),
        });
      }
    }
    return apps;
  } catch (err) {
    safeLog(`winget list failed, using Get-Package fallback: ${err.message}`);
    return fallbackInstalledApps();
  }
}

function getMachineGuid() {
  try {
    const raw = execFileSync(
      'reg',
      ['query', 'HKLM\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid'],
      { encoding: 'utf8', windowsHide: true, timeout: 20000 }
    );
    const parts = raw.trim().split(/\s{2,}/);
    return (parts[parts.length - 1] || '').trim();
  } catch {
    return '';
  }
}

function getDeviceId() {
  return getMachineGuid() || os.hostname() || process.env.COMPUTERNAME || 'windows-device';
}

function buildHeartbeatHeaders(token, groupId) {
  const h = { 'Content-Type': 'application/json', 'x-org-token': token };
  const g = (groupId || '').trim();
  if (g) h['x-fortdefend-group'] = g;
  return h;
}

function collectTelemetry() {
  const battery = runJson("(Get-WmiObject Win32_Battery | Select EstimatedChargeRemaining,BatteryStatus | ConvertTo-Json -Compress)");
  const session = runJson("$u = query user 2>$null; $lines=@(); if($u){$lines = $u | Select-Object -Skip 1}; $active = $false; $idle = 999; foreach($l in $lines){ if($l -match 'Active'){ $active=$true }; if($l -match '\\s(\\d+|none|\\.)\\s+\\d{1,2}/'){ $v=$matches[1]; if($v -eq 'none' -or $v -eq '.'){ $idle=0 } elseif([int]$v -lt $idle){ $idle=[int]$v } } }; [pscustomobject]@{activeUserSession=$active;idleTimeMinutes=$idle} | ConvertTo-Json -Compress");
  const openApps = runJson("(Get-Process | Where-Object {$_.MainWindowTitle -ne ''} | Select-Object ProcessName,MainWindowTitle | ConvertTo-Json -Depth 4 -Compress)");
  const word = runJson("(Get-Process winword -ErrorAction SilentlyContinue | Select-Object MainWindowTitle | ConvertTo-Json -Compress)");
  const excel = runJson("(Get-Process excel -ErrorAction SilentlyContinue | Select-Object MainWindowTitle | ConvertTo-Json -Compress)");
  const browsers = runJson("(Get-Process chrome,msedge,firefox -ErrorAction SilentlyContinue | Measure-Object | Select-Object Count | ConvertTo-Json -Compress)");
  const unsaved = runJson("(Get-Process | Where-Object {$_.MainWindowTitle -match '\\*'} | Select-Object ProcessName,MainWindowTitle | ConvertTo-Json -Compress)");
  const queue = runJson("(Get-WmiObject Win32_PerfFormattedData_PerfOS_System | Select-Object ProcessorQueueLength | ConvertTo-Json -Compress)");
  const netConn = runJson("(Get-NetTCPConnection -State Established -ErrorAction SilentlyContinue | Measure-Object | Select-Object Count | ConvertTo-Json -Compress)");
  const osInfo = runJson("(Get-CimInstance Win32_OperatingSystem | Select-Object Caption,Version,BuildNumber,FreePhysicalMemory,TotalVisibleMemorySize | ConvertTo-Json -Compress)");
  const cpuModelInfo = runJson("(Get-CimInstance Win32_Processor | Select-Object -First 1 Name | ConvertTo-Json -Compress)");
  const serialInfo = runJson("(Get-CimInstance Win32_BIOS | Select-Object SerialNumber | ConvertTo-Json -Compress)");
  const csInfo = runJson("(Get-CimInstance Win32_ComputerSystem | Select-Object TotalPhysicalMemory,UserName | ConvertTo-Json -Compress)");
  const diskInfo = runJson("(Get-WmiObject Win32_LogicalDisk -Filter \"DeviceID='C:'\" | Select-Object DeviceID,FreeSpace,Size | ConvertTo-Json -Compress)");
  const ipInfo = runJson("(Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object {$_.IPAddress -notlike '169.254.*' -and $_.PrefixOrigin -ne 'WellKnown'} | Select-Object -First 1 IPAddress | ConvertTo-Json -Compress)");
  const defenderInfo = runJson("(Get-MpComputerStatus | Select-Object AMServiceEnabled,RealTimeProtectionEnabled | ConvertTo-Json -Compress)");
  const cpuUsageRaw = run("Get-Counter '\\Processor(_Total)\\% Processor Time' | Select-Object -ExpandProperty CounterSamples | Select-Object -First 1 CookedValue");
  const cpuUsagePct = Number.parseFloat(String(cpuUsageRaw || '').trim());
  const rebootRequiredWU = run("if(Test-Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\WindowsUpdate\\Auto Update\\RebootRequired'){ 'true' } else { 'false' }").trim() === 'true';
  const rebootRequiredPending = run("if(Test-Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\PendingFileRenameOperations'){ 'true' } else { 'false' }").trim() === 'true';
  const batteryEntry = Array.isArray(battery) ? battery[0] : battery;
  const noBattery = !batteryEntry;
  const batteryStatus = Number(batteryEntry?.BatteryStatus);
  const batteryLevel = noBattery ? null : Number.isFinite(Number(batteryEntry?.EstimatedChargeRemaining)) ? Number(batteryEntry.EstimatedChargeRemaining) : null;
  const onAcPower = noBattery ? true : batteryStatus === 2;
  const wordArr = Array.isArray(word) ? word : (word ? [word] : []);
  const excelArr = Array.isArray(excel) ? excel : (excel ? [excel] : []);
  const openBrowserCount = Number(browsers?.Count || 0);
  const unsavedAnyArr = Array.isArray(unsaved) ? unsaved : (unsaved ? [unsaved] : []);
  const totalRamKb = Number(osInfo?.TotalVisibleMemorySize || 0);
  const freeRamKb = Number(osInfo?.FreePhysicalMemory || 0);
  const ramUsagePct = totalRamKb > 0 ? ((totalRamKb - freeRamKb) / totalRamKb) * 100 : null;
  const totalRamGb = totalRamKb > 0 ? totalRamKb / (1024 * 1024) : null;
  const diskSize = Number(diskInfo?.Size || 0);
  const diskFree = Number(diskInfo?.FreeSpace || 0);
  const diskTotalGb = diskSize > 0 ? diskSize / (1024 * 1024 * 1024) : null;
  const diskFreeGb = diskSize > 0 ? diskFree / (1024 * 1024 * 1024) : null;
  const diskUsagePct = diskSize > 0 ? ((diskSize - diskFree) / diskSize) * 100 : null;
  const diskFreePct = diskSize > 0 ? (diskFree / diskSize) * 100 : null;
  const osVersionText = String(osInfo?.Version || '').trim();
  const buildNum = Number.parseInt(String(osInfo?.BuildNumber || ''), 10);
  const osOutdated = Number.isFinite(buildNum) ? buildNum < 19045 : false;
  const batteryStatusText = noBattery ? 'not_present' : batteryStatus === 2 ? 'charging' : 'discharging';
  const batteryHealth = noBattery ? null : (batteryLevel != null && batteryLevel < 40 ? 'degraded' : 'good');
  const securityAgentRunning = !!(defenderInfo?.AMServiceEnabled && defenderInfo?.RealTimeProtectionEnabled);

  return {
    collectedAt: new Date().toISOString(),
    deviceName: os.hostname(),
    hostname: os.hostname(),
    os: String(osInfo?.Caption || 'Windows'),
    osVersion: os.release() || osVersionText || null,
    disk: {
      freeGb: Number.isFinite(diskFreeGb) ? Number(diskFreeGb.toFixed(2)) : null,
      totalGb: Number.isFinite(diskTotalGb) ? Number(diskTotalGb.toFixed(2)) : null,
    },
    ram: {
      totalGb: Number.isFinite(totalRamGb) ? Number(totalRamGb.toFixed(2)) : null,
    },
    cpuUsage: Number.isFinite(cpuUsagePct) ? Math.max(0, Math.min(100, Number(cpuUsagePct.toFixed(2)))) : null,
    pendingUpdates: run('winget upgrade --include-unknown | Out-String'),
    localUsers: run('Get-LocalUser | Select-Object Name,Enabled,PasswordLastSet | ConvertTo-Json -Depth 4'),
    disk: run('Get-WmiObject Win32_LogicalDisk | Select-Object DeviceID,FreeSpace,Size | ConvertTo-Json -Depth 4'),
    os: run('Get-WmiObject Win32_OperatingSystem | Select-Object Caption,Version,TotalVisibleMemorySize,LastBootUpTime | ConvertTo-Json -Depth 4'),
    cpu: run("Get-Counter '\\Processor(_Total)\\% Processor Time' | Select-Object -ExpandProperty CounterSamples | Select-Object -First 1 CookedValue | ConvertTo-Json"),
    defenderStatus: run('Get-MpComputerStatus | ConvertTo-Json -Depth 5'),
    threats: run('Get-MpThreatDetection | Select-Object -First 30 | ConvertTo-Json -Depth 6'),
    wifiSecurity: run('netsh wlan show interfaces | Out-String'),
    wazuhAlerts: fs.existsSync('C:\\Program Files (x86)\\ossec-agent\\') ? 'Wazuh agent directory found' : 'Wazuh agent not found',
    installedApps: collectInstalledApps(),
    telemetry: {
      batteryLevel,
      batteryStatus: batteryStatusText,
      batteryHealth,
      onAcPower,
      activeUserSession: !!session?.activeUserSession,
      idleTimeMinutes: Number.isFinite(Number(session?.idleTimeMinutes)) ? Number(session.idleTimeMinutes) : null,
      loggedInUser: String(csInfo?.UserName || '').trim() || null,
      openApplications: openApps || [],
      unsavedWordDocs: wordArr.some((w) => String(w?.MainWindowTitle || '').includes('*')),
      unsavedExcelDocs: excelArr.some((w) => String(w?.MainWindowTitle || '').includes('*')),
      openBrowserCount,
      anyUnsavedChanges: unsavedAnyArr.length > 0,
      processorQueueLength: Number(queue?.ProcessorQueueLength || 0),
      cpuModel: String(cpuModelInfo?.Name || '').trim() || null,
      cpuUsagePct: Number.isFinite(cpuUsagePct) ? Math.max(0, Math.min(100, cpuUsagePct)) : null,
      ramTotalGb: Number.isFinite(totalRamGb) ? Number(totalRamGb.toFixed(2)) : null,
      ramUsagePct: Number.isFinite(ramUsagePct) ? Math.max(0, Math.min(100, Number(ramUsagePct.toFixed(2)))) : null,
      diskTotalGb: Number.isFinite(diskTotalGb) ? Number(diskTotalGb.toFixed(2)) : null,
      diskFreeGb: Number.isFinite(diskFreeGb) ? Number(diskFreeGb.toFixed(2)) : null,
      diskUsagePct: Number.isFinite(diskUsagePct) ? Math.max(0, Math.min(100, Number(diskUsagePct.toFixed(2)))) : null,
      diskFreePct: Number.isFinite(diskFreePct) ? Math.max(0, Math.min(100, Number(diskFreePct.toFixed(2)))) : null,
      ipAddress: String(ipInfo?.IPAddress || '').trim() || null,
      serialNumber: String(serialInfo?.SerialNumber || '').trim() || null,
      osName: String(osInfo?.Caption || '').trim() || null,
      osVersion: os.release() || osVersionText || null,
      osOutdated,
      securityAgentRunning,
      agentVersion: resolveCredentials().version || '1.0.0',
      activeNetworkConnections: Number(netConn?.Count || 0),
      rebootRequired: rebootRequiredWU || rebootRequiredPending,
      rebootRequiredReason: rebootRequiredWU ? 'windows_update' : rebootRequiredPending ? 'pending_file_ops' : null,
    },
  };
}

// Sysinternals data collection — add to existing heartbeat collection
async function collectSysinternalsData() {
  const results = {};
  const sysinternalsPath = 'C:\\ProgramData\\FortDefend\\sysinternals';

  try {
    // Autoruns
    const { stdout: autoruns } = await execAsync(
      `"${sysinternalsPath}\\autorunsc.exe" -accepteula -a * -c -h -s 2>nul`,
      { timeout: 30000 }
    ).catch(() => ({ stdout: '' }));
    results.autoruns = autoruns;

    // Sigcheck on startup folder
    const { stdout: sigcheck } = await execAsync(
      `"${sysinternalsPath}\\sigcheck.exe" -accepteula -c -e "C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs\\StartUp" 2>nul`,
      { timeout: 30000 }
    ).catch(() => ({ stdout: '' }));
    results.sigcheck = sigcheck;

    // TCPView snapshot
    const { stdout: tcpview } = await execAsync(
      `"${sysinternalsPath}\\tcpvcon.exe" -accepteula -a -c 2>nul`,
      { timeout: 15000 }
    ).catch(() => ({ stdout: '' }));
    results.tcpview = tcpview;
  } catch (err) {
    results.error = err.message;
  }

  return results;
}

async function heartbeat() {
  try {
    const creds = resolveCredentials();
    if (!creds.token) {
      if (!warnedNoToken) {
        warnedNoToken = true;
        console.error(NO_ORG_TOKEN_MSG);
        safeLog(NO_ORG_TOKEN_MSG);
      } else {
        safeLog('no org token, skipping heartbeat');
      }
      return;
    }
    const now = Date.now();
    const shouldSendFull = now - lastFullInventoryAt >= FULL_INVENTORY_MS;
    const deviceId = getDeviceId();
    const baseBody = {
      deviceId,
      timestamp: new Date().toISOString(),
      status: 'online',
      hostname: os.hostname(),
      deviceName: os.hostname(),
    };
    let body = baseBody;
    if (shouldSendFull) {
      const full = collectTelemetry();
      full.deviceId = deviceId;
      full.timestamp = baseBody.timestamp;
      full.status = 'online';
      full.hostname = baseBody.hostname;
      full.deviceName = baseBody.deviceName;
      full.osVersion = full.osVersion || os.release();
      full.installedApps = collectInstalledApps();
      full.sysinternals = await collectSysinternalsData();
      body = full;
      lastFullInventoryAt = now;
      safeLog(`heartbeat mode=full apps=${Array.isArray(full.installedApps) ? full.installedApps.length : 0}`);
    } else {
      safeLog('heartbeat mode=minimal');
    }
    if (creds.groupId) {
      body.groupId = creds.groupId;
      body.enrollmentGroupId = creds.groupId;
    }
    const res = await fetchImpl(`${creds.appUrl}/api/agent/heartbeat`, {
      method: 'POST',
      headers: buildHeartbeatHeaders(creds.token, creds.groupId),
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    await checkForUpdate(json.currentAgentVersion, creds);
    safeLog(`heartbeat status=${res.status}`);
    if (Array.isArray(json.commands)) {
      for (const cmd of json.commands) {
        try {
          safeLog(`executing command: ${cmd.name || 'unnamed'}`);
          const type = String(cmd.type || '').toLowerCase();
          if (type === 'reboot') {
            await handleRebootCommand(cmd);
          } else if (type === 'run_script') {
            await postCommandResult(creds, cmd.id, {
              status: 'running',
              stdout: '',
              stderr: '',
            });
            const payload = cmd.payload || {};
            const output = runScriptByType(payload.scriptType, payload.scriptContent);
            await postCommandResult(creds, cmd.id, {
              status: 'success',
              stdout: output || '',
              stderr: '',
            });
          } else {
            run(cmd.powershell || '');
          }
        } catch (err) {
          safeLog(`command failed: ${err.message}`);
          if (cmd && cmd.id) {
            await postCommandResult(creds, cmd.id, {
              status: 'failed',
              stdout: err.stdout ? String(err.stdout) : '',
              stderr: err.stderr ? String(err.stderr) : '',
              errorMessage: err.message,
            });
          }
        }
      }
    }
  } catch (err) {
    safeLog(`heartbeat failed: ${err.message}`);
  }
}

async function postCommandResult(creds, commandId, result) {
  if (!commandId) return;
  try {
    await fetchImpl(`${creds.appUrl}/api/agent/command-result`, {
      method: 'POST',
      headers: buildHeartbeatHeaders(creds.token, creds.groupId),
      body: JSON.stringify({
        commandId,
        status: result.status,
        stdout: result.stdout,
        stderr: result.stderr,
        errorMessage: result.errorMessage || null,
      }),
    });
  } catch (err) {
    safeLog(`command-result post failed (${commandId}): ${err.message}`);
  }
}

function readDeferState() {
  try {
    if (!fs.existsSync(DEFER_FILE)) return { count: 0 };
    return JSON.parse(fs.readFileSync(DEFER_FILE, 'utf8'));
  } catch {
    return { count: 0 };
  }
}

function writeDeferState(state) {
  try {
    fs.writeFileSync(DEFER_FILE, JSON.stringify(state), 'utf8');
  } catch {}
}

function showToast(message) {
  const ps = `$msg = "${String(message || '').replace(/"/g, '\\"')}"; [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] > $null; [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] > $null; $template = "<toast><visual><binding template='ToastGeneric'><text>FortDefend Restart Notice</text><text>$msg</text></binding></visual></toast>"; $xml = New-Object Windows.Data.Xml.Dom.XmlDocument; $xml.LoadXml($template); $toast = [Windows.UI.Notifications.ToastNotification]::new($xml); $notifier = [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('FortDefend'); $notifier.Show($toast);`;
  run(ps);
}

async function reportDefer(count) {
  try {
    const creds = resolveCredentials();
    if (!creds.token) return;
    await fetchImpl(`${creds.appUrl}/api/agent/heartbeat`, {
      method: 'POST',
      headers: buildHeartbeatHeaders(creds.token, creds.groupId),
      body: JSON.stringify({ event: 'reboot_defer', deferCount: count, hostname: process.env.COMPUTERNAME || 'windows-device' }),
    });
  } catch {}
}

async function handleRebootCommand(cmd) {
  const message = cmd.message || 'Your computer will restart soon to complete important updates.';
  const deferMax = Number(cmd.deferMaxTimes || 2);
  const state = readDeferState();
  showToast(message);
  const userChoice = String(cmd.userChoice || 'restart_now').toLowerCase();
  if (userChoice === 'remind_me_later' && state.count < deferMax) {
    state.count += 1;
    writeDeferState(state);
    safeLog(`reboot deferred count=${state.count}`);
    await reportDefer(state.count);
    return;
  }
  writeDeferState({ count: 0 });
  run(`shutdown /r /t 300 /c "${String(message).replace(/"/g, "'")}"`);
}

function runHeartbeatLoop() {
  heartbeat()
    .catch(() => {})
    .finally(() => {
      if (scheduleTimer) clearTimeout(scheduleTimer);
      scheduleTimer = setTimeout(runHeartbeatLoop, MIN_HEARTBEAT_MS);
    });
}

(async () => {
  const updateStarted = await checkForAgentUpdateOnStartup();
  if (updateStarted) return;
  try {
    const wingetReady = installWinget();
    const v = wingetVersion();
    safeLog(`winget startup final: ${wingetReady && v ? `available (${v})` : 'not available, using Get-Package fallback'}`);
  } catch (err) {
    safeLog(`winget startup check failed: ${err.message}`);
  }
  runHeartbeatLoop();
})();
