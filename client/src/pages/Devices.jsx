import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api';
import { Button, Card, Input } from '../components/ui';
import { SectionHeader, StatusBadge } from '../components/fds';
import ScriptRunnerModal from '../components/ScriptRunnerModal';

const PAGE_SIZE = 25;
const POLL_MS = 60_000;
const DEVICE_COLUMNS_LS_KEY = 'fortdefend_devices_column_order_v1';
const DEFAULT_COLUMN_ORDER = [
  'os',
  'source',
  'status',
  'compliance',
  'security_score',
  'last_seen',
  'group',
  'disk',
  'ram',
  'patches',
];

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

function osVersionOf(d) {
  return d.osVersion || d.os_version || null;
}

function displayOs(d) {
  const raw = String(d.os || '').trim();
  if (!raw) return '—';
  const lower = raw.toLowerCase();
  if (lower === 'windows') return 'Microsoft Windows';
  if (lower === 'android') return 'Android';
  if (lower === 'chromeos' || lower === 'chrome os') return 'ChromeOS';
  if (lower === 'ios') return 'iOS';
  return raw;
}

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

function formatPct(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  return `${n.toFixed(1)}%`;
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

function deviceHeroEmoji(d) {
  const n = normalizeOs(d);
  if (n === 'android') return '📱';
  if (n === 'ios' || n === 'ipados') return '📱';
  if (n === 'chromeos') return '💻';
  const os = String(d.os || '').toLowerCase();
  if (os.includes('mac') || os.includes('darwin')) return '🖥️';
  if (n === 'windows' || os.includes('windows')) return '💻';
  return '💻';
}

function deviceModelSubtitle(d) {
  const model = d.model || d.hardware_model || d.cpu_model || d.cpuModel || '—';
  const serial = d.serial || '—';
  const ver = osVersionOf(d) || '—';
  return `${model} | ${serial} | ${ver}`;
}

function formatShortDate(iso) {
  if (!iso) return '—';
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return '—';
  return t.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function appInstallSource(row) {
  if (row?.winget_id && String(row.winget_id).trim()) return 'Winget';
  return 'Get-Package';
}

const SORT_KEYS = {
  device: (d) => (d.name || d.id || '').toLowerCase(),
  os: (d) => `${normalizeOs(d)} ${osVersionOf(d) || ''}`.toLowerCase(),
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
  const [panelDetailDevice, setPanelDetailDevice] = useState(null);
  const [panelAlerts, setPanelAlerts] = useState([]);
  const [panelApps, setPanelApps] = useState([]);
  const [panelAppsLoading, setPanelAppsLoading] = useState(false);
  const [panelScripts, setPanelScripts] = useState([]);
  const [panelScriptsLoading, setPanelScriptsLoading] = useState(false);
  const [appSearch, setAppSearch] = useState('');
  const [panelHeaderMenuOpen, setPanelHeaderMenuOpen] = useState(false);
  const [panelTab, setPanelTab] = useState('overview');
  const [openMenu, setOpenMenu] = useState(null);
  const [toast, setToast] = useState('');
  const [checkedIds, setCheckedIds] = useState([]);
  const [showScriptRunner, setShowScriptRunner] = useState(false);
  const [scripts, setScripts] = useState([]);
  const [columnOrder, setColumnOrder] = useState(DEFAULT_COLUMN_ORDER);
  const [draggedColumn, setDraggedColumn] = useState(null);
  const menuRef = useRef(null);
  const panelHeaderMenuRef = useRef(null);

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
    try {
      const raw = localStorage.getItem(DEVICE_COLUMNS_LS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      const valid = parsed.filter((key) => DEFAULT_COLUMN_ORDER.includes(key) && key !== 'device');
      const missing = DEFAULT_COLUMN_ORDER.filter((key) => !valid.includes(key));
      const merged = [...valid, ...missing];
      if (merged.length === DEFAULT_COLUMN_ORDER.length) setColumnOrder(merged);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(DEVICE_COLUMNS_LS_KEY, JSON.stringify(columnOrder));
  }, [columnOrder]);

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

  useEffect(() => {
    function onDoc(e) {
      if (!panelHeaderMenuOpen) return;
      if (panelHeaderMenuRef.current && !panelHeaderMenuRef.current.contains(e.target)) {
        setPanelHeaderMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [panelHeaderMenuOpen]);

  useEffect(() => {
    if (!selected) {
      setPanelDetailDevice(null);
      setPanelAlerts([]);
      setPanelApps([]);
      setPanelScripts([]);
      setAppSearch('');
      setPanelHeaderMenuOpen(false);
      setPanelTab('overview');
    }
  }, [selected]);

  useEffect(() => {
    if (!selected?.id) return undefined;
    const id = selected.id;
    const baseRow = selected;
    let cancelled = false;
    setPanelAppsLoading(true);
    setPanelScriptsLoading(true);
    (async () => {
      try {
        const [detail, appsRes, scriptsRes] = await Promise.all([
          api(`/api/devices/${encodeURIComponent(id)}`),
          api(`/api/devices/${encodeURIComponent(id)}/apps`).catch(() => ({ applications: [], total: 0 })),
          api(`/api/devices/${encodeURIComponent(id)}/script-history`).catch(() => ({ history: [] })),
        ]);
        if (cancelled) return;
        setPanelDetailDevice({ ...baseRow, ...(detail.device || {}) });
        setPanelAlerts(Array.isArray(detail.alerts) ? detail.alerts : []);
        setPanelApps(Array.isArray(appsRes.applications) ? appsRes.applications : []);
        setPanelScripts(Array.isArray(scriptsRes.history) ? scriptsRes.history : []);
      } catch {
        if (!cancelled) {
          setPanelDetailDevice(baseRow);
          setPanelAlerts(Array.isArray(baseRow.alerts) ? baseRow.alerts : []);
          setPanelApps([]);
          setPanelScripts([]);
        }
      } finally {
        if (!cancelled) {
          setPanelAppsLoading(false);
          setPanelScriptsLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selected?.id]);

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

  const fleetSummary = useMemo(() => {
    let online = 0;
    let offline = 0;
    let warning = 0;
    let alert = 0;
    for (const d of rows) {
      const st = deriveStatus(d);
      if (st === 'online') online += 1;
      else if (st === 'warning') warning += 1;
      else if (st === 'alert') alert += 1;
      else offline += 1;
    }
    return { online, offline, warning, alert, total: rows.length };
  }, [rows]);

  const filteredPanelApps = useMemo(() => {
    const needle = appSearch.trim().toLowerCase();
    if (!needle) return panelApps;
    return panelApps.filter(
      (row) =>
        String(row.app_name || '')
          .toLowerCase()
          .includes(needle) ||
        String(row.installed_version || '')
          .toLowerCase()
          .includes(needle)
    );
  }, [panelApps, appSearch]);

  const panelDevice = useMemo(
    () => (selected ? panelDetailDevice || selected : null),
    [selected, panelDetailDevice]
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

  const columnLabel = (key) => {
    const map = {
      device: 'Device',
      os: 'OS',
      source: 'Source',
      status: 'Status',
      compliance: 'Compliance',
      security_score: 'Security score',
      last_seen: 'Last seen',
      group: 'Group',
      disk: 'Disk',
      ram: 'RAM',
      patches: 'Patches',
    };
    return map[key] || key;
  };

  const moveColumn = (from, to) => {
    if (!from || !to || from === to) return;
    setColumnOrder((prev) => {
      const next = [...prev];
      const fromIdx = next.indexOf(from);
      const toIdx = next.indexOf(to);
      if (fromIdx < 0 || toIdx < 0) return prev;
      const [item] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, item);
      return next;
    });
  };
  const orderedColumns = useMemo(() => ['device', ...columnOrder.filter((k) => k !== 'device')], [columnOrder]);

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
          displayOs(d),
          osVersionOf(d),
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
    setPanelDetailDevice(null);
    setPanelAlerts([]);
    setPanelApps([]);
    setPanelScripts([]);
    setAppSearch('');
    setPanelHeaderMenuOpen(false);
  };

  return (
    <div className="space-y-6">
      <SectionHeader title="Devices" description="Fleet inventory from connected integrations and agents." />

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

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-fds-border bg-white px-4 py-3 text-sm shadow-sm ring-1 ring-slate-950/5">
        <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Fleet summary</span>
        <span className="inline-flex items-center gap-2 text-slate-700">
          <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden />
          <strong className="tabular-nums text-slate-900">{fleetSummary.online}</strong> online
        </span>
        <span className="inline-flex items-center gap-2 text-slate-700">
          <span className="h-2 w-2 rounded-full bg-amber-500" aria-hidden />
          <strong className="tabular-nums text-slate-900">{fleetSummary.warning}</strong> warnings
        </span>
        <span className="inline-flex items-center gap-2 text-slate-700">
          <span className="h-2 w-2 rounded-full bg-red-500" aria-hidden />
          <strong className="tabular-nums text-slate-900">{fleetSummary.alert}</strong> alerts
        </span>
        <span className="inline-flex items-center gap-2 text-slate-700">
          <span className="h-2 w-2 rounded-full bg-slate-400" aria-hidden />
          <strong className="tabular-nums text-slate-900">{fleetSummary.offline}</strong> offline
        </span>
        <span className="ml-auto text-xs text-slate-500">{fleetSummary.total} devices</span>
      </div>

      <Card className="overflow-hidden p-0">
        <div className="max-h-[min(70vh,900px)] overflow-auto">
          {loading ? (
            <p className="p-6 text-sm text-gray-500">Loading…</p>
          ) : (
            <table className="min-w-full border-collapse text-sm">
              <thead className="sticky top-0 z-20 border-b border-fds-border bg-white shadow-sm">
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
                  {orderedColumns.map((colKey) => (
                    <th
                      key={colKey}
                      className={`whitespace-nowrap px-3 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500 ${colKey === 'security_score' ? 'text-right' : 'text-left'}`}
                      draggable={colKey !== 'device'}
                      onDragStart={() => {
                        if (colKey === 'device') return;
                        setDraggedColumn(colKey);
                      }}
                      onDragOver={(e) => {
                        if (colKey === 'device') return;
                        e.preventDefault();
                      }}
                      onDrop={() => {
                        if (colKey === 'device') return;
                        moveColumn(draggedColumn, colKey);
                      }}
                      onDragEnd={() => setDraggedColumn(null)}
                    >
                      <button
                        type="button"
                        className="font-semibold text-slate-700 hover:text-brand"
                        onClick={() => toggleSort(colKey)}
                        title="Drag to reorder column"
                      >
                        {columnLabel(colKey)}
                        {sortIndicator(colKey)}
                      </button>
                    </th>
                  ))}
                  <th className="sticky right-0 z-20 whitespace-nowrap border-l border-fds-border bg-white px-3 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-fds-border bg-white">
                {pageItems.length === 0 && (
                  <tr>
                    <td colSpan={columnOrder.length + 2} className="px-4 py-10 text-center text-gray-500">
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
                      className="h-12 cursor-pointer hover:bg-slate-50"
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
                  {orderedColumns.map((colKey) => {
                        if (colKey === 'device') {
                          return (
                            <td key={colKey} className="px-3 py-2.5">
                              <div className="flex min-w-0 items-center gap-2">
                                <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${statusDotClass(st)}`} title={st} />
                                <div className="min-w-0">
                                  <div className="truncate font-medium text-gray-900">{d.name || d.id}</div>
                                  <div className="truncate text-xs text-gray-500">{d.serial || '—'}</div>
                                </div>
                              </div>
                            </td>
                          );
                        }
                        if (colKey === 'os') {
                          return <td key={colKey} className="px-3 py-2.5 text-gray-600">{displayOs(d)} {osVersionOf(d) ? `· ${osVersionOf(d)}` : ''}</td>;
                        }
                        if (colKey === 'source') {
                          return (
                            <td key={colKey} className="px-3 py-2.5">
                              <StatusBadge status="default">{displaySource(d.source)}</StatusBadge>
                            </td>
                          );
                        }
                        if (colKey === 'status') {
                          return <td key={colKey} className="px-3 py-2.5 capitalize text-gray-700">{st}</td>;
                        }
                        if (colKey === 'compliance') {
                          return <td key={colKey} className="px-3 py-2.5 text-gray-600">{d.compliance || '—'}</td>;
                        }
                        if (colKey === 'security_score') {
                          return <td key={colKey} className="px-3 py-2.5 text-right font-semibold text-brand">{d.security_score ?? '—'}</td>;
                        }
                        if (colKey === 'last_seen') {
                          return <td key={colKey} className="whitespace-nowrap px-3 py-2.5 text-gray-600">{formatRelativeTime(getLastSeen(d))}</td>;
                        }
                        if (colKey === 'group') {
                          return <td key={colKey} className="px-3 py-2.5 text-gray-700">{d.group_name || 'Ungrouped'}</td>;
                        }
                        if (colKey === 'disk') {
                          return <td key={colKey} className="px-3 py-2.5 text-gray-600">{formatDisk(d)}</td>;
                        }
                        if (colKey === 'ram') {
                          return <td key={colKey} className="px-3 py-2.5 text-gray-600">{formatRam(d)}</td>;
                        }
                        if (colKey === 'patches') {
                          return (
                            <td key={colKey} className="px-3 py-2.5">
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
                          );
                        }
                        return <td key={colKey} className="px-3 py-2.5 text-gray-600">—</td>;
                      })}
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

      {panelDevice && (
        <div className="fixed inset-0 z-50 flex flex-col md:flex-row">
          <button
            type="button"
            className="hidden h-full w-[40%] min-w-[10rem] shrink-0 bg-black/60 md:block"
            aria-label="Close panel"
            onClick={() => setSelected(null)}
          />
          <div className="flex h-full w-full min-w-0 flex-col bg-white shadow-2xl md:w-[60%] md:max-w-none md:shrink-0">
            <div className="border-b border-gray-200 px-5 pb-4 pt-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 flex-1 gap-4">
                  <div
                    className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gray-100 text-4xl"
                    aria-hidden
                  >
                    {deviceHeroEmoji(panelDevice)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate text-2xl font-bold tracking-tight text-gray-900">
                      {panelDevice.name || panelDevice.id}
                    </h2>
                    <p className="mt-1 text-sm text-gray-500">{deviceModelSubtitle(panelDevice)}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-gray-600">
                      <span className="truncate">
                        <span className="font-semibold text-gray-500">User</span>{' '}
                        {panelDevice.logged_in_user || getUserEmail(panelDevice) || '—'}
                      </span>
                      <span className="text-gray-300">·</span>
                      <span>
                        <span className="font-semibold text-gray-500">Last seen</span>{' '}
                        {getLastSeen(panelDevice) ? formatRelativeTime(getLastSeen(panelDevice)) : '—'}
                      </span>
                      <span className="text-gray-300">·</span>
                      <span>
                        <span className="font-semibold text-gray-500">Security</span>{' '}
                        {panelDevice.security_score ?? '—'}
                      </span>
                      <span className="text-gray-300">·</span>
                      <span>
                        <span className="font-semibold text-gray-500">Disk</span> {formatDisk(panelDevice)}
                      </span>
                      <span className="text-gray-300">·</span>
                      <span className="truncate">
                        <span className="font-semibold text-gray-500">Group</span>{' '}
                        {panelDevice.group_name || 'Ungrouped'}
                      </span>
                      <span className="text-gray-300">·</span>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="font-semibold text-gray-500">Source</span>
                        <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-800">
                          {displaySource(panelDevice.source)}
                        </span>
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <div className="relative" ref={panelHeaderMenuRef}>
                    <button
                      type="button"
                      className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-800"
                      aria-label="Device actions"
                      aria-expanded={panelHeaderMenuOpen}
                      onClick={() => setPanelHeaderMenuOpen((o) => !o)}
                    >
                      ⋯
                    </button>
                    {panelHeaderMenuOpen && (
                      <div className="absolute right-0 z-20 mt-1 w-48 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
                        <button
                          type="button"
                          className="block w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                          onClick={async () => {
                            setPanelHeaderMenuOpen(false);
                            const next = window.prompt('Device display name', panelDevice.name || '');
                            if (!next || !String(next).trim()) return;
                            try {
                              const r = await api(`/api/devices/${encodeURIComponent(panelDevice.id)}`, {
                                method: 'PATCH',
                                body: { name: String(next).trim() },
                              });
                              const updated = r?.device || { ...panelDevice, name: String(next).trim() };
                              setPanelDetailDevice((prev) => ({ ...(prev || panelDevice), ...updated }));
                              setSelected((prev) => (prev && prev.id === panelDevice.id ? { ...prev, ...updated } : prev));
                              loadDevices({ showLoading: false });
                              setToast('Device name updated.');
                            } catch (err) {
                              setToast(err.message || 'Could not update name.');
                            }
                          }}
                        >
                          Edit name
                        </button>
                        <button
                          type="button"
                          className="block w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                          onClick={async () => {
                            setPanelHeaderMenuOpen(false);
                            const groupId = window.prompt('Enter group ID to assign this device:');
                            if (!groupId) return;
                            try {
                              await api(`/api/groups/devices/${encodeURIComponent(panelDevice.id)}/move`, {
                                method: 'POST',
                                body: { from_group_id: null, to_group_id: groupId },
                              });
                              setToast('Assign request sent.');
                              loadDevices({ showLoading: false });
                            } catch (err) {
                              setToast(err.message || 'Assign failed.');
                            }
                          }}
                        >
                          Assign group
                        </button>
                        <button
                          type="button"
                          className="block w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-gray-50"
                          onClick={async () => {
                            setPanelHeaderMenuOpen(false);
                            if (!window.confirm('Remove this device from FortDefend?')) return;
                            try {
                              await api(`/api/devices/${encodeURIComponent(panelDevice.id)}`, { method: 'DELETE' });
                              setToast('Device removed.');
                              setSelected(null);
                              loadDevices({ showLoading: false });
                            } catch (err) {
                              setToast(err.message || 'Remove failed.');
                            }
                          }}
                        >
                          Remove device
                        </button>
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    className="rounded-lg p-2 text-xl leading-none text-gray-500 hover:bg-gray-100 hover:text-gray-800"
                    onClick={() => setSelected(null)}
                    aria-label="Close"
                  >
                    ×
                  </button>
                </div>
              </div>
            </div>
            <div className="border-b border-gray-200 px-4">
              <div className="flex gap-1 overflow-x-auto">
                {[
                  { id: 'overview', label: 'Overview' },
                  { id: 'applications', label: `Applications (${panelApps.length})` },
                  { id: 'alerts', label: `Alerts (${panelAlerts.length})` },
                  { id: 'scripts', label: `Scripts (${panelScripts.length})` },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setPanelTab(tab.id)}
                    className={`whitespace-nowrap border-b-2 px-3 py-3 text-sm font-semibold transition ${
                      panelTab === tab.id
                        ? 'border-brand text-brand'
                        : 'border-transparent text-gray-500 hover:text-gray-800'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto bg-gray-50/40 p-5">
              {panelTab === 'overview' && (
                <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {[
                    ['OS', `${displayOs(panelDevice)} ${osVersionOf(panelDevice) || ''}`.trim()],
                    ['Serial', panelDevice.serial || '—'],
                    ['Last seen', getLastSeen(panelDevice) ? formatRelativeTime(getLastSeen(panelDevice)) : '—'],
                    ['Disk', formatDisk(panelDevice)],
                    ['RAM', formatRam(panelDevice)],
                    ['CPU', panelDevice.cpu_model || panelDevice.cpuModel || '—'],
                    ['CPU usage', formatPct(panelDevice.cpu_usage_pct)],
                    ['Security score', panelDevice.security_score ?? '—'],
                    ['RAM usage', formatPct(panelDevice.ram_usage_pct)],
                    ['Disk usage', formatPct(panelDevice.disk_usage_pct)],
                    ['Disk free %', formatPct(panelDevice.disk_free_pct)],
                    ['Hostname', panelDevice.hostname || '—'],
                    ['IP address', panelDevice.ip_address || '—'],
                    ['Battery status', panelDevice.battery_status || '—'],
                    ['Battery health', panelDevice.battery_health || '—'],
                    ['Logged in user', panelDevice.logged_in_user || '—'],
                    ['Agent version', panelDevice.agent_version || '—'],
                    ['Compliance', panelDevice.compliance || '—'],
                    ['Source', displaySource(panelDevice.source)],
                    ['Group', panelDevice.group_name || 'Ungrouped'],
                    ['User email', getUserEmail(panelDevice) || '—'],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-xl border border-gray-100 bg-white px-4 py-3 shadow-sm">
                      <dt className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{label}</dt>
                      <dd className="mt-1 break-words text-sm font-medium text-gray-900">{value || '—'}</dd>
                    </div>
                  ))}
                </dl>
              )}
              {panelTab === 'applications' && (
                <div className="space-y-4">
                  <Input
                    label="Search applications"
                    placeholder="Filter by name or version…"
                    value={appSearch}
                    onChange={(e) => setAppSearch(e.target.value)}
                  />
                  {panelAppsLoading ? (
                    <p className="text-sm text-gray-500">Loading applications…</p>
                  ) : (
                    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                      <table className="min-w-full divide-y divide-gray-200 text-sm">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                              App name
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                              Version
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                              Installed
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                              Source
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 bg-white">
                          {filteredPanelApps.length === 0 && (
                            <tr>
                              <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
                                {panelApps.length === 0
                                  ? 'No application inventory for this device yet.'
                                  : 'No applications match your search.'}
                              </td>
                            </tr>
                          )}
                          {filteredPanelApps.map((row) => (
                            <tr key={`${row.app_name}-${row.winget_id || ''}-${row.installed_version || ''}`}>
                              <td className="max-w-[220px] truncate px-4 py-2.5 font-medium text-gray-900">
                                {row.app_name || '—'}
                              </td>
                              <td className="whitespace-nowrap px-4 py-2.5 text-gray-700">
                                {row.installed_version || '—'}
                              </td>
                              <td className="whitespace-nowrap px-4 py-2.5 text-gray-600">
                                {formatShortDate(row.last_scanned_at || row.updated_at || row.created_at)}
                              </td>
                              <td className="whitespace-nowrap px-4 py-2.5 text-gray-600">{appInstallSource(row)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
              {panelTab === 'alerts' && (
                <ul className="space-y-3">
                  {panelAlerts.length === 0 && (
                    <li className="rounded-xl border border-gray-200 bg-white px-4 py-8 text-center text-sm text-gray-500 shadow-sm">
                      No active alerts for this device.
                    </li>
                  )}
                  {panelAlerts.map((a) => (
                    <li key={a.id || `${a.type}-${a.created_at}`} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold uppercase text-amber-900">
                          {a.type || 'alert'}
                        </span>
                        {a.severity && (
                          <span className="text-xs font-medium text-gray-500">{String(a.severity)}</span>
                        )}
                      </div>
                      <p className="mt-2 text-sm text-gray-800">{a.message || '—'}</p>
                    </li>
                  ))}
                </ul>
              )}
              {panelTab === 'scripts' && (
                <div className="space-y-3">
                  {panelScriptsLoading ? (
                    <p className="text-sm text-gray-500">Loading script history…</p>
                  ) : panelScripts.length === 0 ? (
                    <p className="rounded-xl border border-gray-200 bg-white px-4 py-8 text-center text-sm text-gray-500 shadow-sm">
                      No script runs recorded for this device.
                    </p>
                  ) : (
                    <ul className="space-y-3">
                      {panelScripts.map((row) => {
                        const payload = row.command_payload || {};
                        const title = payload.scriptName || payload.scriptType || 'Script';
                        return (
                          <li key={row.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                            <div className="flex flex-wrap items-baseline justify-between gap-2">
                              <p className="font-semibold text-gray-900">{title}</p>
                              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium capitalize text-gray-700">
                                {row.status}
                              </span>
                            </div>
                            <p className="mt-1 text-xs text-gray-500">
                              {row.created_at ? new Date(row.created_at).toLocaleString() : '—'}
                              {row.completed_at ? ` → ${new Date(row.completed_at).toLocaleString()}` : ''}
                            </p>
                            {row.output ? (
                              <pre className="mt-2 max-h-32 overflow-auto rounded-lg bg-gray-50 p-2 text-xs text-gray-700">
                                {String(row.output).slice(0, 2000)}
                                {String(row.output).length > 2000 ? '…' : ''}
                              </pre>
                            ) : null}
                            {row.error_message ? (
                              <p className="mt-2 text-xs text-red-600">{row.error_message}</p>
                            ) : null}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
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
