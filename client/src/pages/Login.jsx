import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Button, Input } from '../components/ui';

export default function Login() {
  const { login, completeTotpLogin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from || '/dashboard';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totp, setTotp] = useState('');
  const [tempToken, setTempToken] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (tempToken) {
        const r = await completeTotpLogin(tempToken, totp);
        if (!r.ok) {
          setError('Invalid code. Try again.');
          setLoading(false);
          return;
        }
        navigate(from, { replace: true });
        return;
      }
      const res = await login(email, password);
      if (res.requiresTOTP && res.tempToken) {
        setTempToken(res.tempToken);
        setLoading(false);
        return;
      }
      if (res.ok) {
        navigate(from, { replace: true });
        return;
      }
      setError('Login failed.');
    } catch (err) {
      setError(err.message || 'Login failed.');
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
          <h1 className="mt-6 text-2xl font-semibold text-gray-900">Sign in</h1>
          <p className="mt-1 text-sm text-gray-600">Use your work email and password.</p>
        </div>
        <form onSubmit={onSubmit} className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm space-y-4">
          {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
          {!tempToken ? (
            <>
              <Input label="Email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              <Input
                label="Password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </>
          ) : (
            <Input
              label="Two-factor code"
              inputMode="numeric"
              pattern="\d{6}"
              maxLength={6}
              placeholder="000000"
              value={totp}
              onChange={(e) => setTotp(e.target.value)}
              required
            />
          )}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Signing in…' : tempToken ? 'Verify' : 'Continue'}
          </Button>
        </form>
        <p className="mt-6 text-center text-sm text-gray-600">
          <Link to="/forgot-password" className="text-brand hover:underline">
            Forgot password?
          </Link>
          {' · '}
          <Link to="/signup" className="text-brand hover:underline">
            Create account
          </Link>
        </p>
      </div>
    </div>
  );
}
