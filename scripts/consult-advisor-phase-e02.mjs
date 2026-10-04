import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const home = process.env.HOME;
if (!home || !path.isAbsolute(home)) {
  console.error('Invalid HOME');
  process.exit(1);
}
const bin = path.join(home, '.evcrate', 'bin', 'evcrate-advisor');
const taskRunId = crypto.randomUUID();
const opInit = crypto.randomUUID();
const opCheckpoint = crypto.randomUUID();

function cleanExcerpt(filePath, maxLen = 400) {
  const content = fs.readFileSync(filePath, 'utf8');
  // Grab a safe, non-sensitive, non-path snippet and trim
  const lines = content.split('\n').filter(l => !l.includes('PATH') && !l.includes('secret') && !l.includes('key'));
  const excerpt = lines.slice(0, 15).join('\n').trim();
  return excerpt.slice(0, maxLen).trim();
}

function digestFile(filePath) {
  const buf = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(buf).digest('hex');
}

const reqTablePath = 'plugin/backend/request-table.cjs';
const dispatcherPath = 'plugin/backend/dispatcher.cjs';
const workerPath = 'plugin/backend/worker.cjs';

const authorizedPaths = [
  'plugin/backend/worker.cjs',
  'plugin/backend/context-table.cjs',
  'plugin/backend/request-table.cjs',
  'plugin/backend/dispatcher.cjs',
  'plugin/backend/error-mapping.cjs',
  'plugin/backend/provider.cjs',
  'plugin/manifest.json',
  'scripts/build-advisor-plugin-candidate.mjs',
  'package.json'
];

// 1. Task State Init
const initPayload = {
  protocol: 'evcrate-advisor-state',
  version: 1,
  operation: 'init',
  task_run_id: taskRunId,
  operation_id: opInit,
  expected_revision: 0,
  payload: {
    phase_id: 'phase-e02',
    task: {
      goal: 'Implement and qualify Phase E02 Framed Node plugin worker',
      non_goals: [
        'UI components',
        'Standalone viewer retirement',
        'Marketplace support'
      ],
      authorized_paths: authorizedPaths,
      scope_rationale: 'Phase E02 worker runtime, lifecycle, capability dispatch, cancellation, and candidate packaging',
      invariants: [
        'Preserve existing tests and user baseline',
        'STDOUT purity protocol frames only',
        'STDERR bounded sanitized events only',
        'Zero root runtime dependencies'
      ],
      success_criteria: [
        'All unit, framing, cancellation, and candidate tests pass',
        'Candidate package built and verified',
        '100% test pass rate'
      ]
    },
    baseline_paths: authorizedPaths
  }
};

console.log('1. Initializing task state...');
const resInit = spawnSync(process.execPath, [bin, 'state', 'init'], {
  input: JSON.stringify(initPayload),
  encoding: 'utf8'
});
if (resInit.status !== 0) {
  console.error('Init failed:', resInit.stdout, resInit.stderr);
  process.exit(1);
}
console.log('Task state initialized successfully.');

// 2. Reserve Checkpoint
const cp = {
  protocol: 'evcrate-advisor-checkpoint',
  version: 2,
  task_run_id: taskRunId,
  checkpoint_id: 'checkpoint-review-step-4',
  phase_id: 'phase-e02',
  task_revision: 1,
  evidence_revision: 0,
  checkpoint: 'review:step-4',
  kind: 'review',
  question: 'Which safe action should follow this terminal review of Phase E02 framed Node plugin worker?',
  task: {
    goal: 'Implement and qualify Phase E02 Framed Node plugin worker',
    non_goals: [
      'UI components',
      'Standalone viewer retirement',
      'Marketplace support'
    ],
    authorized_paths: authorizedPaths,
    scope_rationale: 'Phase E02 worker runtime, lifecycle, capability dispatch, cancellation, and candidate packaging',
    invariants: [
      'Preserve existing tests and user baseline',
      'STDOUT purity protocol frames only',
      'STDERR bounded sanitized events only',
      'Zero root runtime dependencies'
    ],
    success_criteria: [
      'All unit, framing, cancellation, and candidate tests pass',
      'Candidate package built and verified',
      '100% test pass rate'
    ]
  },
  proposal: {
    next_action: 'Fix critical operation counter decrement bug in request-table.cjs and address warnings before final approval',
    rationale: 'Code reviewer reported score 8.5/10 with 1 critical counter underflow issue in settleRequest',
    intended_changed_paths: [
      'plugin/backend/request-table.cjs',
      'plugin/backend/dispatcher.cjs',
      'plugin/backend/worker.cjs'
    ]
  },
  evidence: {
    summary: 'Code reviewer completed with score 8.5/10. 49/49 tests passed. 1 critical issue identified in request-table.cjs: operation counters decremented in settleRequest on unstarted requests causing underflow.',
    files: [
      {
        path: reqTablePath,
        excerpt: cleanExcerpt(reqTablePath),
        digest: digestFile(reqTablePath)
      },
      {
        path: dispatcherPath,
        excerpt: cleanExcerpt(dispatcherPath),
        digest: digestFile(dispatcherPath)
      },
      {
        path: workerPath,
        excerpt: cleanExcerpt(workerPath),
        digest: digestFile(workerPath)
      }
    ],
    validation_results: [
      {
        suite: 'test',
        command: 'npm run test:advisor-plugin-worker',
        status: 'passed',
        passed: 20,
        failed: 0,
        details: null
      },
      {
        suite: 'test',
        command: 'node --test tests/plugin/*.test.mjs',
        status: 'passed',
        passed: 29,
        failed: 0,
        details: null
      },
      {
        suite: 'check',
        command: 'npm run check:advisor-plugin-candidate',
        status: 'passed',
        passed: 1,
        failed: 0,
        details: null
      }
    ],
    artifacts: []
  },
  prior: {
    prior_consultation_id: null,
    prior_counsel: null,
    prior_disposition: null,
    observed_outcome: null
  }
};

const cpPayload = {
  protocol: 'evcrate-advisor-state',
  version: 1,
  operation: 'checkpoint',
  task_run_id: taskRunId,
  operation_id: opCheckpoint,
  expected_revision: 1,
  payload: { checkpoint: cp }
};

console.log('2. Reserving checkpoint...');
const resCp = spawnSync(process.execPath, [bin, 'state', 'checkpoint'], {
  input: JSON.stringify(cpPayload),
  encoding: 'utf8'
});
if (resCp.status !== 0) {
  console.error('Checkpoint reservation failed:', resCp.stdout, resCp.stderr);
  process.exit(1);
}
const cpState = JSON.parse(resCp.stdout);
console.log('Checkpoint reserved, consultation_id:', cpState.state.pending_consultation_id);

// 3. Central Controller Invocation
console.log('3. Invoking central advisor controller for advice (timeout 120s)...');
const resCtrl = spawnSync(process.execPath, [bin], {
  input: JSON.stringify(cp),
  encoding: 'utf8',
  timeout: 120000
});
if (resCtrl.status !== 0) {
  console.error('Controller failed:', resCtrl.stdout, resCtrl.stderr);
  process.exit(1);
}

const envelope = JSON.parse(resCtrl.stdout);
console.log('Advice received! Status:', envelope.status, 'Correlation ID:', envelope.correlation_id);

// 4. Get Fresh State
console.log('4. Reading fresh task state...');
const resGet = spawnSync(process.execPath, [bin, 'state', 'get'], {
  input: JSON.stringify({
    protocol: 'evcrate-advisor-state',
    version: 1,
    operation: 'get',
    task_run_id: taskRunId,
    operation_id: null,
    expected_revision: null,
    payload: {}
  }),
  encoding: 'utf8'
});
const freshState = JSON.parse(resGet.stdout);

const report = {
  taskRunId,
  consultationId: envelope.correlation_id,
  envelope,
  freshState
};

const reportPath = 'plans/reports/advisor-260921-1430-phase-e02-checkpoint.json';
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
console.log(`Saved advisor consultation report to ${reportPath}`);
console.log('Advisor recommendation:\n', envelope.result?.recommendation);
console.log('Advisor must_fix:\n', envelope.result?.must_fix);
