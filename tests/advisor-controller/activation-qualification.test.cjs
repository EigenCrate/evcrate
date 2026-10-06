'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
  createContext, createRequest, createIsolatedFixture, initializeStateFixture, abandonStateFixture,
  spawnCli, createBaselineStateFixture, completeStateFixtureWithBaseline,
  executeStateGet, computeStateFileHash
} = require('./activation-qualification-helpers.cjs');

test('A02: CLI off admission plus independent get immutability', async (t) => {
  const f = createBaselineStateFixture(t);
  const completedState = completeStateFixtureWithBaseline(f, f.state);

  // 1. Clean CLI invocation without --advice flag admits off mode
  const request = createRequest({
    raw_arguments: 'plans/test/plan.md phase-01',
    context: createContext({ project_root: f.project, plan_path: 'plans/test/plan.md', phase_id: 'phase-01' })
  });
  const cliRes = await spawnCli(JSON.stringify(request), { cwd: f.project, env: { ...process.env, HOME: f.home } });
  assert.equal(cliRes.status, 0);
  const parsed = JSON.parse(cliRes.stdout);
  assert.equal(parsed.mode, 'off');
  assert.equal(parsed.reason, 'NO_FINAL_FLAG');
  assert.equal(parsed.run, null);

  // 2. Independent state get preserves state file bytes and ledger status identically
  const beforeHash = computeStateFileHash(f.stateFile);
  const getResult = executeStateGet(f, completedState.task_run_id);
  assert.equal(getResult.status, 'STATE_READY');
  assert.equal(getResult.state.gate_status, 'completed');
  assert.equal(computeStateFileHash(f.stateFile), beforeHash, 'state get must preserve state bytes identically');
});

test('A03: unrelated interrupted run is isolated and remains unmodified', async (t) => {
  const f = createIsolatedFixture(t);
  initializeStateFixture(f);
  const beforeHashA = computeStateFileHash(f.stateFile);

  const request = createRequest({
    raw_arguments: 'plans/test/plan.md phase-02',
    context: createContext({ project_root: f.project, plan_path: 'plans/test/plan.md', phase_id: 'phase-02' })
  });
  const result = await spawnCli(JSON.stringify(request), { cwd: f.project, env: { ...process.env, HOME: f.home } });
  assert.equal(result.status, 0);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.mode, 'off');
  assert.equal(parsed.reason, 'NO_FINAL_FLAG');
  assert.equal(parsed.run, null);
  assert.equal(computeStateFileHash(f.stateFile), beforeHashA, 'unrelated run state must remain untouched');
});

test('A04: historical UUID in arguments without handoff has zero activation authority', async (t) => {
  const f = createIsolatedFixture(t);
  const uuidInArg = '3821ec42-ac43-4b79-a067-32a5c6ef18fa';
  const request = createRequest({
    raw_arguments: `continue review for ${uuidInArg} from report`,
    context: createContext({ project_root: f.project }),
    handoff: null
  });
  const result = await spawnCli(JSON.stringify(request), { cwd: f.project, env: { ...process.env, HOME: f.home } });
  assert.equal(result.status, 0);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.mode, 'off');
  assert.equal(parsed.reason, 'NO_FINAL_FLAG');
  assert.equal(parsed.run, null);
  assert.equal(parsed.work_arguments, `continue review for ${uuidInArg} from report`);
  assert.equal(fs.existsSync(path.join(f.home, '.evcrate')), false);
});

test('A05: CLI off ignores existing pending state', async (t) => {
  const f = createIsolatedFixture(t);
  const state = initializeStateFixture(f);
  const beforeHash = computeStateFileHash(f.stateFile);

  // CLI invocation without --advice flag resolves to off mode, ignoring existing pending state without modification
  const request = createRequest({
    raw_arguments: 'execute phase-01 work',
    context: createContext({ project_root: f.project, phase_id: state.phase_id }),
    handoff: null
  });
  const result = await spawnCli(JSON.stringify(request), { cwd: f.project, env: { ...process.env, HOME: f.home } });
  assert.equal(result.status, 0);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.mode, 'off');
  assert.equal(parsed.reason, 'NO_FINAL_FLAG');
  assert.equal(parsed.run, null);
  assert.equal(computeStateFileHash(f.stateFile), beforeHash, 'pending state must remain untouched when CLI resolves off');
});

test('A14: next independent default phase after prior completed advice resolves off without carry-over', async (t) => {
  const f = createBaselineStateFixture(t);
  completeStateFixtureWithBaseline(f, f.state);

  const lockFile = path.join(path.dirname(f.stateFile), 'state.lock');
  const liveLock = JSON.stringify({ token: 'l'.repeat(32), process: { pid: process.pid, start: null } });
  fs.writeFileSync(lockFile, liveLock, { mode: 0o600 });

  const past = new Date(Date.now() - 5000);
  fs.utimesSync(f.stateFile, past, past);
  fs.utimesSync(lockFile, past, past);

  const stateBytesBefore = fs.readFileSync(f.stateFile);
  const stateStatBefore = fs.statSync(f.stateFile);
  const lockBytesBefore = fs.readFileSync(lockFile);
  const lockStatBefore = fs.statSync(lockFile);

  const request = createRequest({
    raw_arguments: 'plans/test/plan.md phase-02',
    context: createContext({ project_root: f.project, plan_path: 'plans/test/plan.md', phase_id: 'phase-02' }),
    handoff: null
  });
  const result = await spawnCli(JSON.stringify(request), { cwd: f.project, env: { ...process.env, HOME: f.home } });
  assert.equal(result.status, 0);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.mode, 'off');
  assert.equal(parsed.reason, 'NO_FINAL_FLAG');
  assert.equal(parsed.run, null);

  assert.deepEqual(fs.readFileSync(f.stateFile), stateBytesBefore, 'state.json bytes must be preserved across off invocation');
  assert.equal(fs.statSync(f.stateFile).mtimeMs, stateStatBefore.mtimeMs, 'state.json mtime must be preserved across off invocation');
  assert.deepEqual(fs.readFileSync(lockFile), lockBytesBefore, 'state.lock bytes must be preserved across off invocation');
  assert.equal(fs.statSync(lockFile).mtimeMs, lockStatBefore.mtimeMs, 'state.lock mtime must be preserved across off invocation');
});

test('A17: abandonment vs genuine complete ledger in same-run rejection', async (t) => {
  const fComplete = createBaselineStateFixture(t);
  const completedState = completeStateFixtureWithBaseline(fComplete, fComplete.state);

  const fAbandon = createIsolatedFixture(t);
  const initAbandon = initializeStateFixture(fAbandon);
  const abandonedState = abandonStateFixture(fAbandon, initAbandon);

  // Both have gate_status 'completed'
  assert.equal(completedState.gate_status, 'completed');
  assert.equal(abandonedState.gate_status, 'completed');

  // Complete terminal op is 'complete', while abandon terminal op is 'human-decision'
  assert.equal(completedState.operation_ledger.at(-1).operation, 'complete');
  assert.equal(abandonedState.operation_ledger.at(-1).operation, 'human-decision');

  // Both are rejected with ADVICE_RUN_COMPLETED when supplied as same-run handoff
  const context = createContext({ project_root: fComplete.project });
  const runComplete = {
    task_run_id: completedState.task_run_id, project_id: completedState.project_id,
    task_revision: completedState.task_revision, scope_revision: completedState.scope_revision,
    evidence_revision: completedState.evidence_revision
  };
  const completeCliRes = await spawnCli(JSON.stringify(createRequest({
    context, handoff: { kind: 'same-run', context, run: runComplete }
  })), { cwd: fComplete.project, env: { HOME: fComplete.home, PATH: '' } });
  assert.equal(completeCliRes.status, 1);
  assert.equal(JSON.parse(completeCliRes.stdout).error.code, 'ADVICE_RUN_COMPLETED');

  const runAbandon = {
    task_run_id: abandonedState.task_run_id, project_id: abandonedState.project_id,
    task_revision: abandonedState.task_revision, scope_revision: abandonedState.scope_revision,
    evidence_revision: abandonedState.evidence_revision
  };
  const abandonCliRes = await spawnCli(JSON.stringify(createRequest({
    context: createContext({ project_root: fAbandon.project }),
    handoff: { kind: 'same-run', context: createContext({ project_root: fAbandon.project }), run: runAbandon }
  })), { cwd: fAbandon.project, env: { HOME: fAbandon.home, PATH: '' } });
  assert.equal(abandonCliRes.status, 1);
  assert.equal(JSON.parse(abandonCliRes.stdout).error.code, 'ADVICE_RUN_COMPLETED');
});

// A19 verifies controller get behavior under explicit/inherited mode (get reaps dead lock,
// live lock and corrupt state fail closed). Off mode does not invoke get.
test('A19: dead lock reaped on get, live lock and corrupt state fail closed', (t) => {
  const f = createIsolatedFixture(t);
  const state = initializeStateFixture(f);
  const lockFile = path.join(path.dirname(f.stateFile), 'state.lock');

  // Case 1: Dead lock reaped by get
  const deadLock = { token: 'd'.repeat(32), process: { pid: 9999999, start: '1000' } };
  fs.writeFileSync(lockFile, JSON.stringify(deadLock), { mode: 0o600 });
  const getDead = executeStateGet(f, state.task_run_id);
  assert.equal(getDead.status, 'STATE_READY');
  assert.equal(fs.existsSync(lockFile), false, 'dead lock must be reaped');

  // Case 2: Live lock fails closed
  const liveLock = { token: 'l'.repeat(32), process: { pid: process.pid, start: null } };
  fs.writeFileSync(lockFile, JSON.stringify(liveLock), { mode: 0o600 });
  assert.throws(() => executeStateGet(f, state.task_run_id), (err) => err.code === 'STATE_LOCKED');
  fs.unlinkSync(lockFile);

  // Case 3: Corrupt state fails closed
  fs.writeFileSync(f.stateFile, '{ corrupt json');
  assert.throws(() => executeStateGet(f, state.task_run_id), (err) => err.code === 'STATE_INVALID');
});
