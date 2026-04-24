const { z } = require('zod');
const db = require('../database');

// ── Input validation middleware ───────────────────────────────────────────────
function validateBody(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        error: 'Validation failed',
        issues: result.error.issues.map(i => ({
          field: i.path.join('.'),
          message: i.message,
        })),
      });
    }
    req.body = result.data;
    next();
  };
}

// ── Strip sensitive fields from responses ────────────────────────────────────
function sanitizeUser(user) {
  if (!user) return null;
  const { password_hash, totp_secret_enc, backup_codes_hash, refresh_token, ...safe } = user;
  return safe;
}

function sanitizeOrg(org) {
  if (!org) return null;
  const { google_service_account_enc, intune_client_secret_enc, ...safe } = org;
  return safe;
}

// ── Org isolation — every query must be scoped to req.user.orgId ─────────────
function orgIsolation(req, res, next) {
  if (!req.user?.orgId) {
    return res.status(401).json({ error: 'Unauthorised' });
  }
  next();
}

// ── Audit log middleware ──────────────────────────────────────────────────────
function auditLog(action) {
  return async (req, res, next) => {
    try {
      await db('audit_log').insert({
        org_id: req.user?.orgId || null,
        user_id: req.user?.id || null,
        action,
        resource: req.originalUrl,
        ip_address: req.ip,
        user_agent: req.headers['user-agent'] || '',
        created_at: new Date(),
      });
    } catch {
      // Never block request due to audit log failure
    }
    next();
  };
}

// ── CSRF token validation ─────────────────────────────────────────────────────
const crypto = require('crypto');

function generateCsrfToken() {
  return crypto.randomBytes(32).toString('hex');
}

function csrfProtection(req, res, next) {
  // Skip CSRF for GET, HEAD, OPTIONS
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  // Skip for webhook routes (they use signature verification)
  if (req.path.includes('/webhook')) return next();
  // Skip for API token auth (mobile/agent clients)
  if (req.headers['x-api-key']) return next();

  const token = req.headers['x-csrf-token'];
  const sessionToken = req.cookies?.csrf_token;

  if (!token || !sessionToken || token !== sessionToken) {
    return res.status(403).json({ error: 'Invalid CSRF token' });
  }
  next();
}

// ── Rate limit helpers ────────────────────────────────────────────────────────
const rateLimit = require('express-rate-limit');

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Too many attempts. Try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  message: { error: 'Too many requests. Slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const strictLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: { error: 'Rate limit exceeded.' },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = {
  validateBody,
  sanitizeUser,
  sanitizeOrg,
  orgIsolation,
  auditLog,
  generateCsrfToken,
  csrfProtection,
  authLimiter,
  apiLimiter,
  strictLimiter,
};
