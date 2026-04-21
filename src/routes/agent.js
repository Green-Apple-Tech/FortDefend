const express = require('express');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

const db = require('../database');

const router = express.Router();

async function authByToken(token) {
  if (!token) return null;
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  const key = await db('api_keys')
    .where({ key_hash: hash, active: true })
    .where((q) => q.whereNull('expires_at').orWhere('expires_at', '>', new Date()))
    .first();
  return key || null;
}

router.post('/agent/heartbeat', async (req, res) => {
  try {
    const token = req.headers['x-org-token'] || req.body?.orgToken;
    const auth = await authByToken(token);
    if (!auth) return res.status(401).json({ error: 'Invalid org token.' });

    const payload = req.body || {};
    const telemetry = payload.telemetry || {};
    const deviceName = payload.deviceName || payload.hostname || 'Unknown Device';
    const externalId = payload.deviceId || payload.machineGuid || payload.hostname || crypto.randomUUID();
    const source = 'agent';

    const existing = await db('devices')
      .where({ org_id: auth.org_id, source, external_id: externalId })
      .first();
    let deviceId = existing?.id;
    const rebootRequiredReason = ['windows_update', 'patch', 'pending_file_ops'].includes(telemetry.rebootRequiredReason)
      ? telemetry.rebootRequiredReason
      : null;
    const updateFields = {
      name: deviceName,
      last_seen: new Date(),
      status: 'online',
      security_score: payload.securityScore || existing?.security_score || 75,
      battery_level: Number.isFinite(Number(telemetry.batteryLevel)) ? Number(telemetry.batteryLevel) : null,
      on_ac_power: telemetry.onAcPower == null ? true : !!telemetry.onAcPower,
      active_user_session: !!telemetry.activeUserSession,
      idle_time_minutes: Number.isFinite(Number(telemetry.idleTimeMinutes)) ? Number(telemetry.idleTimeMinutes) : null,
      unsaved_word_docs: !!telemetry.unsavedWordDocs,
      unsaved_excel_docs: !!telemetry.unsavedExcelDocs,
      open_browser_count: Number.isFinite(Number(telemetry.openBrowserCount)) ? Number(telemetry.openBrowserCount) : 0,
      any_unsaved_changes: !!telemetry.anyUnsavedChanges,
      active_network_connections: Number.isFinite(Number(telemetry.activeNetworkConnections))
        ? Number(telemetry.activeNetworkConnections)
        : 0,
      reboot_required: !!telemetry.rebootRequired,
      reboot_required_reason: rebootRequiredReason,
    };

    if (!existing) {
      const [row] = await db('devices')
        .insert({
          id: db.raw('gen_random_uuid()'),
          org_id: auth.org_id,
          name: deviceName,
          source,
          external_id: externalId,
          os: 'windows',
          ...updateFields,
        })
        .returning(['id']);
      deviceId = row.id;
    } else {
      await db('devices')
        .where('id', existing.id)
        .update({ ...updateFields, updated_at: new Date() });
    }

    await db('scan_results').insert({
      id: db.raw('gen_random_uuid()'),
      org_id: auth.org_id,
      device_id: deviceId,
      agent_name: 'fortdefend_windows_agent',
      result: payload,
      status: 'pass',
      ai_summary: 'Device check-in received successfully.',
    });

    await db('api_keys').where('id', auth.id).update({ last_used_at: new Date() });
    return res.json({ ok: true, commands: [] });
  } catch (err) {
    console.error('Agent heartbeat error:', err);
    return res.status(500).json({ error: 'Failed to process heartbeat.' });
  }
});

router.get('/agent/download', async (req, res) => {
  const p = path.join(__dirname, '..', '..', 'agent', 'agent.exe');
  if (!fs.existsSync(p)) return res.status(404).json({ error: 'agent.exe not found.' });
  return res.download(p, 'agent.exe');
});

router.get('/install', async (req, res) => {
  const p = path.join(__dirname, '..', '..', 'agent', 'install.ps1');
  if (!fs.existsSync(p)) return res.status(404).json({ error: 'install.ps1 not found.' });
  const template = fs.readFileSync(p, 'utf8');
  const token = String(req.query.token || '');
  const rendered = template.replace(/__ORG_TOKEN__/g, token).replace(/__APP_URL__/g, process.env.APP_URL || '');
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  return res.send(rendered);
});

module.exports = router;
