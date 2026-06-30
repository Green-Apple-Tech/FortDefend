/**
 * Adds device columns required by endpoint agent heartbeats.
 * Safe for production: skips any column that already exists (e.g. partial migration history).
 */
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
  await addColumn('ram_total_gb', (t) => t.decimal('ram_total_gb', 8, 2).nullable());
  await addColumn('ram_usage_pct', (t) => t.decimal('ram_usage_pct', 5, 2).nullable());
  await addColumn('disk_free_pct', (t) => t.decimal('disk_free_pct', 5, 2).nullable());
  await addColumn('high_cpu_since', (t) => t.timestamp('high_cpu_since').nullable());
  await addColumn('high_ram_since', (t) => t.timestamp('high_ram_since').nullable());
  await addColumn('battery_level', (t) => t.integer('battery_level').nullable());
  await addColumn('battery_status', (t) => t.string('battery_status').nullable());
  await addColumn('battery_health', (t) => t.string('battery_health').nullable());
  await addColumn('on_ac_power', (t) => t.boolean('on_ac_power').nullable());
  await addColumn('active_user_session', (t) => t.boolean('active_user_session').nullable());
  await addColumn('idle_time_minutes', (t) => t.integer('idle_time_minutes').nullable());
  await addColumn('unsaved_word_docs', (t) => t.integer('unsaved_word_docs').nullable());
  await addColumn('unsaved_excel_docs', (t) => t.integer('unsaved_excel_docs').nullable());
  await addColumn('open_browser_count', (t) => t.integer('open_browser_count').nullable());
  await addColumn('any_unsaved_changes', (t) => t.boolean('any_unsaved_changes').nullable());
  await addColumn('active_network_connections', (t) => t.integer('active_network_connections').nullable());
  await addColumn('reboot_required', (t) => t.boolean('reboot_required').nullable());
  await addColumn('reboot_required_reason', (t) => t.string('reboot_required_reason').nullable());
  await addColumn('pending_update', (t) => t.boolean('pending_update').nullable().defaultTo(false));
};

exports.down = async function down(knex) {
  const hasDevices = await knex.schema.hasTable('devices');
  if (!hasDevices) return;

  const dropColumn = async (name) => {
    const exists = await knex.schema.hasColumn('devices', name);
    if (exists) {
      await knex.schema.alterTable('devices', (table) => {
        table.dropColumn(name);
      });
    }
  };

  const columns = [
    'os_build',
    'ram_total_gb',
    'ram_usage_pct',
    'disk_free_pct',
    'high_cpu_since',
    'high_ram_since',
    'battery_level',
    'battery_status',
    'battery_health',
    'on_ac_power',
    'active_user_session',
    'idle_time_minutes',
    'unsaved_word_docs',
    'unsaved_excel_docs',
    'open_browser_count',
    'any_unsaved_changes',
    'active_network_connections',
    'reboot_required',
    'reboot_required_reason',
    'pending_update',
  ];

  for (const name of columns) {
    await dropColumn(name);
  }
};
