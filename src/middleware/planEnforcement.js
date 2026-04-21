const { getDeviceLimit, MSP_TEST_DEVICE_LIMIT } = require('../config/plans');
const db = require('../database');

async function checkDeviceLimit(req, res, next) {
  try {
    const org = await db('orgs').where({ id: req.user.orgId }).first();
    if (!org) return res.status(404).json({ error: 'Organisation not found.' });

    const limit = org.is_test_client
      ? MSP_TEST_DEVICE_LIMIT
      : (org.device_limit || getDeviceLimit(org.plan));

    const { n } = await db('devices')
      .where({ org_id: org.id }).count('id as n').first();
    const deviceCount = parseInt(n, 10);

    if (deviceCount >= limit) {
      return res.status(402).json({
        error: 'device_limit_reached',
        limit,
        current: deviceCount,
        message: org.is_test_client
          ? `Test sites are limited to ${MSP_TEST_DEVICE_LIMIT} devices. Upgrade to add more.`
          : `Your ${org.plan} plan allows up to ${limit} devices. Upgrade to add more.`,
      });
    }
    next();
  } catch (err) { next(err); }
}

async function getCapacityWarning(orgId) {
  try {
    const org = await db('orgs').where({ id: orgId }).first();
    const limit = org.device_limit || getDeviceLimit(org.plan);
    const { n } = await db('devices')
      .where({ org_id: orgId }).count('id as n').first();
    const deviceCount = parseInt(n, 10);
    const pct = Math.round((deviceCount / limit) * 100);
    return pct >= 80
      ? { warn: true, pct, deviceCount, limit, plan: org.plan }
      : { warn: false };
  } catch { return { warn: false }; }
}

function requirePlan(...allowedPlans) {
  return (req, res, next) => {
    if (!allowedPlans.includes(req.user.plan)) {
      return res.status(402).json({
        error: 'plan_upgrade_required',
        required: allowedPlans,
        current: req.user.plan,
        message: `This feature requires the ${allowedPlans.join(' or ')} plan.`,
      });
    }
    next();
  };
}

module.exports = { checkDeviceLimit, getCapacityWarning, requirePlan };
