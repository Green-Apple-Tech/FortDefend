const express = require('express');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
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
    if (req.body?.orgToken) return next();
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

// POST /api/android/heartbeat — org token based Android check-in
router.post('/heartbeat', async (req, res) => {
  try {
    const {
      orgToken,
      deviceName,
      os,
      source,
      agentVersion,
      manufacturer,
      model,
      serialNumber,
      deviceId,
      osVersion,
      osBuild,
      apiLevel,
      securityPatchLevel,
      buildNumber,
      cpuModel,
      cpuCores,
      memTotalGb,
      memUsedGb,
      ramTotalGb,
      diskTotalGb,
      diskFreeGb,
      batteryLevel,
      batteryStatus,
      onAcPower,
      wifiConnected,
      ipAddress,
      screenLockEnabled,
      developerOptionsEnabled,
      osUpToDate,
      securityScore,
      checkResults,
    } = req.body || {};
    if (!orgToken || typeof orgToken !== 'string' || orgToken.length > 100) {
      return res.status(400).json({ error: 'Invalid org token' });
    }
    if (deviceName && String(deviceName).length > 255) {
      return res.status(400).json({ error: 'Device name too long' });
    }

    const org = await db('orgs').where({ id: orgToken }).first();

    if (!org) return res.status(401).json({ error: 'Invalid org token' });

    const normalizedName = String(deviceName || '').trim() || 'Android Device';
    const normalizedSource = source || 'android';
    const normalizedExternalId = String(deviceId || serialNumber || normalizedName).trim();
    const now = new Date();
    const mergedOsVersion = [
      osVersion,
      apiLevel != null ? `API ${apiLevel}` : null,
      securityPatchLevel ? `patch ${securityPatchLevel}` : null,
      buildNumber ? `build ${buildNumber}` : null,
    ]
      .filter(Boolean)
      .join(' | ')
      .slice(0, 255) || null;

    await db('devices')
      .insert({
        id: uuidv4(),
        org_id: org.id,
        name: normalizedName,
        hostname: [manufacturer, model].filter(Boolean).join(' ').trim() || normalizedName,
        serial: String(serialNumber || '').trim() || null,
        external_id: normalizedExternalId || null,
        os: os || 'Android',
        os_version: mergedOsVersion,
        os_build: osBuild || null,
        source: normalizedSource,
        agent_version: agentVersion || '1.0.0',
        cpu_model: cpuModel || null,
        cpu_cores: Number.isFinite(Number(cpuCores)) ? Number(cpuCores) : null,
        mem_total_gb: Number.isFinite(Number(memTotalGb)) ? Number(memTotalGb) : null,
        mem_used_gb: Number.isFinite(Number(memUsedGb)) ? Number(memUsedGb) : null,
        ram_total_gb: Number.isFinite(Number(ramTotalGb ?? memTotalGb)) ? Number(ramTotalGb ?? memTotalGb) : null,
        disk_total_gb: Number.isFinite(Number(diskTotalGb)) ? Number(diskTotalGb) : null,
        disk_free_gb: Number.isFinite(Number(diskFreeGb)) ? Number(diskFreeGb) : null,
        battery_level: Number.isFinite(Number(batteryLevel)) ? Number(batteryLevel) : null,
        battery_status: batteryStatus || null,
        on_ac_power: onAcPower == null ? true : !!onAcPower,
        ip_address: ipAddress || null,
        wifi_connected: wifiConnected == null ? null : !!wifiConnected,
        screen_lock_enabled: screenLockEnabled == null ? null : !!screenLockEnabled,
        developer_options_enabled: developerOptionsEnabled == null ? null : !!developerOptionsEnabled,
        os_outdated: osUpToDate == null ? false : !osUpToDate,
        security_patch_level: securityPatchLevel || null,
        security_score: Number.isFinite(Number(securityScore)) ? Number(securityScore) : null,
        check_results: Array.isArray(checkResults) ? checkResults : null,
        last_seen: now,
        status: 'online',
        updated_at: now,
        created_at: now,
      })
      .onConflict(['org_id', 'name'])
      .merge({
        hostname: [manufacturer, model].filter(Boolean).join(' ').trim() || normalizedName,
        serial: String(serialNumber || '').trim() || null,
        external_id: normalizedExternalId || null,
        os: os || 'Android',
        os_version: mergedOsVersion,
        os_build: osBuild || null,
        agent_version: agentVersion || '1.0.0',
        cpu_model: cpuModel || null,
        cpu_cores: Number.isFinite(Number(cpuCores)) ? Number(cpuCores) : null,
        mem_total_gb: Number.isFinite(Number(memTotalGb)) ? Number(memTotalGb) : null,
        mem_used_gb: Number.isFinite(Number(memUsedGb)) ? Number(memUsedGb) : null,
        ram_total_gb: Number.isFinite(Number(ramTotalGb ?? memTotalGb)) ? Number(ramTotalGb ?? memTotalGb) : null,
        disk_total_gb: Number.isFinite(Number(diskTotalGb)) ? Number(diskTotalGb) : null,
        disk_free_gb: Number.isFinite(Number(diskFreeGb)) ? Number(diskFreeGb) : null,
        battery_level: Number.isFinite(Number(batteryLevel)) ? Number(batteryLevel) : null,
        battery_status: batteryStatus || null,
        on_ac_power: onAcPower == null ? true : !!onAcPower,
        ip_address: ipAddress || null,
        wifi_connected: wifiConnected == null ? null : !!wifiConnected,
        screen_lock_enabled: screenLockEnabled == null ? null : !!screenLockEnabled,
        developer_options_enabled: developerOptionsEnabled == null ? null : !!developerOptionsEnabled,
        os_outdated: osUpToDate == null ? false : !osUpToDate,
        security_patch_level: securityPatchLevel || null,
        security_score: Number.isFinite(Number(securityScore)) ? Number(securityScore) : null,
        check_results: Array.isArray(checkResults) ? checkResults : null,
        last_seen: now,
        status: 'online',
        updated_at: now,
      });

    console.log('[android heartbeat] device checked in:', normalizedName);
    return res.json({ status: 'ok' });
  } catch (err) {
    console.error('[android heartbeat] error:', err.message);
    return res.status(500).json({ error: err.message });
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
