import { useCallback, useMemo, useState } from 'react';
import { collectSecurityChecks } from '../services/deviceSecurityService';
import { collectHealthChecks } from '../services/deviceHealthService';
import { calculateSecurityScore, scoreToStatus } from '../utils/securityScoring';
import { buildSummary } from '../utils/summaryBuilder';

export function useHomeSecurity() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [lastScannedAt, setLastScannedAt] = useState(null);
  const [securityChecks, setSecurityChecks] = useState([]);
  const [healthChecks, setHealthChecks] = useState([]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [security, health] = await Promise.all([
        collectSecurityChecks(),
        collectHealthChecks(),
      ]);
      setSecurityChecks(security);
      setHealthChecks(health);
      setLastScannedAt(new Date().toISOString());
    } catch (e) {
      setError(e?.message || 'Failed to run security checks');
    } finally {
      setLoading(false);
    }
  }, []);

  const score = useMemo(
    () => calculateSecurityScore([...securityChecks, ...healthChecks]),
    [securityChecks, healthChecks],
  );
  const status = useMemo(() => scoreToStatus(score), [score]);
  const summary = useMemo(
    () => buildSummary({ score, status, checks: [...securityChecks, ...healthChecks] }),
    [score, status, securityChecks, healthChecks],
  );

  return {
    loading,
    error,
    score,
    status,
    summary,
    lastScannedAt,
    securityChecks,
    healthChecks,
    refresh,
  };
}

