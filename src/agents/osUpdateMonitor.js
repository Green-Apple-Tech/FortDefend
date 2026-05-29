const { BaseAgent } = require('./base');
const { defaultSafeRun, askDecisions, devicesBaseQuery } = require('./agentCommon');

class OsUpdateMonitor extends BaseAgent {
  constructor(deps) {
    super({
      name: 'OS Update Monitor',
      schedule: '0 7 * * *',
      orgId: deps.orgId,
      db: deps.db,
      anthropicClient: deps.anthropicClient,
      integrationManager: deps.integrationManager,
    });
  }

  async observe() {
    try {
      const devices = await devicesBaseQuery(this.db, this.orgId).select(
        'id',
        'name',
        'os',
        'os_version',
        'last_seen'
      );
      const scans = await this.db('scan_results')
        .where('org_id', this.orgId)
        .whereRaw(
          "(result::text ilike '%windows update%' OR result::text ilike '%chromeos%' OR result::text ilike '%aue%' OR result::text ilike '%autoUpdate%')"
        )
        .orderBy('created_at', 'desc')
        .limit(200);
      return { devices, updateScans: scans };
    } catch (e) {
      console.error('[OS Update Monitor] observe:', e);
      return { devices: [], updateScans: [] };
    }
  }

  async think(data) {
    return askDecisions(this, {
      instruction:
        'You are OS Update Monitor. Assess Windows Update / ChromeOS version / AUE risk. Decisions: deviceId, risk (low|medium|high), action (alert|schedule_update_suggestion|ignore), message, rationale, aueDate if known.',
      data,
    });
  }

  async act(decisions) {
    try {
      for (const d of Array.isArray(decisions) ? decisions : []) {
        const deviceId = d?.deviceId || d?.device_id || null;
        await this.log('os_update_action', d, deviceId).catch(() => {});
        if (String(d?.risk || '').toLowerCase() === 'high' || d?.action === 'alert') {
          await this.alert(
            deviceId,
            'os_update_risk',
            'warning',
            d?.message || 'OS update or AUE risk detected',
            d?.rationale || ''
          ).catch(() => {});
        }
      }
    } catch (e) {
      console.error('[OS Update Monitor] act:', e);
      await this.log('act_error', { error: e.message }, null).catch(() => {});
    }
  }

  async run() {
    return defaultSafeRun(this);
  }
}

module.exports = { OsUpdateMonitor };
