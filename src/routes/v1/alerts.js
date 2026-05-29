const express = require('express');
const router = express.Router();
const db = require('../../database');
const { apiKeyAuth } = require('../../middleware/apiKeyAuth');

// GET /api/v1/alerts — list alerts for org
router.get('/', apiKeyAuth, async (req, res) => {
  try {
    const { severity, resolved, limit = 100, offset = 0 } = req.query;
    let query = db('alerts')
      .where('org_id', req.org.id)
      .select('id', 'device_id', 'type', 'severity', 'message', 'resolved', 'created_at', 'resolved_at')
      .limit(Math.min(parseInt(limit), 500))
      .offset(parseInt(offset))
      .orderBy('created_at', 'desc');

    if (severity) query = query.where('severity', severity);
    if (resolved !== undefined) query = query.where('resolved', resolved === 'true');

    const alerts = await query;
    const total = await db('alerts').where('org_id', req.org.id).count('id as count').first();

    res.json({
      data: alerts,
      meta: { total: parseInt(total.count), limit: parseInt(limit), offset: parseInt(offset) }
    });
  } catch (err) {
    console.error('V1 alerts error:', err);
    res.status(500).json({ error: 'Failed to fetch alerts.' });
  }
});

module.exports = router;
