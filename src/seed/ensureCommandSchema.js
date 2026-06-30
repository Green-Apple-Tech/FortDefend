const { ensureCommandSchemaReady } = require('../utils/commandPayload');

async function ensureCommandSchema() {
  try {
    const result = await ensureCommandSchemaReady();
    if (!result.ok) {
      console.warn('[schema] sm_commands table is missing; command queue is unavailable.');
      return { ok: false, reason: 'sm_commands_missing' };
    }
    return { ok: true };
  } catch (err) {
    console.error('[schema] ensureCommandSchema failed:', err?.message);
    return { ok: false, reason: err?.message || 'ensure_failed' };
  }
}

module.exports = { ensureCommandSchema };
