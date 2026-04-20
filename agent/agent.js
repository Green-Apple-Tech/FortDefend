/**
 * FortDefend Windows endpoint collector (runs on managed Windows devices).
 * Produces JSON for upload to FortDefend scan_results / agent pipeline.
 *
 * Data sources:
 * - Microsoft Defender: Get-MpThreatDetection, Get-MpComputerStatus
 * - Wazuh: ossec-agent install path (alerts when present)
 * - OpenEDR: Application event log tail (when provider/message indicates OpenEDR)
 */

'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const WAZUH_AGENT_DIR = path.join('C:', 'Program Files (x86)', 'ossec-agent');

/**
 * @param {string} script PowerShell script body (single line safe blocks preferred)
 */
function runPowerShell(script) {
  try {
    return execFileSync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
      { encoding: 'utf8', maxBuffer: 25 * 1024 * 1024, timeout: 180000, windowsHide: true }
    );
  } catch (err) {
    return JSON.stringify({
      _powershellError: err.message || String(err),
      stderr: err.stderr ? String(err.stderr) : undefined,
    });
  }
}

function parseJsonOrWrap(raw) {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  try {
    return JSON.parse(s);
  } catch {
    return { _rawText: s.slice(0, 50000) };
  }
}

/**
 * Recent Defender threats (Get-MpThreatDetection).
 */
function collectMpThreatDetection() {
  const script = [
    "$ErrorActionPreference = 'SilentlyContinue'",
    '$t = Get-MpThreatDetection | Select-Object -First 200',
    '$t | ConvertTo-Json -Depth 8 -Compress',
  ].join('; ');
  return parseJsonOrWrap(runPowerShell(script));
}

/**
 * Defender health / status (Get-MpComputerStatus).
 */
function collectMpComputerStatus() {
  const script = [
    "$ErrorActionPreference = 'SilentlyContinue'",
    '$s = Get-MpComputerStatus',
    '$s | ConvertTo-Json -Depth 6 -Compress',
  ].join('; ');
  return parseJsonOrWrap(runPowerShell(script));
}

/**
 * Read recent Wazuh agent alerts from common log locations when the agent is installed.
 */
function collectWazuhAlerts() {
  const out = { installed: false, paths: [], tail: [] };
  try {
    if (!fs.existsSync(WAZUH_AGENT_DIR)) {
      return out;
    }
    out.installed = true;
    const candidates = [
      path.join(WAZUH_AGENT_DIR, 'ossec', 'alerts', 'alerts.log'),
      path.join(WAZUH_AGENT_DIR, 'ossec', 'alerts', 'alerts.json'),
      path.join(WAZUH_AGENT_DIR, 'active-response', 'active-responses.log'),
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) {
        out.paths.push(p);
        try {
          const stat = fs.statSync(p);
          const fd = fs.openSync(p, 'r');
          const readSize = Math.min(stat.size, 128 * 1024);
          const buf = Buffer.alloc(readSize);
          fs.readSync(fd, buf, 0, readSize, Math.max(0, stat.size - readSize));
          fs.closeSync(fd);
          out.tail.push({
            file: p,
            bytes: readSize,
            sample: buf.toString('utf8').slice(-12000),
          });
        } catch (e) {
          out.tail.push({ file: p, error: e.message || String(e) });
        }
      }
    }
  } catch (e) {
    out.error = e.message || String(e);
  }
  return out;
}

/**
 * Tail Application log events that look OpenEDR-related (provider or message).
 */
function collectOpenEdrStyleEvents() {
  const script = [
    "$ErrorActionPreference='SilentlyContinue'",
    "Get-WinEvent -LogName 'Application' -MaxEvents 400 -ErrorAction SilentlyContinue |",
    "Where-Object { $_.ProviderName -match 'OpenEDR|Open EDR|Elastic|SentinelOne|CrowdStrike' -or $_.Message -match 'OpenEDR|threat|malware' } |",
    'Select-Object -First 80 TimeCreated, Id, ProviderName, LevelDisplayName, Message |',
    'ConvertTo-Json -Depth 4 -Compress',
  ].join(' ');
  return parseJsonOrWrap(runPowerShell(script));
}

/**
 * Full snapshot for one reporting cycle.
 */
function collectEndpointThreatTelemetry() {
  return {
    source: 'fortdefend_windows_agent',
    collectedAt: new Date().toISOString(),
    defender: {
      threatDetection: collectMpThreatDetection(),
      computerStatus: collectMpComputerStatus(),
    },
    wazuh: collectWazuhAlerts(),
    openEdrEvents: collectOpenEdrStyleEvents(),
  };
}

module.exports = {
  collectMpThreatDetection,
  collectMpComputerStatus,
  collectWazuhAlerts,
  collectOpenEdrStyleEvents,
  collectEndpointThreatTelemetry,
};

// CLI: node agent.js
if (require.main === module) {
  process.stdout.write(JSON.stringify(collectEndpointThreatTelemetry(), null, 2));
}
