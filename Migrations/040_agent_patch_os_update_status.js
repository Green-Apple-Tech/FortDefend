exports.up = async function up(knex) {
  const hasDevices = await knex.schema.hasTable('devices');
  if (!hasDevices) return;

  const addColumn = async (name, cb) => {
    const exists = await knex.schema.hasColumn('devices', name);
    if (!exists) {
      await knex.schema.alterTable('devices', (table) => cb(table));
    }
  };

  await addColumn('patch_status', (t) => t.string('patch_status').nullable());
  await addColumn('patch_last_scan_at', (t) => t.timestamp('patch_last_scan_at').nullable());
  await addColumn('patch_last_error', (t) => t.text('patch_last_error').nullable());
  await addColumn('patch_last_action', (t) => t.string('patch_last_action').nullable());
  await addColumn('patch_blocked_reason', (t) => t.text('patch_blocked_reason').nullable());
  await addColumn('os_update_status', (t) => t.string('os_update_status').nullable());
  await addColumn('os_update_last_scan_at', (t) => t.timestamp('os_update_last_scan_at').nullable());
  await addColumn('os_update_available_count', (t) => t.integer('os_update_available_count').nullable());
  await addColumn('os_update_last_error', (t) => t.text('os_update_last_error').nullable());
  await addColumn('maintenance_state', (t) => t.jsonb('maintenance_state').nullable());

  await knex.raw(`
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'sm_commands_command_type_enum') THEN
    ALTER TYPE sm_commands_command_type_enum ADD VALUE IF NOT EXISTS 'patch_scan';
    ALTER TYPE sm_commands_command_type_enum ADD VALUE IF NOT EXISTS 'os_update';
  END IF;
END $$;
  `);
};

exports.down = async function down(knex) {
  const hasDevices = await knex.schema.hasTable('devices');
  if (!hasDevices) return;

  const columns = [
    'patch_status',
    'patch_last_scan_at',
    'patch_last_error',
    'patch_last_action',
    'patch_blocked_reason',
    'os_update_status',
    'os_update_last_scan_at',
    'os_update_available_count',
    'os_update_last_error',
    'maintenance_state',
  ];

  for (const column of columns) {
    const exists = await knex.schema.hasColumn('devices', column);
    if (exists) {
      await knex.schema.alterTable('devices', (table) => {
        table.dropColumn(column);
      });
    }
  }
};
