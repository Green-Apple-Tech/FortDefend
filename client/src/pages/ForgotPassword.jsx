import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { Button, Input } from '../components/ui';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setMessage('');
    setLoading(true);
    try {
      await api('/api/auth/forgot-password', { method: 'POST', body: { email } });
      setMessage('If an account exists, a reset link has been sent.');
    } catch {
      setMessage('If an account exists, a reset link has been sent.');
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
          <h1 className="mt-6 text-2xl font-semibold text-gray-900">Forgot password</h1>
        </div>
        <form onSubmit={onSubmit} className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm space-y-4">
          {message && <div className="rounded-lg bg-gray-100 px-3 py-2 text-sm text-gray-700">{message}</div>}
          <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Sending…' : 'Send reset link'}
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
