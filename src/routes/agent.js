const express = require('express');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');

const db = require('../database');
const { getJwtSecret } = require('../config/jwtSecret');

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

function tryEnrollmentPayload(token) {
  if (!token) return null;
  try {
    const payload = jwt.verify(String(token), getJwtSecret());
    if (payload.type !== 'enrollment' || !payload.orgId) return null;
    return { orgId: payload.orgId, groupId: payload.groupId || null, payload };
  } catch {
    return null;
  }
}

async function authAgentRequest(token) {
  const fromApi = await authByToken(token);
  if (fromApi) return { kind: 'apiKey', orgId: fromApi.org_id, apiKey: fromApi };
  const enr = tryEnrollmentPayload(token);
  if (enr) {
    const org = await db('orgs').where({ id: enr.orgId }).first();
    if (!org) return null;
    if (org.subscription_status === 'canceled') return { kind: 'enrollment', rejected: 'subscription' };
    return { kind: 'enrollment', orgId: enr.orgId, groupId: enr.groupId, org };
  }
  return null;
}

async function addDeviceToGroupIfValid(deviceId, orgId, groupId) {
  if (!groupId) return;
  const g = await db('groups').where({ id: groupId, org_id: orgId }).first();
  if (!g) return;
  await db('device_groups')
    .insert({ device_id: deviceId, group_id: g.id })
    .onConflict(['device_id', 'group_id'])
    .ignore();
}

// POST /api/agent/heartbeat
router.post('/heartbeat', async (req, res) => {
  try {
    const token = req.headers['x-org-token'] || req.body?.orgToken;
    const auth = await authAgentRequest(token);
    if (!auth) return res.status(401).json({ error: 'Invalid org token.' });
    if (auth.rejected === 'subscription') {
      return res.status(402).json({ error: 'Subscription inactive.' });
    }

    const payload = req.body || {};
    const telemetry = payload.telemetry || {};
    const deviceName = payload.deviceName || payload.hostname || 'Unknown Device';
    const externalId = payload.deviceId || payload.machineGuid || payload.hostname || crypto.randomUUID();
    const source = 'agent';
    const orgId = auth.orgId;

    const existing = await db('devices')
      .where({ org_id: orgId, source, external_id: externalId })
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
          org_id: orgId,
          name: deviceName,
          source,
          external_id: externalId,
          os: 'windows',
          ...updateFields,
        })
        .returning(['id']);
      deviceId = row.id;
      if (auth.kind === 'enrollment' && auth.groupId) {
        await addDeviceToGroupIfValid(deviceId, orgId, auth.groupId);
      }
    } else {
      await db('devices')
        .where('id', existing.id)
        .update({ ...updateFields, updated_at: new Date() });
    }

    await db('scan_results').insert({
      id: db.raw('gen_random_uuid()'),
      org_id: orgId,
      device_id: deviceId,
      agent_name: 'fortdefend_windows_agent',
      result: payload,
      status: 'pass',
      ai_summary: 'Device check-in received successfully.',
    });

    if (auth.kind === 'apiKey') {
      await db('api_keys').where('id', auth.apiKey.id).update({ last_used_at: new Date() });
    }
    return res.json({ ok: true, commands: [] });
  } catch (err) {
    console.error('Agent heartbeat error:', err);
    return res.status(500).json({ error: 'Failed to process heartbeat.' });
  }
});

// GET /api/agent/download — enrollment JWT; optional &group= must match token when present
router.get('/download', async (req, res) => {
  try {
    const { token, org, group } = req.query;
    if (!token) return res.status(400).json({ error: 'Token required.' });
    let payload;
    try {
      payload = jwt.verify(String(token), getJwtSecret());
    } catch {
      return res.status(401).json({ error: 'Invalid or expired token.' });
    }
    if (payload.type !== 'enrollment' || !payload.orgId) {
      return res.status(401).json({ error: 'Invalid token type.' });
    }
    if (org && org !== payload.orgId) {
      return res.status(400).json({ error: 'Invalid org in URL.' });
    }
    if (group && (payload.groupId || '') !== String(group)) {
      return res.status(400).json({ error: 'Invalid group in URL.' });
    }
    const p = path.join(__dirname, '..', '..', 'agent', 'agent.exe');
    if (!fs.existsSync(p)) return res.status(404).json({ error: 'agent.exe not found.' });
    return res.download(p, 'agent.exe');
  } catch (err) {
    console.error('Agent download error:', err);
    return res.status(500).json({ error: 'Failed to download agent.' });
  }
});

// GET /api/agent/install — local install.ps1 (token substituted)
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
