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

async function tryPlainOrgIdToken(token) {
  if (!token || typeof token !== 'string') return null;
  const t = String(token).trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(t)) return null;
  const org = await db('orgs').where({ id: t }).first();
  if (!org) return null;
  if (org.subscription_status === 'canceled') return { rejected: 'subscription' };
  return { kind: 'enrollment', orgId: org.id, groupId: null, org };
}

async function authAgentRequest(token) {
  const fromApi = await authByToken(token);
  if (fromApi) return { kind: 'apiKey', orgId: fromApi.org_id, apiKey: fromApi };
  const plain = await tryPlainOrgIdToken(token);
  if (plain?.rejected === 'subscription') return { rejected: 'subscription' };
  if (plain) return plain;
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

const agentResourceDir = path.join(__dirname, '..', '..', 'agent');
const agentDistExe = path.join(__dirname, '../../agent/dist/FortDefendAgent.exe');
const agentInstallTemplate = path.join(agentResourceDir, 'install.ps1');
const agentUninstallScript = path.join(agentResourceDir, 'uninstall.ps1');

async function resolveOrgAndGroupForInstall(orgId, groupId) {
  const org = await db('orgs').where({ id: orgId }).first();
  if (!org) return { error: 404, message: 'organization not found' };
  if (groupId) {
    const g = await db('groups').where({ id: groupId, org_id: orgId }).first();
    if (!g) return { error: 400, message: 'group not found' };
  }
  return { org, groupId: groupId || '' };
}

function buildInstallScript(baseUrl, orgId, groupId) {
  const b = baseUrl.replace(/\/$/, '');
  const gq = groupId ? `&group=${encodeURIComponent(groupId)}` : '';
  const installScriptUrl = `${b}/api/agent/install.ps1?org=${encodeURIComponent(orgId)}${gq}`;
  const downloadUrl = `${b}/api/agent/download?org=${encodeURIComponent(orgId)}${gq}`;
  let src = fs.readFileSync(agentInstallTemplate, 'utf8');
  src = src
    .replace(/__INSTALL_SCRIPT_URL__/g, installScriptUrl)
    .replace(/__APP_URL__/g, b)
    .replace(/__ORG_ID__/g, orgId)
    .replace(/__GROUP_ID__/g, groupId || '')
    .replace(/__DOWNLOAD_URL__/g, downloadUrl);
  return src;
}

// GET /api/agent/install.ps1?org=UUID&group= (optional) — install.ps1 with injected URLs (text/plain)
router.get('/install.ps1', async (req, res) => {
  try {
    const org = String(req.query.org || '').trim();
    if (!org) {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      return res.status(400).send('# Error: add ?org=<organization-id> (optional &group=)');
    }
    const group = String(req.query.group || '').trim();
    const check = await resolveOrgAndGroupForInstall(org, group || null);
    if (check.error) {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      return res.status(check.error).send(`# Error: ${check.message}`);
    }
    let baseUrl = (process.env.APP_URL || '').trim().replace(/\/$/, '');
    if (!baseUrl) {
      baseUrl = `${req.protocol}://${req.get('host')}`;
    }
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', 'inline; filename="fortdefend-install.ps1"');
    return res.send(buildInstallScript(baseUrl, org, group));
  } catch (err) {
    console.error('install.ps1 error:', err);
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.status(500).send('# Error: failed to load install script');
  }
});

// GET /api/agent/uninstall.ps1
router.get('/uninstall.ps1', (req, res) => {
  try {
    if (!fs.existsSync(agentUninstallScript)) {
      return res.status(404).type('text/plain').send('# Error: uninstall.ps1 not found on server');
    }
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', 'inline; filename="fortdefend-uninstall.ps1"');
    return res.sendFile(agentUninstallScript);
  } catch (err) {
    console.error('uninstall.ps1 error:', err);
    return res.status(500).type('text/plain').send('# Error: failed to load uninstall script');
  }
});

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

    const groupHint = req.headers['x-fortdefend-group'];
    let enrollGroupId = auth.groupId;
    if (!enrollGroupId && groupHint) {
      const g = await db('groups')
        .where({ id: String(groupHint), org_id: orgId })
        .first();
      if (g) enrollGroupId = g.id;
    }

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
      if (auth.kind === 'enrollment' && enrollGroupId) {
        await addDeviceToGroupIfValid(deviceId, orgId, enrollGroupId);
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

// GET /api/agent/download — FortDefendAgent.exe; ?org= / ?token= for tracked downloads (see below)
router.get('/download', async (req, res) => {
  try {
    const { token, org, group } = req.query;
    const hasOrg = org != null && String(org).trim() !== '';
    const hasToken = token != null && String(token).trim() !== '';
    if (!hasOrg && !hasToken) {
      if (group != null && String(group).trim() !== '') {
        return res.status(400).json({ error: 'Token or org query required when group is set.' });
      }
      if (!fs.existsSync(agentDistExe)) {
        return res.status(404).json({
          error: 'Agent binary not found. Build it: cd agent && npm install && npm run build:installer (or npm run build).',
        });
      }
      res.setHeader('Content-Disposition', 'attachment; filename="FortDefendAgent.exe"');
      return res.sendFile(agentDistExe);
    }
    if (org && !token) {
      const o = await db('orgs').where({ id: String(org) }).first();
      if (!o) return res.status(404).json({ error: 'Organization not found.' });
      if (group) {
        const g = await db('groups').where({ id: String(group), org_id: String(org) }).first();
        if (!g) return res.status(400).json({ error: 'Group not found.' });
      }
      if (!fs.existsSync(agentDistExe)) {
        return res.status(404).json({
          error: 'Agent binary not found. Build it: cd agent && npm install && npm run build:installer (or npm run build).',
        });
      }
      res.setHeader('Content-Disposition', 'attachment; filename="FortDefendAgent.exe"');
      return res.sendFile(agentDistExe);
    }
    if (!token) return res.status(400).json({ error: 'Token or org query required.' });
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
    const legacy = path.join(agentResourceDir, 'agent.exe');
    if (fs.existsSync(legacy)) {
      return res.download(legacy, 'agent.exe');
    }
    if (fs.existsSync(agentDistExe)) {
      res.setHeader('Content-Disposition', 'attachment; filename="FortDefendAgent.exe"');
      return res.sendFile(agentDistExe);
    }
    return res.status(404).json({ error: 'No agent package found on the server.' });
  } catch (err) {
    console.error('Agent download error:', err);
    return res.status(500).json({ error: 'Failed to download agent.' });
  }
});

// GET /api/agent/install — use GET /api/agent/install.ps1?org=... instead
router.get('/install', async (req, res) => {
  if (String(req.query.org || '').trim()) {
    return res.redirect(302, `/api/agent/install.ps1?${new URLSearchParams(req.query).toString()}`);
  }
  res.status(400).type('text/plain')
    .send('Use: GET /api/agent/install.ps1?org=ORG_ID&group=GROUP_ID (group optional).');
});

module.exports = router;
