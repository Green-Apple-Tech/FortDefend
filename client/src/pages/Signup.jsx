import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { Button, Input } from '../components/ui';

const PLANS = [
  {
    id: 'personal',
    label: 'Personal',
    description: 'For individuals managing their own devices.',
    price: 'Free',
    role: 'admin',
  },
  {
    id: 'starter',
    label: 'Starter',
    description: 'Small teams up to 25 devices.',
    price: '$29/mo',
    role: 'admin',
  },
  {
    id: 'growth',
    label: 'Growth',
    description: 'Growing businesses up to 100 devices.',
    price: '$79/mo',
    role: 'admin',
  },
  {
    id: 'scale',
    label: 'Scale',
    description: 'Large organizations, unlimited devices.',
    price: '$199/mo',
    role: 'admin',
  },
  {
    id: 'msp',
    label: 'MSP',
    description: 'Manage multiple client organizations.',
    price: '$299/mo',
    role: 'msp',
  },
  {
    id: 'enterprise',
    label: 'School / Enterprise',
    description: 'Hierarchical groups for schools and large enterprises.',
    price: 'Contact us',
    role: 'admin',
  },
];

export default function Signup() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [orgName, setOrgName] = useState('');
  const [plan, setPlan] = useState('personal');
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
      window.location.href = 'mailto:sales@fortdefend.com?subject=School/Enterprise Inquiry';
      return;
    }
    setLoading(true);
    try {
      const selectedPlan = plan === 'msp' ? 'growth' : plan;
      await api('/api/auth/signup', {
        method: 'POST',
        body: {
          email,
          password,
          orgName: orgName || undefined,
          plan: selectedPlan,
          role: PLANS.find(p => p.id === plan)?.role || 'admin',
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
      <div className="mx-auto w-full max-w-2xl">
        <div className="mb-8 text-center">
          <Link to="/" className="text-2xl font-bold text-brand">
            FortDefend
          </Link>
          <h1 className="mt-6 text-2xl font-semibold text-gray-900">Create your account</h1>
          <p className="mt-2 text-sm text-gray-600">Choose the plan that fits your needs.</p>
        </div>

        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {PLANS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPlan(p.id)}
              className={`rounded-xl border p-4 text-left transition-all ${
                plan === p.id
                  ? 'border-brand bg-brand/5 ring-2 ring-brand'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              <div className="font-semibold text-gray-900 text-sm">{p.label}</div>
              <div className="mt-1 text-xs text-gray-500">{p.description}</div>
              <div className={`mt-2 text-xs font-bold ${plan === p.id ? 'text-brand' : 'text-gray-700'}`}>
                {p.price}
              </div>
            </button>
          ))}
        </div>

        <form onSubmit={onSubmit} className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm space-y-4">
          {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
          <Input
            label="Organization name"
            placeholder={plan === 'msp' ? 'Your MSP company name' : plan === 'enterprise' ? 'School or organization name' : 'Your company name (optional)'}
            value={orgName}
            onChange={(e) => setOrgName(e.target.value)}
          />
          <Input label="Email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <Input label="Password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          <Input label="Confirm password" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
          <p className="text-xs text-gray-500">8+ characters, one uppercase letter, one number.</p>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Creating…' : plan === 'enterprise' ? 'Contact sales' : 'Create account'}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-gray-600">
          Already have an account?{' '}
          <Link to="/login" className="text-brand hover:underline">
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
}
