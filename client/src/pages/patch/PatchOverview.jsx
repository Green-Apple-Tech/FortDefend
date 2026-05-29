import { useCallback, useEffect, useState } from 'react';
import { api, patchActionColor, patchActionLabel } from '../../lib/api';
import { fetchPatch, patchErrorMessage, PatchLoadError } from './patchApi';

function Card({ title, value, hint }) {
  return (
    <div className="rounded-xl border bg-white p-5 shadow-sm">
      <div className="text-sm text-slate-500">{title}</div>
      <div className="mt-2 text-3xl font-bold">{value}</div>
      {hint ? <div className="mt-1 text-xs text-slate-500">{hint}</div> : null}
    </div>
  );
}

const EMPTY_OVERVIEW = {
  totalDevices: 0,
  patchManagedDevices: 0,
  patchedToday: 0,
  appsOutdated: 0,
  failedLast7Days: 0,
  compliance: 100,
  recentActivity: [],
};

export default function PatchOverview() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [scanning, setScanning] = useState(false);
  const [scanMsg, setScanMsg] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const res = await fetchPatch('/api/patch/overview', {
        label: 'GET /api/patch/overview',
        fallback: EMPTY_OVERVIEW,
      });
      setData({ ...EMPTY_OVERVIEW, ...res });
    } catch (err) {
      setData(EMPTY_OVERVIEW);
      setError(patchErrorMessage(err, 'Failed to load patch overview.'));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const scanAll = async () => {
    setScanning(true);
    setScanMsg('');
    try {
      const r = await api('/api/patch/scan-all', { method: 'POST' });
      setScanMsg(r?.message || 'Scan queued for all devices.');
    } catch (err) {
      console.error('[Patch Manager] POST /api/patch/scan-all failed', err);
      setScanMsg(patchErrorMessage(err, 'Failed to queue scan.'));
    } finally {
      setScanning(false);
    }
  };

  if (!data && !error) return <div>Loading overview...</div>;

  const overview = data || EMPTY_OVERVIEW;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Patch Manager Overview</h1>
        <button
          type="button"
          onClick={scanAll}
          disabled={scanning}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {scanning ? 'Queueing…' : 'Scan All Devices'}
        </button>
      </div>
      {error ? <PatchLoadError message={error} onRetry={load} /> : null}
      {scanMsg ? <p className="mb-4 text-sm text-slate-600">{scanMsg}</p> : null}

      <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Card title="Patch-Managed Devices" value={overview.patchManagedDevices ?? 0} hint={`of ${overview.totalDevices} Windows`} />
        <Card title="Apps Patched Today" value={overview.patchedToday ?? 0} />
        <Card title="Apps Outdated" value={overview.appsOutdated ?? 0} />
        <Card title="Failed (7 days)" value={overview.failedLast7Days ?? 0} />
        <Card title="Patch Compliance" value={`${overview.compliance ?? 0}%`} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border bg-white p-5 shadow-sm">
          <h2 className="mb-3 font-semibold">Compliance</h2>
          <div className="flex items-center gap-4">
            <div
              className="flex h-28 w-28 items-center justify-center rounded-full text-xl font-bold"
              style={{
                background: `conic-gradient(#16a34a ${(overview.compliance || 0) * 3.6}deg, #e2e8f0 0)`,
              }}
            >
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-white">
                {overview.compliance}%
              </div>
            </div>
            <p className="text-sm text-slate-600">
              Share of tracked app installations that are current across all patch-managed devices.
            </p>
          </div>
        </div>

        <div className="rounded-xl border bg-white p-5 shadow-sm">
          <h2 className="mb-3 font-semibold">Recent Activity</h2>
          <div className="max-h-72 space-y-2 overflow-auto">
            {overview.recentActivity?.length ? (
              overview.recentActivity.map((item) => (
                <div key={item.id} className="border-b pb-2 text-sm">
                  <div className="font-medium">
                    {item.device_name} — {item.name}
                  </div>
                  <div className="flex items-center gap-2 text-slate-500">
                    <span className={`rounded px-2 py-0.5 text-xs ${patchActionColor(item.action)}`}>
                      {patchActionLabel(item.action)}
                    </span>
                    <span>{new Date(item.timestamp).toLocaleString()}</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-sm text-slate-500">No recent patch activity.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
