import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import {
  validateCheckpointV2 as esmValidateCheckpoint,
  validateHistoryExecutionV1 as esmValidateExecution,
  validateHistoryOutcomeV1 as esmValidateOutcome
} from '../../dist/protocol/advisor-contract-runtime.js';
import {
  calculateHistoryMetrics as esmCalculateMetrics,
  normalizeHistoryRecord as esmNormalizeRecord
} from '../../dist/protocol/advisor-metrics.js';

const require = createRequire(import.meta.url);
const cjsContracts = require('../../.evcrate/source/.evcrate/bin/lib/advisor/contracts-v2.cjs');
const cjsPolicy = require('../../.evcrate/source/.evcrate/bin/lib/advisor/policy-schema.cjs');
const genRuntime = require('../../.evcrate/source/.evcrate/bin/lib/advisor/generated/advisor-contract-runtime.js');
const genMetrics = require('../../.evcrate/source/.evcrate/bin/lib/advisor/generated/advisor-metrics.js');

const EXPECTED_CONTRACTS_V2_KEYS = [
  'ATTEMPT_PHASES', 'ATTEMPT_SLOTS', 'AUDIT_STATUSES', 'BACKUP_ATTEMPTS_LIMIT',
  'CHECKPOINT_PROTOCOL_V2', 'CHECKPOINT_VERSION_V2', 'CLEANUP_OUTCOMES',
  'CONTROLLER_PROTOCOL_V2', 'CONTROLLER_VERSION_V2', 'DECISION_KINDS',
  'EXECUTION_STATUSES', 'GATE_STATUSES', 'HISTORY_PROTOCOL_V1', 'HISTORY_VERSION_V1',
  'MAX_CHANGED_PATHS', 'MAX_CORRECTION_CYCLES', 'MAX_ENVELOPE_BYTES', 'MAX_EVIDENCE_FILES',
  'MAX_EVIDENCE_TEXT_BYTES', 'MAX_EXECUTION_HISTORY_BYTES', 'MAX_MODEL_ATTEMPTS',
  'MAX_OUTCOME_HISTORY_BYTES', 'MAX_QUESTION_BYTES', 'MAX_RESULT_BODY_BYTES',
  'MAX_STATE_BYTES', 'MAX_TASK_BYTES', 'MAX_TOTAL_ATTEMPT_SUMMARIES', 'OUTCOME_RESULTS',
  'PRIMARY_RETRY_SCHEDULE_MS', 'RESULT_PROTOCOL_V2', 'RESULT_VERSION_V2', 'SENSITIVE_PATTERN',
  'STATE_PROTOCOL_V1', 'STATE_VERSION_V1', 'TERMINAL_CLASSIFICATIONS',
  'computeCheckpointDigestV2', 'deepFreeze', 'parseAdviceBody', 'validateArtifactRef',
  'validateAttemptOutcome', 'validateCheckpointV2', 'validateEnvelopeV2',
  'validateHistoryExecutionV1', 'validateHistoryOutcomeV1', 'validateNonNegativeSafeInteger',
  'validateReceiptV2', 'validateResultBodyV2', 'validateResultV2', 'validateSanitizedError',
  'validateTaskStateV1', 'validateValidationResult'
];

const EXPECTED_POLICY_SCHEMA_KEYS = [
  'ADVISOR_KEYS_V2', 'BACKENDS', 'CANDIDATE_BACKENDS', 'ENABLED_BACKENDS',
  'HISTORY_KEYS_V2', 'MAX_EFFORT_BYTES', 'MAX_HISTORY_BYTES', 'MAX_MODEL_BYTES',
  'MAX_POLICY_BYTES', 'MAX_RETENTION_DAYS', 'MAX_TIMEOUT_MS', 'MAX_WARN_MS',
  'MIN_HISTORY_BYTES', 'MIN_RETENTION_DAYS', 'MIN_TIMEOUT_MS', 'MIN_WARN_MS',
  'POLICY_KEYS', 'POLICY_KEYS_V1', 'POLICY_KEYS_V2', 'ROUTE_KEYS_V2',
  'TARGET_KEYS', 'TARGET_KEYS_V1', 'WAIT_KEYS_V2', 'decodeUtf8', 'deepFreeze',
  'inspectPolicy', 'parseJsonDocument', 'proposeMigration', 'validateHistory',
  'validateLegacyPolicy', 'validatePolicy', 'validateRouteTarget', 'validateTarget', 'validateWait'
];

test('CJS adapters freeze exact expected export surfaces', () => {
  assert.deepEqual(Object.keys(cjsContracts).sort(), EXPECTED_CONTRACTS_V2_KEYS.sort());
  assert.deepEqual(Object.keys(cjsPolicy).sort(), EXPECTED_POLICY_SCHEMA_KEYS.sort());
});

test('generated CJS directory contains exactly four files with relative requires only', () => {
  const genDir = new URL('../../.evcrate/source/.evcrate/bin/lib/advisor/generated/', import.meta.url);
  const files = readdirSync(genDir).sort();
  assert.deepEqual(files, [
    'advisor-contract-runtime.js',
    'advisor-metrics.js',
    'canonical-json.js',
    'json.js'
  ]);

  for (const file of files) {
    const content = readFileSync(new URL(file, genDir), 'utf8');
    const requireMatches = [...content.matchAll(/require\(['"]([^'"]+)['"]\)/g)].map(m => m[1]);
    for (const req of requireMatches) {
      assert.ok(req.startsWith('./'), `Generated file ${file} has non-relative require: ${req}`);
      assert.ok(!req.includes('node_modules'), `Generated file ${file} references node_modules: ${req}`);
      assert.ok(!req.includes('dist/'), `Generated file ${file} references dist: ${req}`);
    }
  }
});

test('golden non-lexicographical checkpoint produces identical digest across Node and Web Crypto', async () => {
  const goldenRaw = readFileSync(
    new URL('../fixtures/advisor-history/golden-digest-checkpoint.json', import.meta.url),
    'utf8'
  );
  const goldenCheckpoint = JSON.parse(goldenRaw);

  // 1. ESM validate + Node createHash
  const esmValidated = esmValidateCheckpoint(goldenCheckpoint);
  const esmBytes = Buffer.from(JSON.stringify(esmValidated), 'utf8');
  const esmDigest = createHash('sha256').update(esmBytes).digest('hex');

  // 2. CJS adapter computeCheckpointDigestV2
  const cjsDigest = cjsContracts.computeCheckpointDigestV2(goldenCheckpoint);

  // 3. Web Crypto SubtleCrypto
  const subtleBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(esmValidated)));
  const subtleHex = Array.from(new Uint8Array(subtleBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');

  assert.equal(cjsDigest, esmDigest, 'CJS adapter digest must match ESM Node digest');
  assert.equal(subtleHex, esmDigest, 'Web Crypto subtle digest must match Node digest');
  assert.equal(cjsDigest.length, 64);
  assert.equal(/^[0-9a-f]{64}$/.test(cjsDigest), true);

  // Verify non-lexicographical property order was preserved:
  // First serialized key in JSON.stringify must be "version", NOT "checkpoint" or "evidence"
  const stringified = JSON.stringify(esmValidated);
  assert.ok(stringified.startsWith('{"version":2,'), 'Original key order must be preserved, not sorted canonical JSON');
});

test('ESM and generated CJS produce deeply equal normalized records and metrics', () => {
  const goldenRaw = readFileSync(
    new URL('../fixtures/advisor-history/golden-digest-checkpoint.json', import.meta.url),
    'utf8'
  );
  const goldenCheckpoint = JSON.parse(goldenRaw);
  const digest = cjsContracts.computeCheckpointDigestV2(goldenCheckpoint);

  const rawExecution = {
    schema_version: 1,
    consultation_id: '01234567-89ab-4cde-8f01-23456789ef01',
    task_run_id: goldenCheckpoint.task_run_id,
    project_id: '1'.repeat(64),
    checkpoint_digest: digest,
    checkpoint: goldenCheckpoint,
    route: { backend: 'codex', model: 'gpt-5.6-sol', effort: 'high' },
    receipt: {
      backend: 'codex', model: 'gpt-5.6-sol', effort: 'high', controller_version: 2,
      adapter_version: '0.1.0', build_identity: 'build-v2', elapsed_ms: 1200
    },
    prompt_identity: 'prompt-v2',
    build_identity: 'build-v2',
    attempts: [{
      attempt_id: 'att-1', slot: 'primary', route: { backend: 'codex', model: 'gpt-5.6-sol', effort: 'high' },
      phase: 'model', model_started: true, elapsed_ms: 1200, terminal_classification: 'success',
      retry_delay_ms: null, cleanup_outcome: 'confirmed'
    }],
    status: 'ADVICE_READY',
    result: {
      protocol: 'evcrate-advisor-result', version: 2, checkpoint: goldenCheckpoint.checkpoint, status: 'ADVICE_READY',
      recommendation: 'Pass', rationale: 'All invariants hold', must_fix: [], cautions: [], assumptions: [],
      success_checks: [], unresolved_questions: []
    },
    error: null,
    started_at: 1000,
    completed_at: 2200
  };

  const rawOutcome = {
    schema_version: 1,
    consultation_id: '01234567-89ab-4cde-8f01-23456789ef01',
    task_run_id: goldenCheckpoint.task_run_id,
    project_id: '1'.repeat(64),
    disposition: { action: 'accept', rationale: 'Approved counsel' },
    evidence_revision: 1,
    actual_changed_paths: ['src/protocol/advisor-metrics.ts'],
    validation: { suite: 'protocol', command: 'npm test', status: 'passed', passed: 1, failed: 0, details: null },
    outcome: 'resolved',
    correction_number: 1,
    recorded_at: 3000
  };

  const esmNorm = esmNormalizeRecord(rawExecution, rawOutcome, { kind: 'controller', relative_path: 'p1/t1/c1' });
  const cjsNorm = genMetrics.normalizeHistoryRecord(rawExecution, rawOutcome, { kind: 'controller', relative_path: 'p1/t1/c1' });
  assert.deepEqual(esmNorm, cjsNorm);
  assert.equal(Object.isFrozen(esmNorm), true);
  assert.equal(Object.isFrozen(cjsNorm), true);

  const esmMetrics = esmCalculateMetrics({ records: [esmNorm], generated_at: 5000 });
  const cjsMetrics = genMetrics.calculateHistoryMetrics({ records: [cjsNorm], generated_at: 5000 });
  assert.deepEqual(esmMetrics, cjsMetrics);
});
