import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { useAuth } from './context/AuthContext';
import { MarketingLayout } from './components/MarketingLayout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AppLayout } from './components/AppLayout';

import Pricing from './pages/Pricing';
import Login from './pages/Login';
import Signup from './pages/Signup';
import VerifyEmail from './pages/VerifyEmail';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import Setup2FA from './pages/Setup2FA';
import Dashboard from './pages/Dashboard';
import Devices from './pages/Devices';
import DeviceDetail from './pages/DeviceDetail';
import Reports from './pages/Reports';
import Billing from './pages/Billing';
import Settings from './pages/Settings';
import Integrations from './pages/Integrations';
import Install from './pages/Install';
import ApiDocs from './pages/ApiDocs';

function ViewerGuard({ children }) {
  const { user } = useAuth();
  if (user?.role === 'viewer') return <Navigate to="/dashboard" replace />;
  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route element={<MarketingLayout />}>
            <Route path="/" element={<Navigate to="/login" replace />} />
            <Route path="/pricing" element={<Pricing />} />
          </Route>

          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/verify-email" element={<VerifyEmail />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />

          <Route element={<ProtectedRoute />}>
            <Route element={<AppLayout />}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/devices" element={<Devices />} />
              <Route path="/devices/:deviceId" element={<DeviceDetail />} />
              <Route path="/software" element={<Navigate to="/devices?tab=software" replace />} />
              <Route path="/groups" element={<Navigate to="/settings?tab=groups" replace />} />
              <Route path="/reports" element={<Reports />} />
              <Route path="/alerts" element={<Navigate to="/devices?tab=alerts" replace />} />
              <Route path="/billing" element={<Billing />} />
              <Route path="/settings" element={<ViewerGuard><Settings /></ViewerGuard>} />
              <Route path="/integrations" element={<Integrations />} />
              <Route path="/install" element={<Install />} />
              <Route path="/scripts" element={<ViewerGuard><Navigate to="/devices?tab=scripts" replace /></ViewerGuard>} />
              <Route path="/reboot-policies" element={<Navigate to="/devices?tab=reboot" replace />} />
              <Route path="/api-docs" element={<ApiDocs />} />
              <Route path="/msp" element={<Navigate to="/settings?tab=msp" replace />} />
              <Route path="/msp/clients" element={<Navigate to="/settings?tab=msp" replace />} />
              <Route path="/msp/overview" element={<Navigate to="/settings?tab=msp" replace />} />
              <Route path="/setup-2fa" element={<Setup2FA />} />
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}