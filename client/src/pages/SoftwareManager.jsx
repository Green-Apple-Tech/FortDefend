import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { api } from '../lib/api';
import { Button, Card, Input } from '../components/ui';

const CATEGORY_TABS = ['All', 'Browsers', 'Security', 'Productivity', 'Dev Tools', 'Utilities', 'Media'];

/** App display name → Clearbit Logo API URL (https://logo.clearbit.com/{domain}) */
const APP_ICONS = {
  'Google Chrome': 'https://logo.clearbit.com/google.com',
  'Mozilla Firefox': 'https://logo.clearbit.com/mozilla.org',
  'Microsoft Edge': 'https://logo.clearbit.com/microsoft.com',
  Brave: 'https://logo.clearbit.com/brave.com',
  Opera: 'https://logo.clearbit.com/opera.com',
  Vivaldi: 'https://logo.clearbit.com/vivaldi.com',
  Zoom: 'https://logo.clearbit.com/zoom.us',
  Slack: 'https://logo.clearbit.com/slack.com',
  'Microsoft Teams': 'https://logo.clearbit.com/microsoft.com',
  Discord: 'https://logo.clearbit.com/discord.com',
  Thunderbird: 'https://logo.clearbit.com/thunderbird.net',
  Spotify: 'https://logo.clearbit.com/spotify.com',
  VLC: 'https://logo.clearbit.com/videolan.org',
  Audacity: 'https://logo.clearbit.com/audacityteam.org',
  HandBrake: 'https://logo.clearbit.com/handbrake.fr',
  iTunes: 'https://logo.clearbit.com/apple.com',
  Malwarebytes: 'https://logo.clearbit.com/malwarebytes.com',
  'KeePass 2': 'https://logo.clearbit.com/keepass.info',
  Dropbox: 'https://logo.clearbit.com/dropbox.com',
  'Google Drive': 'https://logo.clearbit.com/google.com',
  OneDrive: 'https://logo.clearbit.com/microsoft.com',
  LibreOffice: 'https://logo.clearbit.com/libreoffice.org',
  'Adobe Acrobat Reader': 'https://logo.clearbit.com/adobe.com',
  'Foxit Reader': 'https://logo.clearbit.com/foxit.com',
  SumatraPDF: 'https://logo.clearbit.com/sumatrapdfreader.org',
  GIMP: 'https://logo.clearbit.com/gimp.org',
  'Paint.NET': 'https://logo.clearbit.com/getpaint.net',
  Greenshot: 'https://logo.clearbit.com/getgreenshot.org',
  ShareX: 'https://logo.clearbit.com/getsharex.com',
  Inkscape: 'https://logo.clearbit.com/inkscape.org',
  Blender: 'https://logo.clearbit.com/blender.org',
  Krita: 'https://logo.clearbit.com/krita.org',
  'Visual Studio Code': 'https://logo.clearbit.com/microsoft.com',
  Git: 'https://logo.clearbit.com/git-scm.com',
  'Notepad++': 'https://logo.clearbit.com/notepad-plus-plus.org',
  'Python 3': 'https://logo.clearbit.com/python.org',
  PuTTY: 'https://logo.clearbit.com/putty.org',
  WinSCP: 'https://logo.clearbit.com/winscp.net',
  FileZilla: 'https://logo.clearbit.com/filezilla-project.org',
  '7-Zip': 'https://logo.clearbit.com/7-zip.org',
  WinRAR: 'https://logo.clearbit.com/rarlab.com',
  TeamViewer: 'https://logo.clearbit.com/teamviewer.com',
  AnyDesk: 'https://logo.clearbit.com/anydesk.com',
  CCleaner: 'https://logo.clearbit.com/ccleaner.com',
  Everything: 'https://logo.clearbit.com/voidtools.com',
  Cursor: 'https://logo.clearbit.com/cursor.com',
  IrfanView: 'https://logo.clearbit.com/irfanview.com',
};

function iconUrlForAppName(name) {
  const key = String(name || '').trim();
  return key ? APP_ICONS[key] ?? null : null;
}

function appInitialLetter(name) {
  const t = String(name || '').trim();
  if (!t) return '?';
  return t.charAt(0).toUpperCase();
}

const LETTER_BG = ['bg-blue-600', 'bg-indigo-600', 'bg-violet-600', 'bg-brand', 'bg-teal-600', 'bg-cyan-600', 'bg-sky-600', 'bg-rose-600'];

function letterBg(name) {
  let h = 0;
  const s = String(name);
  for (let i = 0; i < s.length; i += 1) h += s.charCodeAt(i);
  return LETTER_BG[h % LETTER_BG.length];
}

function AppFavicon({ appName, sizePx = 32, className = '' }) {
  const src = iconUrlForAppName(appName);
  const [failed, setFailed] = useState(!src);
  useEffect(() => {
    setFailed(!src);
  }, [appName, src]);
  const dim = `${sizePx}px`;
  if (failed || !src) {
    return (
      <div
        className={`inline-flex shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${letterBg(appName)} ${className}`}
        style={{ width: dim, height: dim }}
        aria-hidden
      >
        {appInitialLetter(appName)}
      </div>
    );
  }
  return (
    <img
      src={src}
      alt=""
      width={sizePx}
      height={sizePx}
      className={`shrink-0 rounded ${className}`}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

function flattenGroups(nodes, depth = 0, out = []) {
  if (!Array.isArray(nodes)) return out;
  for (const n of nodes) {
    out.push({ id: n.id, name: n.name, depth });
    if (n.children?.length) flattenGroups(n.children, depth + 1, out);
  }
  return out;
}

function groupLabel(g) {
  return `${'— '.repeat(g.depth)}${g.name}`;
}

function installLookup(installations) {
  const map = new Map();
  for (const inv of installations || []) {
    const wid = inv?.winget_id ? String(inv.winget_id).trim() : '';
    const did = inv?.device_id;
    if (!wid || !did) continue;
    const k = `${did}::${wid}`;
    map.set(k, {
      installed: true,
      update_available: Boolean(inv.update_available),
    });
  }
  return map;
}

function MatrixCell({ deviceId, wingetId, lookup }) {
  const st = lookup.get(`${deviceId}::${wingetId}`);
  if (!st?.installed) {
    return <span className="inline-block h-5 w-5" aria-label="Not installed" />;
  }
  if (st.update_available) {
    return (
      <span className="inline-flex h-5 w-5 items-center justify-center text-amber-500" title="Update available" aria-label="Update available">
        ↑
      </span>
    );
  }
  return (
    <span className="inline-flex h-5 w-5 items-center justify-center text-emerald-600" title="Installed" aria-label="Installed">
      ✓
    </span>
  );
}

function HeaderContextMenu({ position, items, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    const close = (e) => {
      if (ref.current?.contains(e.target)) return;
      onClose();
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [onClose]);

  if (!position) return null;
  return (
    <div
      ref={ref}
      role="menu"
      className="fixed z-[70] min-w-[14rem] rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
      style={{ top: position.y, left: position.x }}
    >
      {items.map((it) => (
        <button
          key={it.label}
          type="button"
          role="menuitem"
          className="block w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
          onClick={() => {
            it.action();
            onClose();
          }}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}

export const SoftwareManagerPanel = forwardRef(function SoftwareManagerPanel(
  { embedded = false, scopeDeviceIds = null, hideBottomDeployDock = false },
  ref,
) {
  const [loading, setLoading] = useState(true);
  const [devices, setDevices] = useState([]);
  const [apps, setApps] = useState([]);
  const [installations, setInstallations] = useState([]);
  const [commands, setCommands] = useState([]);
  const [groupsTree, setGroupsTree] = useState([]);
  const [groupDeviceIds, setGroupDeviceIds] = useState(null);
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [selectedDeviceIds, setSelectedDeviceIds] = useState(() => new Set());
  const [deployOpen, setDeployOpen] = useState(false);
  const [deploySearch, setDeploySearch] = useState('');
  const [deployCategory, setDeployCategory] = useState('All');
  const [deploySelectedWinget, setDeploySelectedWinget] = useState(() => new Set());
  const [deployAutoUpdate, setDeployAutoUpdate] = useState(false);
  const [deploySubmitting, setDeploySubmitting] = useState(false);
  const [headerMenu, setHeaderMenu] = useState(null);
  const [historyWinget, setHistoryWinget] = useState(null);
  const [toast, setToast] = useState('');
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addAppLoading, setAddAppLoading] = useState(false);
  const [addAppForm, setAddAppForm] = useState({
    winget_id: '',
    name: '',
    publisher: '',
    category: 'Utilities',
    icon_url: '',
    is_featured: false,
  });

  const flatGroups = useMemo(() => flattenGroups(groupsTree), [groupsTree]);

  const loadData = useCallback(async () => {
    const [matrixData, commandsData] = await Promise.all([
      api('/api/software/matrix'),
      api('/api/software/commands?limit=250'),
    ]);
    setDevices(Array.isArray(matrixData?.devices) ? matrixData.devices : []);
    setApps(Array.isArray(matrixData?.apps) ? matrixData.apps : []);
    setInstallations(Array.isArray(matrixData?.installations) ? matrixData.installations : []);
    setCommands(Array.isArray(commandsData?.commands) ? commandsData.commands : []);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [matrixData, commandsData, groupsRes] = await Promise.all([
          api('/api/software/matrix'),
          api('/api/software/commands?limit=250'),
          api('/api/groups').catch(() => ({ groups: [] })),
        ]);
        if (cancelled) return;
        setDevices(Array.isArray(matrixData?.devices) ? matrixData.devices : []);
        setApps(Array.isArray(matrixData?.apps) ? matrixData.apps : []);
        setInstallations(Array.isArray(matrixData?.installations) ? matrixData.installations : []);
        setCommands(Array.isArray(commandsData?.commands) ? commandsData.commands : []);
        setGroupsTree(Array.isArray(groupsRes?.groups) ? groupsRes.groups : []);
      } catch (err) {
        if (!cancelled) setToast(err.message || 'Failed to load software manager.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    const interval = setInterval(() => {
      loadData().catch((err) => setToast(err.message || 'Failed to refresh.'));
    }, 60000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [loadData]);

  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(''), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (embedded) {
      setSelectedGroupId('');
      setGroupDeviceIds(null);
    }
  }, [embedded]);

  useEffect(() => {
    if (embedded) return;
    if (!selectedGroupId) {
      setGroupDeviceIds(null);
      return;
    }
    let cancelled = false;
    setGroupDeviceIds(undefined);
    (async () => {
      try {
        const data = await api(`/api/groups/${encodeURIComponent(selectedGroupId)}/devices`);
        if (cancelled) return;
        const ids = new Set((data.devices || []).map((d) => d.id));
        setGroupDeviceIds(ids);
      } catch {
        if (!cancelled) setGroupDeviceIds(new Set());
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedGroupId, embedded]);

  const groupDevicesLoading = Boolean(!embedded && selectedGroupId && groupDeviceIds === undefined);

  const installCountByWinget = useMemo(() => {
    const sets = new Map();
    for (const inv of installations) {
      const wid = inv?.winget_id ? String(inv.winget_id).trim() : '';
      if (!wid) continue;
      if (!sets.has(wid)) sets.set(wid, new Set());
      sets.get(wid).add(inv.device_id);
    }
    const out = new Map();
    sets.forEach((set, wid) => out.set(wid, set.size));
    return out;
  }, [installations]);

  const lookup = useMemo(() => installLookup(installations), [installations]);

  const filteredDevices = useMemo(() => {
    if (embedded) {
      if (scopeDeviceIds == null) return devices;
      if (scopeDeviceIds.size === 0) return [];
      return devices.filter((d) => scopeDeviceIds.has(d.id));
    }
    if (!selectedGroupId) return devices;
    if (groupDeviceIds === undefined) return [];
    return devices.filter((d) => groupDeviceIds.has(d.id));
  }, [devices, embedded, scopeDeviceIds, selectedGroupId, groupDeviceIds]);

  const columnApps = useMemo(() => {
    return [...apps].sort((a, b) => {
      const ca = installCountByWinget.get(a.winget_id) || 0;
      const cb = installCountByWinget.get(b.winget_id) || 0;
      const pa = ca > 0 ? 1 : 0;
      const pb = cb > 0 ? 1 : 0;
      if (pb !== pa) return pb - pa;
      return String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' });
    });
  }, [apps, installCountByWinget]);

  const filteredIds = useMemo(() => filteredDevices.map((d) => d.id), [filteredDevices]);

  const allFilteredSelected = filteredIds.length > 0 && filteredIds.every((id) => selectedDeviceIds.has(id));
  const someFilteredSelected = filteredIds.some((id) => selectedDeviceIds.has(id));

  const selectAllRef = useRef(null);
  useEffect(() => {
    const el = selectAllRef.current;
    if (!el) return;
    el.indeterminate = !allFilteredSelected && someFilteredSelected;
  }, [allFilteredSelected, someFilteredSelected]);

  const toggleSelectAll = () => {
    setSelectedDeviceIds((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) {
        filteredIds.forEach((id) => next.delete(id));
      } else {
        filteredIds.forEach((id) => next.add(id));
      }
      return next;
    });
  };

  const toggleDevice = (id) => {
    setSelectedDeviceIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectedCount = selectedDeviceIds.size;
  const selectedIdsArray = useMemo(() => [...selectedDeviceIds], [selectedDeviceIds]);

  const openDeploy = useCallback(() => {
    if (selectedCount === 0) return;
    setDeploySearch('');
    setDeployCategory('All');
    setDeploySelectedWinget(new Set());
    setDeployAutoUpdate(false);
    setDeployOpen(true);
  }, [selectedCount]);

  useImperativeHandle(
    ref,
    () => ({
      openDeploy,
    }),
    [openDeploy],
  );

  const deployAppsFiltered = useMemo(() => {
    return apps.filter((app) => {
      const catOk = deployCategory === 'All' || app.category === deployCategory;
      if (!catOk) return false;
      const hay = `${app.name || ''} ${app.publisher || ''} ${app.winget_id || ''}`.toLowerCase();
      return !deploySearch.trim() || hay.includes(deploySearch.trim().toLowerCase());
    });
  }, [apps, deploySearch, deployCategory]);

  const deployAppsByCategory = useMemo(() => {
    const m = new Map();
    for (const app of deployAppsFiltered) {
      const c = app.category || 'Other';
      if (!m.has(c)) m.set(c, []);
      m.get(c).push(app);
    }
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  }, [deployAppsFiltered]);

  const deploySelectedCount = deploySelectedWinget.size;

  const onInstallSelected = async () => {
    if (deploySelectedCount === 0 || selectedCount === 0) return;
    const wingetIds = [...deploySelectedWinget];
    const commandType = deployAutoUpdate ? 'update' : 'install';
    setDeploySubmitting(true);
    try {
      await api('/api/software/commands', {
        method: 'POST',
        body: {
          deviceIds: selectedIdsArray,
          wingetIds,
          commandType,
        },
      });
      setToast(`Queued ${wingetIds.length} app(s) on ${selectedCount} device(s).`);
      setDeployOpen(false);
      await loadData();
    } catch (err) {
      setToast(err.message || 'Failed to queue commands.');
    } finally {
      setDeploySubmitting(false);
    }
  };

  const queueForAllFilteredDevices = async (wingetId, commandType) => {
    const ids = filteredDevices.map((d) => d.id);
    if (!ids.length) {
      setToast('No devices in the current view.');
      return;
    }
    try {
      await api('/api/software/commands', {
        method: 'POST',
        body: { deviceIds: ids, wingetId, commandType },
      });
      setToast(`Queued ${commandType} for all devices in view.`);
      await loadData();
    } catch (err) {
      setToast(err.message || 'Request failed.');
    }
  };

  const historyForWinget = useMemo(() => {
    if (!historyWinget) return [];
    return commands
      .filter((c) => c.winget_id === historyWinget)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 40);
  }, [commands, historyWinget]);

  const onAddApp = async (e) => {
    e.preventDefault();
    setAddAppLoading(true);
    try {
      await api('/api/software/apps', {
        method: 'POST',
        body: {
          winget_id: addAppForm.winget_id,
          name: addAppForm.name,
          publisher: addAppForm.publisher,
          category: addAppForm.category,
          icon_url: addAppForm.icon_url || null,
          is_featured: addAppForm.is_featured,
        },
      });
      setToast('App added to catalogue.');
      setAddModalOpen(false);
      setAddAppForm({
        winget_id: '',
        name: '',
        publisher: '',
        category: 'Utilities',
        icon_url: '',
        is_featured: false,
      });
      await loadData();
    } catch (err) {
      setToast(err.message || 'Failed to add app.');
    } finally {
      setAddAppLoading(false);
    }
  };

  return (
    <div className={`space-y-3 ${hideBottomDeployDock ? '' : 'pb-24'}`}>
      {!embedded && (
        <div className="flex flex-wrap items-end justify-end gap-2">
          <label className="block min-w-[12rem]">
            <span className="mb-0.5 block text-[11px] font-medium text-slate-600">Group</span>
            <select
              value={selectedGroupId}
              onChange={(e) => {
                setSelectedGroupId(e.target.value);
                setSelectedDeviceIds(new Set());
              }}
              className="w-full min-w-[12rem] rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            >
              <option value="">All Devices</option>
              {flatGroups.map((g) => (
                <option key={g.id} value={g.id}>
                  {groupLabel(g)}
                </option>
              ))}
            </select>
          </label>
          <Button variant="outline" className="h-8 text-xs" type="button" onClick={() => setAddModalOpen(true)}>
            Add catalogue app
          </Button>
        </div>
      )}

      {embedded && (
        <div className="flex justify-end">
          <Button variant="outline" className="h-8 text-xs" type="button" onClick={() => setAddModalOpen(true)}>
            Add catalogue app
          </Button>
        </div>
      )}

      <Card className="overflow-hidden border-fds-border p-0 shadow-sm ring-1 ring-slate-950/5">
        {loading ? (
          <p className="p-4 text-center text-sm text-slate-500">Loading device matrix…</p>
        ) : groupDevicesLoading ? (
          <p className="p-4 text-center text-sm text-slate-500">Loading group devices…</p>
        ) : filteredDevices.length === 0 ? (
          <p className="p-4 text-center text-sm text-slate-500">
            {selectedGroupId ? 'No devices in this group.' : 'No devices found.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-max border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/90">
                  <th className="sticky left-0 z-20 border-r border-slate-200 bg-slate-50/95 px-3 py-2 text-left">
                    <div className="flex items-center gap-2">
                      <input
                        ref={selectAllRef}
                        type="checkbox"
                        className="h-4 w-4 rounded border-slate-300"
                        checked={allFilteredSelected}
                        onChange={toggleSelectAll}
                        aria-label="Select all devices"
                      />
                      <span className="font-semibold text-slate-800">Device</span>
                    </div>
                  </th>
                  {columnApps.map((app) => (
                    <th
                      key={app.id}
                      className="w-14 min-w-[3.25rem] px-1 py-2 text-center align-bottom"
                      onContextMenu={(e) => {
                        e.preventDefault();
                        setHeaderMenu({ x: e.clientX, y: e.clientY, app });
                      }}
                    >
                      <div className="flex flex-col items-center gap-1">
                        <AppFavicon appName={app.name} sizePx={24} />
                        <span className="max-w-[3rem] truncate text-[10px] font-medium leading-tight text-slate-600" title={app.name}>
                          {app.name}
                        </span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredDevices.map((d) => (
                  <tr key={d.id} className="border-b border-slate-100 hover:bg-slate-50/60">
                    <td className="sticky left-0 z-10 border-r border-slate-100 bg-white px-3 py-2">
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          className="h-4 w-4 shrink-0 rounded border-slate-300"
                          checked={selectedDeviceIds.has(d.id)}
                          onChange={() => toggleDevice(d.id)}
                          aria-label={`Select ${d.name || d.id}`}
                        />
                        <div className="min-w-0">
                          <div className="truncate font-medium text-slate-900">{d.name || d.id}</div>
                          <div className="truncate text-xs text-slate-500">{d.status || '—'}</div>
                        </div>
                      </div>
                    </td>
                    {columnApps.map((app) => (
                      <td key={`${d.id}-${app.winget_id}`} className="px-0 py-2 text-center">
                        <MatrixCell deviceId={d.id} wingetId={app.winget_id} lookup={lookup} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {selectedCount > 0 && !hideBottomDeployDock && (
        <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-blue-200 bg-blue-600 px-4 py-3 text-white shadow-lg md:left-[var(--fds-sidebar-width,0px)]">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
            <span className="text-sm font-medium">{selectedCount} device{selectedCount === 1 ? '' : 's'} selected</span>
            <Button className="bg-white text-blue-700 hover:bg-blue-50" type="button" onClick={openDeploy}>
              Deploy Apps
            </Button>
          </div>
        </div>
      )}

      {deployOpen && (
        <div className="fixed inset-0 z-50 flex flex-col bg-white">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <h2 className="text-lg font-semibold text-slate-900">Deploy Apps to {selectedCount} devices</h2>
            <button type="button" className="text-sm text-slate-500 hover:text-slate-800" onClick={() => setDeployOpen(false)}>
              Close
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden px-5 pt-4">
            <div className="mb-3 max-w-xl">
              <Input label="Search apps" placeholder="Name, publisher, Winget id…" value={deploySearch} onChange={(e) => setDeploySearch(e.target.value)} />
            </div>
            <div className="mb-4 flex flex-wrap gap-2">
              {CATEGORY_TABS.map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setDeployCategory(tab)}
                  className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
                    deployCategory === tab ? 'bg-brand text-white shadow-sm' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
            <div className="h-[calc(100vh-16rem)] overflow-y-auto pb-4">
              {deployAppsByCategory.length === 0 ? (
                <p className="text-sm text-slate-500">No apps match your filters.</p>
              ) : (
                deployAppsByCategory.map(([cat, list]) => (
                  <div key={cat} className="mb-8">
                    <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">{cat}</h3>
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {list.map((app) => {
                        const n = installCountByWinget.get(app.winget_id) || 0;
                        const checked = deploySelectedWinget.has(app.winget_id);
                        return (
                          <label
                            key={app.id}
                            className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 transition ${
                              checked ? 'border-brand bg-brand/5' : 'border-slate-200 hover:border-slate-300'
                            }`}
                          >
                            <input
                              type="checkbox"
                              className="h-4 w-4 shrink-0 rounded border-slate-300"
                              checked={checked}
                              onChange={() => {
                                setDeploySelectedWinget((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(app.winget_id)) next.delete(app.winget_id);
                                  else next.add(app.winget_id);
                                  return next;
                                });
                              }}
                            />
                            <AppFavicon appName={app.name} sizePx={32} />
                            <div className="min-w-0 flex-1">
                              <div className="truncate font-medium text-slate-900">{app.name}</div>
                              <span className="mt-0.5 inline-block rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                                {n} device{n === 1 ? '' : 's'} installed
                              </span>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-5 py-4">
            <span className="text-sm text-slate-700">
              <span className="font-semibold text-slate-900">{deploySelectedCount}</span> app{deploySelectedCount === 1 ? '' : 's'} selected
            </span>
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300"
                  checked={deployAutoUpdate}
                  onChange={(e) => setDeployAutoUpdate(e.target.checked)}
                />
                Enable Auto-Update
              </label>
              <span className="hidden text-xs text-slate-500 sm:inline">(queues update instead of install)</span>
              <Button type="button" disabled={deploySelectedCount === 0 || deploySubmitting} onClick={onInstallSelected}>
                {deploySubmitting ? 'Queuing…' : 'Install Selected'}
              </Button>
            </div>
          </div>
        </div>
      )}

      <HeaderContextMenu
        position={headerMenu ? { x: headerMenu.x, y: headerMenu.y } : null}
        onClose={() => setHeaderMenu(null)}
        items={
          headerMenu?.app
            ? [
                {
                  label: 'Enable Auto-Update for all devices',
                  action: () => queueForAllFilteredDevices(headerMenu.app.winget_id, 'update'),
                },
                {
                  label: 'Install on all devices',
                  action: () => queueForAllFilteredDevices(headerMenu.app.winget_id, 'install'),
                },
                {
                  label: 'View install history',
                  action: () => setHistoryWinget(headerMenu.app.winget_id),
                },
              ]
            : []
        }
      />

      {historyWinget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 px-4" onClick={() => setHistoryWinget(null)}>
          <div className="max-h-[80vh] w-full max-w-lg overflow-hidden rounded-xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <h3 className="font-semibold text-slate-900">Install history</h3>
              <button type="button" className="text-sm text-slate-500 hover:text-slate-800" onClick={() => setHistoryWinget(null)}>
                Close
              </button>
            </div>
            <div className="max-h-[60vh] overflow-y-auto p-4">
              <p className="mb-3 font-mono text-xs text-slate-600">{historyWinget}</p>
              {historyForWinget.length === 0 ? (
                <p className="text-sm text-slate-500">No commands recorded for this package.</p>
              ) : (
                <ul className="space-y-2">
                  {historyForWinget.map((cmd) => (
                    <li key={cmd.id} className="rounded border border-slate-100 p-2 text-xs">
                      <div className="flex justify-between font-medium text-slate-800">
                        <span>{cmd.command_type}</span>
                        <span className="text-slate-500">{cmd.status}</span>
                      </div>
                      <div className="mt-1 text-slate-600">{cmd.device_name || cmd.device_id}</div>
                      <div className="text-slate-400">{cmd.created_at ? new Date(cmd.created_at).toLocaleString() : ''}</div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {addModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4">
          <div className="w-full max-w-lg rounded-xl bg-white p-5 shadow-2xl">
            <h2 className="text-lg font-semibold text-slate-900">Add App to Catalogue</h2>
            <p className="mt-1 text-sm text-slate-600">Enter Winget ID and application metadata.</p>
            <form className="mt-4 space-y-3" onSubmit={onAddApp}>
              <Input
                label="Winget ID"
                required
                value={addAppForm.winget_id}
                onChange={(e) => setAddAppForm((prev) => ({ ...prev, winget_id: e.target.value }))}
              />
              <Input label="Name" required value={addAppForm.name} onChange={(e) => setAddAppForm((prev) => ({ ...prev, name: e.target.value }))} />
              <Input
                label="Publisher"
                value={addAppForm.publisher}
                onChange={(e) => setAddAppForm((prev) => ({ ...prev, publisher: e.target.value }))}
              />
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">Category</span>
                <select
                  value={addAppForm.category}
                  onChange={(e) => setAddAppForm((prev) => ({ ...prev, category: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                >
                  {CATEGORY_TABS.filter((tab) => tab !== 'All').map((tab) => (
                    <option key={tab} value={tab}>
                      {tab}
                    </option>
                  ))}
                </select>
              </label>
              <Input
                label="Icon URL"
                value={addAppForm.icon_url}
                onChange={(e) => setAddAppForm((prev) => ({ ...prev, icon_url: e.target.value }))}
              />
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={addAppForm.is_featured}
                  onChange={(e) => setAddAppForm((prev) => ({ ...prev, is_featured: e.target.checked }))}
                />
                Featured app
              </label>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" type="button" onClick={() => setAddModalOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={addAppLoading}>
                  {addAppLoading ? 'Adding...' : 'Add App'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed right-4 top-4 z-[80] rounded-lg bg-slate-900 px-4 py-2 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
});

export default function SoftwareManager() {
  return <Navigate to="/devices?tab=software" replace />;
}
