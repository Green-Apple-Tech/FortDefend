const crypto = require('crypto');

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const DIRECTORY_BASE = 'https://admin.googleapis.com/admin/directory/v1';

const SCOPES = [
  'https://www.googleapis.com/auth/admin.directory.device.chromeos',
  'https://www.googleapis.com/auth/admin.directory.device.mobile.readonly',
  'https://www.googleapis.com/auth/admin.directory.orgunit',
].join(' ');

const googleTokenCache = new Map();

function googleCacheKey(saEmail, adminEmail) {
  return `${saEmail}|${adminEmail}`;
}

function parseServiceAccount(serviceAccountJson) {
  if (typeof serviceAccountJson === 'string') {
    return JSON.parse(serviceAccountJson);
  }
  return serviceAccountJson;
}

function base64UrlUtf8(str) {
  return Buffer.from(str, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

/**
 * JWT using Node crypto (RS256) for Google service account.
 */
function signJwt(serviceAccount, adminEmail) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: serviceAccount.client_email,
    sub: adminEmail,
    scope: SCOPES,
    aud: GOOGLE_TOKEN_URL,
    iat: now,
    exp: now + 3600,
  };

  const encHeader = base64UrlUtf8(JSON.stringify(header));
  const encPayload = base64UrlUtf8(JSON.stringify(payload));
  const toSign = `${encHeader}.${encPayload}`;
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(toSign);
  sign.end();
  const signature = sign
    .sign(serviceAccount.private_key, 'base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
  return `${toSign}.${signature}`;
}

async function getAccessToken(serviceAccountJson, adminEmail) {
  const sa = parseServiceAccount(serviceAccountJson);
  const key = googleCacheKey(sa.client_email, adminEmail);
  const hit = googleTokenCache.get(key);
  const refreshSkewMs = 60 * 1000;
  if (hit && Date.now() < hit.expiresAt - refreshSkewMs) {
    return hit.accessToken;
  }

  const assertion = signJwt(sa, adminEmail);
  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion,
  });

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = json.error_description || json.error || res.statusText;
    throw new Error(`Google token error: ${msg}`);
  }

  const expiresAt = Date.now() + (json.expires_in || 3600) * 1000;
  googleTokenCache.set(key, { accessToken: json.access_token, expiresAt });
  return json.access_token;
}

async function adminRequest(accessToken, method, path, options = {}) {
  const url = path.startsWith('http') ? path : `${DIRECTORY_BASE}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    body: options.body != null ? JSON.stringify(options.body) : undefined,
  });

  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const err = new Error(data?.error?.message || text || res.statusText);
    err.status = res.status;
    err.details = data;
    throw err;
  }
  return data;
}

function _normalizeChromebook(d) {
  const volumes = d.diskVolumeReports?.[0]?.volumeInfo || [];
  const diskTotal = volumes.reduce((m, v) => m + (Number(v.storageTotal) || 0), 0);
  const diskFree = volumes.reduce((m, v) => m + (Number(v.storageFree) || 0), 0);
  let disk = { totalGb: null, freeGb: null, usedPct: null };
  if (diskTotal > 0) {
    disk.totalGb = Math.round((diskTotal / 1024 ** 3) * 100) / 100;
    disk.freeGb = Math.round((diskFree / 1024 ** 3) * 100) / 100;
    disk.usedPct = Math.round(((diskTotal - diskFree) / diskTotal) * 1000) / 10;
  }

  const ramKb = d.systemRamTotalKbytes != null ? Number(d.systemRamTotalKbytes) : null;
  const ram = {
    totalGb: ramKb > 0 ? Math.round((ramKb / 1024 ** 2) * 100) / 100 : null,
  };

  const last = d.lastSync || d.lastEnrollmentTime || null;
  return {
    id: d.deviceId,
    source: 'google_admin',
    name: d.annotatedAssetId || d.serialNumber || d.deviceId,
    serial: d.serialNumber || null,
    os: 'chromeos',
    osVersion: d.osVersion || d.platformVersion || null,
    compliance: d.status || null,
    lastSeen: last ? new Date(last).toISOString() : null,
    disk,
    ram,
    user: d.annotatedUser || d.recentUsers?.[0]?.email || null,
    email: d.annotatedUser || d.recentUsers?.[0]?.email || null,
    alerts: [],
    _raw: {
      orgUnitPath: d.orgUnitPath,
      model: d.model,
      annotatedLocation: d.annotatedLocation,
      cpuStatusReports: d.cpuStatusReports,
      diskVolumeReports: d.diskVolumeReports,
      networkStatusReport: d.networkStatusReport,
    },
  };
}

function parseMajorVersion(version) {
  if (!version) return null;
  const match = String(version).match(/\d+/);
  if (!match) return null;
  const major = Number.parseInt(match[0], 10);
  return Number.isFinite(major) ? major : null;
}

function normalizeMobileOs(device) {
  const rawOs = String(device.os || device.releaseVersion || '').toLowerCase();
  if (rawOs.includes('ipad')) return 'iPadOS';
  return 'iOS';
}

function _normalizeMobileDevice(d) {
  const lastSeenRaw = d.lastSync || d.lastSyncTime || d.lastContact || null;
  const supervised = Boolean(
    d.isSupervised ??
      d.supervised ??
      d.supervisedDevice ??
      d.deviceSupervised
  );

  return {
    id: d.resourceId || d.deviceId || d.name || d.imei || d.serialNumber,
    source: 'google_mobile',
    name: d.model || d.deviceModel || d.name || d.serialNumber || d.resourceId,
    serial: d.serialNumber || d.hardwareId || d.imei || null,
    os: normalizeMobileOs(d),
    osVersion: d.os || d.releaseVersion || d.osVersion || null,
    model: d.model || d.deviceModel || null,
    email: d.email || d.userEmail || null,
    status: d.status || d.deviceStatus || null,
    lastSeen: lastSeenRaw ? new Date(lastSeenRaw).toISOString() : null,
    supervised,
    hardwareId: d.hardwareId || null,
    alerts: [],
    _raw: d,
  };
}

function getIOSComplianceStatus(device) {
  const alerts = [];
  const latestIosMajor = Number.parseInt(process.env.LATEST_IOS_MAJOR || '18', 10);
  const currentMajor = parseMajorVersion(device.osVersion);

  if (Number.isFinite(latestIosMajor) && currentMajor != null && currentMajor < latestIosMajor - 1) {
    alerts.push({
      type: 'os_version',
      severity: 'high',
      message: `iOS version ${device.osVersion} is more than 1 major version behind current.`,
    });
  }

  if (!device.supervised) {
    alerts.push({
      type: 'supervision',
      severity: 'medium',
      message: 'Device is not supervised.',
    });
  }

  const passcodeSet = Boolean(
    device._raw?.passcodePresent ??
      device._raw?.passcodeSet ??
      device._raw?.devicePasswordStatus === 'ENABLED'
  );
  if (!passcodeSet) {
    alerts.push({
      type: 'passcode',
      severity: 'high',
      message: 'Device passcode is not set.',
    });
  }

  if (device.lastSeen) {
    const lastSyncMs = new Date(device.lastSeen).getTime();
    if (Number.isFinite(lastSyncMs)) {
      const ageMs = Date.now() - lastSyncMs;
      if (ageMs > 7 * 24 * 60 * 60 * 1000) {
        alerts.push({
          type: 'sync',
          severity: 'medium',
          message: 'Device has not synced in over 7 days.',
        });
      }
    }
  } else {
    alerts.push({
      type: 'sync',
      severity: 'medium',
      message: 'Device has no recent sync timestamp.',
    });
  }

  return alerts;
}

async function getChromebookDevice(deviceId, serviceAccountJson, adminEmail, customerId = 'my_customer') {
  const token = await getAccessToken(serviceAccountJson, adminEmail);
  const data = await adminRequest(
    token,
    'GET',
    `/customer/${encodeURIComponent(customerId)}/devices/chromeos/${encodeURIComponent(deviceId)}?projection=FULL`
  );
  return data ? _normalizeChromebook(data) : null;
}

async function getChromebookDevices(orgUnitPath, serviceAccountJson, adminEmail, customerId = 'my_customer') {
  const token = await getAccessToken(serviceAccountJson, adminEmail);
  const params = new URLSearchParams({
    projection: 'FULL',
    maxResults: '200',
  });
  if (orgUnitPath) params.set('orgUnitPath', orgUnitPath);

  let path = `/customer/${encodeURIComponent(customerId)}/devices/chromeos?${params.toString()}`;
  const devices = [];

  while (path) {
    const page = await adminRequest(token, 'GET', path);
    for (const d of page?.chromeosdevices || []) {
      devices.push(_normalizeChromebook(d));
    }
    if (page.nextPageToken) {
      params.set('pageToken', page.nextPageToken);
      path = `/customer/${encodeURIComponent(customerId)}/devices/chromeos?${params.toString()}`;
    } else {
      path = null;
    }
  }

  return devices;
}

async function getMobileDevices(customerId = 'my_customer', serviceAccountJson, adminEmail) {
  const token = await getAccessToken(serviceAccountJson, adminEmail);
  const params = new URLSearchParams({
    maxResults: '100',
  });

  let path = `/customer/${encodeURIComponent(customerId)}/mobiledevices?${params.toString()}`;
  const devices = [];

  while (path) {
    const page = await adminRequest(token, 'GET', path);
    for (const d of page?.mobiledevices || []) {
      if (String(d.type || '').toUpperCase() !== 'IOS') continue;
      const normalized = _normalizeMobileDevice(d);
      normalized.alerts = getIOSComplianceStatus(normalized);
      devices.push(normalized);
    }
    if (page.nextPageToken) {
      params.set('pageToken', page.nextPageToken);
      path = `/customer/${encodeURIComponent(customerId)}/mobiledevices?${params.toString()}`;
    } else {
      path = null;
    }
  }

  return devices;
}

async function getOrgUnits(serviceAccountJson, adminEmail, customerId = 'my_customer') {
  const token = await getAccessToken(serviceAccountJson, adminEmail);
  const params = new URLSearchParams({ type: 'all' });
  const data = await adminRequest(
    token,
    'GET',
    `/customer/${encodeURIComponent(customerId)}/orgunits?${params.toString()}`
  );
  return data?.organizationUnits || [];
}

async function getDeviceTelemetry(serviceAccountJson, adminEmail, customerId = 'my_customer') {
  const devices = await getChromebookDevices(null, serviceAccountJson, adminEmail, customerId);
  return devices.map((d) => ({
    deviceId: d.id,
    name: d.name,
    cpuReports: d._raw?.cpuStatusReports || [],
    diskReports: d._raw?.diskVolumeReports || [],
    networkReports: d._raw?.networkStatusReport ? [d._raw.networkStatusReport] : [],
    ram: d.ram,
    disk: d.disk,
  }));
}

async function getUpdateStatus(serviceAccountJson, adminEmail, customerId = 'my_customer') {
  const token = await getAccessToken(serviceAccountJson, adminEmail);
  const params = new URLSearchParams({
    projection: 'FULL',
    maxResults: '200',
  });
  let path = `/customer/${encodeURIComponent(customerId)}/devices/chromeos?${params.toString()}`;
  const rows = [];

  while (path) {
    const page = await adminRequest(token, 'GET', path);
    for (const d of page?.chromeosdevices || []) {
      rows.push({
        deviceId: d.deviceId,
        serial: d.serialNumber,
        osVersion: d.osVersion,
        platformVersion: d.platformVersion,
        autoUpdateExpiration: d.autoUpdateExpiration || null,
        releaseChannel: d.releaseChannel || null,
      });
    }
    if (page.nextPageToken) {
      params.set('pageToken', page.nextPageToken);
      path = `/customer/${encodeURIComponent(customerId)}/devices/chromeos?${params.toString()}`;
    } else {
      path = null;
    }
  }
  return rows;
}

async function sendDeviceCommand(
  deviceId,
  action,
  serviceAccountJson,
  adminEmail,
  customerId = 'my_customer'
) {
  const token = await getAccessToken(serviceAccountJson, adminEmail);
  const allowed = new Set([
    'deprovision',
    'disable',
    'reenable',
    'pre_provisioned_disable',
    'pre_provisioned_reenable',
  ]);
  if (!allowed.has(action)) {
    throw new Error(
      `Unsupported action "${action}". Use deprovision, disable, reenable, pre_provisioned_disable, or pre_provisioned_reenable.`
    );
  }
  const body = { action };
  if (action === 'deprovision') {
    body.deprovisionReason = 'retiring_device';
  }
  await adminRequest(
    token,
    'POST',
    `/customer/${encodeURIComponent(customerId)}/devices/chromeos/${encodeURIComponent(deviceId)}/action`,
    { body }
  );
  return { ok: true };
}

module.exports = {
  getAccessToken,
  getChromebookDevice,
  getChromebookDevices,
  getMobileDevices,
  getIOSComplianceStatus,
  getOrgUnits,
  getDeviceTelemetry,
  getUpdateStatus,
  sendDeviceCommand,
  _normalizeChromebook,
  _normalizeMobileDevice,
};
