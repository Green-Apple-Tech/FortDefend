require('dotenv').config();
const knex = require('knex');
const path = require('path');

const db = knex({
  client: 'pg',
  connection: {
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  },
  pool: { min: 2, max: 10 },
  migrations: {
    directory: path.join(__dirname, '../Migrations'),
    tableName: 'knex_migrations',
  },
});

async function runMigrations() {
  try {
    console.log('Running database migrations...');
    const [batch, migrations] = await db.migrate.latest();
    if (migrations.length === 0) {
      console.log('All migrations already up to date.');
    } else {
      console.log(`Batch ${batch} run: ${migrations.length} migrations`);
      migrations.forEach(m => console.log(' ✓', m));
    }
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exit(1);
  }
}

module.exports = db;
module.exports.runMigrations = runMigrations;
