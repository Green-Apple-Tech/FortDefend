const FREE_EMAIL_DOMAINS = [
  'gmail.com','yahoo.com','hotmail.com','outlook.com','icloud.com',
  'aol.com','protonmail.com','mail.com','zoho.com','yandex.com',
  'live.com','msn.com','me.com','mac.com',
];

const PLANS = {
  personal: {
    name: 'Personal',
    pricePerDevice: 1,
    deviceLimit: 5,
    stripePriceId: process.env.STRIPE_PERSONAL_PRICE_ID,
    isMetered: true,
    isBusiness: false,
    requiresCard: false,
    requiresBusinessDomain: false,
  },
  starter: {
    name: 'Starter',
    price: 15,
    deviceLimit: 25,
    stripePriceId: process.env.STRIPE_STARTER_PRICE_ID,
    isMetered: false,
    isBusiness: true,
    requiresCard: true,
    requiresBusinessDomain: true,
  },
  growth: {
    name: 'Growth',
    price: 25,
    deviceLimit: 50,
    stripePriceId: process.env.STRIPE_GROWTH_PRICE_ID,
    isMetered: false,
    isBusiness: true,
    requiresCard: true,
    requiresBusinessDomain: true,
  },
  scale: {
    name: 'Scale',
    price: 75,
    deviceLimit: 150,
    stripePriceId: process.env.STRIPE_SCALE_PRICE_ID,
    isMetered: false,
    isBusiness: true,
    requiresCard: true,
    requiresBusinessDomain: true,
  },
};

const MSP_TEST_CLIENT_LIMIT = 2;
const MSP_TEST_DEVICE_LIMIT = 5;
const TRIAL_DAYS = 10;
const GRACE_HOURS = 48;

function isBusinessDomain(email) {
  const domain = email.split('@')[1]?.toLowerCase();
  return domain && !FREE_EMAIL_DOMAINS.includes(domain);
}

function getPlanByPriceId(priceId) {
  return Object.entries(PLANS)
    .find(([, p]) => p.stripePriceId === priceId)?.[0] || null;
}

function getDeviceLimit(plan) {
  return PLANS[plan]?.deviceLimit || 0;
}

function getTrialEndDate() {
  const d = new Date();
  d.setDate(d.getDate() + TRIAL_DAYS);
  return d;
}

function getGraceEndDate(trialEndsAt) {
  const d = new Date(trialEndsAt);
  d.setHours(d.getHours() + GRACE_HOURS);
  return d;
}

function isTrialExpired(trialEndsAt) {
  return trialEndsAt && new Date() > new Date(trialEndsAt);
}

function isGraceExpired(graceEndsAt) {
  return graceEndsAt && new Date() > new Date(graceEndsAt);
}

module.exports = {
  PLANS,
  MSP_TEST_CLIENT_LIMIT,
  MSP_TEST_DEVICE_LIMIT,
  TRIAL_DAYS,
  GRACE_HOURS,
  isBusinessDomain,
  getPlanByPriceId,
  getDeviceLimit,
  getTrialEndDate,
  getGraceEndDate,
  isTrialExpired,
  isGraceExpired,
};
