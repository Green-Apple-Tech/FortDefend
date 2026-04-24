/**
 * FortDefend design system — Kandji structure + Mosyle toggles
 */

export function SectionHeader({ title, description, className = '' }) {
  return (
    <div className={`mb-3 ${className}`}>
      <h1 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-50">{title}</h1>
      {description && <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{description}</p>}
    </div>
  );
}

export function StatusBadge({ status, children }) {
  const s = String(status || '').toLowerCase();
  let cls = 'bg-slate-100 text-slate-700 ring-1 ring-slate-200';
  if (s === 'online' || s === 'success' || s === 'good' || s === 'resolved') {
    cls = 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200';
  } else if (s === 'warning' || s === 'amber' || s === 'high' || s === 'medium') {
    cls = 'bg-amber-50 text-amber-900 ring-1 ring-amber-200';
  } else if (s === 'offline' || s === 'alert' || s === 'critical' || s === 'danger' || s === 'failed') {
    cls = 'bg-red-50 text-red-800 ring-1 ring-red-200';
  } else if (s === 'info' || s === 'low') {
    cls = 'bg-sky-50 text-sky-800 ring-1 ring-sky-200';
  }
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${cls}`}>
      {children}
    </span>
  );
}

export function StatCard({ label, value, trend, icon, color = 'brand' }) {
  const colors = {
    brand: 'text-blue-600',
    success: 'text-emerald-600',
    warning: 'text-amber-600',
    danger: 'text-red-600',
    slate: 'text-slate-800 dark:text-slate-200',
  };
  const c = colors[color] || colors.brand;
  return (
    <div className="rounded-xl border border-fds-border bg-fds-card p-4 shadow-sm ring-1 ring-slate-950/5 dark:ring-slate-950/40">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p>
        {icon && <span className="text-base opacity-80" aria-hidden>{icon}</span>}
      </div>
      <p className={`mt-2 text-2xl font-bold tabular-nums ${c}`}>{value}</p>
      {trend != null && trend !== '' && (
        <p className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400">{trend}</p>
      )}
    </div>
  );
}

export function ToggleCard({
  title,
  description,
  defaultOn = false,
  on,
  onChange,
  icon,
}) {
  const checked = on !== undefined ? on : defaultOn;
  return (
    <div
      className={`flex items-center justify-between gap-4 rounded-xl border border-fds-border bg-fds-card p-4 shadow-sm ring-1 ring-slate-950/5 transition dark:ring-slate-950/40 ${
        checked ? 'border-l-4 border-l-emerald-500 pl-3' : 'border-l-4 border-l-transparent pl-3'
      }`}
    >
      <div className="flex min-w-0 flex-1 gap-3">
        {icon && (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            {icon}
          </div>
        )}
        <div className="min-w-0">
          <p className="font-semibold text-slate-900 dark:text-slate-50">{title}</p>
          {description && <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{description}</p>}
        </div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange?.(!checked)}
        className={`relative inline-flex h-8 w-14 shrink-0 cursor-pointer rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900 ${
          checked ? 'bg-emerald-500' : 'bg-slate-200 dark:bg-slate-600'
        }`}
      >
        <span
          className={`pointer-events-none inline-block h-7 w-7 translate-y-0.5 rounded-full bg-white shadow transition ${
            checked ? 'translate-x-6' : 'translate-x-0.5'
          }`}
        />
      </button>
    </div>
  );
}

export function EmptyState({ icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50/80 px-6 py-16 text-center dark:border-slate-600 dark:bg-slate-800/40">
      {icon && <div className="mb-4 text-4xl text-slate-400 dark:text-slate-500">{icon}</div>}
      <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-50">{title}</h3>
      {description && <p className="mt-2 max-w-md text-sm text-slate-500 dark:text-slate-400">{description}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function PageShell({ children, className = '' }) {
  return <div className={`mx-auto max-w-7xl ${className}`}>{children}</div>;
}
