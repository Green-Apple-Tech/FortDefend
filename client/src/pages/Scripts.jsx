import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { Card, Button, Input } from '../components/ui';
import ScriptRunnerModal from '../components/ScriptRunnerModal';
import { SectionHeader, EmptyState } from '../components/fds';

const PLATFORM_TYPES = {
  windows: ['powershell', 'cmd', 'python'],
  mac: ['bash', 'zsh', 'python'],
  chromebook: ['javascript'],
  android: [],
  linux: ['bash', 'python'],
};

const PLATFORM_LABEL = {
  windows: 'Windows',
  mac: 'macOS',
  chromebook: 'Chrome',
  android: 'Android',
  linux: 'Linux',
};

function platformIcon(p) {
  if (p === 'windows') return '🪟';
  if (p === 'mac') return '🍎';
  if (p === 'chromebook') return '🌐';
  if (p === 'android') return '🤖';
  if (p === 'linux') return '🐧';
  return '◆';
}

function formatDate(iso) {
  return iso ? new Date(iso).toLocaleString() : '—';
}

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

export default function Scripts() {
  const [rows, setRows] = useState([]);
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [showEditor, setShowEditor] = useState(false);
  const [showRunner, setShowRunner] = useState(false);
  const [historyFor, setHistoryFor] = useState(null);
  const [historyRows, setHistoryRows] = useState([]);
  const [mergedHistory, setMergedHistory] = useState([]);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', description: '', platforms: ['windows'], scriptType: 'powershell', content: '' });

  useEffect(() => {
    loadScripts();
    loadDevices();
  }, []);

  useEffect(() => {
    if (!rows.length) {
      setMergedHistory([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const slice = rows.slice(0, 24);
      const parts = await Promise.all(
        slice.map(async (r) => {
          try {
            const data = await api(`/api/scripts/${encodeURIComponent(r.id)}/history`);
            const list = Array.isArray(data?.history) ? data.history : [];
            return list.map((h) => ({ ...h, scriptName: r.name, scriptId: r.id }));
          } catch {
            return [];
          }
        }),
      );
      if (cancelled) return;
      const flat = parts
        .flat()
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 48);
      setMergedHistory(flat);
    })();
    return () => {
      cancelled = true;
    };
  }, [rows]);

  async function loadScripts() {
    setLoading(true);
    try {
      const remote = await api('/api/scripts');
      setRows(Array.isArray(remote?.scripts) ? remote.scripts : []);
    } catch (err) {
      setMsg(err.message || 'Failed to load scripts.');
    } finally {
      setLoading(false);
    }
  }

  async function loadDevices() {
    const data = await api('/api/integrations/devices').catch(() => ({ devices: [] }));
    setDevices(Array.isArray(data?.devices) ? data.devices : []);
  }

  const availableTypes = useMemo(() => {
    const allowed = new Set();
    for (const p of form.platforms) {
      for (const t of PLATFORM_TYPES[p] || []) allowed.add(t);
    }
    return [...allowed];
  }, [form.platforms]);

  useEffect(() => {
    if (availableTypes.length && !availableTypes.includes(form.scriptType)) {
      setForm((f) => ({ ...f, scriptType: availableTypes[0] }));
    }
  }, [availableTypes, form.scriptType]);

  function togglePlatform(platform) {
    setForm((f) => {
      const has = f.platforms.includes(platform);
      const next = has ? f.platforms.filter((p) => p !== platform) : [...f.platforms, platform];
      return { ...f, platforms: next };
    });
  }

  function openNew() {
    setEditing(null);
    setForm({ name: '', description: '', platforms: ['windows'], scriptType: 'powershell', content: '' });
    setShowEditor(true);
  }

  function openEdit(row) {
    setEditing(row);
    setForm({
      name: row.name || '',
      description: row.description || '',
      platforms: Array.isArray(row.platforms) ? row.platforms : ['windows'],
      scriptType: row.script_type || 'powershell',
      content: row.content || '',
    });
    setShowEditor(true);
  }

  async function saveScript(e) {
    e.preventDefault();
    setMsg('');
    try {
      if (editing) {
        await api(`/api/scripts/${encodeURIComponent(editing.id)}`, { method: 'PUT', body: form });
        setMsg('Script updated.');
      } else {
        await api('/api/scripts', { method: 'POST', body: form });
        setMsg('Script saved to library.');
      }
      setShowEditor(false);
      await loadScripts();
    } catch (err) {
      setMsg(err.message || 'Failed to save script.');
    }
  }

  async function deleteScript(row) {
    if (!window.confirm(`Delete script "${row.name}"?`)) return;
    try {
      await api(`/api/scripts/${encodeURIComponent(row.id)}`, { method: 'DELETE' });
      setMsg('Script deleted.');
      await loadScripts();
    } catch (err) {
      setMsg(err.message || 'Failed to delete script.');
    }
  }

  async function openHistory(row) {
    try {
      const data = await api(`/api/scripts/${encodeURIComponent(row.id)}/history`);
      setHistoryRows(Array.isArray(data?.history) ? data.history : []);
      setHistoryFor(row);
    } catch (err) {
      setMsg(err.message || 'Failed to load history.');
    }
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Script library"
        description="Card-based library on the left, live run history as a timeline on the right."
      />

      {msg && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-brand">{msg}</div>
      )}

      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <div className="min-w-0">
          {loading ? (
            <p className="py-12 text-center text-sm text-slate-500">Loading scripts…</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <button
                type="button"
                onClick={openNew}
                className="flex min-h-[160px] flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50/50 p-6 text-center transition hover:border-brand hover:bg-blue-50/40"
              >
                <span className="text-3xl font-light text-slate-400">+</span>
                <span className="mt-2 text-sm font-semibold text-slate-700">New script</span>
                <span className="mt-1 text-xs text-slate-500">Create a reusable automation</span>
              </button>

              {rows.map((r) => (
                <Card key={r.id} className="flex flex-col border-fds-border shadow-sm ring-1 ring-slate-950/5">
                  <div className="flex items-start gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-xl text-slate-600">
                      📜
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate font-semibold text-slate-900">{r.name}</h3>
                      <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{r.description || 'No description'}</p>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {(Array.isArray(r.platforms) ? r.platforms : []).map((p) => (
                      <span
                        key={p}
                        className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700 ring-1 ring-slate-200"
                      >
                        <span aria-hidden>{platformIcon(p)}</span>
                        {PLATFORM_LABEL[p] || p}
                      </span>
                    ))}
                  </div>
                  <p className="mt-3 text-[11px] font-medium uppercase tracking-wide text-slate-400">
                    Last run · {formatRelative(r.last_run_at)}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2 border-t border-fds-border pt-3">
                    <Button type="button" className="flex-1 text-xs sm:flex-none" onClick={() => setShowRunner(true)}>
                      Run
                    </Button>
                    <Button type="button" variant="outline" className="text-xs" onClick={() => openEdit(r)}>
                      Edit
                    </Button>
                    <Button type="button" variant="outline" className="text-xs" onClick={() => openHistory(r)}>
                      History
                    </Button>
                    <Button type="button" variant="danger" className="text-xs" onClick={() => deleteScript(r)}>
                      Delete
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}

          {!loading && rows.length === 0 && (
            <div className="mt-6">
              <EmptyState
                icon="📜"
                title="No scripts yet"
                description="Create your first script to automate installs, fixes, and checks across the fleet."
                action={<Button onClick={openNew}>Create script</Button>}
              />
            </div>
          )}
        </div>

        <Card className="hidden h-fit max-h-[calc(100vh-8rem)] overflow-hidden xl:block xl:sticky xl:top-24">
          <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500">Run history</h2>
          <p className="mt-1 text-xs text-slate-500">Latest executions across your library.</p>
          <div className="relative mt-4 max-h-[70vh] space-y-0 overflow-y-auto pl-4">
            <div className="absolute bottom-0 left-[7px] top-2 w-px bg-slate-200" aria-hidden />
            {mergedHistory.length === 0 && !loading && (
              <p className="text-sm text-slate-500">No runs recorded yet.</p>
            )}
            {mergedHistory.map((h, i) => (
              <div key={`${h.id}-${i}`} className="relative pb-6 pl-4">
                <span className="absolute left-0 top-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full border-2 border-white bg-brand shadow ring-1 ring-slate-200" />
                <p className="text-xs font-semibold text-slate-900">{h.scriptName || 'Script'}</p>
                <p className="text-[11px] text-slate-500">{h.device_name || h.device_id || 'Device'}</p>
                <p className="mt-1 inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600">
                  {h.status}
                </p>
                <p className="mt-1 text-[11px] text-slate-400">{formatRelative(h.created_at)}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {showEditor && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4">
          <Card className="max-h-[92vh] w-full max-w-3xl overflow-y-auto border-fds-border shadow-xl ring-1 ring-slate-950/5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">{editing ? 'Edit script' : 'New script'}</h3>
              <button type="button" className="text-2xl text-slate-500 hover:text-slate-800" onClick={() => setShowEditor(false)}>
                ×
              </button>
            </div>
            <form onSubmit={saveScript} className="space-y-3">
              <Input label="Script name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">Description</span>
                <textarea
                  rows={3}
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  className="w-full rounded-lg border border-fds-border px-3 py-2 text-sm shadow-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                />
              </label>
              <div>
                <span className="mb-1 block text-sm font-medium text-slate-700">Platforms</span>
                <div className="flex flex-wrap gap-2">
                  {Object.keys(PLATFORM_TYPES).map((p) => (
                    <label
                      key={p}
                      className="inline-flex items-center gap-2 rounded-lg border border-fds-border bg-white px-2 py-1.5 text-xs font-medium text-slate-700 shadow-sm"
                    >
                      <input type="checkbox" checked={form.platforms.includes(p)} onChange={() => togglePlatform(p)} />
                      {platformIcon(p)} {PLATFORM_LABEL[p] || p}
                    </label>
                  ))}
                </div>
              </div>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">Script type</span>
                <select
                  value={form.scriptType}
                  onChange={(e) => setForm((f) => ({ ...f, scriptType: e.target.value }))}
                  className="w-full rounded-lg border border-fds-border px-3 py-2.5 text-sm shadow-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                  required
                >
                  {availableTypes.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">Code</span>
                <textarea
                  required
                  rows={14}
                  value={form.content}
                  onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
                  className="w-full rounded-lg border border-fds-border bg-slate-50 px-3 py-2 font-mono text-xs shadow-inner focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                />
              </label>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setShowEditor(false)}>
                  Cancel
                </Button>
                <Button type="submit">Save to library</Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {historyFor && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4">
          <Card className="max-h-[92vh] w-full max-w-lg overflow-y-auto border-fds-border shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">History: {historyFor.name}</h3>
              <button type="button" className="text-2xl text-slate-500" onClick={() => setHistoryFor(null)}>
                ×
              </button>
            </div>
            <div className="space-y-3">
              {historyRows.length === 0 && <p className="text-sm text-slate-500">No execution history yet.</p>}
              {historyRows.map((h) => (
                <div key={h.id} className="rounded-lg border border-fds-border p-3 text-xs shadow-sm">
                  <p className="font-semibold text-slate-900">
                    {h.device_name || h.device_id} — {h.status}
                  </p>
                  <p className="text-slate-500">{formatDate(h.created_at)}</p>
                  {h.output && <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap text-slate-700">{h.output}</pre>}
                  {h.error_message && (
                    <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap text-red-700">{h.error_message}</pre>
                  )}
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      <ScriptRunnerModal open={showRunner} onClose={() => setShowRunner(false)} scripts={rows} selectedDevices={devices} title="Run script" />
    </div>
  );
}
