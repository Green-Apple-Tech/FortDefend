import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';

const SERVER = 'https://app.fortdefend.com';

export default function App() {
  const [screen, setScreen] = useState('enroll');
  const [orgToken, setOrgToken] = useState('');
  const [status, setStatus] = useState('Connecting...');

  const enroll = () => {
    if (!orgToken.trim()) { Alert.alert('Enter your org token'); return; }
    setScreen('status');
    sendHeartbeat(orgToken.trim());
    setInterval(() => sendHeartbeat(orgToken.trim()), 30000);
  };

  const sendHeartbeat = async (token) => {
    try {
      await fetch(`${SERVER}/api/android/heartbeat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgToken: token, deviceName: 'Android Device', os: 'Android', source: 'android', agentVersion: '1.0.0' })
      });
      setStatus('Connected ✓ ' + new Date().toLocaleTimeString());
    } catch (e) {
      setStatus('Error: ' + e.message);
    }
  };

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
    <View style={styles.container}>
      <Text style={styles.title}>🛡️ FortDefend</Text>
      <View style={styles.badge}><Text style={styles.badgeText}>{status}</Text></View>
      <Text style={styles.sub}>Device enrolled and reporting</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A1628', justifyContent: 'center', alignItems: 'center', padding: 24 },
  title: { fontSize: 32, fontWeight: 'bold', color: '#fff', marginBottom: 8 },
  sub: { fontSize: 14, color: '#94a3b8', marginBottom: 24, textAlign: 'center' },
  input: { width: '100%', backgroundColor: '#1e2d44', color: '#fff', borderRadius: 10, padding: 16, fontSize: 14, marginBottom: 16, borderWidth: 1, borderColor: '#2563EB' },
  button: { width: '100%', backgroundColor: '#2563EB', borderRadius: 10, padding: 16, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  badge: { backgroundColor: '#10B981', borderRadius: 20, paddingHorizontal: 20, paddingVertical: 8, marginBottom: 16 },
  badgeText: { color: '#fff', fontWeight: '600' },
});
