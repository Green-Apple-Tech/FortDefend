const db = require('../database');

async function ensureCommandSchema() {
  const hasCommands = await db.schema.hasTable('sm_commands');
  if (!hasCommands) {
    console.warn('[schema] sm_commands table is missing; script queue is unavailable.');
    return { ok: false, reason: 'sm_commands_missing' };
  }

  const hasPayload = await db.schema.hasColumn('sm_commands', 'command_payload');
  if (!hasPayload) {
    console.log('[schema] Adding sm_commands.command_payload');
    await db.schema.alterTable('sm_commands', (table) => {
      table.jsonb('command_payload').nullable();
    });
  }

  await db.raw(`
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'sm_commands_command_type_enum') THEN
    ALTER TYPE sm_commands_command_type_enum ADD VALUE IF NOT EXISTS 'run_script';
    ALTER TYPE sm_commands_command_type_enum ADD VALUE IF NOT EXISTS 'patch_scan';
    ALTER TYPE sm_commands_command_type_enum ADD VALUE IF NOT EXISTS 'os_update';
  END IF;
END $$;
  `);

  return { ok: true };
}

module.exports = { ensureCommandSchema };
