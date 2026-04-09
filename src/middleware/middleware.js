const jwt = require('jsonwebtoken');
const db = require('../database');

// ─── requireAuth ──────────────────────────────────────────────────────────────
// Verifies the access token and attaches user to req
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

    // Fetch fresh user from DB
    const user = await db('users').where('id', payload.userId).first();
    if (!user) {
      return res.status(401).json({ error: 'User not found.' });
    }

    // Attach to request
    req.user = {
      id: user.id,
      orgId: user.org_id,
      email: user.email,
      role: user.role,
      totpEnabled: user.totp_enabled,
    };

    next();
  } catch (err) {
    console.error('Auth middleware error:', err);
    res.status(500).json({ error: 'Authentication error.' });
  }
}

// ─── requireAdmin ─────────────────────────────────────────────────────────────
// Must be used AFTER requireAuth
function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required.' });
  }
  next();
}

// ─── requireTOTP ──────────────────────────────────────────────────────────────
// Checks that the user has 2FA enabled — for sensitive actions
function requireTOTP(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  if (!req.user.totpEnabled) {
    return res.status(403).json({
      error: 'Two-factor authentication must be enabled to perform this action.',
      code: 'TOTP_REQUIRED',
    });
  }
  next();
}

module.exports = { requireAuth, requireAdmin, requireTOTP };
