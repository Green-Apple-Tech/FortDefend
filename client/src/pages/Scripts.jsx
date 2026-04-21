import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { Card, Button, Input } from '../components/ui';

const LS_KEY = 'fortdefend_scripts_demo';

function loadLocal() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export default function Scripts() {
  const [rows, setRows] = useState([]);
  const [name, setName] = useState('');
  const [content, setContent] = useState('');
  const [targets, setTargets] = useState('');
  const [schedule, setSchedule] = useState('');
  const [editing, setEditing] = useState(null);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const remote = await api('/api/scripts').catch(() => null);
        if (!cancelled && Array.isArray(remote?.scripts)) {
          setRows(remote.scripts);
          return;
        }
      } catch {
        /* fall through */
      }
      if (!cancelled) setRows(loadLocal());
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function persist(next) {
    setRows(next);
    localStorage.setItem(LS_KEY, JSON.stringify(next));
  }

  const targetDevices = useMemo(() => {
    return targets
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }, [targets]);

  function saveScript(e) {
    e.preventDefault();
    setMsg('');
    const row = {
      id: editing || crypto.randomUUID(),
      name,
      content,
      target_devices: targetDevices,
      schedule: schedule || null,
      status: 'idle',
      last_run: null,
      updated_at: new Date().toISOString(),
    };
    const next = editing ? rows.map((r) => (r.id === editing ? row : r)) : [...rows, row];
    persist(next);
    setName('');
    setContent('');
    setTargets('');
    setSchedule('');
    setEditing(null);
    setMsg('Script saved locally. Add `GET/POST /api/scripts` to sync with the database.');
  }

  function runScript(id) {
    persist(
      rows.map((r) =>
        r.id === id
          ? {
              ...r,
              status: 'queued',
              last_run: new Date().toISOString(),
            }
          : r
      )
    );
    setMsg('Run queued (demo). Agent + ScriptRunner will pick up from `scripts` table when wired.');
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Custom scripts</h1>
        <p className="text-sm text-gray-600">PowerShell scripts for targeted devices. DB-backed when API is available.</p>
      </div>

      {msg && <div className="rounded-lg bg-brand-light px-3 py-2 text-sm text-brand">{msg}</div>}

      <Card>
        <h2 className="font-semibold text-gray-900">{editing ? 'Edit script' : 'New script'}</h2>
        <form onSubmit={saveScript} className="mt-4 space-y-3">
          <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} required />
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">PowerShell content</span>
            <textarea
              required
              rows={10}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-xs focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
          </label>
          <Input
            label="Target device IDs (comma or space separated)"
            value={targets}
            onChange={(e) => setTargets(e.target.value)}
            placeholder="uuid-1, uuid-2"
          />
          <Input label="Schedule (optional cron)" value={schedule} onChange={(e) => setSchedule(e.target.value)} placeholder="0 3 * * *" />
          <div className="flex gap-2">
            <Button type="submit">Save</Button>
            {editing && (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setEditing(null);
                  setName('');
                  setContent('');
                  setTargets('');
                  setSchedule('');
                }}
              >
                Cancel edit
              </Button>
            )}
          </div>
        </form>
      </Card>

      <Card className="overflow-x-auto p-0">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left font-semibold">Name</th>
              <th className="px-4 py-3 text-left font-semibold">Targets</th>
              <th className="px-4 py-3 text-left font-semibold">Schedule</th>
              <th className="px-4 py-3 text-left font-semibold">Status</th>
              <th className="px-4 py-3 text-left font-semibold">Last run</th>
              <th className="px-4 py-3 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                  No scripts yet.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-3 font-medium text-gray-900">{r.name}</td>
                <td className="max-w-xs truncate px-4 py-3 text-gray-600">{(r.target_devices || []).join(', ') || '—'}</td>
                <td className="px-4 py-3 text-gray-600">{r.schedule || '—'}</td>
                <td className="px-4 py-3">{r.status}</td>
                <td className="px-4 py-3 text-gray-600">{r.last_run ? new Date(r.last_run).toLocaleString() : '—'}</td>
                <td className="space-x-2 px-4 py-3 text-right whitespace-nowrap">
                  <Button type="button" className="py-1 text-xs" variant="outline" onClick={() => runScript(r.id)}>
                    Run
                  </Button>
                  <Button
                    type="button"
                    className="py-1 text-xs"
                    variant="outline"
                    onClick={() => {
                      setEditing(r.id);
                      setName(r.name);
                      setContent(r.content);
                      setTargets((r.target_devices || []).join(', '));
                      setSchedule(r.schedule || '');
                    }}
                  >
                    Edit
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
