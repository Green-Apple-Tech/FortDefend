const DISK_FREE_ALERT_PCT = 2;
const SATURATION_SECONDS = 30;

function toNum(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toDateOrNull(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

async function ensureAlert(db, { orgId, deviceId, type, severity, message, aiAnalysis = null }) {
  const existing = await db('alerts')
    .where({ org_id: orgId, device_id: deviceId, type, resolved: false })
    .first();
  if (existing) {
    await db('alerts').where({ id: existing.id }).update({
      severity,
      message,
      ai_analysis: aiAnalysis,
      created_at: new Date(),
    });
    return existing.id;
  }
  const [row] = await db('alerts')
    .insert({
      id: db.raw('gen_random_uuid()'),
      org_id: orgId,
      device_id: deviceId,
      type,
      severity,
      message,
      ai_analysis: aiAnalysis,
      resolved: false,
      created_at: new Date(),
    })
    .returning(['id']);
  return row?.id;
}

async function resolveAlert(db, { orgId, deviceId, type }) {
  await db('alerts')
    .where({ org_id: orgId, device_id: deviceId, type, resolved: false })
    .update({ resolved: true, resolved_at: new Date() });
}

async function evaluateDeviceAlerts(db, { orgId, device }) {
  const now = new Date();
  const diskFreePct = toNum(device.disk_free_pct, null);
  if (diskFreePct != null && diskFreePct < DISK_FREE_ALERT_PCT) {
    await ensureAlert(db, {
      orgId,
      deviceId: device.id,
      type: 'disk_free_critical',
      severity: 'critical',
      message: `${device.name}: disk free space is ${diskFreePct.toFixed(2)}% (< ${DISK_FREE_ALERT_PCT}%).`,
      aiAnalysis: 'Immediate cleanup recommended; critically low disk can destabilize endpoint health checks.',
    });
  } else {
    await resolveAlert(db, { orgId, deviceId: device.id, type: 'disk_free_critical' });
  }

  const cpuSince = toDateOrNull(device.high_cpu_since);
  if (cpuSince && now.getTime() - cpuSince.getTime() >= SATURATION_SECONDS * 1000) {
    await ensureAlert(db, {
      orgId,
      deviceId: device.id,
      type: 'cpu_sustained_100',
      severity: 'critical',
      message: `${device.name}: CPU usage has remained at 100% for more than ${SATURATION_SECONDS} seconds.`,
      aiAnalysis: 'Likely process contention or runaway workload; investigate top CPU consumers.',
    });
  } else {
    await resolveAlert(db, { orgId, deviceId: device.id, type: 'cpu_sustained_100' });
  }

  const ramSince = toDateOrNull(device.high_ram_since);
  if (ramSince && now.getTime() - ramSince.getTime() >= SATURATION_SECONDS * 1000) {
    await ensureAlert(db, {
      orgId,
      deviceId: device.id,
      type: 'ram_sustained_100',
      severity: 'critical',
      message: `${device.name}: RAM usage has remained at 100% for more than ${SATURATION_SECONDS} seconds.`,
      aiAnalysis: 'Likely memory pressure or leak; inspect memory-heavy processes.',
    });
  } else {
    await resolveAlert(db, { orgId, deviceId: device.id, type: 'ram_sustained_100' });
  }

  if (device.os_outdated === true) {
    await ensureAlert(db, {
      orgId,
      deviceId: device.id,
      type: 'os_outdated',
      severity: 'warning',
      message: `${device.name}: OS version appears outdated (${device.os || 'unknown'} ${device.os_version || ''}).`,
      aiAnalysis: 'Outdated operating systems increase vulnerability exposure and patch lag risk.',
    });
  } else {
    await resolveAlert(db, { orgId, deviceId: device.id, type: 'os_outdated' });
  }

  if (device.security_agent_running === false) {
    await ensureAlert(db, {
      orgId,
      deviceId: device.id,
      type: 'security_agent_stopped',
      severity: 'critical',
      message: `${device.name}: security agent appears missing or stopped.`,
      aiAnalysis: 'Endpoint protection not active; restore security service immediately.',
    });
  } else {
    await resolveAlert(db, { orgId, deviceId: device.id, type: 'security_agent_stopped' });
  }
}

module.exports = {
  toNum,
  toDateOrNull,
  evaluateDeviceAlerts,
};
