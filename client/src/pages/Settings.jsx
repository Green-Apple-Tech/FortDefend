import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { Card, Button, Input } from '../components/ui';

export default function Settings() {
  const [orgName, setOrgName] = useState('');
  const [cpu, setCpu] = useState(90);
  const [diskGb, setDiskGb] = useState(5);
  const [scanCron, setScanCron] = useState('0 2 * * *');
  const [slack, setSlack] = useState('');
  const [teams, setTeams] = useState('');
  const [emailAlerts, setEmailAlerts] = useState(true);
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const org = await api('/api/orgs/me');
        if (!cancelled && org?.name) setOrgName(org.name);
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function saveOrg(e) {
    e.preventDefault();
    setMsg('');
    try {
      await api('/api/orgs/me', { method: 'PATCH', body: { name: orgName } });
      setMsg('Organization updated.');
    } catch (err) {
      setMsg(err.message || 'Save failed');
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-600">Schedules, thresholds, 2FA, team, and integrations.</p>
      </div>

      {msg && <div className="rounded-lg bg-brand-light px-3 py-2 text-sm text-brand">{msg}</div>}

      <Card>
        <h2 className="font-semibold text-gray-900">Organization</h2>
        <form onSubmit={saveOrg} className="mt-4 space-y-4">
          <Input label="Organization name" value={orgName} onChange={(e) => setOrgName(e.target.value)} />
          <Button type="submit" disabled={loading}>
            Save
          </Button>
        </form>
      </Card>

      <Card>
        <h2 className="font-semibold text-gray-900">Scan schedule</h2>
        <p className="mt-1 text-sm text-gray-600">Cron expression for fleet scans (stored client-side until API persists).</p>
        <Input className="mt-3" label="Cron" value={scanCron} onChange={(e) => setScanCron(e.target.value)} />
      </Card>

      <Card>
        <h2 className="font-semibold text-gray-900">Alert thresholds</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Input label="CPU warn %" type="number" value={cpu} onChange={(e) => setCpu(Number(e.target.value))} />
          <Input label="Min free disk (GB)" type="number" value={diskGb} onChange={(e) => setDiskGb(Number(e.target.value))} />
        </div>
        <p className="mt-2 text-xs text-gray-500">Agent will use these when reporting (requires agent config sync).</p>
      </Card>

      <Card>
        <h2 className="font-semibold text-gray-900">Two-factor authentication</h2>
        <p className="mt-1 text-sm text-gray-600">Manage 2FA from the dedicated setup page.</p>
        <Link to="/setup-2fa" className="mt-3 inline-block text-sm font-medium text-brand hover:underline">
          Open 2FA setup →
        </Link>
      </Card>

      <Card>
        <h2 className="font-semibold text-gray-900">Team</h2>
        <p className="mt-1 text-sm text-gray-600">Invite and manage users in the FortDefend API (`POST /api/orgs/invite`).</p>
      </Card>

      <Card>
        <h2 className="font-semibold text-gray-900">Notifications</h2>
        <p className="mt-1 text-sm text-gray-600">Slack / Teams webhooks (extend `PATCH` on org integrations to persist).</p>
        <div className="mt-4 space-y-3">
          <Input label="Slack webhook URL" value={slack} onChange={(e) => setSlack(e.target.value)} placeholder="https://hooks.slack.com/..." />
          <Input label="Teams webhook URL" value={teams} onChange={(e) => setTeams(e.target.value)} />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={emailAlerts} onChange={(e) => setEmailAlerts(e.target.checked)} />
            Email alerts enabled
          </label>
          <Button type="button" variant="outline" onClick={() => setMsg('Webhook save API not wired yet.')}>
            Save notifications
          </Button>
        </div>
      </Card>

      <Card>
        <h2 className="font-semibold text-gray-900">Integrations</h2>
        <p className="mt-1 text-sm text-gray-600">Connect Intune and Google Admin from the Integrations page.</p>
        <Link to="/integrations" className="mt-2 inline-block text-sm font-medium text-brand hover:underline">
          Open integrations →
        </Link>
      </Card>
    </div>
  );
}
