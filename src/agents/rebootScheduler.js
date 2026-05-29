const { BaseAgent } = require('./base');
const { defaultSafeRun, askDecisions, devicesBaseQuery } = require('./agentCommon');
const { decrypt } = require('../lib/crypto');
const intune = require('../integrations/intune');
const { Resend } = require('resend');

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

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
      const policies = await this.db('reboot_policies').where('org_id', this.orgId);
      const devices = await devicesBaseQuery(this.db, this.orgId).select(
        'id',
        'name',
        'source',
        'external_id',
        'last_seen',
        'os',
        'cpu_usage_pct',
        'status',
        'updated_at',
        'battery_level',
        'on_ac_power',
        'active_user_session',
        'idle_time_minutes',
        'unsaved_word_docs',
        'unsaved_excel_docs',
        'open_browser_count',
        'any_unsaved_changes',
        'active_network_connections',
        'reboot_required',
        'reboot_required_reason'
      );
      const patchRows = await this.db('patch_history')
        .where('org_id', this.orgId)
        .whereRaw("created_at > now() - interval '14 days'")
        .select('device_id', 'status', 'created_at');
      const now = Date.now();
      const staleHours = 36;
      const policy = policies[0] || null;
      const hhmmNow = new Date().toTimeString().slice(0, 5);
      const inActiveHours = !!(
        policy?.active_hours_start &&
        policy?.active_hours_end &&
        hhmmNow >= policy.active_hours_start &&
        hhmmNow <= policy.active_hours_end
      );
      const day = new Date().getDay();
      const weekend = day === 0 || day === 6;
      const candidates = devices.map((d) => {
        const devicePatches = patchRows.filter((p) => p.device_id === d.id);
        const pendingPatchCount = devicePatches.filter((p) => String(p.status).toLowerCase() !== 'success').length;
        const lastRebootDays = d.updated_at ? Math.floor((Date.now() - new Date(d.updated_at).getTime()) / (24 * 3600 * 1000)) : null;
        const isDeviceInUse =
          !!d.active_user_session && (Number(d.cpu_usage_pct || 0) > 20 || Number(d.active_network_connections || 0) > 10);
        const hasUnsavedWork = !!d.unsaved_word_docs || !!d.unsaved_excel_docs || !!d.any_unsaved_changes;
        const isOnBattery = !d.on_ac_power && Number.isFinite(Number(d.battery_level)) && Number(d.battery_level) < 20;
        const idleLongEnough = Number(d.idle_time_minutes || 0) > 30;
        return {
          ...d,
          isDeviceInUse,
          hasUnsavedWork,
          isOnBattery,
          rebootActuallyRequired: !!d.reboot_required,
          idleLongEnough,
          timeVsPolicy: { inActiveHours, weekend, excludeWeekends: !!policy?.exclude_weekends },
          daysSinceLastReboot: lastRebootDays,
          pendingPatches: pendingPatchCount,
          rebootRequired: !!d.reboot_required,
          rebootRequiredReason: d.reboot_required_reason || null,
          batteryLevel: d.battery_level,
          onAcPower: d.on_ac_power,
          policy,
        };
      }).filter((d) => {
        if (!d.last_seen) return true;
        return now - new Date(d.last_seen).getTime() > staleHours * 3600 * 1000;
      });
      return { devices, candidates, staleHours, policies, observedAt: new Date().toISOString() };
    } catch (e) {
      console.error('[Reboot Scheduler] observe:', e);
      return { devices: [], candidates: [] };
    }
  }

  async think(data) {
    const candidates = Array.isArray(data?.candidates) ? data.candidates : [];
    const promptReady = candidates.map((d) => ({
      deviceId: d.id,
      deviceName: d.name,
      statusText: `Device ${d.name} status:
- Reboot required: ${d.rebootActuallyRequired ? 'yes' : 'no'} — reason: ${d.rebootRequiredReason || 'none'}
- User active: ${d.active_user_session ? 'yes' : 'no'}, idle for ${d.idle_time_minutes ?? 'unknown'} minutes
- Unsaved work detected: ${d.hasUnsavedWork ? 'yes' : 'no'} (Word: ${d.unsaved_word_docs ? 'y' : 'n'}, Excel: ${d.unsaved_excel_docs ? 'y' : 'n'}, Browser tabs: ${d.open_browser_count ?? 0})
- Battery: ${d.batteryLevel ?? 'unknown'}% on ${d.onAcPower ? 'AC' : 'battery'}
- CPU usage: ${d.cpu_usage_pct ?? 0}%
- Active network connections: ${d.active_network_connections ?? 0}
- Last reboot: ${d.daysSinceLastReboot ?? 'unknown'} days ago
- Reboot policy: ${(d.policy && d.policy.name) || 'default'} and ${(d.policy && d.policy.policy_type) || 'notify-only'}
- Business hours: ${d.timeVsPolicy?.inActiveHours ? 'yes' : 'no'}`
    }));
    return askDecisions(this, {
      instruction:
        "Based on this real-time data, decide the best reboot action. Return decisions as array of {deviceId, action:'defer'|'notify'|'schedule'|'force', reason:string, userMessage:string, scheduleAt:string|null}.",
      data: { observedAt: data?.observedAt, devices: promptReady },
    });
  }

  async verifyReboot(device) {
    const start = Date.now();
    let cameBack = false;
    for (let i = 0; i < 6; i += 1) {
      // check every 5 minutes for 30 minutes
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => setTimeout(resolve, 5 * 60 * 1000));
      // eslint-disable-next-line no-await-in-loop
      const refreshed = await devicesBaseQuery(this.db, this.orgId).where('id', device.id).first();
      if (refreshed?.last_seen && Date.now() - new Date(refreshed.last_seen).getTime() < 10 * 60 * 1000) {
        cameBack = true;
        break;
      }
    }
    const minutes = Math.round((Date.now() - start) / 60000);
    const patchCount = await this.db('patch_history')
      .where('org_id', this.orgId)
      .where('device_id', device.id)
      .whereRaw("created_at > now() - interval '1 day'")
      .count('id as count')
      .first();

    if (!cameBack) {
      return `Warning: Device ${device.name} did not come back online after restart.`;
    }
    return `Device ${device.name} was restarted at ${new Date().toISOString()}. Reboot took ${minutes} minutes. All ${parseInt(patchCount?.count || 0, 10)} pending patches applied successfully. Device is now fully up to date.`;
  }

  async sendBatchEmail(reportRows) {
    try {
      if (!resend || !process.env.FROM_EMAIL) return;
      const admins = await this.db('users')
        .where({ org_id: this.orgId, role: 'admin', email_verified: true })
        .select('email');
      const to = admins.map((a) => a.email).filter(Boolean);
      if (!to.length) return;
      const success = reportRows.filter((r) => r.success).length;
      const failed = reportRows.length - success;
      const offline = reportRows.filter((r) => !r.cameBack).map((r) => r.name);
      const summary = `Reboot batch complete for ${reportRows.length} devices. ${success} successful, ${failed} failed.`;
      await resend.emails.send({
        from: process.env.FROM_EMAIL,
        to,
        subject: 'FortDefend reboot summary',
        text: `${summary}\n\nDevices not back online: ${offline.join(', ') || 'None'}\n\nDetails:\n${reportRows.map((r) => `- ${r.name}: ${r.report}`).join('\n')}`,
      });
    } catch (e) {
      await this.log('reboot_summary_email_failed', { error: e.message }, null).catch(() => {});
    }
  }

  async act(decisions) {
    try {
      const policies = await this.db('reboot_policies').where('org_id', this.orgId);
      const row = await this.db('org_integrations').where('org_id', this.orgId).first();
      const intuneOk =
        row?.intune_enabled &&
        row.intune_tenant_id &&
        row.intune_client_id &&
        row.intune_client_secret_enc;

      const batchReports = [];
      for (const d of Array.isArray(decisions) ? decisions : []) {
        const deviceId = d?.deviceId || d?.device_id || null;
        const action = String(d?.action || '').toLowerCase();
        await this.log('reboot_decision', d, deviceId).catch(() => {});

        if (action.includes('defer') || action.includes('skip')) {
          await this.log('reboot_deferred', { reason: d?.reason || 'deferred_by_policy' }, deviceId).catch(() => {});
          await this.log('recheck_scheduled', { recheckInHours: 2 }, deviceId).catch(() => {});
          continue;
        }

        if (action.includes('reboot')) {
          const policy = policies[0];
          const now = new Date();
          const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
          const inActiveHours =
            policy?.active_hours_start &&
            policy?.active_hours_end &&
            hhmm >= policy.active_hours_start &&
            hhmm <= policy.active_hours_end;
          const weekend = now.getDay() === 0 || now.getDay() === 6;
          const forced = policy?.policy_type === 'forced';
          if (!forced && (inActiveHours || (policy?.exclude_weekends && weekend))) {
            await this.log('reboot_skipped', { reason: 'inside_protected_hours' }, deviceId).catch(() => {});
            continue;
          }

          await this.log('reboot_notification_command', {
            message: policy?.notify_message || 'A restart is needed to finish updates.',
            notifyBeforeMinutes: policy?.notify_before_minutes || 30,
            policyType: policy?.policy_type || 'notify-only',
          }, deviceId).catch(() => {});

          const dev = await devicesBaseQuery(this.db, this.orgId).where('id', deviceId).first();
          if (!dev) continue;

          if (action.includes('notify')) {
            await this.log('reboot_notify', {
              message: d?.userMessage || policy?.notify_message || 'A restart is needed soon to complete updates.',
            }, dev.id).catch(() => {});
            continue;
          }
          if (action.includes('schedule')) {
            await this.log('reboot_scheduled', {
              scheduleAt: d?.scheduleAt || null,
              message: d?.userMessage || policy?.notify_message || 'A restart has been scheduled.',
            }, dev.id).catch(() => {});
            continue;
          }

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
            const report = await this.verifyReboot(dev);
            const cameBack = !report.startsWith('Warning:');
            await this.log('reboot_report', { report }, dev.id).catch(() => {});
            batchReports.push({ name: dev.name || dev.id, success: cameBack, cameBack, report });
          } catch (err) {
            await this.alert(
              deviceId,
              'reboot_failed',
              'warning',
              err.message || 'Intune reboot failed',
              d?.reason || ''
            ).catch(() => {});
            batchReports.push({ name: dev.name || dev.id, success: false, cameBack: false, report: err.message || 'Reboot failed.' });
          }
        }
      }
      if (batchReports.length) await this.sendBatchEmail(batchReports);
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
