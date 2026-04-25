const express = require('express');
const router = express.Router();
const db = require('../database');
const { requireAuth } = require('../middleware/auth');
const { checkTrialStatus } = require('../middleware/trial');
const { getCapacityWarning } = require('../middleware/planEnforcement');

router.use(requireAuth, checkTrialStatus);

// GET /api/devices — list all devices for org
router.get('/', async (req, res, next) => {
  try {
    const { platform, status, search } = req.query;
    let query = db('devices').where({ org_id: req.user.orgId });

    if (platform) query = query.where({ os: platform });
    if (status) query = query.where({ status });
    if (search) query = query.where('name', 'ilike', `%${search}%`);

    const devices = await query.orderBy('security_score', 'asc');
    const capacityWarning = await getCapacityWarning(req.user.orgId);

    res.json({ devices, capacityWarning });
  } catch (err) { next(err); }
});

// GET /api/devices/summary — fleet summary across all platforms
router.get('/summary', async (req, res, next) => {
  try {
    const devices = await db('devices').where({ org_id: req.user.orgId });
    const now = new Date();

    const summary = {
      total: devices.length,
      byPlatform: {
        chromebook: devices.filter(d => d.os === 'chromeos').length,
        android: devices.filter(d => d.os === 'android').length,
        windows: devices.filter(d => d.os === 'windows').length,
      },
      byStatus: {
        online: devices.filter(d => d.status === 'online').length,
        warning: devices.filter(d => d.status === 'warning').length,
        alert: devices.filter(d => d.status === 'alert').length,
        offline: devices.filter(d => d.status === 'offline').length,
      },
      stale: devices.filter(d => {
        if (!d.last_seen) return true;
        const days = Math.floor((now - new Date(d.last_seen)) / 86400000);
        return days > 7;
      }).length,
      fleetScore: devices.length > 0
        ? Math.round(devices.reduce((s, d) => s + (d.security_score || 100), 0) / devices.length)
        : 100,
      compliant: devices.filter(d => (d.security_score || 100) >= 80).length,
      atRisk: devices.filter(d => (d.security_score || 100) < 80 && (d.security_score || 100) >= 60).length,
      critical: devices.filter(d => (d.security_score || 100) < 60).length,
    };

    res.json(summary);
  } catch (err) { next(err); }
});

// GET /api/devices/ungrouped — devices not assigned to any group
router.get('/ungrouped', async (req, res, next) => {
  try {
    const devices = await db('devices as d')
      .leftJoin('device_groups as dg', 'd.id', 'dg.device_id')
      .where('d.org_id', req.user.orgId)
      .whereNull('dg.group_id')
      .select('d.*')
      .orderBy('d.name', 'asc');
    res.json({ devices });
  } catch (err) {
    next(err);
  }
});

// GET /api/devices/:id/apps — installed apps inventory (sm_device_apps)
router.get('/:id/apps', async (req, res, next) => {
  try {
    const device = await db('devices')
      .where({ id: req.params.id, org_id: req.user.orgId })
      .first();
    if (!device) return res.status(404).json({ error: 'Device not found.' });

    const hasTable = await db.schema.hasTable('sm_device_apps');
    if (!hasTable) {
      return res.json({ applications: [], total: 0 });
    }

    const applications = await db('sm_device_apps')
      .where({ org_id: req.user.orgId, device_id: device.id })
      .select(
        'app_name',
        'winget_id',
        'installed_version',
        'latest_version',
        'update_available',
        'last_scanned_at',
        'created_at',
        'updated_at',
      )
      .orderBy('app_name', 'asc');

    res.json({ applications, total: applications.length });
  } catch (err) {
    next(err);
  }
});

// GET /api/devices/:id/script-history — run_script command rows for this device
router.get('/:id/script-history', async (req, res, next) => {
  try {
    const device = await db('devices')
      .where({ id: req.params.id, org_id: req.user.orgId })
      .first();
    if (!device) return res.status(404).json({ error: 'Device not found.' });

    const history = await db('sm_commands')
      .where({ org_id: req.user.orgId, device_id: device.id })
      .whereIn('command_type', ['run_script'])
      .orderBy('created_at', 'desc')
      .limit(100)
      .select('id', 'status', 'command_payload', 'output', 'error_message', 'created_at', 'updated_at', 'completed_at');

    res.json({ history });
  } catch (err) {
    next(err);
  }
});

// GET /api/devices/:id/command-results — near-live command outputs
router.get('/:id/command-results', async (req, res, next) => {
  try {
    const device = await db('devices')
      .where({ id: req.params.id, org_id: req.user.orgId })
      .first();
    if (!device) return res.status(404).json({ error: 'Device not found.' });

    const limit = Math.max(1, Math.min(200, Number(req.query.limit || 50)));
    let q = db('command_results')
      .where({ org_id: req.user.orgId, device_id: device.id })
      .orderBy('created_at', 'desc')
      .limit(limit);
    if (req.query.commandType) q = q.andWhere('command_type', String(req.query.commandType));
    if (req.query.commandId) q = q.andWhere('command_id', String(req.query.commandId));
    const results = await q.select('*');
    res.json({ results });
  } catch (err) {
    next(err);
  }
});

// GET /api/devices/:id — single device detail
router.get('/:id', async (req, res, next) => {
  try {
    const device = await db('devices')
      .where({ id: req.params.id, org_id: req.user.orgId })
      .first();
    if (!device) return res.status(404).json({ error: 'Device not found.' });

    const scanResults = await db('scan_results')
      .where({ device_id: device.id })
      .orderBy('created_at', 'desc')
      .limit(10);

    const alerts = await db('alerts')
      .where({ org_id: req.user.orgId, device_id: device.id, resolved: false })
      .orderBy('created_at', 'desc')
      .limit(50);

    res.json({ device, scanResults, alerts });
  } catch (err) { next(err); }
});

// PATCH /api/devices/:id — update device display name
router.patch('/:id', async (req, res, next) => {
  try {
    const device = await db('devices')
      .where({ id: req.params.id, org_id: req.user.orgId })
      .first();
    if (!device) return res.status(404).json({ error: 'Device not found.' });

    if (req.body?.name == null) {
      return res.status(400).json({ error: 'name is required.' });
    }
    const name = String(req.body.name).trim();
    if (!name) return res.status(400).json({ error: 'name cannot be empty.' });

    await db('devices').where({ id: device.id }).update({ name, updated_at: new Date() });
    const updated = await db('devices').where({ id: device.id }).first();
    res.json({ device: updated });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/devices/:id — remove device
router.delete('/:id', async (req, res, next) => {
  try {
    const rawId = String(req.params.id || '').trim();
    console.log('[devices/delete] called', { orgId: req.user.orgId, id: rawId });
    const device = await db('devices')
      .where({ org_id: req.user.orgId })
      .andWhere((q) => q.where('id', rawId).orWhere('external_id', rawId))
      .first();
    if (!device) return res.status(404).json({ error: 'Device not found.' });
    await db.transaction(async (trx) => {
      if (await trx.schema.hasTable('command_results')) {
        await trx('command_results')
          .where({ org_id: req.user.orgId, device_id: device.id })
          .delete();
      }
      if (await trx.schema.hasTable('sm_commands')) {
        await trx('sm_commands')
          .where({ org_id: req.user.orgId, device_id: device.id })
          .delete();
      }
      if (await trx.schema.hasTable('scan_results')) {
        await trx('scan_results')
          .where({ org_id: req.user.orgId, device_id: device.id })
          .delete();
      }
      if (await trx.schema.hasTable('alerts')) {
        await trx('alerts')
          .where({ org_id: req.user.orgId, device_id: device.id })
          .delete();
      }
      if (await trx.schema.hasTable('agent_logs')) {
        await trx('agent_logs')
          .where({ org_id: req.user.orgId, device_id: device.id })
          .delete();
      }
      if (await trx.schema.hasTable('sm_device_apps')) {
        await trx('sm_device_apps')
          .where({ org_id: req.user.orgId, device_id: device.id })
          .delete();
      }
      await trx('device_groups')
        .where({ device_id: device.id })
        .delete();
      const deleted = await trx('devices')
        .where({ id: device.id, org_id: req.user.orgId })
        .delete();
      console.log('[devices/delete] devices rows deleted', { orgId: req.user.orgId, id: device.id, deleted });
    });
    res.json({ success: true });
  } catch (err) { next(err); }
});

module.exports = router;
