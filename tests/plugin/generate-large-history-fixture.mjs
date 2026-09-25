// Seeded deterministic 10,000-consultation history generator for E05 / G4 qualification.
// Generates valid records plus deterministic outcome, duplicate, and diagnostic cases.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { computeCheckpointDigestV2 } = require('../../plugin/backend/advisor-lib/contracts-v2.cjs');

export function makeRng(seed = 12345) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

const BACKENDS = ['codex', 'omp', 'claude', 'pi'];
const MODELS = ['gpt-5.6-sol', 'gpt-5.6-terra', 'claude-3-5-sonnet', 'deepseek-coder'];
const EFFORTS = ['high', 'medium', 'low'];
const CHECKPOINTS = ['review:step-4', 'direction:step-2', 'decision:step-1'];

export function generateSeedRecord(index, rng, targetProjectId = null, includeInvalidOutcome = false) {
  const pIdx = Math.floor(index / 1000);
  const tIdx = Math.floor((index % 1000) / 100);
  const cIdx = index % 100;

  const projectId = targetProjectId || pIdx.toString(16).padStart(2, '0').repeat(32);
  const taskId = `00000000-0000-4000-8000-${pIdx.toString(16).padStart(2, '0')}${tIdx.toString(16).padStart(2, '0')}00000000`;
  const consultId = `00000000-0000-4000-9000-${pIdx.toString(16).padStart(2, '0')}${tIdx.toString(16).padStart(2, '0')}${cIdx.toString(16).padStart(8, '0')}`;

  const backend = BACKENDS[Math.floor(rng() * BACKENDS.length)];
  const model = MODELS[Math.floor(rng() * MODELS.length)];
  const effort = EFFORTS[Math.floor(rng() * EFFORTS.length)];
  const checkpoint = CHECKPOINTS[Math.floor(rng() * CHECKPOINTS.length)];
  const elapsed = 200 + Math.floor(rng() * 3000);
  const start = 1700000000000 + index * 1000;
  const isFailed = rng() < 0.05;

  const chk = {
    protocol: 'evcrate-advisor-checkpoint',
    version: 2,
    task_run_id: taskId,
    checkpoint_id: `chk-${index}`,
    phase_id: 'phase-09',
    task_revision: 1,
    evidence_revision: 0,
    checkpoint,
    kind: 'review',
    question: `Benchmark evaluation consultation #${index}`,
    task: {
      goal: 'Benchmark',
      non_goals: ['network calls'],
      authorized_paths: ['src/app.ts'],
      scope_rationale: 'Benchmark execution',
      invariants: ['Deterministic execution'],
      success_criteria: ['Pass']
    },
    proposal: { next_action: 'Proceed', rationale: 'Pass', intended_changed_paths: ['src/app.ts'] },
    evidence: { summary: 'Pass', files: [], validation_results: [], artifacts: [] },
    prior: { prior_consultation_id: null, prior_counsel: null, prior_disposition: null, observed_outcome: null }
  };

  const chkDigest = computeCheckpointDigestV2(chk);
  const route = { backend, model, effort };

  const execution = {
    schema_version: 1,
    consultation_id: consultId,
    task_run_id: taskId,
    project_id: projectId,
    checkpoint_digest: chkDigest,
    checkpoint: chk,
    route,
    receipt: {
      backend, model, effort, controller_version: 2, adapter_version: '0.1.0', build_identity: 'build-v2', elapsed_ms: elapsed
    },
    prompt_identity: 'prompt-v2',
    build_identity: 'build-v2',
    attempts: [{
      attempt_id: `att-${index}`, slot: 'primary', route, phase: 'model', model_started: true,
      elapsed_ms: elapsed, terminal_classification: isFailed ? 'fatal' : 'success', retry_delay_ms: null, cleanup_outcome: 'not_needed'
    }],
    status: isFailed ? 'FAILED' : 'ADVICE_READY',
    result: isFailed ? null : {
      protocol: 'evcrate-advisor-result', version: 2, checkpoint, status: 'ADVICE_READY',
      recommendation: 'Advice body', rationale: 'Reasoning', must_fix: [], cautions: [], assumptions: [], success_checks: [], unresolved_questions: []
    },
    error: isFailed ? { code: 'PROCESS_FAILED', category: 'fatal', action: 'stop', message: 'Simulated fatal failure' } : null,
    started_at: start,
    completed_at: start + elapsed
  };

  const forceInvalidOutcome = includeInvalidOutcome && !isFailed && index % 100 === 0;
  const outcomeRoll = isFailed ? null : rng();
  const hasOutcome = !isFailed && (forceInvalidOutcome || (outcomeRoll !== null && outcomeRoll < 0.8));
  const outcome = hasOutcome ? {
    schema_version: 1,
    consultation_id: forceInvalidOutcome ? 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee' : consultId,
    task_run_id: taskId,
    project_id: projectId,
    disposition: { action: 'accept', rationale: 'Accepted advice' },
    evidence_revision: 0,
    actual_changed_paths: ['src/app.ts'],
    validation: { suite: 'test', command: 'npm test', status: 'passed', passed: 1, failed: 0, details: null },
    outcome: 'resolved',
    correction_number: 1,
    recorded_at: start + elapsed + 500
  } : null;

  return { projectId, taskId, consultId, execution, outcome };
}

export async function populateLargeHistoryOnDisk(targetDir, totalCount = 10000, seed = 12345, targetProjectId = null, options = {}) {
  const includeBenchmarkCases = options.includeBenchmarkCases === true;
  const rng = makeRng(seed);
  const hash = crypto.createHash('sha256');
  // Reserve directories for a conflicting duplicate and malformed execution.
  const generatedConsultations = includeBenchmarkCases ? totalCount - 2 : totalCount;
  let totalFiles = 0;
  let totalBytes = 0;
  let validOutcomeRecords = 0;
  let missingOutcomeRecords = 0;
  let invalidOutcomeRecords = 0;

  for (let i = 0; i < generatedConsultations; i++) {
    const record = generateSeedRecord(i, rng, targetProjectId, includeBenchmarkCases);
    const consultDir = path.join(targetDir, record.projectId, record.taskId, record.consultId);
    fs.mkdirSync(consultDir, { recursive: true, mode: 0o700 });

    const execJson = JSON.stringify(record.execution, null, 2);
    const execPath = path.join(consultDir, 'execution.json');
    fs.writeFileSync(execPath, execJson, 'utf8');
    hash.update(`file:${record.consultId}/execution.json:${execJson}`);
    totalFiles++;
    totalBytes += Buffer.byteLength(execJson, 'utf8');

    if (record.outcome) {
      if (record.outcome.consultation_id === record.consultId) validOutcomeRecords++;
      else invalidOutcomeRecords++;
      const outcomeJson = JSON.stringify(record.outcome, null, 2);
      const outcomePath = path.join(consultDir, 'outcome.json');
      fs.writeFileSync(outcomePath, outcomeJson, 'utf8');
      hash.update(`file:${record.consultId}/outcome.json:${outcomeJson}`);
      totalFiles++;
      totalBytes += Buffer.byteLength(outcomeJson, 'utf8');
    } else {
      missingOutcomeRecords++;
    }
  }

  if (includeBenchmarkCases) {
    // The physical path differs, but the execution identity conflicts on timestamps.
    const duplicate = generateSeedRecord(0, makeRng(seed), targetProjectId, true);
    const projectId = targetProjectId ?? duplicate.projectId;
    const duplicatePathConsultationId = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
    const duplicateDir = path.join(targetDir, projectId, duplicate.taskId, duplicatePathConsultationId);
    fs.mkdirSync(duplicateDir, { recursive: true, mode: 0o700 });
    const duplicateExecution = {
      ...duplicate.execution,
      started_at: duplicate.execution.started_at + 1,
      completed_at: duplicate.execution.completed_at === null ? null : duplicate.execution.completed_at + 1
    };
    const duplicateExecutionJson = JSON.stringify(duplicateExecution, null, 2);
    fs.writeFileSync(path.join(duplicateDir, 'execution.json'), duplicateExecutionJson, 'utf8');
    hash.update(`file:${duplicate.taskId}/${duplicatePathConsultationId}/execution.json:${duplicateExecutionJson}`);
    totalFiles++;
    totalBytes += Buffer.byteLength(duplicateExecutionJson, 'utf8');
    if (duplicate.outcome) {
      if (duplicate.outcome.consultation_id === duplicatePathConsultationId) validOutcomeRecords++;
      else invalidOutcomeRecords++;
      const duplicateOutcomeJson = JSON.stringify(duplicate.outcome, null, 2);
      fs.writeFileSync(path.join(duplicateDir, 'outcome.json'), duplicateOutcomeJson, 'utf8');
      hash.update(`file:${duplicate.taskId}/${duplicatePathConsultationId}/outcome.json:${duplicateOutcomeJson}`);
      totalFiles++;
      totalBytes += Buffer.byteLength(duplicateOutcomeJson, 'utf8');
    }

    // This invalid execution adds a deterministic scan diagnostic.
    const diagnosticTaskId = 'ffffffff-ffff-4fff-8fff-eeeeeeeeeeee';
    const diagnosticConsultationId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
    const diagnosticDir = path.join(targetDir, projectId, diagnosticTaskId, diagnosticConsultationId);
    fs.mkdirSync(diagnosticDir, { recursive: true, mode: 0o700 });
    const invalidExecutionJson = '{"malformed":';
    fs.writeFileSync(path.join(diagnosticDir, 'execution.json'), invalidExecutionJson, 'utf8');
    hash.update(`file:${diagnosticTaskId}/${diagnosticConsultationId}/execution.json:${invalidExecutionJson}`);
    totalFiles++;
    totalBytes += Buffer.byteLength(invalidExecutionJson, 'utf8');
  }

  return {
    corpusDigest: hash.digest('hex'),
    totalFiles,
    totalBytes,
    discoveredConsultations: totalCount,
    validOutcomeRecords,
    missingOutcomeRecords,
    invalidOutcomeRecords,
    duplicateIdentityCopies: includeBenchmarkCases ? 1 : 0,
    diagnosticRecords: includeBenchmarkCases ? 1 : 0
  };
}
