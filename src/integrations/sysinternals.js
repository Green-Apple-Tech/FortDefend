const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const path = require('path');

// ── Sysinternals tool paths ───────────────────────────────────────────────────

const SYSINTERNALS_BASE = 'C:\\ProgramData\\FortDefend\\sysinternals';
const TOOLS = {
  autoruns: path.join(SYSINTERNALS_BASE, 'autorunsc.exe'),
  sigcheck: path.join(SYSINTERNALS_BASE, 'sigcheck.exe'),
  tcpview: path.join(SYSINTERNALS_BASE, 'tcpvcon.exe'),
  accesschk: path.join(SYSINTERNALS_BASE, 'accesschk.exe'),
  psexec: path.join(SYSINTERNALS_BASE, 'psexec.exe'),
};

const DOWNLOAD_BASE = 'https://live.sysinternals.com';

// ── Download Sysinternals tools ───────────────────────────────────────────────

function getDownloadScript() {
  return `
$tools = @('autorunsc.exe', 'sigcheck.exe', 'tcpvcon.exe', 'accesschk.exe')
$dest = 'C:\\ProgramData\\FortDefend\\sysinternals'
New-Item -ItemType Directory -Force -Path $dest | Out-Null
foreach ($tool in $tools) {
  $url = 'https://live.sysinternals.com/' + $tool
  $out = Join-Path $dest $tool
  if (-not (Test-Path $out)) {
    try {
      Invoke-WebRequest -Uri $url -OutFile $out -UseBasicParsing
      Write-Output "Downloaded $tool"
    } catch {
      Write-Output "Failed to download $tool"
    }
  }
}
Write-Output "Sysinternals setup complete"
  `.trim();
}

// ── Autoruns parser ───────────────────────────────────────────────────────────

function parseAutorunsOutput(csvOutput) {
  const lines = csvOutput.split('\n').filter(l => l.trim() && !l.startsWith('"Time"'));
  const entries = [];

  for (const line of lines) {
    const parts = parseCsvLine(line);
    if (parts.length < 5) continue;

    const entry = {
      time: parts[0]?.replace(/"/g, ''),
      entryLocation: parts[1]?.replace(/"/g, ''),
      entry: parts[2]?.replace(/"/g, ''),
      enabled: parts[3]?.replace(/"/g, '') === 'enabled',
      category: parts[4]?.replace(/"/g, ''),
      profile: parts[5]?.replace(/"/g, ''),
      description: parts[6]?.replace(/"/g, ''),
      signer: parts[7]?.replace(/"/g, ''),
      company: parts[8]?.replace(/"/g, ''),
      imagePath: parts[9]?.replace(/"/g, ''),
      version: parts[10]?.replace(/"/g, ''),
      launchString: parts[11]?.replace(/"/g, ''),
    };

    entry.riskLevel = assessAutorunRisk(entry);
    entries.push(entry);
  }

  return {
    entries,
    unsigned: entries.filter(e => e.enabled && (!e.signer || e.signer === '(Not verified)')),
    suspicious: entries.filter(e => e.riskLevel === 'high'),
    total: entries.length,
    enabled: entries.filter(e => e.enabled).length,
  };
}

function assessAutorunRisk(entry) {
  if (!entry.enabled) return 'disabled';

  const suspiciousPaths = ['\\temp\\', '\\appdata\\local\\temp\\', '\\downloads\\', '\\users\\public\\'];
  const pathLower = (entry.imagePath || '').toLowerCase();

  if (suspiciousPaths.some(p => pathLower.includes(p))) return 'high';
  if (!entry.signer || entry.signer === '(Not verified)') return 'medium';
  if (entry.company === '' || entry.description === '') return 'low';
  return 'ok';
}

// ── Sigcheck parser ───────────────────────────────────────────────────────────

function parseSigcheckOutput(csvOutput) {
  const lines = csvOutput.split('\n').filter(l => l.trim() && !l.startsWith('Path'));
  const files = [];

  for (const line of lines) {
    const parts = parseCsvLine(line);
    if (parts.length < 3) continue;

    files.push({
      path: parts[0]?.replace(/"/g, ''),
      verified: parts[1]?.replace(/"/g, ''),
      date: parts[2]?.replace(/"/g, ''),
      publisher: parts[3]?.replace(/"/g, ''),
      company: parts[4]?.replace(/"/g, ''),
      description: parts[5]?.replace(/"/g, ''),
      product: parts[6]?.replace(/"/g, ''),
      productVersion: parts[7]?.replace(/"/g, ''),
      fileVersion: parts[8]?.replace(/"/g, ''),
      machineType: parts[9]?.replace(/"/g, ''),
      isSigned: parts[1]?.replace(/"/g, '') === 'Signed',
    });
  }

  return {
    files,
    unsigned: files.filter(f => !f.isSigned),
    total: files.length,
  };
}

// ── TCPView parser ────────────────────────────────────────────────────────────

function parseTcpviewOutput(csvOutput) {
  const lines = csvOutput.split('\n').filter(l => l.trim() && !l.startsWith('Process'));
  const connections = [];

  const SUSPICIOUS_PORTS = [4444, 1337, 31337, 8888, 6666, 6667, 6668, 6669];
  const SUSPICIOUS_STATES = ['LISTENING', 'ESTABLISHED'];

  for (const line of lines) {
    const parts = parseCsvLine(line);
    if (parts.length < 5) continue;

    const remotePort = parseInt(parts[4]?.split(':')?.[1] || '0');
    const conn = {
      process: parts[0]?.replace(/"/g, ''),
      pid: parts[1]?.replace(/"/g, ''),
      protocol: parts[2]?.replace(/"/g, ''),
      localAddress: parts[3]?.replace(/"/g, ''),
      remoteAddress: parts[4]?.replace(/"/g, ''),
      state: parts[5]?.replace(/"/g, ''),
      isSuspicious: SUSPICIOUS_PORTS.includes(remotePort),
    };
    connections.push(conn);
  }

  return {
    connections,
    suspicious: connections.filter(c => c.isSuspicious),
    listening: connections.filter(c => c.state === 'LISTENING'),
    established: connections.filter(c => c.state === 'ESTABLISHED'),
    total: connections.length,
  };
}

// ── CSV helper ────────────────────────────────────────────────────────────────

function parseCsvLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (const char of line) {
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

// ── Main analysis function ────────────────────────────────────────────────────

function analyzeSysinternalsResults({ autoruns, sigcheck, tcpview }) {
  const issues = [];
  const autorunsData = autoruns ? parseAutorunsOutput(autoruns) : null;
  const sigcheckData = sigcheck ? parseSigcheckOutput(sigcheck) : null;
  const tcpviewData = tcpview ? parseTcpviewOutput(tcpview) : null;

  if (autorunsData) {
    for (const entry of autorunsData.suspicious) {
      issues.push({
        type: 'suspicious_startup',
        severity: 'critical',
        title: `Suspicious startup entry: ${entry.entry}`,
        detail: `Running from ${entry.imagePath} — unsigned or from suspicious location`,
        autoHealable: false,
        manualAction: 'Review and remove if unauthorized',
      });
    }
    for (const entry of autorunsData.unsigned) {
      issues.push({
        type: 'unsigned_startup',
        severity: 'warning',
        title: `Unsigned startup entry: ${entry.entry}`,
        detail: `${entry.imagePath} has no valid digital signature`,
        autoHealable: false,
        manualAction: 'Verify legitimacy of this startup entry',
      });
    }
  }

  if (sigcheckData) {
    for (const file of sigcheckData.unsigned) {
      issues.push({
        type: 'unsigned_binary',
        severity: 'warning',
        title: `Unsigned executable: ${path.basename(file.path)}`,
        detail: file.path,
        autoHealable: false,
        manualAction: 'Verify or remove this unsigned binary',
      });
    }
  }

  if (tcpviewData) {
    for (const conn of tcpviewData.suspicious) {
      issues.push({
        type: 'suspicious_connection',
        severity: 'critical',
        title: `Suspicious network connection from ${conn.process}`,
        detail: `${conn.process} connecting to ${conn.remoteAddress}`,
        autoHealable: false,
        manualAction: 'Investigate this process and connection immediately',
      });
    }
  }

  return {
    autoruns: autorunsData,
    sigcheck: sigcheckData,
    tcpview: tcpviewData,
    issues,
    summary: {
      suspiciousStartups: autorunsData?.suspicious.length || 0,
      unsignedBinaries: sigcheckData?.unsigned.length || 0,
      suspiciousConnections: tcpviewData?.suspicious.length || 0,
      totalIssues: issues.length,
    },
    downloadScript: getDownloadScript(),
  };
}

module.exports = {
  analyzeSysinternalsResults,
  parseAutorunsOutput,
  parseSigcheckOutput,
  parseTcpviewOutput,
  getDownloadScript,
  TOOLS,
};
