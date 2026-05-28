import { useEffect, useState } from 'react';
import { api } from '../../lib/api';

export default function PoliciesView() {
  const [devices, setDevices] = useState([]);
  const [deviceId, setDeviceId] = useState('');
  const [policies, setPolicies] = useState([]);
  const [manifests, setManifests] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([api('/api/patch/devices'), api('/api/patch/manifests')])
      .then(([d, m]) => {
        setDevices(d.devices);
        setManifests(m.manifests);
        if (d.devices[0]) setDeviceId(d.devices[0].id);
      })
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!deviceId || !manifests.length) return;
    api(`/api/patch/devices/${deviceId}`)
      .then((res) => {
        const existing = Object.fromEntries((res.policies || []).map((p) => [p.label, p]));
        setPolicies(
          manifests.map((m) => ({
            label: m.label,
            name: m.name,
            policy: existing[m.label]?.policy || 'automatic',
            disableBuiltinUpdater: existing[m.label]?.disable_builtin_updater || false,
          }))
        );
      })
      .catch((e) => setError(e.message));
  }, [deviceId, manifests]);

  const save = async () => {
    await api(`/api/patch/devices/${deviceId}/policies`, {
      method: 'PATCH',
      body: {
        policies: policies.map((p) => ({
          label: p.label,
          policy: p.policy,
          disableBuiltinUpdater: p.disableBuiltinUpdater,
        })),
      },
    });
    alert('Policies saved');
  };

  if (error) return <div className="text-red-600">{error}</div>;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Patch Policies</h1>
      <div className="mb-4">
        <select className="border rounded px-3 py-2" value={deviceId} onChange={(e) => setDeviceId(e.target.value)}>
          {devices.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
      </div>

      <div className="rounded-xl border bg-white shadow-sm overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b">
            <tr>
              {['App', 'Policy', 'Disable Built-in Updater'].map((h) => (
                <th key={h} className="text-left px-4 py-3 font-semibold text-slate-600">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {policies.map((p, idx) => (
              <tr key={p.label} className="border-b">
                <td className="px-4 py-3">{p.name}</td>
                <td className="px-4 py-3">
                  <select
                    className="border rounded px-2 py-1"
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

      <button className="mt-4 px-4 py-2 rounded bg-blue-600 text-white" onClick={save}>
        Save Policies
      </button>
    </div>
  );
}
