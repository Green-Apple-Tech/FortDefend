import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { Button, Card, Input } from '../components/ui';
import { SectionHeader } from '../components/fds';

const CATEGORY_TABS = ['All', 'Browsers', 'Security', 'Productivity', 'Dev Tools', 'Utilities', 'Media'];
const COLUMN_PREFS_KEY = 'software_manager_hidden_columns';
const SHOW_UNINSTALLED_LS_KEY = 'software_manager_show_uninstalled_apps';

/** Lowercase name / substring → favicon domain */
const APP_NAME_DOMAIN_RULES = [
  ['google chrome', 'google.com'],
  ['mozilla firefox', 'mozilla.org'],
  ['microsoft edge', 'microsoft.com'],
  ['brave browser', 'brave.com'],
  ['brave', 'brave.com'],
  ['zoom', 'zoom.us'],
  ['slack', 'slack.com'],
  ['spotify', 'spotify.com'],
  ['discord', 'discord.com'],
  ['dropbox', 'dropbox.com'],
  ['vlc', 'videolan.org'],
  ['7-zip', '7-zip.org'],
  ['7 zip', '7-zip.org'],
  ['visual studio code', 'code.visualstudio.com'],
  ['vs code', 'code.visualstudio.com'],
  ['vscode', 'code.visualstudio.com'],
  ['notepad++', 'notepad-plus-plus.org'],
  ['notepad plus', 'notepad-plus-plus.org'],
  ['malwarebytes', 'malwarebytes.com'],
  ['ccleaner', 'ccleaner.com'],
  ['teamviewer', 'teamviewer.com'],
  ['anydesk', 'anydesk.com'],
  ['libreoffice', 'libreoffice.org'],
  ['gimp', 'gimp.org'],
];

/** Last-resort: Publisher.PackageId → try publisher.com (works for many winget IDs). */
function domainGuessFromWingetId(wingetId) {
  const raw = String(wingetId || '').trim();
  if (!raw.includes('.')) return null;
  const pub = raw.split('.')[0].toLowerCase().replace(/[^a-z0-9-]/g, '');
  if (pub.length < 2 || pub.length > 40 || /^\d+$/.test(pub)) return null;
  return `${pub}.com`;
}

function domainForCatalogueApp(app) {
  const name = String(app?.name || '').trim().toLowerCase();
  const wid = String(app?.winget_id || '').toLowerCase();

  if (name) {
    for (const [needle, domain] of APP_NAME_DOMAIN_RULES) {
      if (name === needle.trim() || name.includes(needle)) return domain;
    }
  }
  if (wid.includes('google.chrome') || wid === 'chrome' || name.includes('chrome')) return 'google.com';
  if (wid.includes('mozilla.firefox') || name.includes('firefox')) return 'mozilla.org';
  if (wid.includes('microsoft.edge') || name.includes('edge')) return 'microsoft.com';
  if (wid.includes('brave')) return 'brave.com';
  if (wid.includes('zoom')) return 'zoom.us';
  if (wid.includes('slack')) return 'slack.com';
  if (wid.includes('spotify')) return 'spotify.com';
  if (wid.includes('discord')) return 'discord.com';
  if (wid.includes('dropbox')) return 'dropbox.com';
  if (wid.includes('videolan') || wid.includes('vlc')) return 'videolan.org';
  if (wid.includes('7zip') || wid.includes('7-zip')) return '7-zip.org';
  if (wid.includes('microsoft.vscode') || wid.includes('vscode')) return 'code.visualstudio.com';
  if (wid.includes('git.git') || wid.endsWith('.git')) return 'git-scm.com';
  if (wid.includes('notepadplusplus')) return 'notepad-plus-plus.org';
  if (wid.includes('malwarebytes')) return 'malwarebytes.com';
  if (wid.includes('piriform.ccleaner') || wid.includes('ccleaner')) return 'ccleaner.com';
  if (wid.includes('teamviewer')) return 'teamviewer.com';
  if (wid.includes('anydesk')) return 'anydesk.com';
  if (wid.includes('libreoffice')) return 'libreoffice.org';
  if (wid.includes('gimp')) return 'gimp.org';
  return domainGuessFromWingetId(app?.winget_id);
}

function PackageIcon({ className = 'h-8 w-8' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <path
        d="M12 2.5l7.5 4.25v8.5L12 19.5l-7.5-4.25v-8.5L12 2.5z"
        fill="#dbeafe"
        stroke="#2563eb"
        strokeWidth="1.25"
        strokeLinejoin="round"
      />
      <path d="M12 12V21M12 12L4.5 7.75M12 12l7.5-4.25" stroke="#2563eb" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  );
}

/** Host-only string for favicon CDNs (e.g. "google.com"). */
function hostnameFromDomain(domain) {
  if (!domain) return null;
  const s = String(domain).trim().replace(/^https?:\/\//i, '');
  const host = s.split('/')[0]?.trim();
  return host || null;
}

/**
 * App column icon: DB icon_url first, then DuckDuckGo (rarely blocked), then Google s2, then local SVG.
 * Google-only was often invisible due to ad blockers / network filters.
 */
function AppFavicon({ iconUrl, domain }) {
  const hostname = useMemo(() => hostnameFromDomain(domain), [domain]);

  const sources = useMemo(() => {
    const list = [];
    const raw = iconUrl && String(iconUrl).trim();
    if (raw && /^https?:\/\//i.test(raw)) list.push(raw);
    if (hostname) {
      // Direct favicon often works when CDNs are blocked; then DDG, then Google s2.
      list.push(`https://${hostname}/favicon.ico`);
      list.push(`https://icons.duckduckgo.com/ip3/${hostname}.ico`);
      list.push(`https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=32`);
    }
    return list;
  }, [iconUrl, hostname]);

  const [idx, setIdx] = useState(0);

  useEffect(() => {
    setIdx(0);
  }, [iconUrl, hostname]);

  if (!sources.length || idx >= sources.length) {
    return <PackageIcon className="h-8 w-8 shrink-0" />;
  }

  return (
    <img
      key={idx}
      src={sources[idx]}
      alt=""
      width={32}
      height={32}
      className="h-8 w-8 shrink-0 rounded"
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setIdx((i) => i + 1)}
    />
  );
}

function keyFor(deviceId, wingetId) {
  return `${deviceId}::${wingetId}`;
}

function statusColor(status) {
  if (status === 'online') return 'bg-emerald-500';
  if (status === 'warning') return 'bg-amber-500';
  if (status === 'alert') return 'bg-red-500';
  return 'bg-slate-400';
}

export default function SoftwareManager({ deviceIdsAllowlist = null } = {}) {
  const [loading, setLoading] = useState(true);
  const [matrix, setMatrix] = useState({ devices: [], apps: [], installations: [] });
  const [commands, setCommands] = useState([]);
  const [showUninstalledApps, setShowUninstalledApps] = useState(false);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [selected, setSelected] = useState(new Set());
  const [lastAnchor, setLastAnchor] = useState(null);
  const [activeAppId, setActiveAppId] = useState(null);
  const [toast, setToast] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [manageColumnsOpen, setManageColumnsOpen] = useState(false);
  const [hiddenWingetIds, setHiddenWingetIds] = useState([]);
  const [addAppLoading, setAddAppLoading] = useState(false);
  const [addAppForm, setAddAppForm] = useState({
    winget_id: '',
    name: '',
    publisher: '',
    category: 'Utilities',
    icon_url: '',
    is_featured: false,
  });

  const loadData = async () => {
    const [matrixData, commandsData] = await Promise.all([
      api('/api/software/matrix'),
      api('/api/software/commands?limit=250'),
    ]);

    setMatrix({
      devices: Array.isArray(matrixData?.devices) ? matrixData.devices : [],
      apps: Array.isArray(matrixData?.apps) ? matrixData.apps : [],
      installations: Array.isArray(matrixData?.installations) ? matrixData.installations : [],
    });
    setCommands(Array.isArray(commandsData?.commands) ? commandsData.commands : []);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await loadData();
      } catch (err) {
        if (!cancelled) setToast(err.message || 'Failed to load software manager data.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    const interval = setInterval(() => {
      loadData().catch((err) => setToast(err.message || 'Failed to refresh software manager.'));
    }, 60000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(''), 3500);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(COLUMN_PREFS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        setHiddenWingetIds(parsed.filter((id) => typeof id === 'string'));
      }
    } catch {
      setHiddenWingetIds([]);
    }
  }, []);

  useEffect(() => {
    try {
      const v = localStorage.getItem(SHOW_UNINSTALLED_LS_KEY);
      if (v === 'true') setShowUninstalledApps(true);
      else if (v === 'false') setShowUninstalledApps(false);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(SHOW_UNINSTALLED_LS_KEY, showUninstalledApps ? 'true' : 'false');
    } catch {
      /* ignore */
    }
  }, [showUninstalledApps]);

  useEffect(() => {
    localStorage.setItem(COLUMN_PREFS_KEY, JSON.stringify(hiddenWingetIds));
  }, [hiddenWingetIds]);

  useEffect(() => {
    const validIds = new Set(matrix.apps.map((app) => app.winget_id));
    setHiddenWingetIds((prev) => {
      const next = prev.filter((id) => validIds.has(id));
      return next.length === prev.length ? prev : next;
    });
  }, [matrix.apps]);

  const scopedDevices = useMemo(() => {
    if (!deviceIdsAllowlist) return matrix.devices;
    if (deviceIdsAllowlist.size === 0) return [];
    return matrix.devices.filter((d) => deviceIdsAllowlist.has(d.id));
  }, [matrix.devices, deviceIdsAllowlist]);

  const installationsForScope = useMemo(() => {
    if (!deviceIdsAllowlist) return matrix.installations;
    if (deviceIdsAllowlist.size === 0) return [];
    return matrix.installations.filter((inv) => deviceIdsAllowlist.has(inv.device_id));
  }, [matrix.installations, deviceIdsAllowlist]);

  const commandsForScope = useMemo(() => {
    if (!deviceIdsAllowlist) return commands;
    if (deviceIdsAllowlist.size === 0) return [];
    return commands.filter((c) => deviceIdsAllowlist.has(c.device_id));
  }, [commands, deviceIdsAllowlist]);

  const filteredApps = useMemo(() => {
    return matrix.apps.filter((app) => {
      const inCategory = category === 'All' || app.category === category;
      if (!inCategory) return false;
      const hay = `${app.name || ''} ${app.publisher || ''} ${app.winget_id || ''}`.toLowerCase();
      return !search || hay.includes(search.toLowerCase());
    });
  }, [matrix.apps, search, category]);

  const hiddenSet = useMemo(() => new Set(hiddenWingetIds), [hiddenWingetIds]);

  const visibleApps = useMemo(() => {
    return filteredApps.filter((app) => !hiddenSet.has(app.winget_id));
  }, [filteredApps, hiddenSet]);

  const installDeviceCountByWinget = useMemo(() => {
    const sets = new Map();
    installationsForScope.forEach((inv) => {
      const wid = inv?.winget_id;
      if (!wid) return;
      if (!sets.has(wid)) sets.set(wid, new Set());
      sets.get(wid).add(inv.device_id);
    });
    const out = new Map();
    sets.forEach((set, wid) => out.set(wid, set.size));
    return out;
  }, [installationsForScope]);

  const orderedVisibleApps = useMemo(() => {
    const enriched = visibleApps.map((app) => ({
      app,
      installCount: installDeviceCountByWinget.get(app.winget_id) || 0,
    }));
    const installed = enriched
      .filter((e) => e.installCount > 0)
      .sort((a, b) => {
        if (b.installCount !== a.installCount) return b.installCount - a.installCount;
        return String(a.app.name || '').localeCompare(String(b.app.name || ''), undefined, { sensitivity: 'base' });
      });
    const uninstalled = enriched
      .filter((e) => e.installCount === 0)
      .sort((a, b) => String(a.app.name || '').localeCompare(String(b.app.name || ''), undefined, { sensitivity: 'base' }));
    const tail = showUninstalledApps ? uninstalled : [];
    return [...installed, ...tail];
  }, [visibleApps, installDeviceCountByWinget, showUninstalledApps]);

  const installationsByKey = useMemo(() => {
    const map = new Map();
    installationsForScope.forEach((item) => {
      map.set(keyFor(item.device_id, item.winget_id), item);
    });
    return map;
  }, [installationsForScope]);

  const commandStateByKey = useMemo(() => {
    const map = new Map();
    commandsForScope.forEach((cmd) => {
      if (!cmd?.device_id || !cmd?.winget_id) return;
      const k = keyFor(cmd.device_id, cmd.winget_id);
      const current = map.get(k);
      if (!current) {
        map.set(k, cmd);
        return;
      }
      if (new Date(cmd.created_at).getTime() > new Date(current.created_at).getTime()) {
        map.set(k, cmd);
      }
    });
    return map;
  }, [commandsForScope]);

  const activeApp = useMemo(() => {
    return filteredApps.find((a) => String(a.id) === String(activeAppId)) || null;
  }, [filteredApps, activeAppId]);

  const selectedCount = selected.size;

  const toggleCell = (deviceId, wingetId, shiftPressed = false) => {
    const apps = orderedVisibleApps.map((e) => e.app);
    const deviceIndex = scopedDevices.findIndex((d) => d.id === deviceId);
    const appIndex = apps.findIndex((a) => a.winget_id === wingetId);
    if (deviceIndex === -1 || appIndex === -1) return;

    const currentPoint = { deviceIndex, appIndex };
    const currentKey = keyFor(deviceId, wingetId);

    setSelected((prev) => {
      const next = new Set(prev);

      if (shiftPressed && lastAnchor) {
        const minDevice = Math.min(lastAnchor.deviceIndex, currentPoint.deviceIndex);
        const maxDevice = Math.max(lastAnchor.deviceIndex, currentPoint.deviceIndex);
        const minApp = Math.min(lastAnchor.appIndex, currentPoint.appIndex);
        const maxApp = Math.max(lastAnchor.appIndex, currentPoint.appIndex);

        for (let d = minDevice; d <= maxDevice; d += 1) {
          for (let a = minApp; a <= maxApp; a += 1) {
            const device = scopedDevices[d];
            const app = apps[a];
            if (device && app) next.add(keyFor(device.id, app.winget_id));
          }
        }
      } else if (next.has(currentKey)) {
        next.delete(currentKey);
      } else {
        next.add(currentKey);
      }

      return next;
    });

    setLastAnchor(currentPoint);
  };

  const selectColumn = (wingetId, appId) => {
    setSelected((prev) => {
      const next = new Set(prev);
      scopedDevices.forEach((device) => next.add(keyFor(device.id, wingetId)));
      return next;
    });
    setActiveAppId(appId);
  };

  const selectRow = (deviceId) => {
    setSelected((prev) => {
      const next = new Set(prev);
      orderedVisibleApps.forEach(({ app }) => next.add(keyFor(deviceId, app.winget_id)));
      return next;
    });
  };

  const toggleColumnVisibility = (wingetId) => {
    setHiddenWingetIds((prev) => {
      const currentlyHidden = prev.includes(wingetId);
      if (currentlyHidden) {
        return prev.filter((id) => id !== wingetId);
      }
      return [...prev, wingetId];
    });
    setSelected((prev) => {
      const next = new Set(prev);
      Array.from(next).forEach((cellKey) => {
        const [, appWingetId] = cellKey.split('::');
        if (appWingetId === wingetId) next.delete(cellKey);
      });
      return next;
    });
  };

  const selectedPairs = useMemo(() => {
    return Array.from(selected).map((cellKey) => {
      const [deviceId, wingetId] = cellKey.split('::');
      return { deviceId, wingetId };
    });
  }, [selected]);

  const runBulkAction = async (commandType) => {
    if (selectedPairs.length === 0) return;
    setActionLoading(true);
    try {
      const byWinget = selectedPairs.reduce((acc, row) => {
        if (!acc[row.wingetId]) acc[row.wingetId] = [];
        acc[row.wingetId].push(row.deviceId);
        return acc;
      }, {});

      let queuedTotal = 0;
      const wingetIds = Object.keys(byWinget);
      for (let i = 0; i < wingetIds.length; i += 1) {
        const wingetId = wingetIds[i];
        const payload = {
          deviceIds: [...new Set(byWinget[wingetId])],
          wingetId,
          commandType,
        };
        const result = await api('/api/software/commands', { method: 'POST', body: payload });
        queuedTotal += Number(result?.queued || 0);
      }

      setToast(`${queuedTotal} command${queuedTotal === 1 ? '' : 's'} queued.`);
      setSelected(new Set());
      setLastAnchor(null);
      await loadData();
    } catch (err) {
      setToast(err.message || 'Failed to queue commands.');
    } finally {
      setActionLoading(false);
    }
  };

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

  const cellStatus = (deviceId, wingetId) => {
    const command = commandStateByKey.get(keyFor(deviceId, wingetId));
    if (command && ['pending', 'running'].includes(command.status)) {
      return { icon: 'spinner', tone: 'text-brand' };
    }
    if (command && command.status === 'failed') {
      return { icon: 'failed', tone: 'text-red-600', latestVersion: null };
    }

    const installation = installationsByKey.get(keyFor(deviceId, wingetId));
    if (!installation) return { icon: 'none', tone: 'text-slate-300' };
    if (installation.update_available) {
      return { icon: 'update', tone: 'text-amber-500', latestVersion: installation.latest_version || null };
    }
    return { icon: 'installed', tone: 'text-emerald-600', latestVersion: null };
  };

  const appCommandHistory = useMemo(() => {
    if (!activeApp) return [];
    return commands
      .filter((c) => c.winget_id === activeApp.winget_id)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 10);
  }, [commands, activeApp]);

  const renderCell = (device, app) => {
    const cellKey = keyFor(device.id, app.winget_id);
    const isSelected = selected.has(cellKey);
    const status = cellStatus(device.id, app.winget_id);

    let content = null;
    if (status.icon === 'installed') {
      content = <span className="text-2xl font-bold leading-none text-emerald-600">✓</span>;
    } else if (status.icon === 'update') {
      content = (
        <span className="flex flex-col items-center justify-center leading-none">
          <span className="inline-flex min-w-[1.75rem] items-center justify-center rounded-full bg-amber-100 px-1 py-0.5 text-base font-bold text-amber-700 ring-1 ring-amber-200">
            ↑
          </span>
          {status.latestVersion ? (
            <span className="mt-1 max-w-[5rem] truncate text-[10px] font-semibold text-amber-800">{status.latestVersion}</span>
          ) : null}
        </span>
      );
    } else if (status.icon === 'failed') {
      content = <span className="text-lg font-bold text-red-600">✗</span>;
    } else if (status.icon === 'none') {
      content = <span className="block h-6 w-6" aria-hidden />;
    }

    return (
      <td key={cellKey} className="border-b border-fds-border p-0">
        <button
          type="button"
          onClick={(e) => toggleCell(device.id, app.winget_id, e.shiftKey)}
          className={`flex h-12 w-full items-center justify-center text-base transition ${status.tone} ${
            isSelected ? 'bg-blue-50 ring-1 ring-inset ring-brand' : 'hover:bg-slate-50'
          }`}
        >
          {status.icon === 'spinner' ? (
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
          ) : (
            content
          )}
        </button>
      </td>
    );
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <SectionHeader
          className="mb-0"
          title="Software Manager"
          description="Matrix view: green check when installed, amber badge when an update is available, blank when not installed."
        />
        <div className="flex w-full gap-3 lg:w-auto">
          <div className="flex-1 lg:w-80">
            <Input
              label="Search apps"
              placeholder="App name, publisher, winget id"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="relative flex flex-wrap items-end gap-2">
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-fds-border bg-white px-3 py-2 text-sm text-slate-700 shadow-sm ring-1 ring-slate-950/5">
              <input
                type="checkbox"
                checked={showUninstalledApps}
                onChange={(e) => setShowUninstalledApps(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-brand focus:ring-brand"
              />
              Show uninstalled apps
            </label>
            <Button variant="outline" className="h-[42px]" onClick={() => setManageColumnsOpen((prev) => !prev)}>
              Manage Columns
            </Button>
            <Button className="h-[42px]" onClick={() => setAddModalOpen(true)}>Add App</Button>
            {manageColumnsOpen && (
              <div className="absolute right-0 top-[46px] z-30 max-h-80 w-80 overflow-auto rounded-xl border border-fds-border bg-white p-3 shadow-xl ring-1 ring-slate-950/5">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-900">Visible App Columns</p>
                  <button type="button" className="text-xs text-slate-500 hover:text-slate-700" onClick={() => setManageColumnsOpen(false)}>
                    Close
                  </button>
                </div>
                <div className="space-y-2">
                  {matrix.apps.map((app) => {
                    const checked = !hiddenSet.has(app.winget_id);
                    return (
                      <label key={app.id} className="flex items-center justify-between gap-2 rounded px-1 py-1 hover:bg-slate-50">
                        <span className="truncate text-sm text-slate-700">{app.name}</span>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleColumnVisibility(app.winget_id)}
                          className="h-4 w-4 rounded border-slate-300 text-brand focus:ring-brand"
                        />
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {CATEGORY_TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setCategory(tab)}
            className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
              category === tab ? 'bg-brand text-white shadow-sm' : 'border border-fds-border bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      <Card className="border-fds-border p-0 shadow-sm ring-1 ring-slate-950/5">
        {loading ? (
          <div className="p-8 text-sm text-slate-500">Loading software matrix...</div>
        ) : visibleApps.length === 0 ? (
          <div className="p-8 text-sm text-slate-500">No apps match your filters.</div>
        ) : orderedVisibleApps.length === 0 ? (
          <div className="p-8 text-sm text-slate-500">
            All catalogue apps in this view are uninstalled on every device. Turn on &quot;Show uninstalled apps&quot; to list
            those columns.
          </div>
        ) : (
          <>
            <div className="hidden overflow-auto lg:block">
              <table className="min-w-full border-collapse">
                <thead className="sticky top-0 z-20 bg-white">
                  <tr>
                    <th className="sticky left-0 z-30 border-b border-r border-fds-border bg-white px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500">
                      Devices
                    </th>
                    {orderedVisibleApps.map(({ app, installCount }) => {
                      const greyHeader = showUninstalledApps && installCount === 0;
                      const domain = domainForCatalogueApp(app);
                      return (
                        <th
                          key={app.id}
                          className={`min-w-[100px] max-w-[140px] border-b border-fds-border px-2 py-3 text-center ${
                            greyHeader ? 'opacity-60' : ''
                          }`}
                        >
                          <button
                            type="button"
                            className={`flex w-full flex-col items-center gap-1.5 rounded px-1 py-1 text-xs font-semibold text-slate-800 hover:bg-slate-50 ${
                              greyHeader ? 'text-slate-400' : ''
                            }`}
                            onClick={() => selectColumn(app.winget_id, app.id)}
                          >
                            <AppFavicon iconUrl={app.icon_url} domain={domain} />
                            <div className="line-clamp-2 w-full leading-tight">{app.name}</div>
                          </button>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {scopedDevices.map((device) => (
                    <tr key={device.id} className="bg-white">
                      <th className="sticky left-0 z-10 h-12 border-b border-r border-fds-border bg-white px-4 py-2 text-left align-middle">
                        <button
                          type="button"
                          className="flex w-full items-center gap-2 rounded px-1 py-1 text-left hover:bg-slate-50"
                          onClick={() => selectRow(device.id)}
                        >
                          <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${statusColor(device.status)}`} />
                          <span className="max-w-[160px] truncate text-sm font-medium text-slate-900">{device.name}</span>
                        </button>
                      </th>
                      {orderedVisibleApps.map(({ app }) => renderCell(device, app))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="space-y-4 p-4 lg:hidden">
              {scopedDevices.map((device) => (
                <div key={device.id} className="rounded-lg border border-fds-border bg-white p-3 shadow-sm ring-1 ring-slate-950/5">
                  <button
                    type="button"
                    onClick={() => selectRow(device.id)}
                    className="mb-3 flex w-full items-center gap-2 rounded px-1 py-1 text-left hover:bg-slate-50"
                  >
                    <span className={`inline-block h-2 w-2 rounded-full ${statusColor(device.status)}`} />
                    <span className="font-semibold text-slate-900">{device.name}</span>
                  </button>
                  <div className="grid grid-cols-2 gap-2">
                    {orderedVisibleApps.map(({ app, installCount }) => {
                      const status = cellStatus(device.id, app.winget_id);
                      const cellKey = keyFor(device.id, app.winget_id);
                      const isSelected = selected.has(cellKey);
                      const greyHeader = showUninstalledApps && installCount === 0;
                      let right = null;
                      if (status.icon === 'spinner') {
                        right = <span className="inline-block h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent" />;
                      } else if (status.icon === 'installed') {
                        right = <span className="text-2xl font-bold text-emerald-600">✓</span>;
                      } else if (status.icon === 'update') {
                        right = (
                          <span className="flex shrink-0 flex-col items-end leading-none">
                            <span className="inline-flex min-w-[1.5rem] items-center justify-center rounded-full bg-amber-100 px-1 text-base font-bold text-amber-700 ring-1 ring-amber-200">
                              ↑
                            </span>
                            {status.latestVersion ? (
                              <span className="max-w-[4rem] truncate text-[9px] font-semibold text-amber-900">{status.latestVersion}</span>
                            ) : null}
                          </span>
                        );
                      } else if (status.icon === 'failed') {
                        right = <span className="text-base font-bold text-red-600">✗</span>;
                      }
                      return (
                        <button
                          key={cellKey}
                          type="button"
                          onClick={(e) => toggleCell(device.id, app.winget_id, e.shiftKey)}
                          className={`flex items-center justify-between gap-1 rounded border px-2 py-2 text-xs ${
                            isSelected ? 'border-brand bg-blue-50 ring-1 ring-brand' : 'border-fds-border bg-white'
                          }`}
                        >
                          <span className={`min-w-0 flex-1 truncate text-left ${greyHeader ? 'text-slate-400' : 'text-slate-800'}`}>{app.name}</span>
                          <span className={`flex shrink-0 items-center ${status.tone}`}>{right}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </Card>

      {activeApp && (
        <div className="fixed inset-y-0 right-0 z-40 w-full max-w-md border-l border-slate-200 bg-white shadow-2xl">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <h2 className="text-lg font-semibold text-slate-900">{activeApp.name}</h2>
            <button type="button" onClick={() => setActiveAppId(null)} className="text-sm text-slate-500 hover:text-slate-800">
              Close
            </button>
          </div>
          <div className="space-y-4 overflow-auto p-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Publisher</p>
              <p className="text-sm text-slate-800">{activeApp.publisher || 'Unknown'}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Category</p>
              <p className="text-sm text-slate-800">{activeApp.category || 'Other'}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Winget ID</p>
              <p className="text-sm text-slate-800">{activeApp.winget_id}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Description</p>
              <p className="text-sm text-slate-600">
                App details are sourced from your internal catalogue. Add publisher and metadata for richer deployment context.
              </p>
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Recent command history</p>
              <div className="space-y-2">
                {appCommandHistory.length === 0 && <p className="text-sm text-slate-500">No recent commands.</p>}
                {appCommandHistory.map((cmd) => (
                  <div key={cmd.id} className="rounded border border-slate-200 p-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium uppercase text-slate-700">{cmd.command_type}</span>
                      <span className="text-slate-500">{cmd.status}</span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">{cmd.device_name || cmd.device_id}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedCount > 0 && (
        <div className="fixed bottom-4 left-1/2 z-50 w-[95%] max-w-3xl -translate-x-1/2 rounded-xl bg-brand px-4 py-3 text-white shadow-xl">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-semibold">{selectedCount} selected</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" className="!bg-white !text-brand" disabled={actionLoading} onClick={() => runBulkAction('install')}>
                Install
              </Button>
              <Button variant="secondary" className="!bg-white !text-brand" disabled={actionLoading} onClick={() => runBulkAction('update')}>
                Update
              </Button>
              <Button variant="secondary" className="!bg-white !text-brand" disabled={actionLoading} onClick={() => runBulkAction('uninstall')}>
                Uninstall
              </Button>
              <Button variant="secondary" className="!bg-white !text-brand" disabled={actionLoading} onClick={() => runBulkAction('update_all')}>
                Update All
              </Button>
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
              <Input
                label="Name"
                required
                value={addAppForm.name}
                onChange={(e) => setAddAppForm((prev) => ({ ...prev, name: e.target.value }))}
              />
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
                    <option key={tab} value={tab}>{tab}</option>
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
                <Button variant="outline" onClick={() => setAddModalOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={addAppLoading}>
                  {addAppLoading ? 'Adding...' : 'Add App'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed right-4 top-4 z-[60] rounded-lg bg-slate-900 px-4 py-2 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
