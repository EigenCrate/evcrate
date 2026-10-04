'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const ADVISOR_DIR = path.resolve(__dirname, '../../.evcrate/source/.evcrate/bin/lib/advisor');
const { runController } = require(path.join(ADVISOR_DIR, 'controller.cjs'));
const { createRoutingError } = require(path.join(ADVISOR_DIR, 'errors.cjs'));
const { validateEnvelopeV2 } = require(path.join(ADVISOR_DIR, 'contracts-v2.cjs'));

const CHECKPOINT_PATH = path.join(__dirname, 'fixtures/checkpoint.json');
const CHECKPOINT_V1 = fs.readFileSync(CHECKPOINT_PATH, 'utf8');

const VALID_CHECKPOINT_V2 = Object.freeze({
  protocol: 'evcrate-advisor-checkpoint',
  version: 2,
  task_run_id: '01234567-89ab-4cde-8f01-23456789abcd',
  checkpoint_id: 'chk-001',
  phase_id: 'phase-05',
  task_revision: 1,
  evidence_revision: 1,
  checkpoint: 'review:step-4',
  kind: 'review',
  question: 'Is this retry and backup orchestration contract safe?',
  task: {
    goal: 'Freeze v2 contracts',
    non_goals: ['paid live inference'],
    authorized_paths: ['.evcrate/source/.evcrate/bin/lib/advisor/controller.cjs'],
    scope_rationale: 'Phase 05 provides bounded retry and one backup.',
    invariants: ['Maximum 5 model launches', 'Zero concurrent model processes'],
    success_criteria: ['10/20/30s backoff verified', 'Backup invocation verified']
  },
  proposal: {
    next_action: 'Proceed to Step 3 testing',
    rationale: 'All orchestration states handled',
    intended_changed_paths: ['.evcrate/source/.evcrate/bin/lib/advisor/controller.cjs']
  },
  evidence: {
    summary: '118 advisor controller tests passing',
    files: [
      {
        path: '.evcrate/source/.evcrate/bin/lib/advisor/controller.cjs',
        excerpt: 'const PRIMARY_RETRY_DELAYS_MS = Object.freeze([10_000, 20_000, 30_000]);',
        digest: 'a'.repeat(64)
      }
    ],
    validation_results: [
      {
        suite: 'advisor-controller',
        command: 'npm run test:advisor-controller',
        status: 'passed',
        passed: 118,
        failed: 0,
        details: null
      }
    ],
    artifacts: [
      {
        id: 'art-001',
        path: '.evcrate/source/.evcrate/bin/lib/advisor/controller.cjs',
        digest: 'b'.repeat(64),
        description: 'Controller retry and backup implementation'
      }
    ]
  },
  prior: {
    prior_consultation_id: null,
    prior_counsel: null,
    prior_disposition: null,
    observed_outcome: null
  }
});

function mockPolicy(primaryBackend = 'codex', backupBackend = 'omp') {
  return JSON.stringify({
    version: 2,
    advisor: {
      primary: {
        backend: primaryBackend,
        model: primaryBackend === 'omp' ? 'openai-codex/gpt-5.6-sol' : 'gpt-5.6-sol',
        effort: 'high'
      },
      backup: {
        backend: backupBackend,
        model: backupBackend === 'omp' ? 'openai-codex/gpt-5.6-sol' : 'gpt-5.6-sol',
        effort: 'high'
      }
    },
    wait: { mode: 'until_terminal', warn_after_ms: 120000, warn_every_ms: 300000 },
    history: { retention_days: 30, max_bytes: 104857600 }
  });
}

function setupTestEnv() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'evcrate-retry-test-'));
  const home = path.join(root, 'home');
  const tmp = path.join(root, 'tmp');
  fs.mkdirSync(path.join(home, '.evcrate'), { recursive: true, mode: 0o700 });
  fs.mkdirSync(tmp, { mode: 0o700 });
  fs.writeFileSync(path.join(home, '.evcrate/advisor-routing.json'), `${mockPolicy()}\n`, { mode: 0o600 });
  if (process.platform === 'win32') {
    const bin = path.join(root, 'bin');
    for (const [command, name] of [
      ['codex', '@openai/codex'],
      ['omp', '@oh-my-pi/pi-coding-agent']
    ]) {
      const packageDir = path.join(bin, 'node_modules', ...name.split('/'));
      fs.mkdirSync(path.join(packageDir, 'bin'), { recursive: true });
      fs.writeFileSync(path.join(packageDir, 'package.json'), JSON.stringify({
        name, version: '1.0.0', bin: { [command]: `bin/${command}.js` }
      }));
      fs.writeFileSync(path.join(packageDir, 'bin', `${command}.js`), '#!/usr/bin/env node\n');
      fs.writeFileSync(path.join(bin, `${command}.cmd`),
        `@echo off\r\nnode "%~dp0\\node_modules\\${name.replace('/', '\\')}\\bin\\${command}.js" %*\r\n`);
    }
  }
  const environment = { ...process.env, HOME: home, TMPDIR: tmp };
  if (process.platform === 'win32') {
    const inheritedPath = Object.entries(environment).find(([key]) => key.toLowerCase() === 'path')?.[1] ?? '';
    for (const key of Object.keys(environment)) if (key.toLowerCase() === 'path') delete environment[key];
    environment.PATH = `${path.join(root, 'bin')}${path.delimiter}${inheritedPath}`;
  }
  delete environment.EVCRATE_ADVISOR_ACTIVE;
  delete environment.EVCRATE_ADVISOR_DEPTH;
  return {
    root,
    home,
    environment,
    cleanup: () => fs.rmSync(root, { recursive: true, force: true })
  };
}

const VALID_V2_ADVICE_BODY = JSON.stringify({
  recommendation: 'Proceed with phase completion.',
  rationale: 'All contract invariants satisfied.',
  must_fix: [],
  cautions: [],
  assumptions: [],
  success_checks: ['All unit tests pass'],
  unresolved_questions: []
});

function successCodexOutput() {
  return [
    JSON.stringify({ type: 'thread.started', thread_id: 't-1' }),
    JSON.stringify({ type: 'turn.started', turn_id: 'u-1' }),
    JSON.stringify({ type: 'item.completed', item: { id: 'm-1', type: 'agent_message', text: VALID_V2_ADVICE_BODY } }),
    JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 1, output_tokens: 1 } })
  ].join('\n');
}
function usage() {
  return { input: 1, output: 2, cacheRead: 0, cacheWrite: 0, totalTokens: 3,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
}
function successOmpOutput(cwd = process.cwd()) {
  const user = { role: 'user', content: [{ type: 'text', text: 'checkpoint' }], attribution: 'user', timestamp: 1 };
  const assistant = {
    role: 'assistant', content: [{ type: 'text', text: VALID_V2_ADVICE_BODY }],
    api: 'openai-codex-responses', provider: 'openai-codex', model: 'gpt-5.6-sol',
    stopReason: 'stop', responseId: 'omp-resp', duration: 1, ttft: 1, completedAt: 3,
    usage: usage(), timestamp: 2
  };
  return [
    JSON.stringify({ type: 'session', version: 3, id: 's-1', timestamp: '2026-09-08T00:00:00.000Z', cwd }),
    JSON.stringify({ type: 'agent_start' }), JSON.stringify({ type: 'turn_start' }),
    JSON.stringify({ type: 'message_start', message: user }), JSON.stringify({ type: 'message_end', message: user }),
    JSON.stringify({ type: 'message_start', message: assistant }),
    JSON.stringify({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', contentIndex: 0, delta: VALID_V2_ADVICE_BODY } }),
    JSON.stringify({ type: 'message_end', message: assistant }),
    JSON.stringify({ type: 'turn_end', message: assistant, toolResults: [] }),
    JSON.stringify({ type: 'agent_end', messages: [user, assistant], isTerminal: true })
  ].join('\n');
}

const CODEX_HELP_OUTPUT = [
  'Usage: codex exec [OPTIONS]',
  '  --model <model>',
  '  --config <key=value>',
  '  --ephemeral',
  '  --sandbox <mode> (read-only)',
  '  --ignore-user-config',
  '  --ignore-rules',
  '  --strict-config',
  '  --skip-git-repo-check',
  '  --json'
].join('\n') + '\n';

const OMP_HELP_OUTPUT = [
  'Usage: omp [COMMAND]',
  '  -p, --print',
  '  --mode=<value>',
  '  Output mode: text, json',
  '  --model=<value>',
  '  --thinking=<value>',
  '  --no-session',
  '  --no-tools',
  '  --no-lsp',
  '  --no-pty',
  '  --no-extensions',
  '  --no-skills',
  '  --no-rules',
  '  usage',
  '  models'
].join('\n') + '\n';

const OMP_USAGE_HELP_OUTPUT = [
  'Usage: omp usage [ACTION] [FLAGS]',
  '  -j, --json',
  '  -r, --redact',
  '  -p, --provider=<value>'
].join('\n') + '\n';

const OMP_MODELS_HELP_OUTPUT = 'Usage: omp models [ACTION] [PATTERN] find --json --no-extensions\n';

function createMockRunner({
  primaryAttempts = [],
  backupAttempts = [],
  probeResponses = {}
} = {}) {
  let primaryIndex = 0;
  let backupIndex = 0;
  let activeInvocations = 0;
  let maxConcurrent = 0;
  const launchHistory = [];

  const runner = {
    run: async (inv, opts) => {
      activeInvocations++;
      if (activeInvocations > maxConcurrent) maxConcurrent = activeInvocations;
      await new Promise((resolve) => setImmediate(resolve));
      try {
        const isProbe = inv.limits?.mode === 'probe';
        const isGeneration = inv.limits?.mode === 'generation';
        const adapter = inv.adapter;

        if (isProbe) {
          if (probeResponses[adapter]) {
            const probeResult = typeof probeResponses[adapter] === 'function'
              ? probeResponses[adapter](inv)
              : probeResponses[adapter];
            if (probeResult instanceof Error || probeResult?.error) {
              throw probeResult.error || probeResult;
            }
            return probeResult;
          }
          // Default probe success for codex
          if (adapter === 'codex') {
            if (inv.argv.includes('--version')) return { stdout: 'codex-cli 0.150.1\n', stderr: '' };
            if (inv.argv.includes('status')) return { stdout: 'Logged in using ChatGPT\n', stderr: '' };
            if (inv.argv.includes('--help')) return { stdout: CODEX_HELP_OUTPUT, stderr: '' };
            if (inv.argv.includes('--bundled')) return {
              stdout: JSON.stringify({ models: [{ slug: 'gpt-5.6-sol', supported_reasoning_levels: [{ effort: 'high' }] }] }) + '\n',
              stderr: ''
            };
          }
          // Default probe success for omp
          if (adapter === 'omp') {
            if (inv.argv.includes('--version')) return { stdout: 'omp v18.0.11\n', stderr: '' };
            if (inv.argv[0] === 'usage' && inv.argv.includes('--help')) return { stdout: OMP_USAGE_HELP_OUTPUT, stderr: '' };
            if (inv.argv[0] === 'models' && inv.argv.includes('--help')) return { stdout: OMP_MODELS_HELP_OUTPUT, stderr: '' };
            if (inv.argv.includes('--help')) return { stdout: OMP_HELP_OUTPUT, stderr: '' };
            if (inv.argv[0] === 'usage') return {
              stdout: JSON.stringify({
                generatedAt: 1,
                reports: [{ provider: 'openai-codex', limits: [{ id: 'primary', status: 'ok' }] }],
                accountsWithoutUsage: [],
                disabledCredentials: [],
                capacity: { 'openai-codex': [{ remainingAccounts: 1 }] }
              }) + '\n',
              stderr: ''
            };
            if (inv.argv[0] === 'models') return {
              stdout: JSON.stringify({ models: [{ provider: 'openai-codex', id: 'gpt-5.6-sol', selector: 'openai-codex/gpt-5.6-sol', thinking: ['high'] }] }) + '\n',
              stderr: ''
            };
          }
          return { stdout: '', stderr: '' };
        }

        if (isGeneration) {
          launchHistory.push({ adapter, time: Date.now() });
          if (adapter === 'codex') {
            const spec = primaryAttempts[primaryIndex] ?? { success: true };
            primaryIndex++;
            if (spec.error) {
              return { error: spec.error, cleanupOutcome: spec.cleanupOutcome || 'confirmed' };
            }
            if (spec.throwError) {
              throw spec.throwError;
            }
            return { stdout: spec.stdout || successCodexOutput(), stderr: '', cleanupOutcome: spec.cleanupOutcome || 'confirmed' };
          }
          if (adapter === 'omp') {
            const spec = backupAttempts[backupIndex] ?? { success: true };
            backupIndex++;
            if (spec.error) {
              return { error: spec.error, cleanupOutcome: spec.cleanupOutcome || 'confirmed' };
            }
            if (spec.throwError) {
              throw spec.throwError;
            }
            return { stdout: spec.stdout || successOmpOutput(inv.cwd), stderr: '', cleanupOutcome: spec.cleanupOutcome || 'confirmed' };
          }
        }

        return { stdout: '', stderr: '' };
      } finally {
        await new Promise((resolve) => setImmediate(resolve));
        activeInvocations--;
      }
    }
  };

  return {
    runner,
    getLaunchHistory: () => [...launchHistory],
    getMaxConcurrent: () => maxConcurrent,
    getPrimaryIndex: () => primaryIndex,
    getBackupIndex: () => backupIndex
  };
}

test('U02: primary initial success launches 1 model, 0 retries, 0 backup', async () => {
  const env = setupTestEnv();
  try {
    const mock = createMockRunner({
      primaryAttempts: [{ success: true }]
    });
    const delays = [];
    const sleep = async (ms) => { delays.push(ms); };

    const result = await runController(CHECKPOINT_V1, {
      environment: env.environment,
      runner: mock.runner,
      sleep
    });

    assert.equal(result.status, 'ADVICE_READY');
    assert.equal(result.receipt.backend, 'codex');
    assert.equal(result.receipt.model, 'gpt-5.6-sol');
    assert.equal(mock.getPrimaryIndex(), 1);
    assert.equal(mock.getBackupIndex(), 0);
    assert.equal(delays.length, 0);
  } finally {
    env.cleanup();
  }
});

test('U02: primary transient error on attempt 1 retries after 10s and succeeds on attempt 2', async () => {
  const env = setupTestEnv();
  try {
    const mock = createMockRunner({
      primaryAttempts: [
        { error: createRoutingError('TRANSIENT_PROVIDER_ERROR') },
        { success: true }
      ]
    });
    const delays = [];
    const sleep = async (ms) => { delays.push(ms); };

    const result = await runController(JSON.stringify(VALID_CHECKPOINT_V2), {
      environment: env.environment,
      runner: mock.runner,
      sleep
    });

    assert.equal(result.status, 'ADVICE_READY');
    assert.equal(result.receipt.backend, 'codex');
    assert.equal(mock.getPrimaryIndex(), 2);
    assert.equal(mock.getBackupIndex(), 0);
    assert.deepEqual(delays, [10000]);

    assert.equal(result.attempts.length, 2);
    assert.equal(result.attempts[0].slot, 'primary');
    assert.equal(result.attempts[0].terminal_classification, 'transient');
    assert.equal(result.attempts[0].retry_delay_ms, 10000);
    assert.equal(result.attempts[0].model_started, true);

    assert.equal(result.attempts[1].slot, 'primary');
    assert.equal(result.attempts[1].terminal_classification, 'success');
    assert.equal(result.attempts[1].retry_delay_ms, null);
    assert.equal(result.attempts[1].model_started, true);

    validateEnvelopeV2(result);
  } finally {
    env.cleanup();
  }
});

test('U02: primary transient error on attempts 1-3 retries after 10s, 20s, 30s and succeeds on attempt 4', async () => {
  const env = setupTestEnv();
  try {
    const mock = createMockRunner({
      primaryAttempts: [
        { error: createRoutingError('TRANSIENT_PROVIDER_ERROR') },
        { error: createRoutingError('TRANSIENT_PROVIDER_ERROR') },
        { error: createRoutingError('TRANSIENT_PROVIDER_ERROR') },
        { success: true }
      ]
    });
    const delays = [];
    const sleep = async (ms) => { delays.push(ms); };

    const result = await runController(JSON.stringify(VALID_CHECKPOINT_V2), {
      environment: env.environment,
      runner: mock.runner,
      sleep
    });

    assert.equal(result.status, 'ADVICE_READY');
    assert.equal(result.receipt.backend, 'codex');
    assert.equal(mock.getPrimaryIndex(), 4);
    assert.equal(mock.getBackupIndex(), 0);
    assert.deepEqual(delays, [10000, 20000, 30000]);

    assert.equal(result.attempts.length, 4);
    assert.equal(result.attempts[0].retry_delay_ms, 10000);
    assert.equal(result.attempts[1].retry_delay_ms, 20000);
    assert.equal(result.attempts[2].retry_delay_ms, 30000);
    assert.equal(result.attempts[3].terminal_classification, 'success');
    assert.equal(result.attempts[3].retry_delay_ms, null);

    validateEnvelopeV2(result);
  } finally {
    env.cleanup();
  }
});

test('U02: 4 primary transient errors transition to backup; backup succeeds (5 total model launches)', async () => {
  const env = setupTestEnv();
  try {
    const mock = createMockRunner({
      primaryAttempts: [
        { error: createRoutingError('TRANSIENT_PROVIDER_ERROR') },
        { error: createRoutingError('TRANSIENT_PROVIDER_ERROR') },
        { error: createRoutingError('TRANSIENT_PROVIDER_ERROR') },
        { error: createRoutingError('TRANSIENT_PROVIDER_ERROR') }
      ],
      backupAttempts: [
        { success: true }
      ]
    });
    const delays = [];
    const sleep = async (ms) => { delays.push(ms); };

    const result = await runController(JSON.stringify(VALID_CHECKPOINT_V2), {
      environment: env.environment,
      runner: mock.runner,
      sleep
    });

    assert.equal(result.status, 'ADVICE_READY');
    assert.equal(result.receipt.backend, 'omp');
    assert.equal(result.receipt.model, 'openai-codex/gpt-5.6-sol');
    assert.equal(mock.getPrimaryIndex(), 4);
    assert.equal(mock.getBackupIndex(), 1);
    assert.deepEqual(delays, [10000, 20000, 30000]);

    assert.equal(result.attempts.length, 5);
    for (let i = 0; i < 4; i++) {
      assert.equal(result.attempts[i].slot, 'primary');
      assert.equal(result.attempts[i].terminal_classification, 'transient');
    }
    assert.equal(result.attempts[3].retry_delay_ms, null);

    assert.equal(result.attempts[4].slot, 'backup');
    assert.equal(result.attempts[4].terminal_classification, 'success');
    assert.equal(result.attempts[4].retry_delay_ms, null);
    assert.equal(result.attempts[4].route.backend, 'omp');

    validateEnvelopeV2(result);
  } finally {
    env.cleanup();
  }
});

test('U02 & U03: 4 primary transient errors then backup transient error fails closed without backup retry', async () => {
  const env = setupTestEnv();
  try {
    const mock = createMockRunner({
      primaryAttempts: [
        { error: createRoutingError('TRANSIENT_PROVIDER_ERROR') },
        { error: createRoutingError('TRANSIENT_PROVIDER_ERROR') },
        { error: createRoutingError('TRANSIENT_PROVIDER_ERROR') },
        { error: createRoutingError('TRANSIENT_PROVIDER_ERROR') }
      ],
      backupAttempts: [
        { error: createRoutingError('TRANSIENT_PROVIDER_ERROR') }
      ]
    });
    const delays = [];
    const sleep = async (ms) => { delays.push(ms); };

    const result = await runController(JSON.stringify(VALID_CHECKPOINT_V2), {
      environment: env.environment,
      runner: mock.runner,
      sleep
    });

    assert.equal(result.status, 'FAILED');
    assert.equal(result.error.code, 'TRANSIENT_PROVIDER_ERROR');
    assert.equal(mock.getPrimaryIndex(), 4);
    assert.equal(mock.getBackupIndex(), 1);
    assert.deepEqual(delays, [10000, 20000, 30000]);

    assert.equal(result.attempts.length, 5);
    assert.equal(result.attempts[4].slot, 'backup');
    assert.equal(result.attempts[4].terminal_classification, 'transient');
    assert.equal(result.attempts[4].retry_delay_ms, null);

    validateEnvelopeV2(result);
  } finally {
    env.cleanup();
  }
});

test('U03: primary route-local preflight skip launches 0 primary models and executes backup model', async () => {
  const env = setupTestEnv();
  try {
    const mock = createMockRunner({
      probeResponses: {
        codex: {
          error: createRoutingError('AUTH_UNAVAILABLE')
        }
      },
      backupAttempts: [{ success: true }]
    });

    const result = await runController(JSON.stringify(VALID_CHECKPOINT_V2), {
      environment: env.environment,
      runner: mock.runner
    });

    assert.equal(result.status, 'ADVICE_READY');
    assert.equal(result.receipt.backend, 'omp');
    assert.equal(mock.getPrimaryIndex(), 0);
    assert.equal(mock.getBackupIndex(), 1);

    assert.equal(result.attempts.length, 2);
    assert.equal(result.attempts[0].slot, 'primary');
    assert.equal(result.attempts[0].phase, 'preflight');
    assert.equal(result.attempts[0].model_started, false);
    assert.equal(result.attempts[0].terminal_classification, 'skipped');

    assert.equal(result.attempts[1].slot, 'backup');
    assert.equal(result.attempts[1].phase, 'model');
    assert.equal(result.attempts[1].model_started, true);
    assert.equal(result.attempts[1].terminal_classification, 'success');

    validateEnvelopeV2(result);
  } finally {
    env.cleanup();
  }
});

test('U03: non-retryable fatal output failure (OUTPUT_INVALID) yields 1 model launch, 0 retries, 0 backup', async () => {
  const env = setupTestEnv();
  try {
    const mock = createMockRunner({
      primaryAttempts: [
        { error: createRoutingError('OUTPUT_INVALID') }
      ],
      backupAttempts: [{ success: true }]
    });

    const result = await runController(JSON.stringify(VALID_CHECKPOINT_V2), {
      environment: env.environment,
      runner: mock.runner
    });

    assert.equal(result.status, 'FAILED');
    assert.equal(result.error.code, 'OUTPUT_INVALID');
    assert.equal(mock.getPrimaryIndex(), 1);
    assert.equal(mock.getBackupIndex(), 0);
    assert.equal(result.attempts.length, 1);
    assert.equal(result.attempts[0].terminal_classification, 'fatal');

    validateEnvelopeV2(result);
  } finally {
    env.cleanup();
  }
});

test('U03: cancellation during backoff halts consultation with zero subsequent launches', async () => {
  const env = setupTestEnv();
  try {
    const abortCtrl = new AbortController();
    const mock = createMockRunner({
      primaryAttempts: [
        { error: createRoutingError('TRANSIENT_PROVIDER_ERROR') },
        { success: true }
      ]
    });

    const sleep = async (ms, signal) => {
      abortCtrl.abort();
      throw createRoutingError('CANCELLED');
    };

    const result = await runController(JSON.stringify(VALID_CHECKPOINT_V2), {
      environment: env.environment,
      runner: mock.runner,
      signal: abortCtrl.signal,
      sleep
    });

    assert.equal(result.status, 'FAILED');
    assert.equal(result.error.code, 'CANCELLED');
    assert.equal(mock.getPrimaryIndex(), 1);
    assert.equal(mock.getBackupIndex(), 0);
    assert.equal(result.attempts.length, 1);
    assert.equal(result.attempts[0].slot, 'primary');
    assert.equal(result.attempts[0].phase, 'model');
    assert.equal(result.attempts[0].model_started, true);
    assert.equal(result.attempts[0].terminal_classification, 'transient'); // C2-R2: preserved, not rewritten!
    assert.equal(result.attempts[0].retry_delay_ms, 10000);
  } finally {
    env.cleanup();
  }
});

test('trusted structured Retry-After cooldown enforces max(configured_backoff, provider_cooldown)', async () => {
  const env = setupTestEnv();
  try {
    const errorWithCooldown15s = createRoutingError('TRANSIENT_PROVIDER_ERROR', { cooldown_ms: 15_000 });
    const errorWithCooldown5s = createRoutingError('TRANSIENT_PROVIDER_ERROR', { cooldown_ms: 5_000 });

    const mock = createMockRunner({
      primaryAttempts: [
        { error: errorWithCooldown15s }, // backoff=10s, cooldown=15s -> max=15s
        { error: errorWithCooldown5s },  // backoff=20s, cooldown=5s -> max=20s
        { success: true }
      ]
    });
    const delays = [];
    const sleep = async (ms) => { delays.push(ms); };

    const result = await runController(JSON.stringify(VALID_CHECKPOINT_V2), {
      environment: env.environment,
      runner: mock.runner,
      sleep
    });

    assert.equal(result.status, 'ADVICE_READY');
    assert.deepEqual(delays, [15000, 20000]);
    assert.equal(result.attempts[0].retry_delay_ms, 15000);
    assert.equal(result.attempts[1].retry_delay_ms, 20000);
    assert.equal(result.attempts[2].retry_delay_ms, null);

    validateEnvelopeV2(result);
  } finally {
    env.cleanup();
  }
});

test('excessive provider cooldown (> 1 hour) is rejected as fatal with zero subsequent launches', async () => {
  const env = setupTestEnv();
  try {
    const excessiveCooldownError = createRoutingError('TRANSIENT_PROVIDER_ERROR', { cooldown_ms: 3_600_001 });

    const mock = createMockRunner({
      primaryAttempts: [
        { error: excessiveCooldownError },
        { success: true }
      ]
    });
    const delays = [];
    const sleep = async (ms) => { delays.push(ms); };

    const result = await runController(JSON.stringify(VALID_CHECKPOINT_V2), {
      environment: env.environment,
      runner: mock.runner,
      sleep
    });

    assert.equal(result.status, 'FAILED');
    assert.equal(result.error.code, 'TRANSIENT_PROVIDER_ERROR');
    assert.equal(mock.getPrimaryIndex(), 1);
    assert.equal(mock.getBackupIndex(), 0);
    assert.equal(delays.length, 0);
    assert.equal(result.attempts[0].terminal_classification, 'fatal');

    validateEnvelopeV2(result);
  } finally {
    env.cleanup();
  }
});

test('concurrency invariant: exactly one model invocation active at a time (maxConcurrent <= 1)', async () => {
  const env = setupTestEnv();
  try {
    const mock = createMockRunner({
      primaryAttempts: [
        { error: createRoutingError('TRANSIENT_PROVIDER_ERROR') },
        { error: createRoutingError('TRANSIENT_PROVIDER_ERROR') },
        { success: true }
      ]
    });
    const sleep = async () => {};

    const result = await runController(JSON.stringify(VALID_CHECKPOINT_V2), {
      environment: env.environment,
      runner: mock.runner,
      sleep
    });

    assert.equal(result.status, 'ADVICE_READY');
    assert.equal(mock.getMaxConcurrent(), 1);
  } finally {
    env.cleanup();
  }
});

test('unconfirmed process cleanup on transient failure blocks retry and halts consultation', async () => {
  const env = setupTestEnv();
  try {
    const mock = createMockRunner({
      primaryAttempts: [
        { error: createRoutingError('TRANSIENT_PROVIDER_ERROR'), cleanupOutcome: 'unconfirmed' },
        { success: true }
      ]
    });

    const result = await runController(JSON.stringify(VALID_CHECKPOINT_V2), {
      environment: env.environment,
      runner: mock.runner
    });

    assert.equal(result.status, 'FAILED');
    assert.equal(result.cleanup_outcome, 'unconfirmed');
    assert.equal(mock.getPrimaryIndex(), 1);
    assert.equal(mock.getBackupIndex(), 0);
    assert.equal(result.attempts[0].terminal_classification, 'fatal');
    assert.equal(result.attempts[0].cleanup_outcome, 'unconfirmed');
  } finally {
    env.cleanup();
  }
});

test('C2-W1 / R1: controller capability attestation validation catches mismatched adapter attestation', async () => {
  const env = setupTestEnv();
  try {
    const { getAdapter } = require(path.join(ADVISOR_DIR, 'adapter-registry.cjs'));
    const baseCodex = getAdapter('codex');
    const mismatchAdapter = {
      ...baseCodex,
      probeCapabilities: async () => ({
        model: 'wrong-model',
        effort: 'high',
        noninteractive: true,
        session: 'isolated',
        tools: 'none',
        output: 'jsonl'
      })
    };

    const mock = createMockRunner({
      backupAttempts: [{ success: true }]
    });

    const result = await runController(JSON.stringify(VALID_CHECKPOINT_V2), {
      environment: env.environment,
      runner: mock.runner,
      getAdapter: (name) => (name === 'codex' ? mismatchAdapter : getAdapter(name))
    });

    assert.equal(result.status, 'ADVICE_READY');
    assert.equal(result.receipt.backend, 'omp');
    assert.equal(mock.getPrimaryIndex(), 0);
    assert.equal(mock.getBackupIndex(), 1);
    assert.equal(result.attempts[0].slot, 'primary');
    assert.equal(result.attempts[0].phase, 'preflight');
    assert.equal(result.attempts[0].terminal_classification, 'skipped');
    assert.equal(result.attempts[1].slot, 'backup');
    assert.equal(result.attempts[1].terminal_classification, 'success');
    validateEnvelopeV2(result);
  } finally {
    env.cleanup();
  }
});

test('R2: cancellation at runner settlement records model attempt as cancelled with model_started: true', async () => {
  const env = setupTestEnv();
  try {
    const abortCtrl = new AbortController();
    const mock = createMockRunner({
      primaryAttempts: [
        {
          stdout: successCodexOutput()
        }
      ]
    });

    const runnerWithCancelAtSettlement = {
      run: async (inv, opts) => {
        const res = await mock.runner.run(inv, opts);
        if (inv.limits?.mode === 'generation') {
          // Abort right after runner finishes execution but before controller returns
          abortCtrl.abort();
        }
        return res;
      }
    };

    const result = await runController(JSON.stringify(VALID_CHECKPOINT_V2), {
      environment: env.environment,
      runner: runnerWithCancelAtSettlement,
      signal: abortCtrl.signal
    });

    assert.equal(result.status, 'FAILED');
    assert.equal(result.error.code, 'CANCELLED');
    assert.equal(result.attempts.length, 1);
    assert.equal(result.attempts[0].slot, 'primary');
    assert.equal(result.attempts[0].phase, 'model');
    assert.equal(result.attempts[0].model_started, true);
    assert.equal(result.attempts[0].terminal_classification, 'cancelled');
    validateEnvelopeV2(result);
  } finally {
    env.cleanup();
  }
});

test('R3: concurrency verification with active async boundary across retries and backup transition', async () => {
  const env = setupTestEnv();
  try {
    const mock = createMockRunner({
      primaryAttempts: [
        { error: createRoutingError('TRANSIENT_PROVIDER_ERROR') },
        { error: createRoutingError('TRANSIENT_PROVIDER_ERROR') },
        { error: createRoutingError('TRANSIENT_PROVIDER_ERROR') },
        { error: createRoutingError('TRANSIENT_PROVIDER_ERROR') }
      ],
      backupAttempts: [
        { success: true }
      ]
    });
    const sleep = async () => {};

    const result = await runController(JSON.stringify(VALID_CHECKPOINT_V2), {
      environment: env.environment,
      runner: mock.runner,
      sleep
    });

    assert.equal(result.status, 'ADVICE_READY');
    assert.equal(result.receipt.backend, 'omp');
    assert.equal(mock.getPrimaryIndex(), 4);
    assert.equal(mock.getBackupIndex(), 1);
    assert.equal(mock.getMaxConcurrent(), 1); // Exactly 1 at any moment!
    validateEnvelopeV2(result);
  } finally {
    env.cleanup();
  }
});

test('C2-R1: pre-spawn route-local skip on primary preserves primary error when backup qualification fails', async () => {
  const env = setupTestEnv();
  try {
    const mock = createMockRunner({
      primaryAttempts: [
        {
          error: createRoutingError('EXECUTABLE_UNAVAILABLE'),
          cleanupOutcome: 'confirmed'
        }
      ],
      probeResponses: {
        omp: {
          error: createRoutingError('AUTH_UNAVAILABLE')
        }
      }
    });

    const result = await runController(JSON.stringify(VALID_CHECKPOINT_V2), {
      environment: env.environment,
      runner: mock.runner
    });

    assert.equal(result.status, 'FAILED');
    assert.equal(result.error.code, 'EXECUTABLE_UNAVAILABLE'); // Preserved primary skip error!
    assert.equal(result.attempts.length, 2);
    assert.equal(result.attempts[0].slot, 'primary');
    assert.equal(result.attempts[0].phase, 'preflight');
    assert.equal(result.attempts[0].model_started, false);
    assert.equal(result.attempts[0].terminal_classification, 'skipped');
    assert.equal(result.attempts[1].slot, 'backup');
    assert.equal(result.attempts[1].phase, 'preflight');
    assert.equal(result.attempts[1].model_started, false);
    assert.equal(result.attempts[1].terminal_classification, 'fatal');
    validateEnvelopeV2(result);
  } finally {
    env.cleanup();
  }
});

test('C2-W3: real CLI process execution emits exactly one terminal envelope and respects exit code', () => {
  const { spawnSync } = require('node:child_process');
  const CONTROLLER_BIN = path.resolve(__dirname, '../../.evcrate/source/.evcrate/bin/evcrate-advisor');
  const FAKE_CODEX = path.join(__dirname, 'fixtures/fake-codex.cjs');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'evcrate-smoke-cli-'));
  const home = path.join(root, 'home');
  const bin = path.join(root, 'bin');
  fs.mkdirSync(path.join(home, '.evcrate'), { recursive: true, mode: 0o700 });
  fs.mkdirSync(bin, { mode: 0o700 });
  fs.writeFileSync(path.join(home, '.evcrate/advisor-routing.json'), `${mockPolicy('codex', 'omp')}\n`, { mode: 0o600 });
  fs.writeFileSync(path.join(home, '.evcrate/fake-codex-mode'), 'success\n', { mode: 0o600 });
  fs.symlinkSync(FAKE_CODEX, path.join(bin, 'codex'));
  const env = {
    ...process.env,
    HOME: home,
    PATH: `${bin}${path.delimiter}${path.dirname(process.execPath)}${path.delimiter}/usr/bin${path.delimiter}/bin`
  };
  delete env.EVCRATE_ADVISOR_ACTIVE;
  delete env.EVCRATE_ADVISOR_DEPTH;

  try {
    const res = spawnSync(process.execPath, [CONTROLLER_BIN], {
      input: CHECKPOINT_V1,
      env,
      encoding: 'utf8',
      timeout: 15_000
    });
    assert.equal(res.status, 0);
    assert.equal(res.stderr, '');
    const lines = res.stdout.trim().split('\n');
    assert.equal(lines.length, 1); // Exactly one terminal JSON line!
    const envelope = JSON.parse(lines[0]);
    assert.equal(envelope.status, 'ADVICE_READY');
    assert.equal(envelope.receipt.backend, 'codex');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('C3-R1: backoff cancellation with unconfirmed workspace cleanup preserves transient attempt and propagates unconfirmed cleanup', async () => {
  const env = setupTestEnv();
  try {
    const abortCtrl = new AbortController();
    const mock = createMockRunner({
      primaryAttempts: [
        { error: createRoutingError('TRANSIENT_PROVIDER_ERROR') },
        { success: true }
      ]
    });

    const sleep = async (ms, signal) => {
      abortCtrl.abort();
      throw createRoutingError('CANCELLED');
    };

    const unconfirmedCleanup = async () => ({ outcome: 'unconfirmed' });

    const result = await runController(JSON.stringify(VALID_CHECKPOINT_V2), {
      environment: env.environment,
      runner: mock.runner,
      signal: abortCtrl.signal,
      cleanupWorkspace: unconfirmedCleanup,
      sleep
    });

    assert.equal(result.status, 'FAILED');
    assert.equal(result.error.code, 'CANCELLED');
    assert.equal(result.cleanup_outcome, 'unconfirmed');
    assert.equal(result.attempts.length, 1);
    assert.equal(result.attempts[0].slot, 'primary');
    assert.equal(result.attempts[0].terminal_classification, 'transient'); // Preserved!
    assert.equal(result.attempts[0].cleanup_outcome, 'unconfirmed');       // Visibly unconfirmed!
    assert.equal(result.attempts[0].retry_delay_ms, 10000);

    const serialized = JSON.parse(JSON.stringify(result));
    assert.equal(serialized.attempts[0].cleanup_outcome, 'unconfirmed');
    assert.equal(serialized.attempts[0].terminal_classification, 'transient');
  } finally {
    env.cleanup();
  }
});

test('P0: primary transient attempt 1 followed by pre-spawn route loss before attempt 2 skips to backup and succeeds', async () => {
  const env = setupTestEnv();
  try {
    let generationBuildCount = 0;
    const { getAdapter } = require(path.join(ADVISOR_DIR, 'adapter-registry.cjs'));
    const baseCodex = getAdapter('codex');
    const dynamicCodex = {
      ...baseCodex,
      buildInvocation: async (ctx) => {
        if (ctx.limits?.mode === 'generation') {
          generationBuildCount++;
          if (generationBuildCount === 2) {
            throw createRoutingError('EXECUTABLE_UNAVAILABLE');
          }
        }
        return baseCodex.buildInvocation(ctx);
      }
    };

    const mock = createMockRunner({
      primaryAttempts: [
        { error: createRoutingError('TRANSIENT_PROVIDER_ERROR') }
      ],
      backupAttempts: [{ success: true }]
    });

    const sleep = async () => {};

    const result = await runController(JSON.stringify(VALID_CHECKPOINT_V2), {
      environment: env.environment,
      runner: mock.runner,
      getAdapter: (name) => (name === 'codex' ? dynamicCodex : getAdapter(name)),
      sleep
    });
    assert.equal(result.status, 'ADVICE_READY');
    assert.equal(result.receipt.backend, 'omp');
    assert.equal(result.attempts.length, 3);
    assert.equal(result.attempts[0].slot, 'primary');
    assert.equal(result.attempts[0].phase, 'model');
    assert.equal(result.attempts[0].model_started, true);
    assert.equal(result.attempts[0].terminal_classification, 'transient');

    assert.equal(result.attempts[1].slot, 'primary');
    assert.equal(result.attempts[1].phase, 'preflight');
    assert.equal(result.attempts[1].model_started, false);
    assert.equal(result.attempts[1].terminal_classification, 'skipped');

    assert.equal(result.attempts[2].slot, 'backup');
    assert.equal(result.attempts[2].phase, 'model');
    assert.equal(result.attempts[2].model_started, true);
    assert.equal(result.attempts[2].terminal_classification, 'success');
    validateEnvelopeV2(result);
  } finally {
    env.cleanup();
  }
});

test('P0: pre-spawn build error fails closed and never budgets or reports started model', async () => {
  const env = setupTestEnv();
  try {
    const { getAdapter } = require(path.join(ADVISOR_DIR, 'adapter-registry.cjs'));
    const baseCodex = getAdapter('codex');
    const failingBuildCodex = {
      ...baseCodex,
      buildInvocation: async (ctx) => {
        if (ctx.limits?.mode === 'generation') {
          throw createRoutingError('PROCESS_FAILED');
        }
        return baseCodex.buildInvocation(ctx);
      }
    };

    const mock = createMockRunner({
      primaryAttempts: [{ success: true }]
    });

    const result = await runController(JSON.stringify(VALID_CHECKPOINT_V2), {
      environment: env.environment,
      runner: mock.runner,
      getAdapter: (name) => (name === 'codex' ? failingBuildCodex : getAdapter(name))
    });

    assert.equal(result.status, 'FAILED');
    assert.equal(result.error.code, 'PROCESS_FAILED');
    assert.equal(mock.getPrimaryIndex(), 0);
    assert.equal(mock.getBackupIndex(), 0);
    assert.equal(result.attempts.length, 1);
    assert.equal(result.attempts[0].model_started, false);
    assert.equal(result.attempts[0].phase, 'preflight');
    assert.equal(result.attempts[0].terminal_classification, 'fatal');
    validateEnvelopeV2(result);
  } finally {
    env.cleanup();
  }
});

test('P0: qualification cancellation emits preflight attempt and exposes unconfirmed cleanup in JSON', async () => {
  const env = setupTestEnv();
  try {
    const abortCtrl = new AbortController();
    const { getAdapter } = require(path.join(ADVISOR_DIR, 'adapter-registry.cjs'));
    const baseCodex = getAdapter('codex');
    const cancellingCodex = {
      ...baseCodex,
      probeCapabilities: async (ctx) => {
        const res = await baseCodex.probeCapabilities(ctx);
        abortCtrl.abort();
        return res;
      }
    };

    const unconfirmedCleanup = async () => ({ outcome: 'unconfirmed' });
    const mock = createMockRunner();

    const result = await runController(JSON.stringify(VALID_CHECKPOINT_V2), {
      environment: env.environment,
      runner: mock.runner,
      signal: abortCtrl.signal,
      cleanupWorkspace: unconfirmedCleanup,
      getAdapter: (name) => (name === 'codex' ? cancellingCodex : getAdapter(name))
    });

    assert.equal(result.status, 'FAILED');
    assert.equal(result.error.code, 'CANCELLED');
    assert.equal(result.cleanup_outcome, 'unconfirmed');
    assert.equal(mock.getPrimaryIndex(), 0);
    assert.equal(result.attempts.length, 1);
    assert.equal(result.attempts[0].phase, 'preflight');
    assert.equal(result.attempts[0].model_started, false);
    assert.equal(result.attempts[0].terminal_classification, 'cancelled');
    assert.equal(result.attempts[0].cleanup_outcome, 'unconfirmed');

    const serialized = JSON.parse(JSON.stringify(result));
    assert.equal(serialized.attempts[0].cleanup_outcome, 'unconfirmed');
    assert.equal(serialized.attempts[0].terminal_classification, 'cancelled');
  } finally {
    env.cleanup();
  }
});

test('P0: executable drift between qualification and spawn throws EXECUTABLE_UNAVAILABLE', async () => {
  const env = setupTestEnv();
  try {
    const { getAdapter } = require(path.join(ADVISOR_DIR, 'adapter-registry.cjs'));
    const baseCodex = getAdapter('codex');
    const driftingCodex = {
      ...baseCodex,
      buildInvocation: async (ctx) => {
        const inv = await baseCodex.buildInvocation(ctx);
        if (ctx.limits?.mode === 'generation') {
          return { ...inv, executable: 'post-qualification-replacement' };
        }
        return inv;
      }
    };

    const mock = createMockRunner({
      probeResponses: {
        omp: { error: createRoutingError('AUTH_UNAVAILABLE') }
      }
    });

    const result = await runController(JSON.stringify(VALID_CHECKPOINT_V2), {
      environment: env.environment,
      runner: mock.runner,
      getAdapter: (name) => (name === 'codex' ? driftingCodex : getAdapter(name))
    });

    assert.equal(result.status, 'FAILED');
    assert.equal(result.error.code, 'EXECUTABLE_UNAVAILABLE');
    assert.equal(mock.getPrimaryIndex(), 0);
    assert.equal(result.attempts.length, 2);
    assert.equal(result.attempts[0].slot, 'primary');
    assert.equal(result.attempts[0].phase, 'preflight');
    assert.equal(result.attempts[0].terminal_classification, 'skipped');
    assert.equal(result.attempts[1].slot, 'backup');
    assert.equal(result.attempts[1].phase, 'preflight');
    assert.equal(result.attempts[1].terminal_classification, 'fatal');
    validateEnvelopeV2(result);
  } finally {
    env.cleanup();
  }
});
