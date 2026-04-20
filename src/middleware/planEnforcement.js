const db = require('../database');

const SAAS_PLANS = ['personal', 'starter', 'growth', 'scale'];

function rankForPlan(plan) {
  if (!plan) return 0;
  const i = SAAS_PLANS.indexOf(plan);
  if (i >= 0) return i + 1;
  if (plan === 'msp_starter') return 2;
  if (plan === 'msp_growth') return 3;
  if (plan === 'msp_scale') return 5;
  return 0;
}

/**
 * Blocks when the org already has at least as many devices as device_limit.
 * Use on routes that enroll or register a new device.
 */
function checkDeviceLimit(req, res, next) {
  (async () => {
    try {
      const org = await db('orgs').where('id', req.user.orgId).first();
      if (!org) {
        return res.status(404).json({ error: 'Organization not found.' });
      }

      const row = await db('devices')
        .where('org_id', req.user.orgId)
        .count('id as count')
        .first();

      const deviceCount = parseInt(row.count, 10);
      const limit = org.device_limit != null ? parseInt(org.device_limit, 10) : 5;

      if (deviceCount >= limit) {
        return res.status(402).json({
          error: `Device limit reached (${limit} devices). Upgrade your plan to add more.`,
          code: 'DEVICE_LIMIT',
        });
      }

      next();
    } catch (err) {
      console.error('checkDeviceLimit error:', err);
      res.status(500).json({ error: 'Failed to verify device limit.' });
    }
  })();
}

/**
 * Requires the org's plan to be at least `minPlan` (one of personal|starter|growth|scale).
 * Compares SaaS tiers; MSP plans are treated as at least growth-level for gating.
 */
function requirePlan(minPlan) {
  if (!SAAS_PLANS.includes(minPlan)) {
    throw new Error(`requirePlan: invalid minPlan "${minPlan}"`);
  }

  const minRank = rankForPlan(minPlan);

  return (req, res, next) => {
    (async () => {
      try {
        const org = await db('orgs').where('id', req.user.orgId).first();
        if (!org) {
          return res.status(404).json({ error: 'Organization not found.' });
        }

        if (rankForPlan(org.plan) < minRank) {
          return res.status(403).json({
            error: 'This feature requires a higher subscription plan.',
            code: 'PLAN_REQUIRED',
            requiredPlan: minPlan,
          });
        }

        next();
      } catch (err) {
        console.error('requirePlan error:', err);
        res.status(500).json({ error: 'Failed to verify subscription plan.' });
      }
    })();
  };
}

module.exports = { checkDeviceLimit, requirePlan, rankForPlan, SAAS_PLANS };
