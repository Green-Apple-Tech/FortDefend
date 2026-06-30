const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const db = require('../database');

// ── Nmap runner ───────────────────────────────────────────────────────────────

async function runNmapScan(subnet, options = {}) {
  const {
    ports = '22,80,443,3389,8080,8443,5900',
    timeout = 120,
  } = options;

  // Validate subnet to prevent injection
  if (!/^[\d./]+$/.test(subnet)) {
    throw new Error('Invalid subnet format');
  }

  const cmd = `nmap -sn -T4 --host-timeout ${timeout}s -oX - ${subnet}`;

  try {
    const { stdout } = await execAsync(cmd, { timeout: (timeout + 10) * 1000 });
    return parseNmapXml(stdout);
  } catch (err) {
    // Nmap not installed — return empty result with flag
    if (err.message.includes('not found') || err.message.includes('ENOENT')) {
      return { hosts: [], nmapAvailable: false };
    }
    throw err;
  }
}

function parseNmapXml(xml) {
  const hosts = [];
  const hostMatches = xml.matchAll(/<host>([\s\S]*?)<\/host>/g);

  for (const match of hostMatches) {
    const hostXml = match[1];

    const ipMatch = hostXml.match(/<address addr="([\d.]+)" addrtype="ipv4"/);
    const macMatch = hostXml.match(/<address addr="([A-F0-9:]+)" addrtype="mac"/);
    const vendorMatch = hostXml.match(/vendor="([^"]+)"/);
    const hostnameMatch = hostXml.match(/<hostname name="([^"]+)"/);
    const stateMatch = hostXml.match(/<state state="([^"]+)"/);

    if (ipMatch && stateMatch?.[1] === 'up') {
      hosts.push({
        ip: ipMatch[1],
        mac: macMatch?.[1] || null,
        vendor: vendorMatch?.[1] || null,
        hostname: hostnameMatch?.[1] || null,
        discoveredAt: new Date().toISOString(),
      });
    }
  }

  return { hosts, nmapAvailable: true };
}

// ── Shadow device detection ───────────────────────────────────────────────────

async function detectShadowDevices(orgId, scannedHosts, enrolledDevices) {
  const enrolledIPs = new Set(
    enrolledDevices
      .filter(d => d.ip_address)
      .map(d => d.ip_address)
  );

  const enrolledMACs = new Set(
    enrolledDevices
      .filter(d => d.mac_address)
      .map(d => d.mac_address?.toLowerCase())
  );

  const shadowDevices = scannedHosts.filter(host => {
    const ipKnown = enrolledIPs.has(host.ip);
    const macKnown = host.mac && enrolledMACs.has(host.mac.toLowerCase());
    return !ipKnown && !macKnown;
  });

  // Save shadow devices to DB
  for (const shadow of shadowDevices) {
    await db('shadow_devices')
      .insert({
        org_id: orgId,
        ip_address: shadow.ip,
        mac_address: shadow.mac,
        vendor: shadow.vendor,
        hostname: shadow.hostname,
        first_seen: new Date(),
        last_seen: new Date(),
        resolved: false,
      })
      .onConflict(['org_id', 'ip_address'])
      .merge({ last_seen: new Date(), vendor: shadow.vendor, hostname: shadow.hostname });
  }

  return shadowDevices;
}

// ── MDM enrollment gap analysis ───────────────────────────────────────────────

function analyzeEnrollmentGaps(scannedHosts, enrolledDevices) {
  const totalDiscovered = scannedHosts.length;
  const enrolledCount = enrolledDevices.length;
  const shadowCount = scannedHosts.filter(h => {
    const enrolled = enrolledDevices.find(
      d => d.ip_address === h.ip || d.mac_address?.toLowerCase() === h.mac?.toLowerCase()
    );
    return !enrolled;
  }).length;

  return {
    totalDiscovered,
    likelyManaged: 0,
    enrolledCount,
    shadowCount,
    enrollmentRate: totalDiscovered > 0
      ? Math.round((enrolledCount / totalDiscovered) * 100)
      : 100,
    summary: shadowCount > 0
      ? `${shadowCount} device${shadowCount > 1 ? 's' : ''} found on network not enrolled in any MDM`
      : 'All discovered devices appear to be enrolled',
  };
}

module.exports = {
  runNmapScan,
  detectShadowDevices,
  analyzeEnrollmentGaps,
  parseNmapXml,
};
