const { BaseAgent } = require('./base');
const { defaultSafeRun, askDecisions, devicesBaseQuery } = require('./agentCommon');
const { Resend } = require('resend');

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

class WeeklyReportWriter extends BaseAgent {
  constructor(deps) {
    super({
      name: 'Weekly Report Writer',
      schedule: '0 8 * * 1',
      orgId: deps.orgId,
      db: deps.db,
      anthropicClient: deps.anthropicClient,
      integrationManager: deps.integrationManager,
    });
  }

  async observe() {
    try {
      const org = await this.db('orgs').where('id', this.orgId).first();
      const deviceCount = await devicesBaseQuery(this.db, this.orgId).count('id as c').first();
      const alertCount = await this.db('alerts')
        .where('org_id', this.orgId)
        .where('resolved', false)
        .count('id as c')
        .first();
      const recentAlerts = await this.db('alerts')
        .where('org_id', this.orgId)
        .orderBy('created_at', 'desc')
        .limit(20);
      const scanCount = await this.db('scan_results').where('org_id', this.orgId).count('id as c').first();
      let patchStats = [];
      try {
        patchStats = await this.db('patch_history')
          .where('org_id', this.orgId)
          .select('status')
          .count('* as c')
          .groupBy('status');
      } catch {
        patchStats = [];
      }

      return {
        orgName: org?.name,
        deviceCount: parseInt(deviceCount?.c || 0, 10),
        openAlerts: parseInt(alertCount?.c || 0, 10),
        scanCount: parseInt(scanCount?.c || 0, 10),
        recentAlerts,
        patchStats,
        period: 'last_7_days_placeholder',
      };
    } catch (e) {
      console.error('[Weekly Report Writer] observe:', e);
      return {};
    }
  }

  async think(data) {
    return askDecisions(this, {
      instruction:
        'You are Weekly Report Writer. From org stats, write an executive summary (2-4 paragraphs) and 3-5 bullet risks. JSON: {"decisions":[{"action":"send_report","htmlBody":"<html safe summary>","subject":"..."}],"summary":"..."}  decisions may be a single send_report with htmlBody plain HTML (no scripts).',
      data,
    });
  }

  async act(decisions) {
    try {
      const list = Array.isArray(decisions) ? decisions : [];
      const report = list.find((d) => String(d?.action || '').toLowerCase().includes('send_report')) || list[0];
      const htmlBody =
        report?.htmlBody ||
        `<p><b>FortDefend weekly report</b></p><p>${report?.summary || report?.textSummary || 'No summary.'}</p>`;
      const subject = report?.subject || 'FortDefend weekly security report';

      await this.log('weekly_report_draft', { subject, length: htmlBody.length }, null).catch(() => {});

      if (resend && process.env.FROM_EMAIL) {
        const admins = await this.db('users')
          .where({ org_id: this.orgId, role: 'admin' })
          .where('email_verified', true)
          .select('email')
          .limit(25);
        const to = admins.map((u) => u.email).filter(Boolean);
        if (to.length) {
          await resend.emails.send({
            from: process.env.FROM_EMAIL,
            to,
            subject,
            html: `${htmlBody}<hr><p><small>Delivered as HTML report (PDF export can be added client-side).</small></p>`,
          });
          await this.log('weekly_report_sent', { recipients: to.length }, null).catch(() => {});
        }
      } else {
        await this.alert(
          null,
          'weekly_report',
          'info',
          'Weekly report generated (configure RESEND_API_KEY and FROM_EMAIL to email PDF/HTML).',
          htmlBody.replace(/<[^>]+>/g, ' ').slice(0, 4000)
        ).catch(() => {});
      }
    } catch (e) {
      console.error('[Weekly Report Writer] act:', e);
      await this.log('act_error', { error: e.message }, null).catch(() => {});
    }
  }

  async run() {
    return defaultSafeRun(this);
  }
}

module.exports = { WeeklyReportWriter };
