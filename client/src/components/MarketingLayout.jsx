import { Link, Outlet } from 'react-router-dom';

export function MarketingLayout() {
  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-gray-100">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <Link to="/" className="text-xl font-bold text-brand">
            FortDefend
          </Link>
          <nav className="flex items-center gap-4 text-sm font-medium text-gray-600 sm:gap-6">
            <Link to="/pricing" className="hover:text-brand">
              Pricing
            </Link>
            <Link to="/login" className="hover:text-brand">
              Log in
            </Link>
            <Link
              to="/signup"
              className="rounded-lg bg-brand px-4 py-2 text-white hover:bg-brand-dark"
            >
              Start free
            </Link>
          </nav>
        </div>
      </header>
      <main>
        <Outlet />
      </main>
      <footer className="mt-16 border-t border-gray-100 bg-gray-50 py-10">
        <div className="mx-auto max-w-6xl px-4 text-center text-sm text-gray-500 sm:px-6">
          © {new Date().getFullYear()} FortDefend. Secure Windows & Chromebooks.
        </div>
      </footer>
    </div>
  );
}
