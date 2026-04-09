import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout from './components/layout/Layout';
import Login from './pages/auth/Login';
import Signup from './pages/auth/Signup';
import Dashboard from './pages/dashboard/Dashboard';
import Devices from './pages/devices/Devices';
import Alerts from './pages/alerts/Alerts';
import ComingSoon from './pages/ComingSoon';

function PrivateRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return (
    <div className="flex items-center justify-center h-screen bg-gray-50">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
    </div>
  );
  return user ? children : <Navigate to="/login" />;
}

function PublicRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  return user ? <Navigate to="/dashboard" /> : children;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
          <Route path="/signup" element={<PublicRoute><Signup /></PublicRoute>} />
          <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
            <Route index element={<Navigate to="/dashboard" />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="devices" element={<Devices />} />
            <Route path="alerts" element={<Alerts />} />
            <Route path="vulnerabilities" element={<ComingSoon title="Vulnerabilities" icon="⚠️" />} />
            <Route path="threats" element={<ComingSoon title="Threats & Detections" icon="🛡️" />} />
            <Route path="patches" element={<ComingSoon title="Patch Management" icon="🔄" />} />
            <Route path="agents" element={<ComingSoon title="AI Agents" icon="🤖" />} />
            <Route path="monitoring" element={<ComingSoon title="Monitoring" icon="📊" />} />
            <Route path="commands" element={<ComingSoon title="Commands" icon="⌨️" />} />
            <Route path="scripts" element={<ComingSoon title="Scripts" icon="📜" />} />
            <Route path="policies" element={<ComingSoon title="Policies" icon="📋" />} />
            <Route path="compliance" element={<ComingSoon title="Compliance" icon="✅" />} />
            <Route path="msp" element={<ComingSoon title="MSP Clients" icon="🏢" />} />
            <Route path="integrations" element={<ComingSoon title="Integrations" icon="🔗" />} />
            <Route path="api-keys" element={<ComingSoon title="API Keys" icon="🔑" />} />
            <Route path="reports" element={<ComingSoon title="Reports" icon="📄" />} />
            <Route path="settings" element={<ComingSoon title="Settings" icon="⚙️" />} />
          </Route>
          <Route path="*" element={<Navigate to="/dashboard" />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
