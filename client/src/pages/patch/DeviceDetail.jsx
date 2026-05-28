import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, statusColor } from '../../lib/api';

export default function DeviceDetail() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [selected, setSelected] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    api(`/api/patch/devices/${id}`)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [id]);

  const toggle = (label) => {
    setSelected((prev) => (prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label]));
  };

  if (error) return <div className="text-red-600">{error}</div>;
  if (!data) return <div>Loading device...</div>;

  return (
    <div>
      <h1 className="text-2xl font-bold">{data.device.name}</h1>
      <p className="text-slate-500 mb-6">OS: {data.device.osVersion || 'Windows'} · Last seen: {data.device.lastSeen ? new Date(data.device.lastSeen).toLocaleString() : 'Never'}</p>

      <div className="flex gap-2 mb-4">
        <button className="px-3 py-2 rounded bg-blue-600 text-white text-sm">Update All</button>
        <button className="px-3 py-2 rounded bg-slate-200 text-sm" disabled={!selected.length}>
          Update Selected ({selected.length})
        </button>
      </div>

      <div className="rounded-xl border bg-white shadow-sm overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b">
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
            {data.apps.map((app) => (
              <tr key={app.id} className="border-b">
                <td className="px-4 py-3">
                  <input type="checkbox" checked={selected.includes(app.label)} onChange={() => toggle(app.label)} />
                </td>
                <td className="px-4 py-3 font-medium">{app.name}</td>
                <td className="px-4 py-3">{app.installed_version || '—'}</td>
                <td className="px-4 py-3">{app.latest_version || '—'}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-1 rounded text-xs ${statusColor(app.status)}`}>{app.status}</span>
                </td>
                <td className="px-4 py-3 space-x-2">
                  {['Update', 'Reinstall', 'Uninstall', 'Ignore'].map((action) => (
                    <button key={action} className="text-blue-600 hover:underline text-xs">{action}</button>
                  ))}
                </td>
              </tr>
            ))}
            {!data.apps.length && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">No apps reported yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
