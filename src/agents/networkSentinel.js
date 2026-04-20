const { BaseAgent } = require('./base');
const { defaultSafeRun, askDecisions, devicesBaseQuery } = require('./agentCommon');

class NetworkSentinel extends BaseAgent {
  constructor(deps) {
    super({
      name: 'Network Sentinel',
      schedule: '0 */4 * * *',
      orgId: deps.orgId,
      db: deps.db,
      anthropicClient: deps.anthropicClient,
      integrationManager: deps.integrationManager,
    });
  }

  async observe() {
    try {
      const devices = await devicesBaseQuery(this.db, this.orgId).select('id', 'name', 'last_seen');
      const scans = await this.db('scan_results')
        .where('org_id', this.orgId)
        .whereRaw("(result::text ilike '%connection%' OR result::text ilike '%netstat%' OR result::text ilike '%socket%')")
        .orderBy('created_at', 'desc')
        .limit(200);
      const connections = scans.map((s) => ({
        deviceId: s.device_id,
        scanId: s.id,
        createdAt: s.created_at,
        result: s.result,
      }));
      return { devices, connections };
    } catch (e) {
      console.error('[Network Sentinel] observe:', e);
      return { devices: [], connections: [] };
    }
  }

  async think(data) {
    return askDecisions(this, {
      instruction:
        'You are Network Sentinel. Review connection telemetry vs threat feeds (infer from data). Decisions: deviceId, remoteHost, verdict (benign|suspicious|malicious), action (alert|block_suggestion|ignore), message, rationale, severity.',
      data,
    });
  }

  async act(decisions) {
    try {
      for (const d of Array.isArray(decisions) ? decisions : []) {
        const deviceId = d?.deviceId || d?.device_id || null;
        await this.log('network_verdict', d, deviceId).catch(() => {});
        const v = String(d?.verdict || '').toLowerCase();
        if (v === 'suspicious' || v === 'malicious' || d?.action === 'alert') {
          await this.alert(
            deviceId,
            'network_threat',
            v === 'malicious' ? 'critical' : 'warning',
            d?.message || `Suspicious connection ${d?.remoteHost || ''}`,
            d?.rationale || ''
          ).catch(() => {});
        }
      }
    } catch (e) {
      console.error('[Network Sentinel] act:', e);
      await this.log('act_error', { error: e.message }, null).catch(() => {});
    }
  }

  async run() {
    return defaultSafeRun(this);
  }
}

module.exports = { NetworkSentinel };
