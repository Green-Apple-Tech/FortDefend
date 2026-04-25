import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const PATH_TITLES = {
  '/dashboard': 'Dashboard',
  '/devices': 'Devices',
  '/integrations': 'Integrations',
  '/install': 'Enroll Devices',
  '/settings': 'Settings',
  '/api-docs': 'API Docs',
  '/setup-2fa': 'Two-factor authentication',
};

function Icon({ children }) {
  return <span className="flex h-4 w-4 shrink-0 items-center justify-center [&>svg]:h-4 [&>svg]:w-4">{children}</span>;
}

const navItems = [
  {
    to: '/dashboard',
    label: 'Dashboard',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
        <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5z" strokeLinejoin="round" />
      </svg>
    ),
  },
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
    to: '/install',
    label: 'Enroll Devices',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
        <path d="M12 5v14M5 12h14" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    to: '/settings',
    label: 'Settings',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
        <circle cx="12" cy="12" r="3" />
        <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" strokeLinecap="round" />
      </svg>
    ),
  },
];

function breadcrumbFromPath(pathname) {
  const title = PATH_TITLES[pathname] || 'FortDefend';
  const parts = pathname.split('/').filter(Boolean);
  if (parts.length <= 1) return ['Home', title];
  return ['Home', ...parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1).replace(/-/g, ' '))];
}

export function AppLayout() {
  const { user, org, logout } = useAuth();
  const { pathname } = useLocation();
  const pageTitle = PATH_TITLES[pathname] || 'FortDefend';
  const crumbs = breadcrumbFromPath(pathname);

  return (
    <div className="min-h-screen bg-fds-page">
      <div className="flex min-h-screen">
        <aside className="fixed inset-y-0 left-0 z-40 hidden w-[220px] shrink-0 flex-col bg-fds-sidebar md:flex">
          <div className="flex h-full flex-col px-3 py-5">
            <Link to="/dashboard" className="mb-8 flex items-center gap-2 px-2 text-white">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-lg" aria-hidden>
                🛡️
              </span>
              <span className="text-lg font-bold tracking-tight">FortDefend</span>
            </Link>

            <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto">
              {navItems.map(({ to, label, icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  className={({ isActive }) =>
                    `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
                      isActive
                        ? 'border-l-2 border-blue-500 bg-white/10 text-white'
                        : 'border-l-2 border-transparent text-white/70 hover:bg-white/5 hover:text-white'
                    }`
                  }
                >
                  <Icon>{icon}</Icon>
                  <span className="truncate">{label}</span>
                </NavLink>
              ))}
            </nav>

            <div className="mt-auto border-t border-white/10 pt-4">
              <div className="flex items-center gap-3 px-2">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
                  {(user?.email || '?').charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-white">{user?.email || '—'}</div>
                  {org?.name && <div className="truncate text-xs text-slate-400">{org.name}</div>}
                </div>
              </div>
              <button
                type="button"
                onClick={() => logout()}
                className="mt-3 w-full rounded-lg px-2 py-2 text-left text-sm text-slate-300 hover:bg-white/5 hover:text-white"
              >
                Log out
              </button>
            </div>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col md:pl-[220px]">
          <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between gap-4 border-b border-fds-border bg-white px-4 shadow-sm sm:px-6">
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-lg font-bold text-slate-900">{pageTitle}</h1>
              <p className="truncate text-xs text-slate-500">{crumbs.join(' · ')}</p>
            </div>
            <div className="hidden items-center gap-3 sm:flex">
              <input
                type="search"
                placeholder="Search…"
                className="w-48 rounded-lg border border-fds-border bg-slate-50 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 lg:w-64"
                readOnly
                title="Fleet search coming soon"
              />
              <button
                type="button"
                className="relative rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                title="Notifications"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0" strokeLinecap="round" />
                </svg>
                <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-danger ring-2 ring-white" />
              </button>
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand text-xs font-bold text-white">
                {(user?.email || '?').charAt(0).toUpperCase()}
              </div>
            </div>
          </header>

          <header className="flex items-center justify-between border-b border-fds-border bg-white px-3 py-2 md:hidden">
            <Link to="/dashboard" className="flex items-center gap-2 font-bold text-slate-900">
              <span className="text-lg">🛡️</span>
              FortDefend
            </Link>
            <button type="button" onClick={() => logout()} className="text-sm font-medium text-brand">
              Log out
            </button>
          </header>
          <div className="border-b border-fds-border bg-white px-2 py-2 md:hidden">
            <div className="flex max-h-36 flex-wrap gap-1 overflow-y-auto">
              {navItems.map(({ to, label, icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  className={({ isActive }) =>
                    `inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium ${
                      isActive ? 'bg-brand text-white' : 'bg-slate-100 text-slate-700'
                    }`
                  }
                >
                  <Icon>{icon}</Icon>
                  {label}
                </NavLink>
              ))}
            </div>
          </div>

          <main className="flex-1 p-4 sm:p-6 lg:p-8">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}
