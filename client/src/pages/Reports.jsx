import { useMemo, useState } from 'react';
import { Card, Button } from '../components/ui';

const demoPatches = [
  { id: '1', device: 'LAPTOP-01', app: 'Google Chrome', from: '120.0', to: '121.0', status: 'success', at: '2026-04-20' },
  { id: '2', device: 'LAPTOP-02', app: '7-Zip', from: '22.01', to: '23.01', status: 'failed', at: '2026-04-19' },
  { id: '3', device: 'CB-12', app: 'OS update', from: '114', to: '115', status: 'success', at: '2026-04-18' },
];

export default function Reports() {
  const [rows] = useState(demoPatches);

  const csv = useMemo(() => {
    const header = ['device', 'app', 'from', 'to', 'status', 'date'];
    const lines = [header.join(',')].concat(
      rows.map((r) => [r.device, r.app, r.from, r.to, r.status, r.at].map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
    );
    return lines.join('\n');
  }, [rows]);

  function exportCsv() {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fortdefend-patch-history-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
          <p className="text-sm text-gray-600">Patch history and exports. Connect the API to live `patch_history` when available.</p>
        </div>
        <Button variant="outline" onClick={exportCsv}>
          Export CSV
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <p className="text-sm text-gray-500">Patches (30d)</p>
          <p className="text-2xl font-bold text-gray-900">{rows.length}</p>
        </Card>
        <Card>
          <p className="text-sm text-gray-500">Success rate</p>
          <p className="text-2xl font-bold text-emerald-600">67%</p>
        </Card>
        <Card>
          <p className="text-sm text-gray-500">Mean time to patch</p>
          <p className="text-2xl font-bold text-brand">18h</p>
        </Card>
      </div>

      <Card className="overflow-x-auto p-0">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left font-semibold">Device</th>
              <th className="px-4 py-3 text-left font-semibold">Application</th>
              <th className="px-4 py-3 text-left font-semibold">Version</th>
              <th className="px-4 py-3 text-left font-semibold">Status</th>
              <th className="px-4 py-3 text-left font-semibold">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-3 font-medium text-gray-900">{r.device}</td>
                <td className="px-4 py-3 text-gray-600">{r.app}</td>
                <td className="px-4 py-3 text-gray-600">
                  {r.from} → {r.to}
                </td>
                <td className="px-4 py-3">
                  <span className={r.status === 'success' ? 'text-emerald-700' : 'text-red-700'}>{r.status}</span>
                </td>
                <td className="px-4 py-3 text-gray-600">{r.at}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
