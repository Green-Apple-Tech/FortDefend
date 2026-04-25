import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { Card, Spinner } from '../components/ui';
import { SectionHeader } from '../components/fds';

export default function MspOverview() {
  const { user, isLoading } = useAuth();
  const [overview, setOverview] = useState({ clients: 0, totalDevices: 0, totalAlerts: 0, patchesToday: 0 });
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (isLoading || user?.role !== 'msp') return;
      setLoading(true);
      setError('');
      try {
        const [ov, list] = await Promise.all([api('/api/msp/overview'), api('/api/msp/clients')]);
        if (!cancelled) {
          setOverview(ov || { clients: 0, totalDevices: 0, totalAlerts: 0, patchesToday: 0 });
          setClients(Array.isArray(list?.clients) ? list.clients : []);
        }
      } catch (e) {
        if (!cancelled) setError(e.message || 'Failed to load MSP overview.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isLoading, user?.role]);

  const patchCompliance = useMemo(() => {
    const totalDevices = Number(overview.totalDevices) || 0;
    const activeAlerts = Number(overview.totalAlerts) || 0;
    if (!totalDevices) return 0;
    const pct = Math.max(0, Math.min(100, Math.round(((totalDevices - Math.min(activeAlerts, totalDevices)) / totalDevices) * 100)));
    return pct;
  }, [overview.totalDevices, overview.totalAlerts]);

  const criticalClients = clients.filter((c) => Number(c?.activeAlerts || 0) >= 5);

  if (isLoading) return <Spinner />;
  if (!user) return null;
  if (user.role !== 'msp') return <Card><p className="text-sm text-gray-600">MSP overview is only available for MSP users.</p></Card>;

  return (
    <div className="space-y-6">
      <SectionHeader
        title="MSP overview"
        description="Aggregate security posture across all managed clients."
      />

      {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card><p className="text-sm text-gray-500">Total clients</p><p className="mt-2 text-3xl font-bold text-brand">{overview.clients || 0}</p></Card>
        <Card><p className="text-sm text-gray-500">Total devices managed</p><p className="mt-2 text-3xl font-bold">{overview.totalDevices || 0}</p></Card>
        <Card><p className="text-sm text-gray-500">Total active alerts</p><p className="mt-2 text-3xl font-bold text-amber-600">{overview.totalAlerts || 0}</p></Card>
        <Card><p className="text-sm text-gray-500">Patch compliance</p><p className="mt-2 text-3xl font-bold">{patchCompliance}%</p></Card>
      </div>

      <Card>
        <h2 className="font-semibold text-gray-900">Clients with critical issues</h2>
        {loading ? (
          <Spinner />
        ) : criticalClients.length === 0 ? (
          <p className="mt-3 text-sm text-gray-600">No critical client issues detected.</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {criticalClients.map((client) => (
              <li key={client.id} className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                <span className="font-semibold">{client.name}</span> has {client.activeAlerts} active alerts.
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
