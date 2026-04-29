const DEFAULT_API_URL = 'https://app.fortdefend.com';
const AGENT_VERSION = '1.0.0';
/** 30s where supported; Chrome may enforce a minimum of 1 minute on older versions */
const HEARTBEAT_PERIOD_MIN = 0.5;
const FULL_INVENTORY_MIN = 15;
const ALARM_HEARTBEAT = 'fortdefend-heartbeat';
const ALARM_INVENTORY = 'fortdefend-inventory';

// ── Storage helpers ───────────────────────────────────────────────────────────
function getStorage(keys) {
  return new Promise((resolve) => {
    chrome.storage.local.get(keys, resolve);
  });
}

function setStorage(data) {
  return new Promise((resolve) => {
    chrome.storage.local.set(data, resolve);
  });
}

function getManagedPolicy() {
  return new Promise((resolve) => {
    if (chrome.storage.managed) {
      chrome.storage.managed.get(null, (items) => resolve(items || {}));
    } else {
      resolve({});
    }
  });
}

function randomId() {
  if (self.crypto && self.crypto.randomUUID) return self.crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** Stable client id before/after server enrollment (for payload + serial) */
async function ensureLocalDeviceId() {
  const s = await getStorage(['localDeviceId']);
  if (s.localDeviceId) return s.localDeviceId;
  const id = randomId();
  await setStorage({ localDeviceId: id });
  return id;
}

function apiBaseUrl(stored) {
  return (stored && stored.apiUrl) || DEFAULT_API_URL;
}

// ── Enrollment ─────────────────────────────────────────────────────────────────
async function registerDevice(enrollmentToken, groupIdFromCaller) {
  const deviceInfo = await getDeviceInfo();
  const localDeviceId = await ensureLocalDeviceId();
  const managed = await getManagedPolicy();
  const groupId = groupIdFromCaller || managed.groupId || undefined;
  const stored = await getStorage(['apiUrl']);
  const apiUrl = apiBaseUrl(stored);

  const res = await fetch(`${apiUrl}/api/enrollment/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      token: enrollmentToken,
      deviceName: deviceInfo.hostname || 'Chromebook',
      deviceType: 'chromebook',
      platform: 'chromeos',
      osVersion: deviceInfo.osVersion,
      serialNumber: localDeviceId,
      ...(groupId ? { groupId: String(groupId) } : {}),
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (data.error) {
    throw new Error(data.error || 'Enrollment failed');
  }
  if (data.deviceToken) {
    await setStorage({
      deviceToken: data.deviceToken,
      deviceId: data.deviceId,
      orgName: data.orgName,
      apiUrl: data.apiUrl || apiUrl,
      enrolled: true,
    });
    showNotification('FortDefend', `Connected to ${data.orgName || 'your organization'}.`);
    await runFullInventory();
  }
  return data;
}

async function tryPolicyAutoEnroll() {
  const { deviceToken, enrolled } = await getStorage(['deviceToken', 'enrolled']);
  if (deviceToken && enrolled) return;
  const managed = await getManagedPolicy();
  const orgToken = managed.orgToken;
  if (!orgToken || typeof orgToken !== 'string' || !orgToken.trim()) return;
  if (managed.autoEnroll === false) return;
  try {
    await registerDevice(orgToken.trim(), managed.groupId);
  } catch (e) {
    console.error('FortDefend policy auto-enroll failed:', e);
  }
}

// ── Heartbeats ────────────────────────────────────────────────────────────────
async function runMinimalHeartbeat() {
  const stored = await getStorage(['deviceToken', 'apiUrl', 'deviceId', 'localDeviceId', 'enrolled']);
  if (!stored.deviceToken || !stored.enrolled) return;

  const apiUrl = apiBaseUrl(stored);
  const deviceId = stored.deviceId || stored.localDeviceId;
  const body = {
    deviceId,
    timestamp: new Date().toISOString(),
    agentVersion: AGENT_VERSION,
    status: 'ok',
    fullReport: false,
  };

  let json;
  try {
    const res = await fetch(`${apiUrl}/api/extension/heartbeat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${stored.deviceToken}`,
      },
      body: JSON.stringify(body),
    });
    json = await res.json().catch(() => ({}));
  } catch (err) {
    console.error('FortDefend minimal heartbeat error:', err);
    return;
  }

  const now = new Date().toISOString();
  await setStorage({ lastHeartbeatAt: now, lastHeartbeatError: null });

  if (json && Array.isArray(json.commands) && json.commands.length > 0) {
    await setStorage({ pendingCommands: json.commands });
    for (const cmd of json.commands) {
      try {
        await handleServerCommand(cmd);
      } catch (e) {
        console.error('FortDefend command error:', e);
      }
    }
  }

  if (json && typeof json.nextCheckIn === 'number') {
    // optional: reschedule — we keep fixed alarm
  }
}

/** Full security inventory (extension audit, storage, CPU, memory) */
async function runFullInventory() {
  const stored = await getStorage(['deviceToken', 'apiUrl', 'enrolled']);
  if (!stored.deviceToken || !stored.enrolled) return;

  const apiUrl = apiBaseUrl(stored);
  const checks = [];

  const osVersion = navigator.userAgent.match(/CrOS\s+\S+\s+([\d.]+)/)?.[1] || 'Unknown';
  checks.push({
    id: 'cb_os_version',
    name: 'ChromeOS version',
    status: 'pass',
    detail: `ChromeOS ${osVersion}`,
    value: osVersion,
  });

  const extensions = await new Promise((resolve) => {
    chrome.management.getAll(resolve);
  });

  const installedExtensions = extensions.map((e) => ({
    id: e.id,
    name: e.name,
    version: e.version,
    enabled: e.enabled,
    fromWebStore: e.installType === 'normal',
    permissions: e.permissions || [],
    hostPermissions: e.hostPermissions || [],
    installType: e.installType,
  }));

  const sideloadedExtensions = installedExtensions.filter(
    (e) => e.installType !== 'normal' && e.installType !== 'admin' && e.id !== chrome.runtime.id
  );

  checks.push({
    id: 'cb_extensions',
    name: 'Extension audit',
    status: sideloadedExtensions.length > 0 ? 'warn' : 'pass',
    severity: 'warning',
    detail:
      sideloadedExtensions.length > 0
        ? `${sideloadedExtensions.length} non-Web-Store extension(s) found`
        : `${installedExtensions.length} extensions — all from approved sources`,
    value: installedExtensions.length,
  });

  const storageInfo = await new Promise((resolve) => {
    chrome.system.storage.getInfo(resolve);
  });
  if (storageInfo && storageInfo.length > 0) {
    const mainStorage = storageInfo[0];
    let freeBytes = null;
    if (mainStorage?.id && chrome.system.storage.getAvailableCapacity) {
      const available = await new Promise((resolve) => {
        chrome.system.storage.getAvailableCapacity(mainStorage.id, resolve);
      });
      freeBytes = available?.availableCapacity ?? null;
    }
    if (freeBytes == null && mainStorage.capacity != null) {
      freeBytes = mainStorage.capacity;
    }
    const freeGb = (Number(freeBytes) || 0) / (1024 * 1024 * 1024);
    checks.push({
      id: 'cb_storage',
      name: 'Storage space',
      status: freeGb < 1 ? 'fail' : freeGb < 5 ? 'warn' : 'pass',
      severity: 'warning',
      detail: `${freeGb.toFixed(1)}GB available`,
      value: freeGb,
    });
  }

  const cpuInfo = await new Promise((resolve) => {
    chrome.system.cpu.getInfo(resolve);
  });
  checks.push({
    id: 'cb_cpu',
    name: 'CPU health',
    status: 'pass',
    detail: `${cpuInfo.numOfProcessors} core${cpuInfo.numOfProcessors > 1 ? 's' : ''} — ${cpuInfo.modelName}`,
  });

  const memInfo = await new Promise((resolve) => {
    chrome.system.memory.getInfo(resolve);
  });
  const usedMem = ((memInfo.capacity - memInfo.availableCapacity) / memInfo.capacity) * 100;
  checks.push({
    id: 'cb_memory',
    name: 'Memory usage',
    status: usedMem > 90 ? 'warn' : 'pass',
    severity: 'warning',
    detail: `${Math.round(usedMem)}% used`,
    value: Math.round(usedMem),
  });

  const failed = checks.filter((c) => c.status === 'fail').length;
  const warned = checks.filter((c) => c.status === 'warn').length;
  const score = Math.max(0, 100 - failed * 20 - warned * 5);

  const deviceInfo = await getDeviceInfo();

  let json;
  try {
    const res = await fetch(`${apiUrl}/api/extension/heartbeat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${stored.deviceToken}`,
      },
      body: JSON.stringify({
        deviceName: deviceInfo.hostname || 'Chromebook',
        platform: 'chromeos',
        osVersion,
        extensionVersion: chrome.runtime.getManifest().version,
        checks,
        installedExtensions,
        securityScore: score,
        fullReport: true,
        deviceId: stored.deviceId,
        timestamp: new Date().toISOString(),
        agentVersion: AGENT_VERSION,
        status: 'ok',
      }),
    });
    json = await res.json().catch(() => ({}));
  } catch (err) {
    console.error('FortDefend full inventory error:', err);
    return;
  }

  const now = new Date().toISOString();
  const prev = await getStorage(['lastScore']);
  await setStorage({
    lastCheck: now,
    lastFullInventoryAt: now,
    lastHeartbeatAt: now,
    lastScore: score,
  });

  if (json && Array.isArray(json.commands) && json.commands.length > 0) {
    await setStorage({ pendingCommands: json.commands });
    for (const cmd of json.commands) {
      try {
        await handleServerCommand(cmd);
      } catch (e) {
        console.error('FortDefend command error:', e);
      }
    }
  }

  if (prev.lastScore && score < prev.lastScore - 10) {
    showNotification(
      'FortDefend Security Alert',
      `Your security score dropped to ${score}. Open FortDefend to see details.`
    );
  }
}

async function handleServerCommand(cmd) {
  if (!cmd || typeof cmd !== 'object') return;
  const t = (cmd.type || cmd.action || '').toLowerCase();
  if (t === 'full_inventory' || t === 'scan' || t === 'refresh') {
    await runFullInventory();
    return;
  }
  if (t === 'open_dashboard') {
    const { apiUrl: u } = await getStorage(['apiUrl']);
    chrome.tabs.create({ url: `${apiBaseUrl({ apiUrl: u })}/dashboard` });
  }
  // add more as backend grows
}

async function getDeviceInfo() {
  const osVersion = navigator.userAgent.match(/CrOS\s+\S+\s+([\d.]+)/)?.[1] || 'Unknown';
  return {
    osVersion,
    hostname: 'Chromebook',
    platform: 'chromeos',
  };
}

function showNotification(title, message) {
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/icon48.png',
    title,
    message,
  });
}

function createAlarms() {
  chrome.alarms.create(ALARM_HEARTBEAT, {
    delayInMinutes: HEARTBEAT_PERIOD_MIN,
    periodInMinutes: HEARTBEAT_PERIOD_MIN,
  });
  chrome.alarms.create(ALARM_INVENTORY, {
    delayInMinutes: FULL_INVENTORY_MIN,
    periodInMinutes: FULL_INVENTORY_MIN,
  });
}

// ── Install & startup ────────────────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(async (details) => {
  await ensureLocalDeviceId();
  createAlarms();
  await tryPolicyAutoEnroll();
  if (details.reason === 'install') {
    const after = await getStorage(['deviceToken', 'enrolled']);
    if (!after.deviceToken || !after.enrolled) {
      await chrome.tabs.create({ url: chrome.runtime.getURL('enrollment.html') });
    }
  }
});

chrome.runtime.onStartup.addListener(async () => {
  await tryPolicyAutoEnroll();
  const s = await getStorage(['deviceToken']);
  if (s.deviceToken) {
    await runMinimalHeartbeat();
  }
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === ALARM_HEARTBEAT) {
    const s = await getStorage(['deviceToken', 'enrolled']);
    if (s.deviceToken && s.enrolled) {
      await runMinimalHeartbeat();
    }
  } else if (alarm.name === ALARM_INVENTORY) {
    const s = await getStorage(['deviceToken', 'enrolled']);
    if (s.deviceToken && s.enrolled) {
      await runFullInventory();
    }
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'GET_STATUS') {
    getStorage([
      'lastCheck',
      'lastHeartbeatAt',
      'lastFullInventoryAt',
      'lastScore',
      'orgName',
      'enrolled',
      'deviceToken',
      'pendingCommands',
    ]).then((data) => {
      const connected = !!(data.deviceToken && data.enrolled);
      sendResponse({ ...data, connected });
    });
    return true;
  }
  if (message.type === 'RUN_CHECK') {
    runFullInventory().then(() => sendResponse({ done: true }));
    return true;
  }
  if (message.type === 'ENROLL') {
    registerDevice(message.token, message.groupId)
      .then((d) => sendResponse({ done: true, data: d }))
      .catch((e) => sendResponse({ done: false, error: e.message || String(e) }));
    return true;
  }
  if (message.type === 'OPEN_ENROLLMENT') {
    chrome.tabs.create({ url: chrome.runtime.getURL('enrollment.html') });
    sendResponse({ done: true });
    return true;
  }
  return false;
});
