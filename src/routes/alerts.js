const express = require('express');
const db = require('../database');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    const { severity, resolved, type, limit = 200, offset = 0 } = req.query;
    let query = db('alerts as a')
      .leftJoin('devices as d', 'd.id', 'a.device_id')
      .where('a.org_id', req.user.orgId)
      .select(
        'a.id',
        'a.device_id',
        'd.name as device_name',
        'a.type',
        'a.severity',
        'a.message',
        'a.ai_analysis',
        'a.resolved',
        'a.created_at',
        'a.resolved_at'
      )
      .orderBy('a.created_at', 'desc')
      .limit(Math.min(Number(limit) || 200, 500))
      .offset(Number(offset) || 0);

    if (severity) query = query.andWhere('a.severity', String(severity));
    if (type) query = query.andWhere('a.type', String(type));
    if (resolved !== undefined && resolved !== '') {
      query = query.andWhere('a.resolved', String(resolved) === 'true');
    }

    const alerts = await query;
    const totalRow = await db('alerts').where('org_id', req.user.orgId).count('id as count').first();
    const typesRaw = await db('alerts')
      .where('org_id', req.user.orgId)
      .distinct('type')
      .orderBy('type', 'asc');
    res.json({
      alerts,
      meta: {
        total: Number(totalRow?.count || 0),
        limit: Number(limit) || 200,
        offset: Number(offset) || 0,
      },
      types: typesRaw.map((r) => r.type).filter(Boolean),
    });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/resolve', async (req, res, next) => {
  try {
    const changed = await db('alerts')
      .where({ id: req.params.id, org_id: req.user.orgId })
      .update({
        resolved: true,
        resolved_at: new Date(),
      });
    if (!changed) return res.status(404).json({ error: 'Alert not found.' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
