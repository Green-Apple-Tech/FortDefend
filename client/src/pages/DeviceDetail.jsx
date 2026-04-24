import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { Button, Card, Input } from '../components/ui';

function getLastSeen(d) {
  return d?.lastSeen || d?.last_seen || null;
}

function normalizeOs(d) {
  const o = String(d?.os || '').toLowerCase();
  if (o.includes('windows')) return 'windows';
  if (o.includes('chrome')) return 'chromeos';
  if (o.includes('android')) return 'android';
  if (o.includes('ipados') || o.includes('ipad')) return 'ipados';
  if (o.includes('ios') || o === 'iphone') return 'ios';
  return o || 'other';
}

function deviceHeaderEmoji(d) {
  const model = String(d?.model || d?.hardware_model || '').toLowerCase();
  if (model.includes('mac') || model.includes('book')) return '🖥️';
  const n = normalizeOs(d);
  if (n === 'android' || n === 'ios' || n === 'ipados') return '📱';
  return '💻';
}

function getPendingPatchCount(d) {
  if (d?.pending_patches == null) return null;
  if (typeof d.pending_patches === 'number') return d.pending_patches;
  if (Array.isArray(d.pending_patches)) return d.pending_patches.length;
  return null;
}

function formatRelative(iso) {
  if (!iso) return '—';
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return '—';
  const sec = Math.floor((Date.now() - t.getTime()) / 1000);
  if (sec < 60) return 'just now';
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function DeviceDetail() {
  const { id } = useParams();
  const [tab, setTab] = useState('status');
  const [loading, setLoading] = useState(true);
  const [row, setRow] = useState(null);
  const [detail, setDetail] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [apps, setApps] = useState([]);
  const [scripts, setScripts] = useState([]);
  const [auditEvents, setAuditEvents] = useState([]);
  const [notes, setNotes] = useState('');
  const [appSearch, setAppSearch] = useState('');
  const [toast, setToast] = useState('');
  const [editingUser, setEditingUser] = useState(false);
  const [userDraft, setUserDraft] = useState('');
  const [editingAsset, setEditingAsset] = useState(false);
  const [assetDraft, setAssetDraft] = useState('');
  const [savingField, setSavingField] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [fleet, dres] = await Promise.all([
        api('/api/integrations/devices').catch(() => ({ devices: [] })),
        api(`/api/devices/${encodeURIComponent(id)}`).catch(() => null),
      ]);
      const list = Array.isArray(fleet?.devices) ? fleet.devices : [];
      const merged = list.find((x) => String(x.id) === String(id)) || null;
      setRow(merged);
      if (dres?.device) {
        setDetail(dres.device);
        setAlerts(Array.isArray(dres.alerts) ? dres.alerts : []);
      } else {
        setDetail(null);
        setAlerts([]);
      }
      const [appsRes, scr, auditRes] = await Promise.all([
        api(`/api/devices/${encodeURIComponent(id)}/apps`).catch(() => ({ applications: [] })),
        api(`/api/devices/${encodeURIComponent(id)}/script-history`).catch(() => ({ history: [] })),
        api(`/api/orgs/me/activity?device_id=${encodeURIComponent(id)}&limit=60`).catch(() => ({ entries: [] })),
      ]);
      setApps(Array.isArray(appsRes?.applications) ? appsRes.applications : []);
      setScripts(Array.isArray(scr?.history) ? scr.history : []);
      setAuditEvents(Array.isArray(auditRes?.entries) ? auditRes.entries : []);
    } catch {
      setRow(null);
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(`fortdefend_device_notes_${id}`);
      setNotes(raw || '');
    } catch {
      setNotes('');
    }
  }, [id]);

  /** Fleet row first, then DB detail overwrites so saved fields (assigned_user, asset_tag) are not cleared by integration payloads missing those keys. */
  const device = useMemo(() => ({ ...(row || {}), ...(detail || {}) }), [detail, row]);

  const displayUser =
    (device.assigned_user && String(device.assigned_user).trim()) ||
    (device.logged_in_user && String(device.logged_in_user).trim()) ||
    device.email ||
    device.user ||
    '';

  const activityTimeline = useMemo(() => {
    const items = [];
    for (const e of auditEvents) {
      const ch =
        e.details && typeof e.details === 'object' && Array.isArray(e.details.changes) ? e.details.changes.join(', ') : '';
      const parts = [e.actor_email, e.resource, ch].filter(Boolean);
      items.push({
        key: `a-${e.id}`,
        at: e.created_at,
        tone: 'slate',
        title: String(e.action || 'Event').replace(/_/g, ' '),
        sub: parts.length ? parts.join(' · ') : null,
      });
    }
    for (const a of alerts) {
      items.push({
        key: `al-${a.id}`,
        at: a.created_at,
        tone: 'amber',
        title: a.type || 'Alert',
        sub: a.message || null,
      });
    }
    for (const s of scripts) {
      items.push({
        key: `s-${s.id}`,
        at: s.completed_at || s.created_at,
        tone: 'brand',
        title: (s.command_payload && s.command_payload.scriptName) || 'Script run',
        sub: s.status || null,
      });
    }
    items.sort((x, y) => new Date(y.at || 0).getTime() - new Date(x.at || 0).getTime());
    return items;
  }, [auditEvents, alerts, scripts]);

  async function saveAssignedUser() {
    if (!id) return;
    setSavingField(true);
    setToast('');
    try {
      await api(`/api/devices/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: { assigned_user: userDraft.trim() || null },
      });
      setEditingUser(false);
      setToast('User assignment saved.');
      await load();
    } catch (e) {
      setToast(e.message || 'Save failed');
    } finally {
      setSavingField(false);
      setTimeout(() => setToast(''), 2500);
    }
  }

  async function saveAssetTag() {
    if (!id) return;
    setSavingField(true);
    setToast('');
    try {
      await api(`/api/devices/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: { asset_tag: assetDraft.trim() || null },
      });
      setEditingAsset(false);
      setToast('Asset tag saved.');
      await load();
    } catch (e) {
      setToast(e.message || 'Save failed');
    } finally {
      setSavingField(false);
      setTimeout(() => setToast(''), 2500);
    }
  }

  const pending = getPendingPatchCount(device);
  const hasOpenAlerts = (device?.alerts?.length || 0) > 0 || alerts.length > 0;
  const critical = (alerts || []).some((a) => String(a.severity).toLowerCase() === 'critical');

  const filteredApps = useMemo(() => {
    const q = appSearch.trim().toLowerCase();
    if (!q) return apps;
    return apps.filter((a) => String(a.app_name || '').toLowerCase().includes(q));
  }, [apps, appSearch]);

  const saveNotes = () => {
    try {
      localStorage.setItem(`fortdefend_device_notes_${id}`, notes);
      setToast('Notes saved.');
      setTimeout(() => setToast(''), 2000);
    } catch {
      setToast('Could not save notes.');
    }
  };

  if (loading) {
    return <p className="p-6 text-sm text-slate-500">Loading device…</p>;
  }
  if (!device || !device.id) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-slate-600">Device not found.</p>
        <Link to="/devices" className="text-sm font-medium text-brand">
          ← Devices
        </Link>
      </div>
    );
  }

  const tabs = [
    { id: 'status', label: 'Status' },
    { id: 'activity', label: 'Activity' },
    { id: 'details', label: 'Details' },
    { id: 'notes', label: 'Notes' },
    { id: 'applications', label: 'Applications' },
  ];

  return (
    <div className="space-y-4">
      <Link to="/devices" className="text-sm font-medium text-brand hover:underline">
        ← Devices
      </Link>

      <header className="rounded-xl border border-fds-border bg-fds-card p-5 shadow-sm">
        <div className="flex flex-wrap items-start gap-4">
          <div className="text-5xl" aria-hidden>
            {deviceHeaderEmoji(device)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">{device.name || device.id}</h1>
              {hasOpenAlerts || critical ? (
                <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800 dark:bg-red-950/50 dark:text-red-200">
                  Alert
                </span>
              ) : null}
            </div>
            <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <dt className="text-slate-500">Model</dt>
                <dd className="font-medium text-slate-900 dark:text-slate-100">{device.model || device.hardware_model || '—'}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Serial</dt>
                <dd className="font-medium text-slate-900 dark:text-slate-100">{device.serial || '—'}</dd>
              </div>
              <div>
                <dt className="text-slate-500">OS</dt>
                <dd className="font-medium text-slate-900 dark:text-slate-100">{device.os || '—'}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Last check-in</dt>
                <dd className="font-medium text-slate-900 dark:text-slate-100">{formatRelative(getLastSeen(device))}</dd>
              </div>
              <div className="sm:col-span-2 lg:col-span-1">
                <div className="flex items-start gap-1">
                  <div className="min-w-0 flex-1">
                    <dt className="text-slate-500">User</dt>
                    {!editingUser ? (
                      <dd className="font-medium text-slate-900 dark:text-slate-100">{displayUser || '—'}</dd>
                    ) : (
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <input
                          type="text"
                          value={userDraft}
                          onChange={(e) => setUserDraft(e.target.value)}
                          placeholder="Assigned user (display name or UPN)"
                          className="min-w-[12rem] flex-1 rounded-lg border border-fds-border bg-fds-card px-2 py-1.5 text-sm text-slate-900 dark:text-slate-100"
                        />
                        <Button type="button" className="px-3 py-1.5 text-xs" disabled={savingField} onClick={saveAssignedUser}>
                          Save
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          className="px-3 py-1.5 text-xs"
                          disabled={savingField}
                          onClick={() => setEditingUser(false)}
                        >
                          Cancel
                        </Button>
                      </div>
                    )}
                  </div>
                  {!editingUser ? (
                    <button
                      type="button"
                      className="mt-5 shrink-0 text-slate-400 hover:text-brand"
                      title="Edit assigned user"
                      onClick={() => {
                        setUserDraft(device.assigned_user ?? device.logged_in_user ?? '');
                        setEditingUser(true);
                        setEditingAsset(false);
                      }}
                    >
                      ✎
                    </button>
                  ) : null}
                </div>
                {device.assigned_user && device.logged_in_user && device.assigned_user !== device.logged_in_user ? (
                  <p className="mt-1 text-xs text-slate-500">Sign-in user: {device.logged_in_user}</p>
                ) : null}
              </div>
              <div>
                <div className="flex items-start gap-1">
                  <div className="min-w-0 flex-1">
                    <dt className="text-slate-500">Asset tag</dt>
                    {!editingAsset ? (
                      <dd className="font-medium text-slate-900 dark:text-slate-100">{device.asset_tag || '—'}</dd>
                    ) : (
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <input
                          type="text"
                          value={assetDraft}
                          onChange={(e) => setAssetDraft(e.target.value)}
                          placeholder="Asset tag"
                          className="min-w-[8rem] flex-1 rounded-lg border border-fds-border bg-fds-card px-2 py-1.5 text-sm text-slate-900 dark:text-slate-100"
                        />
                        <Button type="button" className="px-3 py-1.5 text-xs" disabled={savingField} onClick={saveAssetTag}>
                          Save
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          className="px-3 py-1.5 text-xs"
                          disabled={savingField}
                          onClick={() => setEditingAsset(false)}
                        >
                          Cancel
                        </Button>
                      </div>
                    )}
                  </div>
                  {!editingAsset ? (
                    <button
                      type="button"
                      className="mt-5 shrink-0 text-slate-400 hover:text-brand"
                      title="Edit asset tag"
                      onClick={() => {
                        setAssetDraft(device.asset_tag ?? '');
                        setEditingAsset(true);
                        setEditingUser(false);
                      }}
                    >
                      ✎
                    </button>
                  ) : null}
                </div>
              </div>
              <div>
                <dt className="text-slate-500">Blueprint</dt>
                <dd className="font-medium text-slate-900 dark:text-slate-100">{device.group_name || '—'}</dd>
              </div>
            </dl>
          </div>
        </div>
      </header>

      <div className="flex flex-wrap gap-1 border-b border-fds-border">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-t-md px-4 py-2 text-sm font-medium ${
              tab === t.id ? 'bg-fds-card text-brand shadow-sm ring-1 ring-fds-border ring-b-0' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'status' && (
        <div className="space-y-4">
          <Card className="border-fds-border p-5">
            <h2 className="text-sm font-bold uppercase tracking-wide text-brand">Patch management</h2>
            <div className="mt-3 space-y-2 text-sm text-slate-700 dark:text-slate-200">
              <p>
                <span className="font-medium">OS updates:</span>{' '}
                {pending == null ? 'Unknown' : pending === 0 ? 'Up to date' : `${pending} pending`}
              </p>
              <p>
                <span className="font-medium">Auto-update:</span> Configure in the device&apos;s Blueprint (patching section).
              </p>
              <label className="mt-3 flex items-center gap-2">
                <input type="checkbox" disabled className="rounded border-slate-300" />
                <span className="text-slate-500">Auto-update this device (follows blueprint)</span>
              </label>
            </div>
          </Card>
          <Card className="border-fds-border p-5">
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">Installed apps</h2>
            <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto text-sm">
              {apps.slice(0, 12).map((a, i) => (
                <li key={i} className="flex items-center justify-between gap-2 border-b border-fds-border py-1 last:border-0">
                  <span className="truncate">{a.app_name || a.winget_id || 'App'}</span>
                  <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" title="OK" />
                </li>
              ))}
              {apps.length === 0 && <li className="text-slate-500">No inventory yet.</li>}
            </ul>
          </Card>
          <Card className="border-fds-border p-5">
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">Custom scripts</h2>
            <ul className="mt-2 text-sm text-slate-600">
              {scripts.slice(0, 8).map((s) => (
                <li key={s.id} className="border-b border-fds-border py-1">
                  {(s.command_payload && s.command_payload.scriptName) || 'Script'} — {s.status} —{' '}
                  {s.completed_at ? formatRelative(s.completed_at) : formatRelative(s.created_at)}
                </li>
              ))}
              {scripts.length === 0 && <li className="text-slate-500">No script runs recorded.</li>}
            </ul>
          </Card>
          <Card className="border-fds-border p-5">
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">Reboot policy</h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Inherited from Blueprint. Configure under Blueprints → this device&apos;s group.</p>
          </Card>
          <Card className="border-fds-border p-5">
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">Screen saver / Lock</h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Policy status will appear here when MDM integration exposes it.</p>
          </Card>
        </div>
      )}

      {tab === 'activity' && (
        <Card className="border-fds-border p-5">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-50">Timeline</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {activityTimeline.map((item) => {
              const border =
                item.tone === 'amber'
                  ? 'border-amber-400'
                  : item.tone === 'brand'
                    ? 'border-brand'
                    : 'border-slate-300 dark:border-slate-600';
              return (
                <li key={item.key} className={`border-l-2 pl-3 ${border}`}>
                  <span className="font-medium capitalize text-slate-800 dark:text-slate-100">{item.title}</span>
                  <span className="text-slate-500"> · {formatRelative(item.at)}</span>
                  {item.sub ? <p className="mt-0.5 text-slate-600 dark:text-slate-300">{item.sub}</p> : null}
                </li>
              );
            })}
            {activityTimeline.length === 0 && <li className="text-slate-500">No activity yet.</li>}
          </ul>
        </Card>
      )}

      {tab === 'details' && (
        <Card className="border-fds-border p-5">
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            {[
              ['CPU', device.cpu_model || device.cpuModel || '—'],
              ['RAM', device.ram_total_gb != null ? `${device.ram_total_gb} GB` : '—'],
              ['Disk free', device.disk_free_gb != null ? `${Number(device.disk_free_gb).toFixed(1)} GB` : '—'],
              ['Hostname', device.hostname || '—'],
              ['IP', device.ip_address || '—'],
              ['Agent version', device.agent_version || '—'],
              ['Compliance', device.compliance || '—'],
              ['Security score', device.security_score ?? '—'],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="text-slate-500">{k}</dt>
                <dd className="font-medium text-slate-900 dark:text-slate-100">{v}</dd>
              </div>
            ))}
          </dl>
        </Card>
      )}

      {tab === 'notes' && (
        <Card className="border-fds-border space-y-3 p-5">
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={8}
            className="w-full rounded-lg border border-fds-border bg-fds-card px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
            placeholder="Free-form notes for this device…"
          />
          <Button type="button" onClick={saveNotes}>
            Save notes
          </Button>
        </Card>
      )}

      {tab === 'applications' && (
        <Card className="border-fds-border p-5">
          <input
            type="search"
            placeholder="Search applications…"
            value={appSearch}
            onChange={(e) => setAppSearch(e.target.value)}
            className="mb-4 w-full max-w-md rounded-lg border border-fds-border bg-fds-card px-3 py-2 text-sm"
          />
          <div className="max-h-[480px] overflow-y-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-fds-border text-left text-xs uppercase text-slate-500">
                  <th className="py-2 pr-2">App</th>
                  <th className="py-2 pr-2">Version</th>
                  <th className="py-2">Updated</th>
                </tr>
              </thead>
              <tbody>
                {filteredApps.map((a, i) => (
                  <tr key={i} className="border-b border-fds-border">
                    <td className="py-2 pr-2">{a.app_name || a.winget_id}</td>
                    <td className="py-2 pr-2">{a.installed_version || '—'}</td>
                    <td className="py-2">{a.last_scanned_at ? formatRelative(a.last_scanned_at) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredApps.length === 0 && <p className="py-4 text-slate-500">No applications match.</p>}
          </div>
        </Card>
      )}

      {toast && <div className="fixed bottom-4 right-4 z-[60] rounded-lg bg-slate-900 px-4 py-2 text-sm text-white shadow-lg">{toast}</div>}
    </div>
  );
}
