import { useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

const API_BASE_URL = 'https://app.fortdefend.com';

const verifyOrgToken = async (token) => {
  const response = await fetch(
    `${API_BASE_URL}/api/enrollment/verify-token?token=${encodeURIComponent(token)}`
  );

  if (!response.ok) {
    throw new Error('Invalid or expired token');
  }

  return response.json().catch(() => ({}));
};

export default function EnrollmentScreen({ onEnrolled }) {
  const [orgToken, setOrgToken] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleEnroll = async () => {
    const token = orgToken.trim();
    if (!token) {
      setError('Enter your organization token.');
      return;
    }

    setError('');
    setLoading(true);

    try {
      await verifyOrgToken(token);
      await onEnrolled(token);
    } catch (_e) {
      setError('Token verification failed. Please check your token.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.logoCircle}>
        <Text style={styles.logoIcon}>🛡️</Text>
      </View>
      <Text style={styles.title}>FortDefend</Text>
      <Text style={styles.subtitle}>Android Device Agent Enrollment</Text>

      <TextInput
        autoCapitalize="none"
        placeholder="Organization token"
        placeholderTextColor="#94A3B8"
        value={orgToken}
        onChangeText={setOrgToken}
        style={styles.input}
      />

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <TouchableOpacity
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={handleEnroll}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={styles.buttonText}>Enroll Device</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  logoCircle: {
    width: 82,
    height: 82,
    borderRadius: 41,
    backgroundColor: '#1E3A8A',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 16,
  },
  logoIcon: {
    fontSize: 36,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 30,
    fontWeight: '700',
    textAlign: 'center',
  },
  subtitle: {
    color: '#94A3B8',
    marginTop: 6,
    marginBottom: 26,
    textAlign: 'center',
    fontSize: 14,
  },
  input: {
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#334155',
    color: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  errorText: {
    marginTop: 12,
    color: '#F87171',
    fontSize: 13,
  },
  button: {
    marginTop: 18,
    backgroundColor: '#2563EB',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
