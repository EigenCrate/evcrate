import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseHashView,
  formatHash,
  VALID_HASH_VIEWS,
  getNextRovingHashView
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

test('hash-view: roving tab navigation with ArrowRight/ArrowDown advances and wraps', () => {
  assert.equal(getNextRovingHashView('overview', 'ArrowRight'), 'history');
  assert.equal(getNextRovingHashView('history', 'ArrowRight'), 'configuration');
  assert.equal(getNextRovingHashView('configuration', 'ArrowRight'), 'evaluations');
  assert.equal(getNextRovingHashView('evaluations', 'ArrowRight'), 'overview');

  assert.equal(getNextRovingHashView('overview', 'ArrowDown'), 'history');
  assert.equal(getNextRovingHashView('evaluations', 'ArrowDown'), 'overview');
});

test('hash-view: roving tab navigation with ArrowLeft/ArrowUp retreats and wraps', () => {
  assert.equal(getNextRovingHashView('overview', 'ArrowLeft'), 'evaluations');
  assert.equal(getNextRovingHashView('evaluations', 'ArrowLeft'), 'configuration');
  assert.equal(getNextRovingHashView('configuration', 'ArrowLeft'), 'history');
  assert.equal(getNextRovingHashView('history', 'ArrowLeft'), 'overview');

  assert.equal(getNextRovingHashView('overview', 'ArrowUp'), 'evaluations');
});

test('hash-view: roving tab navigation with Home and End jumps to boundaries', () => {
  assert.equal(getNextRovingHashView('evaluations', 'Home'), 'overview');
  assert.equal(getNextRovingHashView('history', 'Home'), 'overview');

  assert.equal(getNextRovingHashView('overview', 'End'), 'evaluations');
  assert.equal(getNextRovingHashView('configuration', 'End'), 'evaluations');
});

test('hash-view: invariant: Escape key is never trapped by tab navigation', () => {
  assert.equal(getNextRovingHashView('overview', 'Escape'), null);
  assert.equal(getNextRovingHashView('history', 'Escape'), null);
  assert.equal(getNextRovingHashView('configuration', 'Escape'), null);
  assert.equal(getNextRovingHashView('evaluations', 'Escape'), null);
});

test('hash-view: arbitrary keys return null', () => {
  assert.equal(getNextRovingHashView('overview', 'Tab'), null);
  assert.equal(getNextRovingHashView('overview', 'Enter'), null);
  assert.equal(getNextRovingHashView('overview', 'a'), null);
});
