const { BaseAgent } = require('./base');
const { defaultSafeRun, askDecisions, devicesBaseQuery } = require('./agentCommon');

class ComplianceAuditor extends BaseAgent {
  constructor(deps) {
    super({
      name: 'Compliance Auditor',
      schedule: '0 6 * * *',
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
        'compliance_state',
        'os',
        'os_version'
      );
      const scans = await this.db('scan_results')
        .where('org_id', this.orgId)
        .whereRaw(
          "(result::text ilike '%firewall%' OR result::text ilike '%bitlocker%' OR result::text ilike '%uac%' OR result::text ilike '%secure boot%' OR result::text ilike '%tpm%')"
        )
        .orderBy('created_at', 'desc')
        .limit(200);
      return { devices, complianceScans: scans };
    } catch (e) {
      console.error('[Compliance Auditor] observe:', e);
      return { devices: [], complianceScans: [] };
    }
  }

  async think(data) {
    return askDecisions(this, {
      instruction:
        'You are Compliance Auditor. Evaluate firewall, BitLocker, UAC, Secure Boot signals. Decisions: deviceId, control (firewall|bitlocker|uac|secure_boot), state (ok|fail|unknown), action (restore_firewall_suggestion|alert|ignore), message, severity, rationale.',
      data,
    });
  }

  async act(decisions) {
    try {
      for (const d of Array.isArray(decisions) ? decisions : []) {
        const deviceId = d?.deviceId || d?.device_id || null;
        const action = String(d?.action || '').toLowerCase();
        await this.log('compliance_action', d, deviceId).catch(() => {});
        if (d?.state === 'fail' || action.includes('alert')) {
          await this.alert(
            deviceId,
            'compliance_gap',
            d?.severity === 'critical' ? 'critical' : 'warning',
            d?.message || 'Compliance control failed',
            d?.rationale || ''
          ).catch(() => {});
        }
        if (action.includes('restore_firewall')) {
          await this.log('firewall_restore_simulated', { note: 'Endpoint would re-enable firewall profile.' }, deviceId).catch(() => {});
        }
      }
    } catch (e) {
      console.error('[Compliance Auditor] act:', e);
      await this.log('act_error', { error: e.message }, null).catch(() => {});
    }
  }

  async run() {
    return defaultSafeRun(this);
  }
}

module.exports = { ComplianceAuditor };
