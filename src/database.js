require('dotenv').config();
const knex = require('knex');
const path = require('path');

const migrationsDirectory = path.join(__dirname, '../Migrations');

const db = knex({
  client: 'pg',
  connection: {
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    keepAlive: true,
  },
  pool: {
    min: 2,
    max: 10,
    // Fail fast instead of hanging ~30s when the DB is unreachable.
    acquireTimeoutMillis: 10000,
    createTimeoutMillis: 10000,
    // Recycle idle connections so dead sockets (e.g. after a DB redeploy) get dropped.
    idleTimeoutMillis: 30000,
    reapIntervalMillis: 5000,
    // Validate connections before handing them out so stale ones are discarded.
    afterCreate: (conn, done) => {
      conn.query('SELECT 1', (err) => done(err, conn));
    },
  },
  acquireConnectionTimeout: 10000,
  migrations: {
    directory: migrationsDirectory,
    tableName: 'knex_migrations',
  },
});

async function runMigrations() {
  console.log('Running database migrations...');
  const [batch, migrations] = await db.migrate.latest();
  if (migrations.length === 0) {
    console.log('All migrations already up to date.');
  } else {
    console.log(`Batch ${batch} run: ${migrations.length} migrations`);
    migrations.forEach(m => console.log(' ✓', m));
  }
  return migrations;
}

module.exports = db;
module.exports.runMigrations = runMigrations;
