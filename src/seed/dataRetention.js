const db = require('../database');

const RETENTION = {
  scanResultsDays: 7,
  scanResultsMaxPerDevice: 7,
  deltaScanResultsDays: 1,
  agentLogsDays: 7,
  commandsDays: 7,
  commandResultsDays: 7,
  commandResultsMaxOutputChars: 8000,
  patchResultsDays: 30,
  resolvedAlertsDays: 30,
  auditLogDays: 30,
};

async function deleteOlderThan(table, days, dateColumn = 'created_at') {
  const hasTable = await db.schema.hasTable(table);
  if (!hasTable) return 0;
  const hasColumn = await db.schema.hasColumn(table, dateColumn);
  if (!hasColumn) return 0;
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return db(table).where(dateColumn, '<', cutoff).delete();
}

async function purgeLegacyScanResults() {
  const hasTable = await db.schema.hasTable('scan_results');
  if (!hasTable) return 0;

  let deleted = 0;
  try {
    const legacy = await db('scan_results')
      .whereRaw("result IS NULL OR result->>'mode' IS NULL")
      .delete();
    deleted += Number(legacy || 0);
  } catch (err) {
    console.warn('[retention] legacy scan_results purge failed:', err?.message);
  }

  try {
    const bulky = await db('scan_results')
      .whereRaw('pg_column_size(result) > 2048')
      .whereRaw("result->>'mode' IS NULL OR result->>'mode' NOT IN ('full_daily', 'delta')")
      .delete();
    deleted += Number(bulky || 0);
  } catch (err) {
    console.warn('[retention] bulky scan_results purge failed:', err?.message);
  }

  return deleted;
}

async function purgeDeltaScanResults(days) {
  const hasTable = await db.schema.hasTable('scan_results');
  if (!hasTable) return 0;
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return db('scan_results')
    .where('created_at', '<', cutoff)
    .whereRaw("result->>'mode' = ?", ['delta'])
    .delete();
}

async function trimScanResultsPerDevice(maxPerDevice) {
  const hasTable = await db.schema.hasTable('scan_results');
  if (!hasTable) return 0;

  const result = await db.raw(
    `
    DELETE FROM scan_results sr
    USING (
      SELECT id
      FROM (
        SELECT id,
               ROW_NUMBER() OVER (PARTITION BY device_id ORDER BY created_at DESC) AS rn
        FROM scan_results
      ) ranked
      WHERE rn > ?
    ) old
    WHERE sr.id = old.id
    `,
    [maxPerDevice]
  );
  return Number(result.rowCount || 0);
}

async function purgeCompletedCommands(days) {
  const hasTable = await db.schema.hasTable('sm_commands');
  if (!hasTable) return 0;
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return db('sm_commands')
    .whereIn('status', ['success', 'failed', 'cancelled'])
    .where('created_at', '<', cutoff)
    .delete();
}

async function clearCompletedCommandOutputs(days) {
  const hasTable = await db.schema.hasTable('sm_commands');
  if (!hasTable) return 0;
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return db('sm_commands')
    .whereIn('status', ['success', 'failed', 'cancelled'])
    .where('created_at', '<', cutoff)
    .whereNotNull('output')
    .update({ output: null, updated_at: new Date() });
}

async function stripMalwareReportJson() {
  const hasTable = await db.schema.hasTable('sm_device_apps');
  if (!hasTable) return 0;
  const hasColumn = await db.schema.hasColumn('sm_device_apps', 'malware_report_json');
  if (!hasColumn) return 0;
  return db('sm_device_apps').whereNotNull('malware_report_json').update({
    malware_report_json: null,
    updated_at: new Date(),
  });
}

async function purgeResolvedAlerts(days) {
  const hasTable = await db.schema.hasTable('alerts');
  if (!hasTable) return 0;
  const hasColumn = await db.schema.hasColumn('alerts', 'resolved');
  if (!hasColumn) return 0;
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return db('alerts').where({ resolved: true }).where('created_at', '<', cutoff).delete();
}

async function truncateCommandResultOutputs(maxChars) {
  const hasTable = await db.schema.hasTable('command_results');
  if (!hasTable) return 0;
  try {
    const result = await db.raw(
      `
      UPDATE command_results
      SET output = LEFT(output, ?)
      WHERE output IS NOT NULL AND LENGTH(output) > ?
      `,
      [maxChars, maxChars]
    );
    return Number(result.rowCount || 0);
  } catch (err) {
    console.warn('[retention] command_results truncate failed:', err?.message);
    return 0;
  }
}

async function vacuumTables(tables, { full = false } = {}) {
  for (const table of tables) {
    try {
      const hasTable = await db.schema.hasTable(table);
      if (!hasTable) continue;
      if (full) {
        await db.raw(`VACUUM FULL ANALYZE ${table}`);
      } else {
        await db.raw(`VACUUM ANALYZE ${table}`);
      }
    } catch (err) {
      console.warn(`[retention] VACUUM skipped for ${table}:`, err?.message);
    }
  }
}

async function runDataRetention({ aggressive = false } = {}) {
  const stats = {
    legacyScanResults: 0,
    scanResultsByAge: 0,
    deltaScanResults: 0,
    scanResultsTrimmed: 0,
    agentLogs: 0,
    commands: 0,
    commandOutputsCleared: 0,
    commandResults: 0,
    commandResultsTruncated: 0,
    patchResults: 0,
    resolvedAlerts: 0,
    auditLog: 0,
    malwareReportsStripped: 0,
  };

  try {
    stats.legacyScanResults = await purgeLegacyScanResults();
    stats.deltaScanResults = await purgeDeltaScanResults(RETENTION.deltaScanResultsDays);
    stats.scanResultsByAge = await deleteOlderThan('scan_results', RETENTION.scanResultsDays);
    stats.scanResultsTrimmed = await trimScanResultsPerDevice(RETENTION.scanResultsMaxPerDevice);
    stats.agentLogs = await deleteOlderThan('agent_logs', RETENTION.agentLogsDays);
    stats.commands = await purgeCompletedCommands(RETENTION.commandsDays);
    stats.commandOutputsCleared = await clearCompletedCommandOutputs(3);
    stats.commandResults = await deleteOlderThan('command_results', RETENTION.commandResultsDays);
    stats.commandResultsTruncated = await truncateCommandResultOutputs(RETENTION.commandResultsMaxOutputChars);
    stats.patchResults = await deleteOlderThan('patch_results', RETENTION.patchResultsDays, 'timestamp');
    stats.resolvedAlerts = await purgeResolvedAlerts(RETENTION.resolvedAlertsDays);
    stats.auditLog = await deleteOlderThan('audit_log', RETENTION.auditLogDays);
    stats.malwareReportsStripped = await stripMalwareReportJson();

    const total = Object.values(stats).reduce((sum, n) => sum + Number(n || 0), 0);
    const vacuumTargets = [
      'scan_results',
      'agent_logs',
      'sm_commands',
      'command_results',
      'patch_results',
      'sm_device_apps',
      'alerts',
    ];

    if (total > 0 || aggressive) {
      console.log('[retention] cleanup complete:', stats);
      await vacuumTables(vacuumTargets, { full: aggressive });
    } else {
      console.log('[retention] nothing to purge');
      await vacuumTables(['scan_results'], { full: false });
    }

    return { ok: true, stats };
  } catch (err) {
    console.error('[retention] cleanup failed:', err?.message);
    return { ok: false, error: err?.message, stats };
  }
}

module.exports = { runDataRetention, RETENTION };
