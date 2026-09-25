import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseHashView,
  formatHash,
  VALID_HASH_VIEWS
} from '../../viewer/src/hash-view.ts';

test('hash-view: parses valid hash views with or without hash prefix', () => {
  assert.equal(parseHashView('#overview'), 'overview');
  assert.equal(parseHashView('#history'), 'history');
  assert.equal(parseHashView('#configuration'), 'configuration');
  assert.equal(parseHashView('#evaluations'), 'evaluations');

  assert.equal(parseHashView('overview'), 'overview');
  assert.equal(parseHashView('history'), 'history');
  assert.equal(parseHashView('configuration'), 'configuration');
  assert.equal(parseHashView('evaluations'), 'evaluations');
});

test('hash-view: normalizes invalid, empty, or whitespace hashes to overview', () => {
  assert.equal(parseHashView(''), 'overview');
  assert.equal(parseHashView('#'), 'overview');
  assert.equal(parseHashView(null), 'overview');
  assert.equal(parseHashView(undefined), 'overview');
  assert.equal(parseHashView('   '), 'overview');
  assert.equal(parseHashView('#unknown-route'), 'overview');
  assert.equal(parseHashView('#invalid'), 'overview');
  assert.equal(parseHashView('random-string'), 'overview');
});

test('hash-view: case insensitive hash normalization', () => {
  assert.equal(parseHashView('#OVERVIEW'), 'overview');
  assert.equal(parseHashView('#History'), 'history');
  assert.equal(parseHashView('#Configuration'), 'configuration');
  assert.equal(parseHashView('#EVALUATIONS'), 'evaluations');
});

test('hash-view: formatHash produces exact #view string', () => {
  assert.equal(formatHash('overview'), '#overview');
  assert.equal(formatHash('history'), '#history');
  assert.equal(formatHash('configuration'), '#configuration');
  assert.equal(formatHash('evaluations'), '#evaluations');
});

test('hash-view: VALID_HASH_VIEWS contains exact 4 views in order', () => {
  assert.deepEqual(VALID_HASH_VIEWS, ['overview', 'history', 'configuration', 'evaluations']);
});
