exports.up = async function up(knex) {
  const hasDevices = await knex.schema.hasTable('devices');
  if (!hasDevices) return;

  const addColumn = async (name, cb) => {
    const exists = await knex.schema.hasColumn('devices', name);
    if (!exists) {
      await knex.schema.alterTable('devices', (table) => cb(table));
    }
  };

  await addColumn('hostname', (t) => t.string('hostname').nullable());
  await addColumn('logged_in_user', (t) => t.string('logged_in_user').nullable());
  await addColumn('cpu_model', (t) => t.string('cpu_model').nullable());
  await addColumn('ram_usage_pct', (t) => t.decimal('ram_usage_pct', 5, 2).nullable());
  await addColumn('disk_total_gb', (t) => t.decimal('disk_total_gb', 8, 2).nullable());
  await addColumn('disk_usage_pct', (t) => t.decimal('disk_usage_pct', 5, 2).nullable());
  await addColumn('disk_free_pct', (t) => t.decimal('disk_free_pct', 5, 2).nullable());
  await addColumn('battery_status', (t) => t.string('battery_status').nullable());
  await addColumn('battery_health', (t) => t.string('battery_health').nullable());
  await addColumn('agent_version', (t) => t.string('agent_version').nullable());
  await addColumn('os_outdated', (t) => t.boolean('os_outdated').notNullable().defaultTo(false));
  await addColumn('security_agent_running', (t) => t.boolean('security_agent_running').notNullable().defaultTo(true));
  await addColumn('high_cpu_since', (t) => t.timestamp('high_cpu_since').nullable());
  await addColumn('high_ram_since', (t) => t.timestamp('high_ram_since').nullable());
};

exports.down = async function down(knex) {
  const hasDevices = await knex.schema.hasTable('devices');
  if (!hasDevices) return;
  await knex.schema.alterTable('devices', (table) => {
    table.dropColumn('hostname');
    table.dropColumn('logged_in_user');
    table.dropColumn('cpu_model');
    table.dropColumn('ram_usage_pct');
    table.dropColumn('disk_total_gb');
    table.dropColumn('disk_usage_pct');
    table.dropColumn('disk_free_pct');
    table.dropColumn('battery_status');
    table.dropColumn('battery_health');
    table.dropColumn('agent_version');
    table.dropColumn('os_outdated');
    table.dropColumn('security_agent_running');
    table.dropColumn('high_cpu_since');
    table.dropColumn('high_ram_since');
  });
};
