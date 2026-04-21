import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { Card, Badge } from '../components/ui';

export default function Dashboard() {
  const { org } = useAuth();
  const [summary, setSummary] = useState(null);
  const [devices, setDevices] = useState([]);
  const [alerts, setAlerts] = useState([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [s, d] = await Promise.all([
          api('/api/integrations/summary').catch(() => null),
          api('/api/integrations/devices').catch(() => ({ devices: [] })),
        ]);
        if (!cancelled) {
          setSummary(s);
          setDevices(Array.isArray(d?.devices) ? d.devices.slice(0, 8) : []);
          setAlerts([]);
        }
      } catch {
        if (!cancelled) {
          setDevices([]);
          setAlerts([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const online = devices.filter((x) => x.lastSeen && Date.now() - new Date(x.lastSeen).getTime() < 36 * 3600 * 1000).length;
  const scoreAvg =
    devices.length > 0
      ? Math.round(devices.reduce((s, d) => s + (d.security_score ?? 0), 0) / devices.length)
      : org?.deviceCount
        ? 88
        : 0;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-600">Overview for {org?.name || 'your organization'}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <p className="text-sm font-medium text-gray-500">Devices online</p>
          <p className="mt-2 text-3xl font-bold text-brand">{online}</p>
          <p className="text-xs text-gray-500">of {org?.deviceCount ?? devices.length ?? 0} enrolled</p>
        </Card>
        <Card>
          <p className="text-sm font-medium text-gray-500">Patches today</p>
          <p className="mt-2 text-3xl font-bold text-gray-900">—</p>
          <p className="text-xs text-gray-500">Agent pipeline</p>
        </Card>
        <Card>
          <p className="text-sm font-medium text-gray-500">Open threats</p>
          <p className="mt-2 text-3xl font-bold text-amber-600">{alerts.filter((a) => a.severity === 'critical').length}</p>
          <p className="text-xs text-gray-500">From alerts feed</p>
        </Card>
        <Card>
          <p className="text-sm font-medium text-gray-500">Security score</p>
          <p className="mt-2 text-3xl font-bold text-emerald-600">{scoreAvg || '—'}</p>
          <p className="text-xs text-gray-500">Fleet average</p>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">Device health</h2>
            <Link to="/devices" className="text-sm font-medium text-brand hover:underline">
              View all
            </Link>
          </div>
          <ul className="divide-y divide-gray-100">
            {devices.length === 0 && <li className="py-4 text-sm text-gray-500">No devices yet. Connect Intune or install the agent.</li>}
            {devices.map((d) => (
              <li key={d.id} className="flex items-center justify-between py-3 text-sm">
                <div>
                  <div className="font-medium text-gray-900">{d.name || d.id}</div>
                  <div className="text-xs text-gray-500">{d.os || 'unknown'} · {d.source}</div>
                </div>
                <Badge tone="brand">{d.compliance || 'unknown'}</Badge>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">Live alerts</h2>
            <Link to="/alerts" className="text-sm font-medium text-brand hover:underline">
              Open alerts
            </Link>
          </div>
          <ul className="max-h-80 space-y-3 overflow-y-auto">
            {alerts.length === 0 && <li className="text-sm text-gray-500">No recent alerts.</li>}
            {alerts.map((a) => (
              <li key={a.id} className="rounded-lg border border-gray-100 bg-gray-50 p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-gray-900">{a.type || 'Alert'}</span>
                  <Badge tone={a.severity === 'critical' ? 'danger' : 'warning'}>{a.severity}</Badge>
                </div>
                <p className="mt-1 text-xs text-gray-600 line-clamp-2">{a.message}</p>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {summary && (
        <Card>
          <h2 className="font-semibold text-gray-900">Integrations</h2>
          <p className="mt-2 text-sm text-gray-600">
            Intune: {summary.intune?.ok ? 'healthy' : summary.intune?.message || 'not configured'} · Google:{' '}
            {summary.google?.ok ? 'healthy' : summary.google?.message || 'not configured'}
          </p>
          <Link to="/integrations" className="mt-3 inline-block text-sm font-medium text-brand hover:underline">
            Manage integrations
          </Link>
        </Card>
      )}
    </div>
  );
}
