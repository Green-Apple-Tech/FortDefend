const express = require('express');
const { z } = require('zod');
const router = express.Router();
const db = require('../database');
const { requireAuth } = require('../middleware/auth');
const { checkTrialStatus } = require('../middleware/trial');
const { getCapacityWarning } = require('../middleware/planEnforcement');
const { recordAudit } = require('../lib/recordAudit');

const patchDeviceSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  asset_tag: z.union([z.string().max(120), z.null()]).optional(),
  assigned_user: z.union([z.string().max(255), z.null()]).optional(),
});

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

// PATCH /api/devices/:id — update display name, asset tag, or assigned user label
router.patch('/:id', async (req, res, next) => {
  try {
    const device = await db('devices')
      .where({ id: req.params.id, org_id: req.user.orgId })
      .first();
    if (!device) return res.status(404).json({ error: 'Device not found.' });

    const parsed = patchDeviceSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0]?.message || 'Invalid body.' });
    }
    const body = parsed.data;
    if (Object.keys(body).length === 0) {
      return res.status(400).json({ error: 'Provide at least one of: name, asset_tag, assigned_user.' });
    }

    const updates = { updated_at: new Date() };
    const changes = [];
    if (body.name !== undefined) {
      const name = String(body.name).trim();
      if (!name) return res.status(400).json({ error: 'name cannot be empty.' });
      updates.name = name;
      changes.push('name');
    }
    if (body.asset_tag !== undefined) {
      updates.asset_tag = body.asset_tag === null || body.asset_tag === '' ? null : String(body.asset_tag).trim();
      changes.push('asset_tag');
    }
    if (body.assigned_user !== undefined) {
      updates.assigned_user =
        body.assigned_user === null || body.assigned_user === '' ? null : String(body.assigned_user).trim();
      changes.push('assigned_user');
    }

    await db('devices').where({ id: device.id }).update(updates);
    const updated = await db('devices').where({ id: device.id }).first();
    await recordAudit({
      orgId: req.user.orgId,
      userId: req.user.id,
      action: 'device_updated',
      resource: `device:${device.id}`,
      details: { deviceId: device.id, changes },
    });
    res.json({ device: updated });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/devices/:id — remove device
router.delete('/:id', async (req, res, next) => {
  try {
    const device = await db('devices')
      .where({ id: req.params.id, org_id: req.user.orgId })
      .first();
    if (!device) return res.status(404).json({ error: 'Device not found.' });

    await db('devices').where({ id: device.id }).delete();
    res.json({ message: 'Device removed.' });
  } catch (err) { next(err); }
});

module.exports = router;
