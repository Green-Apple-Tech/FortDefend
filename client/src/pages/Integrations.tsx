import { useState } from 'react'
import { 
  Link2, 
  CheckCircle2, 
  XCircle, 
  ExternalLink,
  RefreshCw,
  Settings,
  Zap
} from 'lucide-react'

interface Integration {
  id: string
  name: string
  description: string
  icon: string
  status: 'connected' | 'disconnected' | 'pending'
  lastSync?: string
  category: 'mdm' | 'identity' | 'webhook' | 'monitoring'
}

const integrations: Integration[] = [
  {
    id: 'intune',
    name: 'Microsoft Intune',
    description: 'Sync devices and policies from Microsoft Intune',
    icon: '🔷',
    status: 'connected',
    lastSync: '5 minutes ago',
    category: 'mdm'
  },
  {
    id: 'google-admin',
    name: 'Google Admin',
    description: 'Import Chromebook devices from Google Workspace',
    icon: '🔴',
    status: 'disconnected',
    category: 'mdm'
  },
  {
    id: 'azure-ad',
    name: 'Azure Active Directory',
    description: 'Sync users and groups from Azure AD',
    icon: '🔵',
    status: 'connected',
    lastSync: '1 hour ago',
    category: 'identity'
  },
  {
    id: 'okta',
    name: 'Okta',
    description: 'SSO and user provisioning with Okta',
    icon: '⚪',
    status: 'disconnected',
    category: 'identity'
  },
  {
    id: 'slack',
    name: 'Slack',
    description: 'Send alerts and notifications to Slack channels',
    icon: '💬',
    status: 'connected',
    lastSync: 'Real-time',
    category: 'webhook'
  },
  {
    id: 'teams',
    name: 'Microsoft Teams',
    description: 'Send alerts to Teams channels',
    icon: '💜',
    status: 'disconnected',
    category: 'webhook'
  },
  {
    id: 'pagerduty',
    name: 'PagerDuty',
    description: 'Escalate critical alerts to PagerDuty',
    icon: '🟢',
    status: 'disconnected',
    category: 'monitoring'
  },
  {
    id: 'splunk',
    name: 'Splunk',
    description: 'Export logs and events to Splunk',
    icon: '🟡',
    status: 'pending',
    category: 'monitoring'
  }
]

const categories = [
  { id: 'all', label: 'All Integrations' },
  { id: 'mdm', label: 'MDM Platforms' },
  { id: 'identity', label: 'Identity Providers' },
  { id: 'webhook', label: 'Notifications' },
  { id: 'monitoring', label: 'Monitoring' }
]

export default function Integrations() {
  const [activeCategory, setActiveCategory] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')

  const filteredIntegrations = integrations.filter(integration => {
    const matchesCategory = activeCategory === 'all' || integration.category === activeCategory
    const matchesSearch = integration.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          integration.description.toLowerCase().includes(searchQuery.toLowerCase())
    return matchesCategory && matchesSearch
  })

  const getStatusBadge = (status: Integration['status']) => {
    switch (status) {
      case 'connected':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Connected
          </span>
        )
      case 'disconnected':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">
            <XCircle className="w-3.5 h-3.5" />
            Not Connected
          </span>
        )
      case 'pending':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            Syncing
          </span>
        )
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Integrations</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">
          Connect FortDefend to your existing tools and services
        </p>
      </div>

      {/* Search and Categories */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1 max-w-md">
          <input
            type="text"
            placeholder="Search integrations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-10 pl-4 pr-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
          />
        </div>
        
        <div className="flex gap-2 flex-wrap">
          {categories.map(category => (
            <button
              key={category.id}
              onClick={() => setActiveCategory(category.id)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                activeCategory === category.id
                  ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/25'
                  : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-600'
              }`}
            >
              {category.label}
            </button>
          ))}
        </div>
      </div>

      {/* Integration Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredIntegrations.map(integration => (
          <div
            key={integration.id}
            className="group bg-white dark:bg-gray-800/50 rounded-2xl border border-gray-100 dark:border-gray-700/50 p-6 hover:shadow-xl hover:shadow-gray-200/50 dark:hover:shadow-black/20 hover:border-blue-200 dark:hover:border-blue-800 transition-all duration-300"
          >
            <div className="flex items-start justify-between mb-4">
              <div className="w-12 h-12 rounded-xl bg-gray-50 dark:bg-gray-700/50 flex items-center justify-center text-2xl">
                {integration.icon}
              </div>
              {getStatusBadge(integration.status)}
            </div>
            
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              {integration.name}
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4 line-clamp-2">
              {integration.description}
            </p>
            
            {integration.lastSync && (
              <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">
                Last synced: {integration.lastSync}
              </p>
            )}
            
            <div className="flex gap-2">
              {integration.status === 'connected' ? (
                <>
                  <button className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-gray-50 dark:bg-gray-700/50 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                    <Settings className="w-4 h-4" />
                    Configure
                  </button>
                  <button className="flex items-center justify-center px-4 py-2 rounded-xl text-sm font-medium bg-gray-50 dark:bg-gray-700/50 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                    <RefreshCw className="w-4 h-4" />
                  </button>
                </>
              ) : (
                <button className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-blue-500 text-white hover:bg-blue-600 shadow-lg shadow-blue-500/25 transition-all">
                  <Link2 className="w-4 h-4" />
                  Connect
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Webhook Section */}
      <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-2xl border border-blue-100 dark:border-blue-800/50 p-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-500 flex items-center justify-center">
            <Zap className="w-6 h-6 text-white" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
              Custom Webhooks
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
              Send real-time events to any HTTP endpoint. Perfect for custom integrations and automation.
            </p>
            <button className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors">
              <ExternalLink className="w-4 h-4" />
              View Documentation
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
