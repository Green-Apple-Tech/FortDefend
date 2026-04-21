export const PLANS = [
  {
    id: 'personal',
    name: 'Personal',
    price: 4,
    period: 'mo',
    devices: 5,
    description: 'Individuals and small families securing a handful of devices.',
    features: ['Up to 5 devices', 'Patch intelligence', 'Email alerts', 'Community support'],
  },
  {
    id: 'starter',
    name: 'Business Starter',
    price: 12,
    period: 'mo',
    devices: 50,
    description: 'Growing teams that need visibility across laptops and Chromebooks.',
    features: ['Up to 50 devices', 'Priority patch queue', 'Slack / Teams hooks', 'Standard support'],
  },
  {
    id: 'growth',
    name: 'Business Growth',
    price: 20,
    period: 'mo',
    devices: 100,
    description: 'Mid-size orgs with compliance goals and automation.',
    features: ['Up to 100 devices', 'AI security agents', 'Compliance packs', 'Chat support'],
  },
  {
    id: 'scale',
    name: 'Enterprise Scale',
    price: 50,
    period: 'mo',
    devices: 1000,
    description: 'Districts and enterprises operating at large scale.',
    features: ['Up to 1,000 devices', 'Dedicated success', 'SSO-ready', '99.9% SLA target'],
  },
];

export const PLAN_IDS = PLANS.map((p) => p.id);
