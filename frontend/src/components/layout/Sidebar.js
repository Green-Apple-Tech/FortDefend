import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: '⊞', section: 'Overview' },
  { name: 'Devices', href: '/devices', icon: '💻', section: 'Security' },
  { name: 'Vulnerabilities', href: '/vulnerabilities', icon: '⚠️', section: 'Security' },
  { name: 'Threats', href: '/threats', icon: '🛡️', section: 'Security' },
  { name: 'Alerts', href: '/alerts', icon: '🔔', section: 'Security' },
  { name: 'Patch Management', href: '/patches', icon: '🔄', section: 'Security' },
  { name: 'AI Agents', href: '/agents', icon: '🤖', section: 'Automation' },
  { name: 'Monitoring', href: '/monitoring', icon: '📊', section: 'Automation' },
  { name: 'Commands', href: '/commands', icon: '⌨️', section: 'Automation' },
  { name: 'Scripts', href: '/scripts', icon: '📜', section: 'Automation' },
  { name: 'Policies', href: '/policies', icon: '📋', section: 'Policies' },
  { name: 'Compliance', href: '/compliance', icon: '✅', section: 'Policies' },
  { name: 'MSP Clients', href: '/msp', icon: '🏢', section: 'MSP' },
  { name: 'Integrations', href: '/integrations', icon: '🔗', section: 'Integrations' },
  { name: 'API Keys', href: '/api-keys', icon: '🔑', section: 'Integrations' },
  { name: 'Reports', href: '/reports', icon: '📄', section: 'Reports' },
  { name: 'Settings', href: '/settings', icon: '⚙️', section: 'Settings' },
];

const sections = ['Overview', 'Security', 'Automation', 'Policies', 'MSP', 'Integrations', 'Reports', 'Settings'];

export default function Sidebar({ darkMode, setDarkMode }) {
  const { user, org, logout } = useAuth();

  return (
    <div className={`w-64 h-screen flex flex-col fixed left-0 top-0 z-50 ${darkMode ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-200'} border-r`}>
      <div className={`px-6 py-5 border-b ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-sm">F</span>
          </div>
          <div>
            <div className={`font-bold text-sm ${darkMode ? 'text-white' : 'text-gray-900'}`}>FortDefend</div>
            <div className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{org?.name || 'Loading...'}</div>
          </div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {sections.map(section => {
          const items = navigation.filter(n => n.section === section);
          return (
            <div key={section} className="mb-4">
              <div className={`text-xs font-semibold uppercase tracking-wider px-3 mb-1 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                {section}
              </div>
              {items.map(item => (
                <NavLink
                  key={item.href}
                  to={item.href}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium mb-0.5 transition-colors ${
                      isActive
                        ? 'bg-blue-600 text-white'
                        : darkMode
                          ? 'text-gray-300 hover:bg-gray-800'
                          : 'text-gray-600 hover:bg-gray-100'
                    }`
                  }
                >
                  <span>{item.icon}</span>
                  {item.name}
                </NavLink>
              ))}
            </div>
          );
        })}
      </nav>

      <div className={`px-3 py-4 border-t ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
        <button
          onClick={() => setDarkMode(!darkMode)}
          className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium mb-2 ${darkMode ? 'text-gray-300 hover:bg-gray-800' : 'text-gray-600 hover:bg-gray-100'}`}
        >
          <span>{darkMode ? '☀️' : '🌙'}</span>
          {darkMode ? 'Light mode' : 'Dark mode'}
        </button>
        <button
          onClick={logout}
          className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium ${darkMode ? 'text-gray-300 hover:bg-gray-800' : 'text-gray-600 hover:bg-gray-100'}`}
        >
          <span>🚪</span>
          Sign out
        </button>
        <div className={`mt-3 px-3 py-2 rounded-lg ${darkMode ? 'bg-gray-800' : 'bg-gray-50'}`}>
          <div className={`text-xs font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>{user?.email}</div>
          <div className={`text-xs capitalize ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{user?.role}</div>
        </div>
      </div>
    </div>
  );
}
