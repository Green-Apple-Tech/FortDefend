exports.config = { transaction: false };

exports.up = async function up(knex) {
  const hasCommands = await knex.schema.hasTable('sm_commands');
  if (!hasCommands) return;

  await knex.raw('ALTER TABLE sm_commands ADD COLUMN IF NOT EXISTS command_payload JSONB');

  const col = await knex.raw(`
    SELECT data_type, udt_name
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'sm_commands'
      AND column_name = 'command_type'
  `);
  const row = col.rows?.[0];
  if (!row) return;
  if (row.data_type === 'text' || row.data_type === 'character varying') return;

  await knex.raw(`
    ALTER TABLE sm_commands
    ALTER COLUMN command_type TYPE text USING command_type::text
  `);
};

exports.down = async function down() {
  // Intentionally no-op: reverting text back to enum is unsafe in production.
};
