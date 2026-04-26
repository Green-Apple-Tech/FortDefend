import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { RadialBar, RadialBarChart, ResponsiveContainer } from 'recharts';
import { api } from '../lib/api';
import { Button, Card, Input } from '../components/ui';

function isOnline(device) {
  const stamp = device?.last_seen || device?.lastSeen;
  if (!stamp) return false;
  const ts = new Date(stamp).getTime();
  return Number.isFinite(ts) && Date.now() - ts <= 5 * 60 * 1000;
}

function osIcon(os) {
  const low = String(os || '').toLowerCase();
  if (low.includes('android') || low.includes('ios')) return '📱';
  if (low.includes('mac')) return '🖥️';
  return '💻';
}

function pct(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : null;
}

function Gauge({ label, value, color }) {
  const safe = pct(value) ?? 0;
  const data = [{ name: label, value: safe, fill: color }];
  return (
    <div className="rounded-xl border border-slate-200 p-3">
      <div className="h-36">
        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChart innerRadius="70%" outerRadius="100%" data={data} startAngle={90} endAngle={-270}>
            <RadialBar dataKey="value" cornerRadius={10} />
          </RadialBarChart>
        </ResponsiveContainer>
      </div>
      <p className="text-center text-sm font-semibold text-slate-700">
        {label}: {pct(value) == null ? '—' : `${Math.round(safe)}%`}
      </p>
    </div>
  );
}

export default function DeviceDetail() {
  const { deviceId } = useParams();
  const navigate = useNavigate();
  const [tab, setTab] = useState('overview');
  const [device, setDevice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [alerts, setAlerts] = useState([]);
  const [apps, setApps] = useState([]);
  const [scripts, setScripts] = useState([]);
  const [query, setQuery] = useState('');

  useEffect(() => {
    let cancelled = false;
    let timeoutId;
    (async () => {
      setLoading(true);
      setError('');
      if (!deviceId) {
        setError('Missing device ID in route params.');
        setLoading(false);
        return;
      }

      timeoutId = setTimeout(() => {
        if (cancelled) return;
        setError('Request timed out after 5 seconds.');
        setLoading(false);
      }, 5000);

      try {
        console.log('Fetching device:', deviceId);
        const [dRes, appRes, scrRes] = await Promise.all([
          api(`/api/integrations/devices/${encodeURIComponent(deviceId)}`),
          api(`/api/devices/${encodeURIComponent(deviceId)}/apps`).catch(() => ({ applications: [] })),
          api(`/api/devices/${encodeURIComponent(deviceId)}/script-history`).catch(() => ({ history: [] })),
        ]);
        if (cancelled) return;
        setDevice(dRes?.device || null);
        setAlerts(Array.isArray(dRes?.alerts) ? dRes.alerts : []);
        setApps(Array.isArray(appRes?.applications) ? appRes.applications : []);
        setScripts(Array.isArray(scrRes?.history) ? scrRes.history : []);
        if (!dRes?.device) {
          setError('Device not found from integrations endpoint.');
        }
      } catch (err) {
        if (cancelled) return;
        setError(err?.message || 'Failed to load device details.');
      } finally {
        if (cancelled) return;
        clearTimeout(timeoutId);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [deviceId]);

  const appRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return apps;
    return apps.filter((a) =>
      `${a.app_name || ''} ${a.installed_version || ''} ${a.publisher || ''}`.toLowerCase().includes(q),
    );
  }, [apps, query]);

  const cpu = pct(device?.cpu_usage_pct ?? device?.cpuUsage);
  const ram = (() => {
    const used = Number(device?.mem_used_gb ?? device?.memUsed);
    const total = Number(device?.mem_total_gb ?? device?.ram_total_gb ?? device?.memTotal);
    if (!Number.isFinite(used) || !Number.isFinite(total) || total <= 0) return null;
    return (used / total) * 100;
  })();
  const disk = (() => {
    const free = Number(device?.disk_free_gb);
    const total = Number(device?.disk_total_gb);
    if (!Number.isFinite(free) || !Number.isFinite(total) || total <= 0) return null;
    return ((total - free) / total) * 100;
  })();

  if (loading) return <Card>Loading device...</Card>;
  if (error) return <Card className="text-red-700">{error}</Card>;
  if (!device) return <Card>Device not found.</Card>;

  return (
    <div className="space-y-4">
      <button type="button" className="text-sm font-semibold text-brand hover:underline" onClick={() => navigate('/devices')}>
        ← Back to Devices
      </button>

      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-2xl">{osIcon(device.os)}</span>
              <h1 className="text-2xl font-bold text-slate-900">{device.name || device.id}</h1>
            </div>
            <p className="mt-1 text-sm text-slate-600">{device.os || 'Unknown OS'}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${isOnline(device) ? 'bg-emerald-100 text-emerald-900' : 'bg-slate-100 text-slate-700'}`}>
              {isOnline(device) ? 'Online' : 'Offline'}
            </span>
            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${Number(device.security_score) < 70 ? 'bg-red-100 text-red-900' : 'bg-emerald-100 text-emerald-900'}`}>
              {Number(device.security_score) < 70 ? 'Needs Attention' : 'Healthy'}
            </span>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <Gauge label="CPU" value={cpu} color="#2563EB" />
        <Gauge label="RAM" value={ram} color="#F59E0B" />
        <Gauge label="Disk" value={disk} color="#10B981" />
      </div>

      <div className="flex gap-1 overflow-x-auto border-b border-fds-border">
        {['overview', 'applications', 'alerts', 'scripts', 'live_actions'].map((name) => (
          <button
            key={name}
            type="button"
            onClick={() => setTab(name)}
            className={`whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-semibold ${
              tab === name ? 'border-brand text-brand' : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            {name === 'live_actions'
              ? 'Live Actions'
              : name.charAt(0).toUpperCase() + name.slice(1)}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2 p-4">
            <h2 className="mb-3 font-semibold text-slate-900">Hardware Information</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                ['Hostname', device.hostname || device.name || '—'],
                ['Serial', device.serial || '—'],
                ['CPU Model', device.cpu_model || '—'],
                ['CPU Cores', device.cpu_cores || '—'],
                ['RAM Total', device.mem_total_gb ? `${Number(device.mem_total_gb).toFixed(1)} GB` : '—'],
                ['Disk Total', device.disk_total_gb ? `${Number(device.disk_total_gb).toFixed(1)} GB` : '—'],
              ].map(([k, v]) => (
                <div key={k} className="rounded-lg border border-slate-200 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{k}</p>
                  <p className="mt-1 text-sm font-medium text-slate-800">{v}</p>
                </div>
              ))}
            </div>
          </Card>
          <Card className="p-4">
            <h2 className="mb-3 font-semibold text-slate-900">Security Score</h2>
            <div className="mx-auto flex h-28 w-28 items-center justify-center rounded-full bg-slate-100 text-3xl font-bold text-slate-800">
              {Number.isFinite(Number(device.security_score)) ? Math.round(Number(device.security_score)) : '—'}
            </div>
            <h3 className="mt-4 font-semibold text-slate-900">Network Info</h3>
            <p className="mt-1 text-sm text-slate-600">IP: {device.ip_address || '—'}</p>
            <p className="text-sm text-slate-600">MAC: {device.mac_address || '—'}</p>
            <p className="text-sm text-slate-600">Last Seen: {device.last_seen || device.lastSeen || '—'}</p>
          </Card>
        </div>
      )}

      {tab === 'applications' && (
        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="font-semibold text-slate-900">Installed Applications</h2>
            <Input placeholder="Search applications..." value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Version</th>
                  <th className="px-3 py-2">Publisher</th>
                  <th className="px-3 py-2">Installed</th>
                </tr>
              </thead>
              <tbody>
                {appRows.map((a) => (
                  <tr key={`${a.app_name}-${a.installed_version || ''}`} className="border-t border-fds-border">
                    <td className="px-3 py-2">{a.app_name || '—'}</td>
                    <td className="px-3 py-2">{a.installed_version || '—'}</td>
                    <td className="px-3 py-2">{a.publisher || '—'}</td>
                    <td className="px-3 py-2">{a.last_scanned_at || a.updated_at || '—'}</td>
                  </tr>
                ))}
                {appRows.length === 0 && (
                  <tr>
                    <td className="px-3 py-6 text-center text-slate-500" colSpan={4}>No applications found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {tab === 'alerts' && (
        <Card className="p-4">
          <h2 className="mb-3 font-semibold text-slate-900">Alerts</h2>
          <ul className="space-y-2">
            {alerts.map((a) => (
              <li key={a.id} className="rounded-lg border border-slate-200 p-3">
                <p className="text-sm font-semibold text-slate-800">{a.type || 'Alert'}</p>
                <p className="text-sm text-slate-600">{a.message || 'No details'}</p>
              </li>
            ))}
            {alerts.length === 0 && <li className="text-sm text-slate-500">No active alerts.</li>}
          </ul>
        </Card>
      )}

      {tab === 'scripts' && (
        <Card className="p-4">
          <h2 className="mb-3 font-semibold text-slate-900">Scripts</h2>
          <ul className="space-y-2">
            {scripts.map((s) => (
              <li key={s.id} className="rounded-lg border border-slate-200 p-3">
                <p className="text-sm font-semibold text-slate-800">{s.command_payload?.scriptName || 'Script run'}</p>
                <p className="text-xs text-slate-500">{s.status || 'unknown'}</p>
              </li>
            ))}
            {scripts.length === 0 && <li className="text-sm text-slate-500">No script history.</li>}
          </ul>
        </Card>
      )}

      {tab === 'live_actions' && (
        <Card className="p-4">
          <h2 className="mb-3 font-semibold text-slate-900">Live Actions</h2>
          <p className="text-sm text-slate-600">Live action controls remain available from your existing command workflows.</p>
        </Card>
      )}
    </div>
  );
}

