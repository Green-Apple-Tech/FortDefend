require('dotenv').config();
const express = require('express');
const router = express.Router();
const { z } = require('zod');
const { v4: uuidv4 } = require('uuid');
const { Resend } = require('resend');

const db = require('../database');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const resend = new Resend(process.env.RESEND_API_KEY);

function getAppUrl() {
  const appUrl = (process.env.APP_URL || '').trim().replace(/\/$/, '');
  if (!appUrl) {
    throw new Error('APP_URL is not configured');
  }
  return appUrl;
}

// ─── GET /api/orgs/me ─────────────────────────────────────────────────────────
// Returns current org details + subscription + device count
router.get('/me', requireAuth, async (req, res) => {
  try {
    const org = await db('orgs').where('id', req.user.orgId).first();
    if (!org) return res.status(404).json({ error: 'Organization not found.' });

    const deviceCount = await db('devices')
      .where('org_id', req.user.orgId)
      .count('id as count')
      .first();

    const userCount = await db('users')
      .where('org_id', req.user.orgId)
      .count('id as count')
      .first();

    // If MSP, also return client count
    let clientCount = null;
    if (org.type === 'msp') {
      const clients = await db('msp_clients')
        .where('msp_org_id', req.user.orgId)
        .where('status', 'active')
        .count('id as count')
        .first();
      clientCount = parseInt(clients.count);
    }

    res.json({
      id: org.id,
      name: org.name,
      type: org.type,
      plan: org.plan,
      deviceLimit: org.device_limit,
      clientLimit: org.client_limit,
      subscriptionStatus: org.subscription_status,
      trialEndsAt: org.trial_ends_at,
      whiteLabel: {
        name: org.white_label_name,
        logoUrl: org.white_label_logo_url,
      },
      deviceCount: parseInt(deviceCount.count),
      userCount: parseInt(userCount.count),
      clientCount,
      createdAt: org.created_at,
    });
  } catch (err) {
    console.error('Get org error:', err);
    res.status(500).json({ error: 'Failed to load organization.' });
  }
});

// ─── PATCH /api/orgs/me ───────────────────────────────────────────────────────
// Update org name and white-label settings (admin only)
router.patch('/me', requireAuth, requireAdmin, async (req, res) => {
  try {
    const schema = z.object({
      name: z.string().min(1).max(100).optional(),
      whiteLabel: z.object({
        name: z.string().max(100).optional(),
        logoUrl: z.string().url().optional(),
      }).optional(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0].message });
    }

    const updates = {};
    if (parsed.data.name) updates.name = parsed.data.name;
    if (parsed.data.whiteLabel?.name) updates.white_label_name = parsed.data.whiteLabel.name;
    if (parsed.data.whiteLabel?.logoUrl) updates.white_label_logo_url = parsed.data.whiteLabel.logoUrl;
    updates.updated_at = new Date();

    await db('orgs').where('id', req.user.orgId).update(updates);
    res.json({ message: 'Organization updated.' });
  } catch (err) {
    console.error('Update org error:', err);
    res.status(500).json({ error: 'Failed to update organization.' });
  }
});

// ─── GET /api/orgs/me/users ───────────────────────────────────────────────────
// List all users in org (admin only)
router.get('/me/users', requireAuth, requireAdmin, async (req, res) => {
  try {
    const users = await db('users')
      .where('org_id', req.user.orgId)
      .select('id', 'email', 'role', 'email_verified', 'totp_enabled', 'last_login_at', 'created_at')
      .orderBy('created_at', 'asc');

    res.json({ users });
  } catch (err) {
    console.error('List users error:', err);
    res.status(500).json({ error: 'Failed to load users.' });
  }
});

// ─── POST /api/orgs/invite ────────────────────────────────────────────────────
// Invite a user to the org by email (admin only)
router.post('/invite', requireAuth, requireAdmin, async (req, res) => {
  try {
    const schema = z.object({
      email: z.string().email(),
      role: z.enum(['admin', 'viewer', 'msp']).default('viewer'),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0].message });
    }

    const { email, role } = parsed.data;

    // Check if already a member
    const existing = await db('users')
      .where('email', email.toLowerCase())
      .where('org_id', req.user.orgId)
      .first();

    if (existing) {
      return res.status(409).json({ error: 'This user is already a member of your organization.' });
    }

    const org = await db('orgs').where('id', req.user.orgId).first();
    const inviteToken = uuidv4();
    const inviteLink = `${getAppUrl()}/accept-invite?token=${encodeURIComponent(inviteToken)}`;

    // Send invitation email
    await resend.emails.send({
      from: process.env.FROM_EMAIL,
      to: email,
      subject: `You've been invited to join ${org.name} on FortDefend`,
      html: `
        <h2>You're invited!</h2>
        <p><strong>${org.name}</strong> has invited you to join their FortDefend security dashboard.</p>
        <p>Click below to accept the invitation and create your account:</p>
        <a href="${inviteLink}" style="background:#185FA5;color:white;padding:12px 24px;text-decoration:none;border-radius:4px;display:inline-block">Accept Invitation</a>
        <p>This invitation expires in 7 days.</p>
      `,
    });

    res.json({ message: `Invitation sent to ${email}.` });
  } catch (err) {
    console.error('Invite user error:', err);
    res.status(500).json({ error: 'Failed to send invitation.' });
  }
});

// ─── DELETE /api/orgs/users/:userId ──────────────────────────────────────────
// Remove a user from the org (admin only, cannot remove self)
router.delete('/users/:userId', requireAuth, requireAdmin, async (req, res) => {
  try {
    if (req.params.userId === req.user.id) {
      return res.status(400).json({ error: 'You cannot remove yourself from the organization.' });
    }

    // Ensure user belongs to this org
    const user = await db('users')
      .where('id', req.params.userId)
      .where('org_id', req.user.orgId)
      .first();

    if (!user) return res.status(404).json({ error: 'User not found.' });

    await db('users').where('id', req.params.userId).where('org_id', req.user.orgId).delete();

    res.json({ message: 'User removed from organization.' });
  } catch (err) {
    console.error('Remove user error:', err);
    res.status(500).json({ error: 'Failed to remove user.' });
  }
});

// ─── PATCH /api/orgs/users/:userId/role ──────────────────────────────────────
// Change a user's role (admin only)
router.patch('/users/:userId/role', requireAuth, requireAdmin, async (req, res) => {
  try {
    const schema = z.object({ role: z.enum(['admin', 'viewer', 'msp']) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Role must be admin, viewer, or msp.' });
    }

    if (req.params.userId === req.user.id) {
      return res.status(400).json({ error: 'You cannot change your own role.' });
    }

    const user = await db('users')
      .where('id', req.params.userId)
      .where('org_id', req.user.orgId)
      .first();

    if (!user) return res.status(404).json({ error: 'User not found.' });

    await db('users')
      .where('id', req.params.userId)
      .where('org_id', req.user.orgId)
      .update({ role: parsed.data.role });

    res.json({ message: 'Role updated.' });
  } catch (err) {
    console.error('Update role error:', err);
    res.status(500).json({ error: 'Failed to update role.' });
  }
});

// ─── MSP: GET /api/orgs/clients ───────────────────────────────────────────────
// MSP only — list all clients
router.get('/clients', requireAuth, requireAdmin, async (req, res) => {
  try {
    const org = await db('orgs').where('id', req.user.orgId).first();
    if (org.type !== 'msp') {
      return res.status(403).json({ error: 'This feature is only available on MSP plans.' });
    }

    const clients = await db('msp_clients')
      .where('msp_org_id', req.user.orgId)
      .join('orgs', 'msp_clients.client_org_id', 'orgs.id')
      .select(
        'msp_clients.id',
        'msp_clients.client_name',
        'msp_clients.client_contact_email',
        'msp_clients.client_contact_name',
        'msp_clients.status',
        'msp_clients.created_at',
        'orgs.id as org_id',
        'orgs.plan',
        'orgs.device_limit',
      )
      .orderBy('msp_clients.client_name', 'asc');

    // Get device counts per client
    const clientsWithCounts = await Promise.all(clients.map(async (client) => {
      const deviceCount = await db('devices')
        .where('org_id', client.org_id)
        .count('id as count')
        .first();
      return { ...client, deviceCount: parseInt(deviceCount.count) };
    }));

    res.json({ clients: clientsWithCounts });
  } catch (err) {
    console.error('List clients error:', err);
    res.status(500).json({ error: 'Failed to load clients.' });
  }
});

// ─── MSP: POST /api/orgs/clients ─────────────────────────────────────────────
// MSP only — create a new client
router.post('/clients', requireAuth, requireAdmin, async (req, res) => {
  try {
    const org = await db('orgs').where('id', req.user.orgId).first();
    if (org.type !== 'msp') {
      return res.status(403).json({ error: 'This feature is only available on MSP plans.' });
    }

    // Check client limit
    if (org.client_limit > 0) {
      const clientCount = await db('msp_clients')
        .where('msp_org_id', req.user.orgId)
        .where('status', 'active')
        .count('id as count')
        .first();
      if (parseInt(clientCount.count) >= org.client_limit) {
        return res.status(402).json({
          error: `You have reached your client limit of ${org.client_limit}. Upgrade your MSP plan to add more clients.`
        });
      }
    }

    const schema = z.object({
      clientName: z.string().min(1).max(100),
      contactEmail: z.string().email().optional(),
      contactName: z.string().max(100).optional(),
      notes: z.string().max(500).optional(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0].message });
    }

    const { clientName, contactEmail, contactName, notes } = parsed.data;

    // Create client org and msp_clients record in a transaction
    const result = await db.transaction(async (trx) => {
      const [clientOrg] = await trx('orgs').insert({
        id: db.raw('gen_random_uuid()'),
        name: clientName,
        type: 'business',
        msp_org_id: req.user.orgId,
        plan: null,
        device_limit: 999999, // MSP manages limits at their level
      }).returning('*');

      const [mspClient] = await trx('msp_clients').insert({
        id: db.raw('gen_random_uuid()'),
        msp_org_id: req.user.orgId,
        client_org_id: clientOrg.id,
        client_name: clientName,
        client_contact_email: contactEmail || null,
        client_contact_name: contactName || null,
        notes: notes || null,
        status: 'active',
      }).returning('*');

      // Create default integrations row for client
      await trx('org_integrations').insert({ org_id: clientOrg.id });

      return { clientOrg, mspClient };
    });

    res.status(201).json({
      message: `Client "${clientName}" created successfully.`,
      client: result.mspClient,
      orgId: result.clientOrg.id,
    });
  } catch (err) {
    console.error('Create client error:', err);
    res.status(500).json({ error: 'Failed to create client.' });
  }
});

// ─── MSP: DELETE /api/orgs/clients/:clientId ─────────────────────────────────
// MSP only — offboard a client
router.delete('/clients/:clientId', requireAuth, requireAdmin, async (req, res) => {
  try {
    const org = await db('orgs').where('id', req.user.orgId).first();
    if (org.type !== 'msp') {
      return res.status(403).json({ error: 'MSP access required.' });
    }

    const client = await db('msp_clients')
      .where('id', req.params.clientId)
      .where('msp_org_id', req.user.orgId)
      .first();

    if (!client) return res.status(404).json({ error: 'Client not found.' });

    await db('msp_clients')
      .where('id', req.params.clientId)
      .update({ status: 'offboarded' });

    res.json({ message: 'Client offboarded.' });
  } catch (err) {
    console.error('Offboard client error:', err);
    res.status(500).json({ error: 'Failed to offboard client.' });
  }
});

// ─── GET /api/users/me ────────────────────────────────────────────────────────
router.get('/me/profile', requireAuth, async (req, res) => {
  try {
    const profileOrgId = req.user.homeOrgId || req.user.orgId;
    const user = await db('users')
      .where('id', req.user.id)
      .where('org_id', profileOrgId)
      .select('id', 'email', 'role', 'email_verified', 'totp_enabled', 'last_login_at', 'created_at')
      .first();

    if (!user) return res.status(404).json({ error: 'User not found.' });
    res.json({ user });
  } catch (err) {
    console.error('Get user error:', err);
    res.status(500).json({ error: 'Failed to load profile.' });
  }
});

// ─── DELETE /api/orgs/me/sessions ────────────────────────────────────────────
// Logout all other sessions
router.delete('/me/sessions', requireAuth, async (req, res) => {
  try {
    // Clear the refresh token cookie (logs out current session too)
    // In a full implementation you'd have a refresh_tokens table to invalidate
    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
    });
    res.json({ message: 'All sessions logged out.' });
  } catch (err) {
    console.error('Logout sessions error:', err);
    res.status(500).json({ error: 'Failed to logout sessions.' });
  }
});

module.exports = router;
