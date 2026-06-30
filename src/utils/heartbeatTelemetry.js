const db = require('../database');

const METRIC_FIELDS = [
  'cpu_usage_pct',
  'ram_usage_pct',
  'disk_free_gb',
  'disk_total_gb',
  'disk_usage_pct',
  'agent_version',
  'security_score',
  'mem_used_gb',
  'mem_total_gb',
  'reboot_required',
  'patch_status',
  'os_update_status',
  'os_update_available_count',
  'logged_in_user',
  'ip_address',
  'battery_level',
];

const SIGNIFICANT_DELTA_KEYS = new Set([
  'agent_version',
  'patch_status',
  'os_update_status',
  'os_update_available_count',
  'reboot_required',
  'security_score',
  'logged_in_user',
]);

const DAILY_FULL_MS = 24 * 60 * 60 * 1000;
const STORE_DELTAS = process.env.HEARTBEAT_STORE_DELTAS === 'true';

function valuesEqual(a, b) {
  if (a === b) return true;
  if (a == null && b == null) return true;
  if (typeof a === 'object' || typeof b === 'object') {
    try {
      return JSON.stringify(a) === JSON.stringify(b);
    } catch {
      return false;
    }
  }
  return String(a) === String(b);
}

function buildMetricSnapshot(existing = {}, updateFields = {}) {
  const snap = {};
  for (const key of METRIC_FIELDS) {
    const val = updateFields[key] !== undefined ? updateFields[key] : existing[key];
    if (val !== undefined && val !== null) snap[key] = val;
  }
  return snap;
}

function diffSnapshot(prev = {}, next = {}) {
  const changes = {};
  for (const key of new Set([...Object.keys(prev), ...Object.keys(next)])) {
    if (!valuesEqual(prev[key], next[key])) {
      changes[key] = { from: prev[key] ?? null, to: next[key] ?? null };
    }
  }
  return changes;
}

function isSignificantChange(key, change = {}) {
  if (SIGNIFICANT_DELTA_KEYS.has(key)) return true;
  if (key.endsWith('_pct') || key.includes('mem_') || key.includes('disk_')) {
    const from = Number(change.from);
    const to = Number(change.to);
    if (Number.isFinite(from) && Number.isFinite(to) && Math.abs(to - from) >= 5) return true;
    return false;
  }
  return false;
}

function filterSignificantChanges(changes = {}) {
  return Object.fromEntries(
    Object.entries(changes).filter(([key, change]) => isSignificantChange(key, change))
  );
}

function pickChangedDeviceFields(existing, updateFields, always = ['last_seen', 'status']) {
  if (!existing) return { ...updateFields };
  const out = {};
  for (const key of always) {
    if (updateFields[key] !== undefined) out[key] = updateFields[key];
  }
  for (const [key, value] of Object.entries(updateFields)) {
    if (always.includes(key)) continue;
    if (!valuesEqual(existing[key], value)) out[key] = value;
  }
  return out;
}

async function hasRecentDailyFull(orgId, deviceId, now) {
  const cutoff = new Date(now.getTime() - DAILY_FULL_MS);
  const row = await db('scan_results')
    .where({ org_id: orgId, device_id: deviceId })
    .where('created_at', '>', cutoff)
    .whereRaw("result->>'mode' = ?", ['full_daily'])
    .first();
  return Boolean(row);
}

async function insertScanResult({ orgId, deviceId, result, status = 'pass', summary }) {
  await db('scan_results').insert({
    id: db.raw('gen_random_uuid()'),
    org_id: orgId,
    device_id: deviceId,
    agent_name: 'fortdefend_windows_agent',
    result,
    status,
    ai_summary: summary || null,
  });
}

async function recordHeartbeatTelemetry({
  orgId,
  deviceId,
  existing,
  updateFields,
  installedApps,
  now = new Date(),
}) {
  const hasTable = await db.schema.hasTable('scan_results');
  if (!hasTable || !deviceId) return { skipped: true, reason: 'no_table' };

  const prevSnap = buildMetricSnapshot(existing || {}, {});
  const nextSnap = buildMetricSnapshot(existing || {}, updateFields);
  const metricChanges = filterSignificantChanges(diffSnapshot(prevSnap, nextSnap));
  const isFullInventory = Array.isArray(installedApps);

  try {
    if (isFullInventory) {
      const hasDaily = await hasRecentDailyFull(orgId, deviceId, now);
      if (!hasDaily) {
        await insertScanResult({
          orgId,
          deviceId,
          result: {
            mode: 'full_daily',
            heartbeatAt: now.toISOString(),
            snapshot: {
              ...nextSnap,
              installedAppCount: installedApps.length,
            },
          },
          summary: 'Daily snapshot',
        });
        return { mode: 'full_daily' };
      }
    }

    if (!STORE_DELTAS || !Object.keys(metricChanges).length) {
      return { skipped: true, reason: STORE_DELTAS ? 'no_significant_changes' : 'deltas_disabled' };
    }

    await insertScanResult({
      orgId,
      deviceId,
      result: {
        mode: 'delta',
        heartbeatAt: now.toISOString(),
        changes: metricChanges,
      },
      summary: null,
    });
    return { mode: 'delta', changeCount: Object.keys(metricChanges).length };
  } catch (err) {
    console.error('[heartbeatTelemetry] failed to record scan_results', {
      orgId,
      deviceId,
      error: err?.message,
    });
    return { skipped: true, reason: err?.message };
  }
}

module.exports = {
  METRIC_FIELDS,
  buildMetricSnapshot,
  diffSnapshot,
  filterSignificantChanges,
  pickChangedDeviceFields,
  recordHeartbeatTelemetry,
};
