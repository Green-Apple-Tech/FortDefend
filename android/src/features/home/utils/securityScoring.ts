import { CHECK_STATUS, OVERALL_STATUS } from '../types';

const WEIGHTS = {
  critical: 20,
  warning: 10,
};

export function calculateSecurityScore(checks = []) {
  let score = 100;

  for (const check of checks) {
    if (check?.status === CHECK_STATUS.RISK) score -= WEIGHTS.critical;
    if (check?.status === CHECK_STATUS.WARN) score -= WEIGHTS.warning;
  }

  return Math.max(0, Math.min(100, score));
}

export function scoreToStatus(score) {
  if (score >= 80) return OVERALL_STATUS.GOOD;
  if (score >= 50) return OVERALL_STATUS.NEEDS_ATTENTION;
  return OVERALL_STATUS.HIGH_RISK;
}

