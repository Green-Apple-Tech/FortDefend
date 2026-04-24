import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { Button, Card, Input } from '../components/ui';

const PAGE_SIZE = 25;

function getLastSeen(d) {
  return d.lastSeen || d.last_seen || null;
}

function deriveStatus(d) {
  const critical = (d.alerts || []).some((a) => String(a.severity).toLowerCase() === 'critical');
  if (critical) return 'alert';
  const last = getLastSeen(d);
  if (!last) return 'offline';
  const ageMin = (Date.now() - new Date(last).getTime()) / 60000;
  if (ageMin <= 5) return 'online';
  if (ageMin <= 60) return 'warning';
  return 'offline';
}

function statusDotClass(status) {
  if (status === 'online') return 'bg-emerald-500';
  if (status === 'warning') return 'bg-amber-500';
  if (status === 'alert') return 'bg-red-500';
  return 'bg-slate-400';
}

function getUserEmail(d) {
  return (
    d.assigned_user ||
    d.email ||
    d.user ||
    d.userEmail ||
    d.user_email ||
    d.logged_in_user ||
    ''
  );
}

function getPendingPatchCount(d) {
  if (d.pending_patches == null) return null;
  if (typeof d.pending_patches === 'number') return d.pending_patches;
  if (Array.isArray(d.pending_patches)) return d.pending_patches.length;
  return null;
}

function patchCell(d) {
  const pending = getPendingPatchCount(d);
  const st = deriveStatus(d);
  const crit = st === 'alert' || (pending != null && pending > 0 && d.security_score != null && Number(d.security_score) < 50);
  if (crit) {
    return (
      <span className="inline-flex items-center justify-center text-lg text-red-600" title="Critical / attention">
        ●
      </span>
    );
  }
  if (pending != null && pending > 0) {
    return (
      <span className="inline-flex items-center justify-center text-lg text-amber-500" title={`${pending} updates`}>
        ●
      </span>
    );
  }
  return (
    <span className="inline-flex items-center justify-center text-lg text-emerald-600" title="Up to date">
      ✓
    </span>
  );
}

function formatCheckin(d) {
  const iso = getLastSeen(d);
  if (!iso) return '—';
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return '—';
  const diffMs = Date.now() - t.getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return 'Just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return t.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function GroupNavRows({ nodes, depth, selectedGroupId, onPick }) {
  if (!Array.isArray(nodes) || !nodes.length) return null;
  return (
    <>
      {nodes.map((g) => (
        <div key={g.id}>
          <button
            type="button"
            onClick={() => onPick(g.id)}
            className={`flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-xs ${
              selectedGroupId === g.id ? 'bg-brand/15 font-semibold text-brand' : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800'
            }`}
            style={{ paddingLeft: `${8 + depth * 12}px` }}
          >
            <span className="min-w-0 truncate">{g.name}</span>
            <span className="shrink-0 tabular-nums text-slate-500">{g.device_count ?? 0}</span>
          </button>
          <GroupNavRows nodes={g.children} depth={depth + 1} selectedGroupId={selectedGroupId} onPick={onPick} />
        </div>
      ))}
    </>
  );
}

export default function Devices() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const view = searchParams.get('view') || 'all';
  const groupId = searchParams.get('group') || '';

  const [rows, setRows] = useState([]);
  const [groupsTree, setGroupsTree] = useState([]);
  const [groupsLoading, setGroupsLoading] = useState(true);
  const [groupFilterIds, setGroupFilterIds] = useState(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [newGroupOpen, setNewGroupOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupSaving, setNewGroupSaving] = useState(false);
  const [toast, setToast] = useState('');

  const loadDevices = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api('/api/integrations/devices');
      let devices = [];
      if (Array.isArray(res?.devices)) devices = res.devices;
      else if (Array.isArray(res)) devices = res;
      setRows(devices);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDevices();
    const t = setInterval(loadDevices, 60_000);
    return () => clearInterval(t);
  }, [loadDevices]);

  useEffect(() => {
    let c = false;
    setGroupsLoading(true);
    api('/api/groups')
      .then((res) => {
        if (!c) setGroupsTree(Array.isArray(res?.groups) ? res.groups : []);
      })
      .catch(() => {
        if (!c) setGroupsTree([]);
      })
      .finally(() => {
        if (!c) setGroupsLoading(false);
      });
    return () => {
      c = true;
    };
  }, []);

  useEffect(() => {
    if (!groupId || groupId === 'ungrouped') {
      setGroupFilterIds(null);
      return;
    }
    let c = false;
    setGroupFilterIds(undefined);
    api(`/api/groups/${encodeURIComponent(groupId)}/devices`)
      .then((data) => {
        if (c) return;
        const ids = (data.devices || []).map((d) => String(d?.id ?? '').trim()).filter(Boolean);
        setGroupFilterIds(new Set(ids));
      })
      .catch(() => {
        if (!c) setGroupFilterIds(new Set());
      });
    return () => {
      c = true;
    };
  }, [groupId]);

  const counts = useMemo(() => {
    const offline = rows.filter((d) => deriveStatus(d) === 'offline').length;
    const withAlerts = rows.filter((d) => (d.alerts && d.alerts.length > 0) || deriveStatus(d) === 'alert').length;
    const noUser = rows.filter((d) => !getUserEmail(d)).length;
    return { all: rows.length, offline, withAlerts, noUser };
  }, [rows]);

  const filtered = useMemo(() => {
    let list = rows;
    if (view === 'offline') list = list.filter((d) => deriveStatus(d) === 'offline');
    else if (view === 'alerts') list = list.filter((d) => (d.alerts && d.alerts.length > 0) || deriveStatus(d) === 'alert');
    else if (view === 'nouser') list = list.filter((d) => !getUserEmail(d));
    if (groupId && groupId !== 'ungrouped') {
      if (!(groupFilterIds instanceof Set) || groupFilterIds.size === 0) list = [];
      else list = list.filter((d) => groupFilterIds.has(String(d.id)));
    } else if (groupId === 'ungrouped') {
      list = list.filter((d) => !d.group_id && !d.group_name);
    }
    const needle = q.trim().toLowerCase();
    if (needle) {
      list = list.filter((d) => {
        const hay = `${d.name || ''} ${d.serial || ''} ${d.id || ''} ${getUserEmail(d)}`.toLowerCase();
        return hay.includes(needle);
      });
    }
    return list;
  }, [rows, view, groupId, groupFilterIds, q]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const pageItems = filtered.slice(pageStart, pageStart + PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [view, groupId, q]);

  const setView = (next) => {
    setSearchParams(
      (prev) => {
        const n = new URLSearchParams(prev);
        n.delete('group');
        if (next === 'all') n.delete('view');
        else n.set('view', next);
        return n;
      },
      { replace: true },
    );
  };

  const pickGroup = (id) => {
    setSearchParams(
      (prev) => {
        const n = new URLSearchParams(prev);
        n.delete('view');
        n.set('group', id);
        return n;
      },
      { replace: true },
    );
  };

  const clearGroup = () => {
    setSearchParams(
      (prev) => {
        const n = new URLSearchParams(prev);
        n.delete('group');
        n.delete('view');
        return n;
      },
      { replace: true },
    );
  };

  const saveCurrentView = () => {
    try {
      localStorage.setItem('fortdefend_device_view', JSON.stringify({ view, group: groupId }));
      setToast('View saved.');
      setTimeout(() => setToast(''), 2500);
    } catch {
      setToast('Could not save view.');
    }
  };

  const onCreateGroup = async () => {
    const name = newGroupName.trim();
    if (!name) return;
    setNewGroupSaving(true);
    try {
      await api('/api/groups', { method: 'POST', body: { name } });
      setNewGroupOpen(false);
      setNewGroupName('');
      const res = await api('/api/groups');
      setGroupsTree(Array.isArray(res?.groups) ? res.groups : []);
      setToast('Blueprint (group) created.');
      setTimeout(() => setToast(''), 2500);
    } catch (e) {
      setToast(e.message || 'Failed to create.');
    } finally {
      setNewGroupSaving(false);
    }
  };

  const activeAll = !groupId && view === 'all';
  const activeOffline = !groupId && view === 'offline';
  const activeAlerts = !groupId && view === 'alerts';
  const activeNoUser = !groupId && view === 'nouser';

  const navBtn = (active) =>
    `flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-sm ${
      active ? 'bg-brand/15 font-semibold text-brand' : 'text-slate-800 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800'
    }`;

  return (
    <div className="flex min-h-0 w-full max-w-full flex-1 flex-col gap-0 lg:flex-row">
      <aside className="flex w-full shrink-0 flex-col border-b border-fds-border bg-fds-sidebar lg:w-[200px] lg:border-b-0 lg:border-r">
        <div className="border-b border-fds-border px-2 py-2">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Device Views</p>
        </div>
        <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-1 py-2">
          <button type="button" className={navBtn(activeAll)} onClick={() => clearGroup()}>
            <span>All Devices</span>
            <span className="tabular-nums text-slate-500">{counts.all}</span>
          </button>
          <button type="button" className={navBtn(activeOffline)} onClick={() => setView('offline')}>
            <span>Offline Devices</span>
            <span className="tabular-nums text-slate-500">{counts.offline}</span>
          </button>
          <button type="button" className={navBtn(activeAlerts)} onClick={() => setView('alerts')}>
            <span>Devices With Alerts</span>
            <span className="tabular-nums text-slate-500">{counts.withAlerts}</span>
          </button>
          <button type="button" className={navBtn(activeNoUser)} onClick={() => setView('nouser')}>
            <span>No User Assigned</span>
            <span className="tabular-nums text-slate-500">{counts.noUser}</span>
          </button>
          <div className="my-2 border-t border-fds-border" />
          <p className="mb-1 px-1 text-[10px] font-bold uppercase text-slate-400">My Groups</p>
          {groupsLoading ? (
            <p className="px-2 text-xs text-slate-500">Loading…</p>
          ) : (
            <GroupNavRows nodes={groupsTree} depth={0} selectedGroupId={groupId} onPick={pickGroup} />
          )}
          <button
            type="button"
            className="mt-2 w-full rounded border border-dashed border-slate-300 py-1.5 text-xs text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800"
            onClick={() => setNewGroupOpen(true)}
          >
            + New Blueprint
          </button>
          <button type="button" className="mt-2 w-full rounded-md border border-fds-border py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800" onClick={saveCurrentView}>
            Save Current View
          </button>
        </div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-2 border-b border-fds-border bg-fds-card px-3 py-2">
          <input
            type="search"
            placeholder="Search devices…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="h-9 min-w-[12rem] flex-1 rounded-md border border-fds-border bg-white px-3 text-sm dark:bg-slate-900"
          />
          <Button variant="outline" className="h-9 text-xs" type="button" onClick={() => loadDevices()}>
            Refresh
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto p-3">
          <Card className="overflow-x-auto border-fds-border p-0">
            {loading ? (
              <p className="p-6 text-sm text-slate-500">Loading…</p>
            ) : (
              <table className="min-w-full border-collapse text-sm">
                <thead className="sticky top-0 z-10 border-b border-fds-border bg-fds-muted-surface">
                  <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <th className="w-10 px-2 py-2" aria-hidden />
                    <th className="w-8 px-1 py-2"> </th>
                    <th className="px-2 py-2">Device Name</th>
                    <th className="px-2 py-2">Model</th>
                    <th className="px-2 py-2">OS</th>
                    <th className="px-2 py-2">Serial</th>
                    <th className="px-2 py-2">Last Check-in</th>
                    <th className="px-2 py-2">User</th>
                    <th className="px-2 py-2 text-center">Patch Status</th>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((d) => (
                    <tr
                      key={d.id}
                      className="cursor-pointer border-b border-fds-border hover:bg-slate-50 dark:hover:bg-slate-800/50"
                      onClick={() => navigate(`/devices/${encodeURIComponent(d.id)}`)}
                    >
                      <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" className="rounded border-slate-300" readOnly title="Select (coming soon)" />
                      </td>
                      <td className="px-1 py-2">
                        <span className={`inline-block h-2.5 w-2.5 rounded-full ${statusDotClass(deriveStatus(d))}`} title={deriveStatus(d)} />
                      </td>
                      <td className="px-2 py-2 font-medium text-slate-900 dark:text-slate-100">{d.name || d.id}</td>
                      <td className="px-2 py-2 text-slate-700 dark:text-slate-200">{d.model || d.hardware_model || '—'}</td>
                      <td className="px-2 py-2 text-slate-700 dark:text-slate-200">{d.os || '—'}</td>
                      <td className="px-2 py-2 text-slate-600 dark:text-slate-300">{d.serial || '—'}</td>
                      <td className="whitespace-nowrap px-2 py-2 text-slate-600 dark:text-slate-300">{formatCheckin(d)}</td>
                      <td className="max-w-[10rem] truncate px-2 py-2 text-slate-600 dark:text-slate-300">{getUserEmail(d) || '—'}</td>
                      <td className="px-2 py-2 text-center">{patchCell(d)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {!loading && filtered.length === 0 && <p className="p-6 text-sm text-slate-500">No devices in this view.</p>}
            {filtered.length > PAGE_SIZE && (
              <div className="flex items-center justify-between border-t border-fds-border px-3 py-2 text-xs text-slate-600">
                <span>
                  Page {currentPage} / {pageCount}
                </span>
                <div className="flex gap-2">
                  <Button variant="outline" className="!py-1 text-xs" disabled={currentPage <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                    Prev
                  </Button>
                  <Button variant="outline" className="!py-1 text-xs" disabled={currentPage >= pageCount} onClick={() => setPage((p) => Math.min(pageCount, p + 1))}>
                    Next
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>

      {newGroupOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 px-4" onClick={() => setNewGroupOpen(false)} role="presentation">
          <div className="w-full max-w-sm rounded-xl bg-white p-4 shadow-xl dark:bg-slate-900" onClick={(e) => e.stopPropagation()} role="dialog">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100">New blueprint (group)</h3>
            <div className="mt-3">
              <Input label="Name" value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)} placeholder="e.g. Engineering" />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" type="button" onClick={() => setNewGroupOpen(false)}>
                Cancel
              </Button>
              <Button type="button" disabled={newGroupSaving || !newGroupName.trim()} onClick={onCreateGroup}>
                {newGroupSaving ? 'Creating…' : 'Create'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="fixed bottom-4 right-4 z-[60] rounded-lg bg-slate-900 px-4 py-2 text-sm text-white shadow-lg">{toast}</div>}
    </div>
  );
}
