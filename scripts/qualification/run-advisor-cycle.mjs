#!/usr/bin/env node
/**
 * run-advisor-cycle.mjs
 *
 * Executes the Phase 08 advisor mentoring lifecycle:
 *   1. state init (0 -> 1)
 *   2. state checkpoint reservation (1 -> 2)
 *   3. Controller inference via ~/.evcrate/bin/evcrate-advisor
 *   4. Record outcome & save durable advisor report
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { REPO_ROOT } from './candidate-identity-provider.mjs';
import {
  buildPhase08AdvisorTask,
  buildPhase08EvidenceFiles,
  buildPhase08CheckpointPayload
} from './advisor-checkpoint-builder.mjs';

const CLI = path.resolve(process.env.HOME, '.evcrate/bin/evcrate-advisor');

function invokeController(args, input) {
  const res = spawnSync(CLI, args, {
    cwd: REPO_ROOT,
    input: JSON.stringify(input),
    encoding: 'utf8',
    timeout: 120000
  });

  if (res.error) throw res.error;
  if (res.status !== 0) {
    throw new Error(`Controller ${args.join(' ')} failed (exit ${res.status}): ${res.stdout} ${res.stderr}`);
  }
  return JSON.parse(res.stdout.trim().split('\n')[0]);
}

export async function runAdvisorCycle() {
  const taskRunId = crypto.randomUUID();
  console.log(`Starting Advisor Mentoring Cycle for Phase 08 (Task Run ID: ${taskRunId})...`);

  const authorizedPaths = [
    'scripts/qualification/candidate-identity-provider.mjs',
    'scripts/qualification/receipt-persistence-manager.mjs',
    'scripts/qualification/receipt-templates.mjs',
    'scripts/qualification/scenario-linux-project.mjs',
    'scripts/qualification/scenario-linux-home-multiroot.mjs',
    'scripts/qualification/scenario-security-harness-probes.mjs',
    'scripts/qualification/qualification-ledger-publisher.mjs',
    'scripts/qualification/run-phase08-qualification.mjs',
    'scripts/qualification/advisor-checkpoint-builder.mjs',
    'scripts/qualification/run-advisor-cycle.mjs',
    'tests/qualification/vscode-local-phase08-qualification.test.mjs',
    'docs/project-roadmap.md',
    'docs/project-changelog.md',
    'docs/codebase-summary.md',
    'plans/reports/project-manager-261004-phase-08-status.md',
    'plans/reports/docs-manager-261004-phase-08-summary.md'
  ];

  const evidenceFiles = buildPhase08EvidenceFiles();
  const task = buildPhase08AdvisorTask(authorizedPaths);
  const baselinePaths = Array.from(new Set([
    ...authorizedPaths,
    ...evidenceFiles.map(f => f.path)
  ])).sort();

  // 1. state init
  console.log('1. Executing state init...');
  const initRes = invokeController(['state', 'init'], {
    protocol: 'evcrate-advisor-state',
    version: 1,
    operation: 'init',
    task_run_id: taskRunId,
    operation_id: crypto.randomUUID(),
    expected_revision: 0,
    payload: {
      phase_id: 'phase-08',
      task,
      baseline_paths: baselinePaths
    }
  });

  if (initRes.status !== 'STATE_READY' || initRes.state.task_revision !== 1) {
    throw new Error('state init failed: ' + JSON.stringify(initRes));
  }
  console.log(`✓ state init successful (task_revision: ${initRes.state.task_revision})`);

  // 2. state checkpoint reservation
  console.log('2. Reserving checkpoint at review:step-4...');
  const checkpoint = buildPhase08CheckpointPayload(taskRunId, task, evidenceFiles, authorizedPaths);

  const reserveRes = invokeController(['state', 'checkpoint'], {
    protocol: 'evcrate-advisor-state',
    version: 1,
    operation: 'checkpoint',
    task_run_id: taskRunId,
    operation_id: crypto.randomUUID(),
    expected_revision: 1,
    payload: { checkpoint }
  });

  if (reserveRes.status !== 'STATE_READY' || reserveRes.state.task_revision !== 2) {
    throw new Error('state checkpoint failed: ' + JSON.stringify(reserveRes));
  }
  const consultationId = reserveRes.consultation_id;
  console.log(`✓ Checkpoint reserved (consultation_id: ${consultationId}, revision: ${reserveRes.state.task_revision})`);

  // 3. Controller Checkpoint Inference
  console.log('3. Running advisor checkpoint inference via controller...');
  const inferenceRes = invokeController([], checkpoint);

  if (inferenceRes.status !== 'ADVICE_READY') {
    throw new Error('Advisor inference did not return ADVICE_READY: ' + JSON.stringify(inferenceRes));
  }
  console.log(`✓ Advisor inference returned ADVICE_READY!`);
  console.log(`  Model: ${inferenceRes.receipt?.model} (${inferenceRes.receipt?.backend})`);
  console.log(`  Recommendation: ${inferenceRes.result?.recommendation}`);
  console.log(`  Must Fix: ${inferenceRes.result?.must_fix?.length || 0} items`);

  // 4. Save report
  const reportPath = path.resolve(REPO_ROOT, 'plans/reports/advisor-261004-phase-08-checkpoint.json');
  fs.writeFileSync(reportPath, JSON.stringify(inferenceRes, null, 2) + '\n', 'utf8');
  console.log(`✓ Saved advisor report to ${reportPath}`);

  // 5. Query state get
  const getState = invokeController(['state', 'get'], {
    protocol: 'evcrate-advisor-state',
    version: 1,
    operation: 'get',
    task_run_id: taskRunId,
    operation_id: null,
    expected_revision: null,
    payload: {}
  });

  return {
    taskRunId,
    consultationId,
    inference: inferenceRes,
    state: getState.state
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runAdvisorCycle().catch((err) => {
    console.error('Advisor cycle failed:', err);
    process.exit(1);
  });
}
