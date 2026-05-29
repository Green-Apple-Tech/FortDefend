import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const formatDateTime = (isoString) => {
  if (!isoString) {
    return 'Pending first heartbeat';
  }

  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) {
    return 'Pending first heartbeat';
  }

  return date.toLocaleString();
};

const InfoRow = ({ label, value }) => (
  <View style={styles.infoRow}>
    <Text style={styles.infoLabel}>{label}</Text>
    <Text style={styles.infoValue}>{value}</Text>
  </View>
);

export default function StatusScreen({
  deviceProfile,
  isConnected,
  lastHeartbeat,
  agentError,
  onUnenroll,
}) {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerIcon}>🛡️</Text>
        <Text style={styles.headerTitle}>FortDefend Agent</Text>
      </View>

      <View style={[styles.badge, isConnected ? styles.badgeConnected : styles.badgePending]}>
        <Text style={styles.badgeText}>{isConnected ? 'Connected' : 'Connecting...'}</Text>
      </View>

      {agentError ? <Text style={styles.errorText}>Agent error: {agentError}</Text> : null}

      <View style={styles.card}>
        <InfoRow label="Device Name" value={deviceProfile?.deviceName || 'Android Device'} />
        <InfoRow label="Model" value={deviceProfile?.model || 'Unknown'} />
        <InfoRow label="Manufacturer" value={deviceProfile?.manufacturer || 'Unknown'} />
        <InfoRow label="OS Version" value={deviceProfile?.osVersion || 'Unknown'} />
        <InfoRow label="Last Heartbeat" value={formatDateTime(lastHeartbeat)} />
        <InfoRow label="Status" value="Running in background" />
      </View>

      <TouchableOpacity style={styles.settingsButton} onPress={onUnenroll}>
        <Text style={styles.settingsButtonText}>Unenroll Device</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 36,
    backgroundColor: '#0F172A',
  },
  header: {
    alignItems: 'center',
    marginBottom: 16,
  },
  headerIcon: {
    fontSize: 34,
  },
  headerTitle: {
    marginTop: 10,
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '700',
  },
  badge: {
    alignSelf: 'center',
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 14,
    marginBottom: 18,
  },
  badgeConnected: {
    backgroundColor: '#16A34A',
  },
  badgePending: {
    backgroundColor: '#475569',
  },
  badgeText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 12,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#334155',
    backgroundColor: '#1E293B',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  infoRow: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  infoLabel: {
    color: '#94A3B8',
    fontSize: 12,
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  infoValue: {
    color: '#FFFFFF',
    fontSize: 16,
  },
  settingsButton: {
    marginTop: 26,
    borderRadius: 12,
    backgroundColor: '#DC2626',
    paddingVertical: 14,
    alignItems: 'center',
  },
  settingsButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  errorText: {
    color: '#FCA5A5',
    marginBottom: 14,
    textAlign: 'center',
    fontSize: 12,
  },
});
