exports.up = async function up(knex) {
  const hasTable = await knex.schema.hasTable('sm_device_apps');
  if (!hasTable) return;
  await knex.raw(`
    CREATE UNIQUE INDEX IF NOT EXISTS sm_device_apps_device_id_app_name_unique
    ON sm_device_apps (device_id, app_name);
  `);
};

exports.down = async function down(knex) {
  const hasTable = await knex.schema.hasTable('sm_device_apps');
  if (!hasTable) return;
  await knex.raw('DROP INDEX IF EXISTS sm_device_apps_device_id_app_name_unique');
};
