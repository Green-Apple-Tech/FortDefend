import { useEffect, useState } from 'react';
import { api, exportCsv, statusColor } from '../../lib/api';

export default function PatchHistory() {
  const [history, setHistory] = useState([]);
  const [filters, setFilters] = useState({ deviceId: '', label: '', action: '', from: '', to: '' });
  const [error, setError] = useState('');

  const load = () => {
    const params = new URLSearchParams(Object.entries(filters).filter(([, v]) => v));
    api(`/api/patch/history?${params}`)
      .then((res) => setHistory(res.history))
      .catch((e) => setError(e.message));
  };

  useEffect(load, []);

  if (error) return <div className="text-red-600">{error}</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Patch History</h1>
        <button
          className="px-3 py-2 rounded bg-slate-900 text-white text-sm"
          onClick={() => exportCsv('patch-history.csv', history)}
        >
          Export CSV
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
        {Object.entries(filters).map(([key, value]) => (
          <input
            key={key}
            className="border rounded px-3 py-2 text-sm"
            placeholder={key}
            value={value}
            onChange={(e) => setFilters((f) => ({ ...f, [key]: e.target.value }))}
          />
        ))}
        <button className="px-3 py-2 rounded bg-blue-600 text-white text-sm" onClick={load}>Filter</button>
      </div>

      <div className="rounded-xl border bg-white shadow-sm overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b">
            <tr>
              {['Time', 'Device', 'App', 'Action', 'From', 'To', 'Error'].map((h) => (
                <th key={h} className="text-left px-4 py-3 font-semibold text-slate-600">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {history.map((row) => (
              <tr key={row.id} className="border-b">
                <td className="px-4 py-3">{new Date(row.timestamp).toLocaleString()}</td>
                <td className="px-4 py-3">{row.device_name}</td>
                <td className="px-4 py-3">{row.name}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-1 rounded text-xs ${statusColor(row.action)}`}>{row.action}</span>
                </td>
                <td className="px-4 py-3">{row.from_version || '—'}</td>
                <td className="px-4 py-3">{row.to_version || '—'}</td>
                <td className="px-4 py-3 text-red-600">{row.error_message || ''}</td>
              </tr>
            ))}
            {!history.length && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-500">No patch history found.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
