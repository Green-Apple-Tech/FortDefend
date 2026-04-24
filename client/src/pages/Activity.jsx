import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Card } from '../components/ui';

function formatTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString();
}

export default function Activity() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let c = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const res = await api('/api/orgs/me/activity?limit=400');
        if (!c) setEntries(Array.isArray(res?.entries) ? res.entries : []);
      } catch (e) {
        if (!c) setError(e.message || 'Could not load activity.');
      } finally {
        if (!c) setLoading(false);
      }
    })();
    return () => {
      c = true;
    };
  }, []);

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-50">Activity</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Audit log of changes and actions recorded for your organization.
        </p>
      </div>

      <Card className="border-fds-border overflow-hidden p-0">
        {loading ? (
          <p className="p-6 text-sm text-slate-500">Loading…</p>
        ) : error ? (
          <p className="p-6 text-sm text-red-600">{error}</p>
        ) : entries.length === 0 ? (
          <p className="p-6 text-sm text-slate-600 dark:text-slate-300">
            No audit entries yet. Saving a blueprint or editing a device’s user or asset tag will appear here.
          </p>
        ) : (
          <div className="max-h-[70vh] overflow-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="sticky top-0 border-b border-fds-border bg-fds-card text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">Time</th>
                  <th className="px-4 py-3 font-semibold">Action</th>
                  <th className="px-4 py-3 font-semibold">Actor</th>
                  <th className="px-4 py-3 font-semibold">Resource</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id} className="border-b border-fds-border last:border-0">
                    <td className="whitespace-nowrap px-4 py-2.5 text-slate-600 dark:text-slate-300">{formatTime(e.created_at)}</td>
                    <td className="px-4 py-2.5 font-medium text-slate-900 dark:text-slate-50">
                      {String(e.action || '').replace(/_/g, ' ')}
                    </td>
                    <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">{e.actor_email || '—'}</td>
                    <td className="max-w-md break-all px-4 py-2.5 text-slate-600 dark:text-slate-300">
                      {e.resource || '—'}
                      {e.details && typeof e.details === 'object' && e.details.groupName ? (
                        <span className="mt-0.5 block text-xs text-slate-500">{e.details.groupName}</span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
