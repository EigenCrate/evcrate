import test from 'node:test';
import assert from 'node:assert/strict';
import { formatRatioPercent } from '../../viewer/src/app-state.ts';

test('metric-ratio-format: returns Unavailable for null and undefined', () => {
  assert.equal(formatRatioPercent(null), 'Unavailable');
  assert.equal(formatRatioPercent(undefined), 'Unavailable');
});

test('metric-ratio-format: formats 0 as 0.0%', () => {
  assert.equal(formatRatioPercent(0), '0.0%');
});

test('metric-ratio-format: formats fractional rates to 1 decimal place', () => {
  assert.equal(formatRatioPercent(0.1234), '12.3%');
  assert.equal(formatRatioPercent(0.8567), '85.7%');
  assert.equal(formatRatioPercent(0.999), '99.9%');
  assert.equal(formatRatioPercent(1.0), '100.0%');
});
