const crypto = require('crypto');
const { Resend } = require('resend');

const db = require('../database');

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

function normalizeSeverity(severity) {
  const s = String(severity || 'info').toLowerCase();
  if (s === 'critical' || s === 'high') return 'critical';
  if (s === 'warning' || s === 'medium') return 'warning';
  return 'info';
}

function fingerprint(orgId, deviceId, type, message) {
  return crypto
    .createHash('sha256')
    .update([orgId, deviceId || '', type || '', message || ''].join('|'))
    .digest('hex');
}

/**
 * Insert alert, then email / Slack / Teams if configured.
 * Skips outbound duplicate delivery when the same fingerprint existed in the last hour.
 */
async function sendAlert({ orgId, deviceId, type, severity, message, aiAnalysis }) {
  const sev = normalizeSeverity(severity);
  const fp = fingerprint(orgId, deviceId, type, message);

  const recent = await db('alerts')
    .where({ org_id: orgId, type })
    .where('message', message)
    .whereRaw("created_at > now() - interval '1 hour'")
    .modify((q) => {
      if (deviceId) q.andWhere('device_id', deviceId);
      else q.whereNull('device_id');
    })
    .first();

  if (recent) {
    return { deduplicated: true, alertId: recent.id, fingerprint: fp };
  }

  const [row] = await db('alerts')
    .insert({
      org_id: orgId,
      device_id: deviceId || null,
      type,
      severity: sev,
      message,
      ai_analysis: aiAnalysis != null ? String(aiAnalysis) : null,
      resolved: false,
    })
    .returning('id');

  const alertId = row && typeof row === 'object' ? row.id : row;

  const integration = await db('org_integrations').where('org_id', orgId).first();
  const org = await db('orgs').where('id', orgId).first();
  const orgName = org?.name || 'FortDefend';

  const title = `[${sev.toUpperCase()}] ${type}`;
  const bodyText = [
    `Organization: ${orgName}`,
    message,
    aiAnalysis ? `\n--- AI analysis ---\n${aiAnalysis}` : '',
    deviceId ? `\nDevice ID: ${deviceId}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const tasks = [];

  if (integration?.email_alerts_enabled !== false && resend && process.env.FROM_EMAIL) {
    tasks.push(
      (async () => {
        const admins = await db('users')
          .where({ org_id: orgId, role: 'admin' })
          .where('email_verified', true)
          .select('email')
          .limit(25);
        const to = admins.map((u) => u.email).filter(Boolean);
        if (!to.length) return;
        await resend.emails.send({
          from: process.env.FROM_EMAIL,
          to,
          subject: `${title} — ${orgName}`,
          text: bodyText,
        });
      })().catch((e) => console.error('[notifications] Resend error:', e.message))
    );
  }

  if (integration?.slack_webhook_url) {
    tasks.push(
      fetch(integration.slack_webhook_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: `*${title}*\n${orgName}\n${message}`,
          attachments: aiAnalysis
            ? [{ color: sev === 'critical' ? 'danger' : 'warning', text: String(aiAnalysis).slice(0, 3000) }]
            : undefined,
        }),
      })
        .then((r) => {
          if (!r.ok) throw new Error(`Slack HTTP ${r.status}`);
        })
        .catch((e) => console.error('[notifications] Slack error:', e.message))
    );
  }

  if (integration?.teams_webhook_url) {
    const card = {
      '@type': 'MessageCard',
      '@context': 'https://schema.org/extensions',
      themeColor: sev === 'critical' ? 'B91C1C' : sev === 'warning' ? 'CA8A04' : '2563EB',
      summary: title,
      title,
      text: bodyText.slice(0, 4000),
    };
    tasks.push(
      fetch(integration.teams_webhook_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(card),
      })
        .then((r) => {
          if (!r.ok) throw new Error(`Teams HTTP ${r.status}`);
        })
        .catch((e) => console.error('[notifications] Teams error:', e.message))
    );
  }

  await Promise.all(tasks);

  return { deduplicated: false, alertId, fingerprint: fp };
}

module.exports = { sendAlert, normalizeSeverity, fingerprint };
