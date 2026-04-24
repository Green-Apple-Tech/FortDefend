const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { z } = require('zod');
const { Resend } = require('resend');
const db = require('../database');
const { requireAuth } = require('../middleware/auth');
const { PLANS, isBusinessDomain, getTrialEndDate } = require('../config/plans');
const { getJwtSecret } = require('../config/jwtSecret');

const resend = new Resend(process.env.RESEND_API_KEY);

function encrypt(text) {
  const iv = crypto.randomBytes(12);
  const key = Buffer.from(process.env.ENCRYPTION_KEY, 'hex');
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${encrypted.toString('hex')}:${tag.toString('hex')}`;
}

function decrypt(ciphertext) {
  const [ivHex, encHex, tagHex] = ciphertext.split(':');
  const key = Buffer.from(process.env.ENCRYPTION_KEY, 'hex');
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm', key, Buffer.from(ivHex, 'hex')
  );
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return decipher.update(Buffer.from(encHex, 'hex')) + decipher.final('utf8');
}

function signTokens(user, org) {
  const access = jwt.sign(
    { userId: user.id, orgId: org.id, role: user.role,
      email: user.email, plan: org.plan },
    getJwtSecret(),
    { expiresIn: '15m' }
  );
  const refresh = jwt.sign(
    { userId: user.id, type: 'refresh' },
    getJwtSecret(),
    { expiresIn: '7d' }
  );
  return { access, refresh };
}

const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).regex(/[A-Z]/).regex(/[0-9]/),
  orgName: z.string().min(2).optional().default('My Organization'),
  plan: z.enum(['personal','starter','growth','scale']).default('personal'),
  role: z.enum(['admin','msp']).default('admin'),
});

const passwordSchema = z.string().min(8).regex(/[A-Z]/).regex(/[0-9]/);

router.post('/signup', async (req, res, next) => {
  try {
    const parsed = signupSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', issues: parsed.error.issues });
    }
    const { email, password, orgName, plan, role } = parsed.data;
    const planConfig = PLANS[plan];

    if (planConfig.requiresBusinessDomain && !isBusinessDomain(email)) {
      return res.status(400).json({
        error: 'business_email_required',
        message: 'Business plans require a company email. Use your work email or choose the personal plan.',
      });
    }

    const existing = await db('users').where({ email }).first();
    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const verifyToken = uuidv4();
    const trialEndsAt = getTrialEndDate();
    const orgId = uuidv4();
    const userId = uuidv4();

    await db.transaction(async (trx) => {
      await trx('orgs').insert({
        id: orgId,
        name: orgName,
        plan,
        device_limit: planConfig.deviceLimit,
        subscription_status: 'trialing',
        trial_ends_at: trialEndsAt,
        trial_started_at: new Date(),
        created_at: new Date(),
        updated_at: new Date(),
      });
      await trx('users').insert({
        id: userId,
        org_id: orgId,
        email,
        password_hash: passwordHash,
        role: role || 'admin',
        email_verified: false,
        email_verify_token: verifyToken,
        created_at: new Date(),
        updated_at: new Date(),
      });
    });

    const verifyUrl = `${process.env.APP_URL}/verify-email?token=${verifyToken}`;

    await resend.emails.send({
      from: process.env.FROM_EMAIL,
      to: email,
      subject: 'Verify your FortDefend account',
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;">
          <h2 style="color:#0A1628;">Welcome to FortDefend!</h2>
          <p>Click the button below to verify your email and start your 10-day free trial. All 15 AI agents, full access.</p>
          <p style="margin:32px 0;">
            <a href="${verifyUrl}"
               style="display:inline-block;background:#185FA5;color:#ffffff;padding:14px 28px;border-radius:6px;text-decoration:none;font-weight:bold;font-size:16px;">
              Verify my email and start trial
            </a>
          </p>
          <p style="color:#666;font-size:14px;">If the button doesn't work, copy and paste this link into your browser:</p>
          <p style="word-break:break-all;color:#185FA5;font-size:14px;">${verifyUrl}</p>
          ${planConfig.requiresCard
            ? '<p style="color:#8a887e;font-size:12px;">Your card is saved but will not be charged until you activate your plan after the trial.</p>'
            : '<p style="color:#8a887e;font-size:12px;">No card required for the personal plan.</p>'
          }
        </div>
      `,
    });

    res.status(201).json({
      message: 'Check your email to verify your account and start your 10-day free trial.',
      requiresCard: planConfig.requiresCard,
    });
  } catch (err) { next(err); }
});

router.post('/verify-email', async (req, res, next) => {
  try {
    const { token } = req.body;
    const user = await db('users').where({ email_verify_token: token }).first();
    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired verification link.' });
    }
    await db('users').where({ id: user.id }).update({
      email_verified: true,
      email_verify_token: null,
      updated_at: new Date(),
    });
    res.json({ message: 'Email verified. Your 10-day free trial is now active.' });
  } catch (err) { next(err); }
});

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required.' });
    }
    const user = await db('users').where({ email }).first();
    if (!user) return res.status(401).json({ error: 'Invalid email or password.' });

    if (user.locked_until && new Date() < new Date(user.locked_until)) {
      return res.status(429).json({ error: 'Account temporarily locked. Try again later.' });
    }

    let valid = false;
    try {
      if (!user.password_hash) {
        return res.status(500).json({ error: 'User account is misconfigured. Contact support.' });
      }
      valid = await bcrypt.compare(password, user.password_hash);
    } catch (bcryptErr) {
      console.error('[Auth/Login] bcrypt compare failed:', bcryptErr);
      return res.status(500).json({ error: 'Authentication system error. Please try again.' });
    }

    if (!valid) {
      const attempts = (user.failed_login_attempts || 0) + 1;
      const update = { failed_login_attempts: attempts, updated_at: new Date() };
      if (attempts >= 10) {
        update.locked_until = new Date(Date.now() + 30 * 60 * 1000);
      }
      await db('users').where({ id: user.id }).update(update);
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    if (!user.email_verified) {
      return res.status(401).json({
        error: 'email_not_verified',
        message: 'Please verify your email before logging in.',
      });
    }

    await db('users').where({ id: user.id }).update({
      failed_login_attempts: 0,
      locked_until: null,
      last_login_at: new Date(),
      last_login_ip: req.ip,
      updated_at: new Date(),
    });

    const org = await db('orgs').where({ id: user.org_id }).first();
    if (!org) {
      return res.status(500).json({ error: 'User organization is missing. Contact support.' });
    }

    if (user.totp_enabled) {
      const tempToken = jwt.sign(
        { userId: user.id, type: 'totp_pending' },
        getJwtSecret(),
        { expiresIn: '5m' }
      );
      return res.json({ requiresTOTP: true, tempToken });
    }

    const { access, refresh } = signTokens(user, org);
    await db('users').where({ id: user.id }).update({
      refresh_token: refresh, updated_at: new Date(),
    });

    res.cookie('refresh_token', refresh, {
      httpOnly: true, secure: true, sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.json({
      accessToken: access,
      user: { id: user.id, email: user.email, role: user.role },
      org: {
        id: org.id, name: org.name, plan: org.plan,
        subscriptionStatus: org.subscription_status,
        trialEndsAt: org.trial_ends_at,
        graceEndsAt: org.grace_ends_at,
        isReadOnly: org.is_read_only,
      },
      setupTOTP: false,
    });
  } catch (err) {
    console.error('[Auth/Login] Unhandled login error:', err);
    next(err);
  }
});

router.post('/login/totp', async (req, res, next) => {
  try {
    const { tempToken, code } = req.body;
    let payload;
    try {
      payload = jwt.verify(tempToken, getJwtSecret());
    } catch {
      return res.status(401).json({ error: 'Session expired. Please log in again.' });
    }
    if (payload.type !== 'totp_pending') {
      return res.status(401).json({ error: 'Invalid token.' });
    }

    const user = await db('users').where({ id: payload.userId }).first();
    if (!user) return res.status(401).json({ error: 'User not found.' });

    const secret = decrypt(user.totp_secret_enc);
    const valid = speakeasy.totp.verify({
      secret, encoding: 'base32', token: code, window: 1,
    });

    if (!valid) {
      const attempts = (user.failed_login_attempts || 0) + 1;
      const update = { failed_login_attempts: attempts, updated_at: new Date() };
      if (attempts >= 3) {
        update.locked_until = new Date(Date.now() + 15 * 60 * 1000);
      }
      await db('users').where({ id: user.id }).update(update);
      return res.status(401).json({ error: 'Invalid code.' });
    }

    const org = await db('orgs').where({ id: user.org_id }).first();
    const { access, refresh } = signTokens(user, org);

    await db('users').where({ id: user.id }).update({
      refresh_token: refresh,
      failed_login_attempts: 0,
      locked_until: null,
      updated_at: new Date(),
    });

    res.cookie('refresh_token', refresh, {
      httpOnly: true, secure: true, sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.json({ accessToken: access });
  } catch (err) { next(err); }
});

router.post('/setup-totp', requireAuth, async (req, res, next) => {
  try {
    const user = await db('users').where({ id: req.user.id }).first();
    const secret = speakeasy.generateSecret({
      name: `FortDefend (${user.email})`,
      issuer: process.env.TOTP_ISSUER || 'FortDefend',
    });
    const qrCodeDataUrl = await QRCode.toDataURL(secret.otpauth_url);
    const backupCodes = Array.from({ length: 10 }, () =>
      crypto.randomBytes(4).toString('hex').toUpperCase()
    );
    const tempSecret = jwt.sign(
      { secret: secret.base32, backupCodes },
      getJwtSecret(),
      { expiresIn: '10m' }
    );
    res.json({ qrCodeDataUrl, backupCodes, tempSecret });
  } catch (err) { next(err); }
});

router.post('/confirm-totp', requireAuth, async (req, res, next) => {
  try {
    const { code, tempSecret } = req.body;
    let payload;
    try {
      payload = jwt.verify(tempSecret, getJwtSecret());
    } catch {
      return res.status(400).json({ error: 'Setup session expired. Please start again.' });
    }

    const valid = speakeasy.totp.verify({
      secret: payload.secret, encoding: 'base32', token: code, window: 1,
    });
    if (!valid) return res.status(400).json({ error: 'Invalid code. Please try again.' });

    const encryptedSecret = encrypt(payload.secret);
    const hashedCodes = await Promise.all(
      payload.backupCodes.map(c => bcrypt.hash(c, 10))
    );

    await db('users').where({ id: req.user.id }).update({
      totp_secret_enc: encryptedSecret,
      totp_enabled: true,
      backup_codes_hash: JSON.stringify(hashedCodes),
      updated_at: new Date(),
    });

    res.json({ success: true });
  } catch (err) { next(err); }
});

router.post('/refresh', async (req, res, next) => {
  try {
    const token = req.cookies?.refresh_token;
    if (!token) return res.status(401).json({ error: 'No refresh token.' });

    let payload;
    try {
      payload = jwt.verify(token, getJwtSecret());
    } catch {
      return res.status(401).json({ error: 'Invalid or expired refresh token.' });
    }

    const user = await db('users')
      .where({ id: payload.userId, refresh_token: token }).first();
    if (!user) return res.status(401).json({ error: 'Session invalidated.' });

    const org = await db('orgs').where({ id: user.org_id }).first();
    const { access, refresh: newRefresh } = signTokens(user, org);

    await db('users').where({ id: user.id }).update({
      refresh_token: newRefresh, updated_at: new Date(),
    });

    res.cookie('refresh_token', newRefresh, {
      httpOnly: true, secure: true, sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.json({ accessToken: access });
  } catch (err) { next(err); }
});

router.post('/logout', requireAuth, async (req, res, next) => {
  try {
    await db('users').where({ id: req.user.id }).update({
      refresh_token: null, updated_at: new Date(),
    });
    res.clearCookie('refresh_token');
    res.json({ message: 'Logged out.' });
  } catch (err) { next(err); }
});

router.post('/forgot-password', async (req, res, next) => {
  try {
    const { email } = req.body;
    const msg = 'If that email exists, a reset link has been sent.';
    const user = await db('users').where({ email }).first();
    if (!user) return res.json({ message: msg });

    const resetToken = uuidv4();
    await db('users').where({ id: user.id }).update({
      password_reset_token: resetToken,
      password_reset_expires: new Date(Date.now() + 60 * 60 * 1000),
      updated_at: new Date(),
    });

    const resetUrl = `${process.env.APP_URL}/reset-password?token=${resetToken}`;

    await resend.emails.send({
      from: process.env.FROM_EMAIL,
      to: email,
      subject: 'Reset your FortDefend password',
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;">
          <h2 style="color:#0A1628;">Reset your password</h2>
          <p>Click the button below to reset your password. This link expires in 1 hour.</p>
          <p style="margin:32px 0;">
            <a href="${resetUrl}"
               style="display:inline-block;background:#185FA5;color:#ffffff;padding:14px 28px;border-radius:6px;text-decoration:none;font-weight:bold;font-size:16px;">
              Reset my password
            </a>
          </p>
          <p style="color:#666;font-size:14px;">If the button doesn't work, copy and paste this link into your browser:</p>
          <p style="word-break:break-all;color:#185FA5;font-size:14px;">${resetUrl}</p>
        </div>
      `,
    });

    res.json({ message: msg });
  } catch (err) { next(err); }
});

router.post('/reset-password', async (req, res, next) => {
  try {
    const { token, password } = req.body;
    if (!passwordSchema.safeParse(password).success) {
      return res.status(400).json({
        error: 'Password must be at least 8 characters with one uppercase letter and one number.',
      });
    }

    const user = await db('users')
      .where({ password_reset_token: token })
      .where('password_reset_expires', '>', new Date())
      .first();

    if (!user) return res.status(400).json({ error: 'Invalid or expired reset link.' });

    await db('users').where({ id: user.id }).update({
      password_hash: await bcrypt.hash(password, 12),
      password_reset_token: null,
      password_reset_expires: null,
      failed_login_attempts: 0,
      locked_until: null,
      updated_at: new Date(),
    });

    res.json({ message: 'Password reset. You can now log in.' });
  } catch (err) { next(err); }
});

module.exports = router;
