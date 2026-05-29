exports.up = async function up(knex) {
  const hasDevices = await knex.schema.hasTable('devices');
  if (!hasDevices) return;
  const exists = await knex.schema.hasColumn('devices', 'fcm_token');
  if (exists) return;
  await knex.schema.alterTable('devices', (table) => {
    table.string('fcm_token').nullable();
  });
};

exports.down = async function down(knex) {
  const hasDevices = await knex.schema.hasTable('devices');
  if (!hasDevices) return;
  const exists = await knex.schema.hasColumn('devices', 'fcm_token');
  if (!exists) return;
  await knex.schema.alterTable('devices', (table) => {
    table.dropColumn('fcm_token');
  });
};
