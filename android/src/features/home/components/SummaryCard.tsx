import { View, Text, StyleSheet } from 'react-native';

export default function SummaryCard({ score, status, bullets, lastScannedAt }) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>Home Security Summary</Text>
      <Text style={styles.score}>{score}/100</Text>
      <Text style={styles.status}>{status}</Text>
      <Text style={styles.time}>
        Last scanned: {lastScannedAt ? new Date(lastScannedAt).toLocaleString() : 'Not scanned yet'}
      </Text>
      <View style={styles.list}>
        {bullets.map((line) => (
          <Text key={line} style={styles.bullet}>- {line}</Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#111827', borderRadius: 12, padding: 14, marginBottom: 12 },
  title: { color: '#e2e8f0', fontSize: 14, fontWeight: '700' },
  score: { color: '#fff', fontSize: 28, fontWeight: '800', marginTop: 6 },
  status: { color: '#93c5fd', fontSize: 14, fontWeight: '700', marginTop: 2 },
  time: { color: '#94a3b8', marginTop: 6, fontSize: 12 },
  list: { marginTop: 8, gap: 4 },
  bullet: { color: '#e2e8f0', fontSize: 13, lineHeight: 18 },
});

