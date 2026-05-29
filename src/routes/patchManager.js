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

    const deviceName = String(name || '').trim() || 'Windows Device';
    const patchToken = randomUUID();
    const hasPatchInstalledCol = await db.schema.hasColumn('devices', 'patch_agent_installed');
    const hasPatchVersionCol = await db.schema.hasColumn('devices', 'patch_agent_version');

    let existing = await db('devices')
      .where({ org_id: orgId, source: 'agent' })
      .whereNull('patch_agent_token')
      .andWhere((q) => {
        q.where('name', deviceName).orWhere('hostname', deviceName).orWhere('external_id', deviceName);
      })
      .orderBy('last_seen', 'desc')
      .first();

    if (!existing) {
      existing = await db('devices')
        .where({ org_id: orgId })
        .whereIn('os', ['windows', 'Microsoft Windows', 'microsoft windows'])
        .whereNull('patch_agent_token')
        .andWhere((q) => {
          q.where('name', deviceName).orWhere('hostname', deviceName).orWhere('external_id', deviceName);
        })
        .orderBy('last_seen', 'desc')
        .first();
    }

    if (existing) {
      const patchUpdate = {
        patch_agent_token: patchToken,
        last_seen: db.fn.now(),
        status: 'online',
        os_version: osVersion || existing.os_version,
      };
      if (hasPatchInstalledCol) {
        patchUpdate.patch_agent_installed = true;
      }
      if (hasPatchVersionCol && req.body?.agentVersion) {
        patchUpdate.patch_agent_version = String(req.body.agentVersion);
      }
      await db('devices').where({ id: existing.id }).update(patchUpdate);
      return res.status(201).json({
        deviceToken: patchToken,
        deviceId: existing.id,
        name: existing.name || deviceName,
        linked: true,
      });
    }

    const insertRow = {
      org_id: orgId,
      name: deviceName,
      hostname: deviceName,
      os: 'windows',
      os_version: osVersion || null,
      source: 'agent',
      external_id: deviceName,
      patch_agent_token: patchToken,
      last_seen: db.fn.now(),
      status: 'online',
    };
    if (ipAddress) insertRow.ip_address = ipAddress;
    if (hasPatchInstalledCol) insertRow.patch_agent_installed = true;
    if (hasPatchVersionCol && req.body?.agentVersion) {
      insertRow.patch_agent_version = String(req.body.agentVersion);
    }

    const [device] = await db('devices').insert(insertRow).returning(['id', 'name']);

    res.status(201).json({
      deviceToken: patchToken,
      deviceId: device.id,
      name: device.name,
      linked: false,
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

    const patchDeviceUpdate = { last_seen: db.fn.now(), status: 'online' };
    const hasPatchInstalledCol = await db.schema.hasColumn('devices', 'patch_agent_installed');
    const hasPatchVersionCol = await db.schema.hasColumn('devices', 'patch_agent_version');
    if (hasPatchInstalledCol) {
      patchDeviceUpdate.patch_agent_installed = true;
    }
    if (hasPatchVersionCol && req.body?.agentVersion) {
      patchDeviceUpdate.patch_agent_version = String(req.body.agentVersion);
    }
    await db('devices').where({ id: req.patchDevice.id }).update(patchDeviceUpdate);

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
      fresh_install: 'current',
      installed: 'current',
      updated: 'current',
      skipped_current: 'current',
      skipped_newer: 'current',
      skipped: installedVersion === latestVersion ? 'current' : 'outdated',
      failed: 'failed',
    };

    const ignoredPolicy = await db('patch_policies')
      .where({ device_id: req.patchDevice.id, label, policy: 'ignore' })
      .first();
    if (ignoredPolicy && !['failed', 'skipped_current', 'skipped_newer'].includes(action)) {
      return res.json({ ok: true, ignored: true });
    }

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
    const deviceRows = await db('devices')
      .where({ org_id: orgId })
      .where((q) => {
        q.where('os', 'windows').orWhere('os', 'like', '%Windows%');
      });
    const deviceIds = deviceRows.map((d) => d.id);
    const hasPatchInstalledCol = await db.schema.hasColumn('devices', 'patch_agent_installed');
    const patchManagedDevices = hasPatchInstalledCol
      ? deviceRows.filter((d) => d.patch_agent_installed || d.patch_agent_token).length
      : deviceRows.filter((d) => d.patch_agent_token).length;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    let patchedToday = { count: 0 };
    let failed = { count: 0 };
    let failedLast7Days = { count: 0 };
    let outdated = { count: 0 };
    let totalApps = { count: 0 };
    let currentApps = { count: 0 };
    let recent = [];

    if (deviceIds.length) {
      patchedToday = await db('patch_results')
        .whereIn('device_id', deviceIds)
        .whereIn('action', ['installed', 'updated', 'fresh_install'])
        .andWhere('timestamp', '>=', today)
        .count('id as count')
        .first();

      failed = await db('patch_results')
        .whereIn('device_id', deviceIds)
        .where({ action: 'failed' })
        .andWhere('timestamp', '>=', today)
        .count('id as count')
        .first();

      failedLast7Days = await db('patch_results')
        .whereIn('device_id', deviceIds)
        .where({ action: 'failed' })
        .andWhere('timestamp', '>=', sevenDaysAgo)
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
      patchManagedDevices,
      patchedToday: Number(patchedToday?.count || 0),
      appsOutdated: Number(outdated?.count || 0),
      failedToday: Number(failed?.count || 0),
      failedLast7Days: Number(failedLast7Days?.count || 0),
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

router.get('/devices/:id/apps', async (req, res, next) => {
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

    res.json({
      apps,
      patchAgentInstalled: Boolean(device.patch_agent_installed || device.patch_agent_token),
      patchAgentVersion: device.patch_agent_version || null,
      patchAgentToken: device.patch_agent_token || null,
    });
  } catch (err) {
    next(err);
  }
});

function buildPatchRunScript({ label = null, installMode = null } = {}) {
  const patchScript = 'C:\\ProgramData\\FortDefend\\FortDefendAgent.ps1';
  const args = [];
  if (label) args.push(`-Label '${label.replace(/'/g, "''")}'`);
  if (installMode) args.push(`-InstallMode '${installMode.replace(/'/g, "''")}'`);
  const argLine = args.length ? ` ${args.join(' ')}` : '';
  return [
    `if (-not (Test-Path '${patchScript}')) { throw 'Patch agent not installed. Run the Install Patch Agent command first.' }`,
    `& '${patchScript}'${argLine}`,
  ].join('\n');
}

async function queuePatchAgentRun({ device, orgId, userId, label = null, installMode = null, scriptName = 'FortDefend Patch Scan' }) {
  const hasCommands = await db.schema.hasTable('sm_commands');
  if (!hasCommands) return null;
  const now = new Date();
  const scriptContent = buildPatchRunScript({ label, installMode });
  const [row] = await db('sm_commands')
    .insert({
      org_id: orgId,
      device_id: device.id,
      winget_id: label ? `patch:${label}` : 'patch:scan',
      command_type: 'run_script',
      status: 'pending',
      initiated_by: userId || null,
      command_payload: {
        scriptId: null,
        scriptName,
        scriptType: 'powershell',
        scriptContent,
      },
      created_at: now,
      updated_at: now,
    })
    .returning(['id', 'device_id', 'status', 'created_at']);
  return row;
}

router.post('/scan-all', async (req, res, next) => {
  try {
    const devices = await db('devices')
      .where({ org_id: req.user.orgId })
      .where((q) => {
        q.where('os', 'windows').orWhere('os', 'like', '%Windows%');
      })
      .select('id', 'name');

    let queued = 0;
    for (const device of devices) {
      const row = await queuePatchAgentRun({
        device,
        orgId: req.user.orgId,
        userId: req.user.id,
        scriptName: 'FortDefend Patch Scan All',
      });
      if (row) queued += 1;
    }

    res.json({
      ok: true,
      devices: devices.length,
      queued,
      message: `Queued patch scan on ${queued} of ${devices.length} Windows device(s).`,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/devices/:id/scan', async (req, res, next) => {
  try {
    const device = await db('devices')
      .where({ id: req.params.id, org_id: req.user.orgId })
      .first();

    if (!device) {
      return res.status(404).json({ error: 'Device not found' });
    }

    const hasScanCol = await db.schema.hasColumn('devices', 'patch_scan_requested_at');
    if (hasScanCol) {
      await db('devices').where({ id: device.id }).update({ patch_scan_requested_at: new Date() });
    }

    const queued = await queuePatchAgentRun({
      device,
      orgId: req.user.orgId,
      userId: req.user.id,
    });

    res.json({
      ok: true,
      queued: Boolean(queued),
      commandId: queued?.id || null,
      message: queued
        ? 'Patch scan queued. The monitoring agent will run it on the next heartbeat.'
        : 'Patch scan requested. Run the patch agent locally if the device is offline.',
    });
  } catch (err) {
    next(err);
  }
});

router.post('/devices/:id/apps/:label/action', async (req, res, next) => {
  try {
    const device = await db('devices')
      .where({ id: req.params.id, org_id: req.user.orgId })
      .first();
    if (!device) return res.status(404).json({ error: 'Device not found' });

    const label = String(req.params.label || '').trim();
    const action = String(req.body?.action || '').trim().toLowerCase();
    if (!label || !action) {
      return res.status(400).json({ error: 'label and action are required' });
    }

    if (action === 'ignore') {
      await db('patch_policies')
        .insert({
          device_id: device.id,
          label,
          policy: 'ignore',
          disable_builtin_updater: false,
        })
        .onConflict(['device_id', 'label'])
        .merge({ policy: 'ignore' });
      return res.json({ ok: true, action: 'ignore' });
    }

    if (action === 'update') {
      const queued = await queuePatchAgentRun({
        device,
        orgId: req.user.orgId,
        userId: req.user.id,
        label,
        installMode: 'auto',
        scriptName: `Patch update ${label}`,
      });
      return res.json({ ok: true, queued: Boolean(queued), commandId: queued?.id || null });
    }

    if (action === 'reinstall') {
      const queued = await queuePatchAgentRun({
        device,
        orgId: req.user.orgId,
        userId: req.user.id,
        label,
        installMode: 'force',
        scriptName: `Patch reinstall ${label}`,
      });
      return res.json({ ok: true, queued: Boolean(queued), commandId: queued?.id || null });
    }

    return res.status(400).json({ error: 'action must be update, reinstall, or ignore' });
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
