import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSummary } from './summaryBuilder';

test('creates plain english bullets with priority items', () => {
  const out = buildSummary({
    score: 60,
    status: 'Needs Attention',
    checks: [
      { title: 'Storage', status: 'risk', recommendation: 'Free up space' },
      { title: 'Battery', status: 'warn', recommendation: 'Charge soon' },
    ],
  });
  assert.match(out.headline, /60\/100/);
  assert.ok(out.bullets.length > 0);
});

