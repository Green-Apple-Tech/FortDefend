import { useEffect, useState } from 'react';
import { api, exportCsv, patchActionColor, patchActionLabel } from '../../lib/api';

const ACTION_OPTIONS = [
  '',
  'fresh_install',
  'updated',
  'skipped_current',
  'skipped_newer',
  'failed',
  'installed',
  'skipped',
];

export default function PatchHistory() {
  const [history, setHistory] = useState([]);
  const [filters, setFilters] = useState({ deviceId: '', label: '', action: '', from: '', to: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const load = () => {
    setLoading(true);
    const params = new URLSearchParams(Object.entries(filters).filter(([, v]) => v));
    api(`/api/patch/history?${params}`)
      .then((res) => setHistory(res.history || []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  if (error) return <div className="text-red-600">{error}</div>;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Patch History</h1>
        <button
          type="button"
          className="rounded bg-slate-900 px-3 py-2 text-sm text-white"
          onClick={() => exportCsv('patch-history.csv', history)}
          disabled={!history.length}
        >
          Export CSV
        </button>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-6">
        <input
          className="rounded border px-3 py-2 text-sm"
          placeholder="Device ID"
          value={filters.deviceId}
          onChange={(e) => setFilters((f) => ({ ...f, deviceId: e.target.value }))}
        />
        <input
          className="rounded border px-3 py-2 text-sm"
          placeholder="App label"
          value={filters.label}
          onChange={(e) => setFilters((f) => ({ ...f, label: e.target.value }))}
        />
        <select
          className="rounded border px-3 py-2 text-sm"
          value={filters.action}
          onChange={(e) => setFilters((f) => ({ ...f, action: e.target.value }))}
        >
          {ACTION_OPTIONS.map((a) => (
            <option key={a || 'all'} value={a}>
              {a ? patchActionLabel(a) : 'All actions'}
            </option>
          ))}
        </select>
        <input
          type="date"
          className="rounded border px-3 py-2 text-sm"
          value={filters.from}
          onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))}
        />
        <input
          type="date"
          className="rounded border px-3 py-2 text-sm"
          value={filters.to}
          onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))}
        />
        <button type="button" className="rounded bg-blue-600 px-3 py-2 text-sm text-white" onClick={load} disabled={loading}>
          {loading ? 'Loading…' : 'Filter'}
        </button>
      </div>

      <div className="overflow-auto rounded-xl border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b bg-slate-50">
            <tr>
              {['Timestamp', 'Device', 'App', 'Action', 'From', 'To', 'Error'].map((h) => (
                <th key={h} className="px-4 py-3 text-left font-semibold text-slate-600">
                  {h}
                </th>
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
                  <span className={`rounded px-2 py-1 text-xs font-medium ${patchActionColor(row.action)}`}>
                    {patchActionLabel(row.action)}
                  </span>
                </td>
                <td className="px-4 py-3">{row.from_version || '—'}</td>
                <td className="px-4 py-3">{row.to_version || '—'}</td>
                <td className="px-4 py-3 text-red-600">{row.error_message || ''}</td>
              </tr>
            ))}
            {!history.length && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                  No patch history found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
