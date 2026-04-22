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
    process.env.JWT_SECRET,
    { expiresIn: '15m' }
  );
  const refresh = jwt.sign(
    { userId: user.id, type: 'refresh' },
    process.env.JWT_SECRET,
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
        created_at: new D
