const { BaseAgent } = require('./base');
const { defaultSafeRun, askDecisions, devicesBaseQuery } = require('./agentCommon');

class DriverHealthMonitor extends BaseAgent {
  constructor(deps) {
    super({
      name: 'Driver Health Monitor',
      schedule: '0 9 * * 1',
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
          "(result::text ilike '%driver%' OR result::text ilike '%bsod%' OR result::text ilike '%0x%' OR result::text ilike '%bugcheck%')"
        )
        .orderBy('created_at', 'desc')
        .limit(200);
      return { devices, driverScans: scans };
    } catch (e) {
      console.error('[Driver Health Monitor] observe:', e);
      return { devices: [], driverScans: [] };
    }
  }

  async think(data) {
    return askDecisions(this, {
      instruction:
        'You are Driver Health Monitor. Diagnose BSOD codes / driver errors from scan text. Decisions: deviceId, code, diagnosis, action (alert|driver_update_suggestion|ignore), severity, message, rationale.',
      data,
    });
  }

  async act(decisions) {
    try {
      for (const d of Array.isArray(decisions) ? decisions : []) {
        const deviceId = d?.deviceId || d?.device_id || null;
        await this.log('driver_diagnosis', d, deviceId).catch(() => {});
        if (d?.action === 'alert' || String(d?.severity || '').toLowerCase() === 'critical') {
          await this.alert(
            deviceId,
            'driver_health',
            d?.severity === 'critical' ? 'critical' : 'warning',
            d?.message || 'Driver or BSOD issue detected',
            `${d?.diagnosis || ''}\n${d?.rationale || ''}`.trim()
          ).catch(() => {});
        }
      }
    } catch (e) {
      console.error('[Driver Health Monitor] act:', e);
      await this.log('act_error', { error: e.message }, null).catch(() => {});
    }
  }

  async run() {
    return defaultSafeRun(this);
  }
}

module.exports = { DriverHealthMonitor };
