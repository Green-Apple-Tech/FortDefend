import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { api } from '../lib/api';
import { Card } from '../components/ui';

const PIE_COLORS = ['#2563EB', '#10B981', '#F59E0B', '#8B5CF6', '#94A3B8'];

function isOnline(device) {
  const stamp = device?.last_seen || device?.lastSeen;
  if (!stamp) return false;
  const ts = new Date(stamp).getTime();
  return Number.isFinite(ts) && Date.now() - ts <= 5 * 60 * 1000;
}

function normalizeOs(os) {
  const v = String(os || '').toLowerCase();
  if (v.includes('windows')) return 'Windows';
  if (v.includes('android')) return 'Android';
  if (v.includes('ios') || v.includes('ipados')) return 'iOS';
  if (v.includes('mac') || v.includes('darwin')) return 'macOS';
  if (v.includes('chrome')) return 'ChromeOS';
  return 'Other';
}

function bucketHourLabel(date) {
  return `${String(date.getHours()).padStart(2, '0')}:00`;
}

function relative(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const min = Math.floor((Date.now() - d.getTime()) / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  return `${Math.floor(min / 60)}h ago`;
}

export default function Dashboard() {
  const [devices, setDevices] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [dRes, aRes] = await Promise.all([
          api('/api/integrations/devices').catch(() => ({ devices: [] })),
          api('/api/alerts?resolved=false&limit=50').catch(() => ({ alerts: [] })),
        ]);
        if (cancelled) return;
        setDevices(Array.isArray(dRes?.devices) ? dRes.devices : []);
        setAlerts(Array.isArray(aRes?.alerts) ? aRes.alerts : []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const metrics = useMemo(() => {
    const total = devices.length;
    const online = devices.filter(isOnline).length;
    const scores = devices
      .map((d) => Number(d.security_score))
      .filter((n) => Number.isFinite(n));
    const avgSecurity = scores.length
      ? Math.round(scores.reduce((sum, n) => sum + n, 0) / scores.length)
      : null;
    const activeAlerts = alerts.length;
    return { total, online, avgSecurity, activeAlerts };
  }, [devices, alerts]);

  const osDistribution = useMemo(() => {
    const counts = new Map();
    for (const d of devices) {
      const os = normalizeOs(d.os);
      counts.set(os, (counts.get(os) || 0) + 1);
    }
    return [...counts.entries()].map(([name, value]) => ({ name, value }));
  }, [devices]);

  const activitySeries = useMemo(() => {
    const now = new Date();
    const buckets = Array.from({ length: 8 }, (_, i) => {
      const d = new Date(now);
      d.setMinutes(0, 0, 0);
      d.setHours(now.getHours() - (7 - i));
      return { key: d.getTime(), label: bucketHourLabel(d), online: 0, alerts: 0 };
    });
    for (const d of devices) {
      const stamp = d.last_seen || d.lastSeen;
      if (!stamp) continue;
      const t = new Date(stamp);
      t.setMinutes(0, 0, 0);
      const b = buckets.find((x) => x.key === t.getTime());
      if (b) b.online += 1;
    }
    for (const a of alerts) {
      const t = new Date(a.created_at || a.createdAt);
      if (Number.isNaN(t.getTime())) continue;
      t.setMinutes(0, 0, 0);
      const b = buckets.find((x) => x.key === t.getTime());
      if (b) b.alerts += 1;
    }
    return buckets;
  }, [devices, alerts]);

  const compliance = useMemo(() => {
    const pass = devices.filter((d) => String(d.compliance || '').toLowerCase() === 'pass').length;
    const fail = devices.filter((d) => String(d.compliance || '').toLowerCase() === 'fail').length;
    const unknown = Math.max(0, devices.length - pass - fail);
    return { pass, fail, unknown };
  }, [devices]);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Total Devices</p>
          <p className="mt-2 text-3xl font-bold text-slate-900">{metrics.total}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Online Now</p>
          <p className="mt-2 text-3xl font-bold text-emerald-600">{metrics.online}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Security Score</p>
          <p className="mt-2 text-3xl font-bold text-slate-900">{metrics.avgSecurity ?? '—'}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Active Alerts</p>
          <p className="mt-2 text-3xl font-bold text-amber-600">{metrics.activeAlerts}</p>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold text-slate-900">Fleet Activity</h2>
            <span className="text-xs text-slate-500">From `/api/integrations/devices`</span>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={activitySeries}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis dataKey="label" />
                <YAxis />
                <Tooltip />
                <Line type="monotone" dataKey="online" stroke="#10B981" strokeWidth={2} />
                <Line type="monotone" dataKey="alerts" stroke="#F59E0B" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card className="p-4">
          <h2 className="mb-3 font-semibold text-slate-900">Recent Alerts</h2>
          <ul className="space-y-2">
            {alerts.slice(0, 6).map((a) => (
              <li key={a.id} className="rounded-lg border border-slate-200 p-2">
                <p className="text-sm font-semibold text-slate-800">{a.type || 'Alert'}</p>
                <p className="text-xs text-slate-600">{a.message || 'No details'}</p>
                <p className="mt-1 text-[11px] text-slate-400">{relative(a.created_at)}</p>
              </li>
            ))}
            {alerts.length === 0 && <li className="text-sm text-slate-500">No active alerts.</li>}
          </ul>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <h2 className="mb-3 font-semibold text-slate-900">OS Distribution</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={osDistribution} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={3}>
                  {osDistribution.map((entry, index) => (
                    <Cell key={`${entry.name}-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-4">
          <h2 className="mb-3 font-semibold text-slate-900">Compliance Status</h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-lg bg-emerald-50 px-3 py-2">
              <span className="text-sm font-medium text-emerald-900">Pass</span>
              <span className="text-lg font-bold text-emerald-700">{compliance.pass}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-red-50 px-3 py-2">
              <span className="text-sm font-medium text-red-900">Fail</span>
              <span className="text-lg font-bold text-red-700">{compliance.fail}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-slate-100 px-3 py-2">
              <span className="text-sm font-medium text-slate-700">Unknown</span>
              <span className="text-lg font-bold text-slate-700">{compliance.unknown}</span>
            </div>
          </div>
        </Card>
      </div>

      {loading ? <p className="text-sm text-slate-500">Loading dashboard...</p> : null}
      <div className="text-sm">
        <Link to="/devices" className="font-semibold text-brand hover:underline">
          Open full device list
        </Link>
      </div>
    </div>
  );
}
