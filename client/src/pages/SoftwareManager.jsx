import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { Button, Card, Input } from '../components/ui';

const CATEGORY_TABS = ['All', 'Browsers', 'Security', 'Productivity', 'Dev Tools', 'Utilities', 'Media'];
const COLUMN_PREFS_KEY = 'software_manager_hidden_columns';

function keyFor(deviceId, wingetId) {
  return `${deviceId}::${wingetId}`;
}

function statusColor(status) {
  if (status === 'online') return 'bg-emerald-500';
  if (status === 'warning') return 'bg-amber-500';
  if (status === 'alert') return 'bg-red-500';
  return 'bg-gray-400';
}

export default function SoftwareManager() {
  const [loading, setLoading] = useState(true);
  const [matrix, setMatrix] = useState({ devices: [], apps: [], installations: [] });
  const [commands, setCommands] = useState([]);
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
    localStorage.setItem(COLUMN_PREFS_KEY, JSON.stringify(hiddenWingetIds));
  }, [hiddenWingetIds]);

  useEffect(() => {
    const validIds = new Set(matrix.apps.map((app) => app.winget_id));
    setHiddenWingetIds((prev) => {
      const next = prev.filter((id) => validIds.has(id));
      return next.length === prev.length ? prev : next;
    });
  }, [matrix.apps]);

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

  const installationsByKey = useMemo(() => {
    const map = new Map();
    matrix.installations.forEach((item) => {
      map.set(keyFor(item.device_id, item.winget_id), item);
    });
    return map;
  }, [matrix.installations]);

  const commandStateByKey = useMemo(() => {
    const map = new Map();
    commands.forEach((cmd) => {
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
  }, [commands]);

  const activeApp = useMemo(() => {
    return filteredApps.find((a) => String(a.id) === String(activeAppId)) || null;
  }, [filteredApps, activeAppId]);

  const selectedCount = selected.size;

  const toggleCell = (deviceId, wingetId, shiftPressed = false) => {
    const apps = visibleApps;
    const deviceIndex = matrix.devices.findIndex((d) => d.id === deviceId);
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
            const device = matrix.devices[d];
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
      matrix.devices.forEach((device) => next.add(keyFor(device.id, wingetId)));
      return next;
    });
    setActiveAppId(appId);
  };

  const selectRow = (deviceId) => {
    setSelected((prev) => {
      const next = new Set(prev);
      visibleApps.forEach((app) => next.add(keyFor(deviceId, app.winget_id)));
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

    const installation = installationsByKey.get(keyFor(deviceId, wingetId));
    if (!installation) return { icon: 'none', tone: 'text-gray-400' };
    if (installation.update_available) return { icon: 'update', tone: 'text-amber-500' };
    return { icon: 'installed', tone: 'text-emerald-600' };
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

    let icon = '—';
    if (status.icon === 'installed') icon = '✓';
    if (status.icon === 'update') icon = '↑';

    return (
      <td key={cellKey} className="border-b border-gray-100 p-0">
        <button
          type="button"
          onClick={(e) => toggleCell(device.id, app.winget_id, e.shiftKey)}
          className={`flex h-11 w-full items-center justify-center text-base transition ${status.tone} ${
            isSelected ? 'bg-blue-100 ring-1 ring-brand' : 'hover:bg-blue-50'
          }`}
        >
          {status.icon === 'spinner' ? (
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
          ) : (
            icon
          )}
        </button>
      </td>
    );
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Software Manager</h1>
          <p className="text-sm text-gray-600">Deploy and maintain Windows apps across your fleet.</p>
        </div>
        <div className="flex w-full gap-3 lg:w-auto">
          <div className="flex-1 lg:w-80">
            <Input
              label="Search apps"
              placeholder="App name, publisher, winget id"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="relative flex items-end gap-2">
            <Button variant="outline" className="h-[42px]" onClick={() => setManageColumnsOpen((prev) => !prev)}>
              Manage Columns
            </Button>
            <Button className="h-[42px]" onClick={() => setAddModalOpen(true)}>Add App</Button>
            {manageColumnsOpen && (
              <div className="absolute right-0 top-[46px] z-30 max-h-80 w-80 overflow-auto rounded-xl border border-gray-200 bg-white p-3 shadow-xl">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-semibold text-gray-900">Visible App Columns</p>
                  <button type="button" className="text-xs text-gray-500 hover:text-gray-700" onClick={() => setManageColumnsOpen(false)}>
                    Close
                  </button>
                </div>
                <div className="space-y-2">
                  {matrix.apps.map((app) => {
                    const checked = !hiddenSet.has(app.winget_id);
                    return (
                      <label key={app.id} className="flex items-center justify-between gap-2 rounded px-1 py-1 hover:bg-gray-50">
                        <span className="truncate text-sm text-gray-700">{app.name}</span>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleColumnVisibility(app.winget_id)}
                          className="h-4 w-4 rounded border-gray-300 text-brand focus:ring-brand"
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
              category === tab ? 'bg-brand text-white' : 'bg-white text-gray-600 hover:bg-gray-100'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      <Card className="p-0">
        {loading ? (
          <div className="p-8 text-sm text-gray-500">Loading software matrix...</div>
        ) : visibleApps.length === 0 ? (
          <div className="p-8 text-sm text-gray-500">No apps match your filters.</div>
        ) : (
          <>
            <div className="hidden overflow-auto lg:block">
              <table className="min-w-full border-collapse">
                <thead className="sticky top-0 z-20 bg-white">
                  <tr>
                    <th className="sticky left-0 z-30 border-b border-r border-gray-200 bg-white px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Devices
                    </th>
                    {visibleApps.map((app) => (
                      <th key={app.id} className="min-w-[120px] border-b border-gray-200 px-2 py-3 text-center">
                        <button
                          type="button"
                          className="w-full rounded px-2 py-1 text-xs font-semibold text-gray-700 hover:bg-blue-50"
                          onClick={() => selectColumn(app.winget_id, app.id)}
                        >
                          <div className="truncate">{app.name}</div>
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {matrix.devices.map((device) => (
                    <tr key={device.id} className="bg-white">
                      <th className="sticky left-0 z-10 border-b border-r border-gray-100 bg-white px-4 py-2 text-left">
                        <button
                          type="button"
                          className="flex w-full items-center gap-2 rounded px-1 py-1 text-left hover:bg-blue-50"
                          onClick={() => selectRow(device.id)}
                        >
                          <span className={`inline-block h-2.5 w-2.5 rounded-full ${statusColor(device.status)}`} />
                          <span className="max-w-[200px] truncate text-sm font-medium text-gray-800">{device.name}</span>
                        </button>
                      </th>
                      {visibleApps.map((app) => renderCell(device, app))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="space-y-4 p-4 lg:hidden">
              {matrix.devices.map((device) => (
                <div key={device.id} className="rounded-lg border border-gray-200 p-3">
                  <button
                    type="button"
                    onClick={() => selectRow(device.id)}
                    className="mb-3 flex w-full items-center gap-2 rounded px-1 py-1 text-left hover:bg-blue-50"
                  >
                    <span className={`inline-block h-2.5 w-2.5 rounded-full ${statusColor(device.status)}`} />
                    <span className="font-semibold text-gray-900">{device.name}</span>
                  </button>
                  <div className="grid grid-cols-2 gap-2">
                    {visibleApps.map((app) => {
                      const status = cellStatus(device.id, app.winget_id);
                      const cellKey = keyFor(device.id, app.winget_id);
                      const isSelected = selected.has(cellKey);
                      return (
                        <button
                          key={cellKey}
                          type="button"
                          onClick={(e) => toggleCell(device.id, app.winget_id, e.shiftKey)}
                          className={`flex items-center justify-between rounded border px-2 py-2 text-xs ${
                            isSelected ? 'border-brand bg-blue-100' : 'border-gray-200 bg-white'
                          }`}
                        >
                          <span className="truncate text-left">{app.name}</span>
                          <span className={status.tone}>
                            {status.icon === 'spinner' ? <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" /> : status.icon === 'installed' ? '✓' : status.icon === 'update' ? '↑' : '—'}
                          </span>
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
        <div className="fixed inset-y-0 right-0 z-40 w-full max-w-md border-l border-gray-200 bg-white shadow-2xl">
          <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
            <h2 className="text-lg font-semibold text-gray-900">{activeApp.name}</h2>
            <button type="button" onClick={() => setActiveAppId(null)} className="text-sm text-gray-500 hover:text-gray-800">
              Close
            </button>
          </div>
          <div className="space-y-4 overflow-auto p-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Publisher</p>
              <p className="text-sm text-gray-800">{activeApp.publisher || 'Unknown'}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Category</p>
              <p className="text-sm text-gray-800">{activeApp.category || 'Other'}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Winget ID</p>
              <p className="text-sm text-gray-800">{activeApp.winget_id}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Description</p>
              <p className="text-sm text-gray-600">
                App details are sourced from your internal catalogue. Add publisher and metadata for richer deployment context.
              </p>
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Recent command history</p>
              <div className="space-y-2">
                {appCommandHistory.length === 0 && <p className="text-sm text-gray-500">No recent commands.</p>}
                {appCommandHistory.map((cmd) => (
                  <div key={cmd.id} className="rounded border border-gray-200 p-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium uppercase text-gray-700">{cmd.command_type}</span>
                      <span className="text-gray-500">{cmd.status}</span>
                    </div>
                    <p className="mt-1 text-xs text-gray-500">{cmd.device_name || cmd.device_id}</p>
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
            <h2 className="text-lg font-semibold text-gray-900">Add App to Catalogue</h2>
            <p className="mt-1 text-sm text-gray-600">Enter Winget ID and application metadata.</p>
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
                <span className="mb-1 block text-sm font-medium text-gray-700">Category</span>
                <select
                  value={addAppForm.category}
                  onChange={(e) => setAddAppForm((prev) => ({ ...prev, category: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
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
              <label className="flex items-center gap-2 text-sm text-gray-700">
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
        <div className="fixed right-4 top-4 z-[60] rounded-lg bg-gray-900 px-4 py-2 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
