import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { Card, Button, Input } from '../components/ui';
import ScriptRunnerModal from '../components/ScriptRunnerModal';

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

const TOGGLE_LS_KEY = 'fds_script_toggles_v1';

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

function scriptCategoryLabel(row) {
  const st = String(row.script_type || 'script').replace(/_/g, ' ');
  const stNice = st ? st.charAt(0).toUpperCase() + st.slice(1) : 'Script';
  const plats = Array.isArray(row.platforms)
    ? row.platforms.map((p) => PLATFORM_LABEL[p] || p).join(' · ')
    : '';
  return plats ? `${stNice} · ${plats}` : stNice;
}

function readToggleMap() {
  try {
    const raw = localStorage.getItem(TOGGLE_LS_KEY);
    if (!raw) return {};
    const o = JSON.parse(raw);
    return o && typeof o === 'object' ? o : {};
  } catch {
    return {};
  }
}

function ScriptEnableToggle({ enabled, onChange }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      onClick={() => onChange(!enabled)}
      className={`relative inline-flex h-10 w-[3.25rem] shrink-0 cursor-pointer rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 ${
        enabled ? 'bg-emerald-500 shadow-inner' : 'bg-slate-200'
      }`}
    >
      <span
        className={`pointer-events-none absolute top-1 left-1 inline-block h-8 w-8 rounded-full bg-white shadow-md transition-transform ${
          enabled ? 'translate-x-[1.35rem]' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

export default function Scripts() {
  const [rows, setRows] = useState([]);
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [showEditor, setShowEditor] = useState(false);
  const [showRunner, setShowRunner] = useState(false);
  const [runnerInitialId, setRunnerInitialId] = useState(null);
  const [historyFor, setHistoryFor] = useState(null);
  const [historyRows, setHistoryRows] = useState([]);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', description: '', platforms: ['windows'], scriptType: 'powershell', content: '' });
  const [toggleMap, setToggleMap] = useState(() => readToggleMap());

  const persistToggles = useCallback((next) => {
    try {
      localStorage.setItem(TOGGLE_LS_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    loadScripts();
    loadDevices();
  }, []);

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

  function setScriptEnabled(id, on) {
    setToggleMap((prev) => {
      const next = { ...prev, [id]: on };
      persistToggles(next);
      return next;
    });
  }

  function isScriptEnabled(id) {
    return toggleMap[id] !== false;
  }

  function openRunModal(scriptId) {
    setRunnerInitialId(scriptId);
    setShowRunner(true);
  }

  return (
    <div className="space-y-3">
      {msg && (
        <div className="rounded-lg border border-blue-100 bg-blue-50/90 px-3 py-2 text-sm text-brand">{msg}</div>
      )}

      <Card className="border-fds-border p-0 shadow-sm ring-1 ring-slate-950/5">
        {loading ? (
          <p className="px-6 py-12 text-center text-sm text-slate-500">Loading scripts…</p>
        ) : (
          <div className="divide-y divide-fds-border">
            <button
              type="button"
              onClick={openNew}
              className="flex w-full items-center gap-4 px-5 py-4 text-left transition hover:bg-slate-50/80"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white text-2xl font-light text-slate-400">
                +
              </span>
              <div>
                <p className="font-semibold text-slate-900">New script</p>
                <p className="text-xs font-semibold uppercase tracking-wide text-brand">Create command</p>
              </div>
            </button>

            {rows.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center gap-4 px-5 py-4 transition hover:bg-slate-50/50 sm:flex-nowrap">
                <div className="flex min-w-0 flex-1 items-center gap-4">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-lg text-slate-600">
                    📜
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-slate-900">{r.name}</p>
                    <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-wide text-brand">
                      {scriptCategoryLabel(r)}
                    </p>
                  </div>
                </div>

                <div className="ml-auto flex flex-wrap items-center justify-end gap-4 sm:ml-0">
                  <button
                    type="button"
                    className="text-sm font-medium text-brand hover:underline"
                    onClick={() => openHistory(r)}
                  >
                    View results
                  </button>
                  <button type="button" className="text-sm font-medium text-slate-500 hover:text-slate-800 hover:underline" onClick={() => openRunModal(r.id)}>
                    Run
                  </button>
                  <div className="flex items-center gap-2">
                    <span className="hidden text-xs text-slate-500 sm:inline">Scheduled</span>
                    <ScriptEnableToggle enabled={isScriptEnabled(r.id)} onChange={(on) => setScriptEnabled(r.id, on)} />
                  </div>
                  <div className="flex items-center gap-2 border-l border-fds-border pl-4">
                    <button type="button" className="text-xs font-medium text-slate-500 hover:text-brand" onClick={() => openEdit(r)}>
                      Edit
                    </button>
                    <button type="button" className="text-xs font-medium text-red-600 hover:underline" onClick={() => deleteScript(r)}>
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}

            {!loading && rows.length === 0 && (
              <div className="px-6 py-12 text-center text-sm text-slate-500">No scripts yet. Use New script above to create one.</div>
            )}
          </div>
        )}
      </Card>

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
                <Button type="submit">Save</Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {historyFor && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4">
          <Card className="max-h-[92vh] w-full max-w-lg overflow-y-auto border-fds-border shadow-xl ring-1 ring-slate-950/5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">Results: {historyFor.name}</h3>
              <button type="button" className="text-2xl text-slate-500 hover:text-slate-800" onClick={() => setHistoryFor(null)}>
                ×
              </button>
            </div>
            <div className="space-y-3 divide-y divide-fds-border">
              {historyRows.length === 0 && <p className="text-sm text-slate-500">No runs yet.</p>}
              {historyRows.map((h) => (
                <div key={h.id} className="pt-3 first:pt-0 text-xs">
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

      <ScriptRunnerModal
        open={showRunner}
        onClose={() => {
          setShowRunner(false);
          setRunnerInitialId(null);
        }}
        initialScriptId={runnerInitialId}
        scripts={rows}
        selectedDevices={devices}
        title="Run script"
      />
    </div>
  );
}
