const jwt = require('jsonwebtoken');
const db = require('../database');
const { getJwtSecret } = require('../config/jwtSecret');

async function validateAgentToken(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Agent token required.' });
    }

    const token = authHeader.slice(7);

    let payload;
    try {
      payload = jwt.verify(token, getJwtSecret());
    } catch {
      return res.status(401).json({ error: 'Invalid or expired agent token.' });
    }

    if (!payload.orgId || !payload.type === 'agent') {
      return res.status(401).json({ error: 'Invalid token type.' });
    }

    // Verify org exists and is active
    const org = await db('orgs').where({ id: payload.orgId }).first();
    if (!org) {
      return res.status(401).json({ error: 'Organisation not found.' });
    }

    if (org.subscription_status === 'canceled') {
      return res.status(402).json({ error: 'Subscription inactive.' });
    }

    req.agent = { orgId: payload.orgId, deviceId: payload.deviceId };
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { validateAgentToken };
