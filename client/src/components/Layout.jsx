import { NavLink, Outlet } from 'react-router-dom';

const links = [
  { to: '/dashboard/patch', label: 'Overview', end: true },
  { to: '/dashboard/patch/devices', label: 'Devices' },
  { to: '/dashboard/patch/catalog', label: 'App Catalog' },
  { to: '/dashboard/patch/history', label: 'Patch History' },
  { to: '/dashboard/patch/policies', label: 'Policies' },
];

export default function Layout() {
  return (
    <div className="min-h-screen flex">
      <aside className="w-64 bg-slate-900 text-white p-5">
        <div className="text-xl font-bold mb-1">FortDefend</div>
        <div className="text-xs text-slate-400 mb-8">Patch Manager</div>
        <nav className="space-y-1">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              className={({ isActive }) =>
                `block rounded px-3 py-2 text-sm ${isActive ? 'bg-blue-600' : 'hover:bg-slate-800'}`
              }
            >
              {link.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="flex-1 p-8">
        <Outlet />
      </main>
    </div>
  );
}
