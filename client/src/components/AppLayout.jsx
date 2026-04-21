import { Link, NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Banner2FA } from './Banner2FA';

const nav = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/devices', label: 'Devices' },
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
  const mspNav = [
    { to: '/msp/clients', label: 'My Clients' },
    { to: '/msp/overview', label: 'MSP Overview' },
  ];
  const navItems = user?.role === 'msp' ? [...mspNav, ...nav] : nav;

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
              {navItems.map(({ to, label }) => (
                <NavLink
                  key={to}
                  to={to}
                  className={({ isActive }) =>
                    `rounded-lg px-3 py-2 text-sm font-medium ${isActive ? 'bg-brand-light text-brand' : 'text-gray-600 hover:bg-gray-50'}`
                  }
                >
                  {label}
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
              {navItems.map(({ to, label }) => (
                <NavLink
                  key={to}
                  to={to}
                  className={({ isActive }) =>
                    `rounded-md px-2 py-1 text-xs font-medium ${isActive ? 'bg-brand text-white' : 'text-gray-600'}`
                  }
                >
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
