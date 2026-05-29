const SUSPICIOUS_KEYWORDS = [
  'verify',
  'urgent',
  'wallet',
  'crypto',
  'gift-card',
  'signin',
  'security-check',
  'login-now',
  'bank',
];

function isIpHost(hostname) {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname);
}

export function analyzeUrlRisk(input) {
  const url = String(input || '').trim();
  if (!url) return { severity: 'Safe', reasons: ['Enter a URL to scan.'] };

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return { severity: 'High Risk', reasons: ['URL format is invalid.'] };
  }

  const reasons = [];
  const host = parsed.hostname.toLowerCase();

  if (!url.startsWith('https://')) reasons.push('Connection is not HTTPS.');
  if (host.includes('xn--')) reasons.push('Punycode domain detected.');
  if (isIpHost(host)) reasons.push('Domain uses direct IP address.');
  if (host.split('.').length > 4) reasons.push('Excessive subdomains can indicate phishing.');
  if (SUSPICIOUS_KEYWORDS.some((k) => url.toLowerCase().includes(k))) {
    reasons.push('Suspicious keyword pattern in URL.');
  }

  if (reasons.length >= 3) return { severity: 'High Risk', reasons };
  if (reasons.length >= 1) return { severity: 'Suspicious', reasons };
  return { severity: 'Safe', reasons: ['No obvious phishing indicators found.'] };
}

