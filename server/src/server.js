const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const db = require('./db');
const { JWT_SECRET } = require('./middleware/auth');
const agentRoutes = require('./routes/agent');
const deviceRoutes = require('./routes/devices');
const manifestRoutes = require('./routes/manifests');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());
app.set('trust proxy', true);

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'fortdefend-server' });
});

if (process.env.NODE_ENV !== 'production') {
  app.post('/api/auth/dev-token', (_req, res) => {
    const token = jwt.sign({ sub: 'admin', role: 'admin' }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token });
  });
}

app.use('/api/agent', agentRoutes);
app.use('/api/devices', deviceRoutes);
app.use('/api/manifests', manifestRoutes);

app.get('/api/patch/overview', async (_req, res) => {
  try {
    const deviceCount = await db('devices').count('id as count').first();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const patchedToday = await db('patch_results')
      .whereIn('action', ['installed', 'updated'])
      .andWhere('timestamp', '>=', today)
      .count('id as count')
      .first();

    const outdated = await db('device_apps').where({ status: 'outdated' }).count('id as count').first();
    const failed = await db('patch_results')
      .where({ action: 'failed' })
      .andWhere('timestamp', '>=', today)
      .count('id as count')
      .first();

    const recent = await db('patch_results')
      .join('devices', 'patch_results.device_id', 'devices.id')
      .select(
        'patch_results.*',
        'devices.name as device_name'
      )
      .orderBy('patch_results.timestamp', 'desc')
      .limit(20);

    const totalApps = await db('device_apps').count('id as count').first();
    const currentApps = await db('device_apps').where({ status: 'current' }).count('id as count').first();
    const compliance =
      Number(totalApps?.count || 0) === 0
        ? 100
        : Math.round((Number(currentApps?.count || 0) / Number(totalApps.count)) * 100);

    res.json({
      totalDevices: Number(deviceCount?.count || 0),
      patchedToday: Number(patchedToday?.count || 0),
      appsOutdated: Number(outdated?.count || 0),
      failedToday: Number(failed?.count || 0),
      compliance,
      recentActivity: recent,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/patch/history', async (req, res) => {
  try {
    let query = db('patch_results')
      .join('devices', 'patch_results.device_id', 'devices.id')
      .select('patch_results.*', 'devices.name as device_name')
      .orderBy('patch_results.timestamp', 'desc');

    if (req.query.deviceId) query = query.where('patch_results.device_id', req.query.deviceId);
    if (req.query.label) query = query.where('patch_results.label', req.query.label);
    if (req.query.action) query = query.where('patch_results.action', req.query.action);
    if (req.query.from) query = query.where('patch_results.timestamp', '>=', req.query.from);
    if (req.query.to) query = query.where('patch_results.timestamp', '<=', req.query.to);

    const rows = await query.limit(500);
    res.json({ history: rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

async function seedManifestsIfEmpty() {
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
  console.log(`Seeded ${rows.length} manifest labels`);
}

seedManifestsIfEmpty().catch((err) => {
  console.warn('Manifest seed skipped:', err.message);
});

app.listen(PORT, () => {
  console.log(`FortDefend server listening on http://localhost:${PORT}`);
});
