import { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ScrollView, RefreshControl } from 'react-native';
import * as Battery from 'expo-battery';
import * as Device from 'expo-device';
import * as FileSystem from 'expo-file-system';
import * as Network from 'expo-network';
import { useHomeSecurity } from './src/features/home/hooks/useHomeSecurity';
import SummaryCard from './src/features/home/components/SummaryCard';
import SecurityChecksCard from './src/features/home/components/SecurityChecksCard';
import CleanupHealthCard from './src/features/home/components/CleanupHealthCard';
import AntiPhishingCard from './src/features/home/components/AntiPhishingCard';
import { collectSecurityChecks } from './src/features/home/services/deviceSecurityService';
import { calculateSecurityScore } from './src/features/home/utils/securityScoring';

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

export default function App() {
  const [screen, setScreen] = useState('enroll');
  const [orgToken, setOrgToken] = useState('');
  const [status, setStatus] = useState('Connecting...');
  const [heartbeatTimer, setHeartbeatTimer] = useState(null);
  const { loading, error, score, status: securityStatus, summary, lastScannedAt, securityChecks, healthChecks, refresh } = useHomeSecurity();

  const enroll = () => {
    if (!orgToken.trim()) { Alert.alert('Enter your org token'); return; }
    setScreen('home');
    sendHeartbeat(orgToken.trim());
    const intervalId = setInterval(() => sendHeartbeat(orgToken.trim()), 30000);
    setHeartbeatTimer(intervalId);
  };

  const sendHeartbeat = async (token) => {
    try {
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
      const usedMemory = null;
      const memTotalGb = bytesToGb(totalMemory);
      const memUsedGb = bytesToGb(usedMemory);
      const batteryPct = Number.isFinite(Number(batteryLevel))
        ? Math.round(Number(batteryLevel) * 100)
        : null;
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

      await fetch(`${SERVER}/api/android/heartbeat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
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
        }),
      });
      setStatus('Connected ✓ ' + new Date().toLocaleTimeString());
    } catch (e) {
      setStatus('Error: ' + e.message);
    }
  };

  useEffect(() => {
    if (screen === 'home') refresh();
  }, [screen, refresh]);

  useEffect(() => {
    return () => {
      if (heartbeatTimer) clearInterval(heartbeatTimer);
    };
  }, [heartbeatTimer]);

  if (screen === 'enroll') return (
    <View style={styles.container}>
      <Text style={styles.title}>🛡️ FortDefend</Text>
      <Text style={styles.sub}>Enter your org token to enroll</Text>
      <TextInput style={styles.input} placeholder="Paste org token here" placeholderTextColor="#94a3b8" value={orgToken} onChangeText={setOrgToken} autoCapitalize="none" />
      <TouchableOpacity style={styles.button} onPress={enroll}>
        <Text style={styles.buttonText}>Enroll Device</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <ScrollView
      style={styles.homeScreen}
      contentContainerStyle={styles.homeContent}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} />}
    >
      <Text style={styles.title}>🛡️ FortDefend</Text>
      <View style={styles.badge}><Text style={styles.badgeText}>{status}</Text></View>
      <Text style={styles.sub}>Device enrolled and reporting</Text>
      {error ? <Text style={styles.errorText}>Error: {error}</Text> : null}
      <SummaryCard
        score={score}
        status={securityStatus}
        bullets={summary?.bullets || []}
        lastScannedAt={lastScannedAt}
      />
      <SecurityChecksCard checks={securityChecks} />
      <CleanupHealthCard checks={healthChecks} />
      <AntiPhishingCard />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A1628', justifyContent: 'center', alignItems: 'center', padding: 24 },
  homeScreen: { flex: 1, backgroundColor: '#0A1628' },
  homeContent: { padding: 16, paddingBottom: 32 },
  title: { fontSize: 32, fontWeight: 'bold', color: '#fff', marginBottom: 8 },
  sub: { fontSize: 14, color: '#94a3b8', marginBottom: 24, textAlign: 'center' },
  input: { width: '100%', backgroundColor: '#1e2d44', color: '#fff', borderRadius: 10, padding: 16, fontSize: 14, marginBottom: 16, borderWidth: 1, borderColor: '#2563EB' },
  button: { width: '100%', backgroundColor: '#2563EB', borderRadius: 10, padding: 16, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  badge: { backgroundColor: '#10B981', borderRadius: 20, paddingHorizontal: 20, paddingVertical: 8, marginBottom: 16 },
  badgeText: { color: '#fff', fontWeight: '600' },
  errorText: { color: '#fca5a5', marginBottom: 10, fontSize: 12 },
});
