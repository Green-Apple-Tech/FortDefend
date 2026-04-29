import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeUrlRisk } from './urlRisk';

test('flags obvious suspicious urls', () => {
  const out = analyzeUrlRisk('http://127.0.0.1/login-now');
  assert.notEqual(out.severity, 'Safe');
  assert.ok(out.reasons.length > 0);
});

test('marks normal https urls safe', () => {
  const out = analyzeUrlRisk('https://fortdefend.com');
  assert.equal(out.severity, 'Safe');
});

