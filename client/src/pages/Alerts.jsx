import { useState } from 'react';
import { Card, Button, Badge } from '../components/ui';

const seed = [
  { id: 'a1', type: 'disk_low', severity: 'warning', message: 'Less than 10% free on C:', resolved: false, at: '2026-04-20T10:00:00Z' },
  { id: 'a2', type: 'threat_detection', severity: 'critical', message: 'Defender flagged suspicious script', resolved: false, at: '2026-04-19T15:22:00Z' },
];

export default function Alerts() {
  const [rows, setRows] = useState(seed);
  const [emailOn, setEmailOn] = useState(true);
  const [slackOn, setSlackOn] = useState(false);

  function resolve(id) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, resolved: true } : r)));
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Alerts</h1>
        <p className="text-sm text-gray-600">History and resolution. Wire to `GET /api/orgs/.../alerts` when exposed.</p>
      </div>

      <Card>
        <h2 className="font-semibold text-gray-900">Notification toggles</h2>
        <p className="mt-1 text-sm text-gray-600">Persist via Settings → webhooks (org integration row).</p>
        <div className="mt-4 flex flex-wrap gap-6">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={emailOn} onChange={(e) => setEmailOn(e.target.checked)} />
            Email alerts
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={slackOn} onChange={(e) => setSlackOn(e.target.checked)} />
            Slack mentions
          </label>
        </div>
      </Card>

      <Card className="overflow-x-auto p-0">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left font-semibold">When</th>
              <th className="px-4 py-3 text-left font-semibold">Type</th>
              <th className="px-4 py-3 text-left font-semibold">Severity</th>
              <th className="px-4 py-3 text-left font-semibold">Message</th>
              <th className="px-4 py-3 text-right font-semibold">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((r) => (
              <tr key={r.id} className={r.resolved ? 'bg-gray-50 opacity-70' : ''}>
                <td className="px-4 py-3 whitespace-nowrap text-gray-600">{new Date(r.at).toLocaleString()}</td>
                <td className="px-4 py-3 font-medium text-gray-900">{r.type}</td>
                <td className="px-4 py-3">
                  <Badge tone={r.severity === 'critical' ? 'danger' : 'warning'}>{r.severity}</Badge>
                </td>
                <td className="px-4 py-3 text-gray-600">{r.message}</td>
                <td className="px-4 py-3 text-right">
                  {!r.resolved ? (
                    <Button variant="outline" className="py-1 text-xs" type="button" onClick={() => resolve(r.id)}>
                      Resolve
                    </Button>
                  ) : (
                    <span className="text-xs text-gray-500">Resolved</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
