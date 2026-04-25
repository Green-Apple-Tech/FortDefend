import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { Card, Button, Spinner } from '../components/ui';
import { SectionHeader, StatCard, EmptyState } from '../components/fds';

function formatRelative(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const sec = Math.floor((Date.now() - d.getTime()) / 1000);
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

export default function Dashboard() {
  const { user, org, isLoading } = useAuth();
  const [summary, setSummary] = useState(null);
  const [devices, setDevices] = useState([]);
  const [fleetDevices, setFleetDevices] = useState([]);
  const [openAlerts, setOpenAlerts] = useState(0);
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [apiModalOpen, setApiModalOpen] = useState(false);
  const [orgApiKey, setOrgApiKey] = useState('');
  const [apiKeyLoading, setApiKeyLoading] = useState(false);
  const [apiKeyError, setApiKeyError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [s, d, a] = await Promise.all([
          api('/api/integrations/summary').catch(() => null),
          api('/api/integrations/devices').catch(() => ({ devices: [] })),
          api('/api/alerts?resolved=false&limit=50').catch(() => ({ alerts: [] })),
        ]);
        if (!cancelled) {
          setSummary(s && typeof s === 'object' ? s : null);
          const list = Array.isArray(d?.devices) ? d.devices : [];
          const clean = list.filter(Boolean);
          setFleetDevices(clean);
          setDevices(clean.slice(0, 12));
          const alerts = Array.isArray(a?.alerts) ? a.alerts : [];
          setOpenAlerts(alerts.length);
          setActivity(alerts.slice(0, 6));
        }
      } catch {
        if (!cancelled) {
          setSummary(null);
          setDevices([]);
          setFleetDevices([]);
          setOpenAlerts(0);
          setActivity([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const onlineFleet = fleetDevices.filter((x) => {
    const last = x?.lastSeen || x?.last_seen;
    if (!last) return false;
    const ts = new Date(last).getTime();
    return Number.isFinite(ts) && Date.now() - ts < 5 * 60 * 1000;
  });
  const online = onlineFleet.length;

  const offline = fleetDevices.filter((x) => {
    const last = x?.lastSeen || x?.last_seen;
    if (!last) return true;
    const ts = new Date(last).getTime();
    return !Number.isFinite(ts) || Date.now() - ts >= 60 * 60 * 1000;
  }).length;

  const warning = Math.max(0, fleetDevices.length - online - offline);

  const numericScores = fleetDevices.map((d) => Number(d?.security_score)).filter((n) => Number.isFinite(n));
  const compliance = numericScores.length
    ? Math.round(numericScores.reduce((a, b) => a + b, 0) / numericScores.length)
    : null;

  const hasDevices = fleetDevices.length > 0;
  const devicesEnrolled = Number.isFinite(Number(org?.deviceCount)) ? Number(org.deviceCount) : fleetDevices.length;
  const avgCpu = onlineFleet
    .map((d) => Number(d?.cpu_usage_pct ?? d?.cpuUsage))
    .filter((n) => Number.isFinite(n));
  const avgRam = onlineFleet
    .map((d) => {
      const used = Number(d?.mem_used_gb ?? d?.memUsed);
      const total = Number(d?.mem_total_gb ?? d?.ram_total_gb ?? d?.memTotal);
      if (!Number.isFinite(used) || !Number.isFinite(total) || total <= 0) return null;
      return (used / total) * 100;
    })
    .filter((n) => Number.isFinite(n));
  const avgCpuPct = avgCpu.length ? avgCpu.reduce((a, b) => a + b, 0) / avgCpu.length : null;
  const avgRamPct = avgRam.length ? avgRam.reduce((a, b) => a + b, 0) / avgRam.length : null;
  const highCpuAlerts = onlineFleet.filter((d) => Number(d?.cpu_usage_pct ?? d?.cpuUsage) > 80).length;

  let healthTone = 'good';
  let healthLabel = 'Fleet looks healthy';
  if (openAlerts > 5 || (compliance != null && compliance < 70)) {
    healthTone = 'alert';
    healthLabel = 'Attention needed — review alerts and low scores.';
  } else if (openAlerts > 0 || offline > 0 || (compliance != null && compliance < 85)) {
    healthTone = 'warn';
    healthLabel = 'Minor issues — a few devices or alerts need a look.';
  }

  if (isLoading) return <Spinner />;
  if (!user) return null;

  async function openApiModal() {
    setApiModalOpen(true);
    setApiKeyLoading(true);
    setApiKeyError('');
    try {
      const r = await api('/api/orgs/me/api-key');
      setOrgApiKey(r?.apiKey || '');
    } catch (e) {
      setApiKeyError(e.message || 'Could not load API key.');
    } finally {
      setApiKeyLoading(false);
    }
  }

  async function copyApiKey() {
    if (!orgApiKey) return;
    try {
      await navigator.clipboard.writeText(orgApiKey);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="space-y-8">
      <SectionHeader
        title="Dashboard"
        description={`Overview for ${org?.name || 'your organization'}. Simple by default — drill down when you need detail.`}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Devices online"
          value={hasDevices ? online : '—'}
          trend={hasDevices ? `of ${devicesEnrolled} enrolled` : 'Connect integrations or agents'}
          color="success"
          icon="📶"
        />
        <StatCard
          label="Open alerts"
          value={openAlerts}
          trend={openAlerts ? 'Review in Alerts' : 'No open alerts'}
          color={openAlerts ? 'warning' : 'success'}
          icon="🔔"
        />
        <StatCard
          label="Apps outdated"
          value="—"
          trend="Software Manager matrix"
          color="slate"
          icon="📦"
        />
        <StatCard
          label="Compliance score"
          value={compliance != null ? `${compliance}` : 'N/A'}
          trend="Fleet average security score"
          color={compliance != null && compliance >= 80 ? 'success' : 'warning'}
          icon="✓"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">Fleet health</h2>
          <div className="mt-4 flex flex-wrap items-center gap-4">
            <div
              className={`flex h-20 w-20 items-center justify-center rounded-2xl text-3xl ${
                healthTone === 'good'
                  ? 'bg-emerald-100 text-emerald-700'
                  : healthTone === 'warn'
                    ? 'bg-amber-100 text-amber-800'
                    : 'bg-red-100 text-red-700'
              }`}
              aria-hidden
            >
              {healthTone === 'good' ? '✓' : healthTone === 'warn' ? '!' : '⚠'}
            </div>
            <div>
              <p className="text-lg font-semibold text-slate-900">
                {healthTone === 'good' ? 'All clear' : healthTone === 'warn' ? 'Watch list' : 'Action required'}
              </p>
              <p className="mt-1 text-sm text-slate-600">{healthLabel}</p>
              <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-500">
                <span>
                  <strong className="text-emerald-600">{online}</strong> online
                </span>
                <span>·</span>
                <span>
                  <strong className="text-amber-600">{warning}</strong> warnings
                </span>
                <span>·</span>
                <span>
                  <strong className="text-slate-500">{offline}</strong> offline
                </span>
                <span>·</span>
                <span>
                  <strong className="text-slate-700">{avgCpuPct == null ? '—' : `${avgCpuPct.toFixed(1)}%`}</strong> avg CPU
                </span>
                <span>·</span>
                <span>
                  <strong className="text-slate-700">{avgRamPct == null ? '—' : `${avgRamPct.toFixed(1)}%`}</strong> avg RAM
                </span>
                <span>·</span>
                <span>
                  <strong className={highCpuAlerts > 0 ? 'text-red-600' : 'text-emerald-600'}>{highCpuAlerts}</strong> high CPU ({'>'}80%)
                </span>
              </div>
            </div>
          </div>
        </Card>

        <Card>
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">Quick actions</h2>
          <div className="mt-4 flex flex-col gap-2">
            <Link to="/install">
              <Button className="w-full justify-center">Enroll device</Button>
            </Link>
            <Link to="/devices?tab=scripts">
              <Button variant="secondary" className="w-full justify-center">
                Run script
              </Button>
            </Link>
            <Link to="/devices?tab=alerts">
              <Button variant="outline" className="w-full justify-center">
                View alerts
              </Button>
            </Link>
          </div>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold text-slate-900">Device health</h2>
            <Link to="/devices" className="text-sm font-semibold text-brand hover:underline">
              View all
            </Link>
          </div>
          {devices.length === 0 && !loading ? (
            <EmptyState
              icon="💻"
              title="No devices yet"
              description="Connect Intune, Google Admin, or install the Windows agent."
              action={
                <Link to="/install">
                  <Button>Get started</Button>
                </Link>
              }
            />
          ) : (
          <ul className="divide-y divide-fds-border">
            {devices.map((d) => (
              <li key={d.id || d.name} className="flex items-center justify-between py-3 text-sm first:pt-0">
                <div>
                  <div className="font-medium text-slate-900">{d.name || d.id}</div>
                  <div className="text-xs text-slate-500">
                    {d.os || 'unknown'} · {d.source}
                  </div>
                </div>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 ring-1 ring-slate-200">
                  {d.compliance || 'unknown'}
                </span>
              </li>
            ))}
          </ul>
          )}
        </Card>

        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold text-slate-900">Recent activity</h2>
            <Link to="/devices?tab=alerts" className="text-sm font-semibold text-brand hover:underline">
              Open alerts
            </Link>
          </div>
          <ul className="max-h-96 space-y-3 overflow-y-auto">
            {activity.length === 0 && <li className="text-sm text-slate-500">No recent open alerts.</li>}
            {activity.map((a) => (
              <li key={a.id} className="rounded-lg border border-fds-border bg-slate-50/80 p-3 text-sm ring-1 ring-slate-950/5">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-slate-900">{a.type || 'Alert'}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                      a.severity === 'critical' ? 'bg-red-50 text-red-800 ring-1 ring-red-200' : 'bg-amber-50 text-amber-900 ring-1 ring-amber-200'
                    }`}
                  >
                    {a.severity}
                  </span>
                </div>
                <p className="mt-1 line-clamp-2 text-xs text-slate-600">{a.message}</p>
                <p className="mt-1 text-[11px] text-slate-400">{formatRelative(a.created_at)}</p>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card className="border-emerald-200 bg-emerald-50/80 ring-emerald-100">
        <p className="text-sm font-medium text-emerald-900">
          <strong className="font-semibold">Tip:</strong> set policies once in Settings, then let FortDefend run quietly in the
          background — Mosyle-style simplicity.
        </p>
      </Card>

      {summary && (
        <Card>
          <h2 className="font-semibold text-slate-900">Integrations</h2>
          <p className="mt-2 text-sm text-slate-600">
            Intune: {summary.intune?.ok ? 'healthy' : summary.intune?.message || 'not configured'} · Google:{' '}
            {summary.google?.ok ? 'healthy' : summary.google?.message || 'not configured'}
          </p>
          <Link to="/integrations" className="mt-3 inline-block text-sm font-semibold text-brand hover:underline">
            Manage integrations
          </Link>
        </Card>
      )}

      <Card>
        <h2 className="font-semibold text-slate-900">API access</h2>
        <p className="mt-1 text-sm text-slate-600">Automate enrollment and reporting with your org API key.</p>
        <Button className="mt-4" variant="outline" onClick={openApiModal}>
          View organization API key
        </Button>
      </Card>

      {apiModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl rounded-xl border border-fds-border bg-white p-6 shadow-xl ring-1 ring-slate-950/5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-xl font-semibold text-slate-900">FortDefend API</h3>
                <p className="mt-1 text-sm text-slate-600">Integrate FortDefend directly into your platform using our REST API</p>
              </div>
              <button type="button" className="text-sm text-slate-500 hover:text-slate-700" onClick={() => setApiModalOpen(false)}>
                Close
              </button>
            </div>

            <div className="mt-5 rounded-lg border border-fds-border bg-slate-50 p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Organization API key</p>
              {apiKeyLoading ? (
                <p className="mt-2 text-sm text-slate-600">Loading key…</p>
              ) : apiKeyError ? (
                <p className="mt-2 text-sm text-red-600">{apiKeyError}</p>
              ) : (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <code className="rounded bg-slate-900 px-3 py-2 text-xs text-slate-100">{orgApiKey || 'No key available'}</code>
                  <Button variant="outline" onClick={copyApiKey} disabled={!orgApiKey}>
                    Copy
                  </Button>
                </div>
              )}
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <Link
                className="rounded-lg border border-fds-border px-3 py-2 text-sm font-medium text-brand hover:bg-slate-50"
                to="/api-docs#authentication"
              >
                Authentication
              </Link>
              <Link
                className="rounded-lg border border-fds-border px-3 py-2 text-sm font-medium text-brand hover:bg-slate-50"
                to="/api-docs#device-management"
              >
                Device Management
              </Link>
              <Link
                className="rounded-lg border border-fds-border px-3 py-2 text-sm font-medium text-brand hover:bg-slate-50"
                to="/api-docs#alerts-reports"
              >
                Alerts & Reports
              </Link>
              <Link className="rounded-lg border border-fds-border px-3 py-2 text-sm font-medium text-brand hover:bg-slate-50" to="/api-docs#webhooks">
                Webhooks
              </Link>
            </div>

            <div className="mt-5">
              <Link to="/api-docs">
                <Button>View full API docs</Button>
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
