const db = require('../database');

/**
 * Best-effort audit row; never throws to callers.
 * @param {{ orgId: string, userId?: string|null, action: string, resource?: string|null, details?: object|null }} p
 */
async function recordAudit(p) {
  try {
    await db('audit_log').insert({
      org_id: p.orgId,
      user_id: p.userId || null,
      action: p.action,
      resource: p.resource || null,
      ip_address: null,
      user_agent: null,
      details: p.details != null ? p.details : null,
      created_at: new Date(),
    });
  } catch (err) {
    console.error('recordAudit:', err.message);
  }
}

module.exports = { recordAudit };
