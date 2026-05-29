import { Platform } from 'react-native';
import * as Device from 'expo-device';
import { CHECK_STATUS } from '../types';

function patchAgeDays(patch) {
  if (!patch) return null;
  const parsed = new Date(patch);
  if (Number.isNaN(parsed.getTime())) return null;
  return Math.floor((Date.now() - parsed.getTime()) / (1000 * 60 * 60 * 24));
}

export async function collectSecurityChecks() {
  const checks = [];
  const patchDate = Device.osBuildFingerprint ? null : null;
  const securityPatch = Device.osBuildId || null;
  const age = patchAgeDays(patchDate);

  checks.push({
    id: 'screen_lock',
    title: 'Screen lock enabled',
    status: CHECK_STATUS.UNAVAILABLE,
    value: 'Not available',
    recommendation: 'Not available on this device/version.',
  });

  checks.push({
    id: 'developer_options',
    title: 'Developer options / USB debugging',
    status: CHECK_STATUS.UNAVAILABLE,
    value: 'Unknown',
    recommendation: 'Not available on this device/version.',
  });

  checks.push({
    id: 'os_version',
    title: 'OS version',
    status: CHECK_STATUS.OK,
    value: `${Device.osName || Platform.OS} ${Device.osVersion || ''}`.trim(),
    recommendation: 'Keep OS up to date.',
  });

  checks.push({
    id: 'security_patch',
    title: 'Security patch level',
    status: securityPatch ? CHECK_STATUS.WARN : CHECK_STATUS.UNAVAILABLE,
    value: securityPatch || 'Not available',
    recommendation: securityPatch
      ? 'Verify latest Android security patch is installed.'
      : 'Not available on this device/version.',
  });

  checks.push({
    id: 'security_patch_age',
    title: 'Security patch age',
    status: age == null ? CHECK_STATUS.UNAVAILABLE : age > 90 ? CHECK_STATUS.RISK : age > 45 ? CHECK_STATUS.WARN : CHECK_STATUS.OK,
    value: age == null ? 'Not available' : `${age} days`,
    recommendation: age == null ? 'Not available on this device/version.' : 'Install latest patch if age is high.',
  });

  checks.push({
    id: 'sideload_risk',
    title: 'Sideloaded app risk',
    status: CHECK_STATUS.UNAVAILABLE,
    value: 'Unknown',
    recommendation: 'Installer source data is not available in Phase 1 baseline.',
  });

  return checks;
}

