import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { statusColor } from '../../lib/api';
import { fetchPatch, patchErrorMessage, PatchLoadError } from './patchApi';

export default function DevicesView() {
  const [devices, setDevices] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetchPatch('/api/patch/devices', {
        label: 'GET /api/patch/devices',
        fallback: { devices: [] },
      });
      setDevices(Array.isArray(res?.devices) ? res.devices : []);
    } catch (err) {
      setDevices([]);
      setError(patchErrorMessage(err, 'Failed to load patch devices.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (error) {
    return (
      <div>
        <h1 className="mb-6 text-2xl font-bold">Managed Devices</h1>
        <PatchLoadError message={error} onRetry={load} />
      </div>
    );
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Managed Devices</h1>
      {loading ? <p className="text-sm text-slate-500">Loading devices…</p> : null}
      <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b bg-slate-50">
            <tr>
              {['Device Name', 'OS', 'Last Seen', 'Apps Patched', 'Apps Outdated', 'Status', ''].map((h) => (
                <th key={h} className="px-4 py-3 text-left font-semibold text-slate-600">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {devices.map((d) => (
              <tr key={d.id} className="border-b hover:bg-slate-50">
                <td className="px-4 py-3 font-medium">{d.name}</td>
                <td className="px-4 py-3">{d.osVersion || 'Windows'}</td>
                <td className="px-4 py-3">{d.lastSeen ? new Date(d.lastSeen).toLocaleString() : 'Never'}</td>
                <td className="px-4 py-3">{d.appsPatched ?? 0}</td>
                <td className="px-4 py-3">{d.appsOutdated ?? 0}</td>
                <td className="px-4 py-3">
                  <span className={`rounded px-2 py-1 text-xs font-medium ${statusColor(d.status)}`}>
                    {d.status || 'unknown'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <Link className="text-blue-600 hover:underline" to={`/dashboard/patch/devices/${d.id}`}>
                    View
                  </Link>
                </td>
              </tr>
            ))}
            {!loading && !devices.length ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                  No Windows devices yet. Enroll a PC and install the patch agent from Enroll Devices.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
