const tokenCache = new Map();

function cacheKey(tenantId, clientId) {
  return `${tenantId}|${clientId}`;
}

/**
 * In-memory token cache; refreshes ~60s before expiry.
 */
function getCachedToken(tenantId, clientId) {
  const row = tokenCache.get(cacheKey(tenantId, clientId));
  if (!row) return null;
  const refreshSkewMs = 60 * 1000;
  if (Date.now() < row.expiresAt - refreshSkewMs) return row.accessToken;
  return null;
}

function setCachedToken(tenantId, clientId, accessToken, expiresInSeconds) {
  const expiresAt = Date.now() + (expiresInSeconds || 3600) * 1000;
  tokenCache.set(cacheKey(tenantId, clientId), { accessToken, expiresAt });
}

async function getAccessToken(tenantId, clientId, clientSecret) {
  const hit = getCachedToken(tenantId, clientId);
  if (hit) return hit;

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials',
  });

  const res = await fetch(
    `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    }
  );

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = json.error_description || json.error || res.statusText;
    throw new Error(`Intune token error: ${msg}`);
  }

  setCachedToken(tenantId, clientId, json.access_token, json.expires_in);
  return json.access_token;
}

async function graphRequest(accessToken, method, pathOrUrl, options = {}) {
  const url = pathOrUrl.startsWith('http')
    ? pathOrUrl
    : `https://graph.microsoft.com/v1.0${pathOrUrl}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    body: options.body != null ? JSON.stringify(options.body) : undefined,
  });

  if (res.status === 204) return null;
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const msg = data?.error?.message || data?.error_description || text || res.statusText;
    const err = new Error(`Graph ${method} ${path}: ${msg}`);
    err.status = res.status;
    err.details = data;
    throw err;
  }
  return data;
}

function buildAlerts(d) {
  const alerts = [];
  if (d.complianceState && String(d.complianceState).toLowerCase() !== 'compliant') {
    alerts.push({
      type: 'compliance',
      severity: 'high',
      message: `Device is ${d.complianceState}`,
    });
  }
  if (d.isEncrypted === false || d.isEncrypted === 'false') {
    alerts.push({
      type: 'encryption',
      severity: 'high',
      message: 'Disk encryption is not enabled',
    });
  }
  if (d.jailBroken === true || d.jailBroken === 'true') {
    alerts.push({
      type: 'integrity',
      severity: 'critical',
      message: 'Device reports jailbroken/rooted state',
    });
  }
  const total = d.totalStorageSpaceInBytes;
  const free = d.freeStorageSpaceInBytes;
  if (total > 0 && free >= 0) {
    const usedPct = Math.round(((total - free) / total) * 100);
    const freePct = Math.round((free / total) * 100);
    if (freePct <= 5) {
      alerts.push({
        type: 'disk',
        severity: 'medium',
        message: `Low free disk space (${freePct}% free)`,
        meta: { usedPct },
      });
    }
  }
  if (d.managementAgent === 'unknown' || d.managementState === 'retirePending') {
    alerts.push({
      type: 'management',
      severity: 'medium',
      message: `Management state: ${d.managementState || d.managementAgent}`,
    });
  }
  if (
    d.complianceGracePeriodExpirationDateTime &&
    String(d.complianceState || '').toLowerCase() === 'compliant'
  ) {
    alerts.push({
      type: 'grace_period',
      severity: 'low',
      message: `Compliance grace period until ${d.complianceGracePeriodExpirationDateTime}`,
    });
  }
  return alerts;
}

function _normalizeDevice(d) {
  const totalBytes = d.totalStorageSpaceInBytes != null ? Number(d.totalStorageSpaceInBytes) : null;
  const freeBytes = d.freeStorageSpaceInBytes != null ? Number(d.freeStorageSpaceInBytes) : null;
  let disk = { totalGb: null, freeGb: null, usedPct: null };
  if (totalBytes > 0) {
    disk.totalGb = Math.round((totalBytes / 1024 ** 3) * 100) / 100;
    disk.freeGb =
      freeBytes != null ? Math.round((freeBytes / 1024 ** 3) * 100) / 100 : null;
    if (freeBytes != null) {
      disk.usedPct = Math.round(((totalBytes - freeBytes) / totalBytes) * 1000) / 10;
    }
  }

  const ramBytes = d.physicalMemoryInBytes != null ? Number(d.physicalMemoryInBytes) : null;
  const ram = {
    totalGb: ramBytes > 0 ? Math.round((ramBytes / 1024 ** 3) * 100) / 100 : null,
  };

  const lastSeen = d.lastSyncDateTime || d.lastContactedDateTime || null;
  const base = {
    id: d.id,
    source: 'intune',
    name: d.deviceName || d.name || d.id,
    serial: d.serialNumber || d.imei || null,
    os: 'windows',
    osVersion: d.osVersion || d.operatingSystem || null,
    compliance: d.complianceState || null,
    lastSeen: lastSeen ? new Date(lastSeen).toISOString() : null,
    disk,
    ram,
    user: d.userPrincipalName || d.emailAddress || null,
    email: d.emailAddress || d.userPrincipalName || null,
    alerts: [],
  };
  base.alerts = buildAlerts(d);
  return base;
}

async function getDevices(tenantId, clientId, clientSecret) {
  const token = await getAccessToken(tenantId, clientId, clientSecret);
  const filter = encodeURIComponent("contains(operatingSystem,'Windows')");
  let path = `/deviceManagement/managedDevices?$filter=${filter}&$top=999`;
  const items = [];

  const collect = async (p) => {
    const page = await graphRequest(token, 'GET', p);
    const chunk = page?.value || [];
    for (const d of chunk) {
      if (String(d.operatingSystem || '').toLowerCase().includes('windows')) {
        items.push(_normalizeDevice(d));
      }
    }
    return page['@odata.nextLink'] || null;
  };

  try {
    while (path) {
      path = await collect(path);
    }
  } catch (e) {
    if (e.status !== 400) throw e;
    path = '/deviceManagement/managedDevices?$top=999';
    while (path) {
      path = await collect(path);
    }
  }

  return items;
}

async function getDeviceApps(deviceId, tenantId, clientId, clientSecret) {
  const token = await getAccessToken(tenantId, clientId, clientSecret);
  let path = `/deviceManagement/managedDevices/${encodeURIComponent(deviceId)}/detectedApps?$top=500`;
  const apps = [];
  while (path) {
    const page = await graphRequest(token, 'GET', path);
    for (const a of page?.value || []) {
      apps.push({
        id: a.id,
        name: a.displayName || a.id,
        version: a.version || null,
        publisher: a.publisher || null,
        sizeInByte: a.sizeInByte != null ? Number(a.sizeInByte) : null,
      });
    }
    path = page['@odata.nextLink'] || null;
  }
  return apps;
}

async function syncDevice(deviceId, tenantId, clientId, clientSecret) {
  const token = await getAccessToken(tenantId, clientId, clientSecret);
  await graphRequest(
    token,
    'POST',
    `/deviceManagement/managedDevices/${encodeURIComponent(deviceId)}/syncDevice`
  );
  return { ok: true };
}

async function restartDevice(deviceId, tenantId, clientId, clientSecret) {
  const token = await getAccessToken(tenantId, clientId, clientSecret);
  await graphRequest(
    token,
    'POST',
    `/deviceManagement/managedDevices/${encodeURIComponent(deviceId)}/rebootNow`
  );
  return { ok: true };
}

async function pushWingetScript(appId, tenantId, clientId, clientSecret) {
  const token = await getAccessToken(tenantId, clientId, clientSecret);
  const escaped = String(appId).replace(/'/g, "''");
  const ps1 = [
    '$ErrorActionPreference = "Stop"',
    `$appId = '${escaped}'`,
    'winget upgrade --id $appId -h --accept-package-agreements --accept-source-agreements',
  ].join('\r\n');

  const scriptBody = {
    '@odata.type': '#microsoft.graph.deviceManagementScript',
    displayName: `FortDefend winget: ${appId}`,
    description: 'Deployed by FortDefend',
    scriptContent: Buffer.from(ps1, 'utf8').toString('base64'),
    fileName: 'fortdefend-winget.ps1',
    runAsAccount: 'system',
    enforceSignatureCheck: false,
    runAs32Bit: false,
  };

  const created = await graphRequest(token, 'POST', '/deviceManagement/deviceManagementScripts', {
    body: scriptBody,
  });
  const scriptId = created?.id;
  if (!scriptId) {
    throw new Error('Graph did not return a script id for winget deployment.');
  }

  const assignBody = {
    deviceManagementScriptAssignments: [
      {
        target: {
          '@odata.type': '#microsoft.graph.allDevicesAssignmentTarget',
        },
      },
    ],
  };

  try {
    await graphRequest(
      token,
      'POST',
      `/deviceManagement/deviceManagementScripts/${encodeURIComponent(scriptId)}/assign`,
      { body: assignBody }
    );
  } catch (e) {
    e.note =
      'Script was created but assignment failed; assign manually in Intune or verify Graph permissions.';
    throw e;
  }

  return { ok: true, scriptId, appId };
}

module.exports = {
  getAccessToken,
  getDevices,
  getDeviceApps,
  syncDevice,
  restartDevice,
  pushWingetScript,
  _normalizeDevice,
  buildAlerts,
};
