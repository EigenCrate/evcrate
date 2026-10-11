import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, isAbsolute, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { MANAGED_PI_PACKAGES, publishApply, publishDryRun, resolveInvocationContext } from '../../dist/index.js';

const packageRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const rawCases = ['  "quoted task"\tViệt 日本\r\nnext', '--agent --agent topic --advice', 'topic "--advice" --agent tail', 'topic --advice\r\n'];

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'evcrate-installed-harness-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const home = join(root, 'HOME with spaces Việt');
  const project = join(root, 'project with spaces 日本');
  const foreign = join(root, 'foreign cwd');
  for (const path of [home, project, foreign]) mkdirSync(path, { mode: 0o700 });
  const sentinels = ['.evcrate/bin/evcrate-advisor', '.evcrate/bin/evcrate-advice-mode', '.evcrate/bin/custom-runtime',
    '.evcrate/advisor-routing.json', '.evcrate/advisor-state/corrupt.json',
    '.evcrate/advisor-state/state.lock', '.evcrate/advisor-history/history.json', '.evcrate/advisor-cache/cache', 'unrelated.txt'];
  const snapshots = sentinels.map((name) => {
    const path = join(home, name);
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    writeFileSync(path, `{ corrupt unrelated data ${name} 日本`, { mode: 0o600 });
    const stat = lstatSync(path);
    return { path, bytes: readFileSync(path), inode: stat.ino, device: stat.dev, mode: stat.mode };
  });
  const settings = [join(home, '.pi/agent/settings.json'), join(project, '.pi/agent/settings.json'),
    join(home, '.evcrate-vscode/.evcrate.json'), join(project, '.evcrate-vscode/.evcrate.json')];
  for (const path of settings) {
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    writeFileSync(path, '{"userOwned":"keep exact bytes 日本"}\n', { mode: 0o600 });
  }
  const invocation = resolveInvocationContext({ packageRoot, cwd: project, home, projectRoot: project, stateHome: join(root, 'publication state') });
  return { root, home, project, foreign, snapshots, settings, invocation };
}

function preserved(f) {
  for (const before of f.snapshots) {
    const stat = lstatSync(before.path);
    assert.deepEqual(readFileSync(before.path), before.bytes);
    assert.deepEqual([stat.ino, stat.dev, stat.mode], [before.inode, before.device, before.mode]);
  }
  assert.equal(existsSync(join(f.project, '.evcrate/bin')), false);
  for (const path of f.settings.filter((path) => path.endsWith('.evcrate.json'))) {
    assert.deepEqual(readFileSync(path), Buffer.from('{"userOwned":"keep exact bytes 日本"}\n'));
  }
}

function install(f, scope) {
  for (const path of [f.home, f.project, f.invocation.stateRoot]) {
    const child = relative(f.root, path);
    assert.ok(child && !child.startsWith('..') && !isAbsolute(child));
  }
  const request = { scope, selectedTargets: f.invocation.selectedTargetIds };
  const preview = publishDryRun(f.invocation, request);
  assert.deepEqual(preview.phases.map(({ phase }) => phase), ['harness']);
  preserved(f);
  const result = publishApply(f.invocation, {}, request);
  assert.deepEqual(result.phases.map(({ phase, scope: actual }) => [phase, actual]), [['harness', scope]]);
  assert.equal(result.phases[0].status, 'committed');
  const settings = JSON.parse(readFileSync(join(scope === 'home' ? f.home : f.project, '.pi/agent/settings.json'), 'utf8'));
  assert.equal(settings.userOwned, 'keep exact bytes 日本');
  assert.deepEqual(settings.packages, [...MANAGED_PI_PACKAGES]);
  preserved(f);
}

for (const scopes of [['home'], ['project'], ['home', 'project']]) {
  test(`installed Pi ${scopes.join('+')} preserves raw bytes, installed roots and unrelated data`, async (t) => {
    const f = fixture(t);
    for (const scope of scopes) install(f, scope);
    for (const scope of scopes) {
      const agentRoot = join(scope === 'home' ? f.home : f.project, '.pi/agent');
      symlinkSync(fileURLToPath(new URL('../../node_modules', import.meta.url)), join(agentRoot, 'node_modules'), 'dir');
      const extensionUrl = pathToFileURL(join(agentRoot, 'extensions/evcrate/paths.js'));
      const { getInstalledAgentRoot, resolveEvcrateMarkers } = await import(extensionUrl.href);
      assert.equal(getInstalledAgentRoot(extensionUrl), agentRoot);
      assert.throws(() => resolveEvcrateMarkers('{{evcrate:workflows/../../escaped}}', agentRoot), /unavailable/);
      const { expandManagedCommand, findManagedCommand } = await import(pathToFileURL(join(agentRoot, 'extensions/evcrate/commands.js')).href);
      const { dispatchManagedCommand } = await import(pathToFileURL(join(agentRoot, 'extensions/evcrate/command-tool.js')).href);
      const command = findManagedCommand('evc-cmd-code-x-auto', agentRoot);
      assert.ok(command);
      for (const raw of rawCases) {
        const expanded = await expandManagedCommand(command, raw, { cwd: f.foreign }, { agentRoot, env: { HOME: f.home } });
        assert.ok(expanded.body.includes(agentRoot));
        const result = await dispatchManagedCommand({ name: 'evc-cmd-code-x-auto', args: raw }, { cwd: f.foreign }, { agentRoot, env: { HOME: f.home } });
        const header = JSON.parse(result.body.split('\n')[0]);
        assert.deepEqual(header, { evcrate_command_context: { protocol: 'evcrate-pi-command-context', version: 2,
          source: 'model-tool', command: 'code/auto', raw_arguments: raw } });
        assert.deepEqual(Buffer.from(header.evcrate_command_context.raw_arguments), Buffer.from(raw));
        assert.equal(result.canonicalCommand, 'code/auto');
      }
      await assert.rejects(() => dispatchManagedCommand({ name: '../escape', args: rawCases[0] }, { cwd: f.foreign }, { agentRoot }));
      preserved(f);
    }
  });
}

test('installed Pi copies reject missing or symlinked resources without cwd/HOME fallback', async (t) => {
  const f = fixture(t);
  install(f, 'home'); install(f, 'project');
  const copies = [];
  for (const destination of [f.home, f.project]) {
    const root = join(destination, '.pi/agent');
    const { expandManagedCommand, findManagedCommand } = await import(pathToFileURL(join(root, 'extensions/evcrate/commands.js')).href);
    const command = findManagedCommand('evc-cmd-code-x-auto', root);
    assert.ok(command);
    copies.push({ root, expand: () => expandManagedCommand(command, rawCases[0], { cwd: f.foreign }, { agentRoot: root, env: { HOME: f.home } }) });
  }
  for (const [index, copy] of copies.entries()) {
    for (const name of ['plan-progress']) {
      const resource = join(copy.root, 'evcrate/workflows', `${name}.md`);
      const unavailable = `${resource}.unavailable`;
      const rogue = join(f.foreign, 'evcrate/workflows', `${name}.md`);
      mkdirSync(dirname(rogue), { recursive: true });
      writeFileSync(rogue, '# Unrelated cwd resource\n');
      renameSync(resource, unavailable);
      try {
        await assert.rejects(copy.expand, /unavailable/);
        assert.ok((await copies[1 - index].expand()).body.includes(copies[1 - index].root));
        symlinkSync(rogue, resource);
        await assert.rejects(copy.expand, /unavailable/);
        rmSync(resource);
      } finally { renameSync(unavailable, resource); }
      await copy.expand();
    }
  }
  preserved(f);
});

for (const scope of ['home', 'project']) {
  test(`installed OMP ${scope} admits exact native raw input from its own resources`, async (t) => {
    const f = fixture(t);
    install(f, scope);
    const ompRoot = scope === 'home' ? join(f.home, '.omp/agent') : join(f.project, '.omp');
    const moduleUrl = pathToFileURL(join(ompRoot, 'commands/evc-cmd-code-x-auto/index.ts')).href;
    const { default: factory } = await import(moduleUrl);
    const command = factory();
    const notices = [];
    const ctx = { cwd: f.foreign, hasUI: true, ui: { notify: (message) => notices.push(message) } };
    for (const raw of rawCases) {
      const output = await command.execute([], ctx, raw);
      assert.equal(typeof output, 'string');
      const [headerLine, body] = [output.split('\n')[0], output.slice(output.indexOf('\n') + 1)];
      const header = JSON.parse(headerLine);
      assert.deepEqual(header, { evcrate_omp_command_context: { protocol: 'evcrate-omp-command-context', version: 3,
        source: 'native-user', command: 'code/auto', context: { project_root: f.foreign, command: 'code/auto', work_target: 'code/auto',
          plan_path: null, phase_path: null, phase_id: null } } });
      assert.equal(body.split(raw).length, 2, 'exact raw bytes occur once in admitted body');
      assert.ok(body.includes('.omp'));
    }
    assert.equal(notices.length, 0);
    for (const resource of ['plan-progress.md', 'documentation-management.md']) {
      const path = join(ompRoot, 'evcrate/workflows', resource);
      renameSync(path, `${path}.unavailable`);
      try { assert.equal(await command.execute([], ctx, 'private task must not echo'), undefined); }
      finally { renameSync(`${path}.unavailable`, path); }
    }
    assert.equal(await command.execute([], ctx), undefined);
    assert.equal(await command.execute([], { ...ctx, cwd: join(f.root, 'missing cwd') }, 'private task must not echo'), undefined);
    assert.equal(notices.length, 4);
    assert.ok(notices.every((notice) => Buffer.byteLength(notice) <= 256 && !notice.includes('private task')));
    preserved(f);
  });
}
