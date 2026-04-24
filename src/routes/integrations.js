require('dotenv').config();
const express = require('express');
const { z } = require('zod');

const db = require('../database');
const { encrypt } = require('../lib/crypto');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { IntegrationManager } = require('../integrations/manager');
const { evaluateDeviceAlerts } = require('../lib/deviceMonitoring');

const router = express.Router();

router.get('/status', requireAuth, async (req, res) => {
  try {
    const row = await db('org_integrations').where('org_id', req.user.orgId).first();
    if (!row) {
      return res.json({
        intune: { enabled: false, configured: false },
        google: { enabled: false, configured: false },
        updatedAt: null,
      });
    }

    const googleConfigured = !!(row.google_admin_email && row.google_service_account_enc);
    let googleMobileDeviceCount = 0;
    if (googleConfigured && row.google_enabled) {
      try {
        const mgr = new IntegrationManager(req.user.orgId);
        const { devices } = await mgr.getAllDevices();
        googleMobileDeviceCount = devices.filter((d) => d.source === 'google_mobile').length;
      } catch (countErr) {
        console.error('Integrations status mobile count error:', countErr);
      }
    }

    res.json({
      intune: {
        enabled: !!row.intune_enabled,
        configured: !!(
          row.intune_tenant_id &&
          row.intune_client_id &&
          row.intune_client_secret_enc
        ),
      },
      google: {
        enabled: !!row.google_enabled,
        configured: googleConfigured,
        mobileDeviceCount: googleMobileDeviceCount,
      },
      googleCustomerId: row.google_customer_id || null,
      updatedAt: row.updated_at,
    });
  } catch (err) {
    console.error('Integrations status error:', err);
    res.status(500).json({ error: 'Failed to load integration status.' });
  }
});

router.post('/intune/connect', requireAuth, requireAdmin, async (req, res) => {
  try {
    const schema = z.object({
      tenantId: z.string().min(1),
      clientId: z.string().min(1),
      clientSecret: z.string().min(1),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0].message });
    }

    const { tenantId, clientId, clientSecret } = parsed.data;
    const secretEnc = encrypt(clientSecret);

    const existing = await db('org_integrations').where('org_id', req.user.orgId).first();
    const payload = {
      intune_enabled: true,
      intune_tenant_id: tenantId,
      intune_client_id: clientId,
      intune_client_secret_enc: secretEnc,
      updated_at: new Date(),
    };

    if (existing) {
      await db('org_integrations').where('org_id', req.user.orgId).update(payload);
    } else {
      await db('org_integrations').insert({ org_id: req.user.orgId, ...payload });
    }

    res.json({ message: 'Microsoft Intune connected.' });
  } catch (err) {
    console.error('Intune connect error:', err);
    res.status(500).json({ error: 'Failed to save Intune credentials.' });
  }
});

router.post('/google/connect', requireAuth, requireAdmin, async (req, res) => {
  try {
    const schema = z.object({
      adminEmail: z.string().email(),
      customerId: z.string().min(1).optional(),
      serviceAccountJson: z.union([z.record(z.string(), z.any()), z.string()]),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0].message });
    }

    const { adminEmail, customerId, serviceAccountJson } = parsed.data;
    const jsonStr =
      typeof serviceAccountJson === 'string'
        ? serviceAccountJson
        : JSON.stringify(serviceAccountJson);

    let parsedJson;
    try {
      parsedJson = JSON.parse(jsonStr);
    } catch {
      return res.status(400).json({ error: 'serviceAccountJson must be valid JSON.' });
    }
    if (!parsedJson.client_email || !parsedJson.private_key) {
      return res.status(400).json({ error: 'Service account JSON must include client_email and private_key.' });
    }

    const enc = encrypt(jsonStr);
    const cid = customerId || 'my_customer';

    const existing = await db('org_integrations').where('org_id', req.user.orgId).first();
    const payload = {
      google_enabled: true,
      google_admin_email: adminEmail.toLowerCase(),
      google_customer_id: cid,
      google_service_account_enc: enc,
      updated_at: new Date(),
    };

    if (existing) {
      await db('org_integrations').where('org_id', req.user.orgId).update(payload);
    } else {
      await db('org_integrations').insert({ org_id: req.user.orgId, ...payload });
    }

    res.json({ message: 'Google Admin connected.' });
  } catch (err) {
    console.error('Google connect error:', err);
    res.status(500).json({ error: 'Failed to save Google credentials.' });
  }
});

router.get('/devices', requireAuth, async (req, res) => {
  try {
    const mgr = new IntegrationManager(req.user.orgId);
    const { devices: integrationDevices, errors } = await mgr.getAllDevices();
    const now = new Date();
    for (const d of integrationDevices) {
      const osOutdated = Array.isArray(d.alerts)
        ? d.alerts.some((a) => String(a.type || '').toLowerCase() === 'os_version')
        : false;
      const diskTotalGb = d.disk?.totalGb ?? null;
      const diskFreeGb = d.disk?.freeGb ?? null;
      const diskUsedPct = d.disk?.usedPct ?? null;
      const diskFreePct = (diskTotalGb != null && diskFreeGb != null && Number(diskTotalGb) > 0)
        ? (Number(diskFreeGb) / Number(diskTotalGb)) * 100
        : null;
      const source = d.source || 'intune';
      const externalId = String(d.id || '');
      const existing = await db('devices')
        .where({ org_id: req.user.orgId, source, external_id: externalId })
        .first();
      if (existing) {
        await db('devices')
          .where({ id: existing.id, org_id: req.user.orgId })
          .update({
            name: d.name || d.id || 'Unknown Device',
            hostname: d.name || null,
            serial: d.serial || null,
            os: d.os || null,
            os_version: d.osVersion || null,
            logged_in_user: d.user || d.email || null,
            disk_total_gb: diskTotalGb,
            disk_free_gb: diskFreeGb,
            disk_usage_pct: diskUsedPct,
            disk_free_pct: diskFreePct,
            ram_total_gb: d.ram?.totalGb ?? null,
            last_seen: d.lastSeen ? new Date(d.lastSeen) : now,
            os_outdated: osOutdated,
            security_agent_running: true,
            updated_at: now,
          });
      } else {
        await db('devices').insert({
          id: db.raw('gen_random_uuid()'),
          org_id: req.user.orgId,
          source,
          external_id: externalId,
          name: d.name || d.id || 'Unknown Device',
          hostname: d.name || null,
          serial: d.serial || null,
          os: d.os || null,
          os_version: d.osVersion || null,
          logged_in_user: d.user || d.email || null,
          disk_total_gb: diskTotalGb,
          disk_free_gb: diskFreeGb,
          disk_usage_pct: diskUsedPct,
          disk_free_pct: diskFreePct,
          ram_total_gb: d.ram?.totalGb ?? null,
          last_seen: d.lastSeen ? new Date(d.lastSeen) : now,
          os_outdated: osOutdated,
          security_agent_running: true,
          updated_at: now,
          created_at: now,
        });
      }
      const latest = await db('devices')
        .where({ org_id: req.user.orgId, source, external_id: externalId })
        .first();
      if (latest) await evaluateDeviceAlerts(db, { orgId: req.user.orgId, device: latest });
    }
    const agentDevices = await db('devices')
      .whereIn('source', ['agent', 'android', 'extension', 'intune', 'google_admin', 'google_mobile'])
      .andWhere({ org_id: req.user.orgId });

    const agentIds = agentDevices.map((d) => d.id).filter(Boolean);
    if (agentIds.length) {
      const groupJoin = await db('device_groups as dg')
        .join('groups as g', 'g.id', 'dg.group_id')
        .where('g.org_id', req.user.orgId)
        .whereIn('dg.device_id', agentIds)
        .select('dg.device_id', 'g.id as group_id', 'g.name as group_name')
        .orderBy('g.name', 'asc');
      const firstByDevice = new Map();
      for (const row of groupJoin) {
        if (!firstByDevice.has(row.device_id)) firstByDevice.set(row.device_id, row);
      }
      for (const d of agentDevices) {
        const g = firstByDevice.get(d.id);
        if (g) {
          d.group_id = g.group_id;
          d.group_name = g.group_name;
        }
      }
    }

    res.json({ devices: [...integrationDevices, ...agentDevices], errors });
  } catch (err) {
    console.error('Integrations devices error:', err);
    res.status(500).json({ error: 'Failed to list integration devices.' });
  }
});

router.get('/summary', requireAuth, async (req, res) => {
  try {
    const mgr = new IntegrationManager(req.user.orgId);
    const summary = await mgr.getHealthSummary();
    const tests = await mgr.testConnections();
    res.json({ ...summary, connectionTests: tests });
  } catch (err) {
    console.error('Integrations summary error:', err);
    res.status(500).json({ error: 'Failed to load integration summary.' });
  }
});

router.post('/devices/:id/sync', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const schema = z.object({
      source: z.enum(['intune', 'google_admin']).optional(),
    });
    const parsed = schema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0].message });
    }

    let source = parsed.data.source;
    let externalId = id;

    const device = await db('devices')
      .where('org_id', req.user.orgId)
      .where(function inner() {
        this.where('id', id).orWhere('external_id', id);
      })
      .first();

    if (device) {
      if (!source && (device.source === 'intune' || device.source === 'google_admin')) {
        source = device.source;
      }
      externalId = device.external_id || null;
    }

    if (!source) {
      return res.status(400).json({
        error: 'Could not infer integration source. Pass { "source": "intune" | "google_admin" }.',
      });
    }

    if (device && (source === 'intune' || source === 'google_admin') && !device.external_id) {
      return res.status(400).json({ error: 'Device has no external_id for cloud sync.' });
    }

    if (!externalId) {
      externalId = id;
    }

    if (!externalId) {
      return res.status(400).json({ error: 'Missing device id for sync.' });
    }

    const mgr = new IntegrationManager(req.user.orgId);
    const result = await mgr.syncDevice(externalId, source);
    res.json(result);
  } catch (err) {
    console.error('Device sync error:', err);
    const status = err.status || 500;
    res.status(status).json({ error: err.message || 'Sync failed.' });
  }
});

router.post('/devices/:id/reboot', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const schema = z.object({
      source: z.enum(['intune', 'google_admin']).optional(),
    });
    const parsed = schema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0].message });
    }

    let source = parsed.data.source;
    let externalId = id;

    const device = await db('devices')
      .where('org_id', req.user.orgId)
      .where(function inner() {
        this.where('id', id).orWhere('external_id', id);
      })
      .first();

    if (device) {
      if (!source && (device.source === 'intune' || device.source === 'google_admin')) {
        source = device.source;
      }
      externalId = device.external_id || null;
    }

    if (!source) {
      return res.status(400).json({
        error: 'Could not infer integration source. Pass { "source": "intune" } for Intune reboot.',
      });
    }

    if (source !== 'intune') {
      return res.status(400).json({ error: 'Reboot is only supported for Intune-managed devices.' });
    }

    if (device && !device.external_id) {
      return res.status(400).json({ error: 'Device has no external_id for cloud reboot.' });
    }

    if (!externalId) {
      externalId = id;
    }

    if (!externalId) {
      return res.status(400).json({ error: 'Missing device id for reboot.' });
    }

    const mgr = new IntegrationManager(req.user.orgId);
    const result = await mgr.rebootDevice(externalId, source);
    res.json(result);
  } catch (err) {
    console.error('Device reboot error:', err);
    const status = err.status || 500;
    res.status(status).json({ error: err.message || 'Reboot failed.' });
  }
});

router.delete('/intune', requireAuth, requireAdmin, async (req, res) => {
  try {
    await db('org_integrations')
      .where('org_id', req.user.orgId)
      .update({
        intune_enabled: false,
        intune_tenant_id: null,
        intune_client_id: null,
        intune_client_secret_enc: null,
        updated_at: new Date(),
      });
    res.json({ message: 'Intune disconnected.' });
  } catch (err) {
    console.error('Intune disconnect error:', err);
    res.status(500).json({ error: 'Failed to disconnect Intune.' });
  }
});

router.delete('/google', requireAuth, requireAdmin, async (req, res) => {
  try {
    await db('org_integrations')
      .where('org_id', req.user.orgId)
      .update({
        google_enabled: false,
        google_admin_email: null,
        google_customer_id: null,
        google_service_account_enc: null,
        updated_at: new Date(),
      });
    res.json({ message: 'Google Admin disconnected.' });
  } catch (err) {
    console.error('Google disconnect error:', err);
    res.status(500).json({ error: 'Failed to disconnect Google.' });
  }
});

module.exports = router;
