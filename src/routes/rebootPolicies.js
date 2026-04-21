const express = require('express');
const { z } = require('zod');

const db = require('../database');
const { requireAuth, requireAdmin } = require('../middleware/middleware');

const router = express.Router();

const schema = z.object({
  name: z.string().min(1).max(120),
  policy_type: z.enum(['forced', 'deferred', 'scheduled', 'notify-only']),
  schedule: z.string().optional().nullable(),
  defer_max_days: z.number().int().min(0).optional().nullable(),
  defer_max_times: z.number().int().min(0).optional().nullable(),
  notify_before_minutes: z.number().int().min(0).optional().nullable(),
  notify_message: z.string().max(1000).optional().nullable(),
  active_hours_start: z.string().optional().nullable(),
  active_hours_end: z.string().optional().nullable(),
  exclude_weekends: z.boolean().optional(),
  target_devices: z.any().optional().nullable(),
});

router.get('/', requireAuth, async (req, res) => {
  try {
    const rows = await db('reboot_policies').where('org_id', req.user.orgId).orderBy('updated_at', 'desc');
    res.json({ policies: rows });
  } catch (err) {
    console.error('List reboot policies error:', err);
    res.status(500).json({ error: 'Failed to load reboot policies.' });
  }
});

router.post('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });
    const [created] = await db('reboot_policies')
      .insert({ ...parsed.data, org_id: req.user.orgId, updated_at: new Date() })
      .returning('*');
    res.status(201).json({ policy: created });
  } catch (err) {
    console.error('Create reboot policy error:', err);
    res.status(500).json({ error: 'Failed to create reboot policy.' });
  }
});

router.patch('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const parsed = schema.partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });
    const [updated] = await db('reboot_policies')
      .where({ id: req.params.id, org_id: req.user.orgId })
      .update({ ...parsed.data, updated_at: new Date() })
      .returning('*');
    if (!updated) return res.status(404).json({ error: 'Policy not found.' });
    res.json({ policy: updated });
  } catch (err) {
    console.error('Update reboot policy error:', err);
    res.status(500).json({ error: 'Failed to update reboot policy.' });
  }
});

router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const n = await db('reboot_policies').where({ id: req.params.id, org_id: req.user.orgId }).delete();
    if (!n) return res.status(404).json({ error: 'Policy not found.' });
    res.json({ message: 'Policy deleted.' });
  } catch (err) {
    console.error('Delete reboot policy error:', err);
    res.status(500).json({ error: 'Failed to delete reboot policy.' });
  }
});

router.post('/:id/apply', requireAuth, requireAdmin, async (req, res) => {
  try {
    const policy = await db('reboot_policies').where({ id: req.params.id, org_id: req.user.orgId }).first();
    if (!policy) return res.status(404).json({ error: 'Policy not found.' });
    const devices = await db('devices').where('org_id', req.user.orgId).select('id');
    await Promise.all(
      devices.map((d) =>
        db('agent_logs').insert({
          id: db.raw('gen_random_uuid()'),
          org_id: req.user.orgId,
          device_id: d.id,
          agent_name: 'Reboot Scheduler',
          action: 'reboot_policy_applied',
          result: { policyId: policy.id, policyType: policy.policy_type, appliedAt: new Date().toISOString() },
        })
      )
    );
    res.json({ message: 'Policy applied to devices.', count: devices.length });
  } catch (err) {
    console.error('Apply reboot policy error:', err);
    res.status(500).json({ error: 'Failed to apply reboot policy.' });
  }
});

router.get('/pending', requireAuth, async (req, res) => {
  try {
    const rows = await db('agent_logs')
      .where('org_id', req.user.orgId)
      .whereIn('action', ['reboot_deferred', 'reboot_force_queued'])
      .orderBy('created_at', 'desc')
      .limit(200);
    res.json({ pending: rows });
  } catch (err) {
    console.error('Pending reboot list error:', err);
    res.status(500).json({ error: 'Failed to load pending reboots.' });
  }
});

module.exports = router;
