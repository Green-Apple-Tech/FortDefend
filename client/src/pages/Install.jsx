import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { Card } from '../components/ui';

const POLL_MS = 60_000;

const btnPrimary =
  'inline-flex items-center justify-center rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#144a85] focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50';
const btnOutline =
  'inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-800 shadow-sm transition hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50';
const TABS = [
  { id: 'windows', label: 'Windows' },
  { id: 'chromebook', label: 'Chromebook' },
  { id: 'android', label: 'Android' },
  { id: 'ios', label: 'iOS / iPad' },
  { id: 'mac', label: 'Mac' },
];

function CopyInline({ text, label = 'Copy' }) {
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(text).catch(() => {});
      }}
      className="shrink-0 rounded border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 hover:border-brand hover:text-brand"
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
    <div className="relative mt-2 rounded-lg border border-gray-200 bg-gray-900/95">
      <pre className="max-h-64 overflow-auto p-3 pr-20 text-xs text-gray-100 whitespace-pre-wrap break-all">{value}</pre>
      <div className="absolute right-2 top-2">
        <CopyInline text={value} label={copyLabel} />
      </div>
    </div>
  );
}

function copyToClipboard(text, onDone) {
  if (!text) return;
  navigator.clipboard.writeText(text).then(onDone).catch(() => {});
}

export default function Install() {
  const [tab, setTab] = useState('windows');
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [groupTree, setGroupTree] = useState([]);
  const [psCopied, setPsCopied] = useState(false);

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
  const extensionId = data?.extensionId || 'jpchjpcgcldplgfdjclgfljegdopkphc';

  // GET /api/orgs/me/enrollment: { token, installUrl, psCommand } with psCommand = iex (irm '.../api/agent/install.ps1?org=...')
  const psOneliner = data?.psCommand
    ? data.psCommand
    : data?.installUrl
      ? `iex (irm '${data.installUrl}')`
      : links.installScript
        ? `Invoke-WebRequest -Uri '${links.installScript}' -OutFile ($env:TEMP + '\\\\fortdefend-install.ps1') -UseBasicParsing; Start-Process powershell -Verb RunAs -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File',($env:TEMP + '\\\\fortdefend-install.ps1')`
        : '';

  const macCmd = links.macPkg
    ? `curl -fSL '${links.macPkg}' -o /tmp/fortdefend.pkg && sudo installer -pkg /tmp/fortdefend.pkg -target /`
    : '';

  const qrUrl = (url) =>
    `https://api.qrserver.com/v1/create-qr-code/?size=200x200&color=185FA5&data=${encodeURIComponent(url || '')}`;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Enroll devices</h1>
          <p className="mt-1 text-sm text-gray-600">
            Download agents, apps, and extension packages for every platform. Links include your organization enrollment token.
          </p>
        </div>
        <div className="rounded-xl border border-brand/30 bg-brand-light px-4 py-3 text-center sm:text-right">
          <p className="text-xs font-medium uppercase tracking-wide text-brand">Devices enrolled</p>
          <p className="text-3xl font-bold text-brand">{enrolled}</p>
        </div>
      </div>

      {loadError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {loadError}
        </div>
      )}

      <div className="rounded-xl border border-gray-200 bg-white px-4 py-4 shadow-sm">
        <label htmlFor="enroll-group" className="text-sm font-semibold text-gray-900">
          Enroll into group
        </label>
        <select
          id="enroll-group"
          value={selectedGroupId}
          onChange={(e) => setSelectedGroupId(e.target.value)}
          className="mt-2 block w-full max-w-md rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
        >
          <option value="">── No group (General)</option>
          {groupOptions.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
        <p className="mt-2 text-xs text-gray-500">
          You can also drag devices into groups from the Devices or Groups page after enrollment
        </p>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-gray-200">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-t-lg px-4 py-2.5 text-sm font-semibold transition ${
              tab === t.id
                ? 'border border-b-0 border-gray-200 bg-white text-brand'
                : 'border border-transparent text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'windows' && (
        <Card>
          <h2 className="text-lg font-semibold text-gray-900">Windows agent</h2>
          <p className="mt-1 text-sm text-gray-600">
            Run the command below in PowerShell on the target PC. You will be prompted to allow an elevated (Administrator)
            window so the install can complete.
          </p>
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50/90 px-3 py-2.5 text-sm text-amber-950">
            Windows agent installer coming soon. Use the PowerShell command below to enroll now.
          </p>
          <h3 className="mt-6 text-sm font-semibold text-gray-900">PowerShell (copy and run as Administrator)</h3>
          <p className="mt-1 text-xs text-gray-600">
            One line: <code className="rounded bg-gray-100 px-1">iex (irm &apos;…&apos;)</code> fetches the script and runs it. The URL is in
            single quotes so <code className="rounded bg-gray-100 px-1">&amp;</code> in query strings is not a problem. Installs Node if needed, drops
            the agent under <code className="rounded bg-gray-100 px-1">C:\ProgramData\FortDefend</code>, and schedules it every 15 minutes.
          </p>
          <div className="mt-3">
            <button
              type="button"
              disabled={!psOneliner}
              onClick={() => {
                copyToClipboard(psOneliner, () => {
                  setPsCopied(true);
                  window.setTimeout(() => setPsCopied(false), 2500);
                });
              }}
              className="w-full rounded-lg bg-brand px-4 py-3.5 text-base font-semibold text-white shadow-md transition hover:bg-[#144a85] focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 sm:max-w-md"
            >
              {psCopied ? 'Copied' : 'Copy command'}
            </button>
          </div>
          {psOneliner && (
            <div className="mt-4 rounded-xl border-2 border-gray-800 bg-[#0d1117] shadow-inner">
              <pre className="max-h-80 min-h-[8rem] overflow-auto p-4 pl-4 pr-4 text-left font-mono text-sm leading-relaxed text-gray-100 [word-break:break-word] sm:text-base">
                {psOneliner}
              </pre>
            </div>
          )}
          {!psOneliner && (
            <p className="mt-4 text-sm text-gray-500">Loading enrollment command…</p>
          )}
          <p className="mt-4 text-sm text-gray-700">
            <span className="font-medium text-gray-900">System requirements:</span> Windows 10/11, Windows Server 2016+
          </p>
        </Card>
      )}

      {tab === 'chromebook' && (
        <Card>
          <h2 className="text-lg font-semibold text-gray-900">Chrome extension</h2>
          <p className="mt-1 text-sm text-gray-600">
            Or deploy via Google Admin Console to all devices at once.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <a
              href={data?.chromeWebStoreUrl || '#'}
              target="_blank"
              rel="noreferrer"
              className={!data?.chromeWebStoreUrl ? `${btnPrimary} pointer-events-none opacity-50` : btnPrimary}
            >
              Install Chrome Extension
            </a>
            <a
              href={links.extensionCrx || '#'}
              className={!links.extensionCrx ? `${btnOutline} pointer-events-none opacity-50` : btnOutline}
            >
              Download Extension (.crx)
            </a>
          </div>
          <p className="mt-3 text-sm text-gray-700">
            <span className="font-medium">Extension ID (placeholder):</span>{' '}
            <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-800">{extensionId}</code>
            <CopyInline text={extensionId} label="Copy ID" />
          </p>
          {data?.googleAdminPolicyJson && (
            <>
              <h3 className="mt-6 text-sm font-semibold text-gray-900">Google Admin Console — force-install policy (JSON)</h3>
              <p className="mt-1 text-xs text-gray-600">Apply under Apps → Google Workspace → Additional Google services → Chrome Management.</p>
              <CodeBlock value={data.googleAdminPolicyJson} copyLabel="Copy JSON" />
            </>
          )}
          {links.extensionCrx && (
            <p className="mt-3 flex flex-wrap items-center gap-2 text-xs text-gray-500">
              <span className="font-medium text-gray-700">.crx URL:</span>
              <span className="break-all">{links.extensionCrx}</span>
              <CopyInline text={links.extensionCrx} />
            </p>
          )}
        </Card>
      )}

      {tab === 'android' && (
        <Card>
          <h2 className="text-lg font-semibold text-gray-900">Android</h2>
          <p className="mt-1 text-sm text-gray-600">Install on Android 8.0 and above.</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <a href={links.apk || '#'} className={!links.apk ? `${btnPrimary} pointer-events-none opacity-50` : btnPrimary}>
              Download Android App (.apk)
            </a>
            <a
              href={data?.googlePlayUrl || '#'}
              target="_blank"
              rel="noreferrer"
              className={!data?.googlePlayUrl ? `${btnOutline} pointer-events-none opacity-50` : btnOutline}
            >
              Get on Google Play
            </a>
          </div>
          {links.android && (
            <div className="mt-6 flex flex-col items-center sm:flex-row sm:items-start sm:gap-8">
              <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                <img
                  src={qrUrl(links.android)}
                  alt="QR code for Android enrollment"
                  className="h-44 w-44"
                  width={176}
                  height={176}
                />
              </div>
              <div className="mt-4 max-w-md sm:mt-0">
                <p className="text-sm font-medium text-gray-900">Scan with your phone</p>
                <p className="mt-1 break-all text-xs text-gray-600">{links.android}</p>
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
          <h2 className="text-lg font-semibold text-gray-900">iOS & iPadOS</h2>
          <p className="mt-1 text-sm text-gray-600">
            Requires iOS 14 or later. Managed via Google Workspace or Intune MDM.
          </p>
          <div className="mt-4">
            <a
              href={data?.appStoreUrl || '#'}
              target="_blank"
              rel="noreferrer"
              className={!data?.appStoreUrl ? `${btnPrimary} pointer-events-none opacity-50` : btnPrimary}
            >
              Get on App Store
            </a>
          </div>
          {links.ios && (
            <div className="mt-6 flex flex-col items-center sm:flex-row sm:items-start sm:gap-8">
              <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                <img
                  src={qrUrl(links.ios)}
                  alt="QR code for iOS enrollment"
                  className="h-44 w-44"
                  width={176}
                  height={176}
                />
              </div>
              <div className="mt-4 max-w-md sm:mt-0">
                <p className="text-sm font-medium text-gray-900">Scan to open enrollment</p>
                <p className="mt-1 break-all text-xs text-gray-600">{links.ios}</p>
                <div className="mt-2">
                  <CopyInline text={links.ios} label="Copy link" />
                </div>
              </div>
            </div>
          )}
          <p className="mt-6 rounded-lg border border-blue-100 bg-blue-50/80 p-4 text-sm text-gray-800">
            <span className="font-semibold text-brand">Note:</span> For managed iPads via Google Workspace, no app install is
            needed — devices appear automatically once the Google Admin integration is connected.
          </p>
        </Card>
      )}

      {tab === 'mac' && (
        <Card>
          <h2 className="text-lg font-semibold text-gray-900">Mac agent</h2>
          <p className="mt-1 text-sm text-gray-600">
            Installs Installomator-based agent for automatic app updates.
          </p>
          <div className="mt-4">
            <a href={links.macPkg || '#'} className={!links.macPkg ? `${btnPrimary} pointer-events-none opacity-50` : btnPrimary}>
              Download Mac Agent (.pkg)
            </a>
          </div>
          {links.macPkg && (
            <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-500">
              <span className="font-medium text-gray-700">URL:</span>
              <span className="break-all">{links.macPkg}</span>
              <CopyInline text={links.macPkg} />
            </p>
          )}
          <ul className="mt-4 space-y-1 text-sm text-gray-700">
            <li>
              <span className="font-medium text-gray-900">System requirements:</span> macOS 12 Monterey or later
            </li>
          </ul>
          {macCmd && (
            <div className="mt-6">
              <h3 className="text-sm font-semibold text-gray-900">Terminal (fallback)</h3>
              <p className="mt-1 text-xs text-gray-600">Run in Terminal. You will be prompted for an administrator password.</p>
              <CodeBlock value={macCmd} />
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
