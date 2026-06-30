const { runMigrations } = require('./database');
const { seedDefaultScripts } = require('./seed/defaultScripts');
const { ensureCommandSchema } = require('./seed/ensureCommandSchema');

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
