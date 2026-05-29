import { analyzeUrlRisk } from '../utils/urlRisk';

export function scanUrlLocally(url) {
  return analyzeUrlRisk(url);
}

// TODO(phase-2): add backend proxy route for Google Safe Browsing lookup
// and call it here when privacy/compliance flow is finalized.
export async function scanUrlWithBackend(_url) {
  return null;
}

