import * as Battery from 'expo-battery';
import * as FileSystem from 'expo-file-system';
import { CHECK_STATUS } from '../types';

function formatGb(bytes) {
  if (!Number.isFinite(bytes)) return 'Unknown';
  return `${(bytes / (1024 ** 3)).toFixed(1)} GB`;
}

export async function collectHealthChecks() {
  const checks = [];

  try {
    const [free, total] = await Promise.all([
      FileSystem.getFreeDiskStorageAsync(),
      FileSystem.getTotalDiskCapacityAsync(),
    ]);
    const used = total - free;
    const pct = total > 0 ? (used / total) * 100 : 0;
    checks.push({
      id: 'storage',
      title: 'Storage',
      status: pct > 90 ? CHECK_STATUS.RISK : pct > 80 ? CHECK_STATUS.WARN : CHECK_STATUS.OK,
      value: `${formatGb(free)} free / ${formatGb(total)} total`,
      recommendation: pct > 80 ? 'Free up space by removing large unused files/apps.' : 'Storage levels look healthy.',
    });
  } catch {
    checks.push({
      id: 'storage',
      title: 'Storage',
      status: CHECK_STATUS.UNAVAILABLE,
      value: 'Not available',
      recommendation: 'Not available on this device/version.',
    });
  }

  try {
    const [level, state] = await Promise.all([Battery.getBatteryLevelAsync(), Battery.getBatteryStateAsync()]);
    const levelPct = Math.round((level || 0) * 100);
    const charging = state === Battery.BatteryState.CHARGING || state === Battery.BatteryState.FULL;
    checks.push({
      id: 'battery',
      title: 'Battery',
      status: !charging && levelPct < 20 ? CHECK_STATUS.WARN : CHECK_STATUS.OK,
      value: `${levelPct}%${charging ? ' (charging)' : ''}`,
      recommendation: !charging && levelPct < 20 ? 'Charge soon and avoid deep discharge.' : 'Battery is in acceptable range.',
    });
  } catch {
    checks.push({
      id: 'battery',
      title: 'Battery',
      status: CHECK_STATUS.UNAVAILABLE,
      value: 'Not available',
      recommendation: 'Not available on this device/version.',
    });
  }

  checks.push({
    id: 'cleanup_prompt',
    title: 'Cleanup recommendations',
    status: CHECK_STATUS.OK,
    value: 'Rule-based suggestions',
    recommendation: 'Clear app caches, uninstall unused apps, and restart weekly.',
  });

  return checks;
}

