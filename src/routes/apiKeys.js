const express = require('express');

const db = require('../database');
const { encrypt, decrypt } = require('../lib/crypto');
const { buildApiKey } = require('../utils/apiKeys');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

async function getOrCreatePrimaryKey(orgId) {
  const existing = await db('api_keys')
    .where({ org_id: orgId, active: true })
    .orderBy('created_at', 'desc')
    .first();

  if (existing?.key_secret_enc) {
    return {
      id: existing.id,
      apiKey: decrypt(existing.key_secret_enc),
      keyPrefix: existing.key_prefix,
      createdAt: existing.created_at,
    };
  }

  const next = buildApiKey();
  const [created] = await db('api_keys')
    .insert({
      org_id: orgId,
      name: 'Primary API Key',
      key_hash: next.keyHash,
      key_prefix: next.keyPrefix,
      key_secret_enc: encrypt(next.rawKey),
      active: true,
    })
    .returning(['id', 'created_at']);

  return {
    id: created.id,
    apiKey: next.rawKey,
    keyPrefix: next.keyPrefix,
    createdAt: created.created_at,
  };
}

router.get('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const key = await getOrCreatePrimaryKey(req.user.orgId);
    res.json(key);
  } catch (err) {
    console.error('Get org API key error:', err);
    res.status(500).json({ error: 'Failed to load API key.' });
  }
});

router.post('/regenerate', requireAuth, requireAdmin, async (req, res) => {
  try {
    await db('api_keys').where({ org_id: req.user.orgId, active: true }).update({ active: false });
    const key = await getOrCreatePrimaryKey(req.user.orgId);
    res.json({ message: 'API key regenerated.', ...key });
  } catch (err) {
    console.error('Regenerate org API key error:', err);
    res.status(500).json({ error: 'Failed to regenerate API key.' });
  }
});

module.exports = router;
