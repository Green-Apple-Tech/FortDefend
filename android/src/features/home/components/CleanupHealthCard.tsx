import { View, Text, StyleSheet } from 'react-native';

function tone(status) {
  if (status === 'risk') return '#ef4444';
  if (status === 'warn') return '#f59e0b';
  if (status === 'ok') return '#10b981';
  return '#94a3b8';
}

export default function CleanupHealthCard({ checks }) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>Cleanup & Health</Text>
      {checks.map((check) => (
        <View key={check.id} style={styles.row}>
          <View style={[styles.dot, { backgroundColor: tone(check.status) }]} />
          <View style={styles.content}>
            <Text style={styles.name}>{check.title}</Text>
            <Text style={styles.value}>{check.value}</Text>
            <Text style={styles.reco}>{check.recommendation}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#0f172a', borderRadius: 12, padding: 14, marginBottom: 12 },
  title: { color: '#e2e8f0', fontWeight: '700', marginBottom: 10 },
  row: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  dot: { width: 9, height: 9, borderRadius: 999, marginTop: 6 },
  content: { flex: 1 },
  name: { color: '#fff', fontWeight: '600' },
  value: { color: '#cbd5e1', fontSize: 12, marginTop: 2 },
  reco: { color: '#94a3b8', fontSize: 12, marginTop: 2 },
});

