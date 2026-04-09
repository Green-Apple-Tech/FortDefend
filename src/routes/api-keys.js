const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { z } = require('zod');
const db = require('../database');
const { requireAuth, requireAdmin } = require('../middleware/middleware');

router.get('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const keys = await db('api_keys')
      .where('org_id', req.user.orgId)
      .select('id', 'name', 'key_prefix', 'last_used_at', 'expires_at', 'active', 'created_at')
      .orderBy('created_at', 'desc');
    res.json({ keys });
  } catch (err) {
    console.error('List API keys error:', err);
    res.status(500).json({ error: 'Failed to load API keys.' });
  }
});

router.post('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const schema = z.object({
      name: z.string().min(1).max(100),
      expiresInDays: z.number().int().min(1).max(365).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0].message });
    }
    const rawKey = 'fd_' + crypto.randomBytes(32).toString('hex');
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
    const keyPrefix = rawKey.substring(0, 8);
    const expiresAt = parsed.data.expiresInDays
      ? new Date(Date.now() + parsed.data.expiresInDays * 24 * 60 * 60 * 1000)
      : null;
    await db('api_keys').insert({
      org_id: req.user.orgId,
      name: parsed.data.name,
      key_hash: keyHash,
      key_prefix: keyPrefix,
      expires_at: expiresAt,
    });
    res.status(201).json({
      message: 'API key created. Copy it now — it will not be shown again.',
      apiKey: rawKey,
      prefix: keyPrefix,
    });
  } catch (err) {
    console.error('Create API key error:', err);
    res.status(500).json({ error: 'Failed to create API key.' });
  }
});

router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const key = await db('api_keys')
      .where('id', req.params.id)
      .where('org_id', req.user.orgId)
      .first();
    if (!key) return res.status(404).json({ error: 'API key not found.' });
    await db('api_keys').where('id', req.params.id).update({ active: false });
    res.json({ message: 'API key revoked.' });
  } catch (err) {
    console.error('Revoke API key error:', err);
    res.status(500).json({ error: 'Failed to revoke API key.' });
  }
});

module.exports = router;
