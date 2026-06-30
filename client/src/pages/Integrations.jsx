import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Card, Button, Input } from '../components/ui';
import { SectionHeader } from '../components/fds';

export default function Integrations() {
  const [status, setStatus] = useState(null);
  const [intune, setIntune] = useState({ tenantId: '', clientId: '', clientSecret: '' });
  const [msg, setMsg] = useState('');

  async function refresh() {
    try {
      const response = await api('/api/integrations/status');
      setStatus(response);
    } catch {
      setStatus(null);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function connectIntune(event) {
    event.preventDefault();
    setMsg('');
    try {
      await api('/api/integrations/intune/connect', {
        method: 'POST',
        body: intune,
      });
      setMsg('Intune connected.');
      setIntune({ tenantId: '', clientId: '', clientSecret: '' });
      refresh();
    } catch (err) {
      setMsg(err.message || 'Intune connect failed');
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <SectionHeader
        title="Integrations"
        description="Connect Microsoft Intune for optional Windows PC inventory, sync, and reboot actions."
      />

      {msg && <div className="rounded-lg bg-brand-light px-3 py-2 text-sm text-brand">{msg}</div>}

      {status && (
        <Card>
          <h2 className="font-semibold text-gray-900">Status</h2>
          <ul className="mt-3 space-y-2 text-sm text-gray-700">
            <li>Intune: {status.intune?.configured ? 'configured' : 'not configured'} (enabled: {String(!!status.intune?.enabled)})</li>
          </ul>
        </Card>
      )}

      <Card>
        <h2 className="text-lg font-semibold text-gray-900">Microsoft Intune</h2>
        <p className="mt-1 text-sm text-gray-600">
          Optional Microsoft Graph client credentials. The local FortDefend Windows agent does not require Intune.
        </p>
        <form onSubmit={connectIntune} className="mt-4 space-y-3">
          <Input label="Tenant ID" value={intune.tenantId} onChange={(e) => setIntune({ ...intune, tenantId: e.target.value })} required />
          <Input label="Client ID" value={intune.clientId} onChange={(e) => setIntune({ ...intune, clientId: e.target.value })} required />
          <Input
            label="Client secret"
            type="password"
            value={intune.clientSecret}
            onChange={(e) => setIntune({ ...intune, clientSecret: e.target.value })}
            required
          />
          <Button type="submit">Connect Intune</Button>
        </form>
      </Card>
    </div>
  );
}
