const express = require('express');
const router = express.Router();
const db = require('../../database');
const { apiKeyAuth } = require('../../middleware/apiKeyAuth');

router.get('/', apiKeyAuth, async (req, res) => {
  try {
    const { status, limit = 100, offset = 0 } = req.query;
    let query = db('devices')
      .where('org_id', req.org.id)
      .select('id', 'name', 'serial', 'os', 'os_version', 'status',
              'last_seen', 'compliance_status', 'security_score',
              'disk_free_gb', 'disk_total_gb', 'ram_total_gb', 'created_at')
      .limit(Math.min(parseInt(limit), 500))
      .offset(parseInt(offset))
      .orderBy('last_seen', 'desc');

    if (status) query = query.where('status', status);

    const devices = await query;
    const total = await db('devices').where('org_id', req.org.id).count('id as count').first();

    res.json({
      data: devices,
      meta: { total: parseInt(total.count), limit: parseInt(limit), offset: parseInt(offset) }
    });
  } catch (err) {
    console.error('V1 devices error:', err);
    res.status(500).json({ error: 'Failed to fetch devices.' });
  }
});

router.get('/:id', apiKeyAuth, async (req, res) => {
  try {
    const device = await db('devices')
      .where('id', req.params.id)
      .where('org_id', req.org.id)
      .first();
    if (!device) return res.status(404).json({ error: 'Device not found.' });
    res.json({ data: device });
  } catch (err) {
    console.error('V1 device error:', err);
    res.status(500).json({ error: 'Failed to fetch device.' });
  }
});

module.exports = router;
