const express = require('express');
const router = express.Router();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const db = require('../database');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { PLANS, getPlanByPriceId } = require('../config/plans');
const { v4: uuidv4 } = require('uuid');

router.post('/checkout', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { plan, couponCode } = req.body;
    if (!PLANS[plan]) return res.status(400).json({ error: 'Invalid plan.' });

    const planConfig = PLANS[plan];
    const org = await db('orgs').where({ id: req.user.orgId }).first();

    let customerId = org.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: req.user.email,
        name: org.name,
        metadata: { org_id: org.id },
      });
      customerId = customer.id;
      await db('orgs').where({ id: org.id })
        .update({ stripe_customer_id: customerId });
    }

    const { n } = await db('devices')
      .where({ org_id: org.id }).count('id as n').first();
    const deviceCount = Math.max(1, parseInt(n, 10));

    const sessionParams = {
      customer: customerId,
      mode: 'subscription',
      success_url: `${process.env.APP_URL}/dashboard?payment=success`,
      cancel_url: `${process.env.APP_URL}/pricing`,
      metadata: { org_id: org.id, plan },
      subscription_data: {
        metadata: { org_id: org.id, plan },
        ...(planConfig.isBusiness && {
          trial_period_days: 10,
          trial_settings: {
            end_behavior: { missing_payment_method: 'pause' },
          },
          cancel_at: Math.floor(Date.now() / 1000) + (12 * 24 * 60 * 60),
        }),
      },
      line_items: [{
        price: planConfig.stripePriceId,
        quantity: plan === 'personal' ? deviceCount : 1,
      }],
      ...(planConfig.isBusiness && {
        payment_method_collection: 'always',
        consent_collection: { terms_of_service: 'required' },
      }),
    };

    if (couponCode) {
      try {
        await stripe.coupons.retrieve(couponCode);
        sessionParams.discounts = [{ coupon: couponCode }];
      } catch { /* invalid coupon */ }
    }

    const session = await stripe.checkout.sessions.create(sessionParams);
    res.json({ checkoutUrl: session.url });
  } catch (err) { next(err); }
});

router.post('/activate', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const org = await db('orgs').where({ id: req.user.orgId }).first();
    if (!org.stripe_subscription_id) {
      return res.status(400).json({ error: 'No subscription found.' });
    }
    await stripe.subscriptions.update(org.stripe_subscription_id, {
      trial_end: 'now',
      cancel_at: null,
      proration_behavior: 'none',
    });
    await db('orgs').where({ id: org.id }).update({
      subscription_status: 'active',
      is_read_only: false,
      trial_ends_at: null,
      grace_ends_at: null,
      updated_at: new Date(),
    });
    res.json({ message: 'Plan activated. Welcome to FortDefend!' });
  } catch (err) { next(err); }
});

router.post('/webhook',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    let event;
    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        req.headers['stripe-signature'],
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch {
      return res.status(400).json({ error: 'Webhook signature invalid.' });
    }

    const obj = event.data.object;

    try {
      switch (event.type) {
        case 'checkout.session.completed': {
          const plan = obj.metadata?.plan;
          if (!plan || !PLANS[plan]) break;
          await db('orgs').where({ id: obj.metadata.org_id }).update({
            plan,
            device_limit: PLANS[plan].deviceLimit,
            stripe_subscription_id: obj.subscription,
            subscription_status: 'trialing',
            updated_at: new Date(),
          });
          break;
        }
        case 'customer.subscription.updated': {
          const priceId = obj.items?.data?.[0]?.price?.id;
          const plan = getPlanByPriceId(priceId);
          const orgRow = await db('orgs')
            .where({ stripe_subscription_id: obj.id }).first();
          if (!orgRow) break;
          await db('orgs').where({ id: orgRow.id }).update({
            ...(plan && { plan, device_limit: PLANS[plan].deviceLimit }),
            subscription_status: obj.status,
            updated_at: new Date(),
          });
          break;
        }
        case 'customer.subscription.deleted': {
          const orgRow = await db('orgs')
            .where({ stripe_subscription_id: obj.id }).first();
          if (!orgRow) break;
          await db('orgs').where({ id: orgRow.id }).update({
            subscription_status: 'canceled',
            is_read_only: true,
            updated_at: new Date(),
          });
          break;
        }
        case 'invoice.payment_failed': {
          const sub = await stripe.subscriptions.retrieve(obj.subscription);
          const orgRow = await db('orgs')
            .where({ stripe_subscription_id: sub.id }).first();
          if (!orgRow) break;
          await db('orgs').where({ id: orgRow.id }).update({
            subscription_status: 'past_due',
            updated_at: new Date(),
          });
          break;
        }
        case 'invoice.paid': {
          const sub = await stripe.subscriptions.retrieve(obj.subscription);
          const orgRow = await db('orgs')
            .where({ stripe_subscription_id: sub.id }).first();
          if (!orgRow) break;
          await db('orgs').where({ id: orgRow.id }).update({
            subscription_status: 'active',
            is_read_only: false,
            updated_at: new Date(),
          });
          break;
        }
      }
    } catch (err) {
      console.error('Webhook error:', err.message);
    }

    res.json({ received: true });
  }
);

router.get('/status', requireAuth, async (req, res, next) => {
  try {
    const org = await db('orgs').where({ id: req.user.orgId }).first();
    const { n } = await db('devices')
      .where({ org_id: org.id }).count('id as n').first();
    const deviceCount = parseInt(n, 10);
    const now = new Date();
    const trialDaysLeft = org.trial_ends_at
      ? Math.max(0, Math.ceil((new Date(org.trial_ends_at) - now) / 86400000))
      : null;
    const graceDaysLeft = org.grace_ends_at
      ? Math.max(0, Math.ceil((new Date(org.grace_ends_at) - now) / 86400000))
      : null;
    res.json({
      plan: org.plan,
      planName: PLANS[org.plan]?.name || 'None',
      deviceLimit: org.device_limit,
      deviceCount,
      subscriptionStatus: org.subscription_status,
      isReadOnly: org.is_read_only,
      isTrialing: org.subscription_status === 'trialing',
      trialEndsAt: org.trial_ends_at,
      trialDaysLeft,
      graceEndsAt: org.grace_ends_at,
      graceDaysLeft,
      monthlyTotal: org.plan === 'personal'
        ? deviceCount : (PLANS[org.plan]?.price || 0),
    });
  } catch (err) { next(err); }
});

router.get('/portal', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const org = await db('orgs').where({ id: req.user.orgId }).first();
    if (!org.stripe_customer_id) {
      return res.status(400).json({ error: 'No billing account found. Please upgrade first.' });
    }
    const session = await stripe.billingPortal.sessions.create({
      customer: org.stripe_customer_id,
      return_url: `${process.env.APP_URL}/settings`,
    });
    res.json({ portalUrl: session.url });
  } catch (err) { next(err); }
});

router.post('/referral/generate', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const org = await db('orgs').where({ id: req.user.orgId }).first();
    if (org.referral_code) {
      return res.json({
        referralCode: org.referral_code,
        referralUrl: `${process.env.APP_URL}/signup?ref=${org.referral_code}`,
      });
    }
    const code = uuidv4().slice(0, 8).toUpperCase();
    await db('orgs').where({ id: org.id }).update({ referral_code: code });
    res.json({
      referralCode: code,
      referralUrl: `${process.env.APP_URL}/signup?ref=${code}`,
    });
  } catch (err) { next(err); }
});

router.get('/referral/stats', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const org = await db('orgs').where({ id: req.user.orgId }).first();
    const referrals = await db('referrals').where({ referrer_org_id: org.id });
    res.json({
      referralCode: org.referral_code,
      referralUrl: org.referral_code
        ? `${process.env.APP_URL}/signup?ref=${org.referral_code}` : null,
      totalReferrals: referrals.length,
      creditsEarned: referrals.filter(r => r.credited_at).length,
    });
  } catch (err) { next(err); }
});

module.exports = router;
