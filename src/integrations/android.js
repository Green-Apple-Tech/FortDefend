const { google } = require('googleapis');
const { Client } = require('@microsoft/microsoft-graph-client');
require('isomorphic-fetch');

// ── Helpers ──────────────────────────────────────────────────────────────────

const HIGH_RISK_PERMISSIONS = [
  'android.permission.CAMERA',
  'android.permission.RECORD_AUDIO',
  'android.permission.ACCESS_FINE_LOCATION',
  'android.permission.READ_CONTACTS',
  'android.permission.READ_CALL_LOG',
  'android.permission.READ_SMS',
  'android.permission.PROCESS_OUTGOING_CALLS',
  'android.permission.BODY_SENSORS',
];

const KNOWN_RISKY_PACKAGES = [
  'com.android.chromium', // fake Chrome
  'com.whatsapp.w4b.mod', // WhatsApp mod
  'com.instagram.lite.mod', // Instagram mod
];

function calculateAndroidRiskScore(checks) {
  let score = 100;
  for (const check of checks) {
    if (check.status === 'fail' && check.severity === 'critical') score -= 20;
    if (check.status === 'fail' && check.severity === 'warning') score -= 5;
    if (check.status === 'warn') score -= 3;
  }
  return Math.max(0, score);
}

function permissionRiskLevel(permissions = []) {
  const risky = permissions.filter(p => HIGH_RISK_PERMISSIONS.includes(p));
  if (risky.length >= 4) return 'critical';
  if (risky.length >= 2) return 'warning';
  return 'ok';
}

// ── Google Admin Android verification ────────────────────────────────────────

async function getGoogleAndroidDevices(serviceAccountJson, adminEmail, customerId) {
  const auth = new google.auth.JWT({
    email: serviceAccountJson.client_email,
    key: serviceAccountJson.private_key,
    scopes: [
      'https://www.googleapis.com/auth/admin.directory.device.mobile.readonly',
      'https://www.googleapis.com/auth/admin.directory.device.mobile.action',
    ],
    subject: adminEmail,
  });

  const admin = google.admin({ version: 'directory_v1', auth });
  const res = await admin.mobiledevices.list({
    customerId: customerId || 'my_customer',
    projection: 'FULL',
    maxResults: 500,
  });

  return (res.data.mobiledevices || []).map(d => normalizeGoogleAndroid(d));
}

function normalizeGoogleAndroid(d) {
  return {
    id: d.deviceId,
    source: 'google_admin',
    name: d.name?.[0] || d.model || 'Unknown',
    model: d.model,
    os: 'android',
    osVersion: d.osVersion,
    securityPatchLevel: d.securityPatchLevel,
    email: d.email?.[0],
    status: d.status,
    enrollmentTime: d.firstSync,
    lastSync: d.lastSync,
    encryptionStatus: d.encryptionStatus,
    deviceCompromisedStatus: d.deviceCompromisedStatus,
    managedAccountIsOnOwnerProfile: d.managedAccountIsOnOwnerProfile,
    applications: d.applications || [],
    devicePasswordStatus: d.devicePasswordStatus,
    unknownSourcesStatus: d.unknownSourcesStatus,
    adbStatus: d.adbStatus,
    developerOptionsStatus: d.developerOptionsStatus,
    supportsWorkProfile: d.supportsWorkProfile,
    privilege: d.privilege,
    serialNumber: d.serialNumber,
    imei: d.imei?.[0],
    raw: d,
  };
}

// ── Intune Android verification ───────────────────────────────────────────────

async function getIntuneAndroidDevices(tenantId, clientId, clientSecret) {
  const tokenRes = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
        scope: 'https://graph.microsoft.com/.default',
      }),
    }
  );
  const { access_token } = await tokenRes.json();

  const res = await fetch(
    'https://graph.microsoft.com/v1.0/deviceManagement/managedDevices?$filter=operatingSystem eq \'Android\'',
    { headers: { Authorization: `Bearer ${access_token}` } }
  );
  const data = await res.json();
  return (data.value || []).map(d => normalizeIntuneAndroid(d));
}

function normalizeIntuneAndroid(d) {
  return {
    id: d.id,
    source: 'intune',
    name: d.deviceName,
    model: d.model,
    os: 'android',
    osVersion: d.osVersion,
    securityPatchLevel: d.androidSecurityPatchLevel,
    email: d.userPrincipalName,
    status: d.managementState,
    enrollmentTime: d.enrolledDateTime,
    lastSync: d.lastSyncDateTime,
    encryptionStatus: d.isEncrypted ? 'ENCRYPTED' : 'NOT_ENCRYPTED',
    complianceState: d.complianceState,
    jailBroken: d.jailBroken,
    deviceRegistrationState: d.deviceRegistrationState,
    managementAgent: d.managementAgent,
    serialNumber: d.serialNumber,
    imei: d.imei,
    raw: d,
  };
}

// ── Core Android verification engine ─────────────────────────────────────────

function verifyAndroidDevice(device) {
  const checks = [];
  const now = new Date();

  // 1. Play Protect status
  const compromised = device.deviceCompromisedStatus;
  checks.push({
    id: 'and_play_protect',
    name: 'Play Protect status',
    status: compromised === 'No compromise detected' || compromised === undefined
      ? 'pass' : 'fail',
    severity: 'critical',
    detail: compromised || 'No threat detected',
    autoHealable: false,
    manualAction: 'Re-enable Play Protect via MDM policy',
  });

  // 2. Android OS version
  const osVersion = parseFloat(device.osVersion);
  const currentAndroid = 14;
  const versionsBehind = currentAndroid - Math.floor(osVersion);
  checks.push({
    id: 'and_os_version',
    name: 'Android OS version',
    status: versionsBehind >= 2 ? 'fail' : versionsBehind === 1 ? 'warn' : 'pass',
    severity: versionsBehind >= 2 ? 'critical' : 'warning',
    detail: `Android ${device.osVersion} — ${versionsBehind} major version${versionsBehind !== 1 ? 's' : ''} behind current`,
    autoHealable: false,
    manualAction: 'Push OS update via MDM or retire device',
  });

  // 3. Security patch level
  if (device.securityPatchLevel) {
    const patchDate = new Date(device.securityPatchLevel);
    const monthsBehind = Math.floor((now - patchDate) / (1000 * 60 * 60 * 24 * 30));
    checks.push({
      id: 'and_security_patch',
      name: 'Security patch level',
      status: monthsBehind > 6 ? 'fail' : monthsBehind > 3 ? 'warn' : 'pass',
      severity: monthsBehind > 6 ? 'critical' : 'warning',
      detail: `Security patch from ${device.securityPatchLevel} — ${monthsBehind} months old`,
      autoHealable: false,
      manualAction: 'Trigger security patch update via MDM',
    });
  }

  // 4. Device encryption
  checks.push({
    id: 'and_encryption',
    name: 'Device encryption',
    status: device.encryptionStatus === 'ENCRYPTED' ? 'pass' : 'fail',
    severity: 'critical',
    detail: device.encryptionStatus || 'Unknown',
    autoHealable: false,
    manualAction: 'Factory reset required if encryption cannot be enabled',
  });

  // 5. Screen lock / password
  const pwStatus = device.devicePasswordStatus;
  checks.push({
    id: 'and_screen_lock',
    name: 'Screen lock configured',
    status: pwStatus === 'passwordSet' || pwStatus === undefined ? 'pass' : 'fail',
    severity: 'critical',
    detail: pwStatus || 'Status unknown',
    autoHealable: true,
    healAction: 'Enforce screen lock via MDM policy push',
  });

  // 6. Unknown sources / sideloading
  checks.push({
    id: 'and_unknown_sources',
    name: 'Sideloading blocked',
    status: device.unknownSourcesStatus === false || device.unknownSourcesStatus === undefined
      ? 'pass' : 'fail',
    severity: 'warning',
    detail: device.unknownSourcesStatus ? 'Unknown sources enabled — sideloading possible' : 'Blocked',
    autoHealable: true,
    healAction: 'Re-push restriction policy via MDM',
  });

  // 7. USB debugging
  checks.push({
    id: 'and_usb_debugging',
    name: 'USB debugging disabled',
    status: device.adbStatus === false || device.adbStatus === undefined ? 'pass' : 'fail',
    severity: 'warning',
    detail: device.adbStatus ? 'USB debugging enabled' : 'Disabled',
    autoHealable: true,
    healAction: 'Push restriction via MDM policy',
  });

  // 8. Developer options
  checks.push({
    id: 'and_developer_options',
    name: 'Developer options disabled',
    status: device.developerOptionsStatus === false || device.developerOptionsStatus === undefined
      ? 'pass' : 'fail',
    severity: 'warning',
    detail: device.developerOptionsStatus ? 'Developer options enabled' : 'Disabled',
    autoHealable: true,
    healAction: 'Push restriction via MDM policy',
  });

  // 9. Work profile check (Google Admin)
  if (device.source === 'google_admin') {
    checks.push({
      id: 'and_work_profile',
      name: 'Work profile intact',
      status: device.supportsWorkProfile ? 'pass' : 'warn',
      severity: 'critical',
      detail: device.supportsWorkProfile ? 'Work profile active' : 'Work profile not detected',
      autoHealable: false,
      manualAction: 'Re-enroll work profile via MDM',
    });
  }

  // 10. Device compromise check (Intune)
  if (device.source === 'intune') {
    checks.push({
      id: 'and_jailbreak',
      name: 'Device integrity',
      status: device.jailBroken === 'Unknown' || !device.jailBroken ? 'pass' : 'fail',
      severity: 'critical',
      detail: device.jailBroken || 'No compromise detected',
      autoHealable: false,
      manualAction: 'Wipe and re-enroll device',
    });
  }

  // 11. App risk audit
  if (device.applications && device.applications.length > 0) {
    const riskyApps = device.applications.filter(app => {
      const pkgRisk = KNOWN_RISKY_PACKAGES.includes(app.packageName);
      const permRisk = permissionRiskLevel(app.permission) !== 'ok';
      return pkgRisk || permRisk;
    });

    checks.push({
      id: 'and_app_risk',
      name: 'High-risk app detection',
      status: riskyApps.length > 0 ? 'fail' : 'pass',
      severity: 'critical',
      detail: riskyApps.length > 0
        ? `${riskyApps.length} high-risk app${riskyApps.length > 1 ? 's' : ''} detected: ${riskyApps.map(a => a.displayName || a.packageName).join(', ')}`
        : 'No high-risk apps detected',
      autoHealable: false,
      manualAction: 'Review and remove flagged apps',
      flaggedApps: riskyApps,
    });
  }

  // 12. Stale device check
  if (device.lastSync) {
    const lastSync = new Date(device.lastSync);
    const daysSinceSync = Math.floor((now - lastSync) / (1000 * 60 * 60 * 24));
    checks.push({
      id: 'and_staleness',
      name: 'Device check-in recency',
      status: daysSinceSync > 14 ? 'fail' : daysSinceSync > 7 ? 'warn' : 'pass',
      severity: daysSinceSync > 14 ? 'critical' : 'warning',
      detail: `Last sync ${daysSinceSync} days ago`,
      autoHealable: false,
      manualAction: daysSinceSync > 14 ? 'Locate device or mark as lost' : 'Monitor',
    });
  }

  return {
    deviceId: device.id,
    source: device.source,
    name: device.name,
    model: device.model,
    osVersion: device.osVersion,
    email: device.email,
    lastSync: device.lastSync,
    checks,
    complianceScore: calculateAndroidRiskScore(checks),
    criticalIssues: checks.filter(c => c.status === 'fail' && c.severity === 'critical').length,
    warnings: checks.filter(c => c.status === 'warn' || (c.status === 'fail' && c.severity === 'warning')).length,
    autoHealable: checks.filter(c => c.status !== 'pass' && c.autoHealable),
  };
}

// ── MDM detection and unified fetch ──────────────────────────────────────────

async function getAllAndroidDevices(orgIntegrations) {
  const results = [];
  const errors = [];

  if (orgIntegrations.google_enabled && orgIntegrations.google_service_account) {
    try {
      const serviceAccount = JSON.parse(orgIntegrations.google_service_account);
      const devices = await getGoogleAndroidDevices(
        serviceAccount,
        orgIntegrations.google_admin_email,
        orgIntegrations.google_customer_id
      );
      results.push(...devices);
    } catch (err) {
      errors.push({ source: 'google_admin', error: err.message });
    }
  }

  if (orgIntegrations.intune_enabled && orgIntegrations.intune_tenant_id) {
    try {
      const devices = await getIntuneAndroidDevices(
        orgIntegrations.intune_tenant_id,
        orgIntegrations.intune_client_id,
        orgIntegrations.intune_client_secret
      );
      results.push(...devices);
    } catch (err) {
      errors.push({ source: 'intune', error: err.message });
    }
  }

  return { devices: results, errors };
}

async function verifyAllAndroidDevices(orgIntegrations) {
  const { devices, errors } = await getAllAndroidDevices(orgIntegrations);
  const results = devices.map(d => verifyAndroidDevice(d));
  const fleetScore = results.length > 0
    ? Math.round(results.reduce((s, r) => s + r.complianceScore, 0) / results.length)
    : 100;

  return {
    devices: results,
    fleetScore,
    totalDevices: results.length,
    compliant: results.filter(r => r.complianceScore >= 80).length,
    atRisk: results.filter(r => r.complianceScore < 80 && r.complianceScore >= 60).length,
    critical: results.filter(r => r.complianceScore < 60).length,
    autoHealableIssues: results.reduce((s, r) => s + r.autoHealable.length, 0),
    errors,
  };
}

module.exports = {
  getAllAndroidDevices,
  verifyAllAndroidDevices,
  verifyAndroidDevice,
  getGoogleAndroidDevices,
  getIntuneAndroidDevices,
};
