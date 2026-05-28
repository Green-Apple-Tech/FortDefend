const express = require('express');
const { randomUUID } = require('crypto');
const path = require('path');
const fs = require('fs');
const db = require('../database');
const { requireAuth } = require('../middleware/auth');
const { checkTrialStatus } = require('../middleware/trial');

const router = express.Router();

function rowToManifest(row) {
  return {
    label: row.label,
    name: row.name,
    type: row.type,
    downloadURL: row.download_url,
    silentArgs: row.silent_args,
    expectedPublisher: row.expected_publisher,
    versionKey: row.version_key,
    registryPath: row.registry_path,
    blockingProcesses: row.blocking_processes || [],
    appNewVersion: row.app_new_version,
  };
}

async function requirePatchDeviceToken(req, res, next) {
  try {
    const token = req.headers['x-device-token'] || req.body?.deviceToken;
    if (!token) {
      return res.status(401).json({ error: 'Missing device token' });
    }
    const device = await db('devices').where({ patch_agent_token: token }).first();
    if (!device) {
      return res.status(401).json({ error: 'Invalid device token' });
    }
    req.patchDevice = device;
    return next();
  } catch (err) {
    return next(err);
  }
}

async function resolveOrgIdFromToken(token) {
  const t = String(token || '').trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(t)) {
    return null;
  }
  const org = await db('orgs').where({ id: t }).first();
  return org ? org.id : null;
}

async function seedManifestCatalogIfEmpty() {
  const count = await db('manifest_catalog').count('label as count').first();
  if (Number(count?.count || 0) > 0) return;

  const manifestPath = path.join(__dirname, '../../agent/manifests.json');
  if (!fs.existsSync(manifestPath)) return;

  const raw = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const rows = raw.map((m) => ({
    label: m.label,
    name: m.name,
    type: m.type,
    download_url: m.downloadURL,
    silent_args: m.silentArgs || '',
    expected_publisher: m.expectedPublisher || '',
    version_key: m.versionKey || 'DisplayVersion',
    registry_path: m.registryPath || '',
    blocking_processes: JSON.stringify(m.blockingProcesses || []),
    app_new_version: m.appNewVersion || null,
  }));

  await db('manifest_catalog').insert(rows);
}

seedManifestCatalogIfEmpty().catch((err) => {
  console.warn('Patch manifest seed skipped:', err.message);
});

// ── PowerShell agent (no JWT) ─────────────────────────────────────────────────

router.post('/agent/register', async (req, res, next) => {
  try {
    const { name, osVersion, ipAddress, orgToken } = req.body;
    const orgId = await resolveOrgIdFromToken(orgToken);
    if (!orgId) {
      return res.status(400).json({ error: 'Invalid org token' });
    }

    const patchToken = randomUUID();
    const [device] = await db('devices')
      .insert({
        org_id: orgId,
        name: name || 'Windows Device',
        os: 'windows',
        os_version: osVersion || null,
        source: 'agent',
        patch_agent_token: patchToken,
        last_seen: db.fn.now(),
        status: 'online',
      })
      .returning(['id', 'name']);

    res.status(201).json({
      deviceToken: patchToken,
      deviceId: device.id,
      name: device.name,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/agent/manifests', requirePatchDeviceToken, async (_req, res, next) => {
  try {
    const rows = await db('manifest_catalog').select('*').orderBy('name');
    res.json({ manifests: rows.map(rowToManifest) });
  } catch (err) {
    next(err);
  }
});

router.get('/agent/policies/:deviceId', requirePatchDeviceToken, async (req, res, next) => {
  try {
    if (req.patchDevice.id !== req.params.deviceId) {
      return res.status(403).json({ error: 'Device token does not match deviceId' });
    }
    const policies = await db('patch_policies')
      .where({ device_id: req.params.deviceId })
      .select('label', 'policy', 'disable_builtin_updater');
    res.json({ policies });
  } catch (err) {
    next(err);
  }
});

router.post('/agent/report', requirePatchDeviceToken, async (req, res, next) => {
  try {
    const {
      label,
      name,
      action,
      fromVersion,
      toVersion,
      errorMessage,
      installedVersion,
      latestVersion,
    } = req.body;

    if (!label || !action) {
      return res.status(400).json({ error: 'label and action are required' });
    }

    await db('devices')
      .where({ id: req.patchDevice.id })
      .update({ last_seen: db.fn.now(), status: 'online' });

    await db('patch_results').insert({
      device_id: req.patchDevice.id,
      label,
      name: name || label,
      action,
      from_version: fromVersion || null,
      to_version: toVersion || null,
      error_message: errorMessage || null,
    });

    const statusMap = {
      installed: 'current',
      updated: 'current',
      skipped: installedVersion === latestVersion ? 'current' : 'outdated',
      failed: 'failed',
    };

    await db('patch_device_apps')
      .insert({
        device_id: req.patchDevice.id,
        label,
        name: name || label,
        installed_version: toVersion || installedVersion || null,
        latest_version: latestVersion || toVersion || null,
        status: statusMap[action] || 'unknown',
        last_checked: db.fn.now(),
      })
      .onConflict(['device_id', 'label'])
      .merge({
        name: name || label,
        installed_version: toVersion || installedVersion || null,
        latest_version: latestVersion || toVersion || null,
        status: statusMap[action] || 'unknown',
        last_checked: db.fn.now(),
      });

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ── Dashboard (JWT) ───────────────────────────────────────────────────────────

router.use(requireAuth, checkTrialStatus);

router.get('/overview', async (req, res, next) => {
  try {
    const orgId = req.user.orgId;
    const deviceRows = await db('devices').where({ org_id: orgId, os: 'windows' });
    const deviceIds = deviceRows.map((d) => d.id);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let patchedToday = { count: 0 };
    let failed = { count: 0 };
    let outdated = { count: 0 };
    let totalApps = { count: 0 };
    let currentApps = { count: 0 };
    let recent = [];

    if (deviceIds.length) {
      patchedToday = await db('patch_results')
        .whereIn('device_id', deviceIds)
        .whereIn('action', ['installed', 'updated'])
        .andWhere('timestamp', '>=', today)
        .count('id as count')
        .first();

      failed = await db('patch_results')
        .whereIn('device_id', deviceIds)
        .where({ action: 'failed' })
        .andWhere('timestamp', '>=', today)
        .count('id as count')
        .first();

      outdated = await db('patch_device_apps')
        .whereIn('device_id', deviceIds)
        .where({ status: 'outdated' })
        .count('id as count')
        .first();

      totalApps = await db('patch_device_apps')
        .whereIn('device_id', deviceIds)
        .count('id as count')
        .first();

      currentApps = await db('patch_device_apps')
        .whereIn('device_id', deviceIds)
        .where({ status: 'current' })
        .count('id as count')
        .first();

      recent = await db('patch_results as pr')
        .join('devices as d', 'pr.device_id', 'd.id')
        .whereIn('pr.device_id', deviceIds)
        .select('pr.*', 'd.name as device_name')
        .orderBy('pr.timestamp', 'desc')
        .limit(20);
    }

    const compliance =
      Number(totalApps?.count || 0) === 0
        ? 100
        : Math.round((Number(currentApps?.count || 0) / Number(totalApps.count)) * 100);

    res.json({
      totalDevices: deviceRows.length,
      patchedToday: Number(patchedToday?.count || 0),
      appsOutdated: Number(outdated?.count || 0),
      failedToday: Number(failed?.count || 0),
      compliance,
      recentActivity: recent,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/history', async (req, res, next) => {
  try {
    const orgId = req.user.orgId;
    let query = db('patch_results as pr')
      .join('devices as d', 'pr.device_id', 'd.id')
      .where('d.org_id', orgId)
      .select('pr.*', 'd.name as device_name')
      .orderBy('pr.timestamp', 'desc');

    if (req.query.deviceId) query = query.where('pr.device_id', req.query.deviceId);
    if (req.query.label) query = query.where('pr.label', req.query.label);
    if (req.query.action) query = query.where('pr.action', req.query.action);
    if (req.query.from) query = query.where('pr.timestamp', '>=', req.query.from);
    if (req.query.to) query = query.where('pr.timestamp', '<=', req.query.to);

    const history = await query.limit(500);
    res.json({ history });
  } catch (err) {
    next(err);
  }
});

router.get('/devices', async (req, res, next) => {
  try {
    const devices = await db('devices')
      .where({ org_id: req.user.orgId, os: 'windows' })
      .orderBy('name');

    const enriched = await Promise.all(
      devices.map(async (device) => {
        const apps = await db('patch_device_apps').where({ device_id: device.id });
        const patched = apps.filter((a) => a.status === 'current').length;
        const outdated = apps.filter((a) => a.status === 'outdated').length;
        const failed = apps.filter((a) => a.status === 'failed').length;

        let status = 'healthy';
        if (failed > 0) status = 'failed';
        else if (outdated > 0) status = 'outdated';

        return {
          id: device.id,
          name: device.name,
          osVersion: device.os_version,
          lastSeen: device.last_seen,
          ipAddress: null,
          appsPatched: patched,
          appsOutdated: outdated,
          status,
        };
      })
    );

    res.json({ devices: enriched });
  } catch (err) {
    next(err);
  }
});

router.get('/devices/:id', async (req, res, next) => {
  try {
    const device = await db('devices')
      .where({ id: req.params.id, org_id: req.user.orgId })
      .first();

    if (!device) {
      return res.status(404).json({ error: 'Device not found' });
    }

    const apps = await db('patch_device_apps')
      .where({ device_id: device.id })
      .orderBy('name');

    const history = await db('patch_results')
      .where({ device_id: device.id })
      .orderBy('timestamp', 'desc')
      .limit(100);

    const policies = await db('patch_policies')
      .where({ device_id: device.id })
      .orderBy('label');

    res.json({
      device: {
        id: device.id,
        name: device.name,
        osVersion: device.os_version,
        lastSeen: device.last_seen,
      },
      apps,
      history,
      policies,
    });
  } catch (err) {
    next(err);
  }
});

router.patch('/devices/:id/policies', async (req, res, next) => {
  try {
    const device = await db('devices')
      .where({ id: req.params.id, org_id: req.user.orgId })
      .first();

    if (!device) {
      return res.status(404).json({ error: 'Device not found' });
    }

    const { policies } = req.body;
    if (!Array.isArray(policies)) {
      return res.status(400).json({ error: 'policies array is required' });
    }

    for (const item of policies) {
      if (!item.label || !item.policy) continue;
      await db('patch_policies')
        .insert({
          device_id: device.id,
          label: item.label,
          policy: item.policy,
          disable_builtin_updater: Boolean(item.disableBuiltinUpdater),
        })
        .onConflict(['device_id', 'label'])
        .merge({
          policy: item.policy,
          disable_builtin_updater: Boolean(item.disableBuiltinUpdater),
        });
    }

    const updated = await db('patch_policies').where({ device_id: device.id });
    res.json({ policies: updated });
  } catch (err) {
    next(err);
  }
});

router.get('/manifests', async (_req, res, next) => {
  try {
    const rows = await db('manifest_catalog').select('*').orderBy('name');
    const manifests = await Promise.all(
      rows.map(async (row) => {
        const count = await db('patch_device_apps')
          .where({ label: row.label })
          .count('id as count')
          .first();
        return { ...rowToManifest(row), deviceCount: Number(count?.count || 0) };
      })
    );
    res.json({ manifests });
  } catch (err) {
    next(err);
  }
});

router.post('/manifests', async (req, res, next) => {
  try {
    const {
      label,
      name,
      type,
      downloadURL,
      silentArgs,
      expectedPublisher,
      versionKey,
      registryPath,
      blockingProcesses,
      appNewVersion,
    } = req.body;

    if (!label || !name || !type || !downloadURL) {
      return res.status(400).json({ error: 'label, name, type, and downloadURL are required' });
    }

    await db('manifest_catalog').insert({
      label,
      name,
      type,
      download_url: downloadURL,
      silent_args: silentArgs || '',
      expected_publisher: expectedPublisher || '',
      version_key: versionKey || 'DisplayVersion',
      registry_path: registryPath || '',
      blocking_processes: JSON.stringify(blockingProcesses || []),
      app_new_version: appNewVersion || null,
      updated_at: db.fn.now(),
    });

    const row = await db('manifest_catalog').where({ label }).first();
    res.status(201).json({ manifest: rowToManifest(row) });
  } catch (err) {
    next(err);
  }
});

router.patch('/manifests/:label', async (req, res, next) => {
  try {
    const existing = await db('manifest_catalog').where({ label: req.params.label }).first();
    if (!existing) {
      return res.status(404).json({ error: 'Label not found' });
    }

    const updates = {};
    const map = {
      name: 'name',
      type: 'type',
      downloadURL: 'download_url',
      silentArgs: 'silent_args',
      expectedPublisher: 'expected_publisher',
      versionKey: 'version_key',
      registryPath: 'registry_path',
      appNewVersion: 'app_new_version',
    };

    for (const [key, col] of Object.entries(map)) {
      if (req.body[key] !== undefined) updates[col] = req.body[key];
    }
    if (req.body.blockingProcesses !== undefined) {
      updates.blocking_processes = JSON.stringify(req.body.blockingProcesses);
    }
    updates.updated_at = db.fn.now();

    await db('manifest_catalog').where({ label: req.params.label }).update(updates);
    const row = await db('manifest_catalog').where({ label: req.params.label }).first();
    res.json({ manifest: rowToManifest(row) });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
