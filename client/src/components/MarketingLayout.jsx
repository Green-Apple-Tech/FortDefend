import { Outlet } from 'react-router-dom';
export function MarketingLayout() {
  return (
    <div className="min-h-screen bg-fds-page text-slate-900 dark:text-slate-100">
      <main>
        <Outlet />
      </main>
    </div>
  );
}
