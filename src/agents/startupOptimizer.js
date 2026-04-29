const { BaseAgent } = require('./base');
const { defaultSafeRun, askDecisions, devicesBaseQuery } = require('./agentCommon');

class StartupOptimizer extends BaseAgent {
  constructor(deps) {
    super({
      name: 'Startup Optimizer',
      schedule: '0 3 * * 0',
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
        .whereRaw("(result::text ilike '%startup%' OR result::text ilike '%Run%' OR agent_name ilike '%startup%')")
        .orderBy('created_at', 'desc')
        .limit(200);
      const startupRows = [];
      for (const s of scans) {
        startupRows.push({
          deviceId: s.device_id,
          scanId: s.id,
          createdAt: s.created_at,
          result: s.result,
        });
      }
      return { devices, startupRows };
    } catch (e) {
      console.error('[Startup Optimizer] observe:', e);
      return { devices: [], startupRows: [] };
    }
  }

  async think(data) {
    return askDecisions(this, {
      instruction:
        'You are Startup Optimizer. Classify startup entries as safe vs unnecessary. Each decision: deviceId, entryName, classification (safe|unnecessary|review), action (disable_suggestion|ignore|alert), message, rationale.',
      data,
    });
  }

  async act(decisions) {
    try {
      for (const d of Array.isArray(decisions) ? decisions : []) {
        const deviceId = d?.deviceId || d?.device_id || null;
        await this.log('startup_classification', d, deviceId).catch(() => {});
        if (String(d?.classification || '').toLowerCase() === 'unnecessary' || d?.action === 'alert') {
          await this.alert(
            deviceId,
            'startup_optimization',
            'info',
            d?.message || `Startup entry ${d?.entryName || 'unknown'} marked for review`,
            d?.rationale || ''
          ).catch(() => {});
        }
      }
    } catch (e) {
      console.error('[Startup Optimizer] act:', e);
      await this.log('act_error', { error: e.message }, null).catch(() => {});
    }
  }

  async run() {
    return defaultSafeRun(this);
  }
}

module.exports = { StartupOptimizer };
