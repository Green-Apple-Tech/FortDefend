import { useState, useEffect } from 'react'
import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { 
  LayoutDashboard, 
  Monitor, 
  Plug, 
  Plus, 
  Settings, 
  Bell,
  Search,
  Moon,
  Sun,
  LogOut,
  Shield,
  ChevronDown,
  Folder,
  Command
} from 'lucide-react'
import { useTheme } from '../context/ThemeContext'

const navItems = [
  { path: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { path: '/devices', icon: Monitor, label: 'Devices' },
  { path: '/integrations', icon: Plug, label: 'Integrations' },
  { path: '/enroll', icon: Plus, label: 'Enroll Devices' },
  { path: '/settings', icon: Settings, label: 'Settings' },
]

const deviceGroups = [
  { id: 'all', name: 'All Devices', count: 5 },
  { id: 'ungrouped', name: 'Ungrouped', count: 2 },
  { id: 'group-2', name: 'Group 2', count: 1 },
  { id: 'dept-1', name: 'Department 1', count: 2 },
]

export default function Layout() {
  const location = useLocation()
  const navigate = useNavigate()
  const { theme, toggleTheme } = useTheme()
  const [showGroups, setShowGroups] = useState(false)
  const [showCommandPalette, setShowCommandPalette] = useState(false)

  // Keyboard shortcuts
  const handleKeyDown = (e: KeyboardEvent) => {
    // Cmd/Ctrl + K for command palette
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault()
      setShowCommandPalette(true)
    }
    // Cmd/Ctrl + D for devices
    if ((e.metaKey || e.ctrlKey) && e.key === 'd') {
      e.preventDefault()
      navigate('/devices')
    }
  }

  // Register keyboard shortcuts
  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])
  
  const getPageTitle = () => {
    const currentNav = navItems.find(item => item.path === location.pathname)
    return currentNav?.label || 'Dashboard'
  }

  const getBreadcrumb = () => {
    return `Home > ${getPageTitle()}`
  }

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <aside className="w-60 bg-navy-900 dark:bg-navy-950 flex flex-col shadow-xl">
        {/* Logo */}
        <div className="p-5 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-electric-blue to-electric-cyan flex items-center justify-center shadow-lg shadow-electric-blue/25">
            <Shield className="w-6 h-6 text-white" />
          </div>
          <span className="text-white font-semibold text-xl tracking-tight">FortDefend</span>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => (
            <div key={item.path}>
              <NavLink
                to={item.path}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${
                    isActive
                      ? 'bg-electric-blue text-white shadow-lg shadow-electric-blue/25'
                      : 'text-slate-300 hover:text-white hover:bg-white/10'
                  }`
                }
                onClick={(e) => {
                  if (item.path === '/devices') {
                    e.preventDefault()
                    setShowGroups(!showGroups)
                    navigate('/devices')
                  }
                }}
              >
                <item.icon className="w-5 h-5" />
                <span className="flex-1">{item.label}</span>
                {item.path === '/devices' && (
                  <ChevronDown className={`w-4 h-4 transition-transform ${showGroups ? 'rotate-180' : ''}`} />
                )}
              </NavLink>
              
              {/* Device Groups - Expandable */}
              {item.path === '/devices' && showGroups && (
                <div className="ml-4 mt-1 space-y-0.5">
                  {deviceGroups.map((group) => (
                    <button
                      key={group.id}
                      onClick={() => navigate(`/devices?group=${group.id}`)}
                      className="w-full flex items-center gap-2 px-4 py-2 text-sm text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
                    >
                      <Folder className="w-4 h-4" />
                      <span className="flex-1 text-left">{group.name}</span>
                      <span className="text-xs text-slate-500">{group.count}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </nav>

        {/* User section */}
        <div className="p-4 border-t border-white/10">
          <div className="flex items-center gap-3 px-2">
            <div className="w-9 h-9 rounded-full bg-electric-blue flex items-center justify-center text-white font-medium text-sm">
              P
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-medium truncate">pstebbins+test7...</p>
              <p className="text-slate-400 text-xs truncate">My Organization</p>
            </div>
          </div>
          <button className="w-full mt-3 flex items-center gap-2 px-4 py-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg text-sm transition-colors">
            <LogOut className="w-4 h-4" />
            Log out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="h-16 bg-card border-b border-border flex items-center justify-between px-6 shadow-sm">
          <div>
            <h1 className="text-xl font-semibold text-foreground">{getPageTitle()}</h1>
            <p className="text-xs text-muted-foreground">{getBreadcrumb()}</p>
          </div>

          <div className="flex items-center gap-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search..."
                className="w-64 h-10 pl-10 pr-4 rounded-xl bg-secondary border border-border text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-electric-blue focus:border-transparent transition-all"
              />
            </div>

            {/* Notifications */}
            <button className="relative w-10 h-10 rounded-xl bg-secondary hover:bg-secondary/80 flex items-center justify-center transition-colors">
              <Bell className="w-5 h-5 text-muted-foreground" />
              <span className="absolute top-2 right-2 w-2 h-2 bg-danger rounded-full"></span>
            </button>

            {/* Theme toggle */}
            <button
              onClick={toggleTheme}
              className="w-10 h-10 rounded-xl bg-secondary hover:bg-secondary/80 flex items-center justify-center transition-colors"
            >
              {theme === 'dark' ? (
                <Sun className="w-5 h-5 text-yellow-500" />
              ) : (
                <Moon className="w-5 h-5 text-muted-foreground" />
              )}
            </button>

            {/* User avatar */}
            <div className="w-10 h-10 rounded-full bg-electric-blue flex items-center justify-center text-white font-medium shadow-lg shadow-electric-blue/25">
              P
            </div>
          </div>
        </header>

{/* Page content */}
        <main className="flex-1 overflow-auto bg-background p-6">
          <Outlet />
        </main>
      </div>

      {/* Command Palette */}
      {showCommandPalette && (
        <div className="fixed inset-0 bg-black/50 flex items-start justify-center pt-[20vh] z-50" onClick={() => setShowCommandPalette(false)}>
          <div className="w-full max-w-lg bg-card border border-border rounded-2xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
              <Command className="w-5 h-5 text-muted-foreground" />
              <input 
                type="text" 
                placeholder="Type a command or search..."
                className="flex-1 bg-transparent text-foreground placeholder:text-muted-foreground focus:outline-none"
                autoFocus
              />
              <kbd className="px-2 py-1 text-xs bg-secondary rounded text-muted-foreground">ESC</kbd>
            </div>
            <div className="p-2 max-h-80 overflow-y-auto">
              {[
                { label: 'Go to Dashboard', shortcut: '⌘D', action: () => { navigate('/dashboard'); setShowCommandPalette(false) } },
                { label: 'Go to Devices', shortcut: '⌘⇧D', action: () => { navigate('/devices'); setShowCommandPalette(false) } },
                { label: 'Go to Settings', shortcut: '⌘,', action: () => { navigate('/settings'); setShowCommandPalette(false) } },
                { label: 'Enroll New Device', action: () => { navigate('/enroll'); setShowCommandPalette(false) } },
                { label: 'Toggle Dark Mode', action: () => { toggleTheme(); setShowCommandPalette(false) } },
              ].map((cmd, i) => (
                <button
                  key={i}
                  onClick={cmd.action}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-secondary text-left transition-colors"
                >
                  <span className="text-sm text-foreground">{cmd.label}</span>
                  {cmd.shortcut && <kbd className="text-xs text-muted-foreground">{cmd.shortcut}</kbd>}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
