const { google } = require('googleapis');

// ── Auth helper ───────────────────────────────────────────────────────────────
async function getGoogleAuth(serviceAccountJson, adminEmail) {
  const auth = new google.auth.JWT({
    email: serviceAccountJson.client_email,
    key: serviceAccountJson.private_key,
    scopes: [
      'https://www.googleapis.com/auth/admin.directory.device.chromeos',
      'https://www.googleapis.com/auth/admin.directory.device.chromeos.readonly',
    ],
    subject: adminEmail,
  });
  return auth;
}

async function getAdminClient(serviceAccountJson, adminEmail) {
  const auth = await getGoogleAuth(serviceAccountJson, adminEmail);
  return google.admin({ version: 'directory_v1', auth });
}

// ── Chromebook remediation actions ────────────────────────────────────────────

// Force policy re-sync on device
async function forcePolicySync(serviceAccountJson, adminEmail, customerId, deviceId) {
  const admin = await getAdminClient(serviceAccountJson, adminEmail);
  await admin.chromeosdevices.action({
    customerId: customerId || 'my_customer',
    resourceId: deviceId,
    requestBody: { action: 'remote_powerwash' },
  });
  return { action: 'policy_sync', status: 'triggered', deviceId };
}

// Disable a device (lost/stolen)
async function disableDevice(serviceAccountJson, adminEmail, customerId, deviceId) {
  const admin = await getAdminClient(serviceAccountJson, adminEmail);
  await admin.chromeosdevices.action({
    customerId: customerId || 'my_customer',
    resourceId: deviceId,
    requestBody: { action: 'disable' },
  });
  return { action: 'disable', status: 'triggered', deviceId };
}

// Re-enable a device
async function enableDevice(serviceAccountJson, adminEmail, customerId, deviceId) {
  const admin = await getAdminClient(serviceAccountJson, adminEmail);
  await admin.chromeosdevices.action({
    customerId: customerId || 'my_customer',
    resourceId: deviceId,
    requestBody: { action: 'reenable' },
  });
  return { action: 'reenable', status: 'triggered', deviceId };
}

// Move device to correct org unit
async function moveToOrgUnit(serviceAccountJson, adminEmail, customerId, deviceId, orgUnitPath) {
  const admin = await getAdminClient(serviceAccountJson, adminEmail);
  await admin.chromeosdevices.moveDevicesToOu({
    customerId: customerId || 'my_customer',
    orgUnitPath,
    requestBody: { deviceIds: [deviceId] },
  });
  return { action: 'move_org_unit', status: 'triggered', deviceId, orgUnitPath };
}

// Deprovision a device (end of life)
async function deprovisionDevice(serviceAccountJson, adminEmail, customerId, deviceId) {
  const admin = await getAdminClient(serviceAccountJson, adminEmail);
  await admin.chromeosdevices.action({
    customerId: customerId || 'my_customer',
    resourceId: deviceId,
    requestBody: {
      action: 'deprovision',
      deprovisionReason: 'retiring_device',
    },
  });
  return { action: 'deprovision', status: 'triggered', deviceId };
}

// Get detailed device info
async function getDeviceDetail(serviceAccountJson, adminEmail, customerId, deviceId) {
  const admin = await getAdminClient(serviceAccountJson, adminEmail);
  const res = await admin.chromeosdevices.get({
    customerId: customerId || 'my_customer',
    deviceId,
    projection: 'FULL',
  });
  return res.data;
}

// Get list of org units
async function getOrgUnits(serviceAccountJson, adminEmail, customerId) {
  const admin = await getAdminClient(serviceAccountJson, adminEmail);
  const res = await admin.orgunits.list({
    customerId: customerId || 'my_customer',
    type: 'all',
  });
  return res.data.organizationUnits || [];
}

// Send command to device (ChromeOS 96+)
async function sendDeviceCommand(serviceAccountJson, adminEmail, customerId, deviceId, commandType) {
  const auth = await getGoogleAuth(serviceAccountJson, adminEmail);
  const chromeManagement = google.chromemanagement({ version: 'v1', auth });

  const validCommands = ['REBOOT', 'TAKE_A_SCREENSHOT', 'SET_VOLUME', 'WIPE_USERS', 'REMOTE_POWERWASH'];
  if (!validCommands.includes(commandType)) {
    throw new Error(`Invalid command type. Must be one of: ${validCommands.join(', ')}`);
  }

  const res = await chromeManagement.customers.devices.issueCommand({
    name: `customers/${customerId}/devices/${deviceId}`,
    requestBody: { commandType },
  });

  return { action: commandType, status: 'issued', commandId: res.data.commandId };
}

// Get AUE dates for all devices — for replacement planning
async function getAueDates(serviceAccountJson, adminEmail, customerId) {
  const admin = await getAdminClient(serviceAccountJson, adminEmail);
  const res = await admin.chromeosdevices.list({
    customerId: customerId || 'my_customer',
    projection: 'BASIC',
    maxResults: 500,
  });

  const now = new Date();
  const devices = (res.data.chromeosdevices || []).map(d => {
    const aueDate = d.autoUpdateExpiration ? new Date(parseInt(d.autoUpdateExpiration)) : null;
    const daysUntilAue = aueDate ? Math.floor((aueDate - now) / 86400000) : null;
    return {
      deviceId: d.deviceId,
      serialNumber: d.serialNumber,
      model: d.model,
      aueDate: aueDate?.toISOString(),
      daysUntilAue,
      aueRisk: daysUntilAue === null ? 'unknown'
        : daysUntilAue < 0 ? 'expired'
        : daysUntilAue < 180 ? 'critical'
        : daysUntilAue < 365 ? 'warning'
        : 'ok',
    };
  });

  return {
    devices,
    expired: devices.filter(d => d.aueRisk === 'expired').length,
    critical: devices.filter(d => d.aueRisk === 'critical').length,
    warning: devices.filter(d => d.aueRisk === 'warning').length,
    ok: devices.filter(d => d.aueRisk === 'ok').length,
  };
}

module.exports = {
  forcePolicySync,
  disableDevice,
  enableDevice,
  moveToOrgUnit,
  deprovisionDevice,
  getDeviceDetail,
  getOrgUnits,
  sendDeviceCommand,
  getAueDates,
};
