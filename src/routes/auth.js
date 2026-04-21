require('dotenv').config();
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const { v4: uuidv4 } = require('uuid');
const { z } = require('zod');
const { Resend } = require('resend');
const crypto = require('crypto');
const { encrypt, decrypt } = require('../lib/crypto');

const db = require('../database');
const resend = new Resend(process.env.RESEND_API_KEY);

function getAppUrl() {
  const appUrl = (process.env.APP_URL || '').trim().replace(/\/$/, '');
  if (!appUrl) {
    throw new Error('APP_URL is not configured');
  }
  return appUrl;
}

// ─── JWT helpers ─────────────────────────────────────────────────────────────
function signAccessToken(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '15m' });
}

function signRefreshToken(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' });
}

function setRefreshCookie(res, token) {
  res.cookie('refreshToken', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  });
}

async function issueTokens(res, user, org) {
  const refreshToken = signRefreshToken({ userId: user.id, type: 'refresh' });
  // Store refresh token in DB
  await db('users').where('id', user.id).update({
    last_login_at: new Date(),
  });
  // Save refresh token (we use a simple approach: store in a refresh_tokens table or in user row)
  // For simplicity, we store hashed in users table via a separate column added later
  // Here we just set the cookie
  setRefreshCookie(res, refreshToken);

  const accessToken = signAccessToken({
    userId: user.id,
    orgId: user.org_id,
    role: user.role,
    email: user.email,
  });

  return accessToken;
}

// ─── Email helpers ────────────────────────────────────────────────────────────
async function sendVerificationEmail(email, token) {
  const link = `${getAppUrl()}/verify-email?token=${encodeURIComponent(token)}`;
  await resend.emails.send({
    from: process.env.FROM_EMAIL,
    to: email,
    subject: 'Verify your FortDefend account',
    html: `
      <h2>Welcome to FortDefend</h2>
      <p>Click the link below to verify your email address:</p>
      <a href="${link}" style="background:#185FA5;color:white;padding:12px 24px;text-decoration:none;border-radius:4px;display:inline-block">Verify Email</a>
      <p>This link expires in 24 hours.</p>
      <p>If you did not create an account, ignore this email.</p>
    `,
  });
}

async function sendPasswordResetEmail(email, token) {
  const link = `${getAppUrl()}/reset-password?token=${encodeURIComponent(token)}`;
  await resend.emails.send({
    from: process.env.FROM_EMAIL,
    to: email,
    subject: 'Reset your FortDefend password',
    html: `
      <h2>Password Reset</h2>
      <p>Click the link below to reset your password. This link expires in 1 hour.</p>
      <a href="${link}" style="background:#185FA5;color:white;padding:12px 24px;text-decoration:none;border-radius:4px;display:inline-block">Reset Password</a>
      <p>If you did not request a password reset, ignore this email.</p>
    `,
  });
}

async function sendNewLoginEmail(email, ip) {
  await resend.emails.send({
    from: process.env.FROM_EMAIL,
    to: email,
    subject: 'New login detected on your FortDefend account',
    html: `
      <h2>New Login Detected</h2>
      <p>A login was detected from a new location.</p>
      <p><strong>IP Address:</strong> ${ip}</p>
      <p><strong>Time:</strong> ${new Date().toUTCString()}</p>
      <p>If this was you, no action is needed. If you did not log in, change your password immediately.</p>
    `,
  });
}

// ─── Validation schemas ───────────────────────────────────────────────────────
const signupSchema = z.object({
  email: z.string().email(),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain an uppercase letter')
    .regex(/[0-9]/, 'Password must contain a number'),
  orgName: z.string().min(1).optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const totpSchema = z.object({
  code: z.string().length(6).regex(/^\d{6}$/),
});

// ─── POST /api/auth/signup ────────────────────────────────────────────────────
router.post('/signup', async (req, res) => {
  try {
    const parsed = signupSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0].message });
    }
    const { email, password, orgName } = parsed.data;

    // Check if email already registered
    const existing = await db('users').where('email', email.toLowerCase()).first();
    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const emailVerifyToken = uuidv4();

    // Create org and user in a transaction
    await db.transaction(async (trx) => {
      const [org] = await trx('orgs').insert({
        id: db.raw('gen_random_uuid()'),
        name: orgName || email.split('@')[0] + "'s Organization",
        plan: null,
        device_limit: 5,
      }).returning('*');

      await trx('users').insert({
        id: db.raw('gen_random_uuid()'),
        org_id: org.id,
        email: email.toLowerCase(),
        password_hash: passwordHash,
        role: 'admin',
        email_verified: false,
        email_verify_token: emailVerifyToken,
      });

      // Create default org_integrations row
      await trx('org_integrations').insert({ org_id: org.id });
    });

    await sendVerificationEmail(email, emailVerifyToken);

    res.status(201).json({ message: 'Check your email to verify your account.' });
  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ error: 'Signup failed. Please try again.' });
  }
});

// ─── POST /api/auth/verify-email ─────────────────────────────────────────────
router.post('/verify-email', async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'Token is required.' });

    const user = await db('users').where('email_verify_token', token).first();
    if (!user) return res.status(400).json({ error: 'Invalid or expired verification link.' });

    await db('users').where('id', user.id).update({
      email_verified: true,
      email_verify_token: null,
    });

    res.json({ message: 'Email verified. You can now log in.' });
  } catch (err) {
    console.error('Verify email error:', err);
    res.status(500).json({ error: 'Verification failed.' });
  }
});

// ─── POST /api/auth/login ─────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid email or password format.' });
    }
    const { email, password } = parsed.data;
    const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';

    const user = await db('users').where('email', email.toLowerCase()).first();

    // Generic error to avoid revealing if email exists
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    // Check if account is locked
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      const minutesLeft = Math.ceil((new Date(user.locked_until) - new Date()) / 60000);
      return res.status(423).json({
        error: `Account locked due to too many failed attempts. Try again in ${minutesLeft} minutes.`
      });
    }

    // Verify password
    const passwordValid = await bcrypt.compare(password, user.password_hash);
    if (!passwordValid) {
      const attempts = (user.failed_login_attempts || 0) + 1;
      const lockUntil = attempts >= 10 ? new Date(Date.now() + 30 * 60 * 1000) : null;

      await db('users').where('id', user.id).update({
        failed_login_attempts: attempts,
        locked_until: lockUntil,
      });

      // Log failed attempt
      await db('audit_log').insert({
        id: db.raw('gen_random_uuid()'),
        org_id: user.org_id,
        user_id: user.id,
        action: 'login_failed',
        ip_address: ip,
        user_agent: userAgent,
      });

      if (attempts >= 10) {
        return res.status(423).json({ error: 'Too many failed attempts. Account locked for 30 minutes.' });
      }
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    // Check email verified
    if (!user.email_verified) {
      return res.status(401).json({
        error: 'Please verify your email before logging in. Check your inbox.'
      });
    }

    // Reset failed attempts on successful password check
    await db('users').where('id', user.id).update({ failed_login_attempts: 0, locked_until: null });

    // Detect new IP
    if (user.last_login_ip && user.last_login_ip !== ip) {
      sendNewLoginEmail(user.email, ip).catch(console.error);
    }

    // Update last login IP
    await db('users').where('id', user.id).update({ last_login_ip: ip });

    // Log successful login
    await db('audit_log').insert({
      id: db.raw('gen_random_uuid()'),
      org_id: user.org_id,
      user_id: user.id,
      action: 'login_success',
      ip_address: ip,
      user_agent: userAgent,
    });

    // If 2FA is enabled, return a temp token
    if (user.totp_enabled) {
      const tempToken = jwt.sign(
        { userId: user.id, type: 'totp_pending' },
        process.env.JWT_SECRET,
        { expiresIn: '5m' }
      );
      return res.json({ requiresTOTP: true, tempToken });
    }

    // No 2FA yet — issue full tokens and hint to set up 2FA
    const accessToken = await issueTokens(res, user, null);
    res.json({ accessToken, setupTOTP: true });

  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed. Please try again.' });
  }
});

// ─── POST /api/auth/login/totp ────────────────────────────────────────────────
router.post('/login/totp', async (req, res) => {
  try {
    const { tempToken, code } = req.body;
    if (!tempToken || !code) {
      return res.status(400).json({ error: 'Token and code are required.' });
    }

    let payload;
    try {
      payload = jwt.verify(tempToken, process.env.JWT_SECRET);
    } catch {
      return res.status(401).json({ error: 'Session expired. Please log in again.' });
    }

    if (payload.type !== 'totp_pending') {
      return res.status(401).json({ error: 'Invalid token type.' });
    }

    const user = await db('users').where('id', payload.userId).first();
    if (!user) return res.status(401).json({ error: 'User not found.' });

    // Check if locked
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      return res.status(423).json({ error: 'Account temporarily locked.' });
    }

    // Verify TOTP code
    const secret = decrypt(user.totp_secret_enc);
    const valid = speakeasy.totp.verify({
      secret,
      encoding: 'base32',
      token: code,
      window: 1,
    });

    if (!valid) {
      // Check backup codes
      const backupCodes = user.backup_codes_hash || [];
      let backupUsed = false;

      for (let i = 0; i < backupCodes.length; i++) {
        if (backupCodes[i] && await bcrypt.compare(code, backupCodes[i])) {
          // Mark backup code as used
          backupCodes[i] = null;
          await db('users').where('id', user.id).update({
            backup_codes_hash: JSON.stringify(backupCodes),
          });
          backupUsed = true;
          break;
        }
      }

      if (!backupUsed) {
        const attempts = (user.failed_login_attempts || 0) + 1;
        const lockUntil = attempts >= 3 ? new Date(Date.now() + 15 * 60 * 1000) : null;
        await db('users').where('id', user.id).update({
          failed_login_attempts: attempts,
          locked_until: lockUntil,
        });
        return res.status(401).json({ error: 'Invalid 2FA code.' });
      }
    }

    // Reset failed attempts
    await db('users').where('id', user.id).update({ failed_login_attempts: 0, locked_until: null });

    const accessToken = await issueTokens(res, user, null);
    res.json({ accessToken });

  } catch (err) {
    console.error('TOTP login error:', err);
    res.status(500).json({ error: 'Verification failed.' });
  }
});

// ─── POST /api/auth/setup-totp ────────────────────────────────────────────────
router.post('/setup-totp', require('../middleware/middleware').requireAuth, async (req, res) => {
  try {
    const secret = speakeasy.generateSecret({
      name: `${process.env.TOTP_ISSUER || 'FortDefend'} (${req.user.email})`,
      issuer: process.env.TOTP_ISSUER || 'FortDefend',
    });

    // Generate backup codes (10 random 8-char codes)
    const backupCodes = Array.from({ length: 10 }, () =>
      crypto.randomBytes(4).toString('hex').toUpperCase()
    );

    // Generate QR code
    const qrCodeDataUrl = await QRCode.toDataURL(secret.otpauth_url);

    // Store temp secret in session (not confirmed yet — don't save to DB yet)
    // We'll save it when the user confirms with a valid code
    // For now return the secret so the confirm endpoint can verify
    const tempToken = jwt.sign(
      { userId: req.user.id, totpSecret: secret.base32, backupCodes, type: 'totp_setup' },
      process.env.JWT_SECRET,
      { expiresIn: '10m' }
    );

    res.json({
      qrCodeDataUrl,
      backupCodes,
      setupToken: tempToken,
    });
  } catch (err) {
    console.error('Setup TOTP error:', err);
    res.status(500).json({ error: 'Failed to generate 2FA setup.' });
  }
});

// ─── POST /api/auth/confirm-totp ─────────────────────────────────────────────
router.post('/confirm-totp', require('../middleware/middleware').requireAuth, async (req, res) => {
  try {
    const { setupToken, code } = req.body;
    if (!setupToken || !code) {
      return res.status(400).json({ error: 'Setup token and code are required.' });
    }

    let payload;
    try {
      payload = jwt.verify(setupToken, process.env.JWT_SECRET);
    } catch {
      return res.status(400).json({ error: 'Setup session expired. Start 2FA setup again.' });
    }

    if (payload.type !== 'totp_setup' || payload.userId !== req.user.id) {
      return res.status(400).json({ error: 'Invalid setup token.' });
    }

    // Verify the code against the secret
    const valid = speakeasy.totp.verify({
      secret: payload.totpSecret,
      encoding: 'base32',
      token: code,
      window: 1,
    });

    if (!valid) {
      return res.status(400).json({ error: 'Invalid code. Please try again.' });
    }

    // Hash backup codes and save everything to DB
    const hashedBackupCodes = await Promise.all(
      payload.backupCodes.map(c => bcrypt.hash(c, 10))
    );

    await db('users').where('id', req.user.id).update({
      totp_secret_enc: encrypt(payload.totpSecret),
      totp_enabled: true,
      backup_codes_hash: JSON.stringify(hashedBackupCodes),
    });

    res.json({ success: true, message: '2FA enabled successfully.' });
  } catch (err) {
    console.error('Confirm TOTP error:', err);
    res.status(500).json({ error: 'Failed to confirm 2FA.' });
  }
});

// ─── POST /api/auth/refresh ───────────────────────────────────────────────────
router.post('/refresh', async (req, res) => {
  try {
    const token = req.cookies?.refreshToken;
    if (!token) return res.status(401).json({ error: 'No refresh token.' });

    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      return res.status(401).json({ error: 'Refresh token expired. Please log in again.' });
    }

    if (payload.type !== 'refresh') {
      return res.status(401).json({ error: 'Invalid token type.' });
    }

    const user = await db('users').where('id', payload.userId).first();
    if (!user) return res.status(401).json({ error: 'User not found.' });

    // Rotate refresh token
    const newRefreshToken = signRefreshToken({ userId: user.id, type: 'refresh' });
    setRefreshCookie(res, newRefreshToken);

    const accessToken = signAccessToken({
      userId: user.id,
      orgId: user.org_id,
      role: user.role,
      email: user.email,
    });

    res.json({ accessToken });
  } catch (err) {
    console.error('Refresh error:', err);
    res.status(500).json({ error: 'Token refresh failed.' });
  }
});

// ─── POST /api/auth/logout ────────────────────────────────────────────────────
router.post('/logout', async (req, res) => {
  res.clearCookie('refreshToken', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
  });
  res.json({ message: 'Logged out successfully.' });
});

// ─── POST /api/auth/forgot-password ──────────────────────────────────────────
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required.' });

    // Always return success to avoid revealing if email exists
    const user = await db('users').where('email', email.toLowerCase()).first();
    if (user) {
      const resetToken = uuidv4();
      const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      await db('users').where('id', user.id).update({
        password_reset_token: resetToken,
        password_reset_expires: expires,
      });

      await sendPasswordResetEmail(email, resetToken);
    }

    res.json({ message: 'If an account exists with that email, a reset link has been sent.' });
  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ error: 'Failed to send reset email.' });
  }
});

// ─── POST /api/auth/reset-password ───────────────────────────────────────────
router.post('/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) {
      return res.status(400).json({ error: 'Token and new password are required.' });
    }

    const parsed = z.string()
      .min(8, 'Password must be at least 8 characters')
      .regex(/[A-Z]/, 'Password must contain an uppercase letter')
      .regex(/[0-9]/, 'Password must contain a number')
      .safeParse(password);

    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0].message });
    }

    const user = await db('users').where('password_reset_token', token).first();
    if (!user || !user.password_reset_expires || new Date(user.password_reset_expires) < new Date()) {
      return res.status(400).json({ error: 'Invalid or expired reset link.' });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    await db('users').where('id', user.id).update({
      password_hash: passwordHash,
      password_reset_token: null,
      password_reset_expires: null,
      failed_login_attempts: 0,
      locked_until: null,
    });

    res.json({ message: 'Password reset successfully. You can now log in.' });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ error: 'Password reset failed.' });
  }
});

module.exports = router;
module.exports.encrypt = encrypt;
module.exports.decrypt = decrypt;
