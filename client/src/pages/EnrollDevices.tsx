import { useState } from 'react'
import { Monitor, Smartphone, Tablet, ChevronDown, CheckCircle2 } from 'lucide-react'

const platforms = [
  {
    id: 'windows',
    name: 'Windows',
    description: 'PowerShell agent',
    icon: '🪟',
    color: 'bg-blue-500/10 border-blue-500/30 hover:border-blue-500',
  },
  {
    id: 'mac',
    name: 'Mac',
    description: '.pkg agent',
    icon: '🍎',
    color: 'bg-slate-500/10 border-slate-500/30 hover:border-slate-500',
  },
  {
    id: 'chromebook',
    name: 'Chromebook',
    description: 'Extension',
    icon: '🌐',
    color: 'bg-emerald-500/10 border-emerald-500/30 hover:border-emerald-500',
  },
  {
    id: 'android',
    name: 'Android',
    description: 'APK / Play',
    icon: '🤖',
    color: 'bg-green-500/10 border-green-500/30 hover:border-green-500',
  },
  {
    id: 'ios',
    name: 'iOS / iPad',
    description: 'App Store / MDM',
    icon: '📱',
    color: 'bg-slate-500/10 border-slate-500/30 hover:border-slate-500',
  },
]

export default function EnrollDevices() {
  const [selectedPlatform, setSelectedPlatform] = useState<string | null>('windows')
  const [selectedGroup, setSelectedGroup] = useState('No group (General)')

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      {/* Header with counter */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Enroll devices</h1>
          <p className="text-muted-foreground mt-2 max-w-2xl">
            Pick a platform, follow the numbered steps, and download the package. Links embed your org enrollment token.
          </p>
        </div>
        <div className="bg-card rounded-2xl border border-border p-6 shadow-sm text-center min-w-[160px]">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Devices Enrolled</p>
          <p className="text-4xl font-bold text-navy-900 dark:text-foreground mt-2">0</p>
        </div>
      </div>

      {/* Group selector */}
      <div className="bg-card rounded-2xl border border-border p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-foreground mb-2">Enroll into group</h3>
        <div className="relative max-w-md">
          <select 
            value={selectedGroup}
            onChange={(e) => setSelectedGroup(e.target.value)}
            className="w-full h-12 px-4 pr-10 rounded-xl bg-secondary border border-border text-sm font-medium focus:outline-none focus:ring-2 focus:ring-electric-blue focus:border-transparent transition-all appearance-none cursor-pointer"
          >
            <option>—— No group (General)</option>
            <option>Department 1</option>
            <option>Group One</option>
            <option>Group 2</option>
          </select>
          <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        </div>
        <p className="text-sm text-muted-foreground mt-3">
          You can also move devices between groups from Devices or Groups after they appear.
        </p>
      </div>

      {/* Platform selection */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {platforms.map((platform) => (
          <button
            key={platform.id}
            onClick={() => setSelectedPlatform(platform.id)}
            className={`relative p-6 rounded-2xl border-2 transition-all duration-200 ${
              selectedPlatform === platform.id
                ? 'border-electric-blue bg-electric-blue/5 shadow-lg shadow-electric-blue/10'
                : `${platform.color} bg-card`
            }`}
          >
            {selectedPlatform === platform.id && (
              <div className="absolute top-3 right-3">
                <CheckCircle2 className="w-5 h-5 text-electric-blue" />
              </div>
            )}
            <div className="text-4xl mb-3">{platform.icon}</div>
            <h3 className="text-lg font-semibold text-foreground">{platform.name}</h3>
            <p className="text-sm text-muted-foreground mt-1">{platform.description}</p>
          </button>
        ))}
      </div>

      {/* Installation steps */}
      {selectedPlatform && (
        <div className="bg-card rounded-2xl border border-border p-8 shadow-sm">
          <h3 className="text-lg font-semibold text-foreground mb-6">
            Installation steps for {platforms.find(p => p.id === selectedPlatform)?.name}
          </h3>
          
          {selectedPlatform === 'windows' && <WindowsSteps />}
          {selectedPlatform === 'mac' && <MacSteps />}
          {selectedPlatform === 'chromebook' && <ChromebookSteps />}
          {selectedPlatform === 'android' && <AndroidSteps />}
          {selectedPlatform === 'ios' && <IOSSteps />}
        </div>
      )}
    </div>
  )
}

function WindowsSteps() {
  return (
    <div className="space-y-6">
      <Step number={1} title="Open PowerShell as Administrator">
        <p className="text-muted-foreground">Right-click the Start menu and select "Windows Terminal (Admin)" or "PowerShell (Admin)".</p>
      </Step>
      <Step number={2} title="Run the enrollment command">
        <div className="bg-navy-900 dark:bg-navy-950 rounded-xl p-4 mt-3">
          <code className="text-sm text-emerald font-mono">
            irm https://fortdefend.app/enroll/YOUR_ORG_TOKEN | iex
          </code>
        </div>
        <button className="mt-3 px-4 py-2 rounded-lg bg-electric-blue/10 text-electric-blue text-sm font-medium hover:bg-electric-blue/20 transition-colors">
          Copy command
        </button>
      </Step>
      <Step number={3} title="Verify installation">
        <p className="text-muted-foreground">The device will appear in your Devices list within 30 seconds after successful enrollment.</p>
      </Step>
    </div>
  )
}

function MacSteps() {
  return (
    <div className="space-y-6">
      <Step number={1} title="Download the installer">
        <button className="mt-3 px-6 py-3 rounded-xl bg-electric-blue text-white text-sm font-medium hover:bg-electric-blue/90 transition-colors shadow-lg shadow-electric-blue/25">
          Download FortDefend.pkg
        </button>
      </Step>
      <Step number={2} title="Open the installer">
        <p className="text-muted-foreground">Double-click the downloaded .pkg file and follow the installation wizard.</p>
      </Step>
      <Step number={3} title="Grant permissions">
        <p className="text-muted-foreground">Allow FortDefend in System Preferences → Security & Privacy when prompted.</p>
      </Step>
    </div>
  )
}

function ChromebookSteps() {
  return (
    <div className="space-y-6">
      <Step number={1} title="Install the extension">
        <button className="mt-3 px-6 py-3 rounded-xl bg-electric-blue text-white text-sm font-medium hover:bg-electric-blue/90 transition-colors shadow-lg shadow-electric-blue/25">
          Open Chrome Web Store
        </button>
      </Step>
      <Step number={2} title="Sign in">
        <p className="text-muted-foreground">Click the FortDefend extension icon and sign in with your organization credentials.</p>
      </Step>
    </div>
  )
}

function AndroidSteps() {
  return (
    <div className="space-y-6">
      <Step number={1} title="Download the app">
        <div className="flex gap-3 mt-3">
          <button className="px-6 py-3 rounded-xl bg-electric-blue text-white text-sm font-medium hover:bg-electric-blue/90 transition-colors shadow-lg shadow-electric-blue/25">
            Google Play Store
          </button>
          <button className="px-6 py-3 rounded-xl border border-electric-blue text-electric-blue text-sm font-medium hover:bg-electric-blue/10 transition-colors">
            Download APK
          </button>
        </div>
      </Step>
      <Step number={2} title="Open the app and scan QR code">
        <p className="text-muted-foreground">Scan the QR code below or enter your organization token manually.</p>
        <div className="w-32 h-32 bg-secondary rounded-xl mt-3 flex items-center justify-center">
          <span className="text-muted-foreground text-sm">QR Code</span>
        </div>
      </Step>
    </div>
  )
}

function IOSSteps() {
  return (
    <div className="space-y-6">
      <Step number={1} title="Download from App Store">
        <button className="mt-3 px-6 py-3 rounded-xl bg-electric-blue text-white text-sm font-medium hover:bg-electric-blue/90 transition-colors shadow-lg shadow-electric-blue/25">
          Open App Store
        </button>
      </Step>
      <Step number={2} title="Open the app">
        <p className="text-muted-foreground">Open FortDefend and sign in with your organization credentials or scan the QR code.</p>
      </Step>
      <Step number={3} title="Install MDM profile">
        <p className="text-muted-foreground">Follow the prompts to install the management profile in Settings.</p>
      </Step>
    </div>
  )
}

function Step({ number, title, children }: { number: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4">
      <div className="w-8 h-8 rounded-full bg-electric-blue text-white flex items-center justify-center text-sm font-bold flex-shrink-0">
        {number}
      </div>
      <div className="flex-1">
        <h4 className="text-base font-semibold text-foreground">{title}</h4>
        <div className="mt-2">{children}</div>
      </div>
    </div>
  )
}
