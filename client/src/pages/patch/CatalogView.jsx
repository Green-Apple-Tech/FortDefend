import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { fetchPatch, patchErrorMessage, PatchLoadError } from './patchApi';

export default function CatalogView() {
  const [manifests, setManifests] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetchPatch('/api/patch/manifests', {
        label: 'GET /api/patch/manifests',
        fallback: { manifests: [], apps: [] },
      });
      const list = res?.manifests ?? res?.apps ?? [];
      setManifests(Array.isArray(list) ? list : []);
    } catch (err) {
      setManifests([]);
      setError(patchErrorMessage(err, 'Failed to load app catalog.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const saveField = async (label, field, value) => {
    try {
      await api(`/api/patch/manifests/${encodeURIComponent(label)}`, {
        method: 'PATCH',
        body: { [field]: value },
      });
      setManifests((prev) => prev.map((m) => (m.label === label ? { ...m, [field]: value } : m)));
    } catch (err) {
      console.error('[Patch Manager] PATCH manifest failed', label, field, err);
      setError(patchErrorMessage(err, 'Failed to save catalog change.'));
    }
  };

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">App Catalog</h1>
      {error ? <PatchLoadError message={error} onRetry={load} /> : null}
      {loading ? <p className="mb-4 text-sm text-slate-500">Loading catalog…</p> : null}
      <div className="overflow-auto rounded-xl border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b bg-slate-50">
            <tr>
              {['Name', 'Label', 'Type', 'Latest Version', 'Devices', 'Download URL'].map((h) => (
                <th key={h} className="px-4 py-3 text-left font-semibold text-slate-600">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {manifests.map((m) => (
              <tr key={m.label} className="border-b align-top">
                <td className="px-4 py-3 font-medium">{m.name}</td>
                <td className="px-4 py-3 font-mono text-xs">{m.label}</td>
                <td className="px-4 py-3">{m.type}</td>
                <td className="px-4 py-3">
                  <input
                    className="w-28 rounded border px-2 py-1"
                    defaultValue={m.appNewVersion || ''}
                    onBlur={(e) => saveField(m.label, 'appNewVersion', e.target.value)}
                  />
                </td>
                <td className="px-4 py-3">{m.deviceCount || 0}</td>
                <td className="px-4 py-3">
                  <input
                    className="min-w-64 w-full rounded border px-2 py-1"
                    defaultValue={m.downloadURL || ''}
                    onBlur={(e) => saveField(m.label, 'downloadURL', e.target.value)}
                  />
                </td>
              </tr>
            ))}
            {!loading && !manifests.length ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                  No catalog entries yet. Run migrations or deploy the latest agent manifests.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
