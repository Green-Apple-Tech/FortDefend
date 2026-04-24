import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { Card, Button, Input } from '../components/ui';
import { ToggleCard } from '../components/fds';
import { useTheme } from '../context/ThemeContext';

const LS_PREFIX = 'fds_settings_v1_';

function loadBool(key, fallback) {
  try {
    const v = localStorage.getItem(LS_PREFIX + key);
    if (v === null) return fallback;
    return v === 'true';
  } catch {
    return fallback;
  }
}

function saveBool(key, val) {
  try {
    localStorage.setItem(LS_PREFIX + key, val ? 'true' : 'false');
  } catch {
    /* ignore */
  }
}

export default function Settings() {
  const { user } = useAuth();
  const { theme, setTheme } = useTheme();
  const [orgName, setOrgName] = useState('');
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(true);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [rawJson, setRawJson] = useState('{}');
  const [jsonError, setJsonError] = useState('');

  const [require2fa, setRequire2fa] = useState(() => loadBool('require2fa', true));
  const [autoLock, setAutoLock] = useState(() => loadBool('autoLock', true));
  const [blockUsb, setBlockUsb] = useState(() => loadBool('blockUsb', false));

  const [autoCritical, setAutoCritical] = useState(() => loadBool('autoCritical', true));
  const [autoSecurity, setAutoSecurity] = useState(() => loadBool('autoSecurity', true));
  const [notifyPatch, setNotifyPatch] = useState(() => loadBool('notifyPatch', true));

  const [emailAlerts, setEmailAlerts] = useState(() => loadBool('emailAlerts', true));
  const [weeklyDigest, setWeeklyDigest] = useState(() => loadBool('weeklyDigest', false));
  const [enrollNotify, setEnrollNotify] = useState(() => loadBool('enrollNotify', true));

  const [heartbeat30, setHeartbeat30] = useState(() => loadBool('heartbeat30', true));
  const [autoUpdateAgent, setAutoUpdateAgent] = useState(() => loadBool('autoUpdateAgent', true));
  const [fullInventory, setFullInventory] = useState(() => loadBool('fullInventory', true));

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const org = await api('/api/orgs/me');
        if (!cancelled && org?.name) setOrgName(org.name);
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function buildSnapshot() {
    return {
      security: { require2fa, autoLock15m: autoLock, blockUsb },
      patch: { autoCritical, autoSecurity, notifyBefore: notifyPatch },
      notifications: { emailAlerts, weeklyDigest, enrollNotify },
      agent: { heartbeat30s: heartbeat30, autoUpdateAgent, fullInventory },
    };
  }

  function refreshAdvancedJson() {
    setRawJson(JSON.stringify(buildSnapshot(), null, 2));
    setJsonError('');
  }

  async function saveOrg(e) {
    e.preventDefault();
    setMsg('');
    try {
      await api('/api/orgs/me', { method: 'PATCH', body: { name: orgName } });
      setMsg('Organization updated.');
    } catch (err) {
      setMsg(err.message || 'Save failed');
    }
  }

  function applyJson() {
    setJsonError('');
    try {
      const o = JSON.parse(rawJson);
      if (o.security) {
        if (typeof o.security.require2fa === 'boolean') setRequire2fa(o.security.require2fa);
        if (typeof o.security.autoLock15m === 'boolean') setAutoLock(o.security.autoLock15m);
        if (typeof o.security.blockUsb === 'boolean') setBlockUsb(o.security.blockUsb);
      }
      if (o.patch) {
        if (typeof o.patch.autoCritical === 'boolean') setAutoCritical(o.patch.autoCritical);
        if (typeof o.patch.autoSecurity === 'boolean') setAutoSecurity(o.patch.autoSecurity);
        if (typeof o.patch.notifyBefore === 'boolean') setNotifyPatch(o.patch.notifyBefore);
      }
      if (o.notifications) {
        if (typeof o.notifications.emailAlerts === 'boolean') setEmailAlerts(o.notifications.emailAlerts);
        if (typeof o.notifications.weeklyDigest === 'boolean') setWeeklyDigest(o.notifications.weeklyDigest);
        if (typeof o.notifications.enrollNotify === 'boolean') setEnrollNotify(o.notifications.enrollNotify);
      }
      if (o.agent) {
        if (typeof o.agent.heartbeat30s === 'boolean') setHeartbeat30(o.agent.heartbeat30s);
        if (typeof o.agent.autoUpdateAgent === 'boolean') setAutoUpdateAgent(o.agent.autoUpdateAgent);
        if (typeof o.agent.fullInventory === 'boolean') setFullInventory(o.agent.fullInventory);
      }
      setMsg('Applied JSON to toggles (saved locally).');
    } catch {
      setJsonError('Invalid JSON — fix syntax and try again.');
    }
  }

  const section = (title, desc, children) => (
    <div className="space-y-3">
      <div>
        <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">{title}</h2>
        {desc && <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{desc}</p>}
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );

  return (
    <div className="mx-auto max-w-3xl space-y-3">
      {msg && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100">
          {msg}
        </div>
      )}

      <Card>
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-50">Appearance</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Light, dark, or follow your system setting.</p>
        <div className="mt-4 inline-flex rounded-lg border border-fds-border bg-fds-page p-1 dark:bg-slate-900/50">
          {(['light', 'dark', 'system']).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setTheme(mode)}
              className={`rounded-md px-4 py-2 text-sm font-semibold capitalize transition ${
                theme === mode
                  ? 'bg-brand text-white shadow-sm'
                  : 'text-slate-600 hover:bg-fds-card hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-50'
              }`}
            >
              {mode}
            </button>
          ))}
        </div>
      </Card>

      <Card>
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-50">Organization</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Display name used across FortDefend and reports.</p>
        <form onSubmit={saveOrg} className="mt-4 space-y-4">
          <Input label="Organization name" value={orgName} onChange={(e) => setOrgName(e.target.value)} />
          <Button type="submit" disabled={loading}>
            Save
          </Button>
        </form>
      </Card>

      <Card className="space-y-8">
        {section(
          'Security policies',
          'Baseline protections for every admin session and managed endpoint.',
          <>
            <ToggleCard
              icon="🔐"
              title="Require 2FA"
              description="Require two-factor authentication for all org users."
              on={require2fa}
              onChange={(v) => {
                setRequire2fa(v);
                saveBool('require2fa', v);
              }}
            />
            <ToggleCard
              icon="⏱"
              title="Auto-lock after 15 minutes"
              description="Lock the FortDefend console when idle."
              on={autoLock}
              onChange={(v) => {
                setAutoLock(v);
                saveBool('autoLock', v);
              }}
            />
            <ToggleCard
              icon="💾"
              title="Block USB storage"
              description="Prevent mass storage on managed devices (agent policy)."
              on={blockUsb}
              onChange={(v) => {
                setBlockUsb(v);
                saveBool('blockUsb', v);
              }}
            />
            <p className="text-xs text-slate-500">
              2FA enrollment:{' '}
              <Link to="/setup-2fa" className="font-semibold text-brand hover:underline">
                Open 2FA setup
              </Link>
            </p>
          </>,
        )}

        {section(
          'Patch management',
          'Control how aggressive automatic patching should be.',
          <>
            <ToggleCard
              icon="🛡"
              title="Auto-approve critical patches"
              description="Queue critical updates without manual approval."
              on={autoCritical}
              onChange={(v) => {
                setAutoCritical(v);
                saveBool('autoCritical', v);
              }}
            />
            <ToggleCard
              icon="🔒"
              title="Auto-approve security patches"
              description="Security-class updates roll out on the next maintenance window."
              on={autoSecurity}
              onChange={(v) => {
                setAutoSecurity(v);
                saveBool('autoSecurity', v);
              }}
            />
            <ToggleCard
              icon="📣"
              title="Notify before patching"
              description="Send a heads-up before installs run on user machines."
              on={notifyPatch}
              onChange={(v) => {
                setNotifyPatch(v);
                saveBool('notifyPatch', v);
              }}
            />
          </>,
        )}

        {section(
          'Notifications',
          'Stay informed without drowning in noise.',
          <>
            <ToggleCard
              icon="✉️"
              title="Email alerts"
              description="Send email when new alerts are raised."
              on={emailAlerts}
              onChange={(v) => {
                setEmailAlerts(v);
                saveBool('emailAlerts', v);
              }}
            />
            <ToggleCard
              icon="📅"
              title="Weekly digest"
              description="Summary of fleet posture every Monday."
              on={weeklyDigest}
              onChange={(v) => {
                setWeeklyDigest(v);
                saveBool('weeklyDigest', v);
              }}
            />
            <ToggleCard
              icon="📱"
              title="Alert on new device enrollment"
              description="Ping admins when a new device joins the org."
              on={enrollNotify}
              onChange={(v) => {
                setEnrollNotify(v);
                saveBool('enrollNotify', v);
              }}
            />
          </>,
        )}

        {section(
          'Agent',
          'How often endpoints check in and what they collect.',
          <>
            <ToggleCard
              icon="💓"
              title="30-second heartbeat"
              description="Faster command delivery; slightly more traffic."
              on={heartbeat30}
              onChange={(v) => {
                setHeartbeat30(v);
                saveBool('heartbeat30', v);
              }}
            />
            <ToggleCard
              icon="⬆️"
              title="Auto-update agent"
              description="Silently upgrade the FortDefend agent when a new build ships."
              on={autoUpdateAgent}
              onChange={(v) => {
                setAutoUpdateAgent(v);
                saveBool('autoUpdateAgent', v);
              }}
            />
            <ToggleCard
              icon="📋"
              title="Collect full inventory"
              description="Include detailed hardware and software lists in each scan."
              on={fullInventory}
              onChange={(v) => {
                setFullInventory(v);
                saveBool('fullInventory', v);
              }}
            />
          </>,
        )}
      </Card>

      <Card>
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-50">Fleet tools</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Scripts, reboot schedules, reports, and billing live here so the main sidebar stays focused on patching and devices.
        </p>
        <ul className="mt-4 space-y-2 text-sm">
          <li>
            <Link to="/settings/scripts" className="font-semibold text-brand hover:underline">
              Custom scripts
            </Link>
            <span className="text-slate-500 dark:text-slate-400"> — create and run shell scripts on endpoints</span>
          </li>
          <li>
            <Link to="/settings/reboot-policies" className="font-semibold text-brand hover:underline">
              Reboot policies
            </Link>
            <span className="text-slate-500 dark:text-slate-400"> — after patches, when machines restart</span>
          </li>
          <li>
            <Link to="/settings/reports" className="font-semibold text-brand hover:underline">
              Reports
            </Link>
            <span className="text-slate-500 dark:text-slate-400"> — executive and patch summaries</span>
          </li>
          <li>
            <Link to="/settings/billing" className="font-semibold text-brand hover:underline">
              Billing
            </Link>
            <span className="text-slate-500 dark:text-slate-400"> — plan and subscription</span>
          </li>
          {user?.role === 'msp' ? (
            <li>
              <Link to="/msp/clients" className="font-semibold text-brand hover:underline">
                MSP console
              </Link>
              <span className="text-slate-500 dark:text-slate-400"> — manage client orgs</span>
            </li>
          ) : null}
        </ul>
      </Card>

      <Card>
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-50">Integrations</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Connect Intune, Google Admin, and webhooks from the Integrations hub.</p>
        <Link to="/integrations" className="mt-3 inline-block text-sm font-semibold text-brand hover:underline">
          Open integrations →
        </Link>
      </Card>

      <Card>
        <button
          type="button"
          onClick={() => {
            setAdvancedOpen((o) => {
              const next = !o;
              if (next) refreshAdvancedJson();
              return next;
            });
          }}
          className="flex w-full items-center justify-between text-left"
        >
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-50">Advanced</h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Raw JSON mirror of the toggles above — power users only.</p>
          </div>
          <span className="text-slate-400">{advancedOpen ? '▼' : '▶'}</span>
        </button>
        {advancedOpen && (
          <div className="mt-4 space-y-3 border-t border-fds-border pt-4">
            <label className="block text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Configuration JSON</label>
            <textarea
              value={rawJson}
              onChange={(e) => setRawJson(e.target.value)}
              rows={14}
              className="w-full rounded-lg border border-fds-border bg-slate-50 px-3 py-2 font-mono text-xs text-slate-900 shadow-inner focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand dark:bg-slate-900 dark:text-slate-100"
            />
            {jsonError && <p className="text-sm text-red-600">{jsonError}</p>}
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={refreshAdvancedJson}>
                Sync from toggles
              </Button>
              <Button type="button" variant="outline" onClick={applyJson}>
                Apply JSON to toggles
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
