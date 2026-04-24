import { useEffect, useMemo, useState } from 'react';
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

export default function Scripts() {
  const [rows, setRows] = useState([]);
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [showEditor, setShowEditor] = useState(false);
  const [showRunner, setShowRunner] = useState(false);
  const [historyFor, setHistoryFor] = useState(null);
  const [historyRows, setHistoryRows] = useState([]);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', description: '', platforms: ['windows'], scriptType: 'powershell', content: '' });

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

  const formatDate = (iso) => (iso ? new Date(iso).toLocaleString() : '—');

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Script Library</h1>
          <p className="text-sm text-gray-600">Create, manage, and execute scripts across your managed devices.</p>
        </div>
        <Button onClick={openNew}>New Script</Button>
      </div>
      {msg && <div className="rounded-lg bg-brand-light px-3 py-2 text-sm text-brand">{msg}</div>}
      <Card className="overflow-x-auto p-0">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left font-semibold">Name</th>
              <th className="px-4 py-3 text-left font-semibold">Type</th>
              <th className="px-4 py-3 text-left font-semibold">Platform</th>
              <th className="px-4 py-3 text-left font-semibold">Last Run</th>
              <th className="px-4 py-3 text-left font-semibold">Created By</th>
              <th className="px-4 py-3 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading && <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-500">Loading scripts...</td></tr>}
            {!loading && rows.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-500">No scripts in library.</td></tr>}
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-3 font-medium text-gray-900">{r.name}</td>
                <td className="px-4 py-3 text-gray-600">{r.script_type || '—'}</td>
                <td className="px-4 py-3 text-gray-600">{Array.isArray(r.platforms) ? r.platforms.join(', ') : '—'}</td>
                <td className="px-4 py-3 text-gray-600">{formatDate(r.last_run_at)}</td>
                <td className="px-4 py-3 text-gray-600">{r.created_by || '—'}</td>
                <td className="space-x-2 px-4 py-3 text-right whitespace-nowrap">
                  <Button type="button" variant="outline" className="py-1 text-xs" onClick={() => setShowRunner(true)}>Run</Button>
                  <Button type="button" variant="outline" className="py-1 text-xs" onClick={() => openEdit(r)}>Edit</Button>
                  <Button type="button" variant="outline" className="py-1 text-xs" onClick={() => openHistory(r)}>View History</Button>
                  <Button type="button" variant="danger" className="py-1 text-xs" onClick={() => deleteScript(r)}>Delete</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      {showEditor && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4">
          <Card className="max-h-[92vh] w-full max-w-3xl overflow-y-auto">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">{editing ? 'Edit Script' : 'New Script'}</h3>
              <button type="button" className="text-2xl text-gray-500" onClick={() => setShowEditor(false)}>×</button>
            </div>
            <form onSubmit={saveScript} className="space-y-3">
              <Input label="Script name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
              <label className="block"><span className="mb-1 block text-sm font-medium text-gray-700">Description</span>
                <textarea rows={3} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
              </label>
              <div><span className="mb-1 block text-sm font-medium text-gray-700">Platforms</span><div className="flex flex-wrap gap-2">{Object.keys(PLATFORM_TYPES).map((p) => (
                <label key={p} className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-2 py-1 text-xs"><input type="checkbox" checked={form.platforms.includes(p)} onChange={() => togglePlatform(p)} />{p}</label>
              ))}</div></div>
              <label className="block"><span className="mb-1 block text-sm font-medium text-gray-700">Script type</span>
                <select value={form.scriptType} onChange={(e) => setForm((f) => ({ ...f, scriptType: e.target.value }))} className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm" required>
                  {availableTypes.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </label>
              <label className="block"><span className="mb-1 block text-sm font-medium text-gray-700">Code</span>
                <textarea required rows={14} value={form.content} onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-xs" />
              </label>
              <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setShowEditor(false)}>Cancel</Button><Button type="submit">Save to Library</Button></div>
            </form>
          </Card>
        </div>
      )}
      {historyFor && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4">
          <Card className="max-h-[92vh] w-full max-w-4xl overflow-y-auto">
            <div className="mb-4 flex items-center justify-between"><h3 className="text-lg font-semibold text-gray-900">History: {historyFor.name}</h3><button type="button" className="text-2xl text-gray-500" onClick={() => setHistoryFor(null)}>×</button></div>
            <div className="space-y-2">{historyRows.length === 0 && <p className="text-sm text-gray-500">No execution history yet.</p>}
              {historyRows.map((h) => (
                <div key={h.id} className="rounded-lg border border-gray-200 p-3 text-xs"><p className="font-semibold text-gray-900">{h.device_name || h.device_id} - {h.status}</p><p className="text-gray-500">{formatDate(h.created_at)}</p>{h.output && <pre className="mt-1 overflow-x-auto whitespace-pre-wrap text-gray-700">{h.output}</pre>}{h.error_message && <pre className="mt-1 overflow-x-auto whitespace-pre-wrap text-red-700">{h.error_message}</pre>}</div>
              ))}
            </div>
          </Card>
        </div>
      )}
      <ScriptRunnerModal open={showRunner} onClose={() => setShowRunner(false)} scripts={rows} selectedDevices={devices} title="Run Script" />
    </div>
  );
}
