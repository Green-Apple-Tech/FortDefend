import { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ScrollView, RefreshControl } from 'react-native';
import { useHomeSecurity } from './src/features/home/hooks/useHomeSecurity';
import SummaryCard from './src/features/home/components/SummaryCard';
import SecurityChecksCard from './src/features/home/components/SecurityChecksCard';
import CleanupHealthCard from './src/features/home/components/CleanupHealthCard';
import AntiPhishingCard from './src/features/home/components/AntiPhishingCard';
import { startBackgroundProtection, getBackgroundProtectionStatus, requestBatteryOptimizationExemption, stopBackgroundProtection } from './src/services/backgroundProtection';

export default function App() {
  const [screen, setScreen] = useState('enroll');
  const [orgToken, setOrgToken] = useState('');
  const [status, setStatus] = useState('Waiting to start protection');
  const [bgProtection, setBgProtection] = useState({ active: false, lastScanAt: null });
  const { loading, error, score, status: securityStatus, summary, lastScannedAt, securityChecks, healthChecks, refresh } = useHomeSecurity();

  const enroll = () => {
    if (!orgToken.trim()) { Alert.alert('Enter your org token'); return; }
    setScreen('home');
    startBackgroundProtection(orgToken.trim())
      .then(async () => {
        setStatus(`Connected ✓ ${new Date().toLocaleTimeString()}`);
        requestBatteryOptimizationExemption();
        const state = await getBackgroundProtectionStatus();
        setBgProtection(state);
      })
      .catch((e) => setStatus(`Error: ${e.message}`));
  };

  useEffect(() => {
    if (screen === 'home') refresh();
  }, [screen, refresh]);

  useEffect(() => {
    (async () => {
      const state = await getBackgroundProtectionStatus();
      setBgProtection(state);
    })();
  }, []);

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
      <Text style={styles.sub}>
        Background protection: {bgProtection.active ? 'Active' : 'Inactive'}
        {bgProtection.lastScanAt ? ` · Last scan ${new Date(bgProtection.lastScanAt).toLocaleTimeString()}` : ''}
      </Text>
      {bgProtection.active ? (
        <TouchableOpacity
          style={[styles.button, { backgroundColor: '#1f2937', marginBottom: 12 }]}
          onPress={async () => {
            await stopBackgroundProtection();
            const state = await getBackgroundProtectionStatus();
            setBgProtection(state);
            setStatus('Background protection stopped');
          }}
        >
          <Text style={styles.buttonText}>Stop background protection (logout)</Text>
        </TouchableOpacity>
      ) : null}
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
