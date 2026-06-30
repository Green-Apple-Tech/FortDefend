const db = require('../database');
const { findBuiltinScript } = require('../seed/defaultScripts');

const PAYLOAD_MARKER = '__fortdefend_command_payload';
const LEGACY_SCRIPT_WINGET_PREFIX = '__fd_script__:';
const COMMAND_TYPES = ['run_script', 'patch_scan', 'os_update'];

async function hasCommandPayloadColumn() {
  const hasCommands = await db.schema.hasTable('sm_commands');
  if (!hasCommands) return false;
  return db.schema.hasColumn('sm_commands', 'command_payload');
}

async function ensureCommandTypeSupportsScripts() {
  const col = await db.raw(`
    SELECT data_type, udt_name
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'sm_commands'
      AND column_name = 'command_type'
  `);
  const row = col.rows?.[0];
  if (!row) return;

  if (row.data_type === 'text' || row.data_type === 'character varying') return;

  try {
    await db.raw(`
      ALTER TABLE sm_commands
      ALTER COLUMN command_type TYPE text USING command_type::text
    `);
    return;
  } catch (err) {
    console.error('[schema] widen command_type to text failed:', err?.message);
  }

  for (const value of COMMAND_TYPES) {
    try {
      await db.raw(`ALTER TYPE sm_commands_command_type_enum ADD VALUE IF NOT EXISTS '${value}'`);
    } catch (err) {
      const msg = String(err?.message || '');
      if (msg.includes('already exists')) continue;
      try {
        await db.raw(`ALTER TYPE sm_commands_command_type_enum ADD VALUE '${value}'`);
      } catch (inner) {
        const innerMsg = String(inner?.message || '');
        if (!innerMsg.includes('already exists')) {
          console.error(`[schema] add enum value ${value} failed:`, innerMsg);
        }
      }
    }
  }
}

async function ensureCommandPayloadColumn() {
  const hasCommands = await db.schema.hasTable('sm_commands');
  if (!hasCommands) return false;

  try {
    await db.raw('ALTER TABLE sm_commands ADD COLUMN IF NOT EXISTS command_payload JSONB');
  } catch (err) {
    console.error('[schema] add command_payload column failed:', err?.message);
  }

  await ensureCommandTypeSupportsScripts();

  return hasCommandPayloadColumn();
}

async function ensureCommandSchemaReady() {
  const hasCommands = await db.schema.hasTable('sm_commands');
  if (!hasCommands) {
    return { ok: false, reason: 'sm_commands_missing', hasPayload: false };
  }
  const hasPayload = await ensureCommandPayloadColumn();
  return { ok: true, hasPayload };
}

function compactScriptPayload(payload = {}) {
  if (!payload || typeof payload !== 'object') return payload;
  const scriptId = payload.scriptId ? String(payload.scriptId) : '';
  if (scriptId.startsWith('builtin:') && payload.scriptContent) {
    const { scriptContent, ...rest } = payload;
    return rest;
  }
  return payload;
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

function isLegacyScriptCommand(row = {}) {
  return String(row.winget_id || '').startsWith(LEGACY_SCRIPT_WINGET_PREFIX);
}

function normalizeQueuedCommandType(row = {}) {
  if (isLegacyScriptCommand(row)) return 'run_script';
  return row.command_type;
}

function resolveScriptPayloadForAgent(payload = {}) {
  const resolved = { ...payload };
  if (String(resolved.scriptContent || '').trim()) return resolved;
  const scriptId = resolved.scriptId ? String(resolved.scriptId) : '';
  if (!scriptId) return resolved;
  const builtin = findBuiltinScript(scriptId);
  if (!builtin) return resolved;
  return {
    ...resolved,
    scriptName: resolved.scriptName || builtin.name,
    scriptType: resolved.scriptType || builtin.script_type,
    scriptContent: builtin.content,
  };
}

async function queueScriptCommandRows({ orgId, userId, devices, wingetKey, payload, hasPayloadColumn, now }) {
  const compactPayload = compactScriptPayload(payload);
  const returningCols = ['id', 'device_id', 'status', 'created_at'];
  const strategies = [
    { commandType: 'run_script', wingetId: wingetKey, usePayloadColumn: hasPayloadColumn, payloadData: payload },
    { commandType: 'run_script', wingetId: wingetKey, usePayloadColumn: false, payloadData: compactPayload },
    {
      commandType: 'update',
      wingetId: `${LEGACY_SCRIPT_WINGET_PREFIX}${wingetKey}`,
      usePayloadColumn: false,
      payloadData: compactPayload,
    },
    {
      commandType: 'install',
      wingetId: `${LEGACY_SCRIPT_WINGET_PREFIX}${wingetKey}`,
      usePayloadColumn: false,
      payloadData: compactPayload,
      omitInitiatedBy: true,
    },
  ];

  let lastErr = null;
  for (const strategy of strategies) {
    try {
      const queued = [];
      for (const device of devices) {
        const row = {
          org_id: orgId,
          device_id: device.id,
          winget_id: strategy.wingetId,
          command_type: strategy.commandType,
          status: 'pending',
          ...encodePayloadFields(strategy.payloadData, strategy.usePayloadColumn),
          created_at: now,
          updated_at: now,
        };
        if (!strategy.omitInitiatedBy) {
          row.initiated_by = userId || null;
        }
        const [inserted] = await db('sm_commands').insert(row).returning(returningCols);
        queued.push(inserted);
      }
      return queued;
    } catch (err) {
      lastErr = err;
      console.error(`[scripts] queue strategy ${strategy.commandType} failed:`, err?.message);
    }
  }

  throw lastErr || new Error('Failed to queue script command.');
}

function scriptQueueErrorMessage(err) {
  const msg = String(err?.message || err || '');
  if (msg.includes('sm_commands_command_type_enum') || /invalid input value for enum/i.test(msg)) {
    return 'Script commands are not enabled in this database yet. Run migrations to add run_script support.';
  }
  if (msg.includes('command_payload')) {
    return 'Script command payload storage is not available yet. Run database migrations.';
  }
  if (msg.includes('foreign key') || msg.includes('violates foreign key')) {
    return 'One or more selected devices could not be queued. Refresh the device list and try again.';
  }
  return 'Failed to queue script command. Please try again.';
}

module.exports = {
  PAYLOAD_MARKER,
  LEGACY_SCRIPT_WINGET_PREFIX,
  hasCommandPayloadColumn,
  ensureCommandPayloadColumn,
  ensureCommandSchemaReady,
  encodePayloadFields,
  decodeCommandPayload,
  isLegacyScriptCommand,
  normalizeQueuedCommandType,
  resolveScriptPayloadForAgent,
  queueScriptCommandRows,
  scriptQueueErrorMessage,
};
