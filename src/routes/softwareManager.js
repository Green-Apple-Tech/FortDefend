const express = require('express');
const db = require('../database');
const fcm = require('../utils/fcm');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth);

function toLimit(value, fallback = 50, max = 200) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

function normalizeCommandType(value) {
  if (!value) return '';
  return String(value).toLowerCase();
}

function isValidCommandType(value) {
  return ['install', 'update', 'uninstall', 'update_all'].includes(normalizeCommandType(value));
}

function wingetScanStatus(lastScannedAt) {
  if (!lastScannedAt) return 'never';
  const ageMs = Date.now() - new Date(lastScannedAt).getTime();
  if (!Number.isFinite(ageMs) || ageMs < 0) return 'unknown';
  if (ageMs <= 15 * 60 * 1000) return 'ok';
  if (ageMs <= 60 * 60 * 1000) return 'stale';
  return 'old';
}

// GET /api/software/apps
router.get('/apps', async (req, res, next) => {
  try {
    const apps = await db('sm_apps')
      .where('org_id', req.user.orgId)
      .select('id', 'name', 'publisher', 'category', 'winget_id', 'icon_url', 'is_featured')
      .orderBy('is_featured', 'desc')
      .orderBy('name', 'asc');

    res.json({ apps });
  } catch (err) {
    next(err);
  }
});

// POST /api/software/apps (admin only)
router.post('/apps', requireAdmin, async (req, res, next) => {
  try {
    const { name, publisher, category, winget_id: wingetId, icon_url: iconUrl, is_featured: isFeatured } = req.body || {};

    if (!name || !wingetId) {
      return res.status(400).json({ error: 'name and winget_id are required.' });
    }

    const payload = {
      org_id: req.user.orgId,
      name: String(name).trim(),
      publisher: publisher ? String(publisher).trim() : null,
      category: category ? String(category).trim() : 'Utilities',
      winget_id: String(wingetId).trim(),
      icon_url: iconUrl ? String(iconUrl).trim() : null,
      is_featured: Boolean(isFeatured),
      created_at: new Date(),
      updated_at: new Date(),
    };

    const [app] = await db('sm_apps')
      .insert(payload)
      .returning(['id', 'name', 'publisher', 'category', 'winget_id', 'icon_url', 'is_featured']);

    res.status(201).json({ app });
  } catch (err) {
    if (err && err.code === '23505') {
      return res.status(409).json({ error: 'That winget_id already exists in your catalogue.' });
    }
    next(err);
  }
});

// GET /api/software/matrix
router.get('/matrix', async (req, res, next) => {
  try {
    const [devicesRaw, apps, scanAgg] = await Promise.all([
      db('devices')
        .where('org_id', req.user.orgId)
        .select('id', 'name', 'status', 'last_seen')
        .orderBy('name', 'asc'),
      db('sm_apps')
        .where('org_id', req.user.orgId)
        .select('id', 'name', 'winget_id', 'category', 'publisher')
        .orderBy('name', 'asc'),
      db('sm_device_apps')
        .where('org_id', req.user.orgId)
        .groupBy('device_id')
        .select('device_id')
        .max('last_scanned_at as last_scanned_at'),
    ]);
    const scanByDevice = new Map(scanAgg.map((r) => [r.device_id, r.last_scanned_at || null]));
    const devices = devicesRaw.map((d) => {
      const lastWingetScanAt = scanByDevice.get(d.id) || null;
      return {
        ...d,
        last_winget_scan_at: lastWingetScanAt,
        winget_scan_status: wingetScanStatus(lastWingetScanAt),
      };
    });
    // Fuzzy join: winget_id (trim/case-insensitive), explicit catalogue link, or bidirectional name LIKE.
    // DISTINCT ON prefers exact winget / catalogue matches, then name containment, then recency.
    const { rows: matchedRows } = await db.raw(
      `
      SELECT DISTINCT ON (sda.device_id, sa.winget_id)
        sda.device_id,
        sa.winget_id AS matched_winget_id,
        sda.installed_version,
        sda.latest_version,
        sda.update_available,
        sda.last_scanned_at
      FROM sm_device_apps sda
      INNER JOIN sm_apps sa ON sa.org_id = sda.org_id
        AND (
          (sda.catalogue_app_id IS NOT NULL AND sda.catalogue_app_id = sa.id)
          OR (
            NULLIF(TRIM(sda.winget_id), '') IS NOT NULL
            AND NULLIF(TRIM(sa.winget_id), '') IS NOT NULL
            AND LOWER(TRIM(sda.winget_id)) = LOWER(TRIM(sa.winget_id))
          )
          OR LOWER(TRIM(COALESCE(sda.app_name, ''))) LIKE '%' || LOWER(TRIM(sa.name)) || '%'
          OR LOWER(TRIM(COALESCE(sa.name, ''))) LIKE '%' || LOWER(TRIM(sda.app_name)) || '%'
        )
      WHERE sda.org_id = ?
      ORDER BY
        sda.device_id,
        sa.winget_id,
        (CASE
          WHEN sda.catalogue_app_id IS NOT NULL AND sda.catalogue_app_id = sa.id THEN 0
          WHEN NULLIF(TRIM(sda.winget_id), '') IS NOT NULL
            AND NULLIF(TRIM(sa.winget_id), '') IS NOT NULL
            AND LOWER(TRIM(sda.winget_id)) = LOWER(TRIM(sa.winget_id)) THEN 1
          WHEN LOWER(TRIM(COALESCE(sda.app_name, ''))) = LOWER(TRIM(COALESCE(sa.name, ''))) THEN 2
          WHEN LOWER(TRIM(COALESCE(sda.app_name, ''))) LIKE '%' || LOWER(TRIM(sa.name)) || '%'
            OR LOWER(TRIM(COALESCE(sa.name, ''))) LIKE '%' || LOWER(TRIM(sda.app_name)) || '%' THEN 3
          ELSE 4
        END),
        sda.last_scanned_at DESC NULLS LAST
      `,
      [req.user.orgId],
    );

    const deduped = new Map();
    for (const row of matchedRows) {
      const matchedWingetId = row.matched_winget_id ? String(row.matched_winget_id).trim() : '';
      if (!matchedWingetId) continue;
      const key = `${row.device_id}::${matchedWingetId}`;
      if (!deduped.has(key)) {
        deduped.set(key, {
          device_id: row.device_id,
          winget_id: matchedWingetId,
          installed_version: row.installed_version,
          latest_version: row.latest_version,
          update_available: row.update_available,
          last_scanned_at: row.last_scanned_at,
        });
      }
    }
    const installations = Array.from(deduped.values());

    res.json({
      devices,
      apps,
      installations,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/software/devices/:id/winget-status
router.get('/devices/:id/winget-status', async (req, res, next) => {
  try {
    const device = await db('devices')
      .where({ id: req.params.id, org_id: req.user.orgId })
      .first();
    if (!device) return res.status(404).json({ error: 'Device not found.' });
    const agg = await db('sm_device_apps')
      .where({ org_id: req.user.orgId, device_id: req.params.id })
      .max('last_scanned_at as last_scanned_at')
      .first();
    const lastScannedAt = agg?.last_scanned_at || null;
    res.json({
      deviceId: req.params.id,
      lastScannedAt,
      status: wingetScanStatus(lastScannedAt),
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/software/commands
router.post('/commands', async (req, res, next) => {
  try {
    const { deviceIds, wingetId, commandType } = req.body || {};
    const normalizedType = normalizeCommandType(commandType);

    if (!Array.isArray(deviceIds) || deviceIds.length === 0) {
      return res.status(400).json({ error: 'deviceIds must be a non-empty array.' });
    }
    if (!isValidCommandType(normalizedType)) {
      return res.status(400).json({ error: 'commandType must be one of install, update, uninstall, update_all.' });
    }
    if (!wingetId || typeof wingetId !== 'string') {
      return res.status(400).json({ error: 'wingetId is required.' });
    }

    const uniqueDeviceIds = [...new Set(deviceIds.map((id) => String(id).trim()).filter(Boolean))];
    if (uniqueDeviceIds.length === 0) {
      return res.status(400).json({ error: 'No valid deviceIds supplied.' });
    }

    const orgDevices = await db('devices')
      .where('org_id', req.user.orgId)
      .whereIn('id', uniqueDeviceIds)
      .select('id');

    if (orgDevices.length === 0) {
      return res.status(400).json({ error: 'No valid devices found in your organization.' });
    }

    const rows = orgDevices.map((device) => ({
      org_id: req.user.orgId,
      device_id: device.id,
      winget_id: String(wingetId).trim(),
      command_type: normalizedType,
      status: 'pending',
      initiated_by: req.user.id,
      created_at: new Date(),
      updated_at: new Date(),
    }));

    const inserted = await db('sm_commands')
      .insert(rows)
      .returning(['id', 'device_id', 'org_id', 'winget_id', 'command_type', 'created_at']);

    const insertedDeviceIds = [...new Set(inserted.map((r) => r.device_id))];
    const devices = await db('devices')
      .whereIn('id', insertedDeviceIds)
      .select('id', 'os', 'fcm_token');
    const deviceById = new Map(devices.map((d) => [d.id, d]));

    for (const row of inserted) {
      const d = deviceById.get(row.device_id);
      if (!d || d.os !== 'android' || !d.fcm_token) continue;
      const created = row.created_at ? new Date(row.created_at) : new Date();
      const expires = new Date(created.getTime() + 7 * 24 * 60 * 60 * 1000);
      const out = await fcm.sendCommand(d.fcm_token, {
        type: 'sm_command',
        commandId: row.id,
        issuedAt: created.toISOString(),
        expiresAt: expires.toISOString(),
        payload: {
          wingetId: row.winget_id,
          commandType: row.command_type,
        },
      });
      if (!out.success) {
        console.warn('FCM sendCommand failed', row.device_id, out.error);
      }
    }

    res.status(201).json({ queued: rows.length });
  } catch (err) {
    next(err);
  }
});

// GET /api/software/commands
router.get('/commands', async (req, res, next) => {
  try {
    const { deviceId, status } = req.query;
    const limit = toLimit(req.query.limit, 50, 200);
    const query = db('sm_commands as c')
      .join('devices as d', 'd.id', 'c.device_id')
      .where('c.org_id', req.user.orgId)
      .andWhere('d.org_id', req.user.orgId)
      .select(
        'c.id',
        'c.device_id',
        'd.name as device_name',
        'c.winget_id',
        'c.command_type',
        'c.status',
        'c.output',
        'c.error_message',
        'c.initiated_by',
        'c.created_at',
        'c.updated_at',
        'c.completed_at'
      )
      .orderBy('c.created_at', 'desc')
      .limit(limit);

    if (deviceId) query.andWhere('c.device_id', String(deviceId));
    if (status) query.andWhere('c.status', String(status).toLowerCase());

    const commands = await query;
    res.json({ commands });
  } catch (err) {
    next(err);
  }
});

// GET /api/software/commands/:id
router.get('/commands/:id', async (req, res, next) => {
  try {
    const command = await db('sm_commands as c')
      .join('devices as d', 'd.id', 'c.device_id')
      .where('c.org_id', req.user.orgId)
      .andWhere('d.org_id', req.user.orgId)
      .andWhere('c.id', req.params.id)
      .select(
        'c.id',
        'c.device_id',
        'd.name as device_name',
        'c.winget_id',
        'c.command_type',
        'c.status',
        'c.output',
        'c.error_message',
        'c.initiated_by',
        'c.created_at',
        'c.updated_at',
        'c.completed_at'
      )
      .first();

    if (!command) return res.status(404).json({ error: 'Command not found.' });
    res.json({ command });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/software/commands/:id
router.patch('/commands/:id', async (req, res, next) => {
  try {
    const allowedStatuses = ['pending', 'running', 'success', 'failed', 'cancelled'];
    const updates = {};

    if (req.body.status) {
      const normalizedStatus = String(req.body.status).toLowerCase();
      if (!allowedStatuses.includes(normalizedStatus)) {
        return res.status(400).json({ error: 'Invalid status value.' });
      }
      updates.status = normalizedStatus;
      if (['success', 'failed', 'cancelled'].includes(normalizedStatus)) {
        updates.completed_at = new Date();
      }
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'output')) {
      updates.output = req.body.output == null ? null : String(req.body.output);
    }
    if (Object.prototype.hasOwnProperty.call(req.body, 'error_message')) {
      updates.error_message = req.body.error_message == null ? null : String(req.body.error_message);
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid fields provided for update.' });
    }

    updates.updated_at = new Date();

    const updated = await db('sm_commands')
      .where({ id: req.params.id, org_id: req.user.orgId })
      .update(updates)
      .returning([
        'id',
        'device_id',
        'winget_id',
        'command_type',
        'status',
        'output',
        'error_message',
        'initiated_by',
        'created_at',
        'updated_at',
        'completed_at',
      ]);

    if (!updated.length) return res.status(404).json({ error: 'Command not found.' });
    res.json({ command: updated[0] });
  } catch (err) {
    next(err);
  }
});

// GET /api/software/catalogue
router.get('/catalogue', async (req, res, next) => {
  try {
    const featured = await db('sm_apps')
      .where('org_id', req.user.orgId)
      .andWhere('is_featured', true)
      .select('id', 'name', 'publisher', 'category', 'winget_id', 'icon_url')
      .orderBy('category', 'asc')
      .orderBy('name', 'asc');

    const grouped = featured.reduce((acc, app) => {
      const key = app.category || 'Other';
      if (!acc[key]) acc[key] = [];
      acc[key].push(app);
      return acc;
    }, {});

    res.json({ categories: grouped });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
