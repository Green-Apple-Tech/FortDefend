const { BaseAgent } = require('./base');
const { decrypt } = require('../lib/crypto');
const intune = require('../integrations/intune');

const AGENT_NAME = 'Patch Guardian';
const SCHEDULE = '0 2 * * *';

const CRITICAL_HINTS =
  /\b(cve|security|defender|antimalware|ransom|0-?day|critical|openssl|tls\s*1\.|chrome|edge|firefox|webkit|java\s*runtime|\.net|dotnet|kernel|windows\s*11|windows\s*10|kb\d{6,})\b/i;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Pull pending winget-style updates from scan_results.result JSON (flexible shapes).
 * @param {unknown} result
 * @returns {{ id: string, name?: string, available?: string, current?: string }[]}
 */
function extractPendingWinget(result) {
  try {
    if (result == null) return [];
    if (typeof result === 'string') {
      try {
        return extractPendingWinget(JSON.parse(result));
      } catch {
        return [];
      }
    }
    if (Array.isArray(result)) {
      return result
        .map((row) => ({
          id: row.Id || row.id || row.packageId || row.PackageIdentifier || '',
          name: row.Name || row.name || row.title,
          available: row.Available || row.availableVersion || row.latest,
          current: row.Version || row.version || row.installed,
        }))
        .filter((r) => r.id);
    }
    if (typeof result !== 'object') return [];

    const r = /** @type {Record<string, unknown>} */ (result);

    const buckets = [
      r.pendingWingetUpdates,
      r.wingetPendingUpdates,
      r.pendingUpdates,
      r.winget?.pending,
      r.winget?.updates,
      r.packages,
    ].find((b) => Array.isArray(b));

    if (buckets) {
      return extractPendingWinget(buckets);
    }

    if (Array.isArray(r.updates)) {
      return extractPendingWinget(
        r.updates.filter((u) => {
          const src = String((u && u.source) || (u && u.manager) || '').toLowerCase();
          return !src || src.includes('winget');
        })
      );
    }

    return [];
  } catch {
    return [];
  }
}

class PatchGuardian extends BaseAgent {
  constructor({ orgId, db, anthropicClient, integrationManager }) {
    super({
      name: AGENT_NAME,
      schedule: SCHEDULE,
      orgId,
      db,
      anthropicClient,
      integrationManager,
    });
  }

  /**
   * Devices for this org + latest scan result per device + parsed winget pending updates.
   */
  async observe() {
    try {
      const devices = await this.db('devices')
        .where('org_id', this.orgId)
        .select('id', 'name', 'serial', 'source', 'external_id', 'os');

      const scans = await this.db('scan_results')
        .where('org_id', this.orgId)
        .orderBy('created_at', 'desc');

      const latestByDevice = new Map();
      for (const s of scans) {
        if (!latestByDevice.has(s.device_id)) {
          latestByDevice.set(s.device_id, s);
        }
      }

      const pendingPatches = [];

      for (const d of devices) {
        try {
          const scan = latestByDevice.get(d.id);
          const updates = extractPendingWinget(scan?.result);
          if (updates.length) {
            pendingPatches.push({
              deviceId: d.id,
              deviceName: d.name,
              source: d.source,
              scanStatus: scan?.status || null,
              scanAt: scan?.created_at || null,
              updates,
            });
          }
        } catch (inner) {
          await this.log(
            'observe_device_skipped',
            { deviceId: d.id, error: inner.message || String(inner) },
            d.id
          ).catch(() => {});
        }
      }

      return {
        devices,
        pendingPatches,
        observedAt: new Date().toISOString(),
      };
    } catch (err) {
      console.error(`[${AGENT_NAME}] observe error:`, err);
      try {
        await this.log(
          'observe_error',
          { error: err.message || String(err) },
          null
        );
      } catch {
        /* ignore */
      }
      return { devices: [], pendingPatches: [], observedAt: new Date().toISOString(), error: true };
    }
  }

  _thinkHeuristic(data) {
    const decisions = [];
    const pending = data?.pendingPatches || [];
    for (const block of pending) {
      for (const u of block.updates || []) {
        const label = `${u.id} ${u.name || ''} ${u.available || ''}`;
        const priority = CRITICAL_HINTS.test(label) ? 'critical' : 'optional';
        decisions.push({
          deviceId: block.deviceId,
          wingetId: u.id,
          priority,
          rationale: priority === 'critical' ? 'Heuristic: security-related package' : 'Heuristic: non-security update',
        });
      }
    }
    return {
      decisions,
      summary: `Heuristic triage for ${decisions.length} pending winget update(s).`,
    };
  }

  /**
   * Use Claude to label each pending update as critical vs optional.
   */
  async think(data) {
    try {
      if (!this.anthropicClient) {
        return this._thinkHeuristic(data);
      }

      const pending = data?.pendingPatches || [];
      if (!pending.length) {
        return { decisions: [], summary: 'No pending winget updates.' };
      }

      const model = process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022';
      const payload = JSON.stringify({ pendingPatches: pending }, null, 2);
      const truncated = payload.length > 120_000 ? `${payload.slice(0, 120_000)}\n…[truncated]` : payload;

      const msg = await this.anthropicClient.messages.create({
        model,
        max_tokens: 2048,
        messages: [
          {
            role: 'user',
            content:
              `You are "${AGENT_NAME}" for FortDefend. Each item in pendingPatches is a device with winget updates from the latest scan.\n` +
              `Classify every update as "critical" (security/CVE/zero-day/ransomware/browser-OS/runtime/defender/openssl/.NET) or "optional" (cosmetic, minor app bumps).\n` +
              `Reply with **only valid JSON** (no markdown fences):\n` +
              `{"decisions":[{"deviceId":"<uuid>","wingetId":"<winget package id>","priority":"critical|optional","rationale":"short"}],"summary":"one sentence"}\n` +
              `Include one decision row per update. Use exact deviceId and wingetId from the input.\n\n` +
              truncated,
          },
        ],
      });

      const textBlock = msg.content?.find((b) => b.type === 'text');
      const raw = textBlock?.text?.trim() || '{}';
      let parsed;
      try {
        parsed = JSON.parse(raw.replace(/^```json\s*/i, '').replace(/```\s*$/i, ''));
      } catch {
        return this._thinkHeuristic(data);
      }

      if (!Array.isArray(parsed.decisions)) {
        return this._thinkHeuristic(data);
      }

      const allowedDevices = new Set((data.devices || []).map((d) => d.id));
      parsed.decisions = parsed.decisions.filter(
        (d) =>
          d &&
          allowedDevices.has(d.deviceId) &&
          typeof d.wingetId === 'string' &&
          d.wingetId.length > 0
      );

      return {
        decisions: parsed.decisions,
        summary: parsed.summary || 'Patch triage complete.',
      };
    } catch (err) {
      console.error(`[${AGENT_NAME}] think error:`, err);
      try {
        await this.log('think_error', { error: err.message || String(err) }, null);
      } catch {
        /* ignore */
      }
      return this._thinkHeuristic(data);
    }
  }

  async _getIntuneCredentials() {
    const row = await this.db('org_integrations').where('org_id', this.orgId).first();
    if (!row?.intune_enabled || !row.intune_tenant_id || !row.intune_client_id || !row.intune_client_secret_enc) {
      return null;
    }
    return {
      tenantId: row.intune_tenant_id,
      clientId: row.intune_client_id,
      clientSecret: decrypt(row.intune_client_secret_enc),
    };
  }

  /**
   * @param {unknown[]} decisions
   */
  async act(decisions) {
    try {
      const list = Array.isArray(decisions) ? decisions : [];
      const critical = list.filter(
        (d) => d && String(d.priority || '').toLowerCase() === 'critical' && d.wingetId && d.deviceId
      );

      if (!critical.length) {
        await this.log('act_skip', { reason: 'no_critical_decisions' }, null).catch(() => {});
        return;
      }

      const creds = await this._getIntuneCredentials().catch(() => null);
      if (!creds) {
        await this.log('act_skip', { reason: 'intune_not_configured' }, null).catch(() => {});
        return;
      }

      const byPackage = new Map();
      for (const d of critical) {
        const id = String(d.wingetId);
        if (!byPackage.has(id)) byPackage.set(id, []);
        byPackage.get(id).push(d);
      }

      const failedByDevice = new Map();

      for (const [wingetId, rows] of byPackage.entries()) {
        let lastErr = null;
        let ok = false;
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            await this.log(
              'winget_push_attempt',
              { wingetId, attempt, maxAttempts: 3 },
              rows[0]?.deviceId || null
            ).catch(() => {});

            await intune.pushWingetScript(
              wingetId,
              creds.tenantId,
              creds.clientId,
              creds.clientSecret
            );
            ok = true;
            await this.log(
              'winget_push_ok',
              { wingetId, attempt },
              rows[0]?.deviceId || null
            ).catch(() => {});
            break;
          } catch (err) {
            lastErr = err;
            await this.log(
              'winget_push_error',
              { wingetId, attempt, error: err.message || String(err) },
              rows[0]?.deviceId || null
            ).catch(() => {});
            if (attempt < 3) {
              await sleep(1500 * attempt).catch(() => {});
            }
          }
        }

        if (!ok && lastErr) {
          for (const row of rows) {
            const id = row.deviceId;
            if (!failedByDevice.has(id)) failedByDevice.set(id, []);
            failedByDevice.get(id).push(wingetId);
          }
        }
      }

      for (const [deviceId, pkgIds] of failedByDevice.entries()) {
        try {
          const unique = [...new Set(pkgIds)];
          await this.alert(
            deviceId,
            'patch_push_failed',
            'warning',
            `Patch Guardian could not deploy ${unique.length} critical winget update(s) after 3 attempts: ${unique.join(', ')}`,
            `Last push failures for package id(s): ${unique.join(', ')}. Check Intune permissions, Graph scopes, and tenant connectivity.`
          );
        } catch (alertErr) {
          console.error(`[${AGENT_NAME}] alert error:`, alertErr);
          await this.log(
            'alert_failed',
            { deviceId, error: alertErr.message || String(alertErr) },
            deviceId
          ).catch(() => {});
        }
      }
    } catch (err) {
      console.error(`[${AGENT_NAME}] act error:`, err);
      try {
        await this.log('act_error', { error: err.message || String(err) }, null);
      } catch {
        /* ignore */
      }
    }
  }

  /**
   * Hardened run: never throws; logs each stage failure independently.
   */
  async run() {
    try {
      const data = await this.observe().catch(async (e) => {
        console.error(`[${AGENT_NAME}] observe (fatal catch):`, e);
        try {
          await this.log('observe_fatal', { error: e.message || String(e) }, null);
        } catch {
          /* ignore */
        }
        return { devices: [], pendingPatches: [] };
      });

      const thought = await this.think(data).catch(async (e) => {
        console.error(`[${AGENT_NAME}] think (fatal catch):`, e);
        try {
          await this.log('think_fatal', { error: e.message || String(e) }, null);
        } catch {
          /* ignore */
        }
        return { decisions: [], summary: '' };
      });

      await this.act(thought.decisions || []).catch(async (e) => {
        console.error(`[${AGENT_NAME}] act (fatal catch):`, e);
        try {
          await this.log('act_fatal', { error: e.message || String(e) }, null);
        } catch {
          /* ignore */
        }
      });

      try {
        await this.log('run_complete', {
          success: true,
          summary: thought.summary || null,
          decisionCount: Array.isArray(thought.decisions) ? thought.decisions.length : 0,
        });
      } catch {
        /* ignore */
      }
    } catch (err) {
      console.error(`[${AGENT_NAME}] run outer error:`, err);
      try {
        await this.log('run_outer_fatal', { error: err.message || String(err) }, null);
      } catch {
        /* ignore */
      }
    }
  }
}

/**
 * Factory for scheduler registration.
 * @param {string} orgId
 * @param {{ db: import('knex').Knex, anthropicClient?: unknown, integrationManager?: unknown }} deps
 */
function createPatchGuardian(orgId, deps) {
  return [
    new PatchGuardian({
      orgId,
      db: deps.db,
      anthropicClient: deps.anthropicClient,
      integrationManager: deps.integrationManager,
    }),
  ];
}

module.exports = {
  PatchGuardian,
  createPatchGuardian,
  PATCH_GUARDIAN_SCHEDULE: SCHEDULE,
};
