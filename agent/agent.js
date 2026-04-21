'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const LOG_DIR = 'C:\\ProgramData\\FortDefend\\logs';
const LOG_FILE = `${LOG_DIR}\\agent.log`;
const REG_TOKEN_PATH = 'HKLM\\SOFTWARE\\FortDefend';
const REG_TOKEN_KEY = 'Token';
const APP_URL = process.env.APP_URL || 'http://localhost:3000';
const DEFER_FILE = 'C:\\ProgramData\\FortDefend\\defer-state.json';

function safeLog(message) {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${message}\n`, 'utf8');
  } catch {}
}

function run(command) {
  try {
    return execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command], { encoding: 'utf8', windowsHide: true, timeout: 120000 });
  } catch (err) {
    safeLog(`command failed: ${command} :: ${err.message}`);
    return '';
  }
}

function getRegistryToken() {
  try {
    const raw = execFileSync('reg', ['query', REG_TOKEN_PATH, '/v', REG_TOKEN_KEY], { encoding: 'utf8', windowsHide: true });
    const parts = raw.trim().split(/\s{2,}/);
    return parts[parts.length - 1] || '';
  } catch (err) {
    safeLog(`registry token read failed: ${err.message}`);
    return '';
  }
}

function collectTelemetry() {
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
  };
}

async function heartbeat() {
  try {
    const token = getRegistryToken();
    if (!token) {
      safeLog('no org token found, skipping heartbeat');
      return;
    }
    const body = collectTelemetry();
    const res = await fetch(`${APP_URL}/api/agent/heartbeat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-org-token': token },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    safeLog(`heartbeat status=${res.status}`);
    if (Array.isArray(json.commands)) {
      for (const cmd of json.commands) {
        try {
          safeLog(`executing command: ${cmd.name || 'unnamed'}`);
          if (String(cmd.type || '').toLowerCase() === 'reboot') {
            await handleRebootCommand(cmd);
          } else {
            run(cmd.powershell || '');
          }
        } catch (err) {
          safeLog(`command failed: ${err.message}`);
        }
      }
    }
  } catch (err) {
    safeLog(`heartbeat failed: ${err.message}`);
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
    const token = getRegistryToken();
    await fetch(`${APP_URL}/api/agent/heartbeat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-org-token': token },
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

setInterval(() => heartbeat().catch(() => {}), 15 * 60 * 1000);
heartbeat().catch(() => {});
