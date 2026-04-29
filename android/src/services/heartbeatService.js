import * as Battery from 'expo-battery';
import * as Device from 'expo-device';
import * as FileSystem from 'expo-file-system';
import * as Network from 'expo-network';
import { collectSecurityChecks } from '../features/home/services/deviceSecurityService';
import { calculateSecurityScore } from '../features/home/utils/securityScoring';

const SERVER = 'https://app.fortdefend.com';

function bytesToGb(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Number((n / (1024 ** 3)).toFixed(2));
}

function batteryStateToStatus(state) {
  if (state === Battery.BatteryState.CHARGING) return 'charging';
  if (state === Battery.BatteryState.FULL) return 'full';
  if (state === Battery.BatteryState.UNPLUGGED) return 'unplugged';
  return 'unknown';
}

function statusToBoolean(check) {
  if (!check) return null;
  if (check.status === 'ok') return true;
  if (check.status === 'warn' || check.status === 'risk') return false;
  return null;
}

export async function sendAndroidHeartbeat(orgToken) {
  const token = String(orgToken || '').trim();
  if (!token) throw new Error('Missing org token');

  const [
    batteryLevel,
    batteryState,
    totalDiskCapacity,
    freeDiskStorage,
    networkState,
    ipAddress,
    securityChecks,
  ] = await Promise.all([
    Battery.getBatteryLevelAsync(),
    Battery.getBatteryStateAsync(),
    FileSystem.getTotalDiskCapacityAsync().catch(() => null),
    FileSystem.getFreeDiskStorageAsync().catch(() => null),
    Network.getNetworkStateAsync().catch(() => null),
    Network.getIpAddressAsync().catch(() => null),
    collectSecurityChecks().catch(() => []),
  ]);

  const realDeviceName = `${Device.manufacturer || 'Android'} ${Device.modelName || 'Device'}`.trim();
  const serialNumber = Device.osBuildId || Device.deviceName || null;
  const osBuild = Device.osBuildFingerprint || Device.osInternalBuildId || null;
  const cpuModel = Device.modelName || null;
  const cpuCores = Number.isFinite(Number(Device.supportedCpuArchitectures?.length))
    ? Number(Device.supportedCpuArchitectures.length)
    : null;
  const totalMemory = Number(Device.totalMemory || null);
  const memTotalGb = bytesToGb(totalMemory);
  const memUsedGb = null;
  const batteryPct = Number.isFinite(Number(batteryLevel)) ? Math.round(Number(batteryLevel) * 100) : null;
  const batteryStatus = batteryStateToStatus(batteryState);
  const diskTotalGb = bytesToGb(totalDiskCapacity);
  const diskFreeGb = bytesToGb(freeDiskStorage);
  const osUpToDateCheck = securityChecks.find((c) => c.id === 'security_patch_age');
  const screenLockCheck = securityChecks.find((c) => c.id === 'screen_lock');
  const devOptionsCheck = securityChecks.find((c) => c.id === 'developer_options');
  const securityScore = calculateSecurityScore(securityChecks);
  const checkResults = securityChecks.map((c) => ({
    id: c.id,
    title: c.title,
    status: c.status,
    value: c.value ?? null,
    recommendation: c.recommendation ?? null,
  }));

  const payload = {
    orgToken: token,
    source: 'android',
    agentVersion: '1.0.0',
    os: 'Android',
    deviceName: realDeviceName,
    manufacturer: Device.manufacturer || null,
    model: Device.modelName || null,
    brand: Device.brand || null,
    serialNumber: serialNumber || null,
    deviceId: Device.deviceName || null,
    osVersion: Device.osVersion || null,
    osBuild: osBuild || null,
    apiLevel: Number.isFinite(Number(Device.platformApiLevel)) ? Number(Device.platformApiLevel) : null,
    securityPatchLevel: null,
    buildNumber: Device.osInternalBuildId || null,
    cpuModel: cpuModel || null,
    cpuCores,
    memTotalGb,
    memUsedGb,
    ramTotalGb: memTotalGb,
    diskTotalGb,
    diskFreeGb,
    batteryLevel: batteryPct,
    batteryStatus,
    onAcPower: batteryStatus === 'charging' || batteryStatus === 'full',
    wifiConnected: networkState?.type === Network.NetworkStateType.WIFI ? true : null,
    ipAddress: ipAddress || null,
    screenLockEnabled: statusToBoolean(screenLockCheck),
    developerOptionsEnabled: statusToBoolean(devOptionsCheck),
    osUpToDate: osUpToDateCheck?.status === 'ok' ? true : osUpToDateCheck ? false : null,
    securityScore,
    checkResults,
  };

  const response = await fetch(`${SERVER}/api/android/heartbeat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(`Heartbeat failed (${response.status})`);
  return { sentAt: new Date().toISOString(), payload };
}

