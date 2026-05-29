const { google } = require('googleapis');

// ── Google Android Enterprise remediation ─────────────────────────────────────

async function getGoogleAndroidAuth(serviceAccountJson, adminEmail) {
  return new google.auth.JWT({
    email: serviceAccountJson.client_email,
    key: serviceAccountJson.private_key,
    scopes: [
      'https://www.googleapis.com/auth/admin.directory.device.mobile',
      'https://www.googleapis.com/auth/admin.directory.device.mobile.action',
      'https://www.googleapis.com/auth/androidmanagement',
    ],
    subject: adminEmail,
  });
}

// Lock device immediately
async function lockAndroidDevice(serviceAccountJson, adminEmail, customerId, resourceId) {
  const auth = await getGoogleAndroidAuth(serviceAccountJson, adminEmail);
  const admin = google.admin({ version: 'directory_v1', auth });
  await admin.mobiledevices.action({
    customerId: customerId || 'my_customer',
    resourceId,
    requestBody: { action: 'admin_account_wipe' },
  });
  return { action: 'lock', status: 'triggered', resourceId };
}

// Wipe work profile only (BYOD safe)
async function wipeWorkProfile(serviceAccountJson, adminEmail, customerId, resourceId) {
  const auth = await getGoogleAndroidAuth(serviceAccountJson, adminEmail);
  const admin = google.admin({ version: 'directory_v1', auth });
  await admin.mobiledevices.action({
    customerId: customerId || 'my_customer',
    resourceId,
    requestBody: { action: 'admin_account_wipe' },
  });
  return { action: 'wipe_work_profile', status: 'triggered', resourceId };
}

// Full device wipe (corporate devices only)
async function fullWipeDevice(serviceAccountJson, adminEmail, customerId, resourceId) {
  const auth = await getGoogleAndroidAuth(serviceAccountJson, adminEmail);
  const admin = google.admin({ version: 'directory_v1', auth });
  await admin.mobiledevices.action({
    customerId: customerId || 'my_customer',
    resourceId,
    requestBody: { action: 'wipe' },
  });
  return { action: 'full_wipe', status: 'triggered', resourceId };
}

// Approve a device (bring it into management)
async function approveDevice(serviceAccountJson, adminEmail, customerId, resourceId) {
  const auth = await getGoogleAndroidAuth(serviceAccountJson, adminEmail);
  const admin = google.admin({ version: 'directory_v1', auth });
  await admin.mobiledevices.action({
    customerId: customerId || 'my_customer',
    resourceId,
    requestBody: { action: 'approve' },
  });
  return { action: 'approve', status: 'triggered', resourceId };
}

// Block a device
async function blockDevice(serviceAccountJson, adminEmail, customerId, resourceId) {
  const auth = await getGoogleAndroidAuth(serviceAccountJson, adminEmail);
  const admin = google.admin({ version: 'directory_v1', auth });
  await admin.mobiledevices.action({
    customerId: customerId || 'my_customer',
    resourceId,
    requestBody: { action: 'block' },
  });
  return { action: 'block', status: 'triggered', resourceId };
}

// ── Intune Android remediation ────────────────────────────────────────────────

async function getIntuneToken(tenantId, clientId, clientSecret) {
  const res = await fetch(
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
  const { access_token } = await res.json();
  return access_token;
}

async function intuneDeviceAction(tenantId, clientId, clientSecret, deviceId, action) {
  const token = await getIntuneToken(tenantId, clientId, clientSecret);
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/deviceManagement/managedDevices/${deviceId}/${action}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    }
  );
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error?.message || `Intune action ${action} failed`);
  }
  return { action, status: 'triggered', deviceId };
}

// Lock Intune Android device
async function intuneLockeDevice(tenantId, clientId, clientSecret, deviceId) {
  return intuneDeviceAction(tenantId, clientId, clientSecret, deviceId, 'remoteLock');
}

// Wipe Intune Android device
async function intuneWipeDevice(tenantId, clientId, clientSecret, deviceId, keepEnrollmentData = false) {
  const token = await getIntuneToken(tenantId, clientId, clientSecret);
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/deviceManagement/managedDevices/${deviceId}/wipe`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ keepEnrollmentData, keepUserData: false }),
    }
  );
  return { action: 'wipe', status: 'triggered', deviceId };
}

// Sync Intune device (force policy re-check)
async function intuneSyncDevice(tenantId, clientId, clientSecret, deviceId) {
  return intuneDeviceAction(tenantId, clientId, clientSecret, deviceId, 'syncDevice');
}

// Retire Intune device (remove company data, keep personal)
async function intuneRetireDevice(tenantId, clientId, clientSecret, deviceId) {
  return intuneDeviceAction(tenantId, clientId, clientSecret, deviceId, 'retire');
}

// Reboot Intune Android device
async function intuneRebootDevice(tenantId, clientId, clientSecret, deviceId) {
  return intuneDeviceAction(tenantId, clientId, clientSecret, deviceId, 'rebootNow');
}

// ── Unified remediation router ────────────────────────────────────────────────

async function remediateAndroidDevice(action, device, orgIntegrations) {
  const { decrypt } = require('../utils/crypto');

  if (device.source === 'google_admin' && orgIntegrations.google_enabled) {
    const serviceAccount = JSON.parse(decrypt(orgIntegrations.google_service_account_enc));
    const adminEmail = orgIntegrations.google_admin_email;
    const customerId = orgIntegrations.google_customer_id;
    const resourceId = device.external_id;

    switch (action) {
      case 'lock': return lockAndroidDevice(serviceAccount, adminEmail, customerId, resourceId);
      case 'wipe_work_profile': return wipeWorkProfile(serviceAccount, adminEmail, customerId, resourceId);
      case 'full_wipe': return fullWipeDevice(serviceAccount, adminEmail, customerId, resourceId);
      case 'approve': return approveDevice(serviceAccount, adminEmail, customerId, resourceId);
      case 'block': return blockDevice(serviceAccount, adminEmail, customerId, resourceId);
      default: throw new Error(`Unknown action: ${action}`);
    }
  }

  if (device.source === 'intune' && orgIntegrations.intune_enabled) {
    const tenantId = orgIntegrations.intune_tenant_id;
    const clientId = orgIntegrations.intune_client_id;
    const clientSecret = decrypt(orgIntegrations.intune_client_secret_enc);
    const deviceId = device.external_id;

    switch (action) {
      case 'lock': return intuneLockeDevice(tenantId, clientId, clientSecret, deviceId);
      case 'wipe_work_profile': return intuneRetireDevice(tenantId, clientId, clientSecret, deviceId);
      case 'full_wipe': return intuneWipeDevice(tenantId, clientId, clientSecret, deviceId);
      case 'sync': return intuneSyncDevice(tenantId, clientId, clientSecret, deviceId);
      case 'reboot': return intuneRebootDevice(tenantId, clientId, clientSecret, deviceId);
      default: throw new Error(`Unknown action: ${action}`);
    }
  }

  throw new Error('No matching MDM integration found for this device');
}

module.exports = {
  remediateAndroidDevice,
  lockAndroidDevice,
  wipeWorkProfile,
  fullWipeDevice,
  approveDevice,
  blockDevice,
  intuneLockeDevice,
  intuneWipeDevice,
  intuneSyncDevice,
  intuneRetireDevice,
  intuneRebootDevice,
  getAueDatesForAndroid: async () => [],
};
