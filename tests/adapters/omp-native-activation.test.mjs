import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';
import { OMP_COMMAND_RUNTIME } from '../../dist/adapters/omp/activation.js';
import helpers from '../advisor-controller/activation-test-helpers.cjs';
const { initializeStateFixture } = helpers;

const controllerRoot = fileURLToPath(new URL('../../.evcrate/source/.evcrate/bin/', import.meta.url));
const REPUBLISH = 'evcrate publish --apply --scope home --target omp';
const DIAGNOSTIC_PREFIX = 'EVCrate command stopped before prompt admission: ';
const NODE_RANGE = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).engines.node;

async function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'evcrate-native-command-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const home = join(root, 'HOME with spaces Việt');
  const project = join(root, 'project 日本');
  const config = join(project, '.omp');
  const resources = join(config, 'evcrate');
  const commandDir = join(config, 'commands/cmd-code');
  for (const path of [join(home, '.evcrate'), join(resources, 'commands'), join(resources, 'workflows'), commandDir]) {
    mkdirSync(path, { recursive: true });
  }
  cpSync(controllerRoot, join(home, '.evcrate/bin'), { recursive: true });
  writeFileSync(join(resources, 'omp-command-runtime.ts'), OMP_COMMAND_RUNTIME);
  writeFileSync(join(resources, 'commands/cmd-code.md'), '---\ndescription: Native test\n---\n<work>$ARGUMENTS</work>');
  for (const name of ['advice-activation', 'plan-progress']) {
    writeFileSync(join(resources, `workflows/${name}.md`), `# ${name}\n`);
  }
  const priorHome = process.env.HOME;
  process.env.HOME = home;
  t.after(() => {
    if (priorHome === undefined) delete process.env.HOME;
    else process.env.HOME = priorHome;
  });
  const { createCommand } = await import(pathToFileURL(join(resources, 'omp-command-runtime.ts')).href);
  const command = createCommand({ name: 'cmd-code', canonicalName: 'code', description: 'Native test',
    activation: true, template: 'cmd-code.md' }, pathToFileURL(join(commandDir, 'index.ts')).href);
  const notices = [];
  const ctx = { cwd: project, ui: { notify(message, level) { notices.push({ message, level }); } } };
  return { home, project, resources, command, ctx, notices, helper: join(home, '.evcrate/bin/evcrate-advice-mode') };
}

function resultHeader(body) {
  return JSON.parse(body.split('\n')[0]).evcrate_omp_command_context;
}

function assertBlocked(f, body) {
  assert.equal(body, undefined, 'activation failure must not admit a model prompt');
  assert.equal(f.notices.length, 1, 'operator receives one failure diagnostic');
  assert.equal(f.notices[0].level, 'error');
  assert.equal(existsSync(join(f.home, '.evcrate/advisor-state')), false);
  const { message } = f.notices[0];
  assert.ok(message.startsWith(DIAGNOSTIC_PREFIX));
  assert.ok(message.length <= DIAGNOSTIC_PREFIX.length + 200, 'diagnostic detail stays within the 200 character cap');
  return message;
}

function setEnv(t, name, value) {
  const prior = process.env[name];
  process.env[name] = value;
  t.after(() => {
    if (prior === undefined) delete process.env[name];
    else process.env[name] = prior;
  });
}

function emptyDirectory(t) {
  const dir = mkdtempSync(join(tmpdir(), 'evcrate-empty-path-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function writeFaultHelper(f, fault) {
  writeFileSync(f.helper, `#!/usr/bin/env node\nprocess.stdin.resume(); process.stdin.on('end', () => { ${fault} });\n`);
}

// Wraps the real HOME helper so the exact request delivered by the host can be observed.
function installCapturingHelper(f) {
  const capture = join(f.home, 'captured-request.json');
  const real = `${f.helper}.real`;
  renameSync(f.helper, real);
  writeFileSync(f.helper, [
    '#!/usr/bin/env node',
    "const fs = require('node:fs');",
    "const { spawnSync } = require('node:child_process');",
    'const input = fs.readFileSync(0);',
    `fs.writeFileSync(${JSON.stringify(capture)}, input);`,
    `const run = spawnSync(process.execPath, [${JSON.stringify(real)}], { input, cwd: process.cwd(), env: process.env });`,
    'process.stdout.write(run.stdout);',
    'process.exitCode = run.status;',
    ''
  ].join('\n'));
  return {
    reset: () => rmSync(capture, { force: true }),
    read: () => (existsSync(capture) ? JSON.parse(readFileSync(capture, 'utf8')) : null)
  };
}

test('native gate preserves quoted flag, Unicode, control bytes and literal replacement tokens', async (t) => {
  const f = await fixture(t);
  const raw = '  "task Việt 日本"\t\r\n$& $1 $ARGUMENTS "--advice"';
  const offBody = await f.command.execute(['normalized', '--advice'], f.ctx, raw);
  assert.notEqual(offBody, undefined);
  const off = resultHeader(offBody);
  assert.equal(off.protocol, 'evcrate-omp-command-context');
  assert.equal(off.version, 2, 'compact metadata contract is version 2');
  assert.equal(off.source, 'native-user', 'native execution identifies source as native-user');
  assert.equal(off.mode, 'off', 'a quoted final flag must not activate advice');
  assert.equal(off.reason, 'NO_FINAL_FLAG');
  assert.equal(off.raw_arguments, undefined, 'raw_arguments excluded from compact metadata');
  assert.equal(off.work_arguments, undefined, 'work_arguments excluded from compact metadata');
  assert.equal(off.context.command, 'code');
  assert.equal(off.context.project_root, resolve(f.project));
  const offPrompt = offBody.slice(offBody.indexOf('\n\n') + 2);
  assert.equal(offPrompt.includes(raw), true, 'body contains work arguments');
  assert.equal(offPrompt.indexOf(raw), offPrompt.lastIndexOf(raw), 'task appears exactly once in prompt body');

  const explicitBody = await f.command.execute([], f.ctx, `${raw}\t--advice\r\n`);
  assert.notEqual(explicitBody, undefined);
  const explicit = resultHeader(explicitBody);
  assert.equal(explicit.version, 2);
  assert.equal(explicit.source, 'native-user');
  assert.equal(explicit.mode, 'explicit');
  assert.equal(explicit.reason, 'EXPLICIT_FINAL_FLAG');
  assert.equal(explicit.raw_arguments, undefined);
  assert.equal(explicit.work_arguments, undefined);
  const explicitPrompt = explicitBody.slice(explicitBody.indexOf('\n\n') + 2);
  assert.equal(explicitPrompt.includes(raw), true);
  assert.equal(explicitPrompt.indexOf(raw), explicitPrompt.lastIndexOf(raw), 'task appears exactly once in prompt body');
  assert.equal(existsSync(join(f.home, '.evcrate/advisor-state')), false, 'mode evaluation must not initialize a run');
});

test('missing HOME helper blocks admission instead of using a project helper', async (t) => {
  const f = await fixture(t);
  rmSync(f.helper);
  mkdirSync(join(f.project, '.evcrate/bin'), { recursive: true });
  writeFileSync(join(f.project, '.evcrate/bin/evcrate-advice-mode'), 'throw new Error("project helper must never run");');
  const message = assertBlocked(f, await f.command.execute([], f.ctx, 'plans/secret-plan.md'));
  assert.equal(message.includes('secret-plan'), false, 'diagnostics must not echo work input');
  assert.ok(message.includes(REPUBLISH), 'missing helper names the exact republication command');
  assert.equal(message.includes('not found on PATH'), false, 'a missing helper is not a missing Node');
});

test('missing neutral resource blocks admission even with a working helper', async (t) => {
  const f = await fixture(t);
  rmSync(join(f.resources, 'workflows/advice-activation.md'));
  const message = assertBlocked(f, await f.command.execute([], f.ctx, 'plans/test/plan.md'));
  assert.ok(message.includes(REPUBLISH), 'missing resource names the exact republication command');
});

test('unavailable original raw representation cannot be rebuilt from parsed arguments', async (t) => {
  const f = await fixture(t);
  assertBlocked(f, await f.command.execute(['task', '--advice'], f.ctx));
});

test('Linux rejects absent or relative HOME rather than using USERPROFILE or cwd', { skip: process.platform !== 'linux' }, async (t) => {
  const f = await fixture(t);
  const priorProfile = process.env.USERPROFILE;
  process.env.USERPROFILE = f.home;
  t.after(() => {
    if (priorProfile === undefined) delete process.env.USERPROFILE;
    else process.env.USERPROFILE = priorProfile;
  });
  delete process.env.HOME;
  assertBlocked(f, await f.command.execute([], f.ctx, 'private work'));
  f.notices.length = 0;
  process.env.HOME = '.';
  assertBlocked(f, await f.command.execute([], f.ctx, 'private work'));
});

for (const [name, fault] of [
  ['nonzero helper exit', 'process.exit(1);'],
  ['malformed helper output', 'process.stdout.write("not a result\\n");'],
  ['unterminated helper output', 'process.stdout.write("{} ");'],
  ['helper output overflow', 'process.stdout.write("x".repeat(256 * 1024 + 1));'],
]) {
  test(`${name} blocks admission rather than falling back to off`, async (t) => {
    const f = await fixture(t);
    writeFaultHelper(f, fault);
    const message = assertBlocked(f, await f.command.execute([], f.ctx, 'plans/test/plan.md'));
    assert.ok(message.includes('HOME activation helper failed'));
    assert.equal(message.includes('not found on PATH'), false, 'a helper fault is not a missing Node');
    assert.equal(message.includes(REPUBLISH), false, 'a helper fault does not promise republication repairs it');
  });
}

async function generatedCommandFixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'evcrate-gen-command-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const home = join(root, 'home');
  const project = join(root, 'project');
  const config = join(project, '.omp');
  const resources = join(config, 'evcrate');
  for (const path of [
    join(home, '.evcrate'),
    join(resources, 'commands'),
    join(resources, 'workflows'),
    join(config, 'commands/cmd-code')
  ]) {
    mkdirSync(path, { recursive: true });
  }
  cpSync(controllerRoot, join(home, '.evcrate/bin'), { recursive: true });
  writeFileSync(join(resources, 'omp-command-runtime.ts'), OMP_COMMAND_RUNTIME);

  const actualOmpEvcrate = fileURLToPath(new URL('../../.evcrate/source/.omp/evcrate/', import.meta.url));
  for (const name of ['cmd-code.md']) {
    cpSync(join(actualOmpEvcrate, 'commands', name), join(resources, 'commands', name));
  }
  for (const name of ['advice-activation.md', 'plan-progress.md']) {
    cpSync(join(actualOmpEvcrate, 'workflows', name), join(resources, 'workflows', name));
  }

  const priorHome = process.env.HOME;
  process.env.HOME = home;
  t.after(() => {
    if (priorHome === undefined) delete process.env.HOME;
    else process.env.HOME = priorHome;
  });

  const runtimeUrl = pathToFileURL(join(resources, 'omp-command-runtime.ts')).href;
  const { createCommand } = await import(runtimeUrl);

  const codeCmd = createCommand({
    name: 'cmd-code', canonicalName: 'code', description: 'Start coding & testing an existing plan',
    activation: true, template: 'cmd-code.md'
  }, pathToFileURL(join(config, 'commands/cmd-code/index.ts')).href);

  const notices = [];
  const ctx = { cwd: project, ui: { notify(message, level) { notices.push({ message, level }); } } };
  return { home, project, resources, codeCmd, ctx, notices };
}

test('compact prompt projection ensures task appears exactly once for small and large Unicode inputs', async (t) => {
  const f = await generatedCommandFixture(t);

  // Small Unicode task
  const smallRaw = 'Cải tiến hiệu năng & tính năng mới: 日本語とTiếng Việt 🚀✨';
  const smallNativeBody = await f.codeCmd.execute([], f.ctx, smallRaw);
  assert.notEqual(smallNativeBody, undefined);
  const smallHeader = resultHeader(smallNativeBody);
  assert.equal(smallHeader.version, 2);
  assert.equal(smallHeader.raw_arguments, undefined);
  assert.equal(JSON.stringify(smallHeader).includes(smallRaw), false, 'header must not contain task text');
  const smallCount = smallNativeBody.split(smallRaw).length - 1;
  assert.equal(smallCount, 1, 'small Unicode task appears exactly once across entire admitted prompt');

  // Large Unicode task (10 KiB)
  const largeSegment = 'Kế hoạch triển khai mã nguồn chi tiết với tiếng Việt có dấu và 日本語テキスト: 🌟 ';
  const largeRaw = largeSegment.repeat(150);
  assert.ok(Buffer.byteLength(largeRaw) > 10 * 1024, 'large input exceeds 10 KiB');

  // Native execution with large Unicode task
  const largeNativeBody = await f.codeCmd.execute([], f.ctx, largeRaw);
  assert.notEqual(largeNativeBody, undefined);
  const largeHeader = resultHeader(largeNativeBody);
  assert.equal(largeHeader.version, 2);
  assert.equal(largeHeader.raw_arguments, undefined);
  assert.equal(JSON.stringify(largeHeader).includes(largeRaw), false, 'header must not contain task text');
  const largeNativeCount = largeNativeBody.split(largeRaw).length - 1;
  assert.equal(largeNativeCount, 1, 'large Unicode task appears exactly once across entire native prompt');
});

test('Node absent from PATH yields one Node diagnostic without admitting the prompt', async (t) => {
  const f = await fixture(t);
  setEnv(t, 'PATH', emptyDirectory(t));
  const message = assertBlocked(f, await f.command.execute([], f.ctx, 'plans/secret-plan.md'));
  assert.ok(message.includes(`Node ${NODE_RANGE} not found on PATH`));
  assert.equal(message.includes(REPUBLISH), false, 'republication cannot repair a missing Node');
  assert.equal(message.includes('secret-plan'), false, 'diagnostics must not echo work input');
});

test('helper exit with Node available yields a helper diagnostic and never leaks helper stderr', async (t) => {
  const f = await fixture(t);
  writeFaultHelper(f, "process.stderr.write('RAW-HELPER-SECRET'); process.exit(1);");
  const message = assertBlocked(f, await f.command.execute([], f.ctx, 'plans/secret-plan.md'));
  assert.ok(message.includes('HOME activation helper failed'));
  assert.equal(message.includes('not found on PATH'), false);
  assert.equal(message.includes('RAW-HELPER-SECRET'), false);
  assert.equal(message.includes('secret-plan'), false);
});

test('headless admission failures write one diagnostic to stderr and admit nothing', async (t) => {
  const f = await fixture(t);
  const script = [
    "const { createCommand } = await import(process.env.EVC_RUNTIME);",
    "const command = createCommand({ name: 'cmd-code', canonicalName: 'code', description: 'Native test', activation: true, template: 'cmd-code.md' }, process.env.EVC_MODULE);",
    "const body = await command.execute([], { cwd: process.env.EVC_CWD, hasUI: false }, 'private work text');",
    "process.stdout.write(JSON.stringify({ admitted: body !== undefined }));"
  ].join('\n');
  const run = (path) => spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', '--input-type=module', '-e', script], {
    encoding: 'utf8',
    env: { HOME: f.home, PATH: path, EVC_CWD: f.project,
      EVC_RUNTIME: pathToFileURL(join(f.resources, 'omp-command-runtime.ts')).href,
      EVC_MODULE: pathToFileURL(join(f.project, '.omp/commands/cmd-code/index.ts')).href }
  });
  const assertOneDiagnostic = (result, expected) => {
    assert.equal(result.status, 0);
    assert.deepEqual(JSON.parse(result.stdout), { admitted: false });
    const lines = result.stderr.split('\n').filter(Boolean);
    assert.equal(lines.length, 1, 'exactly one stderr diagnostic');
    assert.ok(lines[0].startsWith(DIAGNOSTIC_PREFIX));
    assert.ok(lines[0].includes(expected));
    for (const forbidden of ['private work text', 'RAW-HELPER-SECRET']) assert.equal(lines[0].includes(forbidden), false);
  };

  assertOneDiagnostic(run(emptyDirectory(t)), `Node ${NODE_RANGE} not found on PATH`);

  writeFaultHelper(f, "process.stderr.write('RAW-HELPER-SECRET'); process.exit(1);");
  assertOneDiagnostic(run(process.env.PATH), 'HOME activation helper failed');
});

test('native no-flag admission ignores locked or corrupt HOME state and sends a null handoff', async (t) => {
  const f = await fixture(t);
  chmodSync(f.home, 0o700);
  chmodSync(f.project, 0o700);
  const state = { home: f.home, project: f.project, taskRunId: randomUUID(),
    context: { cwd: f.project, environment: { HOME: f.home } } };
  initializeStateFixture(state);
  const taskDirectory = dirname(state.stateFile);
  const lockFile = join(taskDirectory, 'state.lock');
  const capture = installCapturingHelper(f);
  const raw = 'plans/test/plan.md';
  const snapshot = () => ({
    entries: readdirSync(taskDirectory).sort(),
    state: readFileSync(state.stateFile),
    lock: existsSync(lockFile) ? readFileSync(lockFile) : null
  });

  for (const [name, arrange] of [
    ['live lock', () => writeFileSync(lockFile, JSON.stringify({ token: 'l'.repeat(32), process: { pid: process.pid, start: null } }), { mode: 0o600 })],
    ['corrupt state', () => { rmSync(lockFile, { force: true }); writeFileSync(state.stateFile, '{ corrupt json'); }]
  ]) {
    arrange();
    const before = snapshot();
    capture.reset();
    const body = await f.command.execute([], f.ctx, raw);
    assert.notEqual(body, undefined, `${name}: off admission must not depend on HOME state`);
    const header = resultHeader(body);
    assert.equal(header.source, 'native-user');
    assert.equal(header.mode, 'off');
    assert.equal(header.reason, 'NO_FINAL_FLAG');
    assert.equal(header.run, null);
    assert.deepEqual(f.notices, []);
    const after = snapshot();
    assert.deepEqual(after.entries, before.entries, `${name}: no directory entries created or removed`);
    assert.equal(after.state.equals(before.state), true, `${name}: state bytes unchanged`);
    assert.equal(after.lock?.equals(before.lock) ?? before.lock === null, true, `${name}: lock bytes unchanged`);
    const request = capture.read();
    assert.equal(request.handoff, null, 'a user-entered command always sends a null handoff');
    assert.equal(request.raw_arguments, raw);
    assert.equal(request.context.command, 'code');
  }
});

test('generated entrypoints call the helper exactly for the helper command list with their canonical command', async (t) => {
  const f = await fixture(t);
  const capture = installCapturingHelper(f);
  const { COMMAND_NAMES } = createRequire(import.meta.url)(join(controllerRoot, 'lib/advisor/activation.cjs'));
  const ompRoot = fileURLToPath(new URL('../../.evcrate/source/.omp/', import.meta.url));
  const { commands } = JSON.parse(readFileSync(join(ompRoot, 'evcrate/command-name-map.json'), 'utf8'));
  const activated = [];
  for (const record of commands) {
    const canonical = record.source.slice(0, -'.md'.length);
    const { default: create } = await import(pathToFileURL(join(ompRoot, 'commands', record.targetName, 'index.ts')).href);
    capture.reset();
    const body = await create().execute([], f.ctx, 'ordinary task text');
    assert.equal(typeof body, 'string', `${canonical}: ordinary or admitted body expected`);
    const request = capture.read();
    if (COMMAND_NAMES.includes(canonical)) {
      assert.ok(request, `${canonical}: supported command must call the helper`);
      assert.equal(request.context.command, canonical);
      assert.equal(request.handoff, null);
      const header = resultHeader(body);
      assert.equal(header.source, 'native-user');
      assert.equal(header.mode, 'off');
      assert.equal(header.context.command, canonical);
      activated.push(canonical);
    } else {
      assert.equal(request, null, `${canonical}: unsupported command must not call the helper`);
      assert.equal(body.startsWith('{"evcrate_omp_command_context"'), false, `${canonical}: no admission header`);
    }
  }
  assert.deepEqual(activated.sort(), [...COMMAND_NAMES].sort(), 'every helper command has a generated entrypoint');
});
