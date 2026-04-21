const API_URL = 'https://app.fortdefend.com';
const CHECK_INTERVAL_MINUTES = 240;

// ── Storage helpers ───────────────────────────────────────────────────────────
async function getStorage(keys) {
  return new Promise(resolve => chrome.storage.local.get(keys, resolve));
}

async function setStorage(data) {
  return new Promise(resolve => chrome.storage.local.set(data, resolve));
}

// ── On install — handle enrollment token from URL ─────────────────────────────
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    // Check if installed via enrollment URL
    const stored = await getStorage(['enrollmentToken', 'deviceToken']);
    if (!stored.deviceToken && stored.enrollmentToken) {
      await registerDevice(stored.enrollmentToken);
    }
    // Schedule regular checks
    chrome.alarms.create('fortdefend-check', {
      delayInMinutes: 1,
      periodInMinutes: CHECK_INTERVAL_MINUTES,
    });
  }
});

// ── Handle enrollment URL ─────────────────────────────────────────────────────
chrome.runtime.onStartup.addListener(async () => {
  const stored = await getStorage(['deviceToken']);
  if (!stored.deviceToken) {
    // Not yet enrolled — wait for token
    return;
  }
  await runChecks();
});

// ── Register device with enrollment token ─────────────────────────────────────
async function registerDevice(enrollmentToken) {
  try {
    const deviceInfo = await getDeviceInfo();
    const res = await fetch(`${API_URL}/api/enrollment/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: enrollmentToken,
        deviceName: deviceInfo.hostname || 'Chromebook',
        deviceType: 'chromebook',
        platform: 'chromeos',
        osVersion: deviceInfo.osVersion,
      }),
    });
    const data = await res.json();
    if (data.deviceToken) {
      await setStorage({
        deviceToken: data.deviceToken,
        deviceId: data.deviceId,
        orgName: data.orgName,
        apiUrl: data.apiUrl || API_URL,
        enrolled: true,
      });
      showNotification('FortDefend installed', `Connected to ${data.orgName}. Your Chromebook is now being monitored.`);
      await runChecks();
    }
  } catch (err) {
    console.error('FortDefend enrollment error:', err);
  }
}

// ── Run all security checks ───────────────────────────────────────────────────
async function runChecks() {
  const stored = await getStorage(['deviceToken', 'apiUrl']);
  if (!stored.deviceToken) return;

  const apiUrl = stored.apiUrl || API_URL;
  const checks = [];

  // 1. Get ChromeOS version info
  const osVersion = navigator.userAgent.match(/CrOS\s+\S+\s+([\d.]+)/)?.[1] || 'Unknown';
  checks.push({
    id: 'cb_os_version',
    name: 'ChromeOS version',
    status: 'pass', // Extension cannot determine if latest — reported to backend for comparison
    detail: `ChromeOS ${osVersion}`,
    value: osVersion,
  });

  // 2. Get installed extensions
  const extensions = await new Promise(resolve =>
    chrome.management.getAll(resolve)
  );

  const installedExtensions = extensions.map(e => ({
    id: e.id,
    name: e.name,
    version: e.version,
    enabled: e.enabled,
    fromWebStore: e.installType === 'normal',
    permissions: e.permissions || [],
    hostPermissions: e.hostPermissions || [],
    installType: e.installType,
  }));

  // Flag extensions not from Web Store
  const sideloadedExtensions = installedExtensions.filter(e =>
    e.installType !== 'normal' && e.installType !== 'admin' && e.id !== chrome.runtime.id
  );

  checks.push({
    id: 'cb_extensions',
    name: 'Extension audit',
    status: sideloadedExtensions.length > 0 ? 'warn' : 'pass',
    severity: 'warning',
    detail: sideloadedExtensions.length > 0
      ? `${sideloadedExtensions.length} non-Web-Store extension(s) found`
      : `${installedExtensions.length} extensions — all from approved sources`,
    value: installedExtensions.length,
  });

  // 3. Check storage space
  const storageInfo = await new Promise(resolve =>
    chrome.system.storage.getInfo(resolve)
  );
  if (storageInfo && storageInfo.length > 0) {
    const mainStorage = storageInfo[0];
    const freeGb = mainStorage.capacity / (1024 * 1024 * 1024);
    checks.push({
      id: 'cb_storage',
      name: 'Storage space',
      status: freeGb < 1 ? 'fail' : freeGb < 5 ? 'warn' : 'pass',
      severity: 'warning',
      detail: `${freeGb.toFixed(1)}GB available`,
      value: freeGb,
    });
  }

  // 4. CPU load
  const cpuInfo = await new Promise(resolve => chrome.system.cpu.getInfo(resolve));
  checks.push({
    id: 'cb_cpu',
    name: 'CPU health',
    status: 'pass',
    detail: `${cpuInfo.numOfProcessors} core${cpuInfo.numOfProcessors > 1 ? 's' : ''} — ${cpuInfo.modelName}`,
  });

  // 5. Memory
  const memInfo = await new Promise(resolve => chrome.system.memory.getInfo(resolve));
  const usedMem = ((memInfo.capacity - memInfo.availableCapacity) / memInfo.capacity) * 100;
  checks.push({
    id: 'cb_memory',
    name: 'Memory usage',
    status: usedMem > 90 ? 'warn' : 'pass',
    severity: 'warning',
    detail: `${Math.round(usedMem)}% used`,
    value: Math.round(usedMem),
  });

  // Calculate score
  const failed = checks.filter(c => c.status === 'fail').length;
  const warned = checks.filter(c => c.status === 'warn').length;
  const score = Math.max(0, 100 - (failed * 20) - (warned * 5));

  // Send heartbeat to API
  try {
    const deviceInfo = await getDeviceInfo();
    await fetch(`${apiUrl}/api/extension/heartbeat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${stored.deviceToken}`,
      },
      body: JSON.stringify({
        deviceName: deviceInfo.hostname || 'Chromebook',
        platform: 'chromeos',
        osVersion,
        extensionVersion: chrome.runtime.getManifest().version,
        checks,
        installedExtensions,
        securityScore: score,
      }),
    });

    await setStorage({ lastCheck: new Date().toISOString(), lastScore: score });

    // Alert if score dropped significantly
    const prevStored = await getStorage(['lastScore']);
    if (prevStored.lastScore && score < prevStored.lastScore - 10) {
      showNotification(
        'FortDefend Security Alert',
        `Your security score dropped to ${score}. Open FortDefend to see what needs attention.`
      );
    }
  } catch (err) {
    console.error('FortDefend heartbeat error:', err);
  }
}

// ── Get device info ───────────────────────────────────────────────────────────
async function getDeviceInfo() {
  const osVersion = navigator.userAgent.match(/CrOS\s+\S+\s+([\d.]+)/)?.[1] || 'Unknown';
  return {
    osVersion,
    hostname: navigator.userAgent,
    platform: 'chromeos',
  };
}

// ── Show notification ─────────────────────────────────────────────────────────
function showNotification(title, message) {
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/icon48.png',
    title,
    message,
  });
}

// ── Alarm handler — runs checks on schedule ───────────────────────────────────
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'fortdefend-check') {
    await runChecks();
  }
});

// ── Message handler — from popup ──────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_STATUS') {
    getStorage(['lastCheck', 'lastScore', 'orgName', 'enrolled']).then(data => {
      sendResponse(data);
    });
    return true;
  }
  if (message.type === 'RUN_CHECK') {
    runChecks().then(() => sendResponse({ done: true }));
    return true;
  }
  if (message.type === 'ENROLL') {
    registerDevice(message.token).then(() => sendResponse({ done: true }));
    return true;
  }
});
