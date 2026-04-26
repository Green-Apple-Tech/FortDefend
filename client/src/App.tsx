import { Routes, Route, Navigate } from 'react-router-dom'
import { ThemeProvider } from './context/ThemeContext'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Devices from './pages/Devices'
import DeviceDetail from './pages/DeviceDetail'
import Integrations from './pages/Integrations'
import EnrollDevices from './pages/EnrollDevices'
import Settings from './pages/Settings'

export default function App() {
  return (
    <ThemeProvider>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="devices" element={<Devices />} />
          <Route path="devices/:deviceId" element={<DeviceDetail />} />
          <Route path="integrations" element={<Integrations />} />
          <Route path="enroll" element={<EnrollDevices />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Routes>
    </ThemeProvider>
  )
}
