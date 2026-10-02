/**
 * @file advisor-domain-parity.test.mjs
 * Domain parity tests for EVCrate Advisor.
 *
 * Verifies exact path identity, golden checkpoint digest parity across Node/CJS/WebCrypto,
 * metric calculation schema parity, and evaluation digest/provenance parity.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash, webcrypto } from 'node:crypto';
import { createRequire } from 'node:module';
import {
  validateCheckpointV2,
} from '../../dist/protocol/advisor-contract-runtime.js';
import {
  calculateHistoryMetrics,
  normalizeHistoryRecord,
} from '../../dist/protocol/advisor-metrics.js';
import {
  validateHistorySummaryResult,
  validateEvaluationsCompareResult,
} from '../../dist/protocol/advisor-data-api.js';
import {
  validateEvaluationDocument,
} from '../../dist/protocol/advisor-evaluation-validation.js';
import {
  canonicalJson,
} from '../../dist/protocol/canonical-json.js';

const require = createRequire(import.meta.url);
const cjsContracts = require('../../.evcrate/source/.evcrate/bin/lib/advisor/contracts-v2.cjs');

const pathFixtures = JSON.parse(
  readFileSync(new URL('../fixtures/advisor-plugin/domain-v1/path-identity-fixtures.json', import.meta.url), 'utf8')
);

const goldenFixtures = JSON.parse(
  readFileSync(new URL('../fixtures/advisor-plugin/domain-v1/golden-checkpoint-digest-fixtures.json', import.meta.url), 'utf8')
);

const validMixedEval = JSON.parse(
  readFileSync(new URL('../fixtures/advisor-evaluations/valid-mixed.json', import.meta.url), 'utf8')
);

function normalizeAndValidatePath(value) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.includes('\0')
    || value.split('/').some((part) => part === '.' || part === '..')) {
    throw new Error('PATH_REJECTED');
  }
  return value;
}

test('Exact path identity and worktree separation parity', () => {
  for (const root of pathFixtures.valid_roots) {
    const normalized = normalizeAndValidatePath(root.input_path);
    assert.equal(normalized, root.expected_normalized);
    const digest = createHash('sha256').update(normalized, 'utf8').digest('hex');
    assert.equal(digest, root.expected_sha256);
  }

  for (const inv of pathFixtures.invalid_paths) {
    assert.throws(
      () => normalizeAndValidatePath(inv.input_path),
      /PATH_REJECTED/,
      `Expected rejection for invalid path: ${inv.description}`
    );
  }

  // Worktree separation invariant
  const parentId = createHash('sha256')
    .update(pathFixtures.worktree_separation_invariants.parent_path, 'utf8')
    .digest('hex');
  const worktreeId = createHash('sha256')
    .update(pathFixtures.worktree_separation_invariants.worktree_path, 'utf8')
    .digest('hex');
  assert.notEqual(parentId, worktreeId, 'Worktree must have distinct project ID from parent');
});

test('Golden checkpoint digest parity across TS ESM, generated CJS, and WebCrypto', async () => {
  const golden = goldenFixtures.golden_checkpoint;
  const expectedDigest = goldenFixtures.expected_sha256;

  // 1. ESM validateCheckpointV2 + JSON.stringify + createHash
  const validated = validateCheckpointV2(golden);
  const serialized = JSON.stringify(validated);
  assert.ok(serialized.startsWith('{"version":2,'), 'Key order must preserve version first');
  const esmDigest = createHash('sha256').update(Buffer.from(serialized, 'utf8')).digest('hex');
  assert.equal(esmDigest, expectedDigest);

  // 2. CJS computeCheckpointDigestV2
  const cjsDigest = cjsContracts.computeCheckpointDigestV2(golden);
  assert.equal(cjsDigest, expectedDigest, 'CJS digest must match golden expected digest');

  // 3. Web Crypto SubtleCrypto
  const subtleBuffer = await webcrypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(serialized)
  );
  const subtleHex = Array.from(new Uint8Array(subtleBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  assert.equal(subtleHex, expectedDigest, 'WebCrypto digest must match golden expected digest');

  // 4. Tampered checkpoint rejection
  const tampered = goldenFixtures.tampered_checkpoint;
  const tamperedValidated = validateCheckpointV2(tampered);
  const tamperedDigest = createHash('sha256')
    .update(Buffer.from(JSON.stringify(tamperedValidated), 'utf8'))
    .digest('hex');
  assert.notEqual(tamperedDigest, expectedDigest, 'Tampered checkpoint must produce different digest');
});

test('Metric calculation result conforms to plugin data API schema with zero denominators', () => {
  const scan = {
    status: 'complete',
    projects_discovered: 1,
    tasks_discovered: 1,
    consultations_discovered: 0,
    accepted_records: 0,
    invalid_records: 0,
    bytes_discovered: 0,
    bytes_read: 0,
    diagnostics: [],
    suppressed_diagnostics: 0,
    limit_hit: false
  };

  const emptyMetrics = calculateHistoryMetrics({
    scope: { kind: 'project', project_ids: ['proj-1'], selected_project_id: 'proj-1' },
    records: [],
    scan,
    totalRecords: 0
  });

  // Check zero denominator behavior: values should be null
  assert.equal(emptyMetrics.metrics.delivery.value, null);
  assert.equal(emptyMetrics.metrics.delivery.denominator, 0);
  assert.equal(emptyMetrics.metrics.outcome_coverage.value, null);
  assert.equal(emptyMetrics.metrics.outcome_coverage.denominator, 0);
  assert.equal(emptyMetrics.metrics.latency.p95, null);
  assert.equal(emptyMetrics.metrics.latency.sample_count, 0);

  // Validate that empty metrics conform to HistorySummaryResult schema
  const validatedSummary = validateHistorySummaryResult({
    state: 'fresh',
    snapshot_id: 'snap-empty-001',
    metrics: emptyMetrics
  });
  assert.equal(validatedSummary.state, 'fresh');
  assert.equal(validatedSummary.metrics.metric_definition_version, 1);
});

test('Evaluation document validation and canonical JSON hashing parity', () => {
  const sha256 = (str) => createHash('sha256').update(str).digest('hex');
  const validatedDoc = validateEvaluationDocument(validMixedEval, { digestFn: sha256 });
  assert.equal(validatedDoc.protocol, 'evcrate-advisor-counsel-evaluation');
  assert.equal(validatedDoc.version, 1);

  // Verify rubric canonical JSON hash
  const canonicalRubric = canonicalJson(validatedDoc.rubric);
  const rubricDigest = sha256(canonicalRubric);
  assert.equal(rubricDigest, validatedDoc.rubric_digest);

  // Verify case input canonical JSON hash
  for (const cs of validatedDoc.cases) {
    const canonicalInput = canonicalJson(cs.input);
    const inputDigest = sha256(canonicalInput);
    assert.equal(inputDigest, cs.input_digest);
  }

  // Validate EvaluationsCompareResult schema conformity
  const compareResult = validateEvaluationsCompareResult({
    status: 'ready',
    source_revisions: [
      { evaluation_ref: 'eval-ref-001', observed_revision: 'rev-01' }
    ],
    groups: [],
    next_cursor: null,
    returned_bytes: 256
  });
  assert.equal(compareResult.status, 'ready');
});
