import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';
import { OMP_COMMAND_RUNTIME } from '../../dist/adapters/omp/activation.js';

const controllerRoot = fileURLToPath(new URL('../../.evcrate/source/.evcrate/bin/', import.meta.url));

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
}

test('native gate preserves quoted flag, Unicode, control bytes and literal replacement tokens', async (t) => {
  const f = await fixture(t);
  const raw = '  "task Việt 日本"\t\r\n$& $1 $ARGUMENTS "--advice"';
  const off = resultHeader(await f.command.execute(['normalized', '--advice'], f.ctx, raw));
  assert.equal(off.activation_result.mode, 'off', 'a quoted final flag must not activate advice');
  assert.equal(off.activation_result.reason, 'NO_FINAL_FLAG');
  assert.deepEqual(Buffer.from(off.activation_result.work_arguments), Buffer.from(raw));
  assert.equal(off.context.command, 'code');
  assert.equal(off.context.project_root, resolve(f.project));
  const explicit = resultHeader(await f.command.execute([], f.ctx, `${raw}\t--advice\r\n`));
  assert.equal(explicit.activation_result.mode, 'explicit');
  assert.deepEqual(Buffer.from(explicit.activation_result.work_arguments), Buffer.from(raw));
  assert.equal(existsSync(join(f.home, '.evcrate/advisor-state')), false, 'mode evaluation must not initialize a run');
});

test('missing HOME helper blocks admission instead of using a project helper', async (t) => {
  const f = await fixture(t);
  rmSync(f.helper);
  mkdirSync(join(f.project, '.evcrate/bin'), { recursive: true });
  writeFileSync(join(f.project, '.evcrate/bin/evcrate-advice-mode'), 'throw new Error("project helper must never run");');
  assertBlocked(f, await f.command.execute([], f.ctx, 'plans/secret-plan.md'));
  assert.equal(f.notices[0].message.includes('secret-plan'), false, 'diagnostics must not echo work input');
});

test('missing neutral resource blocks admission even with a working helper', async (t) => {
  const f = await fixture(t);
  rmSync(join(f.resources, 'workflows/advice-activation.md'));
  assertBlocked(f, await f.command.execute([], f.ctx, 'plans/test/plan.md'));
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
    writeFileSync(f.helper, `#!/usr/bin/env node\nprocess.stdin.resume(); process.stdin.on('end', () => { ${fault} });\n`);
    assertBlocked(f, await f.command.execute([], f.ctx, 'plans/test/plan.md'));
  });
}
