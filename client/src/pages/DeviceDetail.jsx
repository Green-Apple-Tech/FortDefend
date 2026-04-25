import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { Button, Card, Input } from '../components/ui';
import ScriptRunnerModal from '../components/ScriptRunnerModal';

const LIVE_POLL_MS = 30_000;

function formatRelativeTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const min = Math.floor((Date.now() - d.getTime()) / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

function formatPct(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  return `${n.toFixed(1)}%`;
}

function statusDotClass(status) {
  if (status === 'online') return 'bg-emerald-500';
  if (status === 'warning') return 'bg-amber-500';
  if (status === 'alert') return 'bg-red-500';
  return 'bg-slate-400';
}

function barTone(value, green = 50, amber = 80) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 'bg-slate-300';
  if (n > amber) return 'bg-red-500';
  if (n >= green) return 'bg-amber-500';
  return 'bg-emerald-500';
}

function usageBar(value, max = 100) {
  const n = Number(value);
  if (!Number.isFinite(n) || max <= 0) return 0;
  return Math.max(0, Math.min(100, (n / max) * 100));
}

function renderOsIcon(os) {
  const low = String(os || '').toLowerCase();
  if (low.includes('chrome')) return '💻';
  return '💻';
}

function sourceLabel(source) {
  if (source === 'agent') return 'Agent';
  if (source === 'intune') return 'Intune';
  if (source === 'google_admin') return 'Google Admin';
  if (source === 'google_mobile') return 'Google Mobile';
  return source || '—';
}

function agentBadge(version, expected) {
  if (!version) return <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">—</span>;
  const ok = String(version) === String(expected || '');
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${ok ? 'bg-emerald-100 text-emerald-900' : 'bg-amber-100 text-amber-900'}`}>
      {version} {ok ? '✓' : '↑'}
    </span>
  );
}

function parseResultOutput(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

export default function DeviceDetail() {
  const { deviceId } = useParams();
  const navigate = useNavigate();
  const [tab, setTab] = useState('overview');
  const [device, setDevice] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [scanResults, setScanResults] = useState([]);
  const [apps, setApps] = useState([]);
  const [scriptHistory, setScriptHistory] = useState([]);
  const [scripts, setScripts] = useState([]);
  const [softwareSearch, setSoftwareSearch] = useState('');
  const [showRunner, setShowRunner] = useState(false);
  const [showOutput, setShowOutput] = useState(null);
  const [commandsOpen, setCommandsOpen] = useState(false);
  const [expectedAgentVersion, setExpectedAgentVersion] = useState('1.0.1');
  const [live, setLive] = useState(null);
  const [quickCommand, setQuickCommand] = useState('');
  const [quickOutput, setQuickOutput] = useState('');
  const [quickPending, setQuickPending] = useState(false);
  const [quickHistory, setQuickHistory] = useState([]);
  const [processSearch, setProcessSearch] = useState('');
  const [processRows, setProcessRows] = useState([]);
  const [serviceSearch, setServiceSearch] = useState('');
  const [serviceRows, setServiceRows] = useState([]);
  const [printerRows, setPrinterRows] = useState([]);
  const [appsFilter, setAppsFilter] = useState('all');

  const loadBase = async () => {
    const [detail, appsRes, histRes] = await Promise.all([
      api(`/api/devices/${encodeURIComponent(deviceId)}`),
      api(`/api/devices/${encodeURIComponent(deviceId)}/apps`).catch(() => ({ applications: [] })),
      api(`/api/devices/${encodeURIComponent(deviceId)}/script-history`).catch(() => ({ history: [] })),
    ]);
    setDevice(detail?.device || null);
    setAlerts(Array.isArray(detail?.alerts) ? detail.alerts : []);
    setScanResults(Array.isArray(detail?.scanResults) ? detail.scanResults : []);
    setApps(Array.isArray(appsRes?.applications) ? appsRes.applications : []);
    setScriptHistory(Array.isArray(histRes?.history) ? histRes.history : []);
  };

  const loadLive = async () => {
    const r = await api(`/api/integrations/devices/${encodeURIComponent(deviceId)}`).catch(() => null);
    if (r?.device) setDevice((prev) => ({ ...(prev || {}), ...r.device }));
    if (r?.live) setLive(r.live);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await loadBase();
      await loadLive();
      const v = await api('/api/agent/version').catch(() => ({ version: '1.0.1' }));
      if (!cancelled) setExpectedAgentVersion(String(v?.version || '1.0.1'));
      const scr = await api('/api/scripts').catch(() => ({ scripts: [] }));
      if (!cancelled) setScripts(Array.isArray(scr?.scripts) ? scr.scripts : []);
    })();
    const t = setInterval(() => {
      if (!cancelled) loadLive();
    }, LIVE_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [deviceId]);

  useEffect(() => {
    if (tab !== 'live_actions') return;
    if (processRows.length === 0) refreshProcesses();
    if (serviceRows.length === 0) refreshServices();
    if (printerRows.length === 0) refreshPrinters();
  }, [tab]);

  const filteredApps = useMemo(() => {
    const q = softwareSearch.trim().toLowerCase();
    if (!q) return apps;
    return apps.filter((a) =>
      `${a.app_name || ''} ${a.installed_version || ''} ${a.publisher || ''}`.toLowerCase().includes(q),
    );
  }, [apps, softwareSearch]);

  const filteredAppsDetailed = useMemo(() => {
    if (appsFilter === 'updates') return filteredApps.filter((a) => a.update_available);
    if (appsFilter === 'recent') {
      const cutoff = Date.now() - 14 * 24 * 60 * 60 * 1000;
      return filteredApps.filter((a) => {
        const ts = a.updated_at || a.created_at || a.last_scanned_at;
        return ts ? new Date(ts).getTime() >= cutoff : false;
      });
    }
    return filteredApps;
  }, [filteredApps, appsFilter]);

  const facts = useMemo(() => {
    if (!device) return [];
    return [
      ['Computer Name', device.name || device.hostname || '—'],
      ['Serial Number', device.serial || '—'],
      ['OS Version', device.os_version || '—'],
      ['OS Build', device.os_build || '—'],
      ['CPU Model', device.cpu_model || '—'],
      ['CPU Cores', device.cpu_cores || '—'],
      ['Total RAM', device.mem_total_gb || device.ram_total_gb ? `${Number(device.mem_total_gb || device.ram_total_gb).toFixed(1)} GB` : '—'],
      ['Disk Total', device.disk_total_gb ? `${Number(device.disk_total_gb).toFixed(1)} GB` : '—'],
      ['Disk Free', device.disk_free_gb ? `${Number(device.disk_free_gb).toFixed(1)} GB` : '—'],
      ['Last Boot Time', device.last_boot_time ? new Date(device.last_boot_time).toLocaleString() : '—'],
      ['Agent Version', device.agent_version || '—'],
      ['Enrollment Date', device.created_at ? new Date(device.created_at).toLocaleString() : '—'],
      ['Source', sourceLabel(device.source)],
      ['User Email', device.user_email || device.logged_in_user || '—'],
      ['Security Score', device.security_score ?? '—'],
      ['Heartbeat Interval', '30 seconds'],
    ];
  }, [device]);

  const exportSoftwareCsv = () => {
    const headers = ['App Name', 'Version', 'Publisher', 'Installed Date', 'Source'];
    const lines = [headers.join(',')];
    for (const a of filteredApps) {
      const row = [
        a.app_name || '',
        a.installed_version || '',
        a.publisher || '',
        a.last_scanned_at || a.updated_at || '',
        a.winget_id ? 'Winget' : 'Get-Package',
      ]
        .map((s) => `"${String(s).replace(/"/g, '""')}"`)
        .join(',');
      lines.push(row);
    }
    const blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `device-software-${deviceId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const runQuickPowerShell = async (scriptName, scriptContent, opts = {}) => {
    if (!scriptContent?.trim()) return null;
    setQuickPending(true);
    if (!opts.silentOutput) setQuickOutput('Waiting for device response... (updates on next heartbeat ~30s)');
    try {
      const run = await api('/api/scripts/quick/run', {
        method: 'POST',
        body: {
          deviceIds: [device.id],
          scriptName,
          scriptType: 'powershell',
          scriptContent,
        },
      });
      const commandId = run?.commands?.[0]?.id;
      if (!commandId) return null;
      let attempts = 0;
      while (attempts < 25) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        const data = await api(
          `/api/devices/${encodeURIComponent(device.id)}/command-results?commandId=${encodeURIComponent(commandId)}&limit=1`,
        ).catch(() => ({ results: [] }));
        const row = Array.isArray(data?.results) ? data.results[0] : null;
        if (row && ['success', 'failed', 'cancelled'].includes(String(row.status || '').toLowerCase())) {
          if (!opts.silentOutput) setQuickOutput(row.output || row.command_input || 'No output.');
          return row;
        }
        attempts += 1;
      }
      if (!opts.silentOutput) setQuickOutput('No response yet. Device may be offline.');
      return null;
    } finally {
      setQuickPending(false);
    }
  };

  const runTerminalCommand = async (value) => {
    const cmd = String(value || '').trim();
    if (!cmd) return;
    setQuickHistory((prev) => [cmd, ...prev.filter((x) => x !== cmd)].slice(0, 10));
    await runQuickPowerShell(`Quick command: ${cmd.slice(0, 40)}`, cmd);
  };

  const refreshProcesses = async () => {
    const script = `Get-Process | Select-Object ProcessName,Id,CPU,WS,Responding | Sort-Object CPU -Descending | Select-Object -First 200 | ConvertTo-Json -Depth 3`;
    const row = await runQuickPowerShell('Refresh Processes', script, { silentOutput: true });
    const parsed = parseResultOutput(row?.output);
    const list = Array.isArray(parsed) ? parsed : parsed ? [parsed] : [];
    setProcessRows(list);
  };

  const refreshServices = async () => {
    const script = `Get-Service | Select-Object Name,DisplayName,Status,StartType | ConvertTo-Json -Depth 3`;
    const row = await runQuickPowerShell('Refresh Services', script, { silentOutput: true });
    const parsed = parseResultOutput(row?.output);
    const list = Array.isArray(parsed) ? parsed : parsed ? [parsed] : [];
    setServiceRows(list);
  };

  const refreshPrinters = async () => {
    const script = `Get-Printer | Select-Object Name,PrinterStatus,Default,PortName,DriverName | ConvertTo-Json -Depth 3`;
    const row = await runQuickPowerShell('Refresh Printers', script, { silentOutput: true });
    const parsed = parseResultOutput(row?.output);
    const list = Array.isArray(parsed) ? parsed : parsed ? [parsed] : [];
    setPrinterRows(list);
  };

  const runDeviceCommand = async (kind) => {
    if (!device) return;
    setCommandsOpen(false);
    if (kind === 'remove') {
      const name = device.name || device.id || 'this device';
      if (!window.confirm(`Are you sure you want to remove ${name}? This will stop monitoring this device.`)) return;
      await api(`/api/devices/${encodeURIComponent(device.id)}`, { method: 'DELETE' });
      navigate('/devices');
      return;
    }
    if (kind === 'restart') {
      await runQuickPowerShell('Restart Device', 'Restart-Computer -Force');
      return;
    }
    if (kind === 'shutdown') {
      await runQuickPowerShell('Shutdown Device', 'Stop-Computer -Force');
      return;
    }
    if (kind === 'lock') {
      await runQuickPowerShell(
        'Lock Screen',
        '$sig = "[DllImport(""user32.dll"")] public static extern bool LockWorkStation();"; Add-Type -MemberDefinition $sig -Name "Win32Lock" -Namespace Win32Functions; [Win32Functions.Win32Lock]::LockWorkStation()',
      );
      return;
    }
    if (kind === 'message') {
      const msg = window.prompt('Message to show to user:');
      if (!msg) return;
      await runQuickPowerShell(
        'Send Message to User',
        `msg * "${String(msg).replace(/"/g, '\\"')}"`,
      );
      return;
    }
    if (kind === 'update_agent') {
      await api('/api/agent/force-update', { method: 'POST', body: { deviceIds: [device.id] } });
      return;
    }
    if (kind === 'run_script') setShowRunner(true);
  };

  const resolveAlert = async (id) => {
    await api(`/api/alerts/${encodeURIComponent(id)}/resolve`, { method: 'POST' }).catch(() => {});
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  };

  const cpu = Number(live?.cpu_usage_pct ?? device?.cpu_usage_pct ?? device?.cpuUsage);
  const memUsed = Number(live?.mem_used_gb ?? device?.mem_used_gb ?? device?.memUsed);
  const memTotal = Number(live?.mem_total_gb ?? device?.mem_total_gb ?? device?.ram_total_gb ?? device?.memTotal);
  const ramPct = Number.isFinite(memUsed) && Number.isFinite(memTotal) && memTotal > 0 ? (memUsed / memTotal) * 100 : null;
  const diskFree = Number(live?.disk_free_gb ?? device?.disk_free_gb);
  const diskTotal = Number(live?.disk_total_gb ?? device?.disk_total_gb);
  const diskPct = Number.isFinite(diskFree) && Number.isFinite(diskTotal) && diskTotal > 0 ? ((diskTotal - diskFree) / diskTotal) * 100 : null;

  if (!device) {
    return <Card>Loading device...</Card>;
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-fds-border bg-white p-4 shadow-sm ring-1 ring-slate-950/5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <button onClick={() => navigate('/devices')} className="text-sm font-semibold text-brand hover:underline">← Devices</button>
            <div className="mt-2 flex items-center gap-3">
              <span className="text-3xl">{renderOsIcon(device.os)}</span>
              <div>
                <h1 className="text-2xl font-bold text-slate-900">{device.name || device.id}</h1>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${device.status === 'online' ? 'bg-emerald-100 text-emerald-900' : 'bg-slate-100 text-slate-700'}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${statusDotClass(device.status)}`} />
                    {device.status === 'online' ? 'Online' : 'Offline'}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-900">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    Live
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${String(device.compliance || '').toLowerCase() === 'pass' ? 'bg-emerald-100 text-emerald-900' : 'bg-red-100 text-red-900'}`}>
                    {String(device.compliance || '').toLowerCase() === 'pass' ? 'Pass' : 'Fail'}
                  </span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">{device.group_name || 'Ungrouped'}</span>
                  {agentBadge(device.agent_version, expectedAgentVersion)}
                </div>
              </div>
            </div>
          </div>

          <div className="w-full max-w-sm space-y-2">
            {[
              ['CPU', cpu, barTone(cpu)],
              ['RAM', ramPct, barTone(ramPct)],
              ['Disk', diskPct, barTone(diskPct)],
            ].map(([label, pct, tone]) => (
              <div key={label}>
                <div className="mb-1 flex items-center justify-between text-xs text-slate-600">
                  <span>{label}</span>
                  <span>{formatPct(pct)}</span>
                </div>
                <div className="h-2 rounded-full bg-slate-200">
                  <div className={`h-2 rounded-full ${tone}`} style={{ width: `${usageBar(pct)}%` }} />
                </div>
                <div className="mt-1 text-right text-[11px] font-medium text-slate-600">
                  {label === 'CPU'
                    ? formatPct(pct)
                    : label === 'RAM'
                      ? (Number.isFinite(memUsed) && Number.isFinite(memTotal) ? `${memUsed.toFixed(1)} / ${memTotal.toFixed(1)} GB` : '—')
                      : (Number.isFinite(diskFree) && Number.isFinite(diskTotal) ? `${diskFree.toFixed(1)} / ${diskTotal.toFixed(1)} GB free` : '—')}
                </div>
              </div>
            ))}
            <div className="mt-2 flex items-center gap-2">
              <div className="relative">
                <Button type="button" variant="outline" onClick={() => setCommandsOpen((o) => !o)}>Device Commands</Button>
                {commandsOpen && (
                  <div className="absolute right-0 z-20 mt-1 w-44 rounded-lg border border-fds-border bg-white p-1 shadow-lg">
                    {[
                      ['Restart Device', 'restart'],
                      ['Shutdown Device', 'shutdown'],
                      ['Run Script', 'run_script'],
                      ['Update Agent', 'update_agent'],
                      ['Lock Screen', 'lock'],
                      ['Send Message to User', 'message'],
                      ['Remove Device', 'remove'],
                    ].map(([label, id]) => (
                      <button key={id} className={`block w-full rounded px-3 py-2 text-left text-sm hover:bg-slate-50 ${id === 'remove' ? 'text-red-600' : 'text-slate-700'}`} onClick={() => runDeviceCommand(id)}>
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <Button type="button" onClick={() => { loadBase(); loadLive(); }}>Refresh Data</Button>
            </div>
          </div>
        </div>
      </div>

      <div className="flex gap-1 overflow-x-auto border-b border-fds-border">
        {['overview', 'software', 'alerts', 'scripts', 'live_actions', 'activity'].map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-semibold ${tab === t ? 'border-brand text-brand' : 'border-transparent text-slate-600 hover:text-slate-900'}`}>
            {t === 'live_actions' ? 'Live Actions' : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900">Device Facts</h2>
              <Input placeholder="Search facts..." value={softwareSearch} onChange={(e) => setSoftwareSearch(e.target.value)} />
            </div>
            <table className="min-w-full text-sm">
              <thead><tr className="text-left text-xs uppercase text-slate-500"><th className="px-2 py-2">Fact Name</th><th className="px-2 py-2">Fact Value</th></tr></thead>
              <tbody>
                {facts
                  .filter(([k, v]) => `${k} ${v}`.toLowerCase().includes(softwareSearch.toLowerCase()))
                  .map(([k, v]) => (
                    <tr key={k} className="border-t border-fds-border">
                      <td className="px-2 py-2 font-medium text-slate-700">{k}</td>
                      <td className="px-2 py-2 text-slate-800">{v || '—'}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </Card>
          <Card>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900">Live Metrics</h2>
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-900">Live data: active</span>
            </div>
            <div className="space-y-3">
              <MetricRow label="Memory" pct={memTotal > 0 ? (memUsed / memTotal) * 100 : null} tone="bg-amber-500" />
              <MetricRow label="CPU" pct={cpu} tone={barTone(cpu)} />
              <MetricRow label="Disk" pct={diskUsedPct} tone="bg-blue-500" />
            </div>
          </Card>
        </div>
      )}

      {tab === 'software' && (
        <Card>
          <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Software</h2>
              <p className="text-xs text-slate-500">{apps.length.toLocaleString()} applications</p>
            </div>
            <div className="flex items-center gap-2">
              <Input placeholder="Search software..." value={softwareSearch} onChange={(e) => setSoftwareSearch(e.target.value)} />
              <Button type="button" variant="outline" onClick={exportSoftwareCsv}>Export CSV</Button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">App Name</th>
                  <th className="px-3 py-2">Version</th>
                  <th className="px-3 py-2">Publisher</th>
                  <th className="px-3 py-2">Installed Date</th>
                  <th className="px-3 py-2">Source</th>
                </tr>
              </thead>
              <tbody>
                {filteredApps.map((a) => (
                  <tr key={`${a.app_name}-${a.winget_id || ''}-${a.installed_version || ''}`} className="border-t border-fds-border">
                    <td className="px-3 py-2">{a.app_name || '—'}</td>
                    <td className="px-3 py-2">{a.installed_version || '—'}</td>
                    <td className="px-3 py-2">{a.publisher || '—'}</td>
                    <td className="px-3 py-2">{a.last_scanned_at ? new Date(a.last_scanned_at).toLocaleString() : '—'}</td>
                    <td className="px-3 py-2">{a.winget_id ? 'Winget' : 'Get-Package'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {tab === 'alerts' && (
        <div className="space-y-3">
          {alerts.length === 0 ? <Card>No active alerts for this device.</Card> : null}
          {alerts.map((a) => (
            <Card key={a.id}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${String(a.severity).toLowerCase() === 'critical' ? 'bg-red-100 text-red-900' : 'bg-amber-100 text-amber-900'}`}>{a.severity || 'warning'}</span>
                    <span className="font-semibold text-slate-900">{a.type || 'Alert'}</span>
                  </div>
                  <p className="mt-2 text-sm text-slate-700">{a.message || '—'}</p>
                  <p className="mt-1 text-xs text-slate-500">{formatRelativeTime(a.created_at)}</p>
                </div>
                <Button type="button" variant="outline" onClick={() => resolveAlert(a.id)}>Resolve</Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {tab === 'scripts' && (
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">Scripts</h2>
            <Button type="button" onClick={() => setShowRunner(true)}>Run Script</Button>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Script Name</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Ran</th>
                  <th className="px-3 py-2">Output Preview</th>
                </tr>
              </thead>
              <tbody>
                {scriptHistory.map((row) => (
                  <tr key={row.id} className="border-t border-fds-border cursor-pointer hover:bg-slate-50" onClick={() => setShowOutput(row)}>
                    <td className="px-3 py-2">{row.command_payload?.scriptName || row.command_payload?.scriptType || 'Script'}</td>
                    <td className="px-3 py-2">{row.status}</td>
                    <td className="px-3 py-2">{row.created_at ? new Date(row.created_at).toLocaleString() : '—'}</td>
                    <td className="max-w-[340px] truncate px-3 py-2 text-slate-600">{row.output || row.error_message || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {tab === 'live_actions' && (
        <div className="space-y-4">
          <Card>
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-slate-900">Terminal / Quick Commands</h2>
              {quickPending ? (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">
                  Waiting for device response...
                </span>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <Input
                placeholder="Type a PowerShell command..."
                value={quickCommand}
                onChange={(e) => setQuickCommand(e.target.value)}
              />
              <Button type="button" onClick={() => runTerminalCommand(quickCommand)}>Run</Button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {[
                'ipconfig',
                'whoami',
                'Get-Process | Sort CPU -desc | Select -first 10',
                'Get-Service | Where Status -eq Running',
                'Get-EventLog -LogName System -Newest 20',
              ].map((cmd) => (
                <button
                  key={cmd}
                  className="rounded-full border border-fds-border bg-slate-50 px-3 py-1 text-xs text-slate-700 hover:bg-slate-100"
                  onClick={() => runTerminalCommand(cmd)}
                >
                  {cmd}
                </button>
              ))}
            </div>
            {quickHistory.length ? (
              <div className="mt-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Recent commands</p>
                <div className="flex flex-wrap gap-2">
                  {quickHistory.slice(0, 10).map((cmd) => (
                    <button
                      key={cmd}
                      className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700 hover:bg-slate-200"
                      onClick={() => setQuickCommand(cmd)}
                    >
                      {cmd}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap rounded bg-slate-950 p-3 text-xs text-slate-100">
              {quickOutput || 'Run a command to see output.'}
            </pre>
          </Card>

          <Card>
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-slate-900">Processes</h2>
              <div className="flex items-center gap-2">
                <Input placeholder="Filter processes..." value={processSearch} onChange={(e) => setProcessSearch(e.target.value)} />
                <Button type="button" variant="outline" onClick={refreshProcesses}>Refresh Processes</Button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                  <tr><th className="px-3 py-2">Process Name</th><th className="px-3 py-2">PID</th><th className="px-3 py-2">CPU %</th><th className="px-3 py-2">Memory MB</th><th className="px-3 py-2">Status</th><th className="px-3 py-2" /></tr>
                </thead>
                <tbody>
                  {processRows
                    .filter((p) => `${p.ProcessName || ''} ${p.Id || ''}`.toLowerCase().includes(processSearch.toLowerCase()))
                    .map((p) => (
                      <tr key={`${p.ProcessName}-${p.Id}`} className="border-t border-fds-border">
                        <td className="px-3 py-2">{p.ProcessName || '—'}</td>
                        <td className="px-3 py-2">{p.Id ?? '—'}</td>
                        <td className="px-3 py-2">{p.CPU ?? '—'}</td>
                        <td className="px-3 py-2">{Number.isFinite(Number(p.WS)) ? (Number(p.WS) / 1024 / 1024).toFixed(1) : '—'}</td>
                        <td className="px-3 py-2">{p.Responding === false ? 'Not responding' : 'Running'}</td>
                        <td className="px-3 py-2 text-right">
                          <Button type="button" variant="outline" onClick={() => runQuickPowerShell(`Kill Process ${p.Id}`, `Stop-Process -Id ${p.Id} -Force`).then(refreshProcesses)}>Kill Process</Button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card>
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-slate-900">Services</h2>
              <div className="flex items-center gap-2">
                <Input placeholder="Filter services..." value={serviceSearch} onChange={(e) => setServiceSearch(e.target.value)} />
                <Button type="button" variant="outline" onClick={refreshServices}>Refresh Services</Button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                  <tr><th className="px-3 py-2">Service Name</th><th className="px-3 py-2">Display Name</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Start Type</th><th className="px-3 py-2" /></tr>
                </thead>
                <tbody>
                  {serviceRows
                    .filter((s) => `${s.Name || ''} ${s.DisplayName || ''}`.toLowerCase().includes(serviceSearch.toLowerCase()))
                    .map((s) => {
                      const isCommon = ['wuauserv', 'windefend', 'spooler'].includes(String(s.Name || '').toLowerCase());
                      const running = String(s.Status || '').toLowerCase() === 'running';
                      return (
                        <tr key={s.Name} className={`border-t border-fds-border ${isCommon ? 'bg-amber-50/60' : ''}`}>
                          <td className="px-3 py-2">{s.Name || '—'}</td>
                          <td className="px-3 py-2">{s.DisplayName || '—'}</td>
                          <td className="px-3 py-2">{s.Status || '—'}</td>
                          <td className="px-3 py-2">{s.StartType || '—'}</td>
                          <td className="px-3 py-2 text-right">
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() =>
                                runQuickPowerShell(
                                  `${running ? 'Stop' : 'Start'} Service ${s.Name}`,
                                  `${running ? 'Stop-Service' : 'Start-Service'} -Name "${s.Name}" -Force`,
                                ).then(refreshServices)
                              }
                            >
                              {running ? 'Stop' : 'Start'}
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </Card>

          <Card>
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-slate-900">Printers</h2>
              <Button type="button" variant="outline" onClick={refreshPrinters}>Refresh Printers</Button>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                  <tr><th className="px-3 py-2">Printer Name</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Default</th><th className="px-3 py-2">Port</th><th className="px-3 py-2">Driver</th><th className="px-3 py-2" /></tr>
                </thead>
                <tbody>
                  {printerRows.map((p) => (
                    <tr key={p.Name} className="border-t border-fds-border">
                      <td className="px-3 py-2">{p.Name || '—'}</td>
                      <td className="px-3 py-2">{p.PrinterStatus ?? '—'}</td>
                      <td className="px-3 py-2">{p.Default ? 'Yes' : 'No'}</td>
                      <td className="px-3 py-2">{p.PortName || '—'}</td>
                      <td className="px-3 py-2">{p.DriverName || '—'}</td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex justify-end gap-2">
                          <Button type="button" variant="outline" onClick={() => runQuickPowerShell(`Set Default Printer ${p.Name}`, `Set-Printer -Name "${p.Name}" -IsDefault $true`).then(refreshPrinters)}>Set as Default</Button>
                          <Button type="button" variant="outline" onClick={() => runQuickPowerShell(`Remove Printer ${p.Name}`, `Remove-Printer -Name "${p.Name}"`).then(refreshPrinters)}>Remove</Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-slate-900">Applications</h2>
              <div className="flex gap-2">
                {[
                  ['all', 'All'],
                  ['updates', 'Updates Available'],
                  ['recent', 'Recently Installed'],
                ].map(([id, label]) => (
                  <button
                    key={id}
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${appsFilter === id ? 'bg-brand text-white' : 'bg-slate-100 text-slate-700'}`}
                    onClick={() => setAppsFilter(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                  <tr><th className="px-3 py-2">App Name</th><th className="px-3 py-2">Version</th><th className="px-3 py-2">Publisher</th><th className="px-3 py-2">Installed Date</th><th className="px-3 py-2" /></tr>
                </thead>
                <tbody>
                  {filteredAppsDetailed.map((a) => (
                    <tr key={`${a.app_name}-${a.winget_id || ''}-${a.installed_version || ''}`} className="border-t border-fds-border">
                      <td className="px-3 py-2">{a.app_name || '—'}</td>
                      <td className="px-3 py-2">{a.installed_version || '—'}</td>
                      <td className="px-3 py-2">{a.publisher || '—'}</td>
                      <td className="px-3 py-2">{a.last_scanned_at ? new Date(a.last_scanned_at).toLocaleString() : '—'}</td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() =>
                              runQuickPowerShell(
                                `Uninstall ${a.app_name || 'app'}`,
                                a.winget_id
                                  ? `winget uninstall --id "${a.winget_id}" -e --silent`
                                  : `Get-Package -Name "${a.app_name}" | Uninstall-Package -Force`,
                              )
                            }
                          >
                            Uninstall
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() =>
                              runQuickPowerShell(
                                `Update ${a.app_name || 'app'}`,
                                a.winget_id ? `winget upgrade --id "${a.winget_id}" -e --silent` : `winget upgrade --name "${a.app_name}" --silent`,
                              )
                            }
                          >
                            Update
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {tab === 'activity' && (
        <Card>
          <h2 className="mb-3 text-sm font-semibold text-slate-900">Activity</h2>
          <ul className="space-y-2">
            {scanResults.map((s) => (
              <li key={s.id} className="rounded border border-fds-border bg-slate-50 px-3 py-2 text-sm text-slate-700">
                {s.created_at ? new Date(s.created_at).toLocaleString() : '—'} · {s.status || 'pass'} · {s.ai_summary || 'Device heartbeat'}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <ScriptRunnerModal
        open={showRunner}
        onClose={() => setShowRunner(false)}
        selectedDevices={device ? [device] : []}
        scripts={scripts}
        title="Run Script on Device"
      />

      {showOutput && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4">
          <Card className="max-h-[85vh] w-full max-w-3xl overflow-auto">
            <div className="mb-3 flex items-start justify-between">
              <h3 className="text-base font-semibold text-slate-900">{showOutput.command_payload?.scriptName || 'Script output'}</h3>
              <button className="text-2xl text-slate-500" onClick={() => setShowOutput(null)}>×</button>
            </div>
            <pre className="whitespace-pre-wrap rounded bg-slate-950 p-3 text-xs text-slate-100">
              {showOutput.output || showOutput.error_message || 'No output.'}
            </pre>
          </Card>
        </div>
      )}
    </div>
  );
}

function MetricRow({ label, pct, tone }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs text-slate-600">
        <span>{label}</span>
        <span>{formatPct(pct)}</span>
      </div>
      <div className="h-2 rounded-full bg-slate-200">
        <div className={`h-2 rounded-full ${tone}`} style={{ width: `${usageBar(pct)}%` }} />
      </div>
    </div>
  );
}

