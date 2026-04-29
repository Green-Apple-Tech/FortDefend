const { BaseAgent } = require('./base');
const { defaultSafeRun, askDecisions, devicesBaseQuery } = require('./agentCommon');

class BackupVerifier extends BaseAgent {
  constructor(deps) {
    super({
      name: 'Backup Verifier',
      schedule: '0 10 * * *',
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
        .whereRaw(
          "(result::text ilike '%backup%' OR result::text ilike '%onedrive%' OR result::text ilike '%file history%' OR result::text ilike '%sync%')"
        )
        .orderBy('created_at', 'desc')
        .limit(200);
      return { devices, backupScans: scans };
    } catch (e) {
      console.error('[Backup Verifier] observe:', e);
      return { devices: [], backupScans: [] };
    }
  }

  async think(data) {
    return askDecisions(this, {
      instruction:
        'You are Backup Verifier. Assess Windows Backup / OneDrive sync health from scans. Decisions: deviceId, status (ok|degraded|fail), action (alert|ignore), message, rationale.',
      data,
    });
  }

  async act(decisions) {
    try {
      for (const d of Array.isArray(decisions) ? decisions : []) {
        const deviceId = d?.deviceId || d?.device_id || null;
        await this.log('backup_verdict', d, deviceId).catch(() => {});
        if (String(d?.status || '').toLowerCase() === 'fail' || d?.action === 'alert') {
          await this.alert(
            deviceId,
            'backup_health',
            'warning',
            d?.message || 'Backup or sync issue',
            d?.rationale || ''
          ).catch(() => {});
        }
      }
    } catch (e) {
      console.error('[Backup Verifier] act:', e);
      await this.log('act_error', { error: e.message }, null).catch(() => {});
    }
  }

  async run() {
    return defaultSafeRun(this);
  }
}

module.exports = { BackupVerifier };
