const { BaseAgent } = require('./base');
const { defaultSafeRun, askDecisions, devicesBaseQuery } = require('./agentCommon');

const CPU_WARN = 90;
const DISK_FREE_GB_WARN = 5;
const RAM_GB_WARN = 2;

class HealthMonitor extends BaseAgent {
  constructor(deps) {
    super({
      name: 'Health Monitor',
      schedule: '*/15 * * * *',
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
        'cpu_usage_pct',
        'disk_free_gb',
        'ram_total_gb',
        'last_seen',
        'status'
      );
      const stressed = devices.filter((d) => {
        const cpu = d.cpu_usage_pct != null ? Number(d.cpu_usage_pct) : 0;
        const disk = d.disk_free_gb != null ? Number(d.disk_free_gb) : 999;
        const ram = d.ram_total_gb != null ? Number(d.ram_total_gb) : 999;
        return cpu >= CPU_WARN || disk <= DISK_FREE_GB_WARN || ram <= RAM_GB_WARN;
      });
      return { devices, stressed, thresholds: { CPU_WARN, DISK_FREE_GB_WARN, RAM_GB_WARN } };
    } catch (e) {
      console.error('[Health Monitor] observe:', e);
      return { devices: [], stressed: [] };
    }
  }

  async think(data) {
    return askDecisions(this, {
      instruction:
        'You are Health Monitor. Given devices and stressed list (CPU/RAM/disk), output decisions with action: alert|clear_temp|ignore, deviceId, message, severity, rationale. Recommend clear_temp for temp-file cleanup when disk low.',
      data,
    });
  }

  async act(decisions) {
    try {
      for (const d of Array.isArray(decisions) ? decisions : []) {
        const deviceId = d?.deviceId || d?.device_id || null;
        const action = String(d?.action || '').toLowerCase();
        await this.log('health_action', { action, decision: d }, deviceId).catch(() => {});
        if (action.includes('alert') || d?.severity) {
          await this.alert(
            deviceId,
            'resource_health',
            d?.severity === 'critical' ? 'critical' : 'warning',
            d?.message || 'Resource threshold exceeded',
            d?.rationale || ''
          ).catch(() => {});
        }
        if (action.includes('clear_temp')) {
          await this.log('clear_temp_requested', { note: 'Endpoint agent would clear temp directories.' }, deviceId).catch(() => {});
        }
      }
    } catch (e) {
      console.error('[Health Monitor] act:', e);
      await this.log('act_error', { error: e.message }, null).catch(() => {});
    }
  }

  async run() {
    return defaultSafeRun(this);
  }
}

module.exports = { HealthMonitor };
