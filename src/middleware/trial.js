const { isTrialExpired } = require('../config/plans');
const db = require('../database');

async function checkTrialStatus(req, res, next) {
  try {
    const org = await db('orgs').where({ id: req.user.orgId }).first();
    if (!org) return res.status(404).json({ error: 'Organisation not found.' });

    if (org.subscription_status === 'active') return next();

    if (org.trial_ends_at && !isTrialExpired(org.trial_ends_at)) return next();

    if (org.is_read_only) {
      if (req.method === 'GET') return next();
      if (req.path.includes('/billing/activate')) return next();

      const inGrace = org.grace_ends_at && new Date() < new Date(org.grace_ends_at);

      return res.status(402).json({
        error: 'trial_expired',
        inGracePeriod: !!inGrace,
        graceEndsAt: org.grace_ends_at,
        message: inGrace
          ? 'Your trial has ended. Click Activate plan to continue — your card will be charged now.'
          : 'Your account is paused. Start a new subscription to continue.',
        activateUrl: `${process.env.APP_URL}/billing`,
      });
    }

    next();
  } catch (err) { next(err); }
}

module.exports = { checkTrialStatus };
