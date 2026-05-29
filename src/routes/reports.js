const express = require('express');
const router = express.Router();

const db = require('../database');
const { requireAuth } = require('../middleware/auth');

router.get('/dashboard', requireAuth, async (req, res) => {
  try {
    const orgId = req.user.orgId;
    const [deviceCount, activeAlerts, patchesToday] = await Promise.all([
      db('devices').where('org_id', orgId).count('id as count').first(),
      db('alerts').where('org_id', orgId).where('resolved', false).count('id as count').first(),
      db('patch_history').where('org_id', orgId).whereRaw("created_at > now() - interval '24 hours'").count('id as count').first(),
    ]);

    res.json({
      devicesOnline: parseInt(deviceCount?.count || 0, 10),
      activeThreats: parseInt(activeAlerts?.count || 0, 10),
      patchesToday: parseInt(patchesToday?.count || 0, 10),
      securityScore: null,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load dashboard' });
  }
});

module.exports = router;
