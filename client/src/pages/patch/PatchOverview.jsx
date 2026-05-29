import { useEffect, useState } from 'react';
import { api, patchActionColor, patchActionLabel } from '../../lib/api';

function Card({ title, value, hint }) {
  return (
    <div className="rounded-xl border bg-white p-5 shadow-sm">
      <div className="text-sm text-slate-500">{title}</div>
      <div className="mt-2 text-3xl font-bold">{value}</div>
      {hint ? <div className="mt-1 text-xs text-slate-500">{hint}</div> : null}
    </div>
  );
}

export default function PatchOverview() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [scanning, setScanning] = useState(false);
  const [scanMsg, setScanMsg] = useState('');

  const load = () => {
    api('/api/patch/overview')
      .then(setData)
      .catch((e) => setError(e.message));
  };

  useEffect(() => {
    load();
  }, []);

  const scanAll = async () => {
    setScanning(true);
    setScanMsg('');
    try {
      const r = await api('/api/patch/scan-all', { method: 'POST' });
      setScanMsg(r?.message || 'Scan queued for all devices.');
    } catch (e) {
      setScanMsg(e.message || 'Failed to queue scan.');
    } finally {
      setScanning(false);
    }
  };

  if (error) return <div className="text-red-600">{error}</div>;
  if (!data) return <div>Loading overview...</div>;

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
      {scanMsg ? <p className="mb-4 text-sm text-slate-600">{scanMsg}</p> : null}

      <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Card title="Patch-Managed Devices" value={data.patchManagedDevices ?? 0} hint={`of ${data.totalDevices} Windows`} />
        <Card title="Apps Patched Today" value={data.patchedToday ?? 0} />
        <Card title="Apps Outdated" value={data.appsOutdated ?? 0} />
        <Card title="Failed (7 days)" value={data.failedLast7Days ?? 0} />
        <Card title="Patch Compliance" value={`${data.compliance ?? 0}%`} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border bg-white p-5 shadow-sm">
          <h2 className="mb-3 font-semibold">Compliance</h2>
          <div className="flex items-center gap-4">
            <div
              className="flex h-28 w-28 items-center justify-center rounded-full text-xl font-bold"
              style={{
                background: `conic-gradient(#16a34a ${(data.compliance || 0) * 3.6}deg, #e2e8f0 0)`,
              }}
            >
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-white">
                {data.compliance}%
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
            {data.recentActivity?.length ? (
              data.recentActivity.map((item) => (
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
