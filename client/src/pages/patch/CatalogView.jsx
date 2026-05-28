import { useEffect, useState } from 'react';
import { api } from '../../lib/api';

export default function CatalogView() {
  const [manifests, setManifests] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/api/patch/manifests')
      .then((res) => setManifests(res.manifests))
      .catch((e) => setError(e.message));
  }, []);

  const saveField = async (label, field, value) => {
    await api(`/api/patch/manifests/${label}`, {
      method: 'PATCH',
      body: JSON.stringify({ [field]: value }),
    });
    setManifests((prev) =>
      prev.map((m) => (m.label === label ? { ...m, [field]: value } : m))
    );
  };

  if (error) return <div className="text-red-600">{error}</div>;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">App Catalog</h1>
      <div className="rounded-xl border bg-white shadow-sm overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b">
            <tr>
              {['Name', 'Label', 'Type', 'Latest Version', 'Devices', 'Download URL'].map((h) => (
                <th key={h} className="text-left px-4 py-3 font-semibold text-slate-600">{h}</th>
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
                    className="border rounded px-2 py-1 w-28"
                    defaultValue={m.appNewVersion || ''}
                    onBlur={(e) => saveField(m.label, 'appNewVersion', e.target.value)}
                  />
                </td>
                <td className="px-4 py-3">{m.deviceCount || 0}</td>
                <td className="px-4 py-3">
                  <input
                    className="border rounded px-2 py-1 w-full min-w-64"
                    defaultValue={m.downloadURL}
                    onBlur={(e) => saveField(m.label, 'downloadURL', e.target.value)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
