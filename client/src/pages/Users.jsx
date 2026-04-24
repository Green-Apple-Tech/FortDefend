import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { Card } from '../components/ui';

function formatTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function Users() {
  const [directory, setDirectory] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dirError, setDirError] = useState('');
  const [assignError, setAssignError] = useState('');

  useEffect(() => {
    let c = false;
    (async () => {
      setLoading(true);
      setDirError('');
      setAssignError('');
      const [dirOutcome, assignOutcome] = await Promise.allSettled([
        api('/api/orgs/me/directory'),
        api('/api/orgs/me/device-assignments'),
      ]);
      if (c) return;
      if (dirOutcome.status === 'fulfilled') {
        setDirectory(Array.isArray(dirOutcome.value?.users) ? dirOutcome.value.users : []);
      } else {
        setDirError(dirOutcome.reason?.message || 'Could not load console users.');
        setDirectory([]);
      }
      if (assignOutcome.status === 'fulfilled') {
        setAssignments(
          Array.isArray(assignOutcome.value?.assignments) ? assignOutcome.value.assignments : [],
        );
      } else {
        setAssignError(assignOutcome.reason?.message || 'Could not load device assignments.');
        setAssignments([]);
      }
      setLoading(false);
    })();
    return () => {
      c = true;
    };
  }, []);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-50">Users</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Console accounts in your organization and primary users observed on enrolled devices.
        </p>
      </div>

      <Card className="border-fds-border p-0">
        <div className="border-b border-fds-border px-5 py-4">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-50">Console users</h2>
          <p className="mt-1 text-xs text-slate-500">Admins and viewers who can sign in to FortDefend.</p>
        </div>
        {loading ? (
          <p className="p-5 text-sm text-slate-500">Loading…</p>
        ) : dirError ? (
          <p className="p-5 text-sm text-red-600">{dirError}</p>
        ) : directory.length === 0 ? (
          <p className="p-5 text-sm text-slate-600 dark:text-slate-300">No users found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-fds-border bg-slate-50/80 text-xs uppercase text-slate-500 dark:bg-slate-900/40">
                <tr>
                  <th className="px-5 py-3 font-semibold">Email</th>
                  <th className="px-5 py-3 font-semibold">Role</th>
                  <th className="px-5 py-3 font-semibold">Last sign-in</th>
                </tr>
              </thead>
              <tbody>
                {directory.map((u) => (
                  <tr key={u.id} className="border-b border-fds-border last:border-0">
                    <td className="px-5 py-2.5 font-medium text-slate-900 dark:text-slate-50">{u.email}</td>
                    <td className="px-5 py-2.5 capitalize text-slate-600 dark:text-slate-300">{u.role || '—'}</td>
                    <td className="px-5 py-2.5 text-slate-600 dark:text-slate-300">{formatTime(u.last_login_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="border-fds-border p-0">
        <div className="border-b border-fds-border px-5 py-4">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-50">Users on devices</h2>
          <p className="mt-1 text-xs text-slate-500">
            Labels from <strong className="font-medium text-slate-600 dark:text-slate-300">assigned user</strong> (set on
            the device) or the last <strong className="font-medium text-slate-600 dark:text-slate-300">sign-in</strong>{' '}
            reported by the agent.
          </p>
        </div>
        {loading ? (
          <p className="p-5 text-sm text-slate-500">Loading…</p>
        ) : assignError ? (
          <p className="p-5 text-sm text-red-600">{assignError}</p>
        ) : assignments.length === 0 ? (
          <p className="p-5 text-sm text-slate-600 dark:text-slate-300">
            No primary user labels on devices yet. Assign a user on a{' '}
            <Link to="/devices" className="font-medium text-brand hover:underline">
              device
            </Link>{' '}
            detail page.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-fds-border bg-slate-50/80 text-xs uppercase text-slate-500 dark:bg-slate-900/40">
                <tr>
                  <th className="px-5 py-3 font-semibold">User</th>
                  <th className="px-5 py-3 font-semibold">Source</th>
                  <th className="px-5 py-3 font-semibold text-right">Devices</th>
                </tr>
              </thead>
              <tbody>
                {assignments.map((a, i) => (
                  <tr key={`${a.label}-${i}`} className="border-b border-fds-border last:border-0">
                    <td className="px-5 py-2.5 font-medium text-slate-900 dark:text-slate-50">{a.label}</td>
                    <td className="px-5 py-2.5 capitalize text-slate-600 dark:text-slate-300">{a.source || '—'}</td>
                    <td className="px-5 py-2.5 text-right tabular-nums text-slate-600 dark:text-slate-300">{a.count}</td>
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
