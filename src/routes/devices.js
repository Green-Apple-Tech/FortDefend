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
      .where({ org_id: req.user.orgId, resolved: false })
      .orderBy('created_at', 'desc')
      .limit(20);

    res.json({ device, scanResults, alerts });
  } catch (err) { next(err); }
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
