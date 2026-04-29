import { CHECK_STATUS } from '../types';

function statusLabel(status) {
  if (status === CHECK_STATUS.RISK) return 'High risk';
  if (status === CHECK_STATUS.WARN) return 'Needs attention';
  if (status === CHECK_STATUS.UNAVAILABLE) return 'Unavailable';
  return 'Good';
}

export function buildSummary({ score, status, checks = [] }) {
  const risky = checks.filter((c) => c.status === CHECK_STATUS.RISK);
  const warn = checks.filter((c) => c.status === CHECK_STATUS.WARN);
  const unavailable = checks.filter((c) => c.status === CHECK_STATUS.UNAVAILABLE);

  const bullets = [];
  if (risky.length) bullets.push(`${risky.length} critical security item(s) need immediate action.`);
  if (warn.length) bullets.push(`${warn.length} item(s) should be reviewed soon.`);

  for (const check of [...risky, ...warn].slice(0, 3)) {
    bullets.push(`${check.title}: ${check.recommendation || statusLabel(check.status)}.`);
  }

  if (!bullets.length) bullets.push('No critical issues found in Phase 1 checks.');
  if (unavailable.length) bullets.push(`${unavailable.length} checks are unavailable on this device/version.`);

  return {
    headline: `Security score ${score}/100 - ${status}`,
    bullets: bullets.slice(0, 5),
  };
}

