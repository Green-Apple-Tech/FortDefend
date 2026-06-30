exports.config = { transaction: false };

exports.up = async function up(knex) {
  const hasCommands = await knex.schema.hasTable('sm_commands');
  if (!hasCommands) return;

  const hasPayload = await knex.schema.hasColumn('sm_commands', 'command_payload');
  if (!hasPayload) {
    await knex.schema.alterTable('sm_commands', (table) => {
      table.jsonb('command_payload').nullable();
    });
  }

  await knex.raw(`
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'sm_commands_command_type_enum') THEN
    ALTER TYPE sm_commands_command_type_enum ADD VALUE IF NOT EXISTS 'run_script';
    ALTER TYPE sm_commands_command_type_enum ADD VALUE IF NOT EXISTS 'patch_scan';
    ALTER TYPE sm_commands_command_type_enum ADD VALUE IF NOT EXISTS 'os_update';
  END IF;
END $$;
  `);
};

exports.down = async function down() {
  // Enum values and columns are intentionally left in place.
};
