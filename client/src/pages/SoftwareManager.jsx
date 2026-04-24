import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { Button, Card, Input } from '../components/ui';
import { SectionHeader } from '../components/fds';

const CATEGORY_TABS = ['All', 'Browsers', 'Security', 'Productivity', 'Dev Tools', 'Utilities', 'Media'];

const APP_DOMAINS = {
  'Google Chrome': 'chrome.google.com',
  'Mozilla Firefox': 'firefox.com',
  'Microsoft Edge': 'microsoft.com',
  Brave: 'brave.com',
  Opera: 'opera.com',
  Vivaldi: 'vivaldi.com',
  Zoom: 'zoom.us',
  Slack: 'slack.com',
  'Microsoft Teams': 'teams.microsoft.com',
  Discord: 'discord.com',
  Thunderbird: 'thunderbird.net',
  Spotify: 'spotify.com',
  VLC: 'videolan.org',
  Audacity: 'audacityteam.org',
  HandBrake: 'handbrake.fr',
  iTunes: 'apple.com',
  Malwarebytes: 'malwarebytes.com',
  'KeePass 2': 'keepass.info',
  Dropbox: 'dropbox.com',
  'Google Drive': 'drive.google.com',
  OneDrive: 'onedrive.live.com',
  LibreOffice: 'libreoffice.org',
  'Adobe Acrobat Reader': 'adobe.com',
  'Foxit Reader': 'foxit.com',
  SumatraPDF: 'sumatrapdfreader.org',
  GIMP: 'gimp.org',
  'Paint.NET': 'getpaint.net',
  Greenshot: 'getgreenshot.org',
  ShareX: 'getsharex.com',
  Inkscape: 'inkscape.org',
  Blender: 'blender.org',
  Krita: 'krita.org',
  'Visual Studio Code': 'code.visualstudio.com',
  Git: 'git-scm.com',
  'Notepad++': 'notepad-plus-plus.org',
  'Python 3': 'python.org',
  PuTTY: 'putty.org',
  WinSCP: 'winscp.net',
  FileZilla: 'filezilla-project.org',
  '7-Zip': '7-zip.org',
  WinRAR: 'win-rar.com',
  TeamViewer: 'teamviewer.com',
  AnyDesk: 'anydesk.com',
  CCleaner: 'ccleaner.com',
  Everything: 'voidtools.com',
  Cursor: 'cursor.com',
  IrfanView: 'irfanview.com',
};

function domainForAppName(name) {
  const n = String(name || '').trim();
  if (!n) return null;
  if (APP_DOMAINS[n]) return APP_DOMAINS[n];
  return null;
}

function GreyAppIcon({ className = 'mx-auto mb-1 h-8 w-8 text-slate-400' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <rect x="4" y="3" width="16" height="18" rx="2" fill="#f1f5f9" stroke="currentColor" strokeWidth="1.25" />
      <path d="M8 8h8M8 12h8M8 16h5" stroke="#94a3b8" strokeWidth="1.25" strokeLinecap="round" />
    </svg>
  );
}

function AppCatalogueIcon({ appName }) {
  const domain = domainForAppName(appName);
  const [imgFailed, setImgFailed] = useState(false);

  if (!domain || imgFailed) {
    return <GreyAppIcon />;
  }

  return (
    <img
      src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=48`}
      alt=""
      className="mx-auto mb-1 h-8 w-8"
      loading="lazy"
      onError={(e) => {
        e.target.style.display = 'none';
        setImgFailed(true);
      }}
    />
  );
}

export default function SoftwareManager() {
  const [loading, setLoading] = useState(true);
  const [apps, setApps] = useState([]);
  const [installations, setInstallations] = useState([]);
  const [commands, setCommands] = useState([]);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [activeAppId, setActiveAppId] = useState(null);
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

  const loadData = async () => {
    const [matrixData, commandsData] = await Promise.all([
      api('/api/software/matrix'),
      api('/api/software/commands?limit=250'),
    ]);

    setApps(Array.isArray(matrixData?.apps) ? matrixData.apps : []);
    setInstallations(Array.isArray(matrixData?.installations) ? matrixData.installations : []);
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

  const filteredApps = useMemo(() => {
    return apps.filter((app) => {
      const inCategory = category === 'All' || app.category === category;
      if (!inCategory) return false;
      const hay = `${app.name || ''} ${app.publisher || ''} ${app.winget_id || ''}`.toLowerCase();
      return !search || hay.includes(search.toLowerCase());
    });
  }, [apps, search, category]);

  const installDeviceCountByWinget = useMemo(() => {
    const sets = new Map();
    installations.forEach((inv) => {
      const wid = inv?.winget_id;
      if (!wid) return;
      if (!sets.has(wid)) sets.set(wid, new Set());
      sets.get(wid).add(inv.device_id);
    });
    const out = new Map();
    sets.forEach((set, wid) => out.set(wid, set.size));
    return out;
  }, [installations]);

  const sortedApps = useMemo(() => {
    return [...filteredApps].sort((a, b) => {
      const ca = installDeviceCountByWinget.get(a.winget_id) || 0;
      const cb = installDeviceCountByWinget.get(b.winget_id) || 0;
      if (cb !== ca) return cb - ca;
      return String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' });
    });
  }, [filteredApps, installDeviceCountByWinget]);

  const activeApp = useMemo(() => {
    return sortedApps.find((a) => String(a.id) === String(activeAppId)) || null;
  }, [sortedApps, activeAppId]);

  const appCommandHistory = useMemo(() => {
    if (!activeApp) return [];
    return commands
      .filter((c) => c.winget_id === activeApp.winget_id)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 10);
  }, [commands, activeApp]);

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
    <div className="space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <SectionHeader
          className="mb-0"
          title="Software Manager"
          description="Browse your app catalogue, open an app for details and recent commands, or add new Winget entries."
        />
        <div className="flex w-full flex-wrap items-end gap-3 lg:w-auto">
          <div className="min-w-0 flex-1 lg:w-80">
            <Input
              label="Search apps"
              placeholder="App name, publisher, winget id"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Button className="h-[42px]" onClick={() => setAddModalOpen(true)}>
            Add App
          </Button>
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

      <Card className="border-fds-border p-6 shadow-sm ring-1 ring-slate-950/5">
        {loading ? (
          <p className="text-center text-sm text-slate-500">Loading catalogue…</p>
        ) : sortedApps.length === 0 ? (
          <p className="text-center text-sm text-slate-500">No apps match your filters.</p>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {sortedApps.map((app) => {
              const installCount = installDeviceCountByWinget.get(app.winget_id) || 0;
              return (
                <button
                  key={app.id}
                  type="button"
                  onClick={() => setActiveAppId(app.id)}
                  className="flex flex-col items-center rounded-xl border border-transparent px-2 py-3 text-center transition hover:border-fds-border hover:bg-slate-50/80 focus:outline-none focus:ring-2 focus:ring-brand/30"
                >
                  <div className="flex min-h-[2.5rem] w-full flex-col items-center justify-center">
                    <AppCatalogueIcon appName={app.name} />
                  </div>
                  <div className="mt-1 line-clamp-2 w-full text-xs font-medium text-slate-900">{app.name}</div>
                  {installCount > 0 ? (
                    <span className="mt-1 text-[10px] font-medium text-emerald-600">{installCount} device(s)</span>
                  ) : (
                    <span className="mt-1 text-[10px] text-slate-400">Not detected</span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </Card>

      {activeApp && (
        <div className="fixed inset-y-0 right-0 z-40 w-full max-w-md border-l border-fds-border bg-white shadow-2xl">
          <div className="flex items-center justify-between border-b border-fds-border px-5 py-4">
            <h2 className="text-lg font-semibold text-slate-900">{activeApp.name}</h2>
            <button type="button" onClick={() => setActiveAppId(null)} className="text-sm text-slate-500 hover:text-slate-800">
              Close
            </button>
          </div>
          <div className="space-y-4 overflow-auto p-5">
            <div className="flex flex-col items-center border-b border-fds-border pb-4">
              <div className="flex min-h-[3rem] items-center justify-center">
                <AppCatalogueIcon appName={activeApp.name} />
              </div>
              <p className="mt-2 line-clamp-2 text-center text-xs font-medium text-slate-900">{activeApp.name}</p>
            </div>
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
                  <div key={cmd.id} className="rounded border border-fds-border p-2">
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
                <Button variant="outline" onClick={() => setAddModalOpen(false)}>
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
        <div className="fixed right-4 top-4 z-[60] rounded-lg bg-slate-900 px-4 py-2 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
