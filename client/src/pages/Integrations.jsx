import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Card, Button, Input } from '../components/ui';
import { SectionHeader } from '../components/fds';

export default function Integrations() {
  const [status, setStatus] = useState(null);
  const [intune, setIntune] = useState({ tenantId: '', clientId: '', clientSecret: '' });
  const [google, setGoogle] = useState({ adminEmail: '', customerId: 'my_customer', serviceAccountJson: '' });
  const [msg, setMsg] = useState('');

  async function refresh() {
    try {
      const s = await api('/api/integrations/status');
      setStatus(s);
    } catch {
      setStatus(null);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function connectIntune(e) {
    e.preventDefault();
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

  async function connectGoogle(e) {
    e.preventDefault();
    setMsg('');
    try {
      let json = google.serviceAccountJson;
      try {
        json = JSON.parse(json);
      } catch {
        setMsg('Service account must be valid JSON.');
        return;
      }
      await api('/api/integrations/google/connect', {
        method: 'POST',
        body: {
          adminEmail: google.adminEmail,
          customerId: google.customerId || undefined,
          serviceAccountJson: json,
        },
      });
      setMsg('Google Admin connected.');
      setGoogle({ adminEmail: '', customerId: 'my_customer', serviceAccountJson: '' });
      refresh();
    } catch (err) {
      setMsg(err.message || 'Google connect failed');
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <SectionHeader
        title="Integrations"
        description="Connect Microsoft Intune and Google Admin so FortDefend can inventory and monitor your fleet."
      />

      {msg && <div className="rounded-lg bg-brand-light px-3 py-2 text-sm text-brand">{msg}</div>}

      {status && (
        <Card>
          <h2 className="font-semibold text-gray-900">Status</h2>
          <ul className="mt-3 space-y-2 text-sm text-gray-700">
            <li>Intune: {status.intune?.configured ? 'configured' : 'not configured'} (enabled: {String(!!status.intune?.enabled)})</li>
            <li>Google: {status.google?.configured ? 'configured' : 'not configured'} (enabled: {String(!!status.google?.enabled)})</li>
            <li>Google Mobile Devices: {status.google?.mobileDeviceCount ?? 0}</li>
          </ul>
        </Card>
      )}

      <Card>
        <h2 className="text-lg font-semibold text-gray-900">Microsoft Intune</h2>
        <p className="mt-1 text-sm text-gray-600">App registration: client credentials to Microsoft Graph. Secrets are encrypted server-side.</p>
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

      <Card>
        <h2 className="text-lg font-semibold text-gray-900">Google Admin</h2>
        <p className="mt-1 text-sm text-gray-600">Domain-wide delegation service account JSON + admin email to impersonate.</p>
        <p className="mt-1 text-xs text-gray-500">
          Required delegated scopes: <code>admin.directory.device.chromeos</code>, <code>admin.directory.device.mobile.readonly</code>, and <code>admin.directory.orgunit</code>.
        </p>
        <form onSubmit={connectGoogle} className="mt-4 space-y-3">
          <Input
            label="Admin email"
            type="email"
            value={google.adminEmail}
            onChange={(e) => setGoogle({ ...google, adminEmail: e.target.value })}
            required
          />
          <Input
            label="Customer ID (optional)"
            value={google.customerId}
            onChange={(e) => setGoogle({ ...google, customerId: e.target.value })}
            placeholder="my_customer"
          />
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">Service account JSON</span>
            <textarea
              className="w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-xs focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
              rows={8}
              value={google.serviceAccountJson}
              onChange={(e) => setGoogle({ ...google, serviceAccountJson: e.target.value })}
              placeholder='{ "type": "service_account", ... }'
              required
            />
          </label>
          <Button type="submit">Connect Google Admin</Button>
        </form>
      </Card>
    </div>
  );
}
