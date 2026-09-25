import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const bin = path.join(process.env.HOME, '.evcrate', 'bin', 'evcrate-advisor');
const taskRunId = crypto.randomUUID();
const opInit = crypto.randomUUID();
const opCheckpoint = crypto.randomUUID();

function cleanExcerpt(filePath, maxLen = 400) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n').filter(l => !l.includes('secret') && !l.includes('token') && !l.includes('key'));
  return lines.slice(0, 15).join('\n').slice(0, maxLen);
}

function digestFile(filePath) {
  const buf = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(buf).digest('hex');
}

const portProviderPath = 'viewer/src/providers/dam-hopper-port-provider.ts';
const pickerProviderPath = 'viewer/src/providers/standalone-picker-provider.ts';
const appPath = 'viewer/src/app.tsx';
const reducerPath = 'viewer/src/app-state-reducer.ts';

if (!fs.existsSync(pickerProviderPath)) {
  console.error('Phase E03 consultation replay is historical; standalone picker source was removed. Refusing to mutate advisor task state.');
  process.exit(2);
}

const authorizedPaths = [
  portProviderPath,
  pickerProviderPath,
  appPath,
  reducerPath
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
    phase_id: 'phase-e03',
    task: {
      goal: 'Implement and qualify Phase E03 Embedded provider-neutral four-view UI',
      non_goals: [
        'Permanent dual UI mode',
        'Standalone viewer retirement before G4',
        'Arbitrary filesystem access from embedded plugin'
      ],
      authorized_paths: authorizedPaths,
      scope_rationale: 'Phase E03 UI abstraction, MessagePort provider, standalone transition adapter, and self-contained opaque-origin document',
      invariants: [
        'Preserve existing tests and user baseline',
        'Opaque origin iframe with sandbox="allow-scripts" only',
        'Zero external module, script, style, or network requests',
        'One-time single-use nonce acknowledgement before data flow'
      ],
      success_criteria: [
        'All unit, state, bridge, and isolation tests pass',
        'Standalone viewer test suite passes with 100% success',
        'Candidate package includes valid UI entrypoint and navigation',
        'Code review completed with terminal approval'
      ]
    },
    baseline_paths: authorizedPaths
  }
};

console.log('1. Initializing task state...');
const resInit = spawnSync(bin, ['state', 'init'], {
  input: JSON.stringify(initPayload),
  encoding: 'utf8'
});
if (resInit.status !== 0) {
  console.error('Task init failed:', resInit.stderr || resInit.stdout);
  process.exit(1);
}
console.log('Task state initialized successfully.');

// 2. Reserve Checkpoint
const cp = {
  protocol: 'evcrate-advisor-checkpoint',
  version: 2,
  task_run_id: taskRunId,
  checkpoint_id: 'checkpoint-review-step-4',
  phase_id: 'phase-e03',
  task_revision: 1,
  evidence_revision: 0,
  checkpoint: 'review:step-4',
  kind: 'review',
  question: 'Which safe action should follow this terminal review of Phase E03 embedded provider-neutral four-view UI?',
  task: {
    goal: 'Implement and qualify Phase E03 Embedded provider-neutral four-view UI',
    non_goals: [
      'Permanent dual UI mode',
      'Standalone viewer retirement before G4',
      'Arbitrary filesystem access from embedded plugin'
    ],
    authorized_paths: authorizedPaths,
    scope_rationale: 'Phase E03 UI abstraction, MessagePort provider, standalone transition adapter, and self-contained opaque-origin document',
    invariants: [
      'Preserve existing tests and user baseline',
      'Opaque origin iframe with sandbox="allow-scripts" only',
      'Zero external module, script, style, or network requests',
      'One-time single-use nonce acknowledgement before data flow'
    ],
    success_criteria: [
      'All unit, state, bridge, and isolation tests pass',
      'Standalone viewer test suite passes with 100% success',
      'Candidate package includes valid UI entrypoint and navigation',
      'Code review completed with terminal approval'
    ]
  },
  proposal: {
    next_action: 'Address reviewer warnings regarding remote filter triggers and cancellation request ID, then proceed to user approval and finalization',
    rationale: 'Code reviewer reported score 9.2/10 with 0 critical issues. All 68/68 tests passed at 100%.',
    intended_changed_paths: [
      appPath,
      portProviderPath
    ]
  },
  evidence: {
    summary: 'Code reviewer completed with score 9.2/10 and 0 critical issues. 68/68 tests passed (9 domain, 22 worker, 23 plugin UI, 14 viewer). Self-contained document verified under 5 MiB (327.90 kB) with zero external assets.',
    files: [
      {
        path: portProviderPath,
        excerpt: cleanExcerpt(portProviderPath),
        digest: digestFile(portProviderPath)
      },
      {
        path: pickerProviderPath,
        excerpt: cleanExcerpt(pickerProviderPath),
        digest: digestFile(pickerProviderPath)
      },
      {
        path: appPath,
        excerpt: cleanExcerpt(appPath),
        digest: digestFile(appPath)
      },
      {
        path: reducerPath,
        excerpt: cleanExcerpt(reducerPath),
        digest: digestFile(reducerPath)
      }
    ],
    validation_results: [
      {
        suite: 'test',
        command: 'npm run test:advisor-plugin',
        status: 'passed',
        passed: 9,
        failed: 0,
        details: null
      },
      {
        suite: 'test',
        command: 'npm run test:advisor-plugin-worker',
        status: 'passed',
        passed: 22,
        failed: 0,
        details: null
      },
      {
        suite: 'test',
        command: 'node --test tests/plugin/ui-bridge.test.mjs tests/plugin/ui-state.test.mjs tests/plugin/ui-four-views.spec.mjs tests/plugin/ui-security-accessibility.spec.mjs',
        status: 'passed',
        passed: 23,
        failed: 0,
        details: null
      },
      {
        suite: 'test',
        command: 'npm run test:advisor-viewer',
        status: 'passed',
        passed: 14,
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
const resCp = spawnSync(bin, ['state', 'checkpoint'], {
  input: JSON.stringify(cpPayload),
  encoding: 'utf8'
});
if (resCp.status !== 0) {
  console.error('Checkpoint reserve failed:', resCp.stderr || resCp.stdout);
  process.exit(1);
}
const cpState = JSON.parse(resCp.stdout);
console.log('Checkpoint reserved, consultation_id:', cpState.state.pending_consultation_id);

// 3. Central Controller Invocation
console.log('3. Invoking central advisor controller for advice (timeout 120s)...');
const resCtrl = spawnSync(bin, [], {
  input: JSON.stringify(cp),
  encoding: 'utf8',
  timeout: 120000
});
if (resCtrl.status !== 0) {
  console.error('Central controller invocation failed:', resCtrl.stderr || resCtrl.stdout);
  process.exit(1);
}

const envelope = JSON.parse(resCtrl.stdout);
console.log('Advice received! Status:', envelope.status, 'Correlation ID:', envelope.correlation_id);

// 4. Get Fresh State
console.log('4. Reading fresh task state...');
const resGet = spawnSync(bin, ['state', 'get'], {
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

const reportPath = 'plans/reports/advisor-260921-1725-phase-e03-checkpoint.json';
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
console.log(`Saved advisor consultation report to ${reportPath}`);
console.log('Advisor recommendation:\n', envelope.result?.recommendation);
console.log('Advisor must_fix:\n', envelope.result?.must_fix);
