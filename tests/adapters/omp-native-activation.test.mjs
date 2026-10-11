import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';
import { OMP_COMMAND_RUNTIME } from '../../dist/adapters/omp/activation.js';
import { translateHarnessReferences } from '../../dist/adapters/omp/commands.js';
import { OMP_PRE_MODULE, OMP_RUNTIME_HELPER } from '../../dist/adapters/omp/templates.js';
import { createProjectionBuildContext, createStagedRoot, loadTargetManifestRegistry } from '../../dist/index.js';
import { ompAdapter } from '../../dist/adapters/omp/index.js';

const REPUBLISH = 'evcrate publish --apply --scope home --target omp';
const DIAGNOSTIC_PREFIX = 'EVCrate command stopped before prompt admission: ';

test('OMP references use installed project and HOME AGENTS payload paths without rewriting URIs', () => {
  const rendered = translateHarnessReferences(
    'Read ./.claude/rules/AGENTS.md or ~/.claude/rules/AGENTS.md; preserve https://example.test/.claude/rules/AGENTS.md.',
  );
  assert.match(rendered, /\.omp\/evcrate\/AGENTS\.md/u);
  assert.match(rendered, /~\/\.omp\/agent\/evcrate\/AGENTS\.md/u);
  assert.match(rendered, /https:\/\/example\.test\/\.claude\/rules\/AGENTS\.md/u);
});

async function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'evcrate-native-command-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const home = join(root, 'HOME with spaces Việt');
  const project = join(root, 'project 日本');
  const config = join(root, 'installed OMP Việt');
  const resources = join(config, 'evcrate');
  const commandDir = join(config, 'commands/evc-cmd-code');
  for (const directory of [home, project, join(resources, 'commands'), join(resources, 'workflows'), commandDir]) {
    mkdirSync(directory, { recursive: true });
  }
  writeFileSync(join(resources, 'omp-command-runtime.ts'), OMP_COMMAND_RUNTIME);
  writeFileSync(join(resources, 'commands/evc-cmd-code.md'), '---\ndescription: Native test\n---\n<work>$ARGUMENTS</work>');
  for (const name of ['documentation-management', 'plan-progress']) {
    writeFileSync(join(resources, `workflows/${name}.md`), `# ${name}\n`);
  }
  const priorHome = process.env.HOME;
  process.env.HOME = home;
  t.after(() => {
    if (priorHome === undefined) delete process.env.HOME;
    else process.env.HOME = priorHome;
  });
  const { createCommand } = await import(pathToFileURL(join(resources, 'omp-command-runtime.ts')).href);
  const metadata = { name: 'evc-cmd-code', canonicalName: 'code', description: 'Native test', template: 'evc-cmd-code.md' };
  const command = createCommand(metadata, pathToFileURL(join(commandDir, 'index.ts')).href);
  const notices = [];
  const ctx = { cwd: project, ui: { notify(message, level) { notices.push({ message, level }); } } };
  return { home, project, resources, config, command, ctx, notices, createCommand, metadata };
}

function assertBlocked(f, body) {
  assert.equal(body, undefined, 'failed admission must not return a model prompt');
  assert.equal(f.notices.length, 1);
  assert.equal(f.notices[0].level, 'error');
  const { message } = f.notices[0];
  assert.ok(message.startsWith(DIAGNOSTIC_PREFIX));
  assert.ok(message.length <= 256);
  assert.equal(message.includes('PRIVATE-INPUT'), false);
  assert.equal(message.includes('PRIVATE-ENV'), false);
  return message;
}

test('native v3 context has exact keys and preserves all raw task bytes once', async (t) => {
  const f = await fixture(t);
  for (const raw of [
    '  "task Việt 日本"\t\r\n$& $1 $ARGUMENTS "--advice"',
    '  --advice --agent --agent topic\t--advice\r\n',
    '--agent',
    '日本語 Việt 🚀 '.repeat(1500),
  ]) {
    const body = await f.command.execute(['normalized', '--advice'], f.ctx, raw);
    assert.equal(typeof body, 'string');
    const envelope = JSON.parse(body.split('\n')[0]);
    assert.deepEqual(envelope, { evcrate_omp_command_context: {
      protocol: 'evcrate-omp-command-context', version: 3, source: 'native-user', command: 'code',
      context: { project_root: f.project, command: 'code', work_target: 'code', plan_path: null, phase_path: null, phase_id: null },
    } });
    assert.equal(body.slice(body.indexOf('\n\n') + 2), `<work>${raw}</work>`);
    assert.equal(JSON.stringify(envelope).includes(raw), false);
  }
  assert.deepEqual(f.notices, []);
});

test('positional, sliced and default substitutions use parsed args without rescanning raw replacements', async (t) => {
  const f = await fixture(t);
  writeFileSync(join(f.resources, 'commands/evc-cmd-code.md'), '$1|${2:-missing}|$@[2:2]|$@[3:]|${ARGUMENTS:-empty}');
  const body = await f.command.execute(['$ARGUMENTS', 'two', 'three'], f.ctx, 'raw $1 --advice');
  assert.equal(body.slice(body.indexOf('\n\n') + 2), '$ARGUMENTS|two|two three|three|raw $1 --advice');
});

for (const resource of ['commands/evc-cmd-code.md', 'workflows/plan-progress.md', 'workflows/documentation-management.md']) {
  test(`missing installed ${resource} cannot fall back to cwd or HOME`, async (t) => {
    const f = await fixture(t);
    for (const foreign of [f.home, f.project]) {
      const replacement = join(foreign, '.omp/evcrate', resource);
      mkdirSync(dirname(replacement), { recursive: true });
      writeFileSync(replacement, 'foreign resource $ARGUMENTS');
    }
    rmSync(join(f.resources, resource));
    const message = assertBlocked(f, await f.command.execute([], f.ctx, 'PRIVATE-INPUT'));
    assert.ok(message.includes(REPUBLISH));
  });
}

test('missing raw input and invalid cwd stop before admission without exposing task or paths', async (t) => {
  const f = await fixture(t);
  assertBlocked(f, await f.command.execute(['PRIVATE-INPUT'], f.ctx));
  for (const cwd of ['', '.', join(f.project, 'PRIVATE-INPUT-missing'), join(f.resources, 'commands/evc-cmd-code.md')]) {
    f.notices.length = 0;
    assertBlocked(f, await f.command.execute([], { ...f.ctx, cwd }, 'PRIVATE-INPUT'));
  }
});

for (const [name, arrange] of [
  ['empty', (file) => writeFileSync(file, '')],
  ['oversize', (file) => writeFileSync(file, 'x'.repeat(1024 * 1024 + 1))],
  ['invalid UTF-8', (file) => writeFileSync(file, Buffer.from([0xff]))],
  ['directory', (file) => { rmSync(file); mkdirSync(file); }],
  ['symlink', (file, f) => { rmSync(file); symlinkSync(join(f.resources, 'workflows/plan-progress.md'), file); }],
]) {
  test(`${name} command resource fails with a bounded privacy-safe notice`, async (t) => {
    const f = await fixture(t);
    arrange(join(f.resources, 'commands/evc-cmd-code.md'), f);
    assertBlocked(f, await f.command.execute([], f.ctx, 'PRIVATE-INPUT'));
  });
}

test('symlinked installed resource ancestor cannot redirect admission', async (t) => {
  const f = await fixture(t);
  const foreign = join(f.project, 'foreign workflows');
  mkdirSync(foreign);
  writeFileSync(join(foreign, 'plan-progress.md'), 'foreign');
  writeFileSync(join(foreign, 'documentation-management.md'), 'foreign');
  rmSync(join(f.resources, 'workflows'), { recursive: true });
  symlinkSync(foreign, join(f.resources, 'workflows'), 'dir');
  assertBlocked(f, await f.command.execute([], f.ctx, 'PRIVATE-INPUT'));
});

test('local admission is independent of PATH, HOME settings, locked or corrupt old state', async (t) => {
  const f = await fixture(t);
  const privateRoot = join(f.home, '.evcrate');
  mkdirSync(join(privateRoot, 'bin'), { recursive: true });
  const sentinels = ['advisor-routing.json', 'advisor-state/state.json', 'advisor-state/state.lock', 'bin/evcrate-advice-mode'];
  for (const relative of sentinels) {
    const file = join(privateRoot, relative);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, relative.endsWith('mode') ? 'throw new Error("PRIVATE-ENV")' : '{ corrupt PRIVATE-ENV');
  }
  const before = sentinels.map((relative) => readFileSync(join(privateRoot, relative)));
  const oldPath = process.env.PATH;
  const oldHome = process.env.HOME;
  process.env.PATH = '';
  delete process.env.HOME;
  try {
    const raw = 'PRIVATE-INPUT --advice --agent';
    const body = await f.command.execute([], f.ctx, raw);
    assert.equal(body.slice(body.indexOf('\n\n') + 2), `<work>${raw}</work>`);
    for (let index = 0; index < sentinels.length; index++) {
      assert.deepEqual(readFileSync(join(privateRoot, sentinels[index])), before[index]);
    }
    assert.deepEqual(f.notices, []);
  } finally {
    if (oldPath === undefined) delete process.env.PATH; else process.env.PATH = oldPath;
    if (oldHome === undefined) delete process.env.HOME; else process.env.HOME = oldHome;
  }
});

test('no-UI failures emit one bounded notice and no admitted prompt', async (t) => {
  const f = await fixture(t);
  const messages = [];
  t.mock.method(process.stderr, 'write', (message) => { messages.push(message); return true; });
  assert.equal(await f.command.execute([], { cwd: '.', hasUI: false }, 'PRIVATE-INPUT'), undefined);
  assert.equal(messages.length, 1);
  assert.ok(messages[0].length <= 257);
  assert.equal(messages[0].includes('PRIVATE-INPUT'), false);
});

test('generated native modules cover canonical inventory and admit command text once', async (t) => {
  const f = await fixture(t);
  const repository = fileURLToPath(new URL('../../', import.meta.url));
  const registry = loadTargetManifestRegistry(join(repository, '.evcrate/targets/manifest.json'));
  const stage = createStagedRoot(dirname(f.project), '.omp-current-projection-');
  t.after(() => stage.cleanup());
  ompAdapter.build(createProjectionBuildContext(registry.targets.get('omp'), join(repository, '.evcrate/source/.claude'), stage));
  cpSync(join(stage.path, '.omp'), f.config, { recursive: true });
  const canonical = readdirSync(join(repository, '.evcrate/source/.claude/commands')).filter((name) => name.endsWith('.md')).map((name) => name.slice(0, -3)).sort();
  assert.deepEqual(readdirSync(join(f.config, 'commands')).sort(), canonical);
  const { default: getCommand } = await import(pathToFileURL(join(f.config, 'commands/evc-cmd-code-x-auto/index.ts')).href);
  const command = getCommand();
  const raw = 'Cải tiến hiệu năng 日本語 🚀 --advice --agent';
  const body = await command.execute([], f.ctx, raw);
  assert.equal(body.split(raw).length - 1, 1);
  assert.equal(JSON.parse(body.split('\n')[0]).evcrate_omp_command_context.version, 3);
  assert.deepEqual(f.notices, []);
});


test('OMP warns and continues when AGENTS payload is unavailable or mid-run compaction occurs', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'evcrate-omp-context-admission-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const resources = join(directory, '.omp/evcrate');
  const entry = join(directory, '.omp/hooks/pre/evcrate-context.ts');
  mkdirSync(resources, { recursive: true });
  mkdirSync(dirname(entry), { recursive: true });
  writeFileSync(join(resources, 'omp-hook-runtime.ts'), OMP_RUNTIME_HELPER);
  writeFileSync(entry, OMP_PRE_MODULE);
  const handlers = new Map();
  const { default: register } = await import(pathToFileURL(entry).href);
  register({ on(name, handler) { handlers.set(name, handler); } });
  const notices = [];
  let aborted = 0;
  const ctx = { cwd: directory, abort() { aborted += 1; }, ui: { notify(message, kind) { notices.push({ message, kind }); } } };
  t.mock.method(console, 'warn', () => {});
  await handlers.get('session_start')({}, ctx);
  assert.equal(await handlers.get('input')({}, ctx), undefined, 'missing payload warns without blocking user input');
  assert.equal(await handlers.get('before_agent_start')({}, ctx), undefined);
  await handlers.get('before_provider_request')({}, ctx);
  assert.equal(aborted, 0, 'missing payload warns and continues without aborting provider request');
  assert.equal(notices.length, 1, 'repeated missing-payload callbacks emit exactly one warning per degradation episode');
  assert.equal(notices[0].message.includes('AGENTS') && notices[0].kind === 'warning', true);

  writeFileSync(join(resources, 'AGENTS.md'), 'restored OMP instructions\n');
  await handlers.get('before_provider_request')({}, ctx);
  assert.equal(aborted, 0);
  assert.equal(notices.length, 1, 'provider-time recovery emits no warning');
  const admittedAfterProviderRecovery = await handlers.get('before_agent_start')({}, ctx);
  assert.equal(admittedAfterProviderRecovery.message.content, 'restored OMP instructions', 'provider-time recovery delivers AGENTS on next agent start');
  assert.equal(await handlers.get('before_agent_start')({}, ctx), undefined, 'admitted startup context delivers only once before compaction');

  await handlers.get('session_before_compact')({}, ctx);
  await handlers.get('before_provider_request')({}, ctx);
  assert.equal(aborted, 0, 'mid-run compaction before next agent turn must not abort provider request');
  assert.equal(notices.length, 1, 'mid-run compaction with valid AGENTS payload emits no warning');
  const postCompactAdmitted = await handlers.get('before_agent_start')({}, ctx);
  assert.equal(postCompactAdmitted.message.content, 'restored OMP instructions');

  rmSync(join(resources, 'AGENTS.md'));
  await handlers.get('session_before_compact')({}, ctx);
  const degraded = await handlers.get('before_agent_start')({}, ctx);
  assert.equal(degraded, undefined, 'failed rebuilt context must not reuse the prior valid snapshot');
  await handlers.get('before_provider_request')({}, ctx);
  assert.equal(aborted, 0, 'degraded post-compact context warns and continues without aborting');
  assert.equal(notices.length, 2, 'recovery re-enables a single warning for a subsequent degradation episode');
  assert.equal(notices[1].message.includes('AGENTS') && notices[1].kind === 'warning', true);
});
