import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, setAccessToken } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { Button, Card, Input, Spinner } from '../components/ui';
import { SectionHeader } from '../components/fds';

export default function MspDashboard() {
  const { user, isLoading, refreshOrg } = useAuth();
  const navigate = useNavigate();
  const [overview, setOverview] = useState({ clients: 0, totalDevices: 0, totalAlerts: 0, patchesToday: 0 });
  const [clients, setClients] = useState([]);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [ov, list] = await Promise.all([api('/api/msp/overview'), api('/api/msp/clients')]);
      setOverview(ov || { clients: 0, totalDevices: 0, totalAlerts: 0, patchesToday: 0 });
      setClients(Array.isArray(list?.clients) ? list.clients : []);
    } catch (e) {
      setError(e.message || 'Failed to load MSP dashboard.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!isLoading && user?.role === 'msp') load();
  }, [isLoading, user?.role]);

  async function onCreate(e) {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      await api('/api/msp/clients', { method: 'POST', body: { name } });
      setName('');
      await load();
    } catch (e) {
      setError(e.message || 'Failed to create client.');
    }
  }

  async function onSwitch(clientOrgId) {
    try {
      const res = await api(`/api/msp/switch/${clientOrgId}`, { method: 'POST' });
      if (res?.accessToken) {
        setAccessToken(res.accessToken);
        await refreshOrg();
        navigate('/dashboard');
      }
    } catch (e) {
      setError(e.message || 'Failed to switch context.');
    }
  }

  if (isLoading) return <Spinner />;
  if (!user) return null;
  if (user.role !== 'msp') {
    return (
      <Card>
        <h1 className="text-xl font-semibold text-gray-900">MSP Dashboard</h1>
        <p className="mt-2 text-sm text-gray-600">This area is available only to MSP users.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <SectionHeader
          className="mb-0"
          title="MSP dashboard"
          description="Multi-tenant security view across all your managed clients."
        />
        <Button onClick={() => document.getElementById('add-client-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
          Add New Client
        </Button>
      </div>

      {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card><p className="text-sm text-gray-500">Clients</p><p className="mt-2 text-3xl font-bold text-brand">{overview.clients || 0}</p></Card>
        <Card><p className="text-sm text-gray-500">Total devices</p><p className="mt-2 text-3xl font-bold">{overview.totalDevices || 0}</p></Card>
        <Card><p className="text-sm text-gray-500">Active alerts</p><p className="mt-2 text-3xl font-bold text-amber-600">{overview.totalAlerts || 0}</p></Card>
        <Card><p className="text-sm text-gray-500">Overall patch compliance</p><p className="mt-2 text-3xl font-bold text-emerald-600">{Math.max(0, Math.min(100, 100 - (overview.totalAlerts || 0)))}%</p></Card>
      </div>

      <Card>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">Managed Clients</h2>
        </div>
        {loading ? (
          <Spinner />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-3 py-2">Client name</th>
                  <th className="px-3 py-2">Devices</th>
                  <th className="px-3 py-2">Security Score</th>
                  <th className="px-3 py-2">Active alerts</th>
                  <th className="px-3 py-2">Last seen</th>
                  <th className="px-3 py-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {clients.map((c) => (
                  <tr
                    key={c.id}
                    className={`border-t ${
                      (c.activeAlerts || 0) >= 5 ? 'border-red-200 bg-red-50' : (c.activeAlerts || 0) >= 1 ? 'border-amber-200 bg-amber-50' : 'border-emerald-200 bg-emerald-50'
                    }`}
                  >
                    <td className="px-3 py-2 font-medium text-gray-900">{c.name}</td>
                    <td className="px-3 py-2">{c.devices ?? 0}</td>
                    <td className="px-3 py-2">{c.securityScore ?? 'N/A'}</td>
                    <td className="px-3 py-2">{c.activeAlerts ?? 0}</td>
                    <td className="px-3 py-2">{c.lastSeen ? new Date(c.lastSeen).toLocaleString() : 'Never'}</td>
                    <td className="px-3 py-2">
                      <Button variant="outline" onClick={() => onSwitch(c.id)}>View</Button>
                      <p className="mt-1 text-xs text-gray-600">
                        {(c.activeAlerts || 0) >= 5 ? 'Needs urgent attention' : (c.activeAlerts || 0) >= 1 ? 'Some issues need follow-up' : 'Healthy and stable'}
                      </p>
                    </td>
                  </tr>
                ))}
                {clients.length === 0 && (
                  <tr><td className="px-3 py-4 text-gray-500" colSpan={6}>No client orgs yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card id="add-client-form">
        <h2 className="font-semibold text-gray-900">Add new client</h2>
        <form onSubmit={onCreate} className="mt-4 flex flex-col gap-3 sm:flex-row">
          <Input label="Client organization name" value={name} onChange={(e) => setName(e.target.value)} className="sm:flex-1" />
          <div className="sm:pt-6">
            <Button type="submit">Add new client</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
