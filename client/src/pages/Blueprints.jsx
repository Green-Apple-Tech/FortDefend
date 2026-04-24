import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { Card } from '../components/ui';

function flattenGroups(nodes, depth = 0, out = []) {
  if (!Array.isArray(nodes)) return out;
  for (const n of nodes) {
    out.push({ ...n, depth });
    if (n.children?.length) flattenGroups(n.children, depth + 1, out);
  }
  return out;
}

export default function Blueprints() {
  const [tree, setTree] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let c = false;
    (async () => {
      setLoading(true);
      try {
        const res = await api('/api/groups');
        if (!c) setTree(Array.isArray(res?.groups) ? res.groups : []);
      } catch {
        if (!c) setTree([]);
      } finally {
        if (!c) setLoading(false);
      }
    })();
    return () => {
      c = true;
    };
  }, []);

  const rows = flattenGroups(tree);

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-50">Blueprints</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Blueprints bundle patching, app deployments, scripts, and reboot policy for a group of devices.
        </p>
      </div>
      <Card className="border-fds-border overflow-hidden p-0">
        {loading ? (
          <p className="p-6 text-sm text-slate-500">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">No blueprints yet. Create a group to get started.</p>
        ) : (
          <ul className="divide-y divide-fds-border">
            {rows.map((g) => (
              <li key={g.id}>
                <Link
                  to={`/blueprints/${g.id}`}
                  className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/60"
                  style={{ paddingLeft: `${12 + g.depth * 16}px` }}
                >
                  <span className="font-medium text-slate-900 dark:text-slate-100">{g.name}</span>
                  <span className="shrink-0 text-xs tabular-nums text-slate-500">{g.device_count ?? 0} devices</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
