const express = require('express');
const router = express.Router();
const db = require('../database');
const { v4: uuidv4 } = require('uuid');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const {
  PLANS, MSP_TEST_CLIENT_LIMIT, MSP_TEST_DEVICE_LIMIT, getTrialEndDate,
} = require('../config/plans');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

router.use(requireAuth, requireAdmin);

router.get('/summary', async (req, res, next) => {
  try {
    const clients = await db('orgs').where({ msp_parent_org_id: req.user.orgId });
    const testCount = clients.filter(c => c.is_test_client).length;
    const [deviceCounts, alertCounts] = await Promise.all([
      Promise.all(clients.map(c =>
        db('devices').where({ org_id: c.id }).count('id as n').first()
          .then(r => parseInt(r.n, 10))
      )),
      Promise.all(clients.map(c =>
        db('alerts').where({ org_id: c.id, resolved: false })
          .count('id as n').first().then(r => parseInt(r.n, 10))
      )),
    ]);
    res.json({
      totalClients: clients.length,
      paidClients: clients.length - testCount,
      testClients: testCount,
      testSlotsRemaining: Math.max(0, MSP_TEST_CLIENT_LIMIT - testCount),
      totalDevices: deviceCounts.reduce((a, b) => a + b, 0),
      totalAlerts: alertCounts.reduce((a, b) => a + b, 0),
    });
  } catch (err) { next(err); }
});

router.get('/clients', async (req, res, next) => {
  try {
    const clients = await db('orgs')
      .where({ msp_parent_org_id: req.user.orgId })
      .select('id','name','plan','device_limit','subscription_status',
              'is_test_client','trial_ends_at','created_at')
      .orderBy('created_at', 'desc');
    const withCounts = await Promise.all(clients.map(async (c) => {
      const { n } = await db('devices').where({ org_id: c.id })
        .count('id as n').first();
      return { ...c, deviceCount: parseInt(n, 10) };
    }));
    res.json({ clients: withCounts });
  } catch (err) { next(err); }
});

router.post('/clients', async (req, res, next) => {
  try {
    const { name, plan, isTest = false } = req.body;
    if (!name) return res.status(400).json({ error: 'Client name required.' });

    if (isTest) {
      const { n } = await db('orgs')
        .where({ msp_parent_org_id: req.user.orgId, is_test_client: true })
        .count('id as n').first();
      if (parseInt(n, 10) >= MSP_TEST_CLIENT_LIMIT) {
        return res.status(402).json({
          error: `All ${MSP_TEST_CLIENT_LIMIT} free test client slots are used.`,
        });
      }
    } else {
      if (!plan || !PLANS[plan] || plan === 'personal') {
        return res.status(400).json({ error: 'Choose starter, growth, or scale.' });
      }
    }

    let stripeCustomerId = null;
    let stripeSubscriptionId = null;

    if (!isTest) {
      const customer = await stripe.customers.create({
        name, metadata: { msp_org_id: req.user.orgId },
      });
      stripeCustomerId = customer.id;
      const subscription = await stripe.subscriptions.create({
        customer: customer.id,
        items: [{ price: PLANS[plan].stripePriceId }],
        metadata: { msp_org_id: req.user.orgId },
      });
      stripeSubscriptionId = subscription.id;
    }

    const clientOrg = {
      id: uuidv4(),
      name,
      plan: isTest ? 'growth' : plan,
      device_limit: isTest ? MSP_TEST_DEVICE_LIMIT : PLANS[plan].deviceLimit,
      msp_parent_org_id: req.user.orgId,
      is_test_client: isTest,
      stripe_customer_id: stripeCustomerId,
      stripe_subscription_id: stripeSubscriptionId,
      subscription_status: isTest ? 'trialing' : 'active',
      trial_ends_at: isTest ? getTrialEndDate() : null,
      created_at: new Date(),
      updated_at: new Date(),
    };

    await db('orgs').insert(clientOrg);
    res.status(201).json({ client: clientOrg });
  } catch (err) { next(err); }
});

router.post('/clients/:id/upgrade', async (req, res, next) => {
  try {
    const client = await db('orgs')
      .where({ id: req.params.id, msp_parent_org_id: req.user.orgId }).first();
    if (!client) return res.status(404).json({ error: 'Client not found.' });
    if (!client.is_test_client) {
      return res.status(400).json({ error: 'Already on a paid plan.' });
    }
    const { plan } = req.body;
    if (!plan || !PLANS[plan] || plan === 'personal') {
      return res.status(400).json({ error: 'Invalid plan.' });
    }
    const customer = await stripe.customers.create({ name: client.name });
    const subscription = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: PLANS[plan].stripePriceId }],
    });
    await db('orgs').where({ id: client.id }).update({
      plan,
      device_limit: PLANS[plan].deviceLimit,
      is_test_client: false,
      stripe_customer_id: customer.id,
      stripe_subscription_id: subscription.id,
      subscription_status: 'active',
      trial_ends_at: null,
      is_read_only: false,
      updated_at: new Date(),
    });
    res.json({ message: `Upgraded to ${PLANS[plan].name}.` });
  } catch (err) { next(err); }
});

router.patch('/clients/:id/plan', async (req, res, next) => {
  try {
    const client = await db('orgs')
      .where({ id: req.params.id, msp_parent_org_id: req.user.orgId }).first();
    if (!client) return res.status(404).json({ error: 'Client not found.' });
    const { plan } = req.body;
    if (!plan || !PLANS[plan] || plan === 'personal') {
      return res.status(400).json({ error: 'Invalid plan.' });
    }
    const sub = await stripe.subscriptions.retrieve(client.stripe_subscription_id);
    await stripe.subscriptions.update(client.stripe_subscription_id, {
      items: [{ id: sub.items.data[0].id, price: PLANS[plan].stripePriceId }],
      proration_behavior: 'always_invoice',
    });
    await db('orgs').where({ id: client.id }).update({
      plan, device_limit: PLANS[plan].deviceLimit, updated_at: new Date(),
    });
    res.json({ message: `Plan updated to ${PLANS[plan].name}.` });
  } catch (err) { next(err); }
});

router.delete('/clients/:id', async (req, res, next) => {
  try {
    const client = await db('orgs')
      .where({ id: req.params.id, msp_parent_org_id: req.user.orgId }).first();
    if (!client) return res.status(404).json({ error: 'Client not found.' });
    if (client.stripe_subscription_id) {
      await stripe.subscriptions.cancel(client.stripe_subscription_id);
    }
    await db('orgs').where({ id: client.id }).update({
      subscription_status: 'canceled', updated_at: new Date(),
    });
    res.json({ message: 'Client offboarded. Data retained 30 days.' });
  } catch (err) { next(err); }
});

module.exports = router;
