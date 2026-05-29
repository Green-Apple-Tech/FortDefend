import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { fetchPatch, patchErrorMessage, PatchLoadError } from './patchApi';

export default function PoliciesView() {
  const [devices, setDevices] = useState([]);
  const [deviceId, setDeviceId] = useState('');
  const [policies, setPolicies] = useState([]);
  const [manifests, setManifests] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const loadInitial = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [d, m] = await Promise.all([
        fetchPatch('/api/patch/devices', { label: 'GET /api/patch/devices', fallback: { devices: [] } }),
        fetchPatch('/api/patch/manifests', { label: 'GET /api/patch/manifests', fallback: { manifests: [] } }),
      ]);
      const deviceList = Array.isArray(d?.devices) ? d.devices : [];
      const manifestList = Array.isArray(m?.manifests) ? m.manifests : [];
      setDevices(deviceList);
      setManifests(manifestList);
      if (deviceList[0]?.id) setDeviceId(deviceList[0].id);
    } catch (err) {
      setDevices([]);
      setManifests([]);
      setError(patchErrorMessage(err, 'Failed to load policies.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadInitial();
  }, [loadInitial]);

  useEffect(() => {
    if (!deviceId || !manifests.length) {
      setPolicies([]);
      return;
    }
    fetchPatch(`/api/patch/devices/${encodeURIComponent(deviceId)}`, {
      label: 'GET /api/patch/devices/:id',
      fallback: { policies: [], apps: [] },
    })
      .then((res) => {
        const existing = Object.fromEntries((res.policies || []).map((p) => [p.label, p]));
        setPolicies(
          manifests.map((m) => ({
            label: m.label,
            name: m.name,
            policy: existing[m.label]?.policy || 'automatic',
            disableBuiltinUpdater: existing[m.label]?.disable_builtin_updater || false,
          })),
        );
      })
      .catch((err) => {
        console.error('[Patch Manager] load device policies failed', err);
        setError(patchErrorMessage(err, 'Failed to load device policies.'));
      });
  }, [deviceId, manifests]);

  const save = async () => {
    if (!deviceId) return;
    try {
      await api(`/api/patch/devices/${encodeURIComponent(deviceId)}/policies`, {
        method: 'PATCH',
        body: {
          policies: policies.map((p) => ({
            label: p.label,
            policy: p.policy,
            disableBuiltinUpdater: p.disableBuiltinUpdater,
          })),
        },
      });
      setError('');
      alert('Policies saved');
    } catch (err) {
      console.error('[Patch Manager] save policies failed', err);
      setError(patchErrorMessage(err, 'Failed to save policies.'));
    }
  };

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Patch Policies</h1>
      {error ? <PatchLoadError message={error} onRetry={loadInitial} /> : null}
      {loading ? <p className="mb-4 text-sm text-slate-500">Loading…</p> : null}
      <div className="mb-4">
        <select
          className="rounded border px-3 py-2"
          value={deviceId}
          onChange={(e) => setDeviceId(e.target.value)}
          disabled={!devices.length}
        >
          {devices.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </div>

      {!devices.length && !loading ? (
        <p className="text-sm text-slate-500">No Windows devices available for policy assignment.</p>
      ) : (
        <>
          <div className="overflow-auto rounded-xl border bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead className="border-b bg-slate-50">
                <tr>
                  {['App', 'Policy', 'Disable Built-in Updater'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left font-semibold text-slate-600">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {policies.map((p, idx) => (
                  <tr key={p.label} className="border-b">
                    <td className="px-4 py-3">{p.name}</td>
                    <td className="px-4 py-3">
                      <select
                        className="rounded border px-2 py-1"
                        value={p.policy}
                        onChange={(e) => {
                          const next = [...policies];
                          next[idx] = { ...p, policy: e.target.value };
                          setPolicies(next);
                        }}
                      >
                        <option value="automatic">Automatic</option>
                        <option value="locked">Locked</option>
                        <option value="ignored">Ignored</option>
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={p.disableBuiltinUpdater}
                        onChange={(e) => {
                          const next = [...policies];
                          next[idx] = { ...p, disableBuiltinUpdater: e.target.checked };
                          setPolicies(next);
                        }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button type="button" className="mt-4 rounded bg-blue-600 px-4 py-2 text-white" onClick={save} disabled={!deviceId}>
            Save Policies
          </button>
        </>
      )}
    </div>
  );
}
