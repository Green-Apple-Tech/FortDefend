export function Button({ children, className = '', variant = 'primary', type = 'button', ...props }) {
  const base =
    'inline-flex items-center justify-center rounded-lg px-4 py-2.5 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2 disabled:opacity-50';
  const variants = {
    primary: 'bg-brand text-white shadow-sm hover:bg-brand-dark',
    secondary:
      'bg-brand-light text-brand hover:bg-blue-100 dark:bg-blue-950/40 dark:text-blue-200 dark:hover:bg-blue-950/60',
    outline:
      'border border-fds-border bg-fds-card text-slate-800 shadow-sm hover:bg-slate-50 dark:text-slate-100 dark:hover:bg-slate-800/80',
    danger: 'bg-danger text-white shadow-sm hover:bg-red-600',
  };
  return (
    <button type={type} className={`${base} ${variants[variant] || variants.primary} ${className}`} {...props}>
      {children}
    </button>
  );
}

export function Input({ label, className = '', id, ...props }) {
  const inputId = id || (label && label.replace(/\s+/g, '-').toLowerCase());
  return (
    <label className="block">
      {label && (
        <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">{label}</span>
      )}
      <input
        id={inputId}
        className={`w-full rounded-lg border border-fds-border bg-fds-card px-3 py-2.5 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 dark:text-slate-100 dark:placeholder:text-slate-500 ${className}`}
        {...props}
      />
    </label>
  );
}

export function Card({ children, className = '', ...props }) {
  return (
    <div
      className={`rounded-xl border border-fds-border bg-fds-card p-6 shadow-sm ring-1 ring-slate-950/5 dark:ring-slate-950/40 ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

export function Badge({ children, tone = 'default' }) {
  const tones = {
    default: 'bg-slate-100 text-slate-800 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-600',
    success: 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200',
    warning: 'bg-amber-50 text-amber-900 ring-1 ring-amber-200',
    danger: 'bg-red-50 text-red-800 ring-1 ring-red-200',
    brand: 'bg-brand-light text-brand ring-1 ring-blue-200',
  };
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${tones[tone]}`}>{children}</span>
  );
}

export function Spinner() {
  return (
    <div className="flex justify-center py-12">
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-brand border-t-transparent" />
    </div>
  );
}

export function HelpTip({ text }) {
  return (
    <button
      type="button"
      title={text}
      className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-gray-200 text-[10px] font-bold text-gray-700 hover:bg-gray-300"
    >
      ?
    </button>
  );
}
