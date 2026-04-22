const PLANS = {
  personal: {
    deviceLimit: 999999,
    requiresBusinessDomain: false,
    requiresCard: false,
    pricePerDevice: 1,
    flatRate: null,
    groups: false,
    label: 'Personal',
  },
  starter: {
    deviceLimit: 25,
    requiresBusinessDomain: false,
    requiresCard: false,
    flatRate: 25,
    pricePerDevice: null,
    groups: true,
    label: 'Starter',
  },
  growth: {
    deviceLimit: 100,
    requiresBusinessDomain: false,
    requiresCard: false,
    flatRate: 75,
    pricePerDevice: null,
    groups: true,
    label: 'Growth',
  },
  scale: {
    deviceLimit: 500,
    requiresBusinessDomain: false,
    requiresCard: false,
    flatRate: 200,
    pricePerDevice: null,
    groups: true,
    label: 'Scale',
  },
  enterprise: {
    deviceLimit: 999999,
    requiresBusinessDomain: false,
    requiresCard: true,
    flatRate: null,
    pricePerDevice: null,
    groups: true,
    label: 'Enterprise',
  },
};

function isBusinessDomain(email) {
  const freeProviders = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com'];
  const domain = email.split('@')[1]?.toLowerCase();
  return domain && !freeProviders.includes(domain);
}

function getTrialEndDate() {
  const date = new Date();
  date.setDate(date.getDate() + 10);
  return date;
}

module.exports = { PLANS, isBusinessDomain, getTrialEndDate };
