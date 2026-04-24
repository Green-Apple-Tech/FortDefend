import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { Card } from '../components/ui';
import { SectionHeader } from '../components/fds';

const POLL_MS = 60_000;

const btnPrimary =
  'inline-flex min-h-[52px] items-center justify-center rounded-xl bg-brand px-6 py-3 text-base font-semibold text-white shadow-md transition hover:bg-brand-dark focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2 disabled:pointer-events-none disabled:opacity-50';
const btnOutline =
  'inline-flex min-h-[52px] items-center justify-center rounded-xl border border-fds-border bg-white px-6 py-3 text-base font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2 disabled:pointer-events-none disabled:opacity-50';

/** Replace with your published extension ID from the Chrome Web Store / Google Admin. */
const FORTDEFEND_EXTENSION_ID = 'FORTDEFEND_EXTENSION_ID';
const CHROME_WEB_STORE_URL = 'https://chrome.google.com/webstore/detail/fortdefend/FORTDEFEND_EXTENSION_ID';

function formatBytes(n) {
  if (!Number.isFinite(n) || n < 0) return '';
  const u = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024;
    i += 1;
  }
  const rounded = i === 0 ? Math.round(v) : v < 10 ? v.toFixed(1) : Math.round(v);
  return `${rounded} ${u[i]}`;
}

function IconWindows({ className = 'h-8 w-8' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <path fill="currentColor" d="M3 5.5 10.5 4.5v7H3v-6zm8-.9 10 1.4V11h-10V4.6zm-8 8.4h7.5V21L3 19.5v-6zm8.5 1L21 15v6l-9.5 1.3V14z" />
    </svg>
  );
}

function IconApple({ className = 'h-8 w-8' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M16.36 1c-.27 1.6.86 3.17 2.08 4.2-.5.15-1.03.47-1.4.9-.66.7-1.15 1.65-1.15 2.64 0 2.02 1.65 3.66 3.66 3.66.45 0 .88-.08 1.28-.23-.08 2.5-1.4 4.9-3.5 6.5-1.35 1-2.85 1.73-4.33 1.73-1.05 0-2.05-.35-3.05-.7-1-.35-2-.7-3.1-.7-1.45 0-3.1.8-4.5 1.85C3.5 21.5 2 23 1 23c-.35 0-.65-.25-.65-.6 0-.05 0-.15.05-.2C2.5 18.5 4 15.5 4 12.5c0-3.5-2-6.5-5.5-8 .5-1.5 2-2.5 3.5-2.5 1.2 0 2.4.4 3.4.4.9 0 2.1-.45 3.5-.45 1.15 0 2.35.35 3.46 1.05z"
      />
    </svg>
  );
}

function IconChrome({ className = 'h-8 w-8' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="12" r="10" fill="#fff" stroke="#e2e8f0" strokeWidth="1" />
      <path fill="#EA4335" d="M12 7a5 5 0 0 1 4.9 4H12V7z" />
      <path fill="#FBBC04" d="M12 17V12h4.9A5 5 0 0 1 12 17z" />
      <path fill="#34A853" d="M7.1 11H12V7a5 5 0 0 0-4.9 4z" />
      <path fill="#4285F4" d="M12 12v5a5 5 0 0 0 4.9-6H12z" />
    </svg>
  );
}

function IconAndroid({ className = 'h-8 w-8' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#3DDC84"
        d="M17.6 9.48l1.84-3.18c.16-.31.04-.69-.26-.85-.29-.15-.65-.06-.83.22l-1.88 3.24a11.43 11.43 0 0 0-8.94 0L5.65 5.67c-.19-.28-.54-.37-.83-.22-.3.16-.42.54-.26.85l1.84 3.18C3.25 11.67 1.5 14.42 1.5 17.5h21c0-3.08-1.75-5.83-4.4-7.02zM7 15.25c-.69 0-1.25-.56-1.25-1.25s.56-1.25 1.25-1.25S8.25 13.31 8.25 14 7.69 15.25 7 15.25zm10 0c-.69 0-1.25-.56-1.25-1.25s.56-1.25 1.25-1.25 1.25.56 1.25 1.25-.56 1.25-1.25 1.25z"
      />
    </svg>
  );
}

const TAB_CONFIG = [
  { id: 'windows', label: 'Windows', hint: 'PowerShell agent', Icon: IconWindows },
  { id: 'mac', label: 'Mac', hint: '.pkg agent', Icon: IconApple },
  { id: 'chromebook', label: 'Chromebook', hint: 'Extension', Icon: IconChrome },
  { id: 'android', label: 'Android', hint: 'APK / Play', Icon: IconAndroid },
  { id: 'ios', label: 'iOS / iPad', hint: 'App Store / MDM', Icon: IconApple },
];

function CopyInline({ text, label = 'Copy' }) {
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(text).catch(() => {});
      }}
      className="shrink-0 rounded-lg border border-fds-border bg-white px-2 py-1 text-xs font-medium text-slate-700 shadow-sm hover:border-brand hover:text-brand"
    >
      {label}
    </button>
  );
}

function groupSelectOptions(tree) {
  const out = [];
  function walk(nodes, depth) {
    if (!Array.isArray(nodes)) return;
    for (const n of nodes) {
      if (!n || typeof n.id !== 'string' || !n.id) continue;
      const name = typeof n.name === 'string' ? n.name : 'Group';
      const prefix = '─'.repeat(2) + '──'.repeat(depth);
      out.push({ id: n.id, label: `${prefix} ${name}` });
      if (n.children?.length) walk(n.children, depth + 1);
    }
  }
  walk(tree, 0);
  return out;
}

function CodeBlock({ value, copyLabel = 'Copy' }) {
  return (
    <div className="relative mt-2 rounded-lg border border-slate-700 bg-slate-900">
      <pre className="max-h-64 overflow-auto p-3 pr-20 text-xs whitespace-pre-wrap break-all text-slate-100">{value}</pre>
      <div className="absolute right-2 top-2">
        <CopyInline text={value} label={copyLabel} />
      </div>
    </div>
  );
}

function NumberedSteps({ items }) {
  return (
    <ol className="mt-4 space-y-4">
      {items.map((text, i) => (
        <li key={i} className="flex gap-4">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand text-sm font-bold text-white shadow-sm">
            {i + 1}
          </span>
          <p className="pt-1 text-sm leading-relaxed text-slate-700">{text}</p>
        </li>
      ))}
    </ol>
  );
}

export default function Install() {
  const [tab, setTab] = useState('windows');
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [groupTree, setGroupTree] = useState([]);
  const [installerSize, setInstallerSize] = useState('');
  const [apkSize, setApkSize] = useState('');

  const load = useCallback(async () => {
    try {
      const gq = selectedGroupId ? `?groupId=${encodeURIComponent(selectedGroupId)}` : '';
      const d = await api(`/api/orgs/me/enrollment${gq}`);
      setData(d);
      setLoadError(null);
    } catch (e) {
      setLoadError(e.message || 'Could not load enrollment data.');
      setData(null);
    }
  }, [selectedGroupId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await api('/api/groups');
        if (cancelled) return;
        const tree = r?.groups;
        setGroupTree(Array.isArray(tree) ? tree : []);
      } catch {
        if (!cancelled) setGroupTree([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  const groupOptions = useMemo(() => groupSelectOptions(groupTree), [groupTree]);

  useEffect(() => {
    if (groupOptions.length === 0 && selectedGroupId) {
      setSelectedGroupId('');
    }
  }, [groupOptions.length, selectedGroupId]);

  const enrolled = data?.deviceCount ?? 0;
  const links = data?.links || {};
  const chromeManagedConfig = useMemo(() => {
    const t = data?.token;
    if (!t) return '';
    return JSON.stringify(
      {
        orgToken: t,
        groupId: selectedGroupId || '',
        autoEnroll: true,
      },
      null,
      2,
    );
  }, [data?.token, selectedGroupId]);

  const windowsInstallerUrl = useMemo(() => {
    const t = data?.token;
    if (!t) return '';
    const p = new URLSearchParams();
    p.set('org', t);
    if (selectedGroupId) p.set('group', selectedGroupId);
    return `/api/agent/installer?${p.toString()}`;
  }, [data?.token, selectedGroupId]);

  useEffect(() => {
    if (!windowsInstallerUrl) {
      setInstallerSize('');
      return;
    }
    let cancelled = false;
    fetch(windowsInstallerUrl, { method: 'HEAD', credentials: 'include' })
      .then((r) => {
        const cl = r.headers.get('Content-Length');
        if (cl && !cancelled) {
          const b = formatBytes(Number(cl));
          setInstallerSize(b ? ` · ${b}` : '');
        }
      })
      .catch(() => {
        if (!cancelled) setInstallerSize('');
      });
    return () => {
      cancelled = true;
    };
  }, [windowsInstallerUrl]);

  const apkLink = data?.links?.apk;
  useEffect(() => {
    if (!apkLink || typeof apkLink !== 'string') {
      setApkSize('');
      return;
    }
    let cancelled = false;
    fetch(apkLink, { method: 'HEAD', credentials: 'include' })
      .then((r) => {
        const cl = r.headers.get('Content-Length');
        if (cl && !cancelled) {
          const b = formatBytes(Number(cl));
          setApkSize(b ? ` · ${b}` : '');
        }
      })
      .catch(() => {
        if (!cancelled) setApkSize('');
      });
    return () => {
      cancelled = true;
    };
  }, [apkLink]);

  const macCmd = links.macPkg
    ? `curl -fSL '${links.macPkg}' -o /tmp/fortdefend.pkg && sudo installer -pkg /tmp/fortdefend.pkg -target /`
    : '';

  const qrUrl = (url) =>
    `https://api.qrserver.com/v1/create-qr-code/?size=200x200&color=185FA5&data=${encodeURIComponent(url || '')}`;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <SectionHeader
          className="mb-0 max-w-xl"
          title="Enroll devices"
          description="Pick a platform, follow the numbered steps, and download the package. Links embed your org enrollment token."
        />
        <div className="rounded-xl border border-fds-border bg-white px-5 py-4 text-center shadow-sm ring-1 ring-slate-950/5 sm:text-right">
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Devices enrolled</p>
          <p className="text-3xl font-bold text-brand">{enrolled}</p>
        </div>
      </div>

      {loadError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{loadError}</div>
      )}

      <Card>
        <label htmlFor="enroll-group" className="text-sm font-semibold text-slate-900">
          Enroll into group
        </label>
        <select
          id="enroll-group"
          value={selectedGroupId}
          onChange={(e) => setSelectedGroupId(e.target.value)}
          className="mt-2 block w-full max-w-md rounded-lg border border-fds-border bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
        >
          <option value="">── No group (General)</option>
          {groupOptions.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
        <p className="mt-2 text-xs text-slate-500">
          You can also move devices between groups from Devices or Groups after they appear.
        </p>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {TAB_CONFIG.map((t) => {
          const active = tab === t.id;
          const Icon = t.Icon;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`flex flex-col items-center gap-2 rounded-xl border px-4 py-4 text-center transition ${
                active
                  ? 'border-brand bg-white shadow-md ring-2 ring-brand/20'
                  : 'border-fds-border bg-white shadow-sm ring-1 ring-slate-950/5 hover:border-slate-300'
              }`}
            >
              <span className={active ? 'text-brand' : 'text-slate-600'}>
                <Icon className="h-9 w-9" />
              </span>
              <span className={`text-sm font-semibold ${active ? 'text-slate-900' : 'text-slate-700'}`}>{t.label}</span>
              <span className="text-[11px] text-slate-500">{t.hint}</span>
            </button>
          );
        })}
      </div>

      {tab === 'windows' && (
        <Card>
          <h2 className="text-lg font-semibold text-slate-900">Windows agent</h2>
          <p className="mt-1 text-sm text-slate-600">
            Configuration under <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">C:\ProgramData\FortDefend</code>{' '}
            and a startup scheduled task. Administrator approval is required when the script runs.
          </p>
          <NumberedSteps
            items={[
              'Download the PowerShell installer using the button below (same-origin; your session is respected).',
              'Right-click the file and choose Run with PowerShell as Administrator.',
              'Wait for the success message, then confirm the device appears on the Devices page within a few minutes.',
            ]}
          />
          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:items-center">
            <a
              href={windowsInstallerUrl || '#'}
              className={!windowsInstallerUrl ? `${btnPrimary} pointer-events-none opacity-50` : btnPrimary}
              download
            >
              Download installer (.ps1){installerSize}
            </a>
          </div>
          {!windowsInstallerUrl && (
            <p className="mt-3 text-sm text-slate-500">Load enrollment data above to generate the installer link.</p>
          )}
          <p className="mt-4 text-sm text-slate-700">
            <span className="font-medium text-slate-900">Requirements:</span> Windows 10/11, Windows Server 2016+.
          </p>
        </Card>
      )}

      {tab === 'chromebook' && (
        <div className="space-y-6">
          <Card>
            <h2 className="text-lg font-semibold text-slate-900">Google Admin (recommended)</h2>
            <p className="mt-1 text-sm text-slate-600">
              Deploy the FortDefend extension fleet-wide with managed configuration so devices auto-enroll.
            </p>
            <p className="mt-3 text-sm text-slate-800">
              <span className="font-medium">Extension ID:</span>{' '}
              <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">{FORTDEFEND_EXTENSION_ID}</code>
              <CopyInline text={FORTDEFEND_EXTENSION_ID} label="Copy ID" />
            </p>
            <NumberedSteps
              items={[
                'In Google Admin go to Devices → Chrome → Apps & extensions → Users & browsers and pick the target OU.',
                'Add the app from the Chrome Web Store or by extension ID, then set Installation policy to Force install.',
                'Open Managed configuration for the extension and paste the JSON below (includes org token and optional group).',
                'Save policy; allow a short sync window — new sessions and restarts pick up the extension without manual tokens.',
              ]}
            />
            <h3 className="mt-6 text-sm font-semibold text-slate-900">Managed configuration JSON</h3>
            {chromeManagedConfig ? (
              <CodeBlock value={chromeManagedConfig} copyLabel="Copy managed JSON" />
            ) : (
              <p className="mt-2 text-sm text-amber-800">Load enrollment data above to generate the JSON.</p>
            )}
            <p className="mt-3 text-sm text-slate-700">
              <a className="font-semibold text-brand hover:underline" href="/api/enrollment/managed-schema" target="_blank" rel="noreferrer" download>
                Download managed_schema.json
              </a>
              <span className="text-slate-500"> — reference for policy hosts.</span>
            </p>
            {links.extensionCrx && (
              <p className="mt-4 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span className="font-medium text-slate-700">.crx for testing:</span>
                <span className="break-all">{links.extensionCrx}</span>
                <CopyInline text={links.extensionCrx} />
              </p>
            )}
          </Card>

          <Card>
            <h2 className="text-lg font-semibold text-slate-900">Individual install</h2>
            <p className="mt-1 text-sm text-slate-600">Quick test on a single Chromebook using the Web Store and org token.</p>
            <NumberedSteps
              items={[
                'Install FortDefend from the Chrome Web Store (or load unpacked for development).',
                'Open the extension options and paste your organisation token when prompted.',
                'Submit — the extension validates via /api/enrollment/verify-token and registers the device.',
              ]}
            />
            <div className="mt-4 flex flex-wrap gap-3">
              <a href={data?.chromeWebStoreUrl || CHROME_WEB_STORE_URL} target="_blank" rel="noreferrer" className={btnPrimary}>
                Chrome Web Store
              </a>
              {links.extensionCrx && (
                <a href={links.extensionCrx} className={btnOutline} target="_blank" rel="noreferrer">
                  Download .crx
                </a>
              )}
            </div>
            <p className="mt-4 text-sm text-slate-800">
              <span className="font-medium">Org token:</span>{' '}
              {data?.token ? (
                <>
                  <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs break-all">{data.token}</code>
                  <CopyInline text={data.token} label="Copy token" />
                </>
              ) : (
                <span className="text-slate-500">—</span>
              )}
            </p>
          </Card>
        </div>
      )}

      {tab === 'android' && (
        <Card>
          <h2 className="text-lg font-semibold text-slate-900">Android</h2>
          <p className="mt-1 text-sm text-slate-600">Android 8.0+. Enable push notifications for fastest command delivery (FCM).</p>
          <NumberedSteps
            items={[
              'Download the APK or open the Play listing on the device you want to enroll.',
              'Complete onboarding and grant notification permission when prompted.',
              'Scan the QR code below to jump straight to the enrollment link on another device.',
            ]}
          />
          <div className="mt-4 flex flex-wrap gap-3">
            <a href={links.apk || '#'} className={!links.apk ? `${btnPrimary} pointer-events-none opacity-50` : btnPrimary}>
              Download Android app (.apk){apkSize}
            </a>
            <a
              href={data?.googlePlayUrl || '#'}
              target="_blank"
              rel="noreferrer"
              className={!data?.googlePlayUrl ? `${btnOutline} pointer-events-none opacity-50` : btnOutline}
            >
              Google Play
            </a>
          </div>
          {links.android && (
            <div className="mt-8 flex flex-col items-center sm:flex-row sm:items-start sm:gap-10">
              <div className="rounded-xl border border-fds-border bg-white p-4 shadow-sm ring-1 ring-slate-950/5">
                <img src={qrUrl(links.android)} alt="QR code for Android enrollment" className="h-44 w-44" width={176} height={176} />
              </div>
              <div className="mt-4 max-w-md sm:mt-0">
                <p className="text-sm font-semibold text-slate-900">Scan with your phone</p>
                <p className="mt-1 break-all text-xs text-slate-600">{links.android}</p>
                <div className="mt-2">
                  <CopyInline text={links.android} label="Copy link" />
                </div>
              </div>
            </div>
          )}
        </Card>
      )}

      {tab === 'ios' && (
        <Card>
          <h2 className="text-lg font-semibold text-slate-900">iOS & iPadOS</h2>
          <p className="mt-1 text-sm text-slate-600">iOS 14+. Managed via Google Workspace, Intune, or other MDM.</p>
          <NumberedSteps
            items={[
              'Open the App Store listing on the device (or push the app via MDM).',
              'Complete in-app enrollment with your org token or MDM-managed profile.',
              'Use the QR code to open the enrollment URL on a supervised device without typing.',
            ]}
          />
          <div className="mt-4">
            <a
              href={data?.appStoreUrl || '#'}
              target="_blank"
              rel="noreferrer"
              className={!data?.appStoreUrl ? `${btnPrimary} pointer-events-none opacity-50` : btnPrimary}
            >
              App Store
            </a>
          </div>
          {links.ios && (
            <div className="mt-8 flex flex-col items-center sm:flex-row sm:items-start sm:gap-10">
              <div className="rounded-xl border border-fds-border bg-white p-4 shadow-sm ring-1 ring-slate-950/5">
                <img src={qrUrl(links.ios)} alt="QR code for iOS enrollment" className="h-44 w-44" width={176} height={176} />
              </div>
              <div className="mt-4 max-w-md sm:mt-0">
                <p className="text-sm font-semibold text-slate-900">Scan to open enrollment</p>
                <p className="mt-1 break-all text-xs text-slate-600">{links.ios}</p>
                <div className="mt-2">
                  <CopyInline text={links.ios} label="Copy link" />
                </div>
              </div>
            </div>
          )}
          <p className="mt-6 rounded-lg border border-blue-100 bg-blue-50/90 p-4 text-sm text-slate-800">
            <span className="font-semibold text-brand">Note:</span> iPads managed only through Google Workspace may appear
            automatically once the Google Admin integration is connected — no local app required.
          </p>
        </Card>
      )}

      {tab === 'mac' && (
        <Card>
          <h2 className="text-lg font-semibold text-slate-900">Mac agent</h2>
          <p className="mt-1 text-sm text-slate-600">Installomator-based agent for inventory and app updates.</p>
          <NumberedSteps
            items={[
              'Download the signed .pkg using the button below.',
              'Open the installer and follow prompts — administrator rights are required.',
              'Alternatively, run the Terminal one-liner in the advanced block if remote deployment is easier.',
            ]}
          />
          <div className="mt-4">
            <a href={links.macPkg || '#'} className={!links.macPkg ? `${btnPrimary} pointer-events-none opacity-50` : btnPrimary}>
              Download Mac agent (.pkg)
            </a>
          </div>
          {links.macPkg && (
            <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span className="font-medium text-slate-700">URL:</span>
              <span className="break-all">{links.macPkg}</span>
              <CopyInline text={links.macPkg} />
            </p>
          )}
          <p className="mt-4 text-sm text-slate-700">
            <span className="font-medium text-slate-900">Requirements:</span> macOS 12 Monterey or later.
          </p>
          {macCmd && (
            <div className="mt-6">
              <h3 className="text-sm font-semibold text-slate-900">Terminal (fallback)</h3>
              <p className="mt-1 text-xs text-slate-600">You will be prompted for an administrator password.</p>
              <CodeBlock value={macCmd} />
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
