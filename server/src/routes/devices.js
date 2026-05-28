const express = require('express');
const db = require('../db');
const { requireJwt } = require('../middleware/auth');

const router = express.Router();
router.use(requireJwt);

router.get('/', async (_req, res) => {
  try {
    const devices = await db('devices').select('*').orderBy('name');

    const enriched = await Promise.all(
      devices.map(async (device) => {
        const apps = await db('device_apps').where({ device_id: device.id });
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
          ipAddress: device.ip_address,
          appsPatched: patched,
          appsOutdated: outdated,
          status,
        };
      })
    );

    res.json({ devices: enriched });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const device = await db('devices').where({ id: req.params.id }).first();
    if (!device) {
      return res.status(404).json({ error: 'Device not found' });
    }

    const apps = await db('device_apps')
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
        ipAddress: device.ip_address,
      },
      apps,
      history,
      policies,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.patch('/:id/policies', async (req, res) => {
  try {
    const device = await db('devices').where({ id: req.params.id }).first();
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
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
