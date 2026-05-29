import { useEffect, useState } from 'react';
import { api, statusColor } from '../../lib/api';

function Card({ title, value }) {
  return (
    <div className="rounded-xl border bg-white p-5 shadow-sm">
      <div className="text-sm text-slate-500">{title}</div>
      <div className="text-3xl font-bold mt-2">{value}</div>
    </div>
  );
}

export default function PatchOverview() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/api/patch/overview')
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <div className="text-red-600">{error}</div>;
  if (!data) return <div>Loading overview...</div>;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Patch Manager Overview</h1>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <Card title="Total Devices" value={data.totalDevices} />
        <Card title="Patched Today" value={data.patchedToday} />
        <Card title="Apps Outdated" value={data.appsOutdated} />
        <Card title="Failed Today" value={data.failedToday} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-xl border bg-white p-5 shadow-sm">
          <h2 className="font-semibold mb-3">Patch Compliance</h2>
          <div className="flex items-center gap-4">
            <div
              className="w-28 h-28 rounded-full flex items-center justify-center text-xl font-bold"
              style={{
                background: `conic-gradient(#16a34a ${data.compliance * 3.6}deg, #e2e8f0 0)`,
              }}
            >
              <div className="w-20 h-20 rounded-full bg-white flex items-center justify-center">
                {data.compliance}%
              </div>
            </div>
            <p className="text-sm text-slate-600">
              Percentage of tracked apps currently up to date across all devices.
            </p>
          </div>
        </div>

        <div className="rounded-xl border bg-white p-5 shadow-sm">
          <h2 className="font-semibold mb-3">Recent Activity</h2>
          <div className="space-y-2 max-h-72 overflow-auto">
            {data.recentActivity?.length ? (
              data.recentActivity.map((item) => (
                <div key={item.id} className="text-sm border-b pb-2">
                  <div className="font-medium">{item.device_name} — {item.name}</div>
                  <div className="text-slate-500 flex gap-2 items-center">
                    <span className={`px-2 py-0.5 rounded text-xs ${statusColor(item.action)}`}>
                      {item.action}
                    </span>
                    <span>{new Date(item.timestamp).toLocaleString()}</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-slate-500 text-sm">No recent patch activity.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
