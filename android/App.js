import { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ScrollView, RefreshControl } from 'react-native';
import * as Battery from 'expo-battery';
import DeviceInfo from 'react-native-device-info';
import { useHomeSecurity } from './src/features/home/hooks/useHomeSecurity';
import SummaryCard from './src/features/home/components/SummaryCard';
import SecurityChecksCard from './src/features/home/components/SecurityChecksCard';
import CleanupHealthCard from './src/features/home/components/CleanupHealthCard';
import AntiPhishingCard from './src/features/home/components/AntiPhishingCard';

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
        brand,
        model,
        manufacturer,
        serialNumber,
        uniqueId,
        systemVersion,
        apiLevel,
        securityPatchLevel,
        buildNumber,
        totalMemory,
        usedMemory,
        totalDiskCapacity,
        freeDiskStorage,
        batteryLevel,
        batteryState,
      ] = await Promise.all([
        Promise.resolve(DeviceInfo.getBrand()),
        Promise.resolve(DeviceInfo.getModel()),
        DeviceInfo.getManufacturer(),
        DeviceInfo.getSerialNumber(),
        Promise.resolve(DeviceInfo.getUniqueId()),
        Promise.resolve(DeviceInfo.getSystemVersion()),
        DeviceInfo.getApiLevel(),
        DeviceInfo.getSecurityPatch(),
        Promise.resolve(DeviceInfo.getBuildNumber()),
        Promise.resolve(DeviceInfo.getTotalMemory()),
        DeviceInfo.getUsedMemory(),
        Promise.resolve(DeviceInfo.getTotalDiskCapacity()),
        Promise.resolve(DeviceInfo.getFreeDiskStorage()),
        Battery.getBatteryLevelAsync(),
        Battery.getBatteryStateAsync(),
      ]);

      const realDeviceName = `${brand || 'Android'} ${model || 'Device'}`.trim();
      const batteryPct = Number.isFinite(Number(batteryLevel))
        ? Math.round(Number(batteryLevel) * 100)
        : null;
      const batteryStatus = batteryStateToStatus(batteryState);
      const memTotalGb = bytesToGb(totalMemory);
      const memUsedGb = bytesToGb(usedMemory);
      const diskTotalGb = bytesToGb(totalDiskCapacity);
      const diskFreeGb = bytesToGb(freeDiskStorage);

      await fetch(`${SERVER}/api/android/heartbeat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgToken: token,
          source: 'android',
          agentVersion: '1.0.0',
          os: 'Android',
          deviceName: realDeviceName,
          manufacturer: manufacturer || null,
          model: model || null,
          serialNumber: serialNumber || null,
          deviceId: uniqueId || null,
          osVersion: systemVersion || null,
          apiLevel: Number.isFinite(Number(apiLevel)) ? Number(apiLevel) : null,
          securityPatchLevel: securityPatchLevel || null,
          buildNumber: buildNumber || null,
          memTotalGb,
          memUsedGb,
          diskTotalGb,
          diskFreeGb,
          batteryLevel: batteryPct,
          batteryStatus,
          onAcPower: batteryStatus === 'charging' || batteryStatus === 'full',
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
