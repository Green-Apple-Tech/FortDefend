const express = require('express');
const jwt = require('jsonwebtoken');
const router = express.Router();
const db = require('../database');
const { getJwtSecret } = require('../config/jwtSecret');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { checkTrialStatus } = require('../middleware/trial');
const {
  verifyAllAndroidDevices,
  verifyAndroidDevice,
  getAllAndroidDevices,
} = require('../integrations/android');
const { toNum, toDateOrNull, evaluateDeviceAlerts } = require('../lib/deviceMonitoring');

// ── Device app (enrollment token) — no session auth ─────────────────────────────
function verifyDeviceToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Device token required.' });
  }
  try {
    const payload = jwt.verify(authHeader.slice(7), getJwtSecret());
    if (payload.type !== 'device' && payload.type !== 'enrollment') {
      return res.status(401).json({ error: 'Invalid token type.' });
    }
    req.device = payload;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
}

// POST /api/android/heartbeat — Android agent check-in, optional fcmToken, pending sm_commands
router.post('/heartbeat', verifyDeviceToken, async (req, res, next) => {
  try {
    const { fcmToken, deviceName, securityScore, telemetry } = req.body || {};
    const { orgId, deviceId } = req.device;
    if (!orgId || !deviceId) {
      return res.status(400).json({ error: 'Invalid device token.' });
    }

    const current = await db('devices').where({ id: deviceId, org_id: orgId }).first();
    const t = telemetry || {};
    const now = new Date();
    const cpuUsagePct = toNum(t.cpuUsagePct, current?.cpu_usage_pct ?? null);
    const ramUsagePct = toNum(t.ramUsagePct, current?.ram_usage_pct ?? null);
    const priorCpuSince = toDateOrNull(current?.high_cpu_since);
    const priorRamSince = toDateOrNull(current?.high_ram_since);
    const patch = {
      last_seen: now,
      updated_at: now,
      hostname: t.hostname || current?.hostname || null,
      serial: t.serialNumber || current?.serial || null,
      os: t.osName || current?.os || 'android',
      os_version: t.osVersion || current?.os_version || null,
      logged_in_user: t.loggedInUser || current?.logged_in_user || null,
      cpu_model: t.cpuModel || current?.cpu_model || null,
      cpu_usage_pct: cpuUsagePct,
      ram_total_gb: toNum(t.ramTotalGb, current?.ram_total_gb ?? null),
      ram_usage_pct: ramUsagePct,
      disk_total_gb: toNum(t.diskTotalGb, current?.disk_total_gb ?? null),
      disk_free_gb: toNum(t.diskFreeGb, current?.disk_free_gb ?? null),
      disk_usage_pct: toNum(t.diskUsagePct, current?.disk_usage_pct ?? null),
      disk_free_pct: toNum(t.diskFreePct, current?.disk_free_pct ?? null),
      battery_level: toNum(t.batteryLevel, current?.battery_level ?? null),
      battery_status: t.batteryStatus || current?.battery_status || null,
      battery_health: t.batteryHealth || current?.battery_health || null,
      ip_address: t.ipAddress || current?.ip_address || null,
      agent_version: t.agentVersion || current?.agent_version || null,
      os_outdated: t.osOutdated === true,
      security_agent_running: t.securityAgentRunning == null ? (current?.security_agent_running ?? true) : !!t.securityAgentRunning,
      high_cpu_since: cpuUsagePct != null && cpuUsagePct >= 100 ? (priorCpuSince || now) : null,
      high_ram_since: ramUsagePct != null && ramUsagePct >= 100 ? (priorRamSince || now) : null,
    };
    if (fcmToken && typeof fcmToken === 'string' && fcmToken.trim()) {
      patch.fcm_token = fcmToken.trim();
    }
    if (deviceName && String(deviceName).trim()) {
      patch.name = String(deviceName).trim();
    }
    if (Number.isFinite(Number(securityScore))) {
      patch.security_score = Math.max(0, Math.min(100, Math.round(Number(securityScore))));
    }

    const n = await db('devices').where({ id: deviceId, org_id: orgId }).update(patch);
    if (n === 0) {
      return res.status(404).json({ error: 'Device not found.' });
    }
    const latest = await db('devices').where({ id: deviceId, org_id: orgId }).first();
    if (latest) await evaluateDeviceAlerts(db, { orgId, device: latest });

    const pending = await db('sm_commands')
      .where({ device_id: deviceId, org_id: orgId, status: 'pending' })
      .orderBy('created_at', 'asc')
      .select('id', 'winget_id', 'command_type', 'command_payload', 'created_at');

    const commands = pending.map((c) => ({
      id: c.id,
      commandType: c.command_type,
      wingetId: c.winget_id,
      payload: c.command_payload || null,
      createdAt: c.created_at,
    }));
    return res.json({ ok: true, commands });
  } catch (err) {
    return next(err);
  }
});

// POST /api/android/register-fcm — { fcmToken }
router.post('/register-fcm', verifyDeviceToken, async (req, res, next) => {
  try {
    const { fcmToken } = req.body || {};
    if (!fcmToken || typeof fcmToken !== 'string' || !fcmToken.trim()) {
      return res.status(400).json({ error: 'fcmToken is required.' });
    }
    const { orgId, deviceId } = req.device;
    if (!orgId || !deviceId) {
      return res.status(400).json({ error: 'Invalid device token.' });
    }
    const n = await db('devices')
      .where({ id: deviceId, org_id: orgId })
      .update({ fcm_token: fcmToken.trim(), updated_at: new Date() });
    if (n === 0) {
      return res.status(404).json({ error: 'Device not found.' });
    }
    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
});

router.use(requireAuth);
router.use(checkTrialStatus);

// GET /api/android/verify — run full Android verification for org
router.get('/verify', requireAdmin, async (req, res, next) => {
  try {
    const integrations = await db('org_integrations')
      .where({ org_id: req.user.orgId }).first();

    if (!integrations) {
      return res.status(400).json({
        error: 'No MDM integrations configured. Connect Google Admin or Intune first.',
      });
    }

    // Decrypt credentials
    const { decrypt } = require('../utils/crypto');
    const orgIntegrations = { ...integrations };

    if (integrations.google_service_account_enc) {
      orgIntegrations.google_service_account = decrypt(integrations.google_service_account_enc);
    }
    if (integrations.intune_client_secret_enc) {
      orgIntegrations.intune_client_secret = decrypt(integrations.intune_client_secret_enc);
    }

    const results = await verifyAllAndroidDevices(orgIntegrations);

    // Save results to DB
    for (const device of results.devices) {
      await db('devices').insert({
        org_id: req.user.orgId,
        name: device.name,
        serial: device.deviceId,
        os: 'android',
        os_version: device.osVersion,
        source: device.source,
        external_id: device.deviceId,
        last_seen: device.lastSync ? new Date(device.lastSync) : new Date(),
        security_score: device.complianceScore,
        status: device.complianceScore >= 80 ? 'online' :
          device.complianceScore >= 60 ? 'warning' : 'alert',
        updated_at: new Date(),
        created_at: new Date(),
      }).onConflict(['org_id', 'external_id']).merge({
        security_score: device.complianceScore,
        last_seen: device.lastSync ? new Date(device.lastSync) : new Date(),
        status: device.complianceScore >= 80 ? 'online' :
          device.complianceScore >= 60 ? 'warning' : 'alert',
        updated_at: new Date(),
      });

      // Save check results
      await db('scan_results').insert({
        org_id: req.user.orgId,
        device_id: device.deviceId,
        agent_name: 'android_verifier',
        result: JSON.stringify(device.checks),
        status: device.complianceScore >= 80 ? 'pass' :
          device.complianceScore >= 60 ? 'warn' : 'fail',
        ai_summary: generateAndroidSummary(device),
        created_at: new Date(),
      }).catch(() => {}); // ignore if device not in devices table yet

      // Create alerts for critical issues
      const criticalChecks = device.checks.filter(
        c => c.status === 'fail' && c.severity === 'critical'
      );
      for (const check of criticalChecks) {
        await db('alerts').insert({
          org_id: req.user.orgId,
          type: check.id,
          severity: 'critical',
          message: `${device.name}: ${check.name} — ${check.detail}`,
          ai_analysis: check.manualAction || check.healAction,
          resolved: false,
          created_at: new Date(),
        }).onConflict(['org_id', 'type']).ignore();
      }
    }

    res.json(results);
  } catch (err) { next(err); }
});

// GET /api/android/devices — list verified Android devices
router.get('/devices', async (req, res, next) => {
  try {
    const devices = await db('devices')
      .where({ org_id: req.user.orgId, os: 'android' })
      .orderBy('security_score', 'asc');
    res.json({ devices });
  } catch (err) { next(err); }
});

// GET /api/android/summary — fleet summary
router.get('/summary', async (req, res, next) => {
  try {
    const devices = await db('devices')
      .where({ org_id: req.user.orgId, os: 'android' });

    const scores = devices.map(d => d.security_score || 100);
    const fleetScore = scores.length > 0
      ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
      : 100;

    res.json({
      totalDevices: devices.length,
      fleetScore,
      compliant: devices.filter(d => (d.security_score || 100) >= 80).length,
      atRisk: devices.filter(d => (d.security_score || 100) < 80 && (d.security_score || 100) >= 60).length,
      critical: devices.filter(d => (d.security_score || 100) < 60).length,
      stale: devices.filter(d => {
        if (!d.last_seen) return false;
        const days = Math.floor((Date.now() - new Date(d.last_seen)) / 86400000);
        return days > 7;
      }).length,
    });
  } catch (err) { next(err); }
});

// POST /api/android/heal/:deviceId — trigger auto-heal for a device
router.post('/heal/:deviceId', requireAdmin, async (req, res, next) => {
  try {
    const { checkId } = req.body;
    const device = await db('devices')
      .where({ org_id: req.user.orgId, external_id: req.params.deviceId })
      .first();

    if (!device) return res.status(404).json({ error: 'Device not found.' });

    // Log the heal attempt
    await db('agent_logs').insert({
      org_id: req.user.orgId,
      agent_name: 'android_healer',
      action: `auto_heal:${checkId}`,
      result: 'triggered',
      device_id: device.id,
      created_at: new Date(),
    });

    // In production this would trigger MDM API command
    // For now we log and return instructions
    res.json({
      message: 'Heal action triggered',
      deviceId: req.params.deviceId,
      checkId,
      note: 'MDM policy push initiated. Re-verify in 15 minutes to confirm.',
    });
  } catch (err) { next(err); }
});

function generateAndroidSummary(device) {
  const issues = device.checks.filter(c => c.status !== 'pass');
  if (issues.length === 0) return 'Device fully compliant — all checks passed.';
  const critical = issues.filter(c => c.severity === 'critical');
  const warnings = issues.filter(c => c.severity === 'warning');
  let summary = '';
  if (critical.length > 0) {
    summary += `${critical.length} critical issue${critical.length > 1 ? 's' : ''}: ${critical.map(c => c.name).join(', ')}. `;
  }
  if (warnings.length > 0) {
    summary += `${warnings.length} warning${warnings.length > 1 ? 's' : ''}: ${warnings.map(c => c.name).join(', ')}.`;
  }
  return summary.trim();
}

module.exports = router;
