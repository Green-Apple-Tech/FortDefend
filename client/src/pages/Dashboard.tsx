import { 
  Monitor, 
  Shield, 
  AlertTriangle, 
  CheckCircle2, 
  Wifi, 
  WifiOff,
  TrendingUp,
  Activity,
  HardDrive,
  Cpu
} from 'lucide-react'
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
  BarChart,
  Bar,
  Legend
} from 'recharts'

const fleetData = [
  { name: 'Mon', devices: 42, alerts: 3 },
  { name: 'Tue', devices: 45, alerts: 2 },
  { name: 'Wed', devices: 48, alerts: 5 },
  { name: 'Thu', devices: 47, alerts: 1 },
  { name: 'Fri', devices: 52, alerts: 4 },
  { name: 'Sat', devices: 50, alerts: 2 },
  { name: 'Sun', devices: 53, alerts: 1 },
]

const osDistribution = [
  { name: 'Windows', value: 45, color: '#3b82f6' },
  { name: 'macOS', value: 30, color: '#10b981' },
  { name: 'Android', value: 15, color: '#f59e0b' },
  { name: 'iOS', value: 10, color: '#8b5cf6' },
]

const complianceData = [
  { name: 'Compliant', value: 85, color: '#10b981' },
  { name: 'Warning', value: 10, color: '#f59e0b' },
  { name: 'Critical', value: 5, color: '#ef4444' },
]

const recentAlerts = [
  { id: 1, device: 'CarolePC', type: 'Security', message: 'Antivirus definitions outdated', severity: 'warning', time: '5 min ago' },
  { id: 2, device: 'Android Device', type: 'Compliance', message: 'Device offline for 24+ hours', severity: 'info', time: '2 hours ago' },
  { id: 3, device: 'Pixel 7 Test', type: 'Security', message: 'Unknown app installed', severity: 'critical', time: '3 hours ago' },
]

export default function Dashboard() {
  return (
    <div className="space-y-6">
      {/* Stats cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Total Devices"
          value="53"
          change="+5 this week"
          changeType="positive"
          icon={Monitor}
          color="blue"
        />
        <StatCard
          title="Online Now"
          value="48"
          change="90% of fleet"
          changeType="neutral"
          icon={Wifi}
          color="emerald"
        />
        <StatCard
          title="Security Score"
          value="92%"
          change="+3% from last week"
          changeType="positive"
          icon={Shield}
          color="cyan"
        />
        <StatCard
          title="Active Alerts"
          value="3"
          change="2 critical"
          changeType="negative"
          icon={AlertTriangle}
          color="amber"
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Fleet activity chart */}
        <div className="lg:col-span-2 bg-card rounded-2xl border border-border p-6 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-lg font-semibold text-foreground">Fleet Activity</h3>
              <p className="text-sm text-muted-foreground">Device connections over the last 7 days</p>
            </div>
            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-electric-blue"></div>
                <span className="text-muted-foreground">Devices</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-danger"></div>
                <span className="text-muted-foreground">Alerts</span>
              </div>
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
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: 'var(--card)', 
                  border: '1px solid var(--border)',
                  borderRadius: '12px',
                  boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
                }}
              />
              <Area type="monotone" dataKey="devices" stroke="#3b82f6" fillOpacity={1} fill="url(#colorDevices)" strokeWidth={2} />
              <Area type="monotone" dataKey="alerts" stroke="#ef4444" fillOpacity={1} fill="url(#colorAlerts)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* OS Distribution */}
        <div className="bg-card rounded-2xl border border-border p-6 shadow-sm hover:shadow-md transition-shadow">
          <h3 className="text-lg font-semibold text-foreground mb-2">OS Distribution</h3>
          <p className="text-sm text-muted-foreground mb-4">Devices by operating system</p>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={osDistribution}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={80}
                paddingAngle={4}
                dataKey="value"
              >
                {osDistribution.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: 'var(--card)', 
                  border: '1px solid var(--border)',
                  borderRadius: '12px'
                }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="grid grid-cols-2 gap-2 mt-4">
            {osDistribution.map((item) => (
              <div key={item.name} className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }}></div>
                <span className="text-sm text-muted-foreground">{item.name}</span>
                <span className="text-sm font-medium text-foreground ml-auto">{item.value}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Compliance status */}
        <div className="bg-card rounded-2xl border border-border p-6 shadow-sm hover:shadow-md transition-shadow">
          <h3 className="text-lg font-semibold text-foreground mb-2">Compliance Status</h3>
          <p className="text-sm text-muted-foreground mb-6">Fleet security compliance overview</p>
          <div className="flex items-center gap-8">
            <div className="w-32 h-32">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={complianceData}
                    cx="50%"
                    cy="50%"
                    innerRadius={35}
                    outerRadius={55}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {complianceData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex-1 space-y-3">
              {complianceData.map((item) => (
                <div key={item.name} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }}></div>
                    <span className="text-sm text-foreground">{item.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                      <div 
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${item.value}%`, backgroundColor: item.color }}
                      ></div>
                    </div>
                    <span className="text-sm font-medium text-foreground w-10 text-right">{item.value}%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Recent alerts */}
        <div className="bg-card rounded-2xl border border-border p-6 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold text-foreground">Recent Alerts</h3>
              <p className="text-sm text-muted-foreground">Latest security notifications</p>
            </div>
            <button className="text-sm text-electric-blue hover:text-electric-blue/80 font-medium transition-colors">
              View all
            </button>
          </div>
          <div className="space-y-3">
            {recentAlerts.map((alert) => (
              <div 
                key={alert.id} 
                className="flex items-start gap-3 p-3 rounded-xl bg-secondary/50 hover:bg-secondary transition-colors cursor-pointer"
              >
                <div className={`w-2 h-2 rounded-full mt-2 ${
                  alert.severity === 'critical' ? 'bg-danger' :
                  alert.severity === 'warning' ? 'bg-warning' : 'bg-muted-foreground'
                }`}></div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground">{alert.device}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      alert.severity === 'critical' ? 'bg-danger/10 text-danger' :
                      alert.severity === 'warning' ? 'bg-warning/10 text-warning' : 'bg-muted text-muted-foreground'
                    }`}>
                      {alert.type}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground truncate">{alert.message}</p>
                </div>
                <span className="text-xs text-muted-foreground whitespace-nowrap">{alert.time}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

interface StatCardProps {
  title: string
  value: string
  change: string
  changeType: 'positive' | 'negative' | 'neutral'
  icon: React.ElementType
  color: 'blue' | 'emerald' | 'cyan' | 'amber'
}

function StatCard({ title, value, change, changeType, icon: Icon, color }: StatCardProps) {
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
            <p className={`text-sm mt-2 ${
              changeType === 'positive' ? 'text-emerald' :
              changeType === 'negative' ? 'text-danger' : 'text-muted-foreground'
            }`}>
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
