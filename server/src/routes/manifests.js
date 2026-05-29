const express = require('express');
const db = require('../db');
const { requireJwt } = require('../middleware/auth');

const router = express.Router();
router.use(requireJwt);

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

router.get('/', async (_req, res) => {
  try {
    const rows = await db('manifest_catalog').select('*').orderBy('name');
    const labels = await Promise.all(
      rows.map(async (row) => {
        const count = await db('device_apps')
          .where({ label: row.label })
          .count('id as count')
          .first();
        return {
          ...rowToManifest(row),
          deviceCount: Number(count?.count || 0),
        };
      })
    );
    res.json({ manifests: labels });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', async (req, res) => {
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
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.patch('/:label', async (req, res) => {
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
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
