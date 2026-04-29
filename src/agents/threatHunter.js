const { BaseAgent } = require('./base');
const { defaultSafeRun, askDecisions, devicesBaseQuery } = require('./agentCommon');

const DEFENDER_SIGNAL =
  /defender|get-mpthreat|get-mpcomputer|mpthreat|mpcomputer|windows\s*defender|antimalware|amsi|malware|threat|quarantine|virus|trojan|hash|ioc|suspicious|virustotal/i;

const SHA256_REGEX = /\b[a-f0-9]{64}\b/gi;

const VT_MAX_LOOKUPS_PER_RUN = 8;

/**
 * @param {string} text
 * @returns {string[]}
 */
function extractSha256Hashes(text) {
  if (!text || typeof text !== 'string') return [];
  const set = new Set();
  let m;
  const re = new RegExp(SHA256_REGEX);
  while ((m = re.exec(text)) !== null) {
    set.add(m[0].toLowerCase());
  }
  return [...set];
}

/**
 * VirusTotal file report (server-side). Requires VIRUSTOTAL_API_KEY.
 * @param {string} hashLower sha256 lowercase
 */
async function queryVirusTotalFileReport(hashLower) {
  const key = process.env.VIRUSTOTAL_API_KEY;
  if (!key || !/^[a-f0-9]{64}$/.test(hashLower)) return null;
  try {
    const res = await fetch(`https://www.virustotal.com/api/v3/files/${hashLower}`, {
      headers: { 'x-apikey': key },
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        hash: hashLower,
        ok: false,
        httpStatus: res.status,
        message: json?.error?.message || res.statusText,
      };
    }
    const data = json?.data?.attributes || {};
    const stats = data.last_analysis_stats || {};
    return {
      hash: hashLower,
      ok: true,
      malicious: stats.malicious ?? null,
      suspicious: stats.suspicious ?? null,
      undetected: stats.undetected ?? null,
      meaningfulName: data.meaningful_name || null,
      lastAnalysisDate: data.last_analysis_date || null,
    };
  } catch (e) {
    return { hash: hashLower, ok: false, message: e.message || String(e) };
  }
}

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
      const hashesToLookup = new Set();
      for (const [deviceId, row] of latest) {
        const r = row.result;
        const blob = typeof r === 'string' ? r : JSON.stringify(r || {});
        const lower = blob.toLowerCase();
        const hit = DEFENDER_SIGNAL.test(lower) || row.status === 'fail';
        if (hit) {
          extractSha256Hashes(blob).forEach((h) => hashesToLookup.add(h));
          findings.push({
            deviceId,
            scanId: row.id,
            status: row.status,
            agentName: row.agent_name,
            snippet: blob.slice(0, 4000),
          });
        }
      }

      const virusTotal = [];
      const hashList = [...hashesToLookup].slice(0, VT_MAX_LOOKUPS_PER_RUN);
      for (const h of hashList) {
        try {
          const rep = await queryVirusTotalFileReport(h);
          if (rep) virusTotal.push(rep);
        } catch {
          /* ignore per-hash */
        }
      }

      return {
        devices,
        findings,
        virusTotal,
        observedAt: new Date().toISOString(),
        note: 'Telemetry is expected from Windows agents: Get-MpThreatDetection + Get-MpComputerStatus (see agent/agent.js).',
      };
    } catch (e) {
      console.error('[Threat Hunter] observe:', e);
      return { devices: [], findings: [], virusTotal: [] };
    }
  }

  async think(data) {
    return askDecisions(this, {
      instruction:
        'You are Threat Hunter. Findings come from Windows Defender telemetry in scan payloads (Get-MpThreatDetection / Get-MpComputerStatus style JSON from endpoints) and optional VirusTotal file reports in data.virusTotal (malicious/suspicious counts). Decide actions: each decision has action (hash_lookup|quarantine|alert|ignore), deviceId, fileHash optional, message, rationale, severity (critical|warning|info). Treat elevated VirusTotal malicious counts as high priority. Prefer alert for confirmed malware signals.',
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
          await this.log(
            'threat_remediation_simulated',
            {
              action,
              note: 'Server-side agent would coordinate Defender remediation / hash lookup on endpoint.',
            },
            deviceId
          ).catch(() => {});
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
