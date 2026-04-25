import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { Button, Input } from '../components/ui';
import fortDefendLogo from '../assets/fortdefend-logo.png';

const PLANS = [
  {
    id: 'personal',
    label: 'Personal',
    description: 'For individuals managing their own devices.',
    price: '$1',
    priceSub: 'per device / month',
    features: ['Up to any number of devices', 'Basic security monitoring', 'Patch management'],
    role: 'admin',
    highlight: false,
  },
  {
    id: 'starter',
    label: 'Starter',
    description: 'Small teams and businesses.',
    price: '$25',
    priceSub: 'per month — up to 25 devices',
    features: ['Up to 25 devices', 'Groups & subgroups', 'MSP & school support', 'Priority support'],
    role: 'admin',
    highlight: false,
  },
  {
    id: 'growth',
    label: 'Growth',
    description: 'Growing organizations.',
    price: '$75',
    priceSub: 'per month — up to 100 devices',
    features: ['Up to 100 devices', 'Groups & subgroups', 'MSP & school support', 'Advanced reporting'],
    role: 'admin',
    highlight: true,
  },
  {
    id: 'scale',
    label: 'Scale',
    description: 'Large organizations.',
    price: '$250',
    priceSub: 'per month — up to 500 devices',
    features: ['Up to 500 devices', 'Groups & subgroups', 'MSP & school support', 'Dedicated support'],
    role: 'admin',
    highlight: false,
  },
  {
    id: 'enterprise',
    label: 'Enterprise',
    description: '500+ devices. Schools, MSPs, large enterprises.',
    price: 'Custom',
    priceSub: 'contact us for pricing',
    features: ['Unlimited devices', 'Groups & subgroups', 'Custom integrations'],
    role: 'admin',
    highlight: false,
  },
];

export default function Signup() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [orgName, setOrgName] = useState('');
  const [plan, setPlan] = useState('growth');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    if (plan === 'enterprise') {
      window.location.href = 'mailto:sales@fortdefend.com?subject=Enterprise Inquiry';
      return;
    }
    setLoading(true);
    try {
      await api('/api/auth/signup', {
        method: 'POST',
        body: {
          email,
          password,
          orgName: orgName || undefined,
          plan,
          role: 'admin',
        },
      });
      navigate('/verify-email', { state: { email } });
    } catch (err) {
      setError(err.message || 'Signup failed.');
    }
    setLoading(false);
  }

  return (
    <div className="flex min-h-screen flex-col justify-center bg-gray-50 px-4 py-12">
      <div className="mx-auto w-full max-w-5xl">
        <div className="mb-8 text-center">
          <Link to="/" className="inline-flex items-center gap-2 text-2xl font-bold text-brand">
            <img src={fortDefendLogo} alt="FortDefend logo" className="h-8 w-8 rounded object-cover" />
            <span>FortDefend</span>
          </Link>
          <h1 className="mt-6 text-2xl font-semibold text-gray-900">Create your account</h1>
          <p className="mt-2 text-sm text-gray-600">All plans include a 10-day free trial. No credit card required for Personal.</p>
        </div>

        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {PLANS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPlan(p.id)}
              className={`relative rounded-xl border p-4 text-left transition-all ${
                plan === p.id
                  ? 'border-brand bg-brand/5 ring-2 ring-brand'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              {p.highlight && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-brand px-3 py-0.5 text-xs font-semibold text-white">
                  Most popular
                </div>
              )}
              <div className="font-semibold text-gray-900">{p.label}</div>
              <div className="mt-1 text-xs text-gray-500">{p.description}</div>
              <div className={`mt-3 text-2xl font-bold ${plan === p.id ? 'text-brand' : 'text-gray-900'}`}>
                {p.price}
              </div>
              <div className="text-xs text-gray-500">{p.priceSub}</div>
              <ul className="mt-3 space-y-1">
                {p.features.map((f) => (
                  <li key={f} className="flex items-center gap-1 text-xs text-gray-600">
                    <span className="text-emerald-500">✓</span> {f}
                  </li>
                ))}
              </ul>
            </button>
          ))}
        </div>

        <div className="mx-auto max-w-md">
          <form onSubmit={onSubmit} className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm space-y-4">
            {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
            <Input
              label="Organization / School / Company name"
              placeholder={plan === 'personal' ? 'Optional' : 'Required'}
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              required={plan !== 'personal'}
            />
            <Input label="Email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <Input label="Password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            <Input label="Confirm password" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
            <p className="text-xs text-gray-500">8+ characters, one uppercase letter, one number.</p>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Creating…' : plan === 'enterprise' ? 'Contact sales →' : 'Start free trial'}
            </Button>
            {plan !== 'personal' && (
              <p className="text-center text-xs text-gray-500">10-day free trial. No credit card required to start.</p>
            )}
          </form>

          <p className="mt-6 text-center text-sm text-gray-600">
            Already have an account?{' '}
            <Link to="/login" className="text-brand hover:underline">
              Log in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
