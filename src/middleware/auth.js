const jwt = require('jsonwebtoken');
const db = require('../database');

function signAccessToken(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '15m' });
}

async function getMspContext(user, payloadOrgId) {
  const isMsp = user.role === 'msp';
  const homeOrgId = user.org_id;
  const desiredOrgId = payloadOrgId || homeOrgId;

  if (!isMsp) {
    if (desiredOrgId !== homeOrgId) {
      throw Object.assign(new Error('Invalid org context.'), { statusCode: 403 });
    }
    return {
      isMsp: false,
      homeOrgId,
      activeOrgId: homeOrgId,
      activeClientOrgId: null,
    };
  }

  if (desiredOrgId === homeOrgId) {
    return {
      isMsp: true,
      homeOrgId,
      activeOrgId: homeOrgId,
      activeClientOrgId: null,
    };
  }

  const link = await db('msp_clients')
    .where({ msp_org_id: homeOrgId, client_org_id: desiredOrgId })
    .whereIn('status', ['active', 'suspended'])
    .first();

  if (!link) {
    throw Object.assign(new Error('Client is not managed by this MSP.'), { statusCode: 403 });
  }

  return {
    isMsp: true,
    homeOrgId,
    activeOrgId: desiredOrgId,
    activeClientOrgId: desiredOrgId,
  };
}

async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    const token = authHeader.split(' ')[1];
    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ error: 'Session expired. Please log in again.', code: 'TOKEN_EXPIRED' });
      }
      return res.status(401).json({ error: 'Invalid token.' });
    }

    const user = await db('users').where('id', payload.userId).first();
    if (!user) {
      return res.status(401).json({ error: 'User not found.' });
    }

    const ctx = await getMspContext(user, payload.orgId);
    req.user = {
      id: user.id,
      orgId: ctx.activeOrgId,
      homeOrgId: ctx.homeOrgId,
      activeClientOrgId: ctx.activeClientOrgId,
      email: user.email,
      role: user.role,
      totpEnabled: user.totp_enabled,
      isMsp: ctx.isMsp,
    };

    next();
  } catch (err) {
    const status = err.statusCode || 500;
    if (status >= 500) console.error('Auth middleware error:', err);
    return res.status(status).json({ error: err.message || 'Authentication error.' });
  }
}

function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Authentication required.' });
  if (req.user.role !== 'admin' && req.user.role !== 'msp') {
    return res.status(403).json({ error: 'Admin access required.' });
  }
  next();
}

function requireMsp(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Authentication required.' });
  if (req.user.role !== 'msp') return res.status(403).json({ error: 'MSP access required.' });
  next();
}

function requireTOTP(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Authentication required.' });
  if (!req.user.totpEnabled) {
    return res.status(403).json({
      error: 'Two-factor authentication must be enabled to perform this action.',
      code: 'TOTP_REQUIRED',
    });
  }
  next();
}

module.exports = {
  signAccessToken,
  getMspContext,
  requireAuth,
  requireAdmin,
  requireMsp,
  requireTOTP,
};
