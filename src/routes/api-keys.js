const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { z } = require('zod');
const db = require('../database');
const { requireAuth, requireAdmin } = require('../middleware/middleware');

// GET /api/api-keys — list all API keys for org
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

// POST /api/api-keys — generate a new API key
router.post('/', requireAuth, requireAdmin, async (req
