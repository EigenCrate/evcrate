'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { spawn, spawnSync } = require('node:child_process');
const test = require('node:test');

const MODULE = path.resolve(__dirname, '../../.evcrate/source/.evcrate/bin/lib/advisor/state-io.cjs');
const { stateLocation, transactState, processIdentity, processStatus } = require(MODULE);
const { captureBaseline, assertBaselineFresh, validateBaseline } = require(path.join(path.dirname(MODULE), 'state-baseline.cjs'));
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'evcrate-state-io-'));
  const home = path.join(root, 'home');
  const project = path.join(root, 'project');
  fs.mkdirSync(home, { mode: 0o700 });
  fs.mkdirSync(project, { mode: 0o700 });
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const context = { cwd: project, environment: { ...process.env, HOME: home } };
  const id = randomUUID();
  const location = stateLocation(context, id);
  return { root, home, project, context, id, location, state: path.join(location.taskDirectory, 'state.json') };
}
function initialize(f) {
  return transactState(f.location, { create: true }, (current) => {
    assert.equal(current, null);
    return { state: { revision: 1, sentinel: 'original' }, result: 1 };
  });
}
function get(f) { return transactState(f.location, {}, (current) => ({ state: null, result: current })); }
function rejects(operation, code) { assert.throws(operation, (error) => error.name === 'AdvisorRoutingError' && (!code || error.code === code)); }
function child(f, body) {
  return spawnSync(process.execPath, ['-e', `const {stateLocation,transactState}=require(${JSON.stringify(MODULE)});const location=stateLocation(JSON.parse(process.argv[1]),process.argv[2]);${body}`, JSON.stringify(f.context), f.id], { encoding: 'utf8', timeout: 10000 });
}
function git(f, ...args) {
  const result = spawnSync('git', ['-C', f.project, ...args], { encoding: 'utf8', timeout: 10000, env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' } });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

test('state is isolated, private, bounded and never implicitly initialized by get', (t) => {
  const f = fixture(t);
  rejects(() => get(f), 'STATE_NOT_FOUND');
  assert.equal(fs.existsSync(path.join(f.home, '.evcrate')), false);
  assert.equal(initialize(f), 1);
  assert.deepEqual(get(f), { revision: 1, sentinel: 'original' });
  assert.equal(fs.statSync(f.state).mode & 0o777, 0o600);
  assert.equal(fs.statSync(f.location.taskDirectory).mode & 0o777, 0o700);
  const before = fs.readFileSync(f.state);
  rejects(() => transactState(f.location, {}, () => ({ state: { text: 'x'.repeat(65536) }, result: null })), 'STATE_INVALID');
  assert.deepEqual(fs.readFileSync(f.state), before);
  const other = stateLocation(f.context, randomUUID());
  rejects(() => transactState(other, {}, () => ({ state: null, result: null })), 'STATE_NOT_FOUND');
  fs.mkdirSync(path.join(f.root, 'other'), { mode: 0o700 });
  const otherProject = stateLocation({ ...f.context, cwd: path.join(f.root, 'other') }, f.id);
  assert.notEqual(otherProject.projectId, f.location.projectId);
  assert.notEqual(otherProject.taskDirectory, f.location.taskDirectory);
});

test('state location rejects traversal, forged authority and symlinked ancestors without touching sentinels', (t) => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.home, 'sentinel'), 'user work');
  for (const id of ['../state', '00000000-0000-0000-0000-000000000000', `${f.id}/extra`]) {
    rejects(() => stateLocation(f.context, id), 'STATE_INVALID');
  }
  rejects(() => stateLocation({ ...f.context, cwd: 'relative' }, f.id));
  rejects(() => stateLocation({ ...f.context, environment: { HOME: path.join(f.home, '..', 'home') + '/..' } }, f.id));
  fs.symlinkSync(f.home, path.join(f.root, 'home-link'));
  rejects(() => stateLocation({ ...f.context, environment: { HOME: path.join(f.root, 'home-link') } }, f.id));
  rejects(() => transactState({ ...f.location }, { create: true }, () => ({ state: {}, result: null })), 'STATE_INVALID');
  assert.equal(fs.readFileSync(path.join(f.home, 'sentinel'), 'utf8'), 'user work');
});


test('symlink and hardlink state files cannot overwrite user files', (t) => {
  const f = fixture(t);
  initialize(f);
  const sentinel = path.join(f.root, 'sentinel');
  fs.writeFileSync(sentinel, '{"revision":9}', { mode: 0o600 });
  fs.unlinkSync(f.state);
  fs.symlinkSync(sentinel, f.state);
  rejects(() => transactState(f.location, {}, () => ({ state: { revision: 2 }, result: null })));
  fs.unlinkSync(f.state);
  fs.linkSync(sentinel, f.state);
  rejects(() => get(f));
  assert.equal(fs.readFileSync(sentinel, 'utf8'), '{"revision":9}');
});

test('corrupt, duplicate-key, invalid UTF-8 and oversized required state never resets', (t) => {
  const f = fixture(t);
  initialize(f);
  for (const bytes of [Buffer.from('{'), Buffer.from('{"revision":1,"revision":2}'), Buffer.from([0xff]), Buffer.alloc(65537, 0x20), Buffer.from('null')]) {
    fs.writeFileSync(f.state, bytes);
    let called = false;
    rejects(() => transactState(f.location, { create: true }, () => { called = true; return { state: {}, result: null }; }), 'STATE_INVALID');
    assert.equal(called, false);
    assert.deepEqual(fs.readFileSync(f.state), bytes);
  }
});

test('async transactions are rejected before callback starts and ordinary callback errors release lock', (t) => {
  const f = fixture(t);
  initialize(f);
  let started = false;
  rejects(() => transactState(f.location, {}, async () => { started = true; return { state: {}, result: null }; }), 'STATE_INVALID');
  assert.equal(started, false);
  rejects(() => transactState(f.location, {}, () => { throw new Error('private details'); }), 'STATE_IO_FAILED');
  assert.equal(get(f).revision, 1);
});

test('replacing state during a transaction cannot clobber the replacement', (t) => {
  const f = fixture(t);
  initialize(f);
  rejects(() => transactState(f.location, {}, () => {
    fs.unlinkSync(f.state);
    fs.writeFileSync(f.state, '{"user":"replacement"}', { mode: 0o600 });
    return { state: { revision: 2 }, result: null };
  }), 'STATE_CONFLICT');
  assert.equal(fs.readFileSync(f.state, 'utf8'), '{"user":"replacement"}');
});

test('ancestor swap during transaction preserves the new target and detached original', (t) => {
  const f = fixture(t);
  initialize(f);
  const target = path.join(f.root, 'target');
  fs.mkdirSync(target, { mode: 0o700 });
  fs.writeFileSync(path.join(target, 'state.json'), 'user target', { mode: 0o600 });
  rejects(() => transactState(f.location, {}, () => {
    fs.renameSync(f.location.taskDirectory, `${f.location.taskDirectory}.saved`);
    fs.symlinkSync(target, f.location.taskDirectory);
    return { state: { revision: 2 }, result: null };
  }));
  assert.equal(fs.readFileSync(path.join(target, 'state.json'), 'utf8'), 'user target');
  assert.equal(JSON.parse(fs.readFileSync(`${f.location.taskDirectory}.saved/state.json`, 'utf8')).revision, 1);
});

test('live and uncertain locks are never stolen by age', (t) => {
  const f = fixture(t);
  initialize(f);
  const lock = path.join(f.location.taskDirectory, 'state.lock');
  for (const value of ['', JSON.stringify({ token: 'a'.repeat(32), process: processIdentity() }), JSON.stringify({ token: 'a'.repeat(32), process: { pid: process.pid, start: null } })]) {
    fs.writeFileSync(lock, value, { mode: 0o600 });
    fs.utimesSync(lock, new Date(0), new Date(0));
    rejects(() => get(f), 'STATE_LOCKED');
    assert.equal(fs.readFileSync(lock, 'utf8'), value);
    fs.unlinkSync(lock);
  }
  assert.equal(get(f).revision, 1);
  assert.equal(processStatus(processIdentity()), 'live');
  assert.equal(processStatus({ pid: process.pid, start: null }), 'unknown');
  assert.equal(processStatus({ pid: -1, start: null }), 'unknown');
  const identity = processIdentity();
  assert.notEqual(identity.start, null);
  assert.equal(processStatus({ ...identity, start: `${identity.start}0` }), 'dead');
});

test('verified crashed lock is recoverable; crash before atomic rename preserves old state', (t) => {
  const f = fixture(t);
  initialize(f);
  const result = child(f, `const fs=require('node:fs');fs.renameSync=()=>process.exit(23);transactState(location,{},()=>({state:{revision:2},result:null}));`);
  assert.equal(result.status, 23, result.stderr);
  assert.equal(JSON.parse(fs.readFileSync(f.state, 'utf8')).revision, 1);
  assert.equal(get(f).revision, 1);
  assert.equal(fs.existsSync(path.join(f.location.taskDirectory, 'state.lock')), false);
});

test('crash in no-replace publication leaves linked state fail-closed, never reset', (t) => {
  const f = fixture(t);
  const result = child(f, `const fs=require('node:fs');const unlink=fs.unlinkSync;fs.unlinkSync=function(file){if(file.includes('/.state-'))process.exit(25);return unlink.apply(this,arguments);};transactState(location,{create:true},()=>({state:{revision:1,sentinel:'published'},result:null}));`);
  assert.equal(result.status, 25, result.stderr);
  assert.equal(fs.statSync(f.state).nlink, 2);
  const published = fs.readFileSync(f.state);
  rejects(() => get(f));
  rejects(() => transactState(f.location, { create: true }, () => ({ state: { revision: 2 }, result: null })));
  assert.deepEqual(fs.readFileSync(f.state), published);
  assert.equal(JSON.parse(published).sentinel, 'published');
});

test('uncertain recovery guard blocks without deleting either lock', (t) => {
  const f = fixture(t);
  initialize(f);
  const result = child(f, 'transactState(location,{},()=>process.exit(24));');
  assert.equal(result.status, 24, result.stderr);
  const guard = path.join(f.location.taskDirectory, 'state-recovery.lock');
  const lock = path.join(f.location.taskDirectory, 'state.lock');
  const lockBytes = fs.readFileSync(lock);
  const stateBytes = fs.readFileSync(f.state);
  for (const value of ['', JSON.stringify({ token: 'a'.repeat(32), process: { pid: process.pid, start: null } })]) {
    fs.writeFileSync(guard, value, { mode: 0o600 });
    rejects(() => get(f), 'STATE_LOCKED');
    assert.deepEqual(fs.readFileSync(lock), lockBytes);
    assert.deepEqual(fs.readFileSync(f.state), stateBytes);
    assert.equal(fs.readFileSync(guard, 'utf8'), value);
  }
});

test('independent processes serialize revision compare-and-swap, including stale-lock recovery', async (t) => {
  const f = fixture(t);
  initialize(f);
  assert.equal(child(f, 'transactState(location,{},()=>process.exit(24));').status, 24);
  const source = `const {stateLocation,transactState}=require(${JSON.stringify(MODULE)});const location=stateLocation(JSON.parse(process.argv[1]),process.argv[2]);try{const result=transactState(location,{},s=>s.revision===1?{state:{revision:2},result:'won'}:{state:null,result:'stale'});process.stdout.write(result);}catch(e){process.stdout.write(e.code);}`;
  const results = await Promise.all(Array.from({ length: 6 }, () => new Promise((resolve, reject) => {
    const processChild = spawn(process.execPath, ['-e', source, JSON.stringify(f.context), f.id]);
    let stdout = '';
    let stderr = '';
    processChild.stdout.on('data', (chunk) => { stdout += chunk; });
    processChild.stderr.on('data', (chunk) => { stderr += chunk; });
    processChild.once('error', reject);
    processChild.once('close', (code) => code === 0 ? resolve(stdout) : reject(new Error(stderr)));
  })));
  assert.equal(results.filter((value) => value === 'won').length, 1, JSON.stringify(results));
  assert.ok(results.every((value) => ['won', 'stale', 'STATE_LOCKED'].includes(value)), JSON.stringify(results));
  assert.equal(get(f).revision, 2);
});

test('selected baseline records content and absence; unrelated edits do not invalidate it', (t) => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.project, 'selected.txt'), 'pre-existing user edit');
  const records = captureBaseline(f.project, ['missing/soon.txt', 'selected.txt']);
  assert.equal(records[0].status, 'missing');
  assert.equal(records[0].digest, null);
  assert.equal(records[1].digest, createHash('sha256').update('pre-existing user edit').digest('hex'));
  fs.writeFileSync(path.join(f.project, 'unrelated.txt'), 'other work');
  assertBaselineFresh(f.project, records);
  fs.writeFileSync(path.join(f.project, 'selected.txt'), 'modified relevant evidence');
  rejects(() => assertBaselineFresh(f.project, records), 'STALE_EVIDENCE_REVISION');
  assert.equal(fs.readFileSync(path.join(f.project, 'unrelated.txt'), 'utf8'), 'other work');
});

test('baseline refuses unsafe paths, directories, symlinks, hardlinks and excessive input before hashing', (t) => {
  const f = fixture(t);
  const sentinel = path.join(f.root, 'sentinel');
  fs.writeFileSync(sentinel, 'user file', { mode: 0o600 });
  fs.mkdirSync(path.join(f.project, 'directory'));
  fs.symlinkSync(sentinel, path.join(f.project, 'link'));
  fs.symlinkSync(f.root, path.join(f.project, 'parent-link'));
  fs.linkSync(sentinel, path.join(f.project, 'hardlink'));
  for (const selected of ['../sentinel', '/absolute', 'a/../b', 'directory', 'link', 'hardlink', 'parent-link/sentinel']) {
    rejects(() => captureBaseline(f.project, [selected]));
  }
  rejects(() => captureBaseline(f.project, Array.from({ length: 33 }, (_, index) => `file-${index}`)), 'STATE_INVALID');
  const huge = path.join(f.project, 'huge');
  fs.writeFileSync(huge, '');
  fs.truncateSync(huge, 16 * 1024 * 1024 + 1);
  rejects(() => captureBaseline(f.project, ['huge']), 'STATE_INVALID');
  rejects(() => validateBaseline([{ path: '../sentinel', digest: null, status: 'missing', git: null }]), 'STATE_INVALID');
  rejects(() => validateBaseline([{ path: 'okay', digest: null, status: 'missing', git: null, extra: true }]), 'STATE_INVALID');
  assert.equal(fs.readFileSync(sentinel, 'utf8'), 'user file');
});

test('Git baseline retains selected dirty, untracked, deleted, staged and renamed observations', (t) => {
  const f = fixture(t);
  git(f, 'init', '--quiet');
  for (const selected of ['dirty.txt', 'deleted.txt', 'old.txt', 'staged.txt']) fs.writeFileSync(path.join(f.project, selected), `${selected}\n`);
  git(f, 'add', '--', '.');
  git(f, '-c', 'user.name=State Test', '-c', 'user.email=state@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'baseline');
  fs.writeFileSync(path.join(f.project, 'dirty.txt'), 'pre-existing dirty work');
  fs.unlinkSync(path.join(f.project, 'deleted.txt'));
  git(f, 'mv', 'old.txt', 'new.txt');
  fs.writeFileSync(path.join(f.project, 'untracked.txt'), 'untracked user work');
  fs.writeFileSync(path.join(f.project, 'staged.txt'), 'index snapshot one');
  git(f, 'add', '--', 'staged.txt');
  fs.writeFileSync(path.join(f.project, 'staged.txt'), 'worktree snapshot');
  const selected = ['dirty.txt', 'deleted.txt', 'old.txt', 'new.txt', 'staged.txt', 'untracked.txt'];
  const records = captureBaseline(f.project, selected);
  const byPath = new Map(records.map((record) => [record.path, record]));
  assert.equal(byPath.get('dirty.txt').git.status, ' M');
  assert.equal(byPath.get('untracked.txt').git.status, '??');
  assert.equal(byPath.get('deleted.txt').status, 'missing');
  assert.equal(byPath.get('deleted.txt').git.status, ' D');
  assert.equal(byPath.get('new.txt').git.original_path, 'old.txt');
  fs.writeFileSync(path.join(f.project, 'unrelated.txt'), 'unrelated');
  assertBaselineFresh(f.project, records);
  fs.writeFileSync(path.join(f.project, 'staged.txt'), 'index snapshot two');
  git(f, 'add', '--', 'staged.txt');
  fs.writeFileSync(path.join(f.project, 'staged.txt'), 'worktree snapshot');
  rejects(() => assertBaselineFresh(f.project, records), 'STALE_EVIDENCE_REVISION');
  assert.equal(fs.readFileSync(path.join(f.project, 'dirty.txt'), 'utf8'), 'pre-existing dirty work');
});

test('source-only Git rename baseline retains origin and rejects destination retargeting', (t) => {
  const f = fixture(t);
  git(f, 'init', '--quiet');
  fs.writeFileSync(path.join(f.project, 'old.txt'), 'original selected content\n');
  git(f, 'add', '--', 'old.txt');
  git(f, '-c', 'user.name=State Test', '-c', 'user.email=state@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'baseline');
  git(f, 'mv', 'old.txt', 'new.txt');
  const records = captureBaseline(f.project, ['old.txt']);
  assert.deepEqual(records.map((record) => record.path), ['old.txt']);
  assert.equal(records[0].status, 'missing');
  assert.equal(records[0].digest, null);
  assert.equal(records[0].git.status, 'R ');
  assert.equal(records[0].git.original_path, 'old.txt');
  // The unselected destination exceeds the content bound; only its staged
  // rename metadata participates, never its worktree content or dirty status.
  fs.truncateSync(path.join(f.project, 'new.txt'), 16 * 1024 * 1024 + 1);
  fs.writeFileSync(path.join(f.project, 'unrelated.txt'), 'unrelated user work');
  git(f, 'add', '--', 'unrelated.txt');
  assertBaselineFresh(f.project, records);
  git(f, 'mv', 'new.txt', 'retargeted.txt');
  rejects(() => assertBaselineFresh(f.project, records), 'STALE_EVIDENCE_REVISION');
});

test('destination-only Git rename baseline retains repo-relative origin without widening selected reads', (t) => {
  const f = fixture(t);
  git(f, 'init', '--quiet');
  fs.mkdirSync(path.join(f.project, 'scope'));
  fs.writeFileSync(path.join(f.project, 'old.txt'), 'original selected content\n');
  git(f, 'add', '--', 'old.txt');
  git(f, '-c', 'user.name=State Test', '-c', 'user.email=state@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'baseline');
  git(f, 'mv', 'old.txt', 'scope/new.txt');
  const scope = path.join(f.project, 'scope');
  const records = captureBaseline(scope, ['new.txt']);
  assert.deepEqual(records.map((record) => record.path), ['new.txt']);
  assert.equal(records[0].digest, createHash('sha256').update('original selected content\n').digest('hex'));
  assert.equal(records[0].git.status, 'R ');
  assert.equal(records[0].git.original_path, 'old.txt');
  fs.writeFileSync(path.join(f.project, 'unrelated.txt'), '');
  fs.truncateSync(path.join(f.project, 'unrelated.txt'), 16 * 1024 * 1024 + 1);
  assertBaselineFresh(scope, records);
  git(f, 'restore', '--staged', '--', 'old.txt');
  rejects(() => assertBaselineFresh(scope, records), 'STALE_EVIDENCE_REVISION');
});

test('compound source-only Git rename baseline retains origin when recreated untracked and rejects retargeting', (t) => {
  const f = fixture(t);
  git(f, 'init', '--quiet');
  fs.writeFileSync(path.join(f.project, 'old.txt'), 'original selected content\n');
  git(f, 'add', '--', 'old.txt');
  git(f, '-c', 'user.name=State Test', '-c', 'user.email=state@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'baseline');
  git(f, 'mv', 'old.txt', 'new.txt');
  fs.writeFileSync(path.join(f.project, 'old.txt'), 'recreated untracked content\n');
  const records = captureBaseline(f.project, ['old.txt']);
  assert.equal(records[0].status, 'file');
  assert.equal(records[0].git.original_path, 'old.txt');
  assert.equal(records[0].git.status, 'R ');
  assertBaselineFresh(f.project, records);
  git(f, 'mv', 'new.txt', 'retargeted.txt');
  rejects(() => assertBaselineFresh(f.project, records), 'STALE_EVIDENCE_REVISION');
});
