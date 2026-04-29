const express = require('express');
const router = express.Router();
const db = require('../database');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { checkTrialStatus } = require('../middleware/trial');
const { remediateAndroidDevice } = require('../integrations/android-remediation');
const {
  forcePolicySync, disableDevice, enableDevice,
  moveToOrgUnit, deprovisionDevice, sendDeviceCommand,
  getAueDates,
} = require('../integrations/chromebook-remediation');
const { decrypt } = require('../utils/crypto');

router.use(requireAuth, requireAdmin, checkTrialStatus);

// ── Helper to get org integrations ───────────────────────────────────────────
async function getOrgIntegrations(orgId) {
  return db('org_integrations').where({ org_id: orgId }).first();
}

async function getCredentials(integrations) {
  const creds = { ...integrations };
  if (integrations?.google_service_account_enc) {
    creds.google_service_account = JSON.parse(
      decrypt(integrations.google_service_account_enc)
    );
  }
  if (integrations?.intune_client_secret_enc) {
    creds.intune_client_secret = decrypt(integrations.intune_client_secret_enc);
  }
  return creds;
}

// ── Android remediation ───────────────────────────────────────────────────────

// POST /api/remediation/android/:deviceId/:action
router.post('/android/:deviceId/:action', async (req, res, next) => {
  try {
    const { deviceId, action } = req.params;

    const SAFE_ACTIONS = ['lock', 'sync', 'reboot', 'approve'];
    const DESTRUCTIVE_ACTIONS = ['wipe_work_profile', 'full_wipe', 'block'];
    const allAllowed = [...SAFE_ACTIONS, ...DESTRUCTIVE_ACTIONS];

    if (!allAllowed.includes(action)) {
      return res.status(400).json({ error: `Invalid action. Allowed: ${allAllowed.join(', ')}` });
    }

    // Require explicit confirmation for destructive actions
    if (DESTRUCTIVE_ACTIONS.includes(action) && !req.body.confirmed) {
      return res.status(400).json({
        error: 'Destructive action requires confirmation.',
        requiresConfirmation: true,
        action,
        warning: action === 'full_wipe'
          ? 'This will permanently erase all data on the device.'
          : action === 'wipe_work_profile'
          ? 'This will remove all work data from the device.'
          : 'This action cannot be undone.',
      });
    }

    const device = await db('devices')
      .where({ org_id: req.user.orgId, external_id: deviceId })
      .first();
    if (!device) return res.status(404).json({ error: 'Device not found.' });

    const integrations = await getOrgIntegrations(req.user.orgId);
    if (!integrations) {
      return res.status(400).json({ error: 'No MDM integrations configured.' });
    }

    const result = await remediateAndroidDevice(action, device, integrations);

    // Log the action
    await db('agent_logs').insert({
      org_id: req.user.orgId,
      agent_name: 'android_remediation',
      action: `${action}:${deviceId}`,
      result: JSON.stringify(result),
      device_id: device.id,
      created_at: new Date(),
    });

    res.json({ success: true, result });
  } catch (err) { next(err); }
});

// ── Chromebook remediation ────────────────────────────────────────────────────

// POST /api/remediation/chromebook/:deviceId/:action
router.post('/chromebook/:deviceId/:action', async (req, res, next) => {
  try {
    const { deviceId, action } = req.params;

    const SAFE_ACTIONS = ['policy_sync', 'enable', 'get_detail'];
    const DESTRUCTIVE_ACTIONS = ['disable', 'deprovision', 'reboot', 'wipe_users'];
    const allAllowed = [...SAFE_ACTIONS, ...DESTRUCTIVE_ACTIONS];

    if (!allAllowed.includes(action)) {
      return res.status(400).json({ error: `Invalid action. Allowed: ${allAllowed.join(', ')}` });
    }

    if (DESTRUCTIVE_ACTIONS.includes(action) && !req.body.confirmed) {
      return res.status(400).json({
        error: 'Destructive action requires confirmation.',
        requiresConfirmation: true,
        action,
        warning: action === 'deprovision'
          ? 'This will permanently deprovision the device from your fleet.'
          : action === 'wipe_users'
          ? 'This will wipe all user data from the Chromebook.'
          : 'This action cannot be undone.',
      });
    }

    const integrations = await getOrgIntegrations(req.user.orgId);
    const creds = await getCredentials(integrations);

    if (!creds.google_enabled || !creds.google_service_account) {
      return res.status(400).json({ error: 'Google Admin integration not configured.' });
    }

    let result;
    switch (action) {
      case 'policy_sync':
        result = await forcePolicySync(
          creds.google_service_account,
          creds.google_admin_email,
          creds.google_customer_id,
          deviceId
        );
        break;
      case 'disable':
        result = await disableDevice(
          creds.google_service_account,
          creds.google_admin_email,
          creds.google_customer_id,
          deviceId
        );
        break;
      case 'enable':
        result = await enableDevice(
          creds.google_service_account,
          creds.google_admin_email,
          creds.google_customer_id,
          deviceId
        );
        break;
      case 'deprovision':
        result = await deprovisionDevice(
          creds.google_service_account,
          creds.google_admin_email,
          creds.google_customer_id,
          deviceId
        );
        break;
      case 'reboot':
      case 'wipe_users':
        result = await sendDeviceCommand(
          creds.google_service_account,
          creds.google_admin_email,
          creds.google_customer_id,
          deviceId,
          action === 'reboot' ? 'REBOOT' : 'WIPE_USERS'
        );
        break;
      default:
        return res.status(400).json({ error: 'Unknown action.' });
    }

    await db('agent_logs').insert({
      org_id: req.user.orgId,
      agent_name: 'chromebook_remediation',
      action: `${action}:${deviceId}`,
      result: JSON.stringify(result),
      created_at: new Date(),
    });

    res.json({ success: true, result });
  } catch (err) { next(err); }
});

// ── Move Chromebook to org unit ───────────────────────────────────────────────
router.post('/chromebook/:deviceId/move-ou', async (req, res, next) => {
  try {
    const { orgUnitPath } = req.body;
    if (!orgUnitPath) {
      return res.status(400).json({ error: 'orgUnitPath required.' });
    }

    const integrations = await getOrgIntegrations(req.user.orgId);
    const creds = await getCredentials(integrations);

    const result = await moveToOrgUnit(
      creds.google_service_account,
      creds.google_admin_email,
      creds.google_customer_id,
      req.params.deviceId,
      orgUnitPath
    );

    await db('agent_logs').insert({
      org_id: req.user.orgId,
      agent_name: 'chromebook_remediation',
      action: `move_ou:${req.params.deviceId}:${orgUnitPath}`,
      result: JSON.stringify(result),
      created_at: new Date(),
    });

    res.json({ success: true, result });
  } catch (err) { next(err); }
});

// ── AUE report ────────────────────────────────────────────────────────────────
router.get('/chromebook/aue-report', async (req, res, next) => {
  try {
    const integrations = await getOrgIntegrations(req.user.orgId);
    const creds = await getCredentials(integrations);

    if (!creds.google_enabled || !creds.google_service_account) {
      return res.status(400).json({ error: 'Google Admin integration not configured.' });
    }

    const report = await getAueDates(
      creds.google_service_account,
      creds.google_admin_email,
      creds.google_customer_id
    );

    res.json(report);
  } catch (err) { next(err); }
});

// ── Remediation log ───────────────────────────────────────────────────────────
router.get('/log', async (req, res, next) => {
  try {
    const logs = await db('agent_logs')
      .where({ org_id: req.user.orgId })
      .whereIn('agent_name', ['android_remediation', 'chromebook_remediation', 'android_healer'])
      .orderBy('created_at', 'desc')
      .limit(100);
    res.json({ logs });
  } catch (err) { next(err); }
});

module.exports = router;
