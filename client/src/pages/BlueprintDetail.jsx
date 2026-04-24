import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { Button, Card, Input } from '../components/ui';

function parseBlueprintSettings(raw) {
  if (raw == null) return null;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  return typeof raw === 'object' ? raw : null;
}

function findGroup(nodes, id) {
  if (!Array.isArray(nodes)) return null;
  for (const n of nodes) {
    if (n.id === id) return n;
    const sub = findGroup(n.children, id);
    if (sub) return sub;
  }
  return null;
}

export default function BlueprintDetail() {
  const { id } = useParams();
  const [tree, setTree] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState('');
  const [saving, setSaving] = useState(false);
  const [autoOs, setAutoOs] = useState(true);
  const [osSchedule, setOsSchedule] = useState('overnight');
  const [autoApps, setAutoApps] = useState(true);
  const [patchApproval, setPatchApproval] = useState('security');
  const [maintStart, setMaintStart] = useState('02:00');
  const [maintEnd, setMaintEnd] = useState('04:00');
  const [rebootPolicy, setRebootPolicy] = useState('after_patches');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api('/api/groups');
      setTree(Array.isArray(res?.groups) ? res.groups : []);
    } catch {
      setTree([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const group = useMemo(() => findGroup(tree, id), [tree, id]);

  useEffect(() => {
    if (!group) return;
    const b = parseBlueprintSettings(group.blueprint_settings);
    if (b && typeof b === 'object') {
      setAutoOs(b.autoOs !== false);
      setOsSchedule(['immediate', 'overnight', 'weekend'].includes(b.osSchedule) ? b.osSchedule : 'overnight');
      setAutoApps(b.autoApps !== false);
      setPatchApproval(['all', 'security', 'manual'].includes(b.patchApproval) ? b.patchApproval : 'security');
      setMaintStart(typeof b.maintStart === 'string' && b.maintStart ? b.maintStart : '02:00');
      setMaintEnd(typeof b.maintEnd === 'string' && b.maintEnd ? b.maintEnd : '04:00');
      setRebootPolicy(['after_patches', 'window', 'manual'].includes(b.rebootPolicy) ? b.rebootPolicy : 'after_patches');
    } else {
      setAutoOs(true);
      setOsSchedule('overnight');
      setAutoApps(true);
      setPatchApproval('security');
      setMaintStart('02:00');
      setMaintEnd('04:00');
      setRebootPolicy('after_patches');
    }
  }, [group?.id, group?.updated_at]);

  const save = async () => {
    if (!id) return;
    setSaving(true);
    setToast('');
    try {
      await api(`/api/groups/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: {
          blueprint_settings: {
            autoOs,
            osSchedule,
            autoApps,
            patchApproval,
            maintStart,
            maintEnd,
            rebootPolicy,
          },
        },
      });
      setToast('Blueprint saved.');
      await load();
    } catch (e) {
      setToast(e.message || 'Save failed');
    } finally {
      setSaving(false);
      setTimeout(() => setToast(''), 4000);
    }
  };

  if (loading) {
    return <p className="p-6 text-sm text-slate-500">Loading…</p>;
  }
  if (!group) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-slate-600">Blueprint not found.</p>
        <Link to="/blueprints" className="text-sm font-medium text-brand">
          ← Back to Blueprints
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link to="/blueprints" className="text-sm font-medium text-brand hover:underline">
          ← Blueprints
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-50">{group.name}</h1>
        <p className="mt-1 text-sm text-slate-500">
          {group.device_count ?? 0} assigned devices · Patch and deployment policy for this group.
        </p>
      </div>

      <Card className="border-fds-border space-y-4 p-5">
        <h2 className="text-sm font-bold uppercase tracking-wide text-brand">Patching</h2>
        <label className="flex items-center justify-between gap-4 border-b border-fds-border pb-3">
          <div>
            <div className="font-medium text-slate-900 dark:text-slate-100">Auto-update OS</div>
            <div className="text-xs text-slate-500">Install OS updates automatically within the schedule.</div>
          </div>
          <input type="checkbox" className="h-5 w-5" checked={autoOs} onChange={(e) => setAutoOs(e.target.checked)} />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700 dark:text-slate-300">OS update schedule</span>
          <select
            value={osSchedule}
            onChange={(e) => setOsSchedule(e.target.value)}
            className="w-full rounded-lg border border-fds-border bg-fds-card px-3 py-2 text-sm dark:text-slate-100"
          >
            <option value="immediate">Immediate</option>
            <option value="overnight">Overnight</option>
            <option value="weekend">Weekend</option>
          </select>
        </label>
        <label className="flex items-center justify-between gap-4 border-b border-fds-border py-3">
          <div>
            <div className="font-medium text-slate-900 dark:text-slate-100">Auto-update apps</div>
            <div className="text-xs text-slate-500">Keep catalogue apps current on assigned devices.</div>
          </div>
          <input type="checkbox" className="h-5 w-5" checked={autoApps} onChange={(e) => setAutoApps(e.target.checked)} />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700 dark:text-slate-300">Patch approval</span>
          <select
            value={patchApproval}
            onChange={(e) => setPatchApproval(e.target.value)}
            className="w-full rounded-lg border border-fds-border bg-fds-card px-3 py-2 text-sm dark:text-slate-100"
          >
            <option value="all">Auto-approve all</option>
            <option value="security">Auto-approve security only</option>
            <option value="manual">Manual approval</option>
          </select>
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Maintenance window start" value={maintStart} onChange={(e) => setMaintStart(e.target.value)} />
          <Input label="Maintenance window end" value={maintEnd} onChange={(e) => setMaintEnd(e.target.value)} />
        </div>
      </Card>

      <Card className="border-fds-border space-y-2 p-5">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">App deployments</h2>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Manage the app catalogue in <Link className="font-medium text-brand" to="/library">Library</Link>. Assigned installs follow this blueprint’s devices.
        </p>
      </Card>

      <Card className="border-fds-border space-y-2 p-5">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">Scripts</h2>
        <p className="text-sm text-slate-600 dark:text-slate-300">Scheduled scripts for this blueprint will appear here (coming soon).</p>
      </Card>

      <Card className="border-fds-border space-y-3 p-5">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">Reboot policy</h2>
        <select
          value={rebootPolicy}
          onChange={(e) => setRebootPolicy(e.target.value)}
          className="w-full rounded-lg border border-fds-border bg-fds-card px-3 py-2 text-sm dark:text-slate-100"
        >
          <option value="after_patches">Reboot after patches if required</option>
          <option value="window">Reboot only in maintenance window</option>
          <option value="manual">Never auto-reboot</option>
        </select>
      </Card>

      <Button type="button" onClick={save} disabled={saving}>
        {saving ? 'Saving…' : 'Save blueprint'}
      </Button>

      {toast && (
        <div className="fixed bottom-4 right-4 z-[60] rounded-lg bg-slate-900 px-4 py-2 text-sm text-white shadow-lg">{toast}</div>
      )}
    </div>
  );
}
