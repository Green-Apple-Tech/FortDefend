exports.up = async function up(knex) {
  const hasDevices = await knex.schema.hasTable('devices');
  if (!hasDevices) return;

  const addColumn = async (name, cb) => {
    const exists = await knex.schema.hasColumn('devices', name);
    if (!exists) {
      await knex.schema.alterTable('devices', (table) => cb(table));
    }
  };

  await addColumn('os_build', (t) => t.string('os_build').nullable());
  await addColumn('cpu_cores', (t) => t.integer('cpu_cores').nullable());
  await addColumn('wifi_connected', (t) => t.boolean('wifi_connected').nullable());
  await addColumn('screen_lock_enabled', (t) => t.boolean('screen_lock_enabled').nullable());
  await addColumn('developer_options_enabled', (t) => t.boolean('developer_options_enabled').nullable());
  await addColumn('security_patch_level', (t) => t.string('security_patch_level').nullable());
  await addColumn('check_results', (t) => t.jsonb('check_results').nullable());
};

exports.down = async function down(knex) {
  const hasDevices = await knex.schema.hasTable('devices');
  if (!hasDevices) return;

  await knex.schema.alterTable('devices', (table) => {
    table.dropColumn('os_build');
    table.dropColumn('cpu_cores');
    table.dropColumn('wifi_connected');
    table.dropColumn('screen_lock_enabled');
    table.dropColumn('developer_options_enabled');
    table.dropColumn('security_patch_level');
    table.dropColumn('check_results');
  });
};

