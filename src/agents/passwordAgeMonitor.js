const { BaseAgent } = require('./base');
const { defaultSafeRun, askDecisions, devicesBaseQuery } = require('./agentCommon');

class PasswordAgeMonitor extends BaseAgent {
  constructor(deps) {
    super({
      name: 'Password Age Monitor',
      schedule: '0 8 * * 1',
      orgId: deps.orgId,
      db: deps.db,
      anthropicClient: deps.anthropicClient,
      integrationManager: deps.integrationManager,
    });
  }

  async observe() {
    try {
      const devices = await devicesBaseQuery(this.db, this.orgId).select('id', 'name');
      const scans = await this.db('scan_results')
        .where('org_id', this.orgId)
        .whereRaw("(result::text ilike '%password%' OR result::text ilike '%credential%' OR agent_name ilike '%password%')")
        .orderBy('created_at', 'desc')
        .limit(200);
      return { devices, passwordScans: scans };
    } catch (e) {
      console.error('[Password Age Monitor] observe:', e);
      return { devices: [], passwordScans: [] };
    }
  }

  async think(data) {
    return askDecisions(this, {
      instruction:
        'You are Password Age Monitor. Infer local account password ages from scan JSON. Decisions: deviceId, account, ageDays, policyMaxDays, action (alert|ignore), severity, message, rationale.',
      data,
    });
  }

  async act(decisions) {
    try {
      for (const d of Array.isArray(decisions) ? decisions : []) {
        const deviceId = d?.deviceId || d?.device_id || null;
        await this.log('password_age_review', d, deviceId).catch(() => {});
        if (d?.action === 'alert' || (d?.ageDays && d?.policyMaxDays && Number(d.ageDays) > Number(d.policyMaxDays))) {
          await this.alert(
            deviceId,
            'password_age',
            'warning',
            d?.message || 'Password age policy concern',
            d?.rationale || ''
          ).catch(() => {});
        }
      }
    } catch (e) {
      console.error('[Password Age Monitor] act:', e);
      await this.log('act_error', { error: e.message }, null).catch(() => {});
    }
  }

  async run() {
    return defaultSafeRun(this);
  }
}

module.exports = { PasswordAgeMonitor };
