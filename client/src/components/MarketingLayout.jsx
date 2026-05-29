import { Outlet } from 'react-router-dom';
export function MarketingLayout() {
  return (
    <div className="min-h-screen bg-white">
      <main>
        <Outlet />
      </main>
    </div>
  );
}
