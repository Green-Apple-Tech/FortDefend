import React, { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import api from '../../utils/api';

export default function Devices() {
  const { darkMode } = useOutletContext();
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    async function fetchDevices() {
      try {
        const res = await api.get('/api/v1/devices');
        setDevices(res.data.data || []);
      } catch (err) { console.error(err); }
      finally { setLoading(false); }
    }
    fetchDevices();
  }, []);

  const filtered = devices.filter(d =>
    (d.name || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>Devices</h1>
      </div>
      <div className={`rounded-xl border ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
        <div className="p-4">
          <input type="text" placeholder="Search devices..." value={search}
            onChange={e => setSearch(e.target.value)}
            className={`w-full px-3 py-2 rounded-lg text-sm border ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-gray-50 border-gray-200'} focus:outline-none`} />
        </div>
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <h3 className={`text-base font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>No devices yet</h3>
            <p className={`text-sm mt-1 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Install the agent to see devices here.</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className={`text-xs font-medium uppercase ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                {['Name','OS','Status','Last Seen'].map(h => (
                  <th key={h} className={`px-4 py-3 text-left border-b ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(device => (
                <tr key={device.id} className={`border-b last:border-0 ${darkMode ? 'border-gray-700 hover:bg-gray-700' : 'border-gray-100 hover:bg-gray-50'}`}>
                  <td className={`px-4 py-3 text-sm font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>{device.name || '-'}</td>
                  <td className={`px-4 py-3 text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{device.os || '-'}</td>
                  <td className="px-4 py-3"><span className="text-xs font-medium px-2 py-1 rounded-full bg-gray-100 text-gray-600">{device.status}</span></td>
                  <td className={`px-4 py-3 text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{device.last_seen ? new Date(device.last_seen).toLocaleDateString() : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}