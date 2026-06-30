import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { Card } from '../components/ui';
import { SectionHeader } from '../components/fds';

const POLL_MS = 60_000;

const btnPrimary =
  'inline-flex min-h-[52px] items-center justify-center rounded-xl bg-brand px-6 py-3 text-base font-semibold text-white shadow-md transition hover:bg-brand-dark focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2 disabled:pointer-events-none disabled:opacity-50';

function formatBytes(n) {
  if (!Number.isFinite(n) || n < 0) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let unitIndex = 0;
  let value = n;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const rounded = unitIndex === 0 ? Math.round(value) : value < 10 ? value.toFixed(1) : Math.round(value);
  return `${rounded} ${units[unitIndex]}`;
}

function groupSelectOptions(tree) {
  const out = [];
  function walk(nodes, depth) {
    if (!Array.isArray(nodes)) return;
    for (const node of nodes) {
      if (!node || typeof node.id !== 'string' || !node.id) continue;
      const name = typeof node.name === 'string' ? node.name : 'Group';
      const prefix = '─'.repeat(2) + '──'.repeat(depth);
      out.push({ id: node.id, label: `${prefix} ${name}` });
      if (node.children?.length) walk(node.children, depth + 1);
    }
  }
  walk(tree, 0);
  return out;
}

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

function CodeBlock({ value, copyLabel = 'Copy' }) {
  return (
    <div className="relative mt-2 rounded-lg border border-slate-700 bg-slate-900">
      <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all p-3 pr-20 text-xs text-slate-100">{value}</pre>
      <div className="absolute right-2 top-2">
        <CopyInline text={value} label={copyLabel} />
      </div>
    </div>
  );
}

function NumberedSteps({ items }) {
  return (
    <ol className="mt-4 space-y-4">
      {items.map((text, index) => (
        <li key={text} className="flex gap-4">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand text-sm font-bold text-white shadow-sm">
            {index + 1}
          </span>
          <p className="pt-1 text-sm leading-relaxed text-slate-700">{text}</p>
        </li>
      ))}
    </ol>
  );
}

export default function Install() {
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [groupTree, setGroupTree] = useState([]);
  const [installerSize, setInstallerSize] = useState('');

  const load = useCallback(async () => {
    try {
      const groupQuery = selectedGroupId ? `?groupId=${encodeURIComponent(selectedGroupId)}` : '';
      const response = await api(`/api/orgs/me/enrollment${groupQuery}`);
      setData(response);
      setLoadError(null);
    } catch (err) {
      setLoadError(err.message || 'Could not load enrollment data.');
      setData(null);
    }
  }, [selectedGroupId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await api('/api/groups');
        if (cancelled) return;
        setGroupTree(Array.isArray(response?.groups) ? response.groups : []);
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
    const timer = setInterval(load, POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  const groupOptions = useMemo(() => groupSelectOptions(groupTree), [groupTree]);

  useEffect(() => {
    if (groupOptions.length === 0 && selectedGroupId) {
      setSelectedGroupId('');
    }
  }, [groupOptions.length, selectedGroupId]);

  const enrolled = data?.deviceCount ?? 0;

  const windowsInstallerUrl = useMemo(() => {
    const token = data?.token;
    if (!token) return '';
    const params = new URLSearchParams();
    params.set('org', token);
    if (selectedGroupId) params.set('group', selectedGroupId);
    return `/api/agent/installer?${params.toString()}`;
  }, [data?.token, selectedGroupId]);

  const windowsPsCommand = useMemo(() => {
    if (data?.psCommand) return data.psCommand;
    if (!windowsInstallerUrl) return '';
    const absoluteUrl = windowsInstallerUrl.startsWith('http')
      ? windowsInstallerUrl
      : `${window.location.origin}${windowsInstallerUrl}`;
    return `iex (irm '${absoluteUrl}')`;
  }, [data?.psCommand, windowsInstallerUrl]);

  useEffect(() => {
    if (!windowsInstallerUrl) {
      setInstallerSize('');
      return undefined;
    }
    let cancelled = false;
    fetch(windowsInstallerUrl, { method: 'HEAD', credentials: 'include' })
      .then((response) => {
        const contentLength = response.headers.get('Content-Length');
        if (contentLength && !cancelled) {
          const bytes = formatBytes(Number(contentLength));
          setInstallerSize(bytes ? ` · ${bytes}` : '');
        }
      })
      .catch(() => {
        if (!cancelled) setInstallerSize('');
      });
    return () => {
      cancelled = true;
    };
  }, [windowsInstallerUrl]);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <SectionHeader
          className="mb-0 max-w-xl"
          title="Enroll Windows PCs"
          description="Install one FortDefend agent for patching, monitoring, scripting, reboot coordination, and future AI-assisted device actions."
        />
        <div className="rounded-xl border border-fds-border bg-white px-5 py-4 text-center shadow-sm ring-1 ring-slate-950/5 sm:text-right">
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">PCs enrolled</p>
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
          onChange={(event) => setSelectedGroupId(event.target.value)}
          className="mt-2 block w-full max-w-md rounded-lg border border-fds-border bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
        >
          <option value="">── No group (General)</option>
          {groupOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
        <p className="mt-2 text-xs text-slate-500">
          You can move PCs between groups later from Devices or Groups.
        </p>
      </Card>

      <Card>
        <h2 className="text-lg font-semibold text-slate-900">Install the combined Windows agent</h2>
        <p className="mt-1 text-sm text-slate-600">
          The installer writes configuration under{' '}
          <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">C:\ProgramData\FortDefend</code>, downloads the
          patch catalog, and registers a single SYSTEM scheduled task named{' '}
          <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">FortDefend Agent</code>.
        </p>

        <NumberedSteps
          items={[
            'Download the PowerShell installer or copy the one-line command below.',
            'Run it in an elevated PowerShell window on the Windows PC.',
            'Wait for the success message, then confirm the PC appears online within a few minutes.',
          ]}
        />

        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:items-center">
          <a
            href={windowsInstallerUrl || '#'}
            className={!windowsInstallerUrl ? `${btnPrimary} pointer-events-none opacity-50` : btnPrimary}
            download
          >
            Download Windows installer (.ps1){installerSize}
          </a>
        </div>

        {windowsPsCommand && (
          <div className="mt-5">
            <h3 className="text-sm font-semibold text-slate-900">PowerShell one-liner</h3>
            <p className="mt-1 text-xs text-slate-600">
              Run as Administrator. This installs monitoring, scripting, patching, and reboot coordination in one agent.
            </p>
            <CodeBlock value={windowsPsCommand} copyLabel="Copy PowerShell" />
          </div>
        )}

        {!windowsInstallerUrl && (
          <p className="mt-3 text-sm text-slate-500">Load enrollment data above to generate the installer link.</p>
        )}

        <div className="mt-5 rounded-xl border border-blue-200 bg-blue-50/60 p-4 text-sm text-slate-700">
          <p className="font-semibold text-slate-900">Requirements</p>
          <p className="mt-1">Windows 10/11 or Windows Server 2016+, local administrator rights, and outbound HTTPS to this FortDefend server.</p>
        </div>
      </Card>
    </div>
  );
}
