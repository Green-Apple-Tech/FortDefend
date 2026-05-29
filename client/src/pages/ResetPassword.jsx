import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { Button, Input } from '../components/ui';

export default function ResetPassword() {
  const [params] = useSearchParams();
  const [token, setToken] = useState(params.get('token') || '');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const t = params.get('token');
    if (t) setToken(t);
  }, [params]);

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      await api('/api/auth/reset-password', { method: 'POST', body: { token, password } });
      setMessage('Password updated. You can log in.');
    } catch (err) {
      setError(err.message || 'Reset failed.');
    }
    setLoading(false);
  }

  return (
    <div className="flex min-h-screen flex-col justify-center bg-gray-50 px-4 py-12">
      <div className="mx-auto w-full max-w-md">
        <div className="mb-8 text-center">
          <Link to="/" className="text-2xl font-bold text-brand">
            FortDefend
          </Link>
          <h1 className="mt-6 text-2xl font-semibold text-gray-900">Reset password</h1>
        </div>
        <form onSubmit={onSubmit} className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm space-y-4">
          {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
          {message && <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{message}</div>}
          <Input label="Reset token" value={token} onChange={(e) => setToken(e.target.value)} required />
          <Input label="New password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          <Input label="Confirm password" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Saving…' : 'Update password'}
          </Button>
        </form>
        <p className="mt-6 text-center text-sm">
          <Link to="/login" className="text-brand hover:underline">
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
}
