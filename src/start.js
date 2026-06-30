const { runMigrations } = require('./database');

(async () => {
  try {
    await runMigrations();
  } catch (err) {
    // Never let a migration failure take the whole service offline.
    // Schema access is guarded with hasColumn/hasTable checks throughout the app.
    console.error('[startup] Migration step failed, starting server anyway:', err?.message);
    console.error(err?.stack);
  }
  require('./server');
})();
