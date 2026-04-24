import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { Card, Button, Badge } from '../components/ui';

export default function Alerts() {
  const [rows, setRows] = useState([]);
  const [types, setTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [emailOn, setEmailOn] = useState(true);
  const [slackOn, setSlackOn] = useState(false);
  const [severity, setSeverity] = useState('all');
  const [resolvedFilter, setResolvedFilter] = useState('false');
  const [typeFilter, setTypeFilter] = useState('all');

  async function loadAlerts() {
    setLoading(true);
    const params = new URLSearchParams();
    if (severity !== 'all') params.set('severity', severity);
    if (resolvedFilter !== 'all') params.set('resolved', resolvedFilter);
    if (typeFilter !== 'all') params.set('type', typeFilter);
    try {
      const data = await api(`/api/alerts?${params.toString()}`);
      setRows(Array.isArray(data?.alerts) ? data.alerts : []);
      setTypes(Array.isArray(data?.types) ? data.types : []);
    } catch {
      setRows([]);
      setTypes([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAlerts();
  }, [severity, resolvedFilter, typeFilter]);

  async function resolve(id) {
    await api(`/api/alerts/${encodeURIComponent(id)}/resolve`, { method: 'POST' }).catch(() => {});
    loadAlerts();
  }

  const filtered = useMemo(() => rows, [rows]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Alerts</h1>
        <p className="text-sm text-gray-600">History and resolution across all monitored device platforms.</p>
      </div>

      <Card>
        <h2 className="font-semibold text-gray-900">Notification toggles</h2>
        <p className="mt-1 text-sm text-gray-600">Persist via Settings → webhooks (org integration row).</p>
        <div className="mt-4 flex flex-wrap gap-6">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={emailOn} onChange={(e) => setEmailOn(e.target.checked)} />
            Email alerts
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={slackOn} onChange={(e) => setSlackOn(e.target.checked)} />
            Slack mentions
          </label>
        </div>
      </Card>

      <Card className="overflow-x-auto p-0">
        <div className="flex flex-wrap items-end gap-3 border-b border-gray-200 bg-gray-50 px-4 py-3">
          <label className="text-xs">
            <span className="mb-1 block font-medium text-gray-700">Severity</span>
            <select value={severity} onChange={(e) => setSeverity(e.target.value)} className="rounded border border-gray-300 px-2 py-1 text-xs">
              <option value="all">All</option>
              <option value="critical">Critical</option>
              <option value="warning">Warning</option>
              <option value="info">Info</option>
            </select>
          </label>
          <label className="text-xs">
            <span className="mb-1 block font-medium text-gray-700">Status</span>
            <select value={resolvedFilter} onChange={(e) => setResolvedFilter(e.target.value)} className="rounded border border-gray-300 px-2 py-1 text-xs">
              <option value="all">All</option>
              <option value="false">Open</option>
              <option value="true">Resolved</option>
            </select>
          </label>
          <label className="text-xs">
            <span className="mb-1 block font-medium text-gray-700">Rule Type</span>
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="rounded border border-gray-300 px-2 py-1 text-xs">
              <option value="all">All</option>
              {types.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
        </div>
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left font-semibold">When</th>
              <th className="px-4 py-3 text-left font-semibold">Type</th>
              <th className="px-4 py-3 text-left font-semibold">Severity</th>
              <th className="px-4 py-3 text-left font-semibold">Message</th>
              <th className="px-4 py-3 text-right font-semibold">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-500">Loading alerts...</td></tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-500">No alerts match current filters.</td></tr>
            )}
            {filtered.map((r) => (
              <tr key={r.id} className={r.resolved ? 'bg-gray-50 opacity-70' : ''}>
                <td className="px-4 py-3 whitespace-nowrap text-gray-600">{new Date(r.created_at).toLocaleString()}</td>
                <td className="px-4 py-3 font-medium text-gray-900">{r.type}</td>
                <td className="px-4 py-3">
                  <Badge tone={r.severity === 'critical' ? 'danger' : 'warning'}>{r.severity}</Badge>
                </td>
                <td className="px-4 py-3 text-gray-600">
                  <p>{r.message}</p>
                  {r.device_name && <p className="text-xs text-gray-500">Device: {r.device_name}</p>}
                </td>
                <td className="px-4 py-3 text-right">
                  {!r.resolved ? (
                    <Button variant="outline" className="py-1 text-xs" type="button" onClick={() => resolve(r.id)}>
                      Resolve
                    </Button>
                  ) : (
                    <span className="text-xs text-gray-500">Resolved</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
