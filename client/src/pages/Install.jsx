import { useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { Card, Button } from '../components/ui';

export default function Install() {
  const { org } = useAuth();
  const enrollUrl = useMemo(() => `${window.location.origin}/install?org=${encodeURIComponent(org?.id || '')}`, [org?.id]);

  const ps = [
    '# FortDefend Windows agent (example — replace with your signed download URL)',
    '$ProgressPreference = "SilentlyContinue"',
    `Invoke-Expression (Invoke-RestMethod -Uri "${enrollUrl}" -ErrorAction Stop)`,
  ].join('\n');

  function copy(text) {
    navigator.clipboard.writeText(text);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Install agent</h1>
        <p className="text-sm text-gray-600">Enroll Windows devices to report Defender telemetry and health.</p>
      </div>

      <Card>
        <h2 className="font-semibold text-gray-900">QR enroll</h2>
        <p className="mt-1 text-sm text-gray-600">Scan on a mobile device to open the install page (placeholder URL).</p>
        <div className="mt-4 flex justify-center rounded-xl border border-dashed border-gray-300 bg-gray-50 p-8">
          <div className="h-40 w-40 rounded-lg bg-white shadow-inner" title="QR placeholder" />
        </div>
        <p className="mt-2 text-center text-xs text-gray-500 break-all">{enrollUrl}</p>
      </Card>

      <Card>
        <h2 className="font-semibold text-gray-900">PowerShell one-liner</h2>
        <p className="mt-1 text-sm text-gray-600">Run in an elevated PowerShell session on the target PC.</p>
        <pre className="mt-4 overflow-x-auto rounded-lg bg-gray-900 p-4 text-xs text-gray-100">{ps}</pre>
        <Button type="button" className="mt-3" variant="outline" onClick={() => copy(ps)}>
          Copy command
        </Button>
      </Card>
    </div>
  );
}
