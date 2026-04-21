import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { Card, Badge, Input } from '../components/ui';

export default function Devices() {
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState('');
  const [source, setSource] = useState('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const d = await api('/api/integrations/devices');
        if (!cancelled) setRows(Array.isArray(d?.devices) ? d.devices : []);
      } catch {
        if (!cancelled) setRows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      const hay = `${r.name || ''} ${r.serial || ''} ${r.id || ''}`.toLowerCase();
      if (q && !hay.includes(q.toLowerCase())) return false;
      if (source !== 'all' && String(r.source) !== source) return false;
      return true;
    });
  }, [rows, q, source]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Devices</h1>
        <p className="text-sm text-gray-600">Fleet inventory from connected integrations.</p>
      </div>

      <Card>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <div className="flex-1">
            <Input label="Search" placeholder="Name, serial, id…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div>
            <span className="mb-1 block text-sm font-medium text-gray-700">Source</span>
            <select
              value={source}
              onChange={(e) => setSource(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand sm:w-48"
            >
              <option value="all">All</option>
              <option value="intune">Intune</option>
              <option value="google_admin">Google Admin</option>
              <option value="agent">Agent</option>
            </select>
          </div>
        </div>
      </Card>

      <Card className="overflow-x-auto p-0">
        {loading ? (
          <p className="p-6 text-sm text-gray-500">Loading…</p>
        ) : (
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-gray-900">Device</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-900">OS</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-900">Source</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-900">Compliance</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-900">Security score</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                    No devices match your filters.
                  </td>
                </tr>
              )}
              {filtered.map((d) => (
                <tr key={d.id}>
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{d.name || d.id}</div>
                    <div className="text-xs text-gray-500">{d.serial || '—'}</div>
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {d.os} {d.osVersion ? `· ${d.osVersion}` : ''}
                  </td>
                  <td className="px-4 py-3">
                    <Badge>{d.source}</Badge>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{d.compliance || '—'}</td>
                  <td className="px-4 py-3 text-right font-semibold text-brand">{d.security_score ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
