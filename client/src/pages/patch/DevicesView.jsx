import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, statusColor } from '../../lib/api';

export default function DevicesView() {
  const [devices, setDevices] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/api/patch/devices')
      .then((res) => setDevices(res.devices))
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <div className="text-red-600">{error}</div>;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Managed Devices</h1>
      <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b">
            <tr>
              {['Device Name', 'OS', 'Last Seen', 'Apps Patched', 'Apps Outdated', 'Status', ''].map((h) => (
                <th key={h} className="text-left px-4 py-3 font-semibold text-slate-600">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {devices.map((d) => (
              <tr key={d.id} className="border-b hover:bg-slate-50">
                <td className="px-4 py-3 font-medium">{d.name}</td>
                <td className="px-4 py-3">{d.osVersion || 'Windows'}</td>
                <td className="px-4 py-3">{d.lastSeen ? new Date(d.lastSeen).toLocaleString() : 'Never'}</td>
                <td className="px-4 py-3">{d.appsPatched}</td>
                <td className="px-4 py-3">{d.appsOutdated}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-1 rounded text-xs font-medium ${statusColor(d.status)}`}>
                    {d.status}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <Link className="text-blue-600 hover:underline" to={`/dashboard/patch/devices/${d.id}`}>
                    View
                  </Link>
                </td>
              </tr>
            ))}
            {!devices.length && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-500">No devices registered yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
