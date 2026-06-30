const db = require('../database');

const PAYLOAD_MARKER = '__fortdefend_command_payload';

async function hasCommandPayloadColumn() {
  const hasCommands = await db.schema.hasTable('sm_commands');
  if (!hasCommands) return false;
  return db.schema.hasColumn('sm_commands', 'command_payload');
}

async function ensureCommandPayloadColumn() {
  const hasCommands = await db.schema.hasTable('sm_commands');
  if (!hasCommands) return false;

  await db.raw('ALTER TABLE sm_commands ADD COLUMN IF NOT EXISTS command_payload JSONB');

  await db.raw(`
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'sm_commands_command_type_enum') THEN
    ALTER TYPE sm_commands_command_type_enum ADD VALUE IF NOT EXISTS 'run_script';
    ALTER TYPE sm_commands_command_type_enum ADD VALUE IF NOT EXISTS 'patch_scan';
    ALTER TYPE sm_commands_command_type_enum ADD VALUE IF NOT EXISTS 'os_update';
  END IF;
END $$;
  `);

  return hasCommandPayloadColumn();
}

function encodePayloadFields(payload, hasPayloadColumn) {
  if (hasPayloadColumn) {
    return { command_payload: payload };
  }
  return {
    output: JSON.stringify({ [PAYLOAD_MARKER]: payload }),
  };
}

function decodeCommandPayload(row = {}) {
  if (row.command_payload) {
    if (typeof row.command_payload === 'object') return row.command_payload;
    try {
      return JSON.parse(row.command_payload);
    } catch {
      return {};
    }
  }
  if (row.output) {
    try {
      const parsed = JSON.parse(row.output);
      if (parsed && parsed[PAYLOAD_MARKER]) return parsed[PAYLOAD_MARKER];
    } catch {
      return {};
    }
  }
  return {};
}

module.exports = {
  PAYLOAD_MARKER,
  hasCommandPayloadColumn,
  ensureCommandPayloadColumn,
  encodePayloadFields,
  decodeCommandPayload,
};
