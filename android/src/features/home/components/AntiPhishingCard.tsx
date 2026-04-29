import { useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { scanUrlLocally } from '../services/phishingService';

function color(severity) {
  if (severity === 'High Risk') return '#ef4444';
  if (severity === 'Suspicious') return '#f59e0b';
  return '#10b981';
}

export default function AntiPhishingCard() {
  const [url, setUrl] = useState('');
  const result = useMemo(() => scanUrlLocally(url), [url]);

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Anti-Phishing (Local Scan)</Text>
      <TextInput
        style={styles.input}
        placeholder="https://example.com"
        placeholderTextColor="#94a3b8"
        autoCapitalize="none"
        value={url}
        onChangeText={setUrl}
      />
      <TouchableOpacity style={[styles.badge, { backgroundColor: color(result.severity) }]}>
        <Text style={styles.badgeText}>{result.severity}</Text>
      </TouchableOpacity>
      {result.reasons.map((r) => (
        <Text key={r} style={styles.reason}>- {r}</Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#0f172a', borderRadius: 12, padding: 14, marginBottom: 12 },
  title: { color: '#e2e8f0', fontWeight: '700', marginBottom: 10 },
  input: {
    width: '100%',
    backgroundColor: '#1e293b',
    color: '#fff',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#334155',
  },
  badge: { marginTop: 10, alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  reason: { color: '#cbd5e1', fontSize: 12, marginTop: 6 },
});

