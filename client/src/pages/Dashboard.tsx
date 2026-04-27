import { useEffect, useMemo, useState } from 'react'
import { Monitor, Shield, AlertTriangle, Wifi } from 'lucide-react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts'
import { api } from '../lib/api'

const osColors = {
  Windows: '#3b82f6',
  macOS: '#10b981',
  Android: '#f59e0b',
  iOS: '#8b5cf6',
  ChromeOS: '#06b6d4',
  Other: '#94a3b8',
}

function normalizeOs(os) {
  const v = String(os || '').toLowerCase()
  if (v.includes('windows')) return 'Windows'
  if (v.includes('mac') || v.includes('darwin')) return 'macOS'
  if (v.includes('android')) return 'Android'
  if (v.includes('ios') || v.includes('ipados')) return 'iOS'
  if (v.includes('chrome')) return 'ChromeOS'
  return 'Other'
}

function isOnline(device) {
  const stamp = device?.last_seen || device?.lastSeen
  if (!stamp) return false
  const ts = new Date(stamp).getTime()
  return Number.isFinite(ts) && Date.now() - ts <= 5 * 60 * 1000
}

function relative(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const mins = Math.floor((Date.now() - d.getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export default function Dashboard() {
  const [devices, setDevices] = useState([])
  const [alerts, setAlerts] = useState([])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const [dRes, aRes] = await Promise.all([
        api('/api/integrations/devices').catch(() => ({ devices: [] })),
        api('/api/alerts?resolved=false&limit=50').catch(() => ({ alerts: [] })),
      ])
      if (cancelled) return
      setDevices(Array.isArray(dRes?.devices) ? dRes.devices : [])
      setAlerts(Array.isArray(aRes?.alerts) ? aRes.alerts : [])
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const stats = useMemo(() => {
    const total = devices.length
    const online = devices.filter(isOnline).length
    const scores = devices.map((d) => Number(d.security_score)).filter((n) => Number.isFinite(n))
    const security = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0
    const critical = alerts.filter((a) => String(a.severity || '').toLowerCase() === 'critical').length
    return { total, online, security, alerts: alerts.length, critical }
  }, [devices, alerts])

  const fleetData = useMemo(() => {
    const now = new Date()
    const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
    return labels.map((name, idx) => {
      const day = new Date(now)
      day.setDate(now.getDate() - (6 - idx))
      const start = new Date(day); start.setHours(0, 0, 0, 0)
      const end = new Date(day); end.setHours(23, 59, 59, 999)
      const devicesDay = devices.filter((d) => {
        const t = new Date(d.last_seen || d.lastSeen || 0).getTime()
        return Number.isFinite(t) && t >= start.getTime() && t <= end.getTime()
      }).length
      const alertsDay = alerts.filter((a) => {
        const t = new Date(a.created_at || a.createdAt || 0).getTime()
        return Number.isFinite(t) && t >= start.getTime() && t <= end.getTime()
      }).length
      return { name, devices: devicesDay, alerts: alertsDay }
    })
  }, [devices, alerts])

  const osDistribution = useMemo(() => {
    const counts = new Map()
    devices.forEach((d) => {
      const os = normalizeOs(d.os)
      counts.set(os, (counts.get(os) || 0) + 1)
    })
    const total = Math.max(1, devices.length)
    return [...counts.entries()].map(([name, count]) => ({
      name,
      value: Math.round((count / total) * 100),
      color: osColors[name] || osColors.Other,
    }))
  }, [devices])

  const complianceData = useMemo(() => {
    const pass = devices.filter((d) => String(d.compliance || '').toLowerCase() === 'pass').length
    const warning = devices.filter((d) => String(d.compliance || '').toLowerCase() === 'warning').length
    const critical = devices.filter((d) => String(d.compliance || '').toLowerCase() === 'fail').length
    const total = Math.max(1, devices.length)
    return [
      { name: 'Compliant', value: Math.round((pass / total) * 100), color: '#10b981' },
      { name: 'Warning', value: Math.round((warning / total) * 100), color: '#f59e0b' },
      { name: 'Critical', value: Math.round((critical / total) * 100), color: '#ef4444' },
    ]
  }, [devices])

  const recentAlerts = useMemo(
    () =>
      alerts.slice(0, 5).map((a) => ({
        id: a.id,
        device: a.device_name || a.deviceName || a.device_id || 'Device',
        type: a.type || 'Alert',
        message: a.message || 'No details',
        severity: String(a.severity || 'info').toLowerCase(),
        time: relative(a.created_at || a.createdAt),
      })),
    [alerts],
  )

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Total Devices" value={String(stats.total)} change="" changeType="neutral" icon={Monitor} color="blue" />
        <StatCard title="Online Now" value={String(stats.online)} change={stats.total ? `${Math.round((stats.online / stats.total) * 100)}% of fleet` : ''} changeType="neutral" icon={Wifi} color="emerald" />
        <StatCard title="Security Score" value={`${stats.security}%`} change="" changeType="positive" icon={Shield} color="cyan" />
        <StatCard title="Active Alerts" value={String(stats.alerts)} change={stats.critical ? `${stats.critical} critical` : ''} changeType="negative" icon={AlertTriangle} color="amber" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-2xl border border-border bg-card p-6 shadow-sm hover:shadow-md transition-shadow">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-foreground">Fleet Activity</h3>
              <p className="text-sm text-muted-foreground">Device connections over the last 7 days</p>
            </div>
            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-2"><div className="h-3 w-3 rounded-full bg-electric-blue"></div><span className="text-muted-foreground">Devices</span></div>
              <div className="flex items-center gap-2"><div className="h-3 w-3 rounded-full bg-danger"></div><span className="text-muted-foreground">Alerts</span></div>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={fleetData}>
              <defs>
                <linearGradient id="colorDevices" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorAlerts" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="name" stroke="var(--muted-foreground)" fontSize={12} />
              <YAxis stroke="var(--muted-foreground)" fontSize={12} />
              <Tooltip contentStyle={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px' }} />
              <Area type="monotone" dataKey="devices" stroke="#3b82f6" fillOpacity={1} fill="url(#colorDevices)" strokeWidth={2} />
              <Area type="monotone" dataKey="alerts" stroke="#ef4444" fillOpacity={1} fill="url(#colorAlerts)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm hover:shadow-md transition-shadow">
          <h3 className="mb-2 text-lg font-semibold text-foreground">OS Distribution</h3>
          <p className="mb-4 text-sm text-muted-foreground">Devices by operating system</p>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={osDistribution} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={4} dataKey="value">
                {osDistribution.map((entry, index) => <Cell key={`${entry.name}-${index}`} fill={entry.color} />)}
              </Pie>
              <Tooltip contentStyle={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px' }} />
            </PieChart>
          </ResponsiveContainer>
          <div className="mt-4 grid grid-cols-2 gap-2">
            {osDistribution.map((item) => (
              <div key={item.name} className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-full" style={{ backgroundColor: item.color }}></div>
                <span className="text-sm text-muted-foreground">{item.name}</span>
                <span className="ml-auto text-sm font-medium text-foreground">{item.value}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm hover:shadow-md transition-shadow">
          <h3 className="mb-2 text-lg font-semibold text-foreground">Compliance Status</h3>
          <p className="mb-6 text-sm text-muted-foreground">Fleet security compliance overview</p>
          <div className="flex items-center gap-8">
            <div className="h-32 w-32">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={complianceData} cx="50%" cy="50%" innerRadius={35} outerRadius={55} paddingAngle={2} dataKey="value">
                    {complianceData.map((entry, index) => <Cell key={`${entry.name}-${index}`} fill={entry.color} />)}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex-1 space-y-3">
              {complianceData.map((item) => (
                <div key={item.name} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-3 w-3 rounded-full" style={{ backgroundColor: item.color }}></div>
                    <span className="text-sm text-foreground">{item.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-24 overflow-hidden rounded-full bg-muted h-2">
                      <div className="h-full rounded-full" style={{ width: `${item.value}%`, backgroundColor: item.color }}></div>
                    </div>
                    <span className="w-10 text-right text-sm font-medium text-foreground">{item.value}%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm hover:shadow-md transition-shadow">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-foreground">Recent Alerts</h3>
              <p className="text-sm text-muted-foreground">Latest security notifications</p>
            </div>
            <button className="text-sm text-electric-blue hover:text-electric-blue/80 font-medium transition-colors">View all</button>
          </div>
          <div className="space-y-3">
            {recentAlerts.length === 0 ? (
              <div className="rounded-xl bg-secondary/50 p-3 text-sm text-muted-foreground">No active alerts</div>
            ) : (
              recentAlerts.map((alert) => (
                <div key={alert.id} className="flex cursor-pointer items-start gap-3 rounded-xl bg-secondary/50 p-3 hover:bg-secondary transition-colors">
                  <div className={`mt-2 h-2 w-2 rounded-full ${alert.severity === 'critical' ? 'bg-danger' : alert.severity === 'warning' ? 'bg-warning' : 'bg-muted-foreground'}`}></div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground">{alert.device}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${alert.severity === 'critical' ? 'bg-danger/10 text-danger' : alert.severity === 'warning' ? 'bg-warning/10 text-warning' : 'bg-muted text-muted-foreground'}`}>
                        {alert.type}
                      </span>
                    </div>
                    <p className="truncate text-sm text-muted-foreground">{alert.message}</p>
                  </div>
                  <span className="whitespace-nowrap text-xs text-muted-foreground">{alert.time}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function StatCard({ title, value, change, changeType, icon: Icon, color }) {
  const iconBgClasses = {
    blue: 'bg-gradient-to-br from-electric-blue to-blue-600',
    emerald: 'bg-gradient-to-br from-emerald to-green-600',
    cyan: 'bg-gradient-to-br from-electric-cyan to-cyan-600',
    amber: 'bg-gradient-to-br from-warning to-orange-600',
  }

  return (
    <div className="bg-card rounded-2xl border border-border p-6 shadow-sm hover:shadow-md transition-all duration-200 hover:-translate-y-0.5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-muted-foreground font-medium">{title}</p>
          <p className="text-3xl font-bold text-foreground mt-2">{value}</p>
          {change && (
            <p className={`text-sm mt-2 ${changeType === 'positive' ? 'text-emerald' : changeType === 'negative' ? 'text-danger' : 'text-muted-foreground'}`}>
              {change}
            </p>
          )}
        </div>
        <div className={`w-12 h-12 rounded-xl ${iconBgClasses[color]} flex items-center justify-center shadow-lg`}>
          <Icon className="w-6 h-6 text-white" />
        </div>
      </div>
    </div>
  )
}
