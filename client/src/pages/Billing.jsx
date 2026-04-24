import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { PLANS } from '../constants/pricing';
import { Card, Button, Input } from '../components/ui';

export default function Billing() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [plan, setPlan] = useState('growth');
  const [portalMsg, setPortalMsg] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const b = await api('/api/billing/status');
        if (!cancelled) setData(b);
      } catch (e) {
        if (!cancelled) setError(e.message || 'Failed to load billing');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const planMeta = PLANS.find((p) => p.id === data?.current_plan) || null;
  const used = data?.device_count ?? 0;
  const limit = data?.device_limit ?? planMeta?.devices ?? 0;
  const pct = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0;

  async function checkout() {
    setPortalMsg('');
    try {
      const res = await api('/api/billing/checkout', { method: 'POST', body: { plan } });
      if (res.checkoutUrl) window.location.href = res.checkoutUrl;
    } catch (e) {
      setPortalMsg(e.message || 'Checkout failed');
    }
  }

  async function openPortal() {
    setPortalMsg('');
    try {
      const res = await api('/api/billing/portal');
      if (res.portalUrl) window.location.href = res.portalUrl;
    } catch (e) {
      setPortalMsg(e.message || 'Portal unavailable (admin only or no Stripe customer).');
    }
  }

  return (
    <div className="space-y-3">
      {loading && <p className="text-sm text-gray-500">Loading…</p>}
      {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {portalMsg && <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{portalMsg}</div>}

      {data && (
        <Card>
          <h2 className="font-semibold text-gray-900">Current plan</h2>
          <p className="mt-2 text-lg text-gray-800">
            {data.current_plan || 'Not subscribed'} · {data.subscription_status || '—'}
          </p>
          {data.next_billing_date && (
            <p className="mt-1 text-sm text-gray-600">Next billing: {new Date(data.next_billing_date).toLocaleDateString()}</p>
          )}
          <div className="mt-6">
            <div className="mb-1 flex justify-between text-xs text-gray-600">
              <span>Devices</span>
              <span>
                {used} / {limit || '—'}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-gray-200">
              <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${pct}%` }} />
            </div>
          </div>

          <div className="mt-8 border-t border-gray-100 pt-6">
            <h3 className="text-sm font-semibold text-gray-900">Upgrade</h3>
            <p className="mt-1 text-xs text-gray-500">Opens Stripe Checkout (requires no active subscription on file).</p>
            <div className="mt-3 flex max-w-md flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex-1">
                <span className="mb-1 block text-sm font-medium text-gray-700">Plan</span>
                <select
                  value={plan}
                  onChange={(e) => setPlan(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                >
                  {PLANS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} — ${p.price}/mo ({p.devices} devices)
                    </option>
                  ))}
                </select>
              </div>
              <Button type="button" onClick={checkout}>
                Checkout
              </Button>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <Button variant="outline" type="button" onClick={openPortal}>
              Billing portal
            </Button>
            <Link to="/pricing">
              <Button variant="outline" type="button">
                Pricing page
              </Button>
            </Link>
          </div>
        </Card>
      )}
    </div>
  );
}
