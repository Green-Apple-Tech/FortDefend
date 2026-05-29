const cron = require('node-cron');
const db = require('../database');
const { Resend } = require('resend');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { isTrialExpired, isGraceExpired, getGraceEndDate } = require('../config/plans');

const resend = new Resend(process.env.RESEND_API_KEY);

async function getAdminEmail(orgId) {
  const user = await db('users').where({ org_id: orgId, role: 'admin' }).first();
  return user?.email || null;
}

async function sendReminderEmail(org, daysLeft) {
  const email = await getAdminEmail(org.id);
  if (!email) return;
  await resend.emails.send({
    from: process.env.FROM_EMAIL,
    to: email,
    subject: `Your FortDefend trial ends in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`,
    html: `
      <p>Your FortDefend free trial ends in <strong>${daysLeft} day${daysLeft === 1 ? '' : 's'}</strong>.</p>
      <p>Everything you have set up — devices, agents, scan history, security scores — is preserved when you upgrade.</p>
      <p>
        <a href="${process.env.APP_URL}/billing"
           style="background:#185FA5;color:#fff;padding:12px 24px;
                  border-radius:6px;text-decoration:none;font-weight:bold">
          Activate my plan
        </a>
      </p>
      <p style="color:#8a887e;font-size:12px">
        Your card will not be charged until you click Activate my plan.
        If you do nothing, your account pauses on day 10 and your card is never charged.
      </p>
    `,
  });
}

async function sendExpiredEmail(org) {
  const email = await getAdminEmail(org.id);
  if (!email) return;
  await resend.emails.send({
    from: process.env.FROM_EMAIL,
    to: email,
    subject: 'Your FortDefend trial has ended',
    html: `
      <p>Your 10-day FortDefend trial has ended and your account is now paused.</p>
      <p><strong>Your card has not been charged.</strong></p>
      <p>Your data is safely stored. You have 48 hours to activate before your subscription cancels.</p>
      <p>
        <a href="${process.env.APP_URL}/billing"
           style="background:#185FA5;color:#fff;padding:12px 24px;
                  border-radius:6px;text-decoration:none;font-weight:bold">
          Activate my plan now
        </a>
      </p>
    `,
  });
}

async function sendGraceCanceledEmail(org) {
  const email = await getAdminEmail(org.id);
  if (!email) return;
  await resend.emails.send({
    from: process.env.FROM_EMAIL,
    to: email,
    subject: 'Your FortDefend account has been paused',
    html: `
      <p>Your FortDefend account has been paused and your subscription canceled.</p>
      <p><strong>Your card was never charged.</strong></p>
      <p>Your data is kept for 30 days. You can reactivate at any time.</p>
      <p>
        <a href="${process.env.APP_URL}/pricing"
           style="background:#185FA5;color:#fff;padding:12px 24px;
                  border-radius:6px;text-decoration:none;font-weight:bold">
          Reactivate my account
        </a>
      </p>
      <p style="color:#8a887e;font-size:12px">
        Data will be permanently deleted after 30 days if you do not reactivate.
      </p>
    `,
  });
}

async function runTrialChecks() {
  const now = new Date();

  const trialing = await db('orgs')
    .where({ subscription_status: 'trialing' })
    .whereNotNull('trial_ends_at');

  for (const org of trialing) {
    const msLeft = new Date(org.trial_ends_at) - now;
    const daysLeft = Math.ceil(msLeft / 86400000);

    if (daysLeft <= 3 && daysLeft > 1 && !org.trial_reminder_7_sent) {
      await sendReminderEmail(org, daysLeft);
      await db('orgs').where({ id: org.id })
        .update({ trial_reminder_7_sent: true, updated_at: new Date() });
    }

    if (daysLeft <= 1 && daysLeft > 0 && !org.trial_reminder_9_sent) {
      await sendReminderEmail(org, 1);
      await db('orgs').where({ id: org.id })
        .update({ trial_reminder_9_sent: true, updated_at: new Date() });
    }

    if (isTrialExpired(org.trial_ends_at) && !org.is_read_only) {
      const graceEndsAt = getGraceEndDate(org.trial_ends_at);
      await db('orgs').where({ id: org.id }).update({
        is_read_only: true,
        grace_ends_at: graceEndsAt,
        updated_at: new Date(),
      });
      await sendExpiredEmail(org);
    }
  }

  const graceExpired = await db('orgs')
    .where({ is_read_only: true })
    .whereNotNull('grace_ends_at')
    .whereNot({ subscription_status: 'canceled' })
    .whereNot({ subscription_status: 'active' });

  for (const org of graceExpired) {
    if (!isGraceExpired(org.grace_ends_at)) continue;
    if (org.stripe_subscription_id) {
      try {
        await stripe.subscriptions.cancel(org.stripe_subscription_id);
      } catch (err) {
        console.error(`Stripe cancel failed for org ${org.id}:`, err.message);
      }
    }
    await db('orgs').where({ id: org.id }).update({
      subscription_status: 'canceled',
      stripe_subscription_id: null,
      updated_at: new Date(),
    });
    await sendGraceCanceledEmail(org);
  }
}

function startTrialMonitor() {
  cron.schedule('0 * * * *', runTrialChecks);
  console.log('[FortDefend] Trial monitor started');
}

module.exports = { startTrialMonitor, runTrialChecks };
