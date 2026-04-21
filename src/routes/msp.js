const express = require('express');
const { z } = require('zod');
const jwt = require('jsonwebtoken');

const db = require('../database');
const { requireAuth, requireMsp } = require('../middleware/auth');

const router = express.Router();

async function assertClientAccess(mspOrgId, clientOrgId) {
  const link = await db('msp_clients')
    .where({ msp_org_id: mspOrgId, client_org_id: clientOrgId })
    .whereIn('status', ['active', 'suspended'])
    .first();
  return !!link;
}

router.get('/clients', requireAuth, requireMsp, async (req, res) => {
  try {
    const clients = await db('msp_clients as mc')
      .join('orgs as o', 'o.id', 'mc.client_org_id')
      .where('mc.msp_org_id', req.user.homeOrgId)
      .whereIn('mc.status', ['active', 'suspended'])
      .select('o.id', 'o.name', 'o.plan', 'o.subscription_status', 'o.created_at')
      .orderBy('o.name', 'asc');

    const withStats = await Promise.all(
      clients.map(async (client) => {
        const [devices, alerts, patches] = await Promise.all([
          db('devices').where('org_id', client.id).count('id as count').first(),
          db('alerts').where('org_id', client.id).where('resolved', false).count('id as count').first(),
          db('patch_history').where('org_id', client.id).whereRaw("created_at > now() - interval '30 days'").count('id as count').first(),
        ]);
        const devicesCount = parseInt(devices?.count || 0, 10);
        const alertsCount = parseInt(alerts?.count || 0, 10);
        const securityScore = devicesCount > 0 ? Math.max(0, 100 - alertsCount * 5) : null;
        return {
          ...client,
          devices: devicesCount,
          activeAlerts: alertsCount,
          patches30d: parseInt(patches?.count || 0, 10),
          securityScore,
        };
      })
    );

    res.json({ clients: withStats });
  } catch (err) {
    console.error('MSP list clients error:', err);
    res.status(500).json({ error: 'Failed to load MSP clients.' });
  }
});

router.post('/clients', requireAuth, requireMsp, async (req, res) => {
  try {
    const parsed = z.object({ name: z.string().min(1).max(120) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });

    const created = await db.transaction(async (trx) => {
      const [org] = await trx('orgs')
        .insert({
          id: db.raw('gen_random_uuid()'),
          name: parsed.data.name.trim(),
          msp_org_id: req.user.homeOrgId,
          org_type: 'client',
          type: 'business',
          plan: null,
          device_limit: 1000,
        })
        .returning('*');

      await trx('msp_clients').insert({
        id: db.raw('gen_random_uuid()'),
        msp_org_id: req.user.homeOrgId,
        client_org_id: org.id,
      });
      await trx('org_integrations').insert({ org_id: org.id });
      return org;
    });

    res.status(201).json({ client: { id: created.id, name: created.name } });
  } catch (err) {
    console.error('MSP create client error:', err);
    res.status(500).json({ error: 'Failed to create client org.' });
  }
});

router.delete('/clients/:clientOrgId', requireAuth, requireMsp, async (req, res) => {
  try {
    const ok = await assertClientAccess(req.user.homeOrgId, req.params.clientOrgId);
    if (!ok) return res.status(404).json({ error: 'Client not found.' });
    await db('msp_clients')
      .where({ msp_org_id: req.user.homeOrgId, client_org_id: req.params.clientOrgId })
      .delete();
    res.json({ message: 'Client removed.' });
  } catch (err) {
    console.error('MSP remove client error:', err);
    res.status(500).json({ error: 'Failed to remove client.' });
  }
});

router.get('/clients/:clientOrgId/dashboard', requireAuth, requireMsp, async (req, res) => {
  try {
    const { clientOrgId } = req.params;
    const ok = await assertClientAccess(req.user.homeOrgId, clientOrgId);
    if (!ok) return res.status(404).json({ error: 'Client not found.' });

    const [devices, alerts, patches] = await Promise.all([
      db('devices').where('org_id', clientOrgId).count('id as count').first(),
      db('alerts').where('org_id', clientOrgId).where('resolved', false).count('id as count').first(),
      db('patch_history').where('org_id', clientOrgId).whereRaw("created_at > now() - interval '24 hours'").count('id as count').first(),
    ]);

    res.json({
      devicesOnline: parseInt(devices?.count || 0, 10),
      activeThreats: parseInt(alerts?.count || 0, 10),
      patchesToday: parseInt(patches?.count || 0, 10),
      securityScore: null,
    });
  } catch (err) {
    console.error('MSP client dashboard error:', err);
    res.status(500).json({ error: 'Failed to load client dashboard.' });
  }
});

router.get('/clients/:clientOrgId/devices', requireAuth, requireMsp, async (req, res) => {
  try {
    const { clientOrgId } = req.params;
    const ok = await assertClientAccess(req.user.homeOrgId, clientOrgId);
    if (!ok) return res.status(404).json({ error: 'Client not found.' });
    const devices = await db('devices')
      .where('org_id', clientOrgId)
      .select('id', 'name', 'os', 'last_seen', 'compliance_state', 'security_score', 'status')
      .orderBy('updated_at', 'desc')
      .limit(200);
    res.json({ devices });
  } catch (err) {
    console.error('MSP client devices error:', err);
    res.status(500).json({ error: 'Failed to load client devices.' });
  }
});

router.post('/switch/:clientOrgId', requireAuth, requireMsp, async (req, res) => {
  try {
    const { clientOrgId } = req.params;
    const ok = await assertClientAccess(req.user.homeOrgId, clientOrgId);
    if (!ok) return res.status(404).json({ error: 'Client not found.' });

    const accessToken = jwt.sign(
      {
        userId: req.user.id,
        orgId: clientOrgId,
        role: req.user.role,
        email: req.user.email,
        mspClientOrgId: clientOrgId,
      },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    );
    res.json({ accessToken, activeClientOrgId: clientOrgId });
  } catch (err) {
    console.error('MSP switch context error:', err);
    res.status(500).json({ error: 'Failed to switch context.' });
  }
});

router.get('/overview', requireAuth, requireMsp, async (req, res) => {
  try {
    const clientRows = await db('msp_clients')
      .where('msp_org_id', req.user.homeOrgId)
      .whereIn('status', ['active', 'suspended'])
      .select('client_org_id');
    const orgIds = clientRows.map((r) => r.client_org_id);
    if (!orgIds.length) {
      return res.json({ clients: 0, totalDevices: 0, totalAlerts: 0, patchesToday: 0 });
    }

    const [devices, alerts, patches] = await Promise.all([
      db('devices').whereIn('org_id', orgIds).count('id as count').first(),
      db('alerts').whereIn('org_id', orgIds).where('resolved', false).count('id as count').first(),
      db('patch_history').whereIn('org_id', orgIds).whereRaw("created_at > now() - interval '24 hours'").count('id as count').first(),
    ]);

    res.json({
      clients: orgIds.length,
      totalDevices: parseInt(devices?.count || 0, 10),
      totalAlerts: parseInt(alerts?.count || 0, 10),
      patchesToday: parseInt(patches?.count || 0, 10),
    });
  } catch (err) {
    console.error('MSP overview error:', err);
    res.status(500).json({ error: 'Failed to load MSP overview.' });
  }
});

module.exports = router;
