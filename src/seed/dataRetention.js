const db = require('../database');

const RETENTION = {
  scanResultsDays: 7,
  scanResultsMaxPerDevice: 100,
  agentLogsDays: 14,
  commandsDays: 14,
  commandResultsDays: 14,
  patchResultsDays: 30,
};

async function deleteOlderThan(table, days, dateColumn = 'created_at') {
  const hasTable = await db.schema.hasTable(table);
  if (!hasTable) return 0;
  const hasColumn = await db.schema.hasColumn(table, dateColumn);
  if (!hasColumn) return 0;
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return db(table).where(dateColumn, '<', cutoff).delete();
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

async function vacuumTables(tables) {
  for (const table of tables) {
    try {
      const hasTable = await db.schema.hasTable(table);
      if (!hasTable) continue;
      await db.raw(`VACUUM ANALYZE ${table}`);
    } catch (err) {
      console.warn(`[retention] VACUUM skipped for ${table}:`, err?.message);
    }
  }
}

async function runDataRetention() {
  const stats = {
    scanResultsByAge: 0,
    scanResultsTrimmed: 0,
    agentLogs: 0,
    commands: 0,
    commandResults: 0,
    patchResults: 0,
  };

  try {
    stats.scanResultsByAge = await deleteOlderThan('scan_results', RETENTION.scanResultsDays);
    stats.scanResultsTrimmed = await trimScanResultsPerDevice(RETENTION.scanResultsMaxPerDevice);
    stats.agentLogs = await deleteOlderThan('agent_logs', RETENTION.agentLogsDays);
    stats.commands = await purgeCompletedCommands(RETENTION.commandsDays);
    stats.commandResults = await deleteOlderThan('command_results', RETENTION.commandResultsDays);
    stats.patchResults = await deleteOlderThan('patch_results', RETENTION.patchResultsDays, 'timestamp');

    const total =
      stats.scanResultsByAge +
      stats.scanResultsTrimmed +
      stats.agentLogs +
      stats.commands +
      stats.commandResults +
      stats.patchResults;

    if (total > 0) {
      console.log('[retention] cleanup complete:', stats);
      await vacuumTables(['scan_results', 'agent_logs', 'sm_commands', 'command_results', 'patch_results']);
    } else {
      console.log('[retention] nothing to purge');
    }

    return { ok: true, stats };
  } catch (err) {
    console.error('[retention] cleanup failed:', err?.message);
    return { ok: false, error: err?.message, stats };
  }
}

module.exports = { runDataRetention, RETENTION };
