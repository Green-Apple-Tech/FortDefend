const { runMigrations } = require('./database');
const { seedDefaultScripts } = require('./seed/defaultScripts');
const { ensureCommandSchema } = require('./seed/ensureCommandSchema');
const { runDataRetention } = require('./seed/dataRetention');

(async () => {
  try {
    await runMigrations();
  } catch (err) {
    // Never let a migration failure take the whole service offline.
    // Schema access is guarded with hasColumn/hasTable checks throughout the app.
    console.error('[startup] Migration step failed, starting server anyway:', err?.message);
    console.error(err?.stack);
  }
  try {
    await runDataRetention({ aggressive: process.env.DATA_RETENTION_AGGRESSIVE === 'true' });
  } catch (err) {
    console.error('[startup] Data retention cleanup failed:', err?.message);
  }

  const retentionHours = Number(process.env.DATA_RETENTION_INTERVAL_HOURS || 6);
  if (Number.isFinite(retentionHours) && retentionHours > 0) {
    setInterval(() => {
      runDataRetention().catch((err) => {
        console.error('[retention] scheduled cleanup failed:', err?.message);
      });
    }, retentionHours * 60 * 60 * 1000);
  }
  try {
    await ensureCommandSchema();
  } catch (err) {
    console.error('[startup] Command schema ensure failed:', err?.message);
  }
  try {
    await seedDefaultScripts();
  } catch (err) {
    console.error('[startup] Default script seed failed:', err?.message);
  }
  require('./server');
})();
