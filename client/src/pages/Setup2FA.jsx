import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { Button, Input } from '../components/ui';

export default function Setup2FA() {
  const { refreshOrg, refreshUser } = useAuth();
  const [qr, setQr] = useState('');
  const [backupCodes, setBackupCodes] = useState([]);
  const [setupToken, setSetupToken] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api('/api/auth/setup-totp', { method: 'POST' });
        if (!cancelled) {
          setQr(res.qrCodeDataUrl || '');
          setBackupCodes(res.backupCodes || []);
          setSetupToken(res.tempSecret || '');
        }
      } catch (e) {
        if (!cancelled) setError(e.message || 'Could not start 2FA setup.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function onConfirm(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api('/api/auth/confirm-totp', {
        method: 'POST',
        body: { tempSecret: setupToken, code },
      });
      setDone(true);
      await refreshOrg();
      await refreshUser();
    } catch (e) {
      setError(e.message || 'Invalid code.');
    }
    setLoading(false);
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-12">
      <h1 className="text-2xl font-bold text-gray-900">Set up two-factor authentication</h1>
      <p className="mt-2 text-sm text-gray-600">Scan the QR code with your authenticator app, then enter a 6-digit code.</p>
      {loading && <p className="mt-6 text-sm text-gray-500">Loading…</p>}
      {error && <div className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {done && (
        <div className="mt-6 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          2FA is enabled. Store your backup codes in a safe place.
        </div>
      )}
      {!done && qr && (
        <div className="mt-8 space-y-6">
          <div className="flex justify-center rounded-xl border border-gray-200 bg-white p-4">
            <img src={qr} alt="2FA QR" className="h-48 w-48" />
          </div>
          {backupCodes.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Backup codes</h2>
              <pre className="mt-2 overflow-x-auto rounded-lg bg-gray-900 p-3 text-xs text-gray-100">
                {backupCodes.join('\n')}
              </pre>
            </div>
          )}
          <form onSubmit={onConfirm} className="space-y-4">
            <Input label="6-digit code" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} required />
            <Button type="submit" disabled={loading || !setupToken}>
              Confirm and enable 2FA
            </Button>
          </form>
        </div>
      )}
      <p className="mt-8 text-sm">
        <Link to="/dashboard" className="text-brand hover:underline">
          ← Back to dashboard
        </Link>
      </p>
    </div>
  );
}
