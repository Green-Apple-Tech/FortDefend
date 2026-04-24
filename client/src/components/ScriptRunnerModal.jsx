import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { Button, Card, Input } from './ui';

const SCRIPT_TYPES = ['powershell', 'cmd', 'python', 'bash', 'zsh', 'javascript'];

export default function ScriptRunnerModal({ open, onClose, selectedDevices = [], scripts = [], title = 'Run Script' }) {
  const [scriptId, setScriptId] = useState('');
  const [quickName, setQuickName] = useState('Quick script');
  const [quickContent, setQuickContent] = useState('');
  const [quickType, setQuickType] = useState('powershell');
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState([]);
  const [error, setError] = useState('');

  const isQuick = scriptId === '__quick__';
  const canRun = selectedDevices.length > 0 && (isQuick ? quickContent.trim() : scriptId);

  const selectedScript = useMemo(() => scripts.find((s) => s.id === scriptId) || null, [scripts, scriptId]);

  async function runNow() {
    if (!canRun || running) return;
    setRunning(true);
    setError('');
    setResults([]);
    try {
      const endpoint = isQuick ? '/api/scripts/quick/run' : `/api/scripts/${encodeURIComponent(scriptId)}/run`;
      const body = {
        deviceIds: selectedDevices.map((d) => d.id),
      };
      if (isQuick) {
        body.scriptName = quickName;
        body.scriptType = quickType;
        body.scriptContent = quickContent;
      }
      const res = await api(endpoint, { method: 'POST', body });
      const commandIds = (res.commands || []).map((c) => c.id);
      if (!commandIds.length) {
        setRunning(false);
        return;
      }
      const poll = async () => {
        const runId = isQuick ? 'quick' : scriptId;
        const hist = await api(`/api/scripts/${encodeURIComponent(runId)}/history?commandIds=${encodeURIComponent(commandIds.join(','))}`);
        const next = Array.isArray(hist.history) ? hist.history : [];
        setResults(next);
        const done = next.length >= commandIds.length && next.every((r) => ['success', 'failed', 'cancelled'].includes(r.status));
        if (!done) {
          setTimeout(poll, 1500);
        } else {
          setRunning(false);
        }
      };
      poll();
    } catch (err) {
      setRunning(false);
      setError(err.message || 'Failed to run script.');
    }
  }

  useEffect(() => {
    if (!open) {
      setScriptId('');
      setQuickName('Quick script');
      setQuickContent('');
      setQuickType('powershell');
      setRunning(false);
      setResults([]);
      setError('');
    }
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4">
      <Card className="max-h-[90vh] w-full max-w-3xl overflow-y-auto">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
            <p className="text-sm text-gray-600">{selectedDevices.length} device(s) selected</p>
          </div>
          <button type="button" className="text-2xl text-gray-500" onClick={onClose}>×</button>
        </div>

        <div className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">Script from library</span>
            <select
              value={scriptId}
              onChange={(e) => setScriptId(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm"
            >
              <option value="">Select a script</option>
              {scripts.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
              <option value="__quick__">Quick one-time script</option>
            </select>
          </label>

          {selectedScript && !isQuick && (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
              <p><span className="font-medium">Type:</span> {selectedScript.script_type}</p>
              <p><span className="font-medium">Platforms:</span> {(selectedScript.platforms || []).join(', ') || '—'}</p>
            </div>
          )}

          {isQuick && (
            <>
              <Input label="Script name" value={quickName} onChange={(e) => setQuickName(e.target.value)} />
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-gray-700">Script type</span>
                <select
                  value={quickType}
                  onChange={(e) => setQuickType(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm"
                >
                  {SCRIPT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-gray-700">Quick script content</span>
                <textarea
                  rows={10}
                  value={quickContent}
                  onChange={(e) => setQuickContent(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-xs"
                />
              </label>
            </>
          )}

          {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>Close</Button>
            <Button onClick={runNow} disabled={!canRun || running}>{running ? 'Running…' : 'Run Now'}</Button>
          </div>
        </div>

        {results.length > 0 && (
          <div className="mt-5 rounded-lg border border-gray-200">
            <div className="border-b border-gray-200 px-3 py-2 text-sm font-semibold">Real-time results</div>
            <div className="max-h-72 overflow-y-auto">
              {results.map((r) => (
                <div key={r.id} className="border-b border-gray-100 px-3 py-2 text-xs">
                  <p className="font-medium text-gray-900">{r.device_name || r.device_id} - {r.status}</p>
                  {r.output && <pre className="mt-1 overflow-x-auto whitespace-pre-wrap text-gray-700">{r.output}</pre>}
                  {r.error_message && <pre className="mt-1 overflow-x-auto whitespace-pre-wrap text-red-700">{r.error_message}</pre>}
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
