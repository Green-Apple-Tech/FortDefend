import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { Card, Button } from '../components/ui';
import { SectionHeader, ToggleCard } from '../components/fds';

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'critical', label: 'Critical' },
  { id: 'high', label: 'High' },
  { id: 'medium', label: 'Medium' },
  { id: 'low', label: 'Low' },
  { id: 'resolved', label: 'Resolved' },
];

function formatRelative(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const sec = Math.floor((Date.now() - d.getTime()) / 1000);
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

function severityBorder(sev) {
  const s = String(sev || '').toLowerCase();
  if (s === 'critical') return 'border-l-4 border-l-red-500';
  if (s === 'warning') return 'border-l-4 border-l-amber-500';
  if (s === 'info') return 'border-l-4 border-l-sky-500';
  return 'border-l-4 border-l-slate-300';
}

function severityIcon(sev) {
  const s = String(sev || '').toLowerCase();
  if (s === 'critical') return '🔴';
  if (s === 'warning') return '🟠';
  if (s === 'info') return '🔵';
  return '⚪';
}

export default function Alerts() {
  const [rows, setRows] = useState([]);
  const [types, setTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [emailOn, setEmailOn] = useState(true);
  const [slackOn, setSlackOn] = useState(false);
  const [filter, setFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [selected, setSelected] = useState(() => new Set());

  const queryParams = useMemo(() => {
    const params = new URLSearchParams();
    params.set('limit', '300');
    if (typeFilter !== 'all') params.set('type', typeFilter);

    if (filter === 'all') {
      return params;
    }
    if (filter === 'resolved') {
      params.set('resolved', 'true');
      return params;
    }
    params.set('resolved', 'false');
    if (filter === 'critical') params.set('severity', 'critical');
    else if (filter === 'high') params.set('severity', 'warning');
    else if (filter === 'medium' || filter === 'low') params.set('severity', 'info');
    return params;
  }, [filter, typeFilter]);

  async function loadAlerts() {
    setLoading(true);
    try {
      const data = await api(`/api/alerts?${queryParams.toString()}`);
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
  }, [filter, typeFilter]);

  async function resolve(id) {
    await api(`/api/alerts/${encodeURIComponent(id)}/resolve`, { method: 'POST' }).catch(() => {});
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    loadAlerts();
  }

  async function bulkResolve() {
    const ids = [...selected];
    for (const id of ids) {
      await api(`/api/alerts/${encodeURIComponent(id)}/resolve`, { method: 'POST' }).catch(() => {});
    }
    setSelected(new Set());
    loadAlerts();
  }

  function toggleSelect(id, checked) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  const selectableIds = useMemo(
    () => rows.filter((r) => !r.resolved).map((r) => r.id),
    [rows],
  );

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Alerts"
        description="Color-coded by severity. Resolve individually or in bulk when you have cleared an incident."
      />

      <Card>
        <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500">Delivery preferences</h2>
        <div className="mt-4 space-y-3">
          <ToggleCard
            icon="✉️"
            title="Email alerts"
            description="Route high-severity items to your inbox (configure in org integrations)."
            on={emailOn}
            onChange={setEmailOn}
          />
          <ToggleCard
            icon="💬"
            title="Slack mentions"
            description="Post to a channel webhook when new alerts open."
            on={slackOn}
            onChange={setSlackOn}
          />
        </div>
      </Card>

      <Card className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition ${
                  filter === f.id
                    ? 'bg-brand text-white shadow-sm ring-1 ring-brand/30'
                    : 'border border-fds-border bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-xs text-slate-600">
            <span className="font-semibold uppercase tracking-wide text-slate-500">Type</span>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="rounded-lg border border-fds-border bg-white px-2 py-1.5 text-sm text-slate-800 shadow-sm"
            >
              <option value="all">All types</option>
              {types.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
        </div>

        {selected.size > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-brand/20 bg-blue-50 px-4 py-3">
            <p className="text-sm font-medium text-slate-800">
              {selected.size} selected
            </p>
            <Button type="button" onClick={bulkResolve}>
              Resolve selected
            </Button>
          </div>
        )}

        {loading && <p className="py-12 text-center text-sm text-slate-500">Loading alerts…</p>}

        {!loading && rows.length === 0 && (
          <p className="py-12 text-center text-sm text-slate-500">No alerts match this view.</p>
        )}

        <ul className="space-y-3">
          {!loading &&
            rows.map((r) => (
              <li
                key={r.id}
                className={`flex gap-4 rounded-xl border border-fds-border bg-white p-4 pl-3 shadow-sm ring-1 ring-slate-950/5 ${
                  r.resolved ? 'border-l-4 border-l-slate-200 opacity-90' : severityBorder(r.severity)
                }`}
              >
                {!r.resolved && (
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 rounded border-slate-300 text-brand focus:ring-brand"
                    checked={selected.has(r.id)}
                    onChange={(e) => toggleSelect(r.id, e.target.checked)}
                    aria-label={`Select alert ${r.type}`}
                  />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="text-lg" aria-hidden>
                        {severityIcon(r.severity)}
                      </span>
                      <div>
                        <p className="font-semibold text-slate-900">{r.type || 'Alert'}</p>
                        {r.device_name && (
                          <p className="text-xs font-medium text-slate-500">{r.device_name}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-2 sm:flex-row sm:items-center">
                      <span className="text-xs text-slate-400">{formatRelative(r.created_at)}</span>
                      {!r.resolved ? (
                        <Button variant="outline" className="py-1.5 text-xs" type="button" onClick={() => resolve(r.id)}>
                          Resolve
                        </Button>
                      ) : (
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800 ring-1 ring-emerald-200">
                          Resolved
                        </span>
                      )}
                    </div>
                  </div>
                  <p className="mt-2 text-sm text-slate-600">{r.message}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                        r.severity === 'critical'
                          ? 'bg-red-50 text-red-800 ring-1 ring-red-200'
                          : r.severity === 'warning'
                            ? 'bg-amber-50 text-amber-900 ring-1 ring-amber-200'
                            : 'bg-sky-50 text-sky-800 ring-1 ring-sky-200'
                      }`}
                    >
                      {r.severity}
                    </span>
                  </div>
                </div>
              </li>
            ))}
        </ul>

        {!loading && selectableIds.length > 1 && (
          <div className="flex justify-end border-t border-fds-border pt-3">
            <button
              type="button"
              className="text-xs font-semibold text-brand hover:underline"
              onClick={() => {
                if (selected.size === selectableIds.length) setSelected(new Set());
                else setSelected(new Set(selectableIds));
              }}
            >
              {selected.size === selectableIds.length ? 'Clear selection' : 'Select all open in view'}
            </button>
          </div>
        )}
      </Card>
    </div>
  );
}
