import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateSecurityScore, scoreToStatus } from './securityScoring';

test('subtracts warning and risk weights', () => {
  const score = calculateSecurityScore([
    { status: 'ok' },
    { status: 'warn' },
    { status: 'risk' },
  ]);
  assert.equal(score, 70);
});

test('maps score thresholds', () => {
  assert.equal(scoreToStatus(90), 'Good');
  assert.equal(scoreToStatus(70), 'Needs Attention');
  assert.equal(scoreToStatus(30), 'High Risk');
});

