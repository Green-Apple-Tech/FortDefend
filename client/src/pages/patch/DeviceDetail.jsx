import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { statusColor } from '../../lib/api';
import { fetchPatch, patchErrorMessage, PatchLoadError } from './patchApi';

export default function DeviceDetail() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [selected, setSelected] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetchPatch(`/api/patch/devices/${encodeURIComponent(id)}`, {
        label: 'GET /api/patch/devices/:id',
        fallback: {
          device: { id, name: 'Device', osVersion: null, lastSeen: null },
          apps: [],
          history: [],
          policies: [],
        },
      });
      setData({
        device: res.device || { id, name: 'Device' },
        apps: Array.isArray(res.apps) ? res.apps : [],
        history: Array.isArray(res.history) ? res.history : [],
        policies: Array.isArray(res.policies) ? res.policies : [],
      });
    } catch (err) {
      setData({ device: { id, name: 'Device' }, apps: [], history: [], policies: [] });
      setError(patchErrorMessage(err, 'Failed to load patch device.'));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = (label) => {
    setSelected((prev) => (prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label]));
  };

  if (loading && !data) return <div>Loading device...</div>;

  const device = data?.device || { name: 'Device' };
  const apps = data?.apps || [];

  return (
    <div>
      <h1 className="text-2xl font-bold">{device.name}</h1>
      <p className="mb-6 text-slate-500">
        OS: {device.osVersion || 'Windows'} · Last seen:{' '}
        {device.lastSeen ? new Date(device.lastSeen).toLocaleString() : 'Never'}
      </p>

      {error ? <PatchLoadError message={error} onRetry={load} /> : null}

      <div className="mb-4 flex gap-2">
        <button type="button" className="rounded bg-blue-600 px-3 py-2 text-sm text-white">
          Update All
        </button>
        <button type="button" className="rounded bg-slate-200 px-3 py-2 text-sm" disabled={!selected.length}>
          Update Selected ({selected.length})
        </button>
      </div>

      <div className="overflow-auto rounded-xl border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left">Select</th>
              <th className="px-4 py-3 text-left">App</th>
              <th className="px-4 py-3 text-left">Current</th>
              <th className="px-4 py-3 text-left">Latest</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {apps.map((app) => (
              <tr key={app.id || app.label} className="border-b">
                <td className="px-4 py-3">
                  <input type="checkbox" checked={selected.includes(app.label)} onChange={() => toggle(app.label)} />
                </td>
                <td className="px-4 py-3 font-medium">{app.name}</td>
                <td className="px-4 py-3">{app.installed_version || '—'}</td>
                <td className="px-4 py-3">{app.latest_version || '—'}</td>
                <td className="px-4 py-3">
                  <span className={`rounded px-2 py-1 text-xs ${statusColor(app.status)}`}>{app.status || 'unknown'}</span>
                </td>
                <td className="space-x-2 px-4 py-3">
                  {['Update', 'Reinstall', 'Uninstall', 'Ignore'].map((action) => (
                    <button key={action} type="button" className="text-xs text-blue-600 hover:underline">
                      {action}
                    </button>
                  ))}
                </td>
              </tr>
            ))}
            {!apps.length ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                  No apps reported yet. Run a patch scan from the main device page.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
