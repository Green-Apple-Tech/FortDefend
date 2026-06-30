const { BaseAgent } = require('./base');
const { defaultSafeRun, askDecisions, devicesBaseQuery } = require('./agentCommon');

class WifiSecurityChecker extends BaseAgent {
  constructor(deps) {
    super({
      name: 'Wi-Fi Security Checker',
      schedule: '0 */6 * * *',
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
          "(result::text ilike '%wifi%' OR result::text ilike '%wi-fi%' OR result::text ilike '%wep%' OR result::text ilike '%802.11%' OR result::text ilike '%ssid%')"
        )
        .orderBy('created_at', 'desc')
        .limit(200);
      return { devices, wifiScans: scans };
    } catch (e) {
      console.error('[Wi-Fi Security Checker] observe:', e);
      return { devices: [], wifiScans: [] };
    }
  }

  async think(data) {
    return askDecisions(this, {
      instruction:
        'You are Wi-Fi Security Checker. Flag open networks, WEP, or weak encryption. Decisions: deviceId, ssid, securityType, risk (low|high), action (alert|ignore), message, rationale.',
      data,
    });
  }

  async act(decisions) {
    try {
      for (const d of Array.isArray(decisions) ? decisions : []) {
        const deviceId = d?.deviceId || d?.device_id || null;
        await this.log('wifi_assessment', d, deviceId).catch(() => {});
        const sec = String(d?.securityType || '').toLowerCase();
        const risky = sec.includes('open') || sec.includes('wep') || String(d?.risk || '').toLowerCase() === 'high';
        if (risky || d?.action === 'alert') {
          await this.alert(
            deviceId,
            'wifi_security',
            'critical',
            d?.message || 'Insecure Wi-Fi configuration detected',
            d?.rationale || ''
          ).catch(() => {});
        }
      }
    } catch (e) {
      console.error('[Wi-Fi Security Checker] act:', e);
      await this.log('act_error', { error: e.message }, null).catch(() => {});
    }
  }

  async run() {
    return defaultSafeRun(this);
  }
}

module.exports = { WifiSecurityChecker };
