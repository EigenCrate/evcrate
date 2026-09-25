import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { aggregateEvaluationGroups } from '../../dist/protocol/advisor-evaluation-comparison.js';

const fixDir = path.resolve('tests/fixtures/advisor-evaluations');
const validMixed = JSON.parse(fs.readFileSync(path.join(fixDir, 'valid-mixed.json'), 'utf8'));

test('comparable-evaluations: groups documents by exact rubric and input digests', () => {
  const groups = aggregateEvaluationGroups([validMixed]);
  assert.equal(groups.length, 2);

  for (const g of groups) {
    assert.equal(g.rubric_digest, validMixed.rubric_digest);
    assert.equal(g.cases.length, 1);
    assert.equal(g.responses.length, 2);
  }
});

test('comparable-evaluations: separates human and automated scores by provenance', () => {
  const groups = aggregateEvaluationGroups([validMixed]);
  assert.equal(groups.length, 2);

  // Group 0 (Case 1): Human scores
  const g0 = groups[0];
  assert.equal(g0.human_scores.length, 2);
  assert.equal(g0.automated_scores.length, 0);
  assert.equal(g0.human_scores[0].provenance, 'human');
  assert.equal(g0.human_scores[0].average_score, 4.4);
  assert.equal(g0.human_scores[1].provenance, 'human');
  assert.equal(g0.human_scores[1].average_score, null);
  assert.equal(g0.human_scores[1].partial_score_count, 1);

  // Group 1 (Case 2): Automated scores
  const g1 = groups[1];
  assert.equal(g1.human_scores.length, 0);
  assert.equal(g1.automated_scores.length, 1);
  assert.equal(g1.automated_scores[0].provenance, 'automated');
  assert.equal(g1.automated_scores[0].average_score, 1);
});

test('comparable-evaluations: returns empty groups when documents list is empty', () => {
  const groups = aggregateEvaluationGroups([]);
  assert.deepEqual(groups, []);
});
