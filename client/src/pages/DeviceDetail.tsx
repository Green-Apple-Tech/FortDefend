import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { 
  ArrowLeft, Monitor, Smartphone, RefreshCw, Lock, Power, MessageSquare, 
  Trash2, MapPin, Volume2, Shield, Cpu, HardDrive, MemoryStick, Wifi, 
  Clock, User, Building, CheckCircle, AlertTriangle, XCircle, Terminal,
  Download, Play, MoreVertical, ChevronRight
} from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { ContextMenu, useToast } from '../components/ui/ContextMenu'

// Mock device data
const deviceData = {
  'andretablet': {
    id: 'andretablet',
    name: 'AndreTablet',
    serial: '5F08R14',
    os: 'MS 11 Home',
    osIcon: 'windows',
    status: 'online',
    securityScore: 75,
    lastSeen: 'just now',
    cpu: 12,
    ram: { used: 13.1, total: 16 },
    disk: { used: 250, total: 512, free: 262 },
    agent: '1.0.2',
    user: 'andre@company.com',
    department: 'Engineering',
    enrolled: '2024-01-15',
    model: 'Surface Pro 9',
    manufacturer: 'Microsoft',
    ip: '192.168.1.45',
    mac: '00:1B:44:11:3A:B7',
  },
  'carolepc': {
    id: 'carolepc',
    name: 'CarolePC',
    serial: 'BXBRXR1',
    os: 'MS 10 Pro',
    osIcon: 'windows',
    status: 'online',
    securityScore: 75,
    lastSeen: 'just now',
    cpu: 3,
    ram: { used: 7.0, total: 8 },
    disk: { used: 510, total: 512, free: 2 },
    agent: '1.0.2',
    user: 'carole@company.com',
    department: 'Marketing',
    enrolled: '2024-02-20',
    model: 'ThinkPad X1 Carbon',
    manufacturer: 'Lenovo',
    ip: '192.168.1.67',
    mac: '00:1B:44:11:3A:C8',
  },
}

const performanceData = Array.from({ length: 24 }, (_, i) => ({
  time: `${i}:00`,
  cpu: Math.floor(Math.random() * 40) + 10,
  ram: Math.floor(Math.random() * 30) + 40,
}))

const installedApps = [
  { name: 'Google Chrome', version: '122.0.6261.112', status: 'up-to-date' },
  { name: 'Microsoft Edge', version: '122.0.2365.66', status: 'up-to-date' },
  { name: 'Git', version: '2.43.0', status: 'update-available' },
  { name: 'Visual Studio Code', version: '1.87.0', status: 'up-to-date' },
  { name: 'Zoom', version: '5.17.5', status: 'up-to-date' },
  { name: 'Slack', version: '4.36.140', status: 'up-to-date' },
]

const recentAlerts = [
  { id: 1, type: 'warning', message: 'Disk space running low (< 5GB free)', time: '2 hours ago' },
  { id: 2, type: 'info', message: 'Agent updated to version 1.0.2', time: '1 day ago' },
  { id: 3, type: 'success', message: 'Security scan completed - no threats found', time: '2 days ago' },
]

export default function DeviceDetail() {
  const { deviceId } = useParams<{ deviceId: string }>()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('overview')
  const { showToast, ToastComponent } = useToast()
  
  const device = deviceData[deviceId as keyof typeof deviceData] || deviceData['andretablet']

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'applications', label: 'Applications' },
    { id: 'alerts', label: 'Alerts' },
    { id: 'scripts', label: 'Scripts' },
    { id: 'live-actions', label: 'Live Actions' },
  ]

  const quickActions = [
    { label: 'Lock Device', icon: <Lock className="w-4 h-4" />, onClick: () => showToast('Device locked', 'success') },
    { label: 'Restart', icon: <Power className="w-4 h-4" />, onClick: () => showToast('Restart command sent', 'success') },
    { label: 'Send Message', icon: <MessageSquare className="w-4 h-4" />, onClick: () => showToast('Message dialog opened', 'info') },
    { label: 'Locate', icon: <MapPin className="w-4 h-4" />, onClick: () => showToast('Locating device...', 'info') },
    { label: 'Play Sound', icon: <Volume2 className="w-4 h-4" />, onClick: () => showToast('Playing sound on device', 'success') },
  ]

  const contextMenuItems = [
    { label: 'Refresh', icon: <RefreshCw className="w-4 h-4" />, onClick: () => showToast('Refreshing...', 'info'), shortcut: '⌘R' },
    { label: 'Lock Device', icon: <Lock className="w-4 h-4" />, onClick: () => showToast('Device locked', 'success') },
    { label: 'Restart', icon: <Power className="w-4 h-4" />, onClick: () => showToast('Restart command sent', 'success') },
    { label: 'Send Message', icon: <MessageSquare className="w-4 h-4" />, onClick: () => showToast('Opening message dialog', 'info') },
    { divider: true },
    { label: 'Run Script', icon: <Terminal className="w-4 h-4" />, onClick: () => setActiveTab('scripts') },
    { label: 'View Alerts', icon: <AlertTriangle className="w-4 h-4" />, onClick: () => setActiveTab('alerts') },
    { divider: true },
    { label: 'Wipe Device', icon: <Trash2 className="w-4 h-4" />, onClick: () => showToast('Wipe requires confirmation', 'error'), danger: true },
  ]

  return (
    <ContextMenu items={contextMenuItems}>
      <div className="space-y-6">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm">
          <Link to="/devices" className="text-muted-foreground hover:text-foreground transition-colors">
            Devices
          </Link>
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
          <span className="text-foreground font-medium">{device.name}</span>
        </div>

        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => navigate('/devices')}
              className="p-2 rounded-lg hover:bg-secondary transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-muted-foreground" />
            </button>
            <div className="w-14 h-14 rounded-2xl bg-secondary flex items-center justify-center">
              {device.osIcon === 'windows' ? (
                <Monitor className="w-7 h-7 text-electric-blue" />
              ) : (
                <Smartphone className="w-7 h-7 text-electric-blue" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-foreground">{device.name}</h1>
                <Badge variant={device.status === 'online' ? 'success' : 'secondary'}>
                  {device.status}
                </Badge>
              </div>
              <p className="text-muted-foreground mt-0.5">{device.os} • {device.serial}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {quickActions.slice(0, 3).map((action) => (
              <button
                key={action.label}
                onClick={action.onClick}
                className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border hover:bg-secondary transition-colors text-sm"
              >
                {action.icon}
                <span className="hidden sm:inline">{action.label}</span>
              </button>
            ))}
            <button className="p-2 rounded-lg border border-border hover:bg-secondary transition-colors">
              <MoreVertical className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Live Metrics */}
        <div className="grid grid-cols-4 gap-4">
          <Card className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-foreground">CPU</span>
              <Cpu className="w-4 h-4 text-electric-blue" />
            </div>
            <div className="text-2xl font-bold text-foreground">{device.cpu}%</div>
            <div className="mt-2 h-2 bg-secondary rounded-full overflow-hidden">
              <div 
                className="h-full bg-electric-blue rounded-full transition-all duration-500"
                style={{ width: `${device.cpu}%` }}
              />
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-foreground">RAM</span>
              <MemoryStick className="w-4 h-4 text-emerald-500" />
            </div>
            <div className="text-2xl font-bold text-foreground">{device.ram.used} GB</div>
            <p className="text-xs text-muted-foreground">of {device.ram.total} GB</p>
            <div className="mt-2 h-2 bg-secondary rounded-full overflow-hidden">
              <div 
                className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                style={{ width: `${(device.ram.used / device.ram.total) * 100}%` }}
              />
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-foreground">Disk</span>
              <HardDrive className="w-4 h-4 text-amber-500" />
            </div>
            <div className="text-2xl font-bold text-foreground">{device.disk.free} GB</div>
            <p className="text-xs text-muted-foreground">free of {device.disk.total} GB</p>
            <div className="mt-2 h-2 bg-secondary rounded-full overflow-hidden">
              <div 
                className={`h-full rounded-full transition-all duration-500 ${device.disk.free < 10 ? 'bg-red-500' : 'bg-amber-500'}`}
                style={{ width: `${(device.disk.used / device.disk.total) * 100}%` }}
              />
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-foreground">Security</span>
              <Shield className="w-4 h-4 text-electric-blue" />
            </div>
            <div className="text-2xl font-bold text-foreground">{device.securityScore}</div>
            <p className="text-xs text-muted-foreground">Security score</p>
            <div className="mt-2 h-2 bg-secondary rounded-full overflow-hidden">
              <div 
                className={`h-full rounded-full transition-all duration-500 ${device.securityScore >= 80 ? 'bg-emerald-500' : device.securityScore >= 60 ? 'bg-amber-500' : 'bg-red-500'}`}
                style={{ width: `${device.securityScore}%` }}
              />
            </div>
          </Card>
        </div>

        {/* Tabs */}
        <div className="border-b border-border">
          <div className="flex gap-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-electric-blue text-electric-blue'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tab Content */}
        {activeTab === 'overview' && (
          <div className="grid grid-cols-3 gap-6">
            {/* Device Info */}
            <Card className="col-span-2">
              <CardHeader>
                <CardTitle>Device Information</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  {[
                    { label: 'Model', value: device.model },
                    { label: 'Manufacturer', value: device.manufacturer },
                    { label: 'Serial Number', value: device.serial },
                    { label: 'Operating System', value: device.os },
                    { label: 'IP Address', value: device.ip },
                    { label: 'MAC Address', value: device.mac },
                    { label: 'Assigned User', value: device.user },
                    { label: 'Department', value: device.department },
                    { label: 'Enrolled', value: device.enrolled },
                    { label: 'Agent Version', value: device.agent },
                  ].map((item) => (
                    <div key={item.label} className="flex justify-between py-2 border-b border-border last:border-0">
                      <span className="text-muted-foreground">{item.label}</span>
                      <span className="font-medium text-foreground">{item.value}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Recent Alerts */}
            <Card>
              <CardHeader>
                <CardTitle>Recent Alerts</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {recentAlerts.map((alert) => (
                    <div key={alert.id} className="flex items-start gap-3 p-3 rounded-lg bg-secondary/50">
                      {alert.type === 'warning' && <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5" />}
                      {alert.type === 'info' && <CheckCircle className="w-4 h-4 text-electric-blue mt-0.5" />}
                      {alert.type === 'success' && <CheckCircle className="w-4 h-4 text-emerald-500 mt-0.5" />}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-foreground">{alert.message}</p>
                        <p className="text-xs text-muted-foreground mt-1">{alert.time}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Performance Chart */}
            <Card className="col-span-3">
              <CardHeader>
                <CardTitle>24-Hour Performance</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={performanceData}>
                      <defs>
                        <linearGradient id="cpuGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="ramGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="time" stroke="#64748b" fontSize={12} />
                      <YAxis stroke="#64748b" fontSize={12} />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: 'var(--card)', 
                          border: '1px solid var(--border)',
                          borderRadius: '8px'
                        }}
                      />
                      <Area type="monotone" dataKey="cpu" stroke="#3b82f6" fill="url(#cpuGradient)" name="CPU %" />
                      <Area type="monotone" dataKey="ram" stroke="#10b981" fill="url(#ramGradient)" name="RAM %" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {activeTab === 'applications' && (
          <Card>
            <CardHeader>
              <CardTitle>Installed Applications</CardTitle>
            </CardHeader>
            <CardContent>
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Application</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Version</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Status</th>
                    <th className="text-right py-3 px-4 text-sm font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {installedApps.map((app) => (
                    <tr key={app.name} className="border-b border-border hover:bg-secondary/50 transition-colors">
                      <td className="py-3 px-4 text-foreground font-medium">{app.name}</td>
                      <td className="py-3 px-4 text-muted-foreground">{app.version}</td>
                      <td className="py-3 px-4">
                        <Badge variant={app.status === 'up-to-date' ? 'success' : 'warning'}>
                          {app.status === 'up-to-date' ? 'Up to date' : 'Update available'}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-right">
                        {app.status === 'update-available' && (
                          <button 
                            onClick={() => showToast(`Updating ${app.name}...`, 'info')}
                            className="text-sm text-electric-blue hover:underline"
                          >
                            Update
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}

        {activeTab === 'live-actions' && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {[
              { label: 'Lock Device', icon: <Lock className="w-6 h-6" />, color: 'text-electric-blue' },
              { label: 'Restart', icon: <Power className="w-6 h-6" />, color: 'text-amber-500' },
              { label: 'Locate', icon: <MapPin className="w-6 h-6" />, color: 'text-emerald-500' },
              { label: 'Send Message', icon: <MessageSquare className="w-6 h-6" />, color: 'text-purple-500' },
              { label: 'Play Sound', icon: <Volume2 className="w-6 h-6" />, color: 'text-cyan-500' },
              { label: 'Run Script', icon: <Terminal className="w-6 h-6" />, color: 'text-indigo-500' },
              { label: 'Update Agent', icon: <Download className="w-6 h-6" />, color: 'text-teal-500' },
              { label: 'Refresh', icon: <RefreshCw className="w-6 h-6" />, color: 'text-blue-500' },
              { label: 'Wipe Device', icon: <Trash2 className="w-6 h-6" />, color: 'text-red-500', danger: true },
            ].map((action) => (
              <button
                key={action.label}
                onClick={() => showToast(`${action.label} initiated`, action.danger ? 'error' : 'success')}
                className={`p-6 rounded-xl border border-border hover:bg-secondary transition-all hover:shadow-lg hover:-translate-y-0.5 ${action.danger ? 'hover:border-red-500/50' : ''}`}
              >
                <div className={`mb-3 ${action.color}`}>{action.icon}</div>
                <span className="text-sm font-medium text-foreground">{action.label}</span>
              </button>
            ))}
          </div>
        )}

        {activeTab === 'scripts' && (
          <Card>
            <CardHeader>
              <CardTitle>Available Scripts</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {[
                  { name: 'Clear Temp Files', description: 'Remove temporary files and clear cache', lastRun: '2 days ago' },
                  { name: 'Check Disk Health', description: 'Run SMART diagnostics on all drives', lastRun: '1 week ago' },
                  { name: 'Update All Apps', description: 'Update all managed applications to latest versions', lastRun: 'Never' },
                  { name: 'Collect Logs', description: 'Gather system and application logs for debugging', lastRun: '3 days ago' },
                ].map((script) => (
                  <div key={script.name} className="flex items-center justify-between p-4 rounded-lg border border-border hover:bg-secondary/50 transition-colors">
                    <div>
                      <h4 className="font-medium text-foreground">{script.name}</h4>
                      <p className="text-sm text-muted-foreground">{script.description}</p>
                      <p className="text-xs text-muted-foreground mt-1">Last run: {script.lastRun}</p>
                    </div>
                    <button 
                      onClick={() => showToast(`Running "${script.name}"...`, 'info')}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg bg-electric-blue text-white text-sm font-medium hover:bg-electric-blue/90 transition-colors"
                    >
                      <Play className="w-4 h-4" />
                      Run
                    </button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {activeTab === 'alerts' && (
          <Card>
            <CardHeader>
              <CardTitle>All Alerts</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {[
                  { type: 'warning', message: 'Disk space running low (< 5GB free)', time: '2 hours ago', resolved: false },
                  { type: 'info', message: 'Agent updated to version 1.0.2', time: '1 day ago', resolved: true },
                  { type: 'success', message: 'Security scan completed - no threats found', time: '2 days ago', resolved: true },
                  { type: 'error', message: 'Failed to install Chrome update', time: '3 days ago', resolved: true },
                  { type: 'warning', message: 'High CPU usage detected (>90%)', time: '5 days ago', resolved: true },
                ].map((alert, i) => (
                  <div key={i} className={`flex items-start gap-3 p-4 rounded-lg border ${alert.resolved ? 'border-border bg-secondary/30' : 'border-amber-500/50 bg-amber-500/5'}`}>
                    {alert.type === 'warning' && <AlertTriangle className="w-5 h-5 text-amber-500 mt-0.5" />}
                    {alert.type === 'info' && <CheckCircle className="w-5 h-5 text-electric-blue mt-0.5" />}
                    {alert.type === 'success' && <CheckCircle className="w-5 h-5 text-emerald-500 mt-0.5" />}
                    {alert.type === 'error' && <XCircle className="w-5 h-5 text-red-500 mt-0.5" />}
                    <div className="flex-1">
                      <p className="text-foreground">{alert.message}</p>
                      <p className="text-sm text-muted-foreground mt-1">{alert.time}</p>
                    </div>
                    {!alert.resolved && (
                      <button 
                        onClick={() => showToast('Alert acknowledged', 'success')}
                        className="text-sm text-electric-blue hover:underline"
                      >
                        Acknowledge
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {ToastComponent}
      </div>
    </ContextMenu>
  )
}
