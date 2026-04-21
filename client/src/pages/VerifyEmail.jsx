import { useState, useEffect } from 'react';
import { Link, useSearchParams, useLocation } from 'react-router-dom';
import { api } from '../lib/api';
import { Button, Input } from '../components/ui';

export default function VerifyEmail() {
  const [params] = useSearchParams();
  const location = useLocation();
  const [token, setToken] = useState(params.get('token') || '');
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
    setMessage('');
    setLoading(true);
    try {
      await api('/api/auth/verify-email', { method: 'POST', body: { token } });
      setMessage('Email verified. You can log in.');
    } catch (err) {
      setError(err.message || 'Verification failed.');
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
          <h1 className="mt-6 text-2xl font-semibold text-gray-900">Verify email</h1>
          {location.state?.email && (
            <p className="mt-2 text-sm text-gray-600">We sent a link to {location.state.email}</p>
          )}
        </div>
        <form onSubmit={onSubmit} className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm space-y-4">
          {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
          {message && <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{message}</div>}
          <Input label="Verification token" value={token} onChange={(e) => setToken(e.target.value)} required />
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Verifying…' : 'Verify'}
          </Button>
        </form>
        <p className="mt-6 text-center text-sm">
          <Link to="/login" className="text-brand hover:underline">
            Back to login
          </Link>
        </p>
      </div>
    </div>
  );
}
