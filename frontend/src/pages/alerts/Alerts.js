import React, { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import api from '../../utils/api';

function SeverityBadge({ severity }) {
  const styles = {
    critical: 'bg-red-100 text-red-700',
    high: 'bg-orange-100 text-orange-700',
    medium: 'bg-yellow-100 text-yellow-700',
    low: 'bg-blue-100 text-blue-700',
  };
  return (
    <span className={`text-xs font-medium px-2 py-1 rounded-full ${styles[severity] || styles.low}`}>
      {severity}
    </span>
  );
}

export default function Alerts() {
  const { darkMode } = useOutletContext();
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    async function fetchAlerts() {
      try {
        const res = await api.get('/api/v1/alerts');
        setAlerts(res.data.data || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    fetchAlerts();
  }, []);

  function exportCSV() {
    const headers = ['ID', 'Severity', 'Message', 'Resolved', 'Created At'];
    const rows = filtered.map(a => [a.id, a.severity, a.message, a.resolved, a.created_at]);
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'alerts.csv';
    a.click();
  }

  const filtered = alerts.filter(a => {
    const matchSearch = a.message?.toLowerCase().includes(search.toLowerCase());
    const matchFilter = filter === 'all' || 
      (filter === 'open' && !a.resolved) || 
      (filter === 'resolved' && a.resolved) ||
      a.severity === filter;
    return matchSearch && matchFilter;
  });

  const openCount = alerts.filter(a => !a.resolved).length;
  const criticalCount = alerts.filter(a => a.severity === 'critical' && !a.resolved).length;

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>Alerts</h1>
          <p className={`mt-1 text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
            {openCount} open · {criticalCount} critical
          </p>
        </div>
        <button onClick={exportCSV}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">
          ⬇️ Export CSV
        </button>
      </div>

      <div className={`rounded-xl border ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
        <div className={`p-4 border-b flex gap-3 flex-wrap ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
          <input
            type="text"
            placeholder="Search alerts..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className={`flex-1 min-w-48 px-3 py-2 rounded-lg text-sm border ${darkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : 'bg-gray-50 border-gray-200'} focus:outline-none focus:ring-2 focus:ring-blue-500`}
          />
          <select value={filter} onChange={e => setFilter(e.target.value)}
            className={`px-3 py-2 rounded-lg text-sm border ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-gray-50 border-gray-200'} focus:outline-none`}>
            <option value="all">All Alerts</option>
            <option value="open">Open</option>
            <option value="resolved">Resolved</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-5xl mb-3">✅</div>
            <h3 className={`text-base font-medium mb-1 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
              {filter === 'all' ? 'No alerts' : 'No alerts match this filter'}
            </h3>
            <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
              Your fleet is looking healthy!
            </p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className={`text-xs font-medium uppercase tracking-wider ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                {['Severity', 'Message', 'Status', 'Created'].map(h => (
                  <th key={h} className={`px-4 py-3 text-left border-b ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(alert => (
                <tr key={alert.id} className={`border-b last:border-0 ${darkMode ? 'border-gray-700 hover:bg-gray-700' : 'border-gray-100 hover:bg-gray-50'} transition-colors`}>
                  <td className="px-4 py-3"><SeverityBadge severity={alert.severity} /></td>
                  <td className={`px-4 py-3 text-sm ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>{alert.message || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2 py-1 rounded-full ${alert.resolved ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {alert.resolved ? 'Resolved' : 'Open'}
                    </span>
                  </td>
                  <td className={`px-4 py-3 text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                    {alert.created_at ? new Date(alert.created_at).toLocaleDateString() : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
