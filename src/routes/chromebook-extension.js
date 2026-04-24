const express = require('express');
const router = express.Router();
const db = require('../database');
const jwt = require('jsonwebtoken');
const { analyzeSysinternalsResults } = require('../integrations/sysinternals');
const { getJwtSecret } = require('../config/jwtSecret');

// ── All routes are called BY the Chrome extension — no user auth ───────────────
// Auth is via device token set during enrollment

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

// ── POST /api/extension/heartbeat — extension reports device state ────────────
router.post('/heartbeat', verifyDeviceToken, async (req, res, next) => {
  try {
    const {
      deviceName,
      platform,
      osVersion,
      extensionVersion,
      checks,
      installedExtensions,
      securityScore,
      serialNumber,
    } = req.body;

    // Upsert device
    await db('devices').insert({
      id: req.device.deviceId,
      org_id: req.device.orgId,
      name: deviceName || 'Chromebook',
      serial: serialNumber || req.device.deviceId,
      os: platform || 'chromeos',
      os_version: osVersion || 'Unknown',
      source: 'extension',
      external_id: req.device.deviceId,
      status: securityScore >= 80 ? 'online' : securityScore >= 60 ? 'warning' : 'alert',
      security_score: securityScore || 100,
      last_seen: new Date(),
      created_at: new Date(),
      updated_at: new Date(),
    }).onConflict(['org_id', 'serial']).merge({
      security_score: securityScore || 100,
      os_version: osVersion || 'Unknown',
      last_seen: new Date(),
      status: securityScore >= 80 ? 'online' : securityScore >= 60 ? 'warning' : 'alert',
      updated_at: new Date(),
    });

    // Save check results
    if (checks && checks.length > 0) {
      await db('scan_results').insert({
        org_id: req.device.orgId,
        device_id: req.device.deviceId,
        agent_name: 'chromebook_extension',
        result: JSON.stringify(checks),
        status: securityScore >= 80 ? 'pass' : securityScore >= 60 ? 'warn' : 'fail',
        ai_summary: generateExtensionSummary(checks),
        created_at: new Date(),
      }).catch(() => {});
    }

    // Flag risky extensions
    if (installedExtensions && installedExtensions.length > 0) {
      const risky = installedExtensions.filter(e =>
        e.permissions?.includes('tabs') &&
        e.permissions?.includes('webRequest') &&
        !e.fromWebStore
      );
      if (risky.length > 0) {
        await db('alerts').insert({
          org_id: req.device.orgId,
          type: 'risky_extensions',
          severity: 'warning',
          message: `${deviceName}: ${risky.length} risky extension${risky.length > 1 ? 's' : ''} detected`,
          ai_analysis: `Extensions with broad permissions not from Web Store: ${risky.map(e => e.name).join(', ')}`,
          resolved: false,
          created_at: new Date(),
        }).onConflict(['org_id', 'type']).merge({
          message: `${deviceName}: ${risky.length} risky extensions`,
          resolved: false,
        });
      }
    }

    res.json({
      received: true,
      nextCheckIn: 240, // minutes
      commands: [], // future: send commands back to extension
    });
  } catch (err) { next(err); }
});

// ── GET /api/extension/config — extension fetches its config ──────────────────
router.get('/config', verifyDeviceToken, async (req, res, next) => {
  try {
    const org = await db('orgs').where({ id: req.device.orgId }).first();
    res.json({
      orgName: org.name,
      checkInterval: 240,
      checks: {
        osVersion: true,
        extensions: true,
        safeBrowsing: true,
        screenLock: true,
        guestMode: true,
        developerMode: true,
        encryptionStatus: true,
      },
      prohibitedExtensions: [],
    });
  } catch (err) { next(err); }
});

function generateExtensionSummary(checks) {
  const failed = checks.filter(c => c.status === 'fail' || c.status === 'warn');
  if (failed.length === 0) return 'All checks passed — device is compliant.';
  return `${failed.length} issue${failed.length > 1 ? 's' : ''} found: ${failed.map(c => c.name).join(', ')}.`;
}

module.exports = router;
