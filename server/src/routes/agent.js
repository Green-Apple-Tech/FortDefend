const express = require('express');
const { randomUUID } = require('crypto');
const db = require('../db');
const { requireDeviceToken } = require('../middleware/auth');

const router = express.Router();
const deviceAuth = requireDeviceToken(db);

router.post('/register', async (req, res) => {
  try {
    const { name, osVersion, ipAddress } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'name is required' });
    }

    const token = randomUUID();
    const [device] = await db('devices')
      .insert({
        name,
        token,
        os_version: osVersion || null,
        ip_address: ipAddress || req.ip,
        last_seen: db.fn.now(),
      })
      .returning(['id', 'name', 'token', 'os_version', 'created_at']);

    res.status(201).json({
      deviceToken: device.token,
      deviceId: device.id,
      name: device.name,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/manifests', deviceAuth, async (_req, res) => {
  try {
    const rows = await db('manifest_catalog').select('*').orderBy('name');
    const manifests = rows.map((row) => ({
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
    }));
    res.json({ manifests });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/policies/:deviceId', deviceAuth, async (req, res) => {
  try {
    if (req.device.id !== req.params.deviceId) {
      return res.status(403).json({ error: 'Device token does not match deviceId' });
    }

    const policies = await db('patch_policies')
      .where({ device_id: req.params.deviceId })
      .select('label', 'policy', 'disable_builtin_updater');

    res.json({ policies });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/report', deviceAuth, async (req, res) => {
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
      .where({ id: req.device.id })
      .update({ last_seen: db.fn.now(), ip_address: req.ip });

    await db('patch_results').insert({
      device_id: req.device.id,
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

    await db('device_apps')
      .insert({
        device_id: req.device.id,
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
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
