import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';
import { OMP_COMMAND_RUNTIME } from '../../dist/adapters/omp/activation.js';
import helpers from '../advisor-controller/activation-test-helpers.cjs';
const { createIsolatedFixture, initializeStateFixture } = helpers;

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
    join(config, 'commands/cmd-code'),
    join(config, 'commands/cmd-fix__fast')
  ]) {
    mkdirSync(path, { recursive: true });
  }
  cpSync(controllerRoot, join(home, '.evcrate/bin'), { recursive: true });
  writeFileSync(join(resources, 'omp-command-runtime.ts'), OMP_COMMAND_RUNTIME);

  const actualOmpEvcrate = fileURLToPath(new URL('../../.evcrate/source/.omp/evcrate/', import.meta.url));
  for (const name of ['cmd-code.md', 'cmd-fix__fast.md']) {
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

  const fixFastCmd = createCommand({
    name: 'cmd-fix__fast', canonicalName: 'fix/fast', description: 'Analyze and fix small issues [FAST]',
    activation: true, template: 'cmd-fix__fast.md'
  }, pathToFileURL(join(config, 'commands/cmd-fix__fast/index.ts')).href);

  const notices = [];
  const ctx = { cwd: project, ui: { notify(message, level) { notices.push({ message, level }); } } };
  return { home, project, resources, codeCmd, fixFastCmd, ctx, notices };
}

// These exercise the generated child receiver, not a live model's router decisions.
test('delegated code admission supports off, pre-run, and same-run with exact context and task-once body', async (t) => {
  const f = await generatedCommandFixture(t);

  // 1. Off mode: caller has no advice handoff
  const offRaw = 'implement feature without advice';
  const offContext = {
    project_root: resolve(f.project),
    command: 'code',
    work_target: 'plans/test/plan.md',
    plan_path: 'plans/test/plan.md',
    phase_path: null,
    phase_id: null
  };
  const offBody = await f.codeCmd.executeDelegated([], f.ctx, offRaw, offContext, null);
  assert.notEqual(offBody, undefined);
  const off = resultHeader(offBody);
  assert.equal(off.version, 2);
  assert.equal(off.source, 'delegated');
  assert.equal(off.mode, 'off');
  assert.equal(off.reason, 'NO_FINAL_FLAG');
  assert.equal(off.context.command, 'code');
  assert.equal(off.run, null);
  assert.equal(off.raw_arguments, undefined);
  const offPrompt = offBody.slice(offBody.indexOf('\n\n') + 2);
  assert.equal(offPrompt.includes(offRaw), true);
  assert.equal(offPrompt.indexOf(offRaw), offPrompt.lastIndexOf(offRaw), 'off task appears exactly once in prompt body');

  // 2. Pre-run mode: caller provides pre-run handoff
  const preRunHandoff = {
    kind: 'pre-run',
    context: {
      project_root: resolve(f.project),
      command: 'code',
      work_target: 'plans/test/plan.md',
      plan_path: 'plans/test/plan.md',
      phase_path: 'plans/test/phase-01.md',
      phase_id: 'phase-01'
    },
    run: null
  };
  const preRunRaw = 'plans/test/plan.md';
  const preRunBody = await f.codeCmd.executeDelegated([], f.ctx, preRunRaw, preRunHandoff.context, preRunHandoff);
  assert.notEqual(preRunBody, undefined);
  const preRun = resultHeader(preRunBody);
  assert.equal(preRun.version, 2);
  assert.equal(preRun.source, 'delegated');
  assert.equal(preRun.mode, 'inherited');
  assert.equal(preRun.reason, 'INHERITED_PRE_RUN');
  assert.equal(preRun.run, null);
  assert.equal(preRun.context.phase_id, 'phase-01');
  const preRunPrompt = preRunBody.slice(preRunBody.indexOf('\n\n') + 2);
  assert.equal(preRunPrompt.includes(preRunRaw), true);
  assert.equal(preRunPrompt.indexOf(preRunRaw), preRunPrompt.lastIndexOf(preRunRaw), 'pre-run task appears exactly once in prompt body');

  // 3. Same-run mode with REAL state fixture
  const stateFixture = createIsolatedFixture(t);
  const state = initializeStateFixture(stateFixture);

  const stateConfig = join(stateFixture.project, '.omp/evcrate');
  mkdirSync(join(stateConfig, 'commands'), { recursive: true });
  mkdirSync(join(stateConfig, 'workflows'), { recursive: true });
  cpSync(controllerRoot, join(stateFixture.home, '.evcrate/bin'), { recursive: true });
  writeFileSync(join(stateConfig, 'omp-command-runtime.ts'), OMP_COMMAND_RUNTIME);
  const actualOmpEvcrate = fileURLToPath(new URL('../../.evcrate/source/.omp/evcrate/', import.meta.url));
  cpSync(join(actualOmpEvcrate, 'commands/cmd-code.md'), join(stateConfig, 'commands/cmd-code.md'));
  cpSync(join(actualOmpEvcrate, 'workflows/advice-activation.md'), join(stateConfig, 'workflows/advice-activation.md'));
  cpSync(join(actualOmpEvcrate, 'workflows/plan-progress.md'), join(stateConfig, 'workflows/plan-progress.md'));

  const stateRuntimeUrl = pathToFileURL(join(stateConfig, 'omp-command-runtime.ts')).href;
  const { createCommand: createStateCommand } = await import(stateRuntimeUrl);
  const stateCodeCmd = createStateCommand({
    name: 'cmd-code', canonicalName: 'code', description: 'Start coding',
    activation: true, template: 'cmd-code.md'
  }, pathToFileURL(join(stateFixture.project, '.omp/commands/cmd-code/index.ts')).href);

  const stateCtx = { cwd: stateFixture.project };
  const priorHome2 = process.env.HOME;
  process.env.HOME = stateFixture.home;
  try {
    const sameRunHandoff = {
      kind: 'same-run',
      context: {
        project_root: resolve(stateFixture.project),
        command: 'code',
        work_target: 'plans/test/plan.md',
        plan_path: 'plans/test/plan.md',
        phase_path: 'plans/test/phase-01.md',
        phase_id: state.phase_id
      },
      run: {
        task_run_id: state.task_run_id,
        project_id: state.project_id,
        task_revision: state.task_revision,
        scope_revision: state.scope_revision,
        evidence_revision: state.evidence_revision
      }
    };
    const sameRunRaw = 'plans/test/plan.md phase-01';
    const sameRunBody = await stateCodeCmd.executeDelegated([], stateCtx, sameRunRaw, sameRunHandoff.context, sameRunHandoff);
    assert.notEqual(sameRunBody, undefined);
    const sameRun = resultHeader(sameRunBody);
    assert.equal(sameRun.version, 2);
    assert.equal(sameRun.source, 'delegated');
    assert.equal(sameRun.mode, 'inherited');
    assert.equal(sameRun.reason, 'INHERITED_SAME_RUN');
    assert.equal(sameRun.run.task_run_id, state.task_run_id);
    assert.equal(sameRun.run.task_revision, state.task_revision);
    const sameRunPrompt = sameRunBody.slice(sameRunBody.indexOf('\n\n') + 2);
    assert.equal(sameRunPrompt.includes(sameRunRaw), true);
    assert.equal(sameRunPrompt.indexOf(sameRunRaw), sameRunPrompt.lastIndexOf(sameRunRaw), 'same-run task appears exactly once in prompt body');

    // 4. Stale handoff rejection: wrong revision rejected through helper
    const staleHandoff = {
      ...sameRunHandoff,
      run: { ...sameRunHandoff.run, task_revision: state.task_revision + 10 }
    };
    const staleResult = await stateCodeCmd.executeDelegated([], stateCtx, sameRunRaw, staleHandoff.context, staleHandoff);
    assert.equal(staleResult, undefined, 'stale revision must block prompt admission');

    // 5. Context mismatch rejection: mismatched phase rejected through helper
    const mismatchContext = { ...sameRunHandoff.context, phase_id: 'phase-mismatch' };
    const mismatchHandoff = { ...sameRunHandoff, context: mismatchContext };
    const mismatchResult = await stateCodeCmd.executeDelegated([], stateCtx, sameRunRaw, mismatchContext, mismatchHandoff);
    assert.equal(mismatchResult, undefined, 'context mismatch must block prompt admission');
  } finally {
    process.env.HOME = priorHome2;
  }
});

test('delegated specialist admission supports off, pre-run and same-run', async (t) => {
  const f = await generatedCommandFixture(t);

  // 1. Off mode
  const offRaw = 'fix typo in auth header';
  const fixFastContext = {
    project_root: resolve(f.project),
    command: 'fix/fast',
    work_target: 'fix/fast',
    plan_path: null,
    phase_path: null,
    phase_id: null
  };
  const offBody = await f.fixFastCmd.executeDelegated([], f.ctx, offRaw, fixFastContext, null);
  assert.notEqual(offBody, undefined);
  const off = resultHeader(offBody);
  assert.equal(off.version, 2);
  assert.equal(off.source, 'delegated');
  assert.equal(off.mode, 'off');
  assert.equal(off.context.command, 'fix/fast');
  const offPrompt = offBody.slice(offBody.indexOf('\n\n') + 2);
  assert.equal(offPrompt.includes(offRaw), true);
  assert.equal(offPrompt.indexOf(offRaw), offPrompt.lastIndexOf(offRaw), 'task appears exactly once');

  // 2. Pre-run mode
  const preRunHandoff = {
    kind: 'pre-run',
    context: { ...fixFastContext, work_target: 'plans/fix.md' },
    run: null
  };
  const preRunBody = await f.fixFastCmd.executeDelegated([], f.ctx, offRaw, preRunHandoff.context, preRunHandoff);
  assert.notEqual(preRunBody, undefined);
  const preRun = resultHeader(preRunBody);
  assert.equal(preRun.source, 'delegated');
  assert.equal(preRun.mode, 'inherited');
  assert.equal(preRun.reason, 'INHERITED_PRE_RUN');

  // 3. Same-run mode with real state fixture
  const stateFixture = createIsolatedFixture(t);
  const state = initializeStateFixture(stateFixture);
  const stateConfig = join(stateFixture.project, '.omp/evcrate');
  mkdirSync(join(stateConfig, 'commands'), { recursive: true });
  mkdirSync(join(stateConfig, 'workflows'), { recursive: true });
  cpSync(controllerRoot, join(stateFixture.home, '.evcrate/bin'), { recursive: true });
  writeFileSync(join(stateConfig, 'omp-command-runtime.ts'), OMP_COMMAND_RUNTIME);
  const actualOmpEvcrate = fileURLToPath(new URL('../../.evcrate/source/.omp/evcrate/', import.meta.url));
  cpSync(join(actualOmpEvcrate, 'commands/cmd-fix__fast.md'), join(stateConfig, 'commands/cmd-fix__fast.md'));
  cpSync(join(actualOmpEvcrate, 'workflows/advice-activation.md'), join(stateConfig, 'workflows/advice-activation.md'));
  cpSync(join(actualOmpEvcrate, 'workflows/plan-progress.md'), join(stateConfig, 'workflows/plan-progress.md'));

  const stateRuntimeUrl = pathToFileURL(join(stateConfig, 'omp-command-runtime.ts')).href;
  const { createCommand: createStateCommand } = await import(stateRuntimeUrl);
  const stateFixFastCmd = createStateCommand({
    name: 'cmd-fix__fast', canonicalName: 'fix/fast', description: 'Fix fast',
    activation: true, template: 'cmd-fix__fast.md'
  }, pathToFileURL(join(stateFixture.project, '.omp/commands/cmd-fix__fast/index.ts')).href);

  const priorHome2 = process.env.HOME;
  process.env.HOME = stateFixture.home;
  try {
    const sameRunHandoff = {
      kind: 'same-run',
      context: {
        project_root: resolve(stateFixture.project),
        command: 'fix/fast',
        work_target: 'plans/test/plan.md',
        plan_path: 'plans/test/plan.md',
        phase_path: 'plans/test/phase-01.md',
        phase_id: state.phase_id
      },
      run: {
        task_run_id: state.task_run_id,
        project_id: state.project_id,
        task_revision: state.task_revision,
        scope_revision: state.scope_revision,
        evidence_revision: state.evidence_revision
      }
    };
    const sameRunBody = await stateFixFastCmd.executeDelegated([], { cwd: stateFixture.project }, 'quick fix', sameRunHandoff.context, sameRunHandoff);
    assert.notEqual(sameRunBody, undefined);
    const sameRun = resultHeader(sameRunBody);
    assert.equal(sameRun.mode, 'inherited');
    assert.equal(sameRun.reason, 'INHERITED_SAME_RUN');
    assert.equal(sameRun.run.task_run_id, state.task_run_id);
  } finally {
    process.env.HOME = priorHome2;
  }
});

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

  // Delegated execution with large Unicode task
  const largeDelegatedContext = {
    project_root: resolve(f.project),
    command: 'code',
    work_target: 'plans/large/plan.md',
    plan_path: null,
    phase_path: null,
    phase_id: null
  };
  const largeDelegatedBody = await f.codeCmd.executeDelegated([], f.ctx, largeRaw, largeDelegatedContext, null);
  assert.notEqual(largeDelegatedBody, undefined);
  const largeDelegatedHeader = resultHeader(largeDelegatedBody);
  assert.equal(largeDelegatedHeader.version, 2);
  assert.equal(largeDelegatedHeader.source, 'delegated');
  assert.equal(JSON.stringify(largeDelegatedHeader).includes(largeRaw), false, 'delegated header must not contain task text');
  const largeDelegatedCount = largeDelegatedBody.split(largeRaw).length - 1;
  assert.equal(largeDelegatedCount, 1, 'large Unicode task appears exactly once across entire delegated prompt');
});
