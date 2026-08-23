'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const state = require('../advise-state.cjs');

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'evcrate-advise-test-'));
  const projectRoot = path.join(root, 'project');
  const runtimeRoot = path.join(root, 'runtime');
  fs.mkdirSync(projectRoot);
  fs.mkdirSync(path.join(projectRoot, '.evcrate'));
  return { root, projectRoot, runtimeRoot };
}
function clean(fixtureRoot) { fs.rmSync(fixtureRoot, { recursive: true, force: true }); }
function expectCode(callback, code) { assert.throws(callback, (cause) => cause.code === code); }
function reportContent(extra = '') { return ['# Advice', '## Reframed problem', '## Recommendation', '## Alternatives/tradeoffs', '## Risks', '## Assumptions/evidence gaps', '## Success checks', '## Next actions', '## Unresolved questions', extra].filter(Boolean).join('\n'); }
function reportPathFor(invocationId, stamp = '20260101-0000') { return `plans/reports/advise-${stamp}-${invocationId}.md`; }

test('initializes owner-only bounded redacted state atomically', () => {
  const f = fixture();
  try {
    const created = state.init({ projectRoot: f.projectRoot, runtimeRoot: f.runtimeRoot, input: 'token=super-secret Authorization: Bearer bearer-secret Authorization: Bearer "quoted-secret" token: {"value":"nested-secret"} "password":"json-secret"', now: 0 });
    const directory = path.join(f.runtimeRoot, 'v1', created.projectKey, created.invocationId);
    const statePath = path.join(directory, 'state.json');
    assert.equal(fs.statSync(directory).mode & 0o777, 0o700);
    assert.equal(fs.statSync(statePath).mode & 0o777, 0o600);
    assert.equal(created.originalInput.includes('super-secret'), false);
    assert.equal(created.originalInput.includes('bearer-secret'), false);
    assert.equal(created.originalInput.includes('quoted-secret'), false);
    assert.equal(created.originalInput.includes('nested-secret'), false);
    assert.equal(created.originalInput.includes('json-secret'), false);
    assert.equal(created.projectKey.includes(f.projectRoot), false);
    assert.equal(fs.readdirSync(directory).some((name) => name.includes('.tmp-')), false);
    assert.ok(state.readState({ projectRoot: f.projectRoot, runtimeRoot: f.runtimeRoot, invocationId: created.invocationId }));
  } finally { clean(f.root); }
});

test('enforces one pending question, replay protection, and caps', () => {
  const f = fixture();
  try {
    const options = { projectRoot: f.projectRoot, runtimeRoot: f.runtimeRoot, input: 'problem', now: 0 };
    const created = state.init(options);
    const base = { ...options, invocationId: created.invocationId };
    state.ask({ ...base, questionId: 'q-1', type: 'discovery', text: 'What matters?' });
    expectCode(() => state.ask({ ...base, questionId: 'q-2', type: 'discovery', text: 'Another?' }), 'QUESTION_PENDING');
    state.answer({ ...base, questionId: 'q-1', answer: 'safety' });
    expectCode(() => state.answer({ ...base, questionId: 'q-1', answer: 'replay' }), 'ANSWER_REPLAY');
    for (let index = 2; index <= 8; index += 1) {
      state.ask({ ...base, questionId: `q-${index}`, type: 'discovery', text: `Question ${index}` });
      state.answer({ ...base, questionId: `q-${index}`, answer: 'answer' });
    }
    expectCode(() => state.ask({ ...base, questionId: 'q-9', type: 'discovery', text: 'Too many' }), 'QUESTION_CAP');
    const current = state.readState(base);
    assert.equal(current.questions.length, 8);
    assert.equal(current.pendingQuestion, null);
  } finally { clean(f.root); }
});

test('rejects traversal, symlinked state, and cross-project resumes', () => {
  const f = fixture();
  try {
    const created = state.init({ projectRoot: f.projectRoot, runtimeRoot: f.runtimeRoot, input: 'problem' });
    expectCode(() => state.reportPath('../outside.md'), 'INVALID_REPORT_PATH');
    expectCode(() => state.reportPath('/outside.md'), 'INVALID_REPORT_PATH');
    const directory = path.join(f.runtimeRoot, 'v1', created.projectKey, created.invocationId);
    const statePath = path.join(directory, 'state.json');
    const backup = path.join(directory, 'state-copy.json');
    fs.renameSync(statePath, backup);
    fs.symlinkSync(backup, statePath);
    expectCode(() => state.readState({ projectRoot: f.projectRoot, runtimeRoot: f.runtimeRoot, invocationId: created.invocationId }), 'STATE_FILE_TYPE');
    fs.unlinkSync(statePath);
    fs.renameSync(backup, statePath);
    const otherProject = path.join(f.root, 'other-project');
    fs.mkdirSync(otherProject);
    fs.mkdirSync(path.join(otherProject, '.evcrate'));
    expectCode(() => state.readState({ projectRoot: otherProject, runtimeRoot: f.runtimeRoot, invocationId: created.invocationId }), 'STATE_MISSING');
  } finally { clean(f.root); }
});

test('rejects a symlinked invocation directory before lock inspection', () => {
  const f = fixture();
  try {
    const options = { projectRoot: f.projectRoot, runtimeRoot: f.runtimeRoot, input: 'problem', now: 0 };
    const created = state.init(options);
    const directory = path.join(f.runtimeRoot, 'v1', created.projectKey, created.invocationId);
    const outsideDirectory = path.join(f.root, 'outside-invocation');
    fs.renameSync(directory, outsideDirectory);
    fs.symlinkSync(outsideDirectory, directory, 'dir');
    expectCode(() => state.ask({ ...options, invocationId: created.invocationId, questionId: 'q-1', type: 'discovery', text: 'What matters?' }), 'STATE_FILE_TYPE');
    assert.equal(fs.existsSync(path.join(outsideDirectory, 'state.lock')), false);
  } finally { clean(f.root); }
});

test('completes to a minimal tombstone and lazily removes expired artifacts', () => {
  const f = fixture();
  try {
    const options = { projectRoot: f.projectRoot, runtimeRoot: f.runtimeRoot, input: 'problem', now: 0 };
    const created = state.init(options);
    const base = { ...options, invocationId: created.invocationId };
    state.ask({ ...base, questionId: 'q-1', type: 'discovery', text: 'What is the constraint?' });
    state.answer({ ...base, questionId: 'q-1', answer: 'safety' });
    state.ask({ ...base, questionId: 'q-2', type: 'confirm_reframe', text: 'Confirm the reframed problem.', reframe: 'Keep the state boundary safe.' });
    state.answer({ ...base, questionId: 'q-2', answer: 'confirm', phase: 'confirm_reframe' });
    const reportPath = reportPathFor(created.invocationId);
    expectCode(() => state.complete({ ...base, reportPath, now: 1000 }), 'REPORT_INVALID');
    state.writeReport({ ...base, reportPath, content: reportContent() });
    const ready = { protocol: 'evcrate-advise-relay', version: 1, status: 'ADVICE_READY', invocationId: created.invocationId, reportPath, summary: 'Ready.' };
    assert.deepEqual(state.validateEnvelope({ ...base, envelope: ready }), ready);
    const tombstone = state.complete({ ...base, reportPath, now: 1000 });
    const directory = path.join(f.runtimeRoot, 'v1', created.projectKey, created.invocationId);
    assert.equal(fs.existsSync(path.join(directory, 'state.json')), false);
    assert.equal(JSON.parse(fs.readFileSync(path.join(directory, 'tombstone.json'))).reportPath, tombstone.reportPath);
    expectCode(() => state.readState(base), 'STATE_COMPLETED');
    fs.utimesSync(path.join(directory, 'tombstone.json'), new Date(0), new Date(0));
    assert.equal(state.cleanup({ ...options, now: state.TOMBSTONE_RETENTION_MS + 1001 }), 1);
    assert.equal(fs.existsSync(directory), false);
  } finally { clean(f.root); }
});

test('preserves owned locks and recovers only dead stale locks', () => {
  const f = fixture();
  try {
    const options = { projectRoot: f.projectRoot, runtimeRoot: f.runtimeRoot, input: 'problem', now: 0 };
    const created = state.init(options);
    const base = { ...options, invocationId: created.invocationId };
    const directory = path.join(f.runtimeRoot, 'v1', created.projectKey, created.invocationId);
    const lock = path.join(directory, 'state.lock');
    fs.writeFileSync(lock, JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() }), { mode: 0o600 });
    expectCode(() => state.ask({ ...base, questionId: 'busy', type: 'discovery', text: 'Busy?' }), 'STATE_BUSY');
    assert.equal(fs.existsSync(lock), true);
    fs.unlinkSync(lock);
    fs.writeFileSync(lock, JSON.stringify({ pid: process.pid + 100000000, createdAt: new Date(0).toISOString() }), { mode: 0o600 });
    fs.utimesSync(lock, new Date(0), new Date(0));
    state.ask({ ...base, questionId: 'stale', type: 'discovery', text: 'Recovered?' });
    assert.equal(fs.existsSync(lock), false);
  } finally { clean(f.root); }
});

test('retains failed state for seven days and enforces serialized bound', () => {
  const f = fixture();
  try {
    const options = { projectRoot: f.projectRoot, runtimeRoot: f.runtimeRoot, input: 'x'.repeat(100000), now: 0 };
    const created = state.init(options);
    assert.ok(Buffer.byteLength(JSON.stringify(created)) <= state.MAX_BYTES);
    const base = { ...options, invocationId: created.invocationId, now: 1000 };
    state.fail({ ...base, code: 'MODEL_UNAVAILABLE' });
    const statePath = path.join(f.runtimeRoot, 'v1', created.projectKey, created.invocationId, 'state.json');
    const failed = JSON.parse(fs.readFileSync(statePath));
    failed.updatedAt = new Date(0).toISOString();
    fs.writeFileSync(statePath, JSON.stringify(failed, null, 2), { mode: 0o600 });
    assert.equal(state.cleanup({ ...options, now: state.FAILURE_RETENTION_MS }), 0);
    assert.equal(state.cleanup({ ...options, now: state.FAILURE_RETENTION_MS + 1 }), 1);
  } finally { clean(f.root); }
});

test('parses only the exact final standalone relay flag', () => {
  assert.deepEqual(state.parseArguments('design a cache --agent'), { mode: 'relay', workArguments: 'design a cache' });
  assert.deepEqual(state.parseArguments('design a cache\n--agent  '), { mode: 'relay', workArguments: 'design a cache' });
  assert.deepEqual(state.parseArguments('a --agent later'), { mode: 'inline', workArguments: 'a --agent later' });
  assert.deepEqual(state.parseArguments('"--agent"'), { mode: 'inline', workArguments: '"--agent"' });
  assert.deepEqual(state.parseArguments('path--agent'), { mode: 'inline', workArguments: 'path--agent' });
  assert.deepEqual(state.parseArguments('--Agent'), { mode: 'inline', workArguments: '--Agent' });
  expectCode(() => state.parseArguments('a --agent --agent'), 'DUPLICATE_AGENT');
});

test('accepts a validated first relay question before it is persisted', () => {
  const f = fixture();
  try {
    const options = { projectRoot: f.projectRoot, runtimeRoot: f.runtimeRoot, input: 'problem', now: 0 };
    const created = state.init(options);
    const base = { ...options, invocationId: created.invocationId };
    const statePath = path.join(f.runtimeRoot, 'v1', created.projectKey, created.invocationId, 'state.json');
    const envelope = { protocol: 'evcrate-advise-relay', version: 1, status: 'NEEDS_USER_INPUT', invocationId: created.invocationId, statePath, question: { id: 'first', type: 'discovery', text: 'What matters?' } };
    assert.deepEqual(state.validateEnvelope({ ...base, envelope }), envelope);
    state.ask({ ...base, questionId: 'first', type: 'discovery', text: 'What matters?' });
    assert.equal(state.readState(base).pendingQuestion.id, 'first');
  } finally { clean(f.root); }
});

test('rejects invalid interview transitions and enforces safe cleanup roots', () => {
  const f = fixture();
  try {
    const options = { projectRoot: f.projectRoot, runtimeRoot: f.runtimeRoot, input: 'problem', now: 0 };
    const created = state.init(options);
    const base = { ...options, invocationId: created.invocationId };
    expectCode(() => state.ask({ ...base, questionId: 'confirm-first', type: 'confirm_reframe', text: 'Confirm?', reframe: 'r' }), 'STATE_TRANSITION');
    state.ask({ ...base, questionId: 'q-1', type: 'discovery', text: 'What matters?' });
    state.answer({ ...base, questionId: 'q-1', answer: 'safety' });
    expectCode(() => state.ask({ ...base, questionId: 'confirm-no-reframe', type: 'confirm_reframe', text: 'Confirm?' }), 'STATE_TRANSITION');
    state.ask({ ...base, questionId: 'q-2', type: 'confirm_reframe', text: 'Confirm?', reframe: 'Keep state safe.' });
    expectCode(() => state.answer({ ...base, questionId: 'q-2', answer: 'confirm' }), 'STATE_TRANSITION');
    state.answer({ ...base, questionId: 'q-2', answer: 'correct', phase: 'discovery' });

    const outside = path.join(f.root, 'outside');
    const outsideKey = path.join(outside, 'v1', created.projectKey);
    fs.mkdirSync(outsideKey, { recursive: true, mode: 0o700 });
    fs.rmSync(path.join(f.runtimeRoot, 'v1'), { recursive: true, force: true });
    fs.symlinkSync(path.join(outside, 'v1'), path.join(f.runtimeRoot, 'v1'), 'dir');
    expectCode(() => state.cleanup(options), 'STATE_FILE_TYPE');
    assert.equal(fs.existsSync(outsideKey), true);
  } finally { clean(f.root); }
});

test('validates relay envelopes and writes sanitized schema-complete reports', () => {
  const f = fixture();
  try {
    const options = { projectRoot: f.projectRoot, runtimeRoot: f.runtimeRoot, input: 'problem', now: 0 };
    const created = state.init(options);
    const base = { ...options, invocationId: created.invocationId };
    state.ask({ ...base, questionId: 'q-1', type: 'discovery', text: 'What matters?' });
    const statePath = path.join(f.runtimeRoot, 'v1', created.projectKey, created.invocationId, 'state.json');
    const envelope = { protocol: 'evcrate-advise-relay', version: 1, status: 'NEEDS_USER_INPUT', invocationId: created.invocationId, statePath, question: { id: 'q-1', type: 'discovery', text: 'What matters?' } };
    assert.deepEqual(state.validateEnvelope({ ...base, envelope }), envelope);
    expectCode(() => state.validateEnvelope({ ...base, envelope: { ...envelope, extra: true } }), 'ENVELOPE_INVALID');
    const report = reportContent('token=super-secret');
    const reportPath = reportPathFor(created.invocationId);
    const written = state.writeReport({ ...base, reportPath, content: report });
    assert.equal(written.reportPath, reportPath);
    const reportFile = path.join(f.projectRoot, written.reportPath);
    assert.equal(fs.readFileSync(reportFile, 'utf8').includes('super-secret'), false);
    expectCode(() => state.validateReport({ ...options, reportPath: '../outside.md' }), 'INVALID_REPORT_PATH');
    expectCode(() => state.writeReport({ ...base, reportPath: 'src/advise-arbitrary.md', content: reportContent() }), 'INVALID_REPORT_PATH');
    const invalidReportPath = reportPathFor(created.invocationId, '20260102-0000');
    expectCode(() => state.writeReport({ ...base, reportPath: invalidReportPath, content: '# Missing sections' }), 'REPORT_INVALID');
    assert.equal(fs.existsSync(path.join(f.projectRoot, invalidReportPath)), false);
    expectCode(() => state.writeReport({ ...base, reportPath, content: reportContent('new') }), 'REPORT_EXISTS');
  } finally { clean(f.root); }
});

test('recovers a completion interrupted between atomic rename steps', () => {
  const f = fixture();
  try {
    const options = { projectRoot: f.projectRoot, runtimeRoot: f.runtimeRoot, input: 'problem', now: 0 };
    const created = state.init(options);
    const directory = path.join(f.runtimeRoot, 'v1', created.projectKey, created.invocationId);
    const statePath = path.join(directory, 'state.json');
    const tombstone = { schema: 'evcrate-advise-tombstone/v1', version: 1, projectKey: created.projectKey, invocationId: created.invocationId, completedAt: new Date(1000).toISOString(), reportPath: reportPathFor(created.invocationId) };
    fs.writeFileSync(statePath, JSON.stringify(tombstone), { mode: 0o600 });
    expectCode(() => state.readState({ ...options, invocationId: created.invocationId }), 'STATE_COMPLETED');
    assert.equal(fs.existsSync(statePath), false);
    assert.equal(fs.existsSync(path.join(directory, 'tombstone.json')), true);
  } finally { clean(f.root); }
});
