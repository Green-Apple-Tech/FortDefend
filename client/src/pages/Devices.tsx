import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { 
  Search, 
  ChevronDown, 
  Download, 
  MoreVertical,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Monitor,
  Smartphone,
  Tablet,
  Check,
  X
} from 'lucide-react'

const tabs = ['Devices', 'Software', 'Alerts', 'Scripts', 'Reboot', 'Settings']

const devices = [
  {
    id: 1,
    name: 'AndreTabet',
    serial: '5F08R14',
    os: 'MS 11 Home',
    securityScore: 75,
    source: 'Agent',
    disk: { free: 626, total: 1000, unit: 'GB' },
    ram: { used: 13.1, total: 16, unit: 'GB' },
    cpu: null,
    agent: '1.0.2',
    agentUpdate: false,
    status: 'online',
    lastSeen: 'just now',
  },
  {
    id: 2,
    name: 'Android Device',
    serial: '',
    os: 'Android',
    securityScore: 0,
    source: 'android',
    disk: null,
    ram: null,
    cpu: null,
    agent: '1.0.0',
    agentUpdate: true,
    status: 'offline',
    lastSeen: '11 hours ago',
  },
  {
    id: 3,
    name: 'CarolePC',
    serial: 'BXBRXR1',
    os: 'MS 10 Pro',
    securityScore: 75,
    source: 'Agent',
    disk: { free: 2, total: 256, unit: 'GB' },
    ram: { used: 7.0, total: 8, unit: 'GB' },
    cpu: 3,
    agent: '1.0.2',
    agentUpdate: false,
    status: 'online',
    lastSeen: 'just now',
  },
  {
    id: 4,
    name: 'Grandma',
    serial: '2LJ2FF3',
    os: 'MS 11 Home',
    securityScore: 75,
    source: 'Agent',
    disk: { free: 270, total: 500, unit: 'GB' },
    ram: { used: 5.2, total: 8, unit: 'GB' },
    cpu: 11,
    agent: '1.0.2',
    agentUpdate: false,
    status: 'online',
    lastSeen: 'just now',
  },
  {
    id: 5,
    name: 'Pixel 7 Test',
    serial: '',
    os: 'Android',
    securityScore: 0,
    source: 'android',
    disk: null,
    ram: null,
    cpu: null,
    agent: '1.0.0',
    agentUpdate: true,
    status: 'offline',
    lastSeen: '11 hours ago',
  },
]

// App catalog with Simple Icons CDN - https://simpleicons.org (free, open source)
// Format: https://cdn.simpleicons.org/{iconname} or https://cdn.simpleicons.org/{iconname}/{color}
const appCatalog: Record<string, { name: string; icon: string; category: string }[]> = {
  'Web Browsers': [
    { name: 'Google Chrome', icon: 'googlechrome', category: 'Browsers' },
    { name: 'Firefox', icon: 'firefox', category: 'Browsers' },
    { name: 'Microsoft Edge', icon: 'microsoftedge', category: 'Browsers' },
    { name: 'Opera', icon: 'opera', category: 'Browsers' },
    { name: 'Brave', icon: 'brave', category: 'Browsers' },
    { name: 'Vivaldi', icon: 'vivaldi', category: 'Browsers' },
  ],
  'Messaging': [
    { name: 'Zoom', icon: 'zoom', category: 'Messaging' },
    { name: 'Discord', icon: 'discord', category: 'Messaging' },
    { name: 'Microsoft Teams', icon: 'microsoftteams', category: 'Messaging' },
    { name: 'Slack', icon: 'slack', category: 'Messaging' },
    { name: 'Thunderbird', icon: 'thunderbird', category: 'Messaging' },
  ],
  'Online Storage': [
    { name: 'Dropbox', icon: 'dropbox', category: 'Storage' },
    { name: 'Google Drive', icon: 'googledrive', category: 'Storage' },
    { name: 'OneDrive', icon: 'microsoftonedrive', category: 'Storage' },
    { name: 'iCloud', icon: 'icloud', category: 'Storage' },
  ],
  'Media': [
    { name: 'VLC', icon: 'vlcmediaplayer', category: 'Media' },
    { name: 'Spotify', icon: 'spotify', category: 'Media' },
    { name: 'iTunes', icon: 'apple', category: 'Media' },
    { name: 'Audacity', icon: 'audacity', category: 'Media' },
    { name: 'HandBrake', icon: 'handbrake', category: 'Media' },
  ],
  'Developer Tools': [
    { name: 'Visual Studio Code', icon: 'visualstudiocode', category: 'Dev Tools' },
    { name: 'Git', icon: 'git', category: 'Dev Tools' },
    { name: 'GitHub Desktop', icon: 'github', category: 'Dev Tools' },
    { name: 'Node.js', icon: 'nodedotjs', category: 'Dev Tools' },
    { name: 'Python', icon: 'python', category: 'Dev Tools' },
    { name: 'Docker', icon: 'docker', category: 'Dev Tools' },
    { name: 'Postman', icon: 'postman', category: 'Dev Tools' },
    { name: 'FileZilla', icon: 'filezilla', category: 'Dev Tools' },
  ],
  'Utilities': [
    { name: 'TeamViewer', icon: 'teamviewer', category: 'Utilities' },
    { name: 'AnyDesk', icon: 'anydesk', category: 'Utilities' },
    { name: '7-Zip', icon: '7zip', category: 'Utilities' },
    { name: 'WinRAR', icon: 'winrar', category: 'Utilities' },
    { name: 'CCleaner', icon: 'ccleaner', category: 'Utilities' },
    { name: 'Notepad++', icon: 'notepadplusplus', category: 'Utilities' },
  ],
  'Security': [
    { name: 'Malwarebytes', icon: 'malwarebytes', category: 'Security' },
    { name: 'Avast', icon: 'avast', category: 'Security' },
    { name: 'Bitdefender', icon: 'bitdefender', category: 'Security' },
    { name: 'KeePass', icon: 'keepassxc', category: 'Security' },
    { name: '1Password', icon: '1password', category: 'Security' },
  ],
  'Documents': [
    { name: 'Microsoft Office', icon: 'microsoftoffice', category: 'Documents' },
    { name: 'LibreOffice', icon: 'libreoffice', category: 'Documents' },
    { name: 'Adobe Acrobat', icon: 'adobeacrobatreader', category: 'Documents' },
    { name: 'Notion', icon: 'notion', category: 'Documents' },
  ],
  'Imaging': [
    { name: 'Adobe Photoshop', icon: 'adobephotoshop', category: 'Imaging' },
    { name: 'GIMP', icon: 'gimp', category: 'Imaging' },
    { name: 'Figma', icon: 'figma', category: 'Imaging' },
    { name: 'Blender', icon: 'blender', category: 'Imaging' },
    { name: 'Inkscape', icon: 'inkscape', category: 'Imaging' },
  ],
  'Other': [
    { name: 'Steam', icon: 'steam', category: 'Other' },
    { name: 'Epic Games', icon: 'epicgames', category: 'Other' },
    { name: 'Evernote', icon: 'evernote', category: 'Other' },
  ],
}

// Helper to get icon URL from Simple Icons CDN
const getIconUrl = (iconSlug: string) => `https://cdn.simpleicons.org/${iconSlug}`

// Flat list of all apps for display in matrix
const softwareApps = [
  { name: 'Google Chrome', icon: 'googlechrome' },
  { name: 'Microsoft Edge', icon: 'microsoftedge' },
  { name: 'Git', icon: 'git' },
  { name: '7-Zip', icon: '7zip' },
  { name: 'CCleaner', icon: 'ccleaner' },
  { name: 'Google Drive', icon: 'googledrive' },
  { name: 'OneDrive', icon: 'microsoftonedrive' },
  { name: 'TeamViewer', icon: 'teamviewer' },
  { name: 'VLC', icon: 'vlcmediaplayer' },
  { name: 'Zoom', icon: 'zoom' },
]

const softwareMatrix = [
  { device: 'AndreTabet', apps: [true, true, true, false, false, false, true, false, false, true] },
  { device: 'Android Device', apps: [false, false, false, false, false, false, false, false, false, false] },
  { device: 'CarolePC', apps: [true, true, false, true, true, true, false, true, true, false] },
  { device: 'Grandma', apps: [true, true, true, false, false, false, false, false, false, false] },
  { device: 'Pixel 7 Test', apps: [false, false, false, false, false, false, false, false, false, false] },
]

export default function Devices() {
  const [activeTab, setActiveTab] = useState('Devices')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedGroup, setSelectedGroup] = useState('All Devices')
  const navigate = useNavigate()

  return (
    <div className="space-y-6">
      {/* Header with group selector */}
      <div className="flex items-center gap-4">
        <div className="relative">
          <button className="flex items-center gap-2 px-4 py-2 bg-card border border-border rounded-xl text-sm font-medium hover:bg-secondary transition-colors">
            {selectedGroup}
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
        
        {/* Agent Updates banner */}
        <div className="ml-auto flex items-center gap-2 px-4 py-2 bg-warning/10 border border-warning/20 rounded-xl">
          <span className="text-sm font-medium text-foreground">Agent Updates</span>
          <span className="text-sm text-warning font-medium">2 devices need update</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-border">
        <div className="flex gap-1">
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-6 py-3 text-sm font-medium transition-colors relative ${
                activeTab === tab
                  ? 'text-electric-blue'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab}
              {activeTab === tab && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-electric-blue rounded-full" />
              )}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'Devices' && <DevicesTable searchQuery={searchQuery} setSearchQuery={setSearchQuery} />}
      {activeTab === 'Software' && <SoftwareManager />}
      {activeTab === 'Alerts' && <AlertsTab />}
      {activeTab === 'Scripts' && <ScriptsTab />}
      {activeTab === 'Reboot' && <RebootTab />}
      {activeTab === 'Settings' && <DeviceSettingsTab />}
    </div>
  )
}

function DevicesTable({ searchQuery, setSearchQuery }: { searchQuery: string; setSearchQuery: (q: string) => void }) {
  const navigate = useNavigate()
  
  return (
    <>
      {/* Filters */}
      <div className="bg-card rounded-2xl border border-border p-6 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-foreground mb-2">Search</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Name, serial, user email, id..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-11 pl-10 pr-4 rounded-xl bg-secondary border border-border text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-electric-blue focus:border-transparent transition-all"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">Source</label>
            <select className="w-full h-11 px-4 rounded-xl bg-secondary border border-border text-sm focus:outline-none focus:ring-2 focus:ring-electric-blue focus:border-transparent transition-all appearance-none cursor-pointer">
              <option>All</option>
              <option>Agent</option>
              <option>Android</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">Status</label>
            <select className="w-full h-11 px-4 rounded-xl bg-secondary border border-border text-sm focus:outline-none focus:ring-2 focus:ring-electric-blue focus:border-transparent transition-all appearance-none cursor-pointer">
              <option>All</option>
              <option>Online</option>
              <option>Offline</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">OS</label>
            <div className="flex gap-2">
              <select className="flex-1 h-11 px-4 rounded-xl bg-secondary border border-border text-sm focus:outline-none focus:ring-2 focus:ring-electric-blue focus:border-transparent transition-all appearance-none cursor-pointer">
                <option>All</option>
                <option>Windows</option>
                <option>Android</option>
              </select>
              <button className="h-11 px-4 rounded-xl border border-electric-blue text-electric-blue text-sm font-medium hover:bg-electric-blue/10 transition-colors whitespace-nowrap">
                Export CSV
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Fleet summary */}
      <div className="flex items-center justify-between px-2">
        <div className="flex items-center gap-6">
          <span className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Fleet Summary</span>
          <div className="flex items-center gap-4">
            <StatusBadge color="emerald" label="3 online" />
            <StatusBadge color="warning" label="0 warnings" />
            <StatusBadge color="danger" label="0 alerts" />
            <StatusBadge color="muted" label="2 offline" />
          </div>
        </div>
        <span className="text-sm text-muted-foreground">5 devices</span>
      </div>

      {/* Devices table */}
      <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-secondary/50">
                <th className="w-12 p-4">
                  <input type="checkbox" className="w-4 h-4 rounded border-border" />
                </th>
                <th className="text-left p-4 text-sm font-medium text-muted-foreground">Device</th>
                <th className="text-left p-4 text-sm font-medium text-muted-foreground">OS</th>
                <th className="text-left p-4 text-sm font-medium text-muted-foreground">Security score</th>
                <th className="text-left p-4 text-sm font-medium text-muted-foreground">Source</th>
                <th className="text-left p-4 text-sm font-medium text-muted-foreground">Disk</th>
                <th className="text-left p-4 text-sm font-medium text-muted-foreground">RAM</th>
                <th className="text-left p-4 text-sm font-medium text-muted-foreground">CPU</th>
                <th className="text-left p-4 text-sm font-medium text-muted-foreground">Agent</th>
                <th className="text-left p-4 text-sm font-medium text-muted-foreground">Status</th>
                <th className="text-left p-4 text-sm font-medium text-muted-foreground">Last seen</th>
                <th className="text-left p-4 text-sm font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {devices.map((device) => (
                <tr 
                  key={device.id}
                  className="border-b border-border hover:bg-secondary/30 transition-colors cursor-pointer group"
                  onDoubleClick={() => navigate(`/devices/${device.name.toLowerCase()}`)}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    // Context menu would show here - simplified for now
                  }}
                >
                      <td className="p-4" onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" className="w-4 h-4 rounded border-border" />
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-2 h-2 rounded-full ${device.status === 'online' ? 'bg-emerald' : 'bg-muted-foreground'}`} />
                          <div>
                            <button 
                              onClick={() => navigate(`/devices/${device.name.toLowerCase()}`)}
                              className="text-sm font-medium text-foreground hover:text-electric-blue transition-colors text-left"
                            >
                              {device.name}
                            </button>
                            {device.serial && <p className="text-xs text-muted-foreground">{device.serial}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="p-4 text-sm text-foreground">{device.os}</td>
                      <td className="p-4">
                        <SecurityScoreBadge score={device.securityScore} />
                      </td>
                      <td className="p-4">
                        <SourceBadge source={device.source} />
                      </td>
                      <td className="p-4">
                        {device.disk ? (
                          <div>
                            <p className="text-sm text-electric-cyan font-medium">{device.disk.free} {device.disk.unit} free</p>
                            <div className="w-16 h-1.5 bg-muted rounded-full mt-1 overflow-hidden">
                              <div 
                                className="h-full bg-danger rounded-full"
                                style={{ width: `${(1 - device.disk.free / device.disk.total) * 100}%` }}
                              />
                            </div>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="p-4">
                        {device.ram ? (
                          <div>
                            <p className="text-sm text-foreground">{device.ram.used} / {device.ram.total} {device.ram.unit}</p>
                            <div className="w-16 h-1.5 bg-muted rounded-full mt-1 overflow-hidden">
                              <div 
                                className="h-full bg-emerald rounded-full"
                                style={{ width: `${(device.ram.used / device.ram.total) * 100}%` }}
                              />
                            </div>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="p-4">
                        {device.cpu !== null ? (
                          <span className="text-sm text-foreground">{device.cpu}%</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="p-4">
                        <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                          device.agentUpdate 
                            ? 'bg-warning/10 text-warning' 
                            : 'bg-emerald/10 text-emerald'
                        }`}>
                          {device.agent}
                          {device.agentUpdate ? (
                            <span className="text-[10px]">↑</span>
                          ) : (
                            <Check className="w-3 h-3" />
                          )}
                        </div>
                      </td>
                      <td className="p-4">
                        <span className={`inline-flex px-3 py-1 rounded-full text-xs font-medium ${
                          device.status === 'online'
                            ? 'bg-emerald/10 text-emerald'
                            : 'bg-muted text-muted-foreground'
                        }`}>
                          {device.status === 'online' ? 'Online' : 'Offline'}
                        </span>
                      </td>
                      <td className="p-4 text-sm text-muted-foreground">{device.lastSeen}</td>
                      <td className="p-4">
                        <button className="p-2 hover:bg-secondary rounded-lg transition-colors">
                          <MoreVertical className="w-4 h-4 text-muted-foreground" />
                        </button>
                      </td>
                    </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border">
          <div className="flex items-center gap-4">
            <div className="flex gap-1">
              {['list', 'grid', 'compact', 'expanded'].map((view, i) => (
                <button key={view} className={`w-8 h-8 rounded-lg flex items-center justify-center ${i === 0 ? 'bg-secondary' : 'hover:bg-secondary'} transition-colors`}>
                  <Monitor className="w-4 h-4 text-muted-foreground" />
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">Showing 1-5 of 5</span>
            <select className="h-9 px-3 rounded-lg bg-secondary border border-border text-sm">
              <option>25</option>
              <option>50</option>
              <option>100</option>
            </select>
            <div className="flex gap-2">
              <button className="px-4 py-2 rounded-lg text-sm text-muted-foreground hover:bg-secondary transition-colors">Previous</button>
              <span className="px-4 py-2 text-sm text-muted-foreground">Page 1 / 1</span>
              <button className="px-4 py-2 rounded-lg text-sm text-muted-foreground hover:bg-secondary transition-colors">Next</button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

function SoftwareManager() {
  const [category, setCategory] = useState('All')
  const [showAddApp, setShowAddApp] = useState(false)
  const categories = ['All', 'Browsers', 'Security', 'Productivity', 'Dev Tools', 'Utilities', 'Media']

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Software Manager</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Matrix view: green check when installed, amber badge when an update is available, blank when not installed.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="App name, publisher..."
              className="w-56 h-10 pl-10 pr-4 rounded-xl bg-secondary border border-border text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-electric-blue transition-all"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
            <input type="checkbox" className="w-4 h-4 rounded border-border" />
            Show uninstalled apps
          </label>
          <button className="px-4 py-2 rounded-xl border border-electric-blue text-electric-blue text-sm font-medium hover:bg-electric-blue/10 transition-colors">
            Manage Columns
          </button>
          <button 
            onClick={() => setShowAddApp(true)}
            className="px-4 py-2 rounded-xl bg-electric-blue text-white text-sm font-medium hover:bg-electric-blue/90 transition-colors shadow-lg shadow-electric-blue/25"
          >
            Add App
          </button>
        </div>
      </div>

      {/* Category filters */}
      <div className="flex gap-2">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setCategory(cat)}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              category === cat
                ? 'bg-electric-blue text-white shadow-lg shadow-electric-blue/25'
                : 'bg-secondary text-foreground hover:bg-secondary/80'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Software matrix */}
      <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-secondary/50">
                <th className="text-left p-4 text-sm font-medium text-muted-foreground sticky left-0 bg-secondary/50">DEVICES</th>
                {softwareApps.map((app) => (
                  <th key={app.name} className="p-4 text-center min-w-[100px]">
                    <div className="flex flex-col items-center gap-2">
                      <img 
                        src={getIconUrl(app.icon)} 
                        alt={app.name}
                        className="w-8 h-8 object-contain"
                        onError={(e) => {
                          const target = e.currentTarget
                          target.style.display = 'none'
                          const fallback = target.nextElementSibling as HTMLElement
                          if (fallback) fallback.style.display = 'flex'
                        }}
                      />
                      <div className="w-8 h-8 rounded-lg bg-secondary items-center justify-center text-xs font-bold text-muted-foreground hidden">
                        {app.name.charAt(0)}
                      </div>
                      <span className="text-xs text-muted-foreground font-normal leading-tight">{app.name}</span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {softwareMatrix.map((row, idx) => (
                <tr key={row.device} className="border-b border-border hover:bg-secondary/30 transition-colors">
                  <td className="p-4 sticky left-0 bg-card">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${idx === 1 || idx === 4 ? 'bg-muted-foreground' : 'bg-emerald'}`} />
                      <span className="text-sm font-medium text-foreground">{row.device}</span>
                    </div>
                  </td>
                  {row.apps.map((installed, i) => (
                    <td key={i} className="p-4 text-center">
                      {installed && <Check className="w-5 h-5 text-emerald mx-auto" />}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add App Modal */}
      {showAddApp && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-2xl border border-border shadow-2xl w-full max-w-4xl max-h-[80vh] overflow-hidden">
            <div className="flex items-center justify-between p-6 border-b border-border">
              <div>
                <h2 className="text-xl font-semibold text-foreground">Add Apps to Monitor</h2>
                <p className="text-sm text-muted-foreground mt-1">Select apps to track across your device fleet</p>
              </div>
              <button 
                onClick={() => setShowAddApp(false)}
                className="p-2 hover:bg-secondary rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto max-h-[60vh]">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {Object.entries(appCatalog).map(([categoryName, apps]) => (
                  <div key={categoryName}>
                    <h3 className="text-sm font-semibold text-foreground mb-3">{categoryName}</h3>
                    <div className="space-y-2">
                      {apps.map((app) => (
                        <label 
                          key={app.name}
                          className="flex items-center gap-3 p-2 rounded-lg hover:bg-secondary cursor-pointer transition-colors"
                        >
                          <input type="checkbox" className="w-4 h-4 rounded border-border text-electric-blue" />
                          <img 
                            src={getIconUrl(app.icon)} 
                            alt={app.name}
                            className="w-5 h-5 object-contain"
                            onError={(e) => {
                              e.currentTarget.style.display = 'none'
                            }}
                          />
                          <span className="text-sm text-foreground">{app.name}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 p-6 border-t border-border">
              <button 
                onClick={() => setShowAddApp(false)}
                className="px-4 py-2 rounded-xl border border-border text-foreground text-sm font-medium hover:bg-secondary transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={() => setShowAddApp(false)}
                className="px-4 py-2 rounded-xl bg-electric-blue text-white text-sm font-medium hover:bg-electric-blue/90 transition-colors shadow-lg shadow-electric-blue/25"
              >
                Add Selected Apps
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function AlertsTab() {
  return (
    <div className="bg-card rounded-2xl border border-border p-8 shadow-sm text-center">
      <AlertCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
      <h3 className="text-lg font-semibold text-foreground mb-2">No Active Alerts</h3>
      <p className="text-muted-foreground">Your fleet is running smoothly with no issues to report.</p>
    </div>
  )
}

function ScriptsTab() {
  return (
    <div className="bg-card rounded-2xl border border-border p-8 shadow-sm text-center">
      <Monitor className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
      <h3 className="text-lg font-semibold text-foreground mb-2">Scripts Library</h3>
      <p className="text-muted-foreground">Create and manage scripts to run across your device fleet.</p>
      <button className="mt-4 px-6 py-2 rounded-xl bg-electric-blue text-white text-sm font-medium hover:bg-electric-blue/90 transition-colors shadow-lg shadow-electric-blue/25">
        Create Script
      </button>
    </div>
  )
}

function RebootTab() {
  return (
    <div className="bg-card rounded-2xl border border-border p-8 shadow-sm text-center">
      <Monitor className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
      <h3 className="text-lg font-semibold text-foreground mb-2">Reboot Management</h3>
      <p className="text-muted-foreground">Schedule and manage device reboots for your fleet.</p>
    </div>
  )
}

function DeviceSettingsTab() {
  return (
    <div className="bg-card rounded-2xl border border-border p-8 shadow-sm text-center">
      <Monitor className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
      <h3 className="text-lg font-semibold text-foreground mb-2">Device Settings</h3>
      <p className="text-muted-foreground">Configure settings for your managed devices.</p>
    </div>
  )
}

function StatusBadge({ color, label }: { color: 'emerald' | 'warning' | 'danger' | 'muted'; label: string }) {
  const colorClasses = {
    emerald: 'bg-emerald',
    warning: 'bg-warning',
    danger: 'bg-danger',
    muted: 'bg-muted-foreground',
  }
  return (
    <div className="flex items-center gap-2">
      <div className={`w-2 h-2 rounded-full ${colorClasses[color]}`} />
      <span className="text-sm text-foreground">{label}</span>
    </div>
  )
}

function SecurityScoreBadge({ score }: { score: number }) {
  const color = score >= 70 ? 'bg-emerald text-white' : score > 0 ? 'bg-warning text-white' : 'bg-danger text-white'
  return (
    <span className={`inline-flex items-center justify-center w-10 h-10 rounded-full text-sm font-bold ${color}`}>
      {score}
    </span>
  )
}

function SourceBadge({ source }: { source: string }) {
  const isAgent = source === 'Agent'
  return (
    <span className={`inline-flex px-3 py-1 rounded-full text-xs font-medium ${
      isAgent ? 'bg-electric-blue/10 text-electric-blue' : 'bg-emerald/10 text-emerald'
    }`}>
      {source}
    </span>
  )
}
