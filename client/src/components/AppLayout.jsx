
import { Link, NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Banner2FA } from './Banner2FA';

const nav = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/groups', label: 'Groups' },
  { to: '/devices', label: 'Devices' },
  {
    to: '/software',
    label: 'Software Manager',
    icon: (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
        <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
        <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
        <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
        <path d="M15 13h4.5a1.5 1.5 0 0 1 1.5 1.5V19a1.5 1.5 0 0 1-1.5 1.5H15a1.5 1.5 0 0 1-1.5-1.5v-4.5A1.5 1.5 0 0 1 15 13z" />
      </svg>
    ),
  },
  { to: '/reports', label: 'Reports' },
  { to: '/alerts', label: 'Alerts' },
  { to: '/billing', label: 'Billing' },
  { to: '/integrations', label: 'Integrations' },
  { to: '/install', label: 'Install' },
  { to: '/scripts', label: 'Scripts' },
  { to: '/reboot-policies', label: 'Reboot Policies' },
  { to: '/settings', label: 'Settings' },
];

export function AppLayout() {
  const { user, org, logout } = useAuth();

  return (
    <div className="min-h-screen bg-gray-50">
      <Banner2FA />
      <div className="flex min-h-screen">
        <aside className="hidden w-56 shrink-0 border-r border-gray-200 bg-white md:block">
          <div className="flex h-full flex-col p-4">
            <div className="mb-6 flex items-center gap-2">
              <Link to="/dashboard" className="text-lg font-bold text-brand">
                FortDefend
              </Link>
              {user?.role === 'msp' && (
                <span className="rounded-full bg-brand-light px-2 py-0.5 text-[10px] font-semibold uppercase text-brand">
                  MSP
                </span>
              )}
            </div>
            <nav className="flex flex-1 flex-col gap-1">
              {nav.map(({ to, label, icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  className={({ isActive }) =>
                    `rounded-lg px-3 py-2 text-sm font-medium ${isActive ? 'bg-brand-light text-brand' : 'text-gray-600 hover:bg-gray-50'}`
                  }
                >
                  <span className="flex items-center gap-2">
                    {icon || <span className="h-4 w-4" />}
                    <span>{label}</span>
                  </span>
                </NavLink>
              ))}
            </nav>
            <div className="mt-auto border-t border-gray-100 pt-4 text-xs text-gray-500">
              <div className="truncate font-medium text-gray-800">{user?.email}</div>
              {org?.name && <div className="truncate">{org.name}</div>}
              <button type="button" onClick={() => logout()} className="mt-2 text-brand hover:underline">
                Log out
              </button>
            </div>
          </div>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3 md:hidden">
            <div className="flex items-center gap-2">
              <Link to="/dashboard" className="font-bold text-brand">
                FortDefend
              </Link>
              {user?.role === 'msp' && (
                <span className="rounded-full bg-brand-light px-2 py-0.5 text-[10px] font-semibold uppercase text-brand">
                  MSP
                </span>
              )}
            </div>
            <button type="button" onClick={() => logout()} className="text-sm text-brand">
              Log out
            </button>
          </header>
          <div className="border-b border-gray-200 bg-white px-2 py-2 md:hidden">
            <div className="flex flex-wrap gap-1">
              {nav.map(({ to, label, icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  className={({ isActive }) =>
                    `rounded-md px-2 py-1 text-xs font-medium ${isActive ? 'bg-brand text-white' : 'text-gray-600'}`
                  }
                >
                  <span className="flex items-center gap-1">
                    {icon}
                    <span>{label}</span>
                  </span>
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