import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api';
import { Button, Card, Input } from '../components/ui';
import ScriptRunnerModal from '../components/ScriptRunnerModal';

const PAGE_SIZE = 25;
const POLL_MS = 60_000;

function formatRelativeTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const diffMs = Date.now() - d.getTime();
  const sec = Math.floor(diffMs / 1000);
  if (sec < 45) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} minute${min === 1 ? '' : 's'} ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hour${hr === 1 ? '' : 's'} ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day} day${day === 1 ? '' : 's'} ago`;
  const month = Math.floor(day / 30);
  return `${month} month${month === 1 ? '' : 's'} ago`;
}

function rowKey(d) {
  return `${d.source || 'unknown'}-${d.id}`;
}

function normalizeOs(d) {
  const o = String(d.os || '').toLowerCase();
  if (o.includes('windows')) return 'windows';
  if (o.includes('chrome')) return 'chromeos';
  if (o.includes('android')) return 'android';
  if (o.includes('ipados') || o.includes('ipad')) return 'ipados';
  if (o.includes('ios') || o === 'iphone') return 'ios';
  return o || 'other';
}

function getLastSeen(d) {
  return d.lastSeen || d.last_seen || null;
}

function deriveStatus(d) {
  const s = d.status;
  if (s && ['online', 'offline', 'warning', 'alert'].includes(String(s).toLowerCase())) {
    return String(s).toLowerCase();
  }
  const critical = (d.alerts || []).some((a) => String(a.severity).toLowerCase() === 'critical');
  if (critical) return 'alert';
  const hasWarn = (d.alerts || []).some(
    (a) => String(a.severity).toLowerCase() === 'high' || String(a.severity).toLowerCase() === 'warning'
  );
  const c = String(d.compliance || '').toLowerCase();
  if (c && (c.includes('noncompliant') || c.includes('not compliant'))) {
    return 'warning';
  }
  if (hasWarn) return 'warning';
  const last = getLastSeen(d);
  if (!last) return 'offline';
  const days = (Date.now() - new Date(last).getTime()) / 86400000;
  if (days > 7) return 'offline';
  return 'online';
}

function statusDotClass(status) {
  if (status === 'online') return 'bg-emerald-500';
  if (status === 'warning') return 'bg-amber-500';
  if (status === 'alert') return 'bg-red-500';
  return 'bg-gray-400';
}

function sourceLabel(source) {
  if (source === 'intune') return 'Intune';
  if (source === 'google_admin') return 'Google Admin';
  if (source === 'google_mobile') return 'Google (Mobile)';
  if (source === 'agent') return 'Agent';
  return source || '—';
}

function displaySource(source) {
  return sourceLabel(source);
}

function formatDisk(d) {
  const gb = d.disk_free_gb ?? d.disk?.freeGb;
  if (gb == null || Number.isNaN(Number(gb))) return '—';
  return `${Number(gb).toFixed(1)}GB free`;
}

function formatRam(d) {
  const gb = d.ram_total_gb ?? d.ram?.totalGb;
  if (gb == null || Number.isNaN(Number(gb))) return '—';
  return `${Number(gb).toFixed(1)}GB`;
}

function getPendingPatchCount(d) {
  if (d.pending_patches == null) return null;
  if (typeof d.pending_patches === 'number') return d.pending_patches;
  if (Array.isArray(d.pending_patches)) return d.pending_patches.length;
  return null;
}

function getUserEmail(d) {
  return d.email || d.user || d.userEmail || d.user_email || '';
}

const SORT_KEYS = {
  device: (d) => (d.name || d.id || '').toLowerCase(),
  os: (d) => `${normalizeOs(d)} ${d.osVersion || ''}`.toLowerCase(),
  source: (d) => String(d.source || '').toLowerCase(),
  compliance: (d) => String(d.compliance || '').toLowerCase(),
  security_score: (d) => (d.security_score != null ? Number(d.security_score) : -1),
  last_seen: (d) => (getLastSeen(d) ? new Date(getLastSeen(d)).getTime() : 0),
  group: (d) => String(d.group_name || 'Ungrouped').toLowerCase(),
  disk: (d) => {
    const gb = d.disk_free_gb ?? d.disk?.freeGb;
    return gb != null && !Number.isNaN(Number(gb)) ? Number(gb) : -1;
  },
  ram: (d) => {
    const gb = d.ram_total_gb ?? d.ram?.totalGb;
    return gb != null && !Number.isNaN(Number(gb)) ? Number(gb) : -1;
  },
  patches: (d) => {
    const n = getPendingPatchCount(d);
    return n == null ? -1 : n;
  },
  status: (d) => deriveStatus(d),
};

function escapeCsv(s) {
  if (s == null) return '';
  const str = String(s);
  if (/[",\n\r]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

export default function Devices() {
  const [rows, setRows] = useState([]);
  const [integrationErrors, setIntegrationErrors] = useState(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [osFilter, setOsFilter] = useState('all');
  const [sortKey, setSortKey] = useState('device');
  const [sortDir, setSortDir] = useState('asc');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);
  const [panelTab, setPanelTab] = useState('overview');
  const [openMenu, setOpenMenu] = useState(null);
  const [toast, setToast] = useState('');
  const [checkedIds, setCheckedIds] = useState([]);
  const [showScriptRunner, setShowScriptRunner] = useState(false);
  const [scripts, setScripts] = useState([]);
  const menuRef = useRef(null);

  const loadDevices = useCallback(async (opts = { showLoading: false }) => {
    if (opts.showLoading) setLoading(true);
    try {
      const res = await api('/api/integrations/devices');
      setRows(Array.isArray(res?.devices) ? res.devices : []);
      setIntegrationErrors(res?.errors && typeof res.errors === 'object' ? res.errors : null);
    } catch {
      setRows([]);
      setIntegrationErrors(null);
    } finally {
      if (opts.showLoading) setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (cancelled) return;
      await loadDevices({ showLoading: true });
    })();
    const t = setInterval(() => {
      if (!cancelled) loadDevices({ showLoading: false });
    }, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [loadDevices]);

  useEffect(() => {
    api('/api/scripts')
      .then((res) => setScripts(Array.isArray(res?.scripts) ? res.scripts : []))
      .catch(() => setScripts([]));
  }, []);

  useEffect(() => {
    if (!toast) return undefined;
    const id = setTimeout(() => setToast(''), 3500);
    return () => clearTimeout(id);
  }, [toast]);

  useEffect(() => {
    function onDoc(e) {
      if (!openMenu) return;
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setOpenMenu(null);
      }
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [openMenu]);

  const filtered = useMemo(() => {
    return rows.filter((d) => {
      const email = getUserEmail(d);
      const hay = `${d.name || ''} ${d.serial || ''} ${d.id || ''} ${email}`.toLowerCase();
      if (q && !hay.includes(q.toLowerCase())) return false;

      if (sourceFilter !== 'all') {
        if (sourceFilter === 'intune' && d.source !== 'intune') return false;
        if (sourceFilter === 'google_admin' && d.source !== 'google_admin' && d.source !== 'google_mobile') {
          return false;
        }
        if (sourceFilter === 'agent' && d.source !== 'agent') return false;
        if (sourceFilter === 'android' && normalizeOs(d) !== 'android') return false;
      }

      if (statusFilter !== 'all') {
        if (deriveStatus(d) !== statusFilter) return false;
      }

      if (osFilter !== 'all') {
        const n = normalizeOs(d);
        if (osFilter === 'windows' && n !== 'windows') return false;
        if (osFilter === 'chromeos' && n !== 'chromeos') return false;
        if (osFilter === 'android' && n !== 'android') return false;
        if (osFilter === 'ios' && n !== 'ios' && n !== 'ipados') return false;
      }
      return true;
    });
  }, [rows, q, sourceFilter, statusFilter, osFilter]);

  const sorted = useMemo(() => {
    const list = [...filtered];
    const fn = SORT_KEYS[sortKey] || SORT_KEYS.device;
    list.sort((a, b) => {
      const va = fn(a);
      const vb = fn(b);
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return list;
  }, [filtered, sortKey, sortDir]);

  const total = sorted.length;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const pageItems = useMemo(
    () => sorted.slice(pageStart, pageStart + PAGE_SIZE),
    [sorted, pageStart]
  );
  const checkedDevices = useMemo(
    () => rows.filter((d) => checkedIds.includes(d.id)),
    [rows, checkedIds]
  );

  useEffect(() => {
    setPage(1);
  }, [q, sourceFilter, statusFilter, osFilter, sortKey, sortDir]);

  const toggleSort = (key) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const sortIndicator = (key) => {
    if (sortKey !== key) return <span className="ml-1 text-gray-300">↕</span>;
    return <span className="ml-1 text-brand">{sortDir === 'asc' ? '↑' : '↓'}</span>;
  };

  const exportCsv = () => {
    const headers = [
      'Device',
      'Serial',
      'OS',
      'OS version',
      'Source',
      'Status',
      'Compliance',
      'Security score',
      'Last seen',
      'Group',
      'Disk',
      'RAM',
      'Pending patches',
      'User email',
    ];
    const lines = [headers.map(escapeCsv).join(',')];
    for (const d of sorted) {
      lines.push(
        [
          d.name || d.id,
          d.serial,
          d.os,
          d.osVersion,
          displaySource(d.source),
          deriveStatus(d),
          d.compliance,
          d.security_score,
          getLastSeen(d) || '',
          d.group_name || 'Ungrouped',
          formatDisk(d),
          formatRam(d),
          getPendingPatchCount(d) ?? '',
          getUserEmail(d),
        ]
          .map(escapeCsv)
          .join(',')
      );
    }
    const blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fortdefend-devices-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const syncableSource = (d) => (d.source === 'intune' || d.source === 'google_admin' ? d.source : null);

  const runSync = async (d) => {
    setOpenMenu(null);
    const s = syncableSource(d);
    if (!s) {
      setToast('Sync is only available for Intune or Google Admin (Chromebook) devices.');
      return;
    }
    try {
      await api(`/api/integrations/devices/${encodeURIComponent(d.id)}/sync`, {
        method: 'POST',
        body: { source: s },
      });
      setToast('Sync requested.');
      loadDevices({ showLoading: false });
    } catch (err) {
      setToast(err.message || 'Sync failed.');
    }
  };

  const runReboot = async (d) => {
    setOpenMenu(null);
    if (d.source !== 'intune') {
      setToast('Reboot is only available for Intune-managed Windows devices.');
      return;
    }
    try {
      await api(`/api/integrations/devices/${encodeURIComponent(d.id)}/reboot`, {
        method: 'POST',
        body: { source: 'intune' },
      });
      setToast('Reboot command sent.');
    } catch (err) {
      setToast(err.message || 'Reboot failed.');
    }
  };

  const assignSelectedToGroup = async () => {
    const groupId = window.prompt('Enter group ID to assign selected devices:');
    if (!groupId) return;
    let ok = 0;
    for (const d of checkedDevices) {
      try {
        await api(`/api/groups/devices/${encodeURIComponent(d.id)}/move`, {
          method: 'POST',
          body: { from_group_id: null, to_group_id: groupId },
        });
        ok += 1;
      } catch {
        /* continue */
      }
    }
    setToast(`Assigned ${ok}/${checkedDevices.length} devices.`);
  };

  const rebootSelected = async () => {
    let ok = 0;
    for (const d of checkedDevices) {
      if (d.source !== 'intune') continue;
      try {
        await api(`/api/integrations/devices/${encodeURIComponent(d.id)}/reboot`, {
          method: 'POST',
          body: { source: 'intune' },
        });
        ok += 1;
      } catch {
        /* continue */
      }
    }
    setToast(`Sent reboot to ${ok} Intune device(s).`);
  };

  const openDetails = (d) => {
    setSelected(d);
    setPanelTab('overview');
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Devices</h1>
        <p className="text-sm text-gray-600">Fleet inventory from connected integrations.</p>
      </div>

      {integrationErrors && Object.keys(integrationErrors).length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-semibold">Some integrations reported errors</p>
          <ul className="mt-2 list-inside list-disc text-amber-800">
            {Object.entries(integrationErrors).map(([k, v]) => (
              <li key={k}>
                {k}: {String(v)}
              </li>
            ))}
          </ul>
        </div>
      )}

      <Card>
        {checkedDevices.length > 0 && (
          <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-brand/30 bg-brand-light/40 px-3 py-2">
            <span className="text-sm font-medium text-brand">{checkedDevices.length} selected</span>
            <Button variant="outline" className="!py-1.5 text-xs" onClick={() => setShowScriptRunner(true)}>Run Script</Button>
            <Button variant="outline" className="!py-1.5 text-xs" onClick={rebootSelected}>Reboot</Button>
            <Button variant="outline" className="!py-1.5 text-xs" onClick={assignSelectedToGroup}>Assign Group</Button>
            <Button variant="outline" className="!py-1.5 text-xs" onClick={exportCsv}>Export Selected</Button>
          </div>
        )}
        <div className="flex flex-col gap-4 lg:flex-row lg:flex-wrap lg:items-end">
          <div className="min-w-0 flex-1 lg:max-w-md">
            <Input
              label="Search"
              placeholder="Name, serial, user email, id…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <div>
            <span className="mb-1 block text-sm font-medium text-gray-700">Source</span>
            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
              className="w-full min-w-[10rem] rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            >
              <option value="all">All</option>
              <option value="intune">Intune</option>
              <option value="google_admin">Google Admin</option>
              <option value="agent">Agent</option>
              <option value="android">Android</option>
            </select>
          </div>
          <div>
            <span className="mb-1 block text-sm font-medium text-gray-700">Status</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full min-w-[10rem] rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            >
              <option value="all">All</option>
              <option value="online">Online</option>
              <option value="offline">Offline</option>
              <option value="warning">Warning</option>
              <option value="alert">Alert</option>
            </select>
          </div>
          <div>
            <span className="mb-1 block text-sm font-medium text-gray-700">OS</span>
            <select
              value={osFilter}
              onChange={(e) => setOsFilter(e.target.value)}
              className="w-full min-w-[10rem] rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            >
              <option value="all">All</option>
              <option value="windows">Windows</option>
              <option value="chromeos">ChromeOS</option>
              <option value="android">Android</option>
              <option value="ios">iOS</option>
            </select>
          </div>
          <div className="flex items-end">
            <Button type="button" variant="outline" onClick={exportCsv} disabled={sorted.length === 0}>
              Export CSV
            </Button>
          </div>
        </div>
      </Card>

      <Card className="overflow-hidden p-0">
        <div className="max-h-[min(70vh,900px)] overflow-auto">
          {loading ? (
            <p className="p-6 text-sm text-gray-500">Loading…</p>
          ) : (
            <table className="min-w-full border-collapse text-sm">
              <thead className="sticky top-0 z-20 border-b border-gray-200 bg-white shadow-sm">
                <tr>
                  <th className="whitespace-nowrap px-3 py-3 text-left">
                    <input
                      type="checkbox"
                      checked={pageItems.length > 0 && pageItems.every((d) => checkedIds.includes(d.id))}
                      onChange={(e) => {
                        const ids = pageItems.map((d) => d.id);
                        if (e.target.checked) {
                          setCheckedIds((prev) => [...new Set([...prev, ...ids])]);
                        } else {
                          setCheckedIds((prev) => prev.filter((id) => !ids.includes(id)));
                        }
                      }}
                    />
                  </th>
                  <th className="whitespace-nowrap px-3 py-3 text-left">
                    <button
                      type="button"
                      className="font-semibold text-gray-900 hover:text-brand"
                      onClick={() => toggleSort('device')}
                    >
                      Device
                      {sortIndicator('device')}
                    </button>
                  </th>
                  <th className="whitespace-nowrap px-3 py-3 text-left">
                    <button
                      type="button"
                      className="font-semibold text-gray-900 hover:text-brand"
                      onClick={() => toggleSort('os')}
                    >
                      OS
                      {sortIndicator('os')}
                    </button>
                  </th>
                  <th className="whitespace-nowrap px-3 py-3 text-left">
                    <button
                      type="button"
                      className="font-semibold text-gray-900 hover:text-brand"
                      onClick={() => toggleSort('source')}
                    >
                      Source
                      {sortIndicator('source')}
                    </button>
                  </th>
                  <th className="whitespace-nowrap px-3 py-3 text-left">
                    <button
                      type="button"
                      className="font-semibold text-gray-900 hover:text-brand"
                      onClick={() => toggleSort('status')}
                    >
                      Status
                      {sortIndicator('status')}
                    </button>
                  </th>
                  <th className="whitespace-nowrap px-3 py-3 text-left">
                    <button
                      type="button"
                      className="font-semibold text-gray-900 hover:text-brand"
                      onClick={() => toggleSort('compliance')}
                    >
                      Compliance
                      {sortIndicator('compliance')}
                    </button>
                  </th>
                  <th className="whitespace-nowrap px-3 py-3 text-right">
                    <button
                      type="button"
                      className="font-semibold text-gray-900 hover:text-brand"
                      onClick={() => toggleSort('security_score')}
                    >
                      Security score
                      {sortIndicator('security_score')}
                    </button>
                  </th>
                  <th className="whitespace-nowrap px-3 py-3 text-left">
                    <button
                      type="button"
                      className="font-semibold text-gray-900 hover:text-brand"
                      onClick={() => toggleSort('last_seen')}
                    >
                      Last seen
                      {sortIndicator('last_seen')}
                    </button>
                  </th>
                  <th className="whitespace-nowrap px-3 py-3 text-left">
                    <button
                      type="button"
                      className="font-semibold text-gray-900 hover:text-brand"
                      onClick={() => toggleSort('group')}
                    >
                      Group
                      {sortIndicator('group')}
                    </button>
                  </th>
                  <th className="whitespace-nowrap px-3 py-3 text-left">
                    <button
                      type="button"
                      className="font-semibold text-gray-900 hover:text-brand"
                      onClick={() => toggleSort('disk')}
                    >
                      Disk
                      {sortIndicator('disk')}
                    </button>
                  </th>
                  <th className="whitespace-nowrap px-3 py-3 text-left">
                    <button
                      type="button"
                      className="font-semibold text-gray-900 hover:text-brand"
                      onClick={() => toggleSort('ram')}
                    >
                      RAM
                      {sortIndicator('ram')}
                    </button>
                  </th>
                  <th className="whitespace-nowrap px-3 py-3 text-left">
                    <button
                      type="button"
                      className="font-semibold text-gray-900 hover:text-brand"
                      onClick={() => toggleSort('patches')}
                    >
                      Patches
                      {sortIndicator('patches')}
                    </button>
                  </th>
                  <th className="sticky right-0 z-20 whitespace-nowrap border-l border-gray-100 bg-white px-3 py-3 text-right font-semibold text-gray-900">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {pageItems.length === 0 && (
                  <tr>
                    <td colSpan={13} className="px-4 py-10 text-center text-gray-500">
                      No devices match your filters.
                    </td>
                  </tr>
                )}
                {pageItems.map((d) => {
                  const k = rowKey(d);
                  const st = deriveStatus(d);
                  const patchN = getPendingPatchCount(d);
                  return (
                    <tr
                      key={k}
                      className="cursor-pointer hover:bg-blue-50/50"
                      onClick={() => openDetails(d)}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        setOpenMenu((m) => (m === k ? null : k));
                      }}
                    >
                      <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={checkedIds.includes(d.id)}
                          onChange={(e) => {
                            if (e.target.checked) setCheckedIds((prev) => [...new Set([...prev, d.id])]);
                            else setCheckedIds((prev) => prev.filter((id) => id !== d.id));
                          }}
                        />
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${statusDotClass(st)}`} />
                          <div className="min-w-0">
                            <div className="truncate font-medium text-gray-900">{d.name || d.id}</div>
                            <div className="truncate text-xs text-gray-500">{d.serial || '—'}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-gray-600">
                        {d.os} {d.osVersion ? `· ${d.osVersion}` : ''}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-800">
                          {displaySource(d.source)}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 capitalize text-gray-700">{st}</td>
                      <td className="px-3 py-2.5 text-gray-600">{d.compliance || '—'}</td>
                      <td className="px-3 py-2.5 text-right font-semibold text-brand">
                        {d.security_score ?? '—'}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-gray-600">
                        {formatRelativeTime(getLastSeen(d))}
                      </td>
                      <td className="px-3 py-2.5 text-gray-700">{d.group_name || 'Ungrouped'}</td>
                      <td className="px-3 py-2.5 text-gray-600">{formatDisk(d)}</td>
                      <td className="px-3 py-2.5 text-gray-600">{formatRam(d)}</td>
                      <td className="px-3 py-2.5">
                        {patchN == null ? (
                          '—'
                        ) : patchN > 0 ? (
                          <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">
                            {patchN} pending
                          </span>
                        ) : (
                          <span className="text-lg text-emerald-600" title="0 pending">
                            ✓
                          </span>
                        )}
                      </td>
                      <td
                        className="sticky right-0 z-10 border-l border-gray-100 bg-white px-2 py-2 text-right"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="relative inline-block text-left" ref={openMenu === k ? menuRef : null}>
                          <button
                            type="button"
                            className="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-800"
                            aria-label="Actions"
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenMenu((m) => (m === k ? null : k));
                            }}
                          >
                            ⋮
                          </button>
                          {openMenu === k && (
                            <div className="absolute right-0 z-30 mt-1 w-40 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
                              <button
                                type="button"
                                className="block w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                                onClick={() => {
                                  setOpenMenu(null);
                                  setCheckedIds([d.id]);
                                  setShowScriptRunner(true);
                                }}
                              >
                                Run Script
                              </button>
                              <button
                                type="button"
                                className="block w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                                onClick={() => runSync(d)}
                              >
                                Sync
                              </button>
                              <button
                                type="button"
                                className="block w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                                onClick={() => runReboot(d)}
                              >
                                Reboot
                              </button>
                              <button
                                type="button"
                                className="block w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                                onClick={() => {
                                  setOpenMenu(null);
                                  openDetails(d);
                                }}
                              >
                                View Details
                              </button>
                              <button
                                type="button"
                                className="block w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                                onClick={async () => {
                                  const groupId = window.prompt('Enter group ID:');
                                  if (!groupId) return;
                                  await api(`/api/groups/devices/${encodeURIComponent(d.id)}/move`, {
                                    method: 'POST',
                                    body: { from_group_id: null, to_group_id: groupId },
                                  }).catch(() => {});
                                  setToast('Assign request sent.');
                                }}
                              >
                                Assign to Group
                              </button>
                              <button
                                type="button"
                                className="block w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-gray-50"
                                onClick={async () => {
                                  if (!window.confirm('Remove this device?')) return;
                                  await api(`/api/devices/${encodeURIComponent(d.id)}`, { method: 'DELETE' }).catch(() => {});
                                  setToast('Device removed.');
                                  loadDevices({ showLoading: false });
                                }}
                              >
                                Remove Device
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        {!loading && total > 0 && (
          <div className="flex flex-col items-center justify-between gap-3 border-t border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600 sm:flex-row">
            <p>
              Showing {total === 0 ? 0 : pageStart + 1}-{Math.min(pageStart + PAGE_SIZE, total)} of {total} devices
            </p>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                className="!py-1.5"
                disabled={currentPage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <span className="text-gray-500">
                Page {currentPage} / {pageCount}
              </span>
              <Button
                type="button"
                variant="outline"
                className="!py-1.5"
                disabled={currentPage >= pageCount}
                onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </Card>

      {selected && (
        <div className="fixed inset-0 z-50 flex">
          <button
            type="button"
            className="hidden flex-1 bg-black/30 md:block"
            aria-label="Close panel"
            onClick={() => setSelected(null)}
          />
          <div className="ml-auto flex h-full w-full max-w-md flex-col border-l border-gray-200 bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-gray-200 px-4 py-4">
              <div className="min-w-0 pr-2">
                <h2 className="text-lg font-semibold text-gray-900">{selected.name || selected.id}</h2>
                <p className="mt-1">
                  <span
                    className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${
                      deriveStatus(selected) === 'online'
                        ? 'bg-emerald-100 text-emerald-800'
                        : deriveStatus(selected) === 'alert'
                        ? 'bg-red-100 text-red-800'
                        : deriveStatus(selected) === 'warning'
                        ? 'bg-amber-100 text-amber-900'
                        : 'bg-gray-200 text-gray-800'
                    }`}
                  >
                    {deriveStatus(selected)}
                  </span>
                </p>
              </div>
              <button
                type="button"
                className="rounded p-1 text-2xl leading-none text-gray-500 hover:bg-gray-100 hover:text-gray-800"
                onClick={() => setSelected(null)}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="border-b border-gray-200 px-2">
              <div className="flex gap-1 overflow-x-auto">
                {['overview', 'software', 'alerts', 'history'].map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setPanelTab(tab)}
                    className={`whitespace-nowrap rounded-t-md px-3 py-2 text-sm font-medium capitalize ${
                      panelTab === tab
                        ? 'border-b-2 border-brand text-brand'
                        : 'text-gray-500 hover:text-gray-800'
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {panelTab === 'overview' && (
                <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {[
                    ['OS', `${selected.os || '—'} ${selected.osVersion || ''}`.trim()],
                    ['Serial', selected.serial || '—'],
                    [
                      'Last seen',
                      getLastSeen(selected) ? formatRelativeTime(getLastSeen(selected)) : '—',
                    ],
                    ['Disk', formatDisk(selected)],
                    ['RAM', formatRam(selected)],
                    ['CPU', selected.cpu_model || selected.cpuModel || '—'],
                    ['Security score', selected.security_score ?? '—'],
                    ['Compliance', selected.compliance || '—'],
                    ['Source', displaySource(selected.source)],
                    ['Group', selected.group_name || 'Ungrouped'],
                    ['User email', getUserEmail(selected) || '—'],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-lg border border-gray-100 bg-gray-50/80 px-3 py-2">
                      <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</dt>
                      <dd className="mt-0.5 break-words text-sm text-gray-900">{value || '—'}</dd>
                    </div>
                  ))}
                </dl>
              )}
              {panelTab === 'software' && (
                <p className="text-sm text-gray-600">Software data available after agent enrollment.</p>
              )}
              {panelTab === 'alerts' && (
                <ul className="space-y-2">
                  {(!selected.alerts || selected.alerts.length === 0) && (
                    <li className="text-sm text-gray-500">No active alerts for this device.</li>
                  )}
                  {(selected.alerts || []).map((a, i) => (
                    <li key={i} className="rounded-lg border border-gray-200 p-3 text-sm">
                      <p className="font-medium text-gray-900">{a.type || 'alert'}</p>
                      <p className="text-gray-600">{a.message || JSON.stringify(a)}</p>
                    </li>
                  ))}
                </ul>
              )}
              {panelTab === 'history' && (
                <p className="text-sm text-gray-600">
                  History will show check-ins and action logs when available.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-4 right-4 z-[60] max-w-sm rounded-lg bg-gray-900 px-4 py-2 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}
      <ScriptRunnerModal
        open={showScriptRunner}
        onClose={() => setShowScriptRunner(false)}
        selectedDevices={checkedDevices}
        scripts={scripts}
        title="Run Script on Devices"
      />
    </div>
  );
}
