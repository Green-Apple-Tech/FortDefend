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

// Mock device data
const deviceData = {
  'andretablet': {
    id: 'andretablet',
    name: 'AndreTablet',
    serial: '5F08R14',
    os: 'MS 10 Pro',
    osIcon: 'windows',
    status: 'online',
    health: 'Healthy',
    securityScore: 75,
    lastSeen: '2026-04-26T23:08:44.230Z',
    cpu: 3,
    ram: { used: 7, total: 8 },
    disk: { used: 510, total: 512, free: 2 },
    agent: '1.0.2',
    user: 'andre@company.com',
    department: 'Engineering',
    enrolled: '2024-01-15',
    model: 'ThinkPad X1 Carbon',
    manufacturer: 'Lenovo',
    ip: '192.168.1.67',
    mac: '00:1B:44:11:3A:C8',
  },
  'carolepc': {
    id: 'carolepc',
    name: 'CarolePC',
    serial: 'BXBRXR1',
    os: 'MS 10 Pro',
    osIcon: 'windows',
    status: 'online',
    health: 'Healthy',
    securityScore: 75,
    lastSeen: '2026-04-26T23:08:44.230Z',
    cpu: 3,
    ram: { used: 7, total: 8 },
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
  cpu: Math.floor(Math.random() * 40) + 20,
}))

const recentAlerts = [
  { id: 1, type: 'warning', message: 'Disk space running low (< 5GB free)', time: '2 hours ago' },
  { id: 2, type: 'info', message: 'Agent updated to version 1.0.2', time: '1 day ago' },
  { id: 3, type: 'success', message: 'Security scan completed - no threats found', time: '2 days ago' },
]

const installedApps = [
  { name: 'Google Chrome', version: '122.0.6261.112', status: 'up-to-date' },
  { name: 'Microsoft Edge', version: '122.0.2365.66', status: 'up-to-date' },
  { name: 'Git', version: '2.43.0', status: 'update-available' },
  { name: 'Visual Studio Code', version: '1.87.0', status: 'up-to-date' },
  { name: 'Zoom', version: '5.17.5', status: 'up-to-date' },
  { name: 'Slack', version: '4.36.140', status: 'up-to-date' },
]

export default function DeviceDetail() {
  const { deviceId } = useParams<{ deviceId: string }>()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('overview')
  
  const device = deviceData[deviceId as keyof typeof deviceData] || deviceData['carolepc']

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'applications', label: 'Applications' },
    { id: 'alerts', label: 'Alerts' },
    { id: 'scripts', label: 'Scripts' },
    { id: 'live-actions', label: 'Live Actions' },
  ]

  const ramPercent = (device.ram.used / device.ram.total) * 100
  const diskPercent = (device.disk.used / device.disk.total) * 100

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link to="/devices" className="hover:text-foreground transition-colors">Devices</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-foreground">{device.name}</span>
      </div>

      {/* Device Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => navigate('/devices')}
            className="w-10 h-10 rounded-lg border border-border flex items-center justify-center hover:bg-secondary transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-muted-foreground" />
          </button>
          <div className="w-12 h-12 rounded-lg bg-secondary flex items-center justify-center">
            <Monitor className="w-6 h-6 text-foreground" />
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-semibold text-foreground">{device.name}</h1>
              <Badge variant="success" className="text-xs">online</Badge>
            </div>
            <p className="text-muted-foreground text-sm">{device.os} - {device.serial}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg hover:bg-secondary transition-colors">
            <Lock className="w-4 h-4" />
            <span className="text-sm">Lock Device</span>
          </button>
          <button className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg hover:bg-secondary transition-colors">
            <RefreshCw className="w-4 h-4" />
            <span className="text-sm">Restart</span>
          </button>
          <button className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg hover:bg-secondary transition-colors">
            <MessageSquare className="w-4 h-4" />
            <span className="text-sm">Send Message</span>
          </button>
          <button className="p-2 border border-border rounded-lg hover:bg-secondary transition-colors">
            <MoreVertical className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Metric Cards with Progress Bars */}
      <div className="grid grid-cols-4 gap-4">
        {/* CPU */}
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-muted-foreground">CPU</span>
            <Cpu className="w-4 h-4 text-muted-foreground" />
          </div>
          <p className="text-2xl font-bold text-foreground mb-2">{device.cpu}%</p>
          <div className="w-full h-2 bg-secondary rounded-full overflow-hidden">
            <div 
              className="h-full bg-electric-blue rounded-full transition-all"
              style={{ width: `${device.cpu}%` }}
            />
          </div>
        </Card>

        {/* RAM */}
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-muted-foreground">RAM</span>
            <MemoryStick className="w-4 h-4 text-emerald" />
          </div>
          <p className="text-2xl font-bold text-foreground mb-1">{device.ram.used} GB</p>
          <p className="text-xs text-muted-foreground mb-2">of {device.ram.total} GB</p>
          <div className="w-full h-2 bg-secondary rounded-full overflow-hidden">
            <div 
              className="h-full bg-emerald rounded-full transition-all"
              style={{ width: `${ramPercent}%` }}
            />
          </div>
        </Card>

        {/* Disk */}
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-muted-foreground">Disk</span>
            <HardDrive className="w-4 h-4 text-danger" />
          </div>
          <p className="text-2xl font-bold text-foreground mb-1">{device.disk.free} GB</p>
          <p className="text-xs text-muted-foreground mb-2">free of {device.disk.total} GB</p>
          <div className="w-full h-2 bg-secondary rounded-full overflow-hidden">
            <div 
              className="h-full bg-danger rounded-full transition-all"
              style={{ width: `${diskPercent}%` }}
            />
          </div>
        </Card>

        {/* Security */}
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-muted-foreground">Security</span>
            <Shield className="w-4 h-4 text-emerald" />
          </div>
          <p className="text-2xl font-bold text-foreground mb-1">{device.securityScore}</p>
          <p className="text-xs text-muted-foreground mb-2">Security score</p>
          <div className="w-full h-2 bg-secondary rounded-full overflow-hidden">
            <div 
              className="h-full bg-emerald rounded-full transition-all"
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
          {/* Device Information */}
          <Card className="col-span-2 p-6">
            <h3 className="text-lg font-semibold text-foreground mb-6">Device Information</h3>
            <div className="grid grid-cols-2 gap-y-4">
              <div className="flex justify-between pr-8">
                <span className="text-muted-foreground">Model</span>
                <span className="text-foreground font-medium">{device.model}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Manufacturer</span>
                <span className="text-foreground font-medium">{device.manufacturer}</span>
              </div>
              <div className="flex justify-between pr-8">
                <span className="text-muted-foreground">Serial Number</span>
                <span className="text-foreground font-medium">{device.serial}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Operating System</span>
                <span className="text-foreground font-medium">{device.os}</span>
              </div>
              <div className="flex justify-between pr-8">
                <span className="text-muted-foreground">IP Address</span>
                <span className="text-foreground font-medium">{device.ip}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">MAC Address</span>
                <span className="text-foreground font-medium">{device.mac}</span>
              </div>
              <div className="flex justify-between pr-8">
                <span className="text-muted-foreground">Assigned User</span>
                <span className="text-foreground font-medium">{device.user}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Department</span>
                <span className="text-foreground font-medium">{device.department}</span>
              </div>
              <div className="flex justify-between pr-8">
                <span className="text-muted-foreground">Enrolled</span>
                <span className="text-foreground font-medium">{device.enrolled}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Agent Version</span>
                <span className="text-foreground font-medium">{device.agent}</span>
              </div>
            </div>
          </Card>

          {/* Recent Alerts */}
          <Card className="p-6">
            <h3 className="text-lg font-semibold text-foreground mb-4">Recent Alerts</h3>
            <div className="space-y-4">
              {recentAlerts.map((alert) => (
                <div key={alert.id} className="flex items-start gap-3">
                  {alert.type === 'warning' && <AlertTriangle className="w-5 h-5 text-warning mt-0.5" />}
                  {alert.type === 'info' && <CheckCircle className="w-5 h-5 text-electric-blue mt-0.5" />}
                  {alert.type === 'success' && <CheckCircle className="w-5 h-5 text-emerald mt-0.5" />}
                  <div>
                    <p className="text-sm text-foreground">{alert.message}</p>
                    <p className="text-xs text-muted-foreground mt-1">{alert.time}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* 24-Hour Performance Chart */}
      {activeTab === 'overview' && (
        <Card className="p-6">
          <h3 className="text-lg font-semibold text-foreground mb-4">24-Hour Performance</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={performanceData}>
                <defs>
                  <linearGradient id="cpuGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis 
                  dataKey="time" 
                  stroke="#64748b" 
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis 
                  stroke="#64748b" 
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                  domain={[0, 80]}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'var(--card)',
                    border: '1px solid var(--border)',
                    borderRadius: '8px'
                  }}
                />
                <Area 
                  type="monotone" 
                  dataKey="cpu" 
                  stroke="#3b82f6" 
                  fillOpacity={1} 
                  fill="url(#cpuGradient)" 
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
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
                        <button className="text-sm text-electric-blue hover:underline">
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
                { name: 'Update Drivers', description: 'Check and update device drivers', lastRun: 'Never' },
                { name: 'Security Scan', description: 'Run full system security scan', lastRun: '3 days ago' },
              ].map((script) => (
                <div
                  key={script.name}
                  className="flex items-center justify-between p-4 rounded-lg border border-border hover:bg-secondary/50 transition-colors"
                >
                  <div>
                    <p className="font-medium text-foreground">{script.name}</p>
                    <p className="text-sm text-muted-foreground">{script.description}</p>
                    <p className="text-xs text-muted-foreground mt-1">Last run: {script.lastRun}</p>
                  </div>
                  <button className="flex items-center gap-2 px-4 py-2 bg-electric-blue text-white rounded-lg hover:bg-electric-blue/90 transition-colors">
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
            <CardTitle>Device Alerts</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {recentAlerts.map((alert) => (
                <div key={alert.id} className="flex items-start gap-3 p-4 rounded-lg border border-border">
                  {alert.type === 'warning' && <AlertTriangle className="w-5 h-5 text-amber-500 mt-0.5" />}
                  {alert.type === 'info' && <CheckCircle className="w-5 h-5 text-electric-blue mt-0.5" />}
                  {alert.type === 'success' && <CheckCircle className="w-5 h-5 text-emerald-500 mt-0.5" />}
                  <div className="flex-1">
                    <p className="text-foreground">{alert.message}</p>
                    <p className="text-sm text-muted-foreground mt-1">{alert.time}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
