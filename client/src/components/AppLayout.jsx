import { useEffect, useMemo, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ThemeCycleButton } from '../context/ThemeContext';
import { api } from '../lib/api';

function Icon({ children }) {
  return <span className="flex h-4 w-4 shrink-0 items-center justify-center [&>svg]:h-4 [&>svg]:w-4">{children}</span>;
}

const PATH_TITLES = {
  '/dashboard': 'Dashboard',
  '/devices': 'Devices',
  '/blueprints': 'Blueprints',
  '/library': 'Library',
  '/users': 'Users',
  '/activity': 'Activity',
  '/alerts': 'Alerts',
  '/install': 'Enroll Devices',
  '/integrations': 'Integrations',
  '/settings': 'Settings',
  '/settings/scripts': 'Custom scripts',
  '/settings/reboot-policies': 'Reboot policies',
  '/settings/reports': 'Reports',
  '/settings/billing': 'Billing',
  '/help': 'Help',
  '/api-docs': 'API Docs',
  '/setup-2fa': 'Two-factor authentication',
};

function breadcrumbFromPath(pathname) {
  const title = PATH_TITLES[pathname] || 'FortDefend';
  const parts = pathname.split('/').filter(Boolean);
  if (parts.length <= 1) return ['Home', title];
  return ['Home', ...parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1).replace(/-/g, ' '))];
}

const mainNav = [
  {
    to: '/devices',
    label: 'Devices',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
        <rect x="3" y="4" width="18" height="12" rx="2" />
        <path d="M8 20h8" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    to: '/blueprints',
    label: 'Blueprints',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" strokeLinecap="round" />
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    to: '/library',
    label: 'Library',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" strokeLinecap="round" />
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" strokeLinecap="round" />
        <path d="M8 7h8M8 11h8" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    to: '/users',
    label: 'Users',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" strokeLinecap="round" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    to: '/activity',
    label: 'Activity',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
        <path d="M12 8v4l3 3M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    to: '/alerts',
    label: 'Alerts',
    badge: true,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0" strokeLinecap="round" />
      </svg>
    ),
  },
];

const bottomNav = [
  {
    to: '/install',
    label: 'Enroll Devices',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
        <path d="M12 5v14M5 12h14" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    to: '/integrations',
    label: 'Integrations',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
        <circle cx="12" cy="12" r="3" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    to: '/settings',
    label: 'Settings',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
        <circle cx="12" cy="12" r="3" />
        <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    to: '/help',
    label: 'Help',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
        <circle cx="12" cy="12" r="10" />
        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3M12 17h.01" strokeLinecap="round" />
      </svg>
    ),
  },
];

function navClass(isActive) {
  return `flex items-center gap-3 rounded-lg border-l-[3px] px-3 py-1.5 text-sm font-medium transition ${
    isActive
      ? 'border-brand bg-blue-50/80 text-brand dark:bg-blue-950/50 dark:text-blue-300'
      : 'border-transparent text-slate-600 hover:bg-blue-50/60 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800/60 dark:hover:text-slate-50'
  }`;
}

export function AppLayout() {
  const { user, org, logout } = useAuth();
  const location = useLocation();
  const pathname = location.pathname;
  const [alertCount, setAlertCount] = useState(0);
  const isMsp = user?.role === 'msp';

  useEffect(() => {
    let c = false;
    api('/api/alerts?resolved=false&limit=200')
      .then((res) => {
        if (c) return;
        const n = Array.isArray(res?.alerts) ? res.alerts.length : 0;
        setAlertCount(n);
      })
      .catch(() => {
        if (!c) setAlertCount(0);
      });
    return () => {
      c = true;
    };
  }, [pathname]);

  const pageTitle = useMemo(() => {
    if (PATH_TITLES[pathname]) return PATH_TITLES[pathname];
    if (/^\/devices\/[^/]+$/.test(pathname)) return 'Device';
    if (/^\/blueprints\/[^/]+$/.test(pathname)) return 'Blueprint';
    if (pathname.startsWith('/settings/')) return PATH_TITLES[pathname] || 'Settings';
    return 'FortDefend';
  }, [pathname]);

  const crumbs = breadcrumbFromPath(pathname);

  const flatNav = [...mainNav, ...bottomNav].filter((item) => {
    if (item.to.startsWith('/msp') && !isMsp) return false;
    return true;
  });

  return (
    <div className="min-h-screen bg-fds-page">
      <div className="flex min-h-screen">
        <aside className="fixed inset-y-0 left-0 z-40 hidden w-[220px] shrink-0 flex-col border-r border-fds-border bg-fds-sidebar shadow-sm md:flex">
          <div className="flex h-full flex-col px-3 py-3">
            <Link to="/dashboard" className="mb-4 flex items-center gap-2.5 px-2 text-slate-900 dark:text-slate-50">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand text-white" aria-hidden>
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
              </span>
              <span className="text-lg font-bold tracking-tight text-slate-900 dark:text-slate-50">FortDefend</span>
            </Link>

            <nav className="flex flex-1 flex-col gap-1 overflow-y-auto">
              <p className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">Main</p>
              <div className="flex flex-col gap-0.5">
                {mainNav.map(({ to, label, icon, badge }) => (
                  <NavLink
                    key={to}
                    to={to}
                    className={({ isActive }) => `${navClass(isActive)} ${badge ? 'justify-between' : ''}`}
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <Icon>{icon}</Icon>
                      <span className="truncate">{label}</span>
                    </span>
                    {badge && alertCount > 0 ? (
                      <span className="shrink-0 rounded-full bg-red-600 px-1.5 py-0.5 text-center text-[10px] font-bold text-white">
                        {alertCount > 99 ? '99+' : alertCount}
                      </span>
                    ) : null}
                  </NavLink>
                ))}
              </div>

              <p className="mb-1 mt-4 px-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">Bottom</p>
              <div className="flex flex-col gap-0.5">
                {bottomNav.map(({ to, label, icon }) => (
                  <NavLink key={to} to={to} className={({ isActive }) => navClass(isActive)}>
                    <Icon>{icon}</Icon>
                    <span className="truncate">{label}</span>
                  </NavLink>
                ))}
              </div>
            </nav>

            <div className="mt-auto border-t border-fds-border pt-2">
              <div className="flex items-center gap-3 px-2">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand text-xs font-bold text-white">
                  {(user?.email || '?').charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">{user?.email || '—'}</div>
                  {org?.name && <div className="truncate text-xs text-slate-500 dark:text-slate-400">{org.name}</div>}
                </div>
              </div>
              <button
                type="button"
                onClick={() => logout()}
                className="mt-3 w-full rounded-lg px-2 py-2 text-left text-sm text-slate-500 hover:bg-slate-50 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
              >
                Log out
              </button>
            </div>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col md:pl-[220px]">
          <header className="sticky top-0 z-30 flex h-12 shrink-0 items-center justify-between gap-3 border-b border-fds-border bg-fds-header px-3 shadow-sm sm:px-4">
            <div className="min-w-0 flex-1 leading-tight">
              <h1 className="truncate text-base font-semibold text-slate-900 dark:text-slate-50">{pageTitle}</h1>
              <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">{crumbs.join(' · ')}</p>
            </div>
            <div className="hidden items-center gap-2 sm:flex">
              <input
                type="search"
                placeholder="Search…"
                className="h-8 w-44 rounded-md border border-fds-border bg-fds-card px-2.5 py-1 text-sm text-slate-800 placeholder:text-slate-400 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand/20 dark:text-slate-100 dark:placeholder:text-slate-500 lg:w-56"
                readOnly
                title="Fleet search coming soon"
              />
              <ThemeCycleButton />
              <button
                type="button"
                className="relative rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                title="Notifications"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0" strokeLinecap="round" />
                </svg>
                {alertCount > 0 ? (
                  <span className="absolute right-1 top-1 min-w-[0.5rem] rounded-full bg-danger px-1 text-[9px] font-bold leading-none text-white ring-2 ring-fds-header">
                    {alertCount > 9 ? '9+' : alertCount}
                  </span>
                ) : (
                  <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-danger ring-2 ring-fds-header dark:ring-fds-header" />
                )}
              </button>
              <div className="flex items-center gap-3 border-l border-fds-border pl-4">
                <div className="hidden text-right text-xs leading-tight lg:block">
                  {org?.name && (
                    <div className="max-w-[10rem] truncate font-semibold text-slate-800 dark:text-slate-100">{org.name}</div>
                  )}
                  <div className="max-w-[10rem] truncate text-slate-500 dark:text-slate-400">{user?.email || '—'}</div>
                </div>
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand text-xs font-bold text-white" title={user?.email || undefined}>
                  {(user?.email || '?').charAt(0).toUpperCase()}
                </div>
              </div>
            </div>
          </header>

          <header className="flex items-center justify-between gap-2 border-b border-fds-border bg-fds-header px-3 py-2 md:hidden">
            <Link to="/dashboard" className="flex min-w-0 items-center gap-2 font-bold text-slate-900 dark:text-slate-50">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand text-white">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <span className="truncate">FortDefend</span>
            </Link>
            <div className="flex shrink-0 items-center gap-1">
              <ThemeCycleButton />
              <button type="button" onClick={() => logout()} className="text-sm font-medium text-brand">
                Log out
              </button>
            </div>
          </header>
          <div className="border-b border-fds-border bg-fds-header px-2 py-2 md:hidden">
            <div className="flex max-h-36 flex-wrap gap-1 overflow-y-auto">
              {flatNav.map(({ to, label, icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  className={({ isActive }) =>
                    `inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium ${
                      isActive ? 'bg-brand text-white' : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'
                    }`
                  }
                >
                  <Icon>{icon}</Icon>
                  {label}
                </NavLink>
              ))}
            </div>
          </div>

          <main className="flex-1 bg-fds-page px-4 py-4 sm:px-6">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}
