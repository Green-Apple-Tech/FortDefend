const { BaseAgent } = require('./base');
const { defaultSafeRun, askDecisions } = require('./agentCommon');

class SelfHealer extends BaseAgent {
  constructor(deps) {
    super({
      name: 'Self Healer',
      schedule: '*/5 * * * *',
      orgId: deps.orgId,
      db: deps.db,
      anthropicClient: deps.anthropicClient,
      integrationManager: deps.integrationManager,
    });
  }

  async observe() {
    try {
      await this.db.raw('select 1 as ok');

      const errorLogs = await this.db('agent_logs')
        .where('org_id', this.orgId)
        .where(function () {
          this.where('action', 'like', '%error%')
            .orWhere('action', 'like', '%fatal%')
            .orWhere('action', 'run_error');
        })
        .orderBy('created_at', 'desc')
        .limit(50);

      const openAlerts = await this.db('alerts')
        .where('org_id', this.orgId)
        .where('resolved', false)
        .count('id as c')
        .first();

      let billingHint = null;
      try {
        const org = await this.db('orgs').where('id', this.orgId).select('subscription_status', 'plan').first();
        billingHint = org || null;
      } catch {
        billingHint = null;
      }

      const integ = await this.db('org_integrations').where('org_id', this.orgId).first();

      return {
        dbOk: true,
        errorLogs,
        openAlerts: parseInt(openAlerts?.c || 0, 10),
        billingHint,
        intuneEnabled: !!integ?.intune_enabled,
        googleEnabled: !!integ?.google_enabled,
      };
    } catch (e) {
      console.error('[Self Healer] observe:', e);
      return { dbOk: false, observeError: e.message };
    }
  }

  async think(data) {
    return askDecisions(this, {
      instruction:
        'You are Self Healer. Review agent error logs, open alert volume, billing hint. Decisions: action (noop|suggest_token_refresh|purge_stale_cache|alert_ops), message, rationale, severity optional. Never destructive.',
      data,
    });
  }

  async act(decisions) {
    try {
      for (const d of Array.isArray(decisions) ? decisions : []) {
        await this.log('self_heal_action', d, null).catch(() => {});
        const action = String(d?.action || '').toLowerCase();
        if (action.includes('alert')) {
          await this.alert(
            null,
            'self_healer',
            d?.severity === 'critical' ? 'critical' : 'warning',
            d?.message || 'Self Healer recommends operator attention',
            d?.rationale || ''
          ).catch(() => {});
        }
        if (action.includes('purge') || action.includes('cache')) {
          await this.log('self_heal_simulated', { note: 'Would purge stale server-side caches when implemented.' }, null).catch(() => {});
        }
      }
    } catch (e) {
      console.error('[Self Healer] act:', e);
      await this.log('act_error', { error: e.message }, null).catch(() => {});
    }
  }

  async run() {
    return defaultSafeRun(this);
  }
}

module.exports = { SelfHealer };
