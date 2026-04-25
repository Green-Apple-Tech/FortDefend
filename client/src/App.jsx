import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { MarketingLayout } from './components/MarketingLayout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AppLayout } from './components/AppLayout';

import Landing from './pages/Landing';
import Pricing from './pages/Pricing';
import Login from './pages/Login';
import Signup from './pages/Signup';
import VerifyEmail from './pages/VerifyEmail';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import Setup2FA from './pages/Setup2FA';
import Dashboard from './pages/Dashboard';
import Devices from './pages/Devices';
import Reports from './pages/Reports';
import Alerts from './pages/Alerts';
import Billing from './pages/Billing';
import Settings from './pages/Settings';
import Integrations from './pages/Integrations';
import Install from './pages/Install';
import Scripts from './pages/Scripts';
import RebootPolicies from './pages/RebootPolicies';
import MspDashboard from './pages/MspDashboard';
import MspOverview from './pages/MspOverview';
import ApiDocs from './pages/ApiDocs';
import Groups from './pages/groups';
import SoftwareManager from './pages/SoftwareManager';

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
              <Route path="/software" element={<ProtectedRoute><SoftwareManager /></ProtectedRoute>} />
              <Route path="/groups" element={<Groups />} />
              <Route path="/reports" element={<Reports />} />
              <Route path="/alerts" element={<Alerts />} />
              <Route path="/billing" element={<Billing />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/integrations" element={<Integrations />} />
              <Route path="/install" element={<Install />} />
              <Route path="/scripts" element={<Scripts />} />
              <Route path="/reboot-policies" element={<RebootPolicies />} />
              <Route path="/api-docs" element={<ApiDocs />} />
              <Route path="/msp" element={<Navigate to="/msp/clients" replace />} />
              <Route path="/msp/clients" element={<MspDashboard />} />
              <Route path="/msp/overview" element={<MspOverview />} />
              <Route path="/setup-2fa" element={<Setup2FA />} />
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}