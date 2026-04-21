import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export function Banner2FA() {
  const { needs2FASetup } = useAuth();
  if (!user || !needs2FASetup) return null;
  return (
    <div className="border-b border-amber-200 bg-amber-50 px-4 py-3 text-center text-sm text-amber-900">
      <strong>Protect your account:</strong> enable two-factor authentication on the{' '}
      <Link to="/setup-2fa" className="font-semibold text-brand underline">
        2FA setup page
      </Link>
      .
    </div>
  );
}
