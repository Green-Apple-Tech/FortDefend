const express = require('express');
const router = express.Router();
const db = require('../database');
const jwt = require('jsonwebtoken');
const { analyzeSysinternalsResults } = require('../integrations/sysinternals');
const { getJwtSecret } = require('../config/jwtSecret');
const { evaluateDeviceAlerts } = require('../lib/deviceMonitoring');

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
      fullReport,
      status: statusField,
    } = req.body;

    const isFull = fullReport !== false && Array.isArray(checks) && checks.length > 0;
    const score = typeof securityScore === 'number' ? securityScore : isFull ? 100 : undefined;
    const rowName = deviceName || 'Chromebook';

    const pendingScriptCommands = await db('sm_commands')
      .where({
        org_id: req.device.orgId,
        device_id: req.device.deviceId,
        status: 'pending',
        command_type: 'run_script',
      })
      .orderBy('created_at', 'asc')
      .select('id', 'command_type', 'command_payload', 'created_at');
    const commands = pendingScriptCommands
      .filter((c) => String(c.command_payload?.scriptType || '').toLowerCase() === 'javascript')
      .map((c) => ({
        id: c.id,
        type: c.command_type,
        payload: c.command_payload,
        createdAt: c.created_at,
      }));

    if (!isFull) {
      await db('devices')
        .where({ id: req.device.deviceId, org_id: req.device.orgId })
        .update({
          last_seen: new Date(),
          updated_at: new Date(),
          ...(statusField === 'error' ? { status: 'warning' } : {}),
        });
      return res.json({
        received: true,
        nextCheckIn: 0.5,
        commands,
      });
    }

    // Upsert device (full inventory)
    await db('devices').insert({
      id: req.device.deviceId,
      org_id: req.device.orgId,
      hostname: rowName,
      name: rowName,
      serial: serialNumber || req.device.deviceId,
      os: platform || 'chromeos',
      os_version: osVersion || 'Unknown',
      source: 'extension',
      external_id: req.device.deviceId,
      agent_version: extensionVersion || null,
      status: (score != null && score >= 80) ? 'online' : (score != null && score >= 60) ? 'warning' : 'alert',
      security_score: score != null ? score : 100,
      last_seen: new Date(),
      created_at: new Date(),
      updated_at: new Date(),
    }).onConflict(['org_id', 'serial']).merge({
      security_score: score != null ? score : 100,
      os_version: osVersion || 'Unknown',
      agent_version: extensionVersion || null,
      last_seen: new Date(),
      status: (score != null && score >= 80) ? 'online' : (score != null && score >= 60) ? 'warning' : 'alert',
      updated_at: new Date(),
    });
    const latest = await db('devices').where({ id: req.device.deviceId, org_id: req.device.orgId }).first();
    if (latest) await evaluateDeviceAlerts(db, { orgId: req.device.orgId, device: latest });

    if (checks && checks.length > 0) {
      await db('scan_results').insert({
        org_id: req.device.orgId,
        device_id: req.device.deviceId,
        agent_name: 'chromebook_extension',
        result: JSON.stringify(checks),
        status: (score != null && score >= 80) ? 'pass' : (score != null && score >= 60) ? 'warn' : 'fail',
        ai_summary: generateExtensionSummary(checks),
        created_at: new Date(),
      }).catch(() => {});
    }

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
          message: `${rowName}: ${risky.length} risky extension${risky.length > 1 ? 's' : ''} detected`,
          ai_analysis: `Extensions with broad permissions not from Web Store: ${risky.map(e => e.name).join(', ')}`,
          resolved: false,
          created_at: new Date(),
        }).onConflict(['org_id', 'type']).merge({
          message: `${rowName}: ${risky.length} risky extensions`,
          resolved: false,
        });
      }
    }

    res.json({
      received: true,
      nextCheckIn: 15,
      commands,
    });
  } catch (err) { next(err); }
});

router.post('/command-result', verifyDeviceToken, async (req, res, next) => {
  try {
    const commandId = String(req.body?.commandId || '').trim();
    if (!commandId) return res.status(400).json({ error: 'commandId is required.' });
    const status = String(req.body?.status || '').toLowerCase();
    if (!['running', 'success', 'failed', 'cancelled'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status.' });
    }
    const updates = {
      status,
      updated_at: new Date(),
    };
    if (req.body?.stdout !== undefined) updates.output = req.body.stdout == null ? null : String(req.body.stdout);
    if (req.body?.stderr !== undefined) updates.error_message = req.body.stderr == null ? null : String(req.body.stderr);
    if (status === 'success' || status === 'failed' || status === 'cancelled') updates.completed_at = new Date();
    const changed = await db('sm_commands')
      .where({ id: commandId, org_id: req.device.orgId, device_id: req.device.deviceId })
      .update(updates);
    if (!changed) return res.status(404).json({ error: 'Command not found.' });
    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
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
