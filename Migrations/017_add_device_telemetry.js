exports.up = async function up(knex) {
  const hasDevices = await knex.schema.hasTable('devices');
  if (!hasDevices) return;
  const addColumn = async (name, cb) => {
    const exists = await knex.schema.hasColumn('devices', name);
    if (!exists) {
      await knex.schema.alterTable('devices', (table) => cb(table));
    }
  };

  await addColumn('battery_level', (t) => t.integer('battery_level').nullable());
  await addColumn('on_ac_power', (t) => t.boolean('on_ac_power').notNullable().defaultTo(true));
  await addColumn('active_user_session', (t) => t.boolean('active_user_session').notNullable().defaultTo(false));
  await addColumn('idle_time_minutes', (t) => t.integer('idle_time_minutes').nullable());
  await addColumn('unsaved_word_docs', (t) => t.boolean('unsaved_word_docs').notNullable().defaultTo(false));
  await addColumn('unsaved_excel_docs', (t) => t.boolean('unsaved_excel_docs').notNullable().defaultTo(false));
  await addColumn('open_browser_count', (t) => t.integer('open_browser_count').notNullable().defaultTo(0));
  await addColumn('any_unsaved_changes', (t) => t.boolean('any_unsaved_changes').notNullable().defaultTo(false));
  await addColumn('active_network_connections', (t) => t.integer('active_network_connections').notNullable().defaultTo(0));
  await addColumn('reboot_required', (t) => t.boolean('reboot_required').notNullable().defaultTo(false));
  await addColumn('reboot_required_reason', (t) => t.string('reboot_required_reason').nullable());
};

exports.down = async function down(knex) {
  const hasDevices = await knex.schema.hasTable('devices');
  if (!hasDevices) return;
  await knex.schema.alterTable('devices', (table) => {
    table.dropColumn('battery_level');
    table.dropColumn('on_ac_power');
    table.dropColumn('active_user_session');
    table.dropColumn('idle_time_minutes');
    table.dropColumn('unsaved_word_docs');
    table.dropColumn('unsaved_excel_docs');
    table.dropColumn('open_browser_count');
    table.dropColumn('any_unsaved_changes');
    table.dropColumn('active_network_connections');
    table.dropColumn('reboot_required');
    table.dropColumn('reboot_required_reason');
  });
};
