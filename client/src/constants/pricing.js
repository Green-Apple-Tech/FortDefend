export const PLANS = [
  {
    id: 'personal',
    name: 'Personal',
    price: 4,
    period: 'mo',
    devices: 5,
    description: 'Individuals and small teams patching a handful of Windows PCs.',
    features: ['Up to 5 Windows PCs', 'Patch intelligence', 'Email alerts', 'Community support'],
  },
  {
    id: 'starter',
    name: 'Business Starter',
    price: 12,
    period: 'mo',
    devices: 50,
    description: 'Growing teams that need Windows patching and endpoint visibility.',
    features: ['Up to 50 Windows PCs', 'Priority patch queue', 'Slack / Teams hooks', 'Standard support'],
  },
  {
    id: 'growth',
    name: 'Business Growth',
    price: 20,
    period: 'mo',
    devices: 100,
    description: 'Mid-size orgs with patch compliance goals and automation.',
    features: ['Up to 100 Windows PCs', 'Smart maintenance agents', 'Compliance packs', 'Chat support'],
  },
  {
    id: 'scale',
    name: 'Enterprise Scale',
    price: 50,
    period: 'mo',
    devices: 1000,
    description: 'MSPs and enterprises operating Windows fleets at scale.',
    features: ['Up to 1,000 Windows PCs', 'Dedicated success', 'SSO-ready', '99.9% SLA target'],
  },
];

export const PLAN_IDS = PLANS.map((p) => p.id);
