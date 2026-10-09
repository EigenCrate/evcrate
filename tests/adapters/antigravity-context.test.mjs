import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { after, before, test } from 'node:test';
import { createProjectionBuildContext, createStagedRoot, getProjectionAdapter, loadTargetManifestRegistry } from '../../dist/index.js';
import { publishFile } from '../../dist/distribution/publication-rules.js';

// File/runtime bridge evidence only: this suite does not launch a native Antigravity binary.
const repository = process.cwd();
const manifest = loadTargetManifestRegistry(join(repository, '.evcrate/targets/manifest.json')).targets.get('antigravity');
const maxBytes = 256 * 1024;
const authority = 'Canonical graph instruction authority — 日本語';
const uris = [
  'https://example.test/.claude/rules/AGENTS.md?q=$$&value=$&',
  'ssh://host/.claude/rules/AGENTS.md',
  'file:///tmp/.claude/rules/AGENTS.md',
];
let suiteRoot;
let stage;
let projected;

before(() => {
  suiteRoot = mkdtempSync(join(tmpdir(), 'evcrate-antigravity-context-'));
  const canonical = join(suiteRoot, 'source', '.claude');
  cpSync(join(repository, '.evcrate/source/.claude'), canonical, { recursive: true });
  writeFileSync(join(canonical, 'AGENTS.md'), [
    '# AGENTS.md', authority,
    'Read `./.claude/rules/AGENTS.md` and `AGENTS.md`.',
    'Already projected: `.antigravity/AGENTS.md` if present; otherwise read `~/.gemini/config/AGENTS.md` (the published install).',
    ...uris,
  ].join('\n'));
  writeFileSync(join(suiteRoot, 'source', 'AGENTS.md'), 'WRONG generated Codex authority');
  stage = createStagedRoot(suiteRoot, '.projection-');
  const context = createProjectionBuildContext(manifest, canonical, stage);
  getProjectionAdapter('antigravity').build(context);
  projected = join(stage.path, '.antigravity');
});
after(() => {
  stage?.cleanup();
  if (suiteRoot) rmSync(suiteRoot, { recursive: true, force: true });
});

function installation(t, scope = 'project') {
  const root = mkdtempSync(join(suiteRoot, 'installed-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const home = join(root, 'home with spaces');
  const workspace = join(root, 'workspace');
  const temp = join(root, 'tmp');
  for (const directory of [home, workspace, temp]) mkdirSync(directory, { recursive: true });
  const resourceRoot = scope === 'home' ? join(home, '.gemini/config') : join(workspace, '.antigravity');
  mkdirSync(resourceRoot, { recursive: true });
  cpSync(join(projected, 'hooks'), join(resourceRoot, 'hooks'), { recursive: true });
  for (const filename of ['AGENTS.md', '.evcrate.json', '.evcrateignore']) {
    cpSync(join(projected, filename), join(resourceRoot, filename));
  }
  let hookFile;
  if (scope === 'home') {
    hookFile = join(resourceRoot, 'hooks.json');
    writeFileSync(hookFile, publishFile(manifest, 'hooks.json', readFileSync(join(projected, 'hooks.json')), resourceRoot).content);
  } else {
    cpSync(join(stage.path, '.agents'), join(workspace, '.agents'), { recursive: true });
    hookFile = join(workspace, '.agents/hooks.json');
  }
  const hooks = JSON.parse(readFileSync(hookFile, 'utf8'));
  const env = {
    PATH: process.env.PATH,
    HOME: home,
    USERPROFILE: home,
    TMPDIR: temp,
    TMP: temp,
    TEMP: temp,
    NODE_PATH: join(repository, 'node_modules'),
    USER: 'context-test',
  };
  return { root, home, workspace, resourceRoot, hooks, hookFile, env };
}

function run(fixture, extra = {}, command = fixture.hooks['evcrate-context'].PreInvocation[0].command) {
  const input = JSON.stringify({
    conversationId: 'context-session', workspacePaths: [fixture.workspace],
    transcriptPath: join(fixture.root, 'transcript.jsonl'), invocationNum: 0, initialNumSteps: 0, ...extra,
  });
  return spawnSync(command, { shell: true, cwd: fixture.workspace, env: fixture.env, input, encoding: 'utf8' });
}

function contexts(result) {
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  const output = JSON.parse(result.stdout);
  assert.deepEqual(Object.keys(output), ['injectSteps']);
  for (const step of output.injectSteps) {
    assert.deepEqual(Object.keys(step), ['ephemeralMessage']);
    assert.equal(typeof step.ephemeralMessage, 'string');
  }
  return output.injectSteps.map((step) => step.ephemeralMessage);
}

function rejected(result) {
  assert.equal(result.status, 2, result.stderr);
  assert.match(result.stderr, /EVCREATE_CONTEXT_REJECTED/u);
  assert.equal(result.stdout, '', 'PreInvocation must not return invented deny or partial context');
}

function transformRealChild(fixture, filename, transform) {
  const child = join(fixture.resourceRoot, 'hooks', `${filename}.original.cjs`);
  const canonical = `${child}.real.cjs`;
  renameSync(child, canonical);
  writeFileSync(child, `
const fs = require('fs');
const { spawnSync } = require('child_process');
const result = spawnSync(process.execPath, [${JSON.stringify(canonical)}], { input: fs.readFileSync(0), encoding: 'utf8', env: process.env });
if (result.stderr) process.stderr.write(result.stderr);
if (result.status !== 0) process.exit(result.status || 2);
${transform}
`);
}

for (const scope of ['project', 'home']) {
  test(`Antigravity ${scope}: native files own instructions; real invocation bridge injects only canonical context`, (t) => {
    const fixture = installation(t, scope);
    assert.deepEqual(Object.keys(fixture.hooks).sort(), ['evcrate-context', 'evcrate-policy']);
    assert.deepEqual(Object.keys(fixture.hooks['evcrate-context']), ['PreInvocation']);
    assert.deepEqual(Object.keys(fixture.hooks['evcrate-policy']), ['PreToolUse']);
    const instructions = readFileSync(join(fixture.resourceRoot, 'AGENTS.md'), 'utf8');
    assert.ok(instructions.includes(authority));
    assert.equal(instructions.includes('WRONG generated Codex authority'), false);
    assert.equal(instructions.includes('.antigravity/.antigravity/'), false);
    assert.equal(instructions.includes('(the published install) if present'), false);
    for (const uri of uris) assert.ok(instructions.includes(uri), uri);
    assert.equal(existsSync(join(stage.path, 'AGENTS.md')), false);
    if (scope === 'project') {
      const ruleFile = join(fixture.workspace, '.agents/rules/evcrate-antigravity.md');
      const rule = readFileSync(ruleFile, 'utf8');
      assert.match(rule, /^---\ntrigger: always_on\ndescription: .+\n---\n/u);
      const includes = [...rule.matchAll(/@\[EVCrate instructions\]\(([^)]+)\)/gu)];
      assert.equal(includes.length, 1);
      assert.equal(resolve(dirname(ruleFile), includes[0][1]), join(fixture.resourceRoot, 'AGENTS.md'));
      assert.equal(rule.includes(authority), false);
    } else {
      assert.equal(existsSync(join(fixture.workspace, '.agents')), false);
      assert.equal(fixture.hookFile, join(fixture.home, '.gemini/config/hooks.json'));
    }
    writeFileSync(join(fixture.workspace, 'AGENTS.md'), 'FOREIGN Codex project payload');
    const otherRoot = scope === 'home' ? join(fixture.workspace, '.antigravity') : join(fixture.home, '.gemini/config');
    mkdirSync(otherRoot, { recursive: true });
    writeFileSync(join(otherRoot, 'AGENTS.md'), 'FOREIGN opposite scope payload');
    const first = contexts(run(fixture));
    assert.equal(first.length, 2);
    assert.match(first[0], /Session startup\./u);
    assert.match(first[1], /Plan Context/u);
    for (const text of first) {
      assert.equal(text.includes(authority), false);
      assert.equal(text.includes('FOREIGN'), false);
    }
    // No fictional resume/clear/compact inference: even extra legacy fields cannot restart session-init.
    for (const source of ['startup', 'resume', 'clear', 'compact']) {
      const later = contexts(run(fixture, { invocationNum: 1, initialNumSteps: 0, source }));
      assert.equal(later.length, 1);
      assert.match(later[0], /Plan Context/u);
      assert.doesNotMatch(later[0], /Session startup\.|CONTEXT COMPACTED/u);
      assert.equal(later[0].includes(authority), false);
    }
    assert.equal(existsSync(join(fixture.resourceRoot, 'workflows/advisor-mentoring.md')), false);
  });
}

test('Antigravity reports unsupported lifecycle semantics instead of registering invented events', () => {
  const { behaviors } = JSON.parse(readFileSync(join(projected, 'migration-behavior-matrix.json'), 'utf8'));
  const hooks = behaviors.filter((entry) => entry.kind === 'hook');
  for (const event of ['SubagentStart', 'PreCompact', 'SessionEnd', 'PostToolUse']) {
    assert.ok(hooks.some((entry) => entry.source === event && entry.status === 'unsupported' && entry.reason));
  }
  assert.ok(hooks.some((entry) => entry.source === 'SessionStart' && entry.target === 'PreInvocation' && entry.reason.includes('invocationNum=0')));
});

for (const [filename, event] of [['session-init.cjs', 'SessionStart'], ['dev-rules-reminder.cjs', 'UserPromptSubmit']]) {
  test(`Antigravity converts real ${filename} structured additionalContext into ephemeralMessage`, (t) => {
    const fixture = installation(t);
    transformRealChild(fixture, filename, `process.stdout.write(JSON.stringify({hookSpecificOutput:{hookEventName:${JSON.stringify(event)},additionalContext:result.stdout}}));`);
    const output = contexts(run(fixture)).join('\n');
    assert.match(output, /Session startup\./u);
    assert.match(output, /Plan Context/u);
    assert.equal(output.includes(authority), false);
    assert.equal(output.includes('"hookSpecificOutput"'), false);
  });
}

for (const problem of ['missing', 'empty', 'whitespace', 'invalid-utf8', 'nul', 'oversized', 'symlink', 'directory']) {
  test(`Antigravity rejects ${problem} installed AGENTS without falling back`, (t) => {
    const fixture = installation(t, 'home');
    const filename = join(fixture.resourceRoot, 'AGENTS.md');
    rmSync(filename);
    const alternate = join(fixture.workspace, '.antigravity/AGENTS.md');
    mkdirSync(dirname(alternate), { recursive: true });
    writeFileSync(alternate, 'Alternate scope is not an instruction fallback');
    writeFileSync(join(fixture.workspace, 'AGENTS.md'), 'Root is not an instruction fallback');
    if (problem === 'empty') writeFileSync(filename, '');
    if (problem === 'whitespace') writeFileSync(filename, ' \n\t');
    if (problem === 'invalid-utf8') writeFileSync(filename, Buffer.from([0xc3, 0x28]));
    if (problem === 'nul') writeFileSync(filename, 'instruction\0text');
    if (problem === 'oversized') writeFileSync(filename, Buffer.alloc(maxBytes + 1, 0x61));
    if (problem === 'symlink') symlinkSync(alternate, filename);
    if (problem === 'directory') mkdirSync(filename);
    rejected(run(fixture));
    rejected(run(fixture, { invocationNum: 1 }));
  });
}

test('Antigravity rejects symlinked installation ancestors and canonical children', (t) => {
  const fixture = installation(t);
  const moved = `${fixture.resourceRoot}-real`;
  renameSync(fixture.resourceRoot, moved);
  symlinkSync(moved, fixture.resourceRoot, 'dir');
  rejected(run(fixture));
  rmSync(fixture.resourceRoot);
  renameSync(moved, fixture.resourceRoot);
  const child = join(fixture.resourceRoot, 'hooks/session-init.cjs.original.cjs');
  renameSync(child, `${child}.real`);
  symlinkSync(`${child}.real`, child);
  rejected(run(fixture));
  // Later invocations genuinely do not execute the unavailable first-invocation child.
  assert.equal(contexts(run(fixture, { invocationNum: 1 })).length, 1);
});

for (const payload of [{ invocationNum: -1 }, { invocationNum: 0.5 }, { invocationNum: null }, { conversationId: '' }, { workspacePaths: [] }]) {
  test(`Antigravity rejects invalid native invocation ${JSON.stringify(payload)}`, (t) => {
    rejected(run(installation(t), payload));
  });
}

const mutations = {
  'child-error': "throw new Error('context failure');",
  'zero-exit-stderr': "process.stderr.write('Context child failed'); process.stdout.write(result.stdout);",
  'invalid-utf8': "process.stdout.write(result.stdout); process.stdout.write(Buffer.from([0xc3,0x28]));",
  oversized: `process.stdout.write(result.stdout.padEnd(${maxBytes + 1}, 'x'));`,
  'invalid-json': "process.stdout.write('{broken' + result.stdout);",
  'wrong-event': "process.stdout.write(JSON.stringify({hookSpecificOutput:{hookEventName:'UserPromptSubmit',additionalContext:result.stdout}}));",
  'invalid-context': "process.stdout.write(JSON.stringify({hookSpecificOutput:{hookEventName:'SessionStart',additionalContext:[result.stdout]}}));",
  blocked: "process.stdout.write(JSON.stringify({decision:'block',hookSpecificOutput:{hookEventName:'SessionStart',additionalContext:result.stdout}}));",
  'combined-limit': `process.stdout.write(result.stdout.padEnd(${maxBytes - 1}, 'x'));`,
};
for (const [problem, mutation] of Object.entries(mutations)) {
  test(`Antigravity visibly rejects ${problem} real-child output instead of injecting partial context`, (t) => {
    const fixture = installation(t);
    transformRealChild(fixture, 'session-init.cjs', mutation);
    rejected(run(fixture));
  });
}

test('Antigravity visibly rejects and terminates a canonical context hook that never completes', { timeout: 40_000 }, (t) => {
  const fixture = installation(t);
  const pidFile = join(fixture.root, 'hanging-context-hook.pid');
  let hangingPid;
  const sourceHook = join(fixture.resourceRoot, 'hooks/session-init.cjs.original.cjs');
  writeFileSync(sourceHook, `
const fs = require('fs');
fs.writeFileSync(${JSON.stringify(pidFile)}, String(process.pid));
setInterval(() => {}, 1000);
`);
  t.after(() => {
    const pid = hangingPid ?? (existsSync(pidFile) ? Number(readFileSync(pidFile, 'utf8')) : undefined);
    if (!Number.isSafeInteger(pid) || pid <= 0) return;
    try { process.kill(pid, 'SIGKILL'); } catch (error) {
      if (error?.code !== 'ESRCH') throw error;
    }
  });

  // The outer bound protects the probe itself without changing the production deadline.
  const command = fixture.hooks['evcrate-context'].PreInvocation[0].command;
  const input = JSON.stringify({
    conversationId: 'context-session',
    workspacePaths: [fixture.workspace],
    transcriptPath: join(fixture.root, 'transcript.jsonl'),
    invocationNum: 0,
    initialNumSteps: 0,
  });
  const result = spawnSync(command, {
    shell: true,
    cwd: fixture.workspace,
    env: fixture.env,
    input,
    encoding: 'utf8',
    timeout: 35_000,
    killSignal: 'SIGKILL',
  });
  hangingPid = existsSync(pidFile) ? Number(readFileSync(pidFile, 'utf8')) : undefined;
  assert.equal(result.error, undefined, String(result.error));
  rejected(result);
  assert.equal(result.stderr, 'EVCREATE_CONTEXT_REJECTED: Context hook failed\n');
  assert.doesNotMatch(result.stderr, /injectSteps|decision.*allow|Session startup|Plan Context/u);

  const pid = hangingPid;
  assert.ok(Number.isSafeInteger(pid) && pid > 0);
  assert.throws(
    () => process.kill(pid, 0),
    (error) => error?.code === 'ESRCH',
    'timed-out canonical context hook must be reaped'
  );
});

for (const scope of ['project', 'home']) {
  test(`Antigravity ${scope}: registered real native policy commands preserve allow/deny independently of AGENTS`, (t) => {
    const fixture = installation(t, scope);
    rmSync(join(fixture.resourceRoot, 'AGENTS.md'));
    const group = fixture.hooks['evcrate-policy'].PreToolUse[0];
    const matcher = new RegExp(`^(?:${group.matcher})$`, 'u');
    for (const [name, args, decision] of [
      ['view_file', { AbsolutePath: join(fixture.workspace, 'src/index.ts') }, 'allow'],
      ['view_file', { AbsolutePath: join(fixture.workspace, '.env') }, 'deny'],
      ['write_to_file', { TargetFile: join(fixture.workspace, '.env') }, 'deny'],
      ['replace_file_content', { TargetFile: join(fixture.workspace, '.env') }, 'deny'],
      ['multi_replace_file_content', { TargetFile: join(fixture.workspace, '.env') }, 'deny'],
      ['grep_search', { SearchPath: join(fixture.workspace, '.env'), Query: 'token' }, 'deny'],
      ['run_command', { CommandLine: 'npm run build', Cwd: fixture.workspace }, 'allow'],
      ['run_command', { CommandLine: 'cat .env', Cwd: fixture.workspace }, 'allow'],
      ['list_dir', { DirectoryPath: join(fixture.workspace, 'node_modules') }, 'deny'],
      ['find_by_name', { SearchDirectory: join(fixture.workspace, 'node_modules'), Pattern: '*.js' }, 'deny'],
    ]) {
      assert.ok(matcher.test(name), name);
      const decisions = group.hooks.map(({ command }) => {
        const result = run(fixture, { toolCall: { name, args } }, command);
        assert.equal(result.status, 0, result.stderr);
        const output = JSON.parse(result.stdout);
        assert.equal(output.hookSpecificOutput, undefined);
        assert.equal(output.injectSteps, undefined);
        return output.decision;
      });
      assert.equal(decisions.includes('deny') ? 'deny' : 'allow', decision, `${name}: ${decisions}`);
    }
    const command = group.hooks[0].command;
    assert.equal(JSON.parse(run(fixture, { toolCall: { args: { CommandLine: 'npm run build' } } }, command).stdout).decision, 'deny');
    rmSync(join(fixture.resourceRoot, 'hooks/scout-block.cjs.original.cjs'));
    assert.equal(JSON.parse(run(fixture, { toolCall: { name: 'run_command', args: { CommandLine: 'npm run build' } } }, command).stdout).decision, 'deny');
  });
}
