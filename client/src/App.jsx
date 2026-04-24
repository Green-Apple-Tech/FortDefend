import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
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
import Blueprints from './pages/Blueprints';
import BlueprintDetail from './pages/BlueprintDetail';
import Library from './pages/Library';
import Users from './pages/Users';
import Activity from './pages/Activity';
import Alerts from './pages/Alerts';
import Settings from './pages/Settings';
import Scripts from './pages/Scripts';
import RebootPolicies from './pages/RebootPolicies';
import Reports from './pages/Reports';
import Billing from './pages/Billing';
import Integrations from './pages/Integrations';
import Install from './pages/Install';
import ApiDocs from './pages/ApiDocs';
import Help from './pages/Help';
import MspDashboard from './pages/MspDashboard';
import MspOverview from './pages/MspOverview';

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
              <Route path="/devices/:id" element={<DeviceDetail />} />
              <Route path="/devices" element={<Devices />} />
              <Route path="/blueprints" element={<Blueprints />} />
              <Route path="/blueprints/:id" element={<BlueprintDetail />} />
              <Route path="/library" element={<Library />} />
              <Route path="/users" element={<Users />} />
              <Route path="/activity" element={<Activity />} />
              <Route path="/alerts" element={<Alerts />} />
              <Route path="/install" element={<Install />} />
              <Route path="/integrations" element={<Integrations />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/settings/scripts" element={<Scripts />} />
              <Route path="/settings/reboot-policies" element={<RebootPolicies />} />
              <Route path="/settings/reports" element={<Reports />} />
              <Route path="/settings/billing" element={<Billing />} />
              <Route path="/help" element={<Help />} />
              <Route path="/api-docs" element={<ApiDocs />} />
              <Route path="/setup-2fa" element={<Setup2FA />} />

              <Route path="/groups" element={<Navigate to="/blueprints" replace />} />
              <Route path="/software" element={<Navigate to="/library" replace />} />
              <Route path="/scripts" element={<Navigate to="/settings/scripts" replace />} />
              <Route path="/reboot-policies" element={<Navigate to="/settings/reboot-policies" replace />} />
              <Route path="/reports" element={<Navigate to="/settings/reports" replace />} />
              <Route path="/billing" element={<Navigate to="/settings/billing" replace />} />

              <Route path="/msp" element={<Navigate to="/msp/clients" replace />} />
              <Route path="/msp/clients" element={<MspDashboard />} />
              <Route path="/msp/overview" element={<MspOverview />} />
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
