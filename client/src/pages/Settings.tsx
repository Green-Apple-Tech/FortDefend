import { useState } from 'react'
import { 
  Lock, 
  Usb, 
  Shield, 
  Bell, 
  Zap,
  Package,
  RefreshCw,
  ExternalLink,
  ChevronRight,
  Settings2
} from 'lucide-react'

const tabs = ['General', 'Groups', 'MSP']

export default function Settings() {
  const [activeTab, setActiveTab] = useState('General')

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Settings</h1>
        <p className="text-muted-foreground mt-1">
          Set policies once with large toggles. Values below are stored in this browser until your org API persists them.
        </p>
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

      {activeTab === 'General' && <GeneralSettings />}
      {activeTab === 'Groups' && <GroupsSettings />}
      {activeTab === 'MSP' && <MSPSettings />}
    </div>
  )
}

function GeneralSettings() {
  const [settings, setSettings] = useState({
    orgName: 'My Organization',
    require2FA: true,
    autoLock: true,
    blockUSB: false,
    thirtySecHeartbeat: true,
    collectInventory: true,
    autoUpdateAgent: false,
    notifyBeforeUpdate: true,
    autoCriticalPatches: true,
    autoSecurityPatches: true,
    notifyBeforePatching: true,
  })

  const toggleSetting = (key: keyof typeof settings) => {
    if (typeof settings[key] === 'boolean') {
      setSettings(prev => ({ ...prev, [key]: !prev[key] }))
    }
  }

  return (
    <div className="space-y-8">
      {/* Organization */}
      <SettingsCard title="Organization" description="Display name used across FortDefend and reports.">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">Organization name</label>
            <input
              type="text"
              value={settings.orgName}
              onChange={(e) => setSettings(prev => ({ ...prev, orgName: e.target.value }))}
              className="w-full h-11 px-4 rounded-xl bg-secondary border border-border text-sm focus:outline-none focus:ring-2 focus:ring-electric-blue focus:border-transparent transition-all"
            />
          </div>
          <button className="px-6 py-2.5 rounded-xl bg-electric-blue text-white text-sm font-medium hover:bg-electric-blue/90 transition-colors shadow-lg shadow-electric-blue/25">
            Save
          </button>
        </div>
      </SettingsCard>

      {/* Security Policies */}
      <SettingsCard 
        title="SECURITY POLICIES" 
        description="Baseline protections for every admin session and managed endpoint."
        isSection
      >
        <div className="space-y-4">
          <SettingToggle
            icon={Shield}
            iconColor="text-warning"
            iconBg="bg-warning/10"
            title="Require 2FA"
            description="Require two-factor authentication for all org users."
            enabled={settings.require2FA}
            onToggle={() => toggleSetting('require2FA')}
          />
          <SettingToggle
            icon={Lock}
            iconColor="text-muted-foreground"
            iconBg="bg-muted"
            title="Auto-lock after 15 minutes"
            description="Lock the FortDefend console when idle."
            enabled={settings.autoLock}
            onToggle={() => toggleSetting('autoLock')}
          />
          <SettingToggle
            icon={Usb}
            iconColor="text-muted-foreground"
            iconBg="bg-muted"
            title="Block USB storage"
            description="Prevent mass storage on managed devices (agent policy)."
            enabled={settings.blockUSB}
            onToggle={() => toggleSetting('blockUSB')}
          />
        </div>
        <div className="mt-4 pt-4 border-t border-border">
          <a href="#" className="text-sm text-electric-blue hover:text-electric-blue/80 font-medium transition-colors">
            2FA enrollment: Open 2FA setup
          </a>
        </div>
      </SettingsCard>

      {/* Agent */}
      <SettingsCard 
        title="AGENT" 
        description="How often endpoints check in and what they collect."
        isSection
      >
        <div className="space-y-4">
          <SettingToggle
            icon={Zap}
            iconColor="text-pink-500"
            iconBg="bg-pink-500/10"
            title="30-second heartbeat"
            description="Faster command delivery; slightly more traffic."
            enabled={settings.thirtySecHeartbeat}
            onToggle={() => toggleSetting('thirtySecHeartbeat')}
          />
          <SettingToggle
            icon={Package}
            iconColor="text-muted-foreground"
            iconBg="bg-muted"
            title="Collect full inventory"
            description="Include detailed hardware and software lists in each scan."
            enabled={settings.collectInventory}
            onToggle={() => toggleSetting('collectInventory')}
          />
        </div>
      </SettingsCard>

      {/* Agent Management */}
      <SettingsCard title="Agent Management">
        <div className="space-y-4">
          <SettingToggle
            icon={RefreshCw}
            iconColor="text-muted-foreground"
            iconBg="bg-muted"
            title="Auto-update agent on all devices"
            description="When enabled, devices automatically update to the latest agent version on next check-in."
            enabled={settings.autoUpdateAgent}
            onToggle={() => toggleSetting('autoUpdateAgent')}
          />
          <SettingToggle
            icon={Bell}
            iconColor="text-warning"
            iconBg="bg-warning/10"
            title="Notify before updating"
            description="Show a pre-update notice before agent updates begin."
            enabled={settings.notifyBeforeUpdate}
            onToggle={() => toggleSetting('notifyBeforeUpdate')}
          />
        </div>
        <div className="mt-4 pt-4 border-t border-border flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Current agent version: <span className="font-semibold text-foreground">1.0.2</span></span>
          <button className="px-6 py-2.5 rounded-xl bg-electric-blue text-white text-sm font-medium hover:bg-electric-blue/90 transition-colors shadow-lg shadow-electric-blue/25">
            Force update all devices now
          </button>
        </div>
      </SettingsCard>

      {/* Patch Management */}
      <SettingsCard 
        title="PATCH MANAGEMENT" 
        description="Control how aggressive automatic patching should be."
        isSection
      >
        <div className="space-y-4">
          <SettingToggle
            icon={Shield}
            iconColor="text-danger"
            iconBg="bg-danger/10"
            title="Auto-approve critical patches"
            description="Queue critical updates without manual approval."
            enabled={settings.autoCriticalPatches}
            onToggle={() => toggleSetting('autoCriticalPatches')}
          />
          <SettingToggle
            icon={Shield}
            iconColor="text-warning"
            iconBg="bg-warning/10"
            title="Auto-approve security patches"
            description="Security-class updates roll out on the next maintenance window."
            enabled={settings.autoSecurityPatches}
            onToggle={() => toggleSetting('autoSecurityPatches')}
          />
          <SettingToggle
            icon={Bell}
            iconColor="text-warning"
            iconBg="bg-warning/10"
            title="Notify before patching"
            description="Send a heads-up before installs run on user machines."
            enabled={settings.notifyBeforePatching}
            onToggle={() => toggleSetting('notifyBeforePatching')}
          />
        </div>
      </SettingsCard>

      {/* Notifications */}
      <SettingsCard 
        title="NOTIFICATIONS" 
        description="Stay informed without drowning in noise."
        isSection
      >
        <p className="text-sm text-muted-foreground">Configure notification preferences in your profile settings.</p>
      </SettingsCard>

      {/* Integrations */}
      <SettingsCard title="Integrations">
        <p className="text-muted-foreground mb-4">Connect Intune, Google Admin, and webhooks from the Integrations hub.</p>
        <a href="/integrations" className="inline-flex items-center gap-2 text-sm text-electric-blue hover:text-electric-blue/80 font-medium transition-colors">
          Open integrations <ExternalLink className="w-4 h-4" />
        </a>
      </SettingsCard>

      {/* Advanced */}
      <SettingsCard title="Advanced">
        <button className="flex items-center justify-between w-full text-left">
          <div>
            <p className="text-sm text-muted-foreground">Raw JSON mirror of the toggles above — power users only.</p>
          </div>
          <ChevronRight className="w-5 h-5 text-muted-foreground" />
        </button>
      </SettingsCard>
    </div>
  )
}

function GroupsSettings() {
  return (
    <div className="bg-card rounded-2xl border border-border p-8 shadow-sm text-center">
      <Settings2 className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
      <h3 className="text-lg font-semibold text-foreground mb-2">Device Groups</h3>
      <p className="text-muted-foreground">Organize your devices into groups for easier management.</p>
      <button className="mt-4 px-6 py-2 rounded-xl bg-electric-blue text-white text-sm font-medium hover:bg-electric-blue/90 transition-colors shadow-lg shadow-electric-blue/25">
        Create Group
      </button>
    </div>
  )
}

function MSPSettings() {
  return (
    <div className="bg-card rounded-2xl border border-border p-8 shadow-sm text-center">
      <Settings2 className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
      <h3 className="text-lg font-semibold text-foreground mb-2">MSP Settings</h3>
      <p className="text-muted-foreground">Configure multi-tenant settings for managed service providers.</p>
    </div>
  )
}

interface SettingsCardProps {
  title: string
  description?: string
  isSection?: boolean
  children: React.ReactNode
}

function SettingsCard({ title, description, isSection, children }: SettingsCardProps) {
  return (
    <div className="bg-card rounded-2xl border border-border p-6 shadow-sm hover:shadow-md transition-shadow">
      {isSection ? (
        <div className="mb-4">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{title}</h3>
          {description && <p className="text-sm text-muted-foreground mt-1">{description}</p>}
        </div>
      ) : (
        <div className="mb-4">
          <h3 className="text-lg font-semibold text-foreground">{title}</h3>
          {description && <p className="text-sm text-muted-foreground mt-1">{description}</p>}
        </div>
      )}
      {children}
    </div>
  )
}

interface SettingToggleProps {
  icon: React.ElementType
  iconColor: string
  iconBg: string
  title: string
  description: string
  enabled: boolean
  onToggle: () => void
}

function SettingToggle({ icon: Icon, iconColor, iconBg, title, description, enabled, onToggle }: SettingToggleProps) {
  return (
    <div className="flex items-center gap-4 p-4 rounded-xl bg-secondary/50 hover:bg-secondary transition-colors">
      <div className={`w-10 h-10 rounded-xl ${iconBg} flex items-center justify-center flex-shrink-0`}>
        <Icon className={`w-5 h-5 ${iconColor}`} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <button
        onClick={onToggle}
        className={`relative w-12 h-7 rounded-full transition-colors ${
          enabled ? 'bg-emerald' : 'bg-muted'
        }`}
      >
        <span
          className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${
            enabled ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
    </div>
  )
}
