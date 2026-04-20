const { BaseAgent } = require('./base');
const { defaultSafeRun, askDecisions, devicesBaseQuery } = require('./agentCommon');
const { decrypt } = require('../lib/crypto');
const intune = require('../integrations/intune');

/**
 * Weekly reboot window. Per-org override: pass `rebootScheduleCron` in deps (e.g. from your org settings row when you add a column).
 * Fallback: env REBOOT_SCHEDULER_CRON or Sunday 04:00.
 */
function resolveRebootCron(deps) {
  return (
    deps.rebootScheduleCron ||
    process.env.REBOOT_SCHEDULER_CRON ||
    '0 4 * * 0'
  );
}

class RebootScheduler extends BaseAgent {
  constructor(deps) {
    const schedule = resolveRebootCron(deps);
    super({
      name: 'Reboot Scheduler',
      schedule,
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
        'source',
        'external_id',
        'last_seen',
        'os'
      );
      const now = Date.now();
      const staleHours = 36;
      const candidates = devices.filter((d) => {
        if (!d.last_seen) return true;
        return now - new Date(d.last_seen).getTime() > staleHours * 3600 * 1000;
      });
      return { devices, candidates, staleHours, observedAt: new Date().toISOString() };
    } catch (e) {
      console.error('[Reboot Scheduler] observe:', e);
      return { devices: [], candidates: [] };
    }
  }

  async think(data) {
    return askDecisions(this, {
      instruction:
        'You are Reboot Scheduler. Prefer reboot when maintenance window and no active user (use last_seen as weak proxy). Decisions: deviceId, action (reboot_now|defer|skip), reason, checkActiveUser (bool), message.',
      data,
    });
  }

  async act(decisions) {
    try {
      const row = await this.db('org_integrations').where('org_id', this.orgId).first();
      const intuneOk =
        row?.intune_enabled &&
        row.intune_tenant_id &&
        row.intune_client_id &&
        row.intune_client_secret_enc;

      for (const d of Array.isArray(decisions) ? decisions : []) {
        const deviceId = d?.deviceId || d?.device_id || null;
        const action = String(d?.action || '').toLowerCase();
        await this.log('reboot_decision', d, deviceId).catch(() => {});

        if (action.includes('defer') || action.includes('skip')) continue;

        if (action.includes('reboot')) {
          const dev = await devicesBaseQuery(this.db, this.orgId).where('id', deviceId).first();
          if (!dev?.external_id || dev.source !== 'intune' || !intuneOk) {
            await this.log('reboot_skipped', { reason: 'no_intune_device_or_config' }, deviceId).catch(() => {});
            continue;
          }
          try {
            const secret = decrypt(row.intune_client_secret_enc);
            await intune.restartDevice(
              dev.external_id,
              row.intune_tenant_id,
              row.intune_client_id,
              secret
            );
            await this.log('reboot_triggered', { externalId: dev.external_id }, deviceId).catch(() => {});
          } catch (err) {
            await this.alert(
              deviceId,
              'reboot_failed',
              'warning',
              err.message || 'Intune reboot failed',
              d?.reason || ''
            ).catch(() => {});
          }
        }
      }
    } catch (e) {
      console.error('[Reboot Scheduler] act:', e);
      await this.log('act_error', { error: e.message }, null).catch(() => {});
    }
  }

  async run() {
    return defaultSafeRun(this);
  }
}

module.exports = { RebootScheduler, resolveRebootCron };
