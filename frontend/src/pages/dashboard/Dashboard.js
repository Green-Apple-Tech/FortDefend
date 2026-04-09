import React, { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import api from '../../utils/api';

function StatCard({ title, value, subtitle, color, darkMode }) {
  return (
    <div className={`rounded-xl p-6 border ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
      <div className={`text-sm font-medium mb-1 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{title}</div>
      <div className={`text-3xl font-bold mb-1 ${color}`}>{value}</div>
      <div className={`text-xs ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>{subtitle}</div>
    </div>
  );
}

function SecurityScore({ score, darkMode }) {
  const color = score >= 80 ? '#10B981' : score >= 60 ? '#F59E0B' : '#EF4444';
  const label = score >= 80 ? 'Good' : score >= 60 ? 'Fair' : 'At Risk';
  return (
    <div className={`rounded-xl p-6 border ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
      <div className={`text-sm font-medium mb-4 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Security Score</div>
      <div className="flex items-center gap-4">
        <div className="relative w-20 h-20">
          <svg viewBox="0 0 36 36" className="w-20 h-20 -rotate-90">
            <circle cx="18" cy="18" r="15.9" fill="none" stroke={darkMode ? '#374151' : '#E5E7EB'} strokeWidth="3" />
            <circle cx="18" cy="18" r="15.9" fill="none" stroke={color} strokeWidth="3"
              strokeDasharray={`${score} ${100 - score}`} strokeLinecap="round" />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-lg font-bold" style={{ color }}>{score}</span>
          </div>
        </div>
        <div>
          <div className="text-2xl font-bold" style={{ color }}>{label}</div>
          <div className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Overall fleet health</div>
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { darkMode } = useOutletContext();
  const { org } = useAuth();
  const [stats, setStats] = useState({ devices: 0, alerts: 0, online: 0, score: 85 });
  const [recentAlerts, setRecentAlerts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const [devicesRes, alertsRes] = await Promise.all([
          api.get('/api/v1/devices').catch(() => ({ data: { meta: { total: 0 }, data: [] } })),
          api.get('/api/v1/alerts').catch(() => ({ data: { data: [] } })),
        ]);
        setStats({
          devices: devicesRes.data.meta?.total || 0,
          alerts: alertsRes.data.data?.filter(a => !a.resolved).length || 0,
          online: devicesRes.data.data?.filter(d => d.status === 'online').length || 0,
          score: 85,
        });
        setRecentAlerts(alertsRes.data.data?.slice(0, 5) || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
          Good morning 👋
        </h1>
        <p className={`mt-1 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
          Here's what's happening with {org?.name || 'your fleet'} today.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <SecurityScore score={stats.score} darkMode={darkMode} />
        <StatCard title="Total Devices" value={stats.devices} subtitle="Managed endpoints" color={darkMode ? 'text-white' : 'text-gray-900'} darkMode={darkMode} />
        <StatCard title="Online Now" value={stats.online} subtitle="Active devices" color="text-green-500" darkMode={darkMode} />
        <StatCard title="Open Alerts" value={stats.alerts} subtitle="Require attention" color={stats.alerts > 0 ? 'text-red-500' : 'text-green-500'} darkMode={darkMode} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className={`rounded-xl border p-6 ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
          <h2 className={`text-base font-semibold mb-4 ${darkMode ? 'text-white' : 'text-gray-900'}`}>Recent Alerts</h2>
          {recentAlerts.length === 0 ? (
            <div className="text-center py-8">
              <div className="text-4xl mb-2">✅</div>
              <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>No alerts — your fleet looks healthy!</p>
            </div>
          ) : (
            <div className="space-y-3">
              {recentAlerts.map(alert => (
                <div key={alert.id} className={`flex items-start gap-3 p-3 rounded-lg ${darkMode ? 'bg-gray-700' : 'bg-gray-50'}`}>
                  <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                    alert.severity === 'critical' ? 'bg-red-100 text-red-700' :
                    alert.severity === 'high' ? 'bg-orange-100 text-orange-700' :
                    'bg-yellow-100 text-yellow-700'
                  }`}>{alert.severity}</span>
                  <p className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>{alert.message}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className={`rounded-xl border p-6 ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
          <h2 className={`text-base font-semibold mb-4 ${darkMode ? 'text-white' : 'text-gray-900'}`}>Quick Actions</h2>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Add Device', icon: '💻', href: '/devices' },
              { label: 'View Alerts', icon: '🔔', href: '/ale
