const crypto = require('crypto');
const db = require('../database');

async function apiKeyAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    const apiKey = authHeader?.startsWith('Bearer fd_') 
      ? authHeader.split(' ')[1]
      : req.headers['x-api-key'];

    if (!apiKey || !apiKey.startsWith('fd_')) {
      return res.status(401).json({ error: 'Valid API key required. Use Authorization: Bearer fd_... or X-API-Key header.' });
    }

    const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');
    const key = await db('api_keys')
      .where('key_hash', keyHash)
      .where('active', true)
      .first();

    if (!key) return res.status(401).json({ error: 'Invalid or revoked API key.' });
    if (key.expires_at && new Date(key.expires_at) < new Date()) {
      return res.status(401).json({ error: 'API key expired.' });
    }

    await db('api_keys').where('id', key.id).update({ last_used_at: new Date() });

    const org = await db('orgs').where('id', key.org_id).first();
    if (!org) return res.status(401).json({ error: 'Organization not found.' });

    req.org = org;
    req.apiKey = key;
    next();
  } catch (err) {
    console.error('API key auth error:', err);
    res.status(500).json({ error: 'Authentication error.' });
  }
}

module.exports = { apiKeyAuth };
