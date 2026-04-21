require('dotenv').config();
const express = require('express');
const Stripe = require('stripe');
const { z } = require('zod');

const db = require('../database');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { getAppUrl } = require('../utils/appUrl');

const PLAN_LIMITS = {
  personal: { device_limit: 5 },
  starter: { device_limit: 50 },
  growth: { device_limit: 100 },
  scale: { device_limit: 1000 },
};

const CHECKOUT_PLANS = z.enum(['personal', 'starter', 'growth', 'scale']);

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    const err = new Error('Stripe is not configured.');
    err.status = 503;
    throw err;
  }
  return new Stripe(key);
}

function priceIdToPlan() {
  return {
    [process.env.STRIPE_PERSONAL_PRICE_ID]: 'personal',
    [process.env.STRIPE_STARTER_PRICE_ID]: 'starter',
    [process.env.STRIPE_GROWTH_PRICE_ID]: 'growth',
    [process.env.STRIPE_SCALE_PRICE_ID]: 'scale',
  };
}

function planToPriceId(plan) {
  const map = {
    personal: process.env.STRIPE_PERSONAL_PRICE_ID,
    starter: process.env.STRIPE_STARTER_PRICE_ID,
    growth: process.env.STRIPE_GROWTH_PRICE_ID,
    scale: process.env.STRIPE_SCALE_PRICE_ID,
  };
  return map[plan];
}

function resolvePlanFromSubscription(subscription) {
  const priceMap = priceIdToPlan();
  const item = subscription.items?.data?.[0];
  const priceId = item?.price?.id;
  if (priceId && priceMap[priceId]) return priceMap[priceId];
  const metaPlan = subscription.metadata?.plan;
  if (metaPlan && PLAN_LIMITS[metaPlan]) return metaPlan;
  return null;
}

async function updateOrgFromSubscription(orgId, subscription) {
  const plan = resolvePlanFromSubscription(subscription);
  const limits = plan ? PLAN_LIMITS[plan] : null;

  const updates = {
    stripe_subscription_id: subscription.id,
    subscription_status: subscription.status,
    updated_at: new Date(),
  };

  if (subscription.current_period_end) {
    updates.next_billing_at = new Date(subscription.current_period_end * 1000);
  }

  if (plan && limits) {
    updates.plan = plan;
    updates.device_limit = limits.device_limit;
  }

  await db('orgs').where('id', orgId).update(updates);
}

async function findOrgIdForStripeCustomer(customerId) {
  if (!customerId) return null;
  const org = await db('orgs').where('stripe_customer_id', customerId).first();
  return org?.id || null;
}

const billingRouter = express.Router();
const webhookRouter = express.Router();

billingRouter.post('/checkout', requireAuth, async (req, res) => {
  try {
    const parsed = z.object({ plan: CHECKOUT_PLANS }).safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid plan. Use personal, starter, growth, or scale.' });
    }

    const { plan } = parsed.data;
    const priceId = planToPriceId(plan);
    if (!priceId) {
      return res.status(503).json({ error: 'Billing is not fully configured (missing price ID).' });
    }

    let appUrl;
    try {
      appUrl = getAppUrl();
    } catch {
      return res.status(503).json({ error: 'APP_URL is not configured.' });
    }

    const org = await db('orgs').where('id', req.user.orgId).first();
    if (!org) return res.status(404).json({ error: 'Organization not found.' });

    if (
      org.stripe_subscription_id &&
      org.subscription_status &&
      ['active', 'trialing'].includes(org.subscription_status)
    ) {
      return res.status(409).json({
        error: 'You already have an active subscription. Use the billing portal to change plans.',
      });
    }

    const stripe = getStripe();

    let customerId = org.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: req.user.email,
        metadata: { org_id: org.id },
      });
      customerId = customer.id;
      await db('orgs').where('id', org.id).update({
        stripe_customer_id: customerId,
        updated_at: new Date(),
      });
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${appUrl}/dashboard?payment=success`,
      cancel_url: `${appUrl}/pricing`,
      metadata: { org_id: org.id, plan },
      subscription_data: {
        metadata: { org_id: org.id, plan },
      },
      allow_promotion_codes: true,
    });

    if (!session.url) {
      return res.status(500).json({ error: 'Checkout session did not return a URL.' });
    }

    res.json({ checkoutUrl: session.url });
  } catch (err) {
    console.error('Billing checkout error:', err);
    const status = err.status || 500;
    res.status(status).json({ error: err.message || 'Failed to start checkout.' });
  }
});

billingRouter.get('/portal', requireAuth, requireAdmin, async (req, res) => {
  try {
    let appUrl;
    try {
      appUrl = getAppUrl();
    } catch {
      return res.status(503).json({ error: 'APP_URL is not configured.' });
    }

    const org = await db('orgs').where('id', req.user.orgId).first();
    if (!org?.stripe_customer_id) {
      return res.status(400).json({ error: 'No billing account on file. Subscribe first.' });
    }

    const stripe = getStripe();
    const portal = await stripe.billingPortal.sessions.create({
      customer: org.stripe_customer_id,
      return_url: `${appUrl}/dashboard`,
    });

    res.json({ portalUrl: portal.url });
  } catch (err) {
    console.error('Billing portal error:', err);
    res.status(500).json({ error: err.message || 'Failed to open billing portal.' });
  }
});

billingRouter.get('/status', requireAuth, async (req, res) => {
  try {
    const org = await db('orgs').where('id', req.user.orgId).first();
    if (!org) return res.status(404).json({ error: 'Organization not found.' });

    const deviceRow = await db('devices')
      .where('org_id', req.user.orgId)
      .count('id as count')
      .first();

    res.json({
      current_plan: org.plan,
      device_limit: org.device_limit != null ? parseInt(org.device_limit, 10) : 5,
      device_count: parseInt(deviceRow.count, 10),
      subscription_status: org.subscription_status,
      next_billing_date: org.next_billing_at ? new Date(org.next_billing_at).toISOString() : null,
    });
  } catch (err) {
    console.error('Billing status error:', err);
    res.status(500).json({ error: 'Failed to load billing status.' });
  }
});

webhookRouter.post('/', async (req, res) => {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error('STRIPE_WEBHOOK_SECRET is not set.');
    return res.status(503).send('Webhook not configured.');
  }

  const sig = req.headers['stripe-signature'];
  if (!sig) {
    return res.status(400).send('Missing stripe-signature header.');
  }

  let event;
  try {
    const stripe = getStripe();
    const payload = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body));
    event = stripe.webhooks.constructEvent(payload, sig, secret);
  } catch (err) {
    console.error('Stripe webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  const stripe = getStripe();

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        if (session.mode !== 'subscription' || !session.subscription) break;

        const orgId = session.metadata?.org_id;
        if (!orgId) {
          console.error('checkout.session.completed: missing org_id metadata');
          break;
        }

        const subscription = await stripe.subscriptions.retrieve(session.subscription, {
          expand: ['items.data.price'],
        });
        await updateOrgFromSubscription(orgId, subscription);
        break;
      }

      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const orgId =
          subscription.metadata?.org_id ||
          (await findOrgIdForStripeCustomer(subscription.customer));

        if (!orgId) {
          console.error(`${event.type}: could not resolve org for subscription ${subscription.id}`);
          break;
        }

        if (event.type === 'customer.subscription.deleted') {
          await db('orgs').where('id', orgId).update({
            stripe_subscription_id: null,
            subscription_status: 'canceled',
            plan: null,
            device_limit: 5,
            next_billing_at: null,
            updated_at: new Date(),
          });
          break;
        }

        await updateOrgFromSubscription(orgId, subscription);
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        const orgId = await findOrgIdForStripeCustomer(invoice.customer);
        if (!orgId) break;

        await db('orgs').where('id', orgId).update({
          subscription_status: 'past_due',
          updated_at: new Date(),
        });
        break;
      }

      case 'invoice.paid': {
        const invoice = event.data.object;
        const orgId = await findOrgIdForStripeCustomer(invoice.customer);
        if (!orgId) break;

        if (invoice.subscription) {
          const subscription = await stripe.subscriptions.retrieve(invoice.subscription, {
            expand: ['items.data.price'],
          });
          await updateOrgFromSubscription(orgId, subscription);
        } else {
          await db('orgs').where('id', orgId).update({
            subscription_status: 'active',
            updated_at: new Date(),
          });
        }
        break;
      }

      default:
        break;
    }

    res.json({ received: true });
  } catch (err) {
    console.error('Stripe webhook handler error:', err);
    res.status(500).json({ error: 'Webhook handler failed.' });
  }
});

billingRouter.webhookRouter = webhookRouter;

module.exports = billingRouter;
