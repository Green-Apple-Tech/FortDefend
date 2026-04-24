'use strict';

try {
  require('dotenv').config();
} catch (_) {}

const fetchImpl = typeof globalThis.fetch === 'function' ? globalThis.fetch.bind(globalThis) : require('node-fetch');

const { execFileSync, exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const execAsync = promisify(exec);

const LOG_DIR = 'C:\\ProgramData\\FortDefend\\logs';
const LOG_FILE = `${LOG_DIR}\\agent.log`;
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

  return {
    collectedAt: new Date().toISOString(),
    hostname: process.env.COMPUTERNAME || 'windows-device',
    pendingUpdates: run('winget upgrade --include-unknown | Out-String'),
    localUsers: run('Get-LocalUser | Select-Object Name,Enabled,PasswordLastSet | ConvertTo-Json -Depth 4'),
    disk: run('Get-WmiObject Win32_LogicalDisk | Select-Object DeviceID,FreeSpace,Size | ConvertTo-Json -Depth 4'),
    os: run('Get-WmiObject Win32_OperatingSystem | Select-Object Caption,Version,TotalVisibleMemorySize,LastBootUpTime | ConvertTo-Json -Depth 4'),
    cpu: run("Get-Counter '\\Processor(_Total)\\% Processor Time' | Select-Object -ExpandProperty CounterSamples | Select-Object -First 1 CookedValue | ConvertTo-Json"),
    defenderStatus: run('Get-MpComputerStatus | ConvertTo-Json -Depth 5'),
    threats: run('Get-MpThreatDetection | Select-Object -First 30 | ConvertTo-Json -Depth 6'),
    wifiSecurity: run('netsh wlan show interfaces | Out-String'),
    wazuhAlerts: fs.existsSync('C:\\Program Files (x86)\\ossec-agent\\') ? 'Wazuh agent directory found' : 'Wazuh agent not found',
    telemetry: {
      batteryLevel,
      onAcPower,
      activeUserSession: !!session?.activeUserSession,
      idleTimeMinutes: Number.isFinite(Number(session?.idleTimeMinutes)) ? Number(session.idleTimeMinutes) : null,
      openApplications: openApps || [],
      unsavedWordDocs: wordArr.some((w) => String(w?.MainWindowTitle || '').includes('*')),
      unsavedExcelDocs: excelArr.some((w) => String(w?.MainWindowTitle || '').includes('*')),
      openBrowserCount,
      anyUnsavedChanges: unsavedAnyArr.length > 0,
      processorQueueLength: Number(queue?.ProcessorQueueLength || 0),
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
    const body = collectTelemetry();
    body.sysinternals = await collectSysinternalsData();
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
      const creds = resolveCredentials();
      const delay = heartbeatIntervalMs(creds);
      if (scheduleTimer) clearTimeout(scheduleTimer);
      scheduleTimer = setTimeout(runHeartbeatLoop, delay);
    });
}

runHeartbeatLoop();
