const express = require('express');
const router = express.Router();
const db = require('../../database');
const { apiKeyAuth } = require('../../middleware/apiKeyAuth');

// GET /api/v1/devices — list all devices for org
router.get('/', apiKeyAuth, async (req, res) => {
  try {
    const { status, limit = 100, offset = 0 } = req.query;
    let query = db('devices')
      .where('org_id', req.org.id)
      .select('id', 'name', 'serial', 'os', 'os_version', 'status',
              'last_seen', 'compliance_statu
