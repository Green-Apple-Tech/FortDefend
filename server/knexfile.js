require('dotenv').config();

module.exports = {
  client: 'pg',
  connection: process.env.DATABASE_URL || {
    host: process.env.PGHOST || 'localhost',
    port: process.env.PGPORT || 5432,
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || 'postgres',
    database: process.env.PGDATABASE || 'fortdefend',
  },
  migrations: {
    directory: './migrations',
    tableName: 'knex_migrations',
  },
};
