const { BaseAgent } = require('./base');
const { defaultSafeRun, askDecisions, devicesBaseQuery } = require('./agentCommon');

class ThreatHunter extends BaseAgent {
  constructor(deps) {
    super({
      name: 'Threat Hunter',
      schedule: '0 * * * *',
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
        'serial',
        'last_seen',
        'compliance_state'
      );
      const scans = await this.db('scan_results')
        .where('org_id', this.orgId)
        .orderBy('created_at', 'desc')
        .limit(500);
      const latest = new Map();
      for (const s of scans) {
        if (!latest.has(s.device_id)) latest.set(s.device_id, s);
      }
      const findings = [];
      for (const [deviceId, row] of latest) {
        const r = row.result;
        const blob = typeof r === 'string' ? r : JSON.stringify(r || {});
        const lower = blob.toLowerCase();
        const hit =
          /clam|defender|malware|threat|quarantine|virus|trojan|hash|ioc|suspicious/.test(lower) ||
          row.status === 'fail';
        if (hit) {
          findings.push({
            deviceId,
            scanId: row.id,
            status: row.status,
            agentName: row.agent_name,
            snippet: blob.slice(0, 4000),
          });
        }
      }
      return { devices, findings, observedAt: new Date().toISOString() };
    } catch (e) {
      console.error('[Threat Hunter] observe:', e);
      return { devices: [], findings: [] };
    }
  }

  async think(data) {
    return askDecisions(this, {
      instruction:
        'You are Threat Hunter. From findings (ClamAV/Defender-style scan excerpts), decide actions: each decision has action (hash_lookup|quarantine|alert|ignore), deviceId, fileHash optional, message, rationale, severity (critical|warning|info). Prefer quarantine or hash_lookup for confirmed malware signals.',
      data,
    });
  }

  async act(decisions) {
    try {
      const list = Array.isArray(decisions) ? decisions : [];
      for (const d of list) {
        const deviceId = d?.deviceId || d?.device_id || null;
        const action = String(d?.action || d?.type || '').toLowerCase();
        await this.log('threat_action', { action, decision: d }, deviceId).catch(() => {});
        if (action.includes('alert') || d?.severity === 'critical' || d?.severity === 'warning') {
          await this.alert(
            deviceId,
            'threat_detection',
            d?.severity === 'critical' ? 'critical' : 'warning',
            d?.message || 'Potential threat requires review',
            d?.rationale || JSON.stringify(d).slice(0, 2000)
          ).catch(() => {});
        }
        if (action.includes('quarantine') || action.includes('hash')) {
          await this.log('threat_remediation_simulated', { action, note: 'Server-side agent would push quarantine/hash lookup to endpoint.' }, deviceId).catch(() => {});
        }
      }
    } catch (e) {
      console.error('[Threat Hunter] act:', e);
      await this.log('act_error', { error: e.message }, null).catch(() => {});
    }
  }

  async run() {
    return defaultSafeRun(this);
  }
}

module.exports = { ThreatHunter };
