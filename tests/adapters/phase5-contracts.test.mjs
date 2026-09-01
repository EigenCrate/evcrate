import assert from 'node:assert/strict';
import {
  createProjectionBuildContext,
  createResourceGraph,
  createStagedRoot,
  getProjectionAdapter,
  hashBytes,
  loadTargetManifestRegistry,
  PROJECTION_QUALIFICATION_ORDER,
  PROJECTION_REGISTRY_ORDER,
  registeredProjectionAdapters,
  writeProjectionFile,
} from '../../dist/index.js';
import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, afterEach, before, test } from 'node:test';

const repository = process.cwd();
const registry = loadTargetManifestRegistry(join(repository, '.evcrate/targets/manifest.json'));
const canonicalRoot = join(repository, '.evcrate/source/.claude');
const stages = [];
const temporaryRoots = [];
const forbiddenControllerMarkers = ['advisor-bridge.cjs', 'advisor-coordinator.cjs', 'advisor-dispatch.cjs', 'advisor-handoff.cjs', 'native-capabilities.json', 'active_host'];
const materializedTargets = new Map();

function code(expected) {
  return (error) => error?.code === expected;
}
function temporaryDirectory() {
  const root = mkdtempSync(join(tmpdir(), 'evcrate-phase5-'));
  temporaryRoots.push(root);
  return root;
}
function materialize(target) {
  const cached = materializedTargets.get(target);
  if (cached) return cached;
  const stage = createStagedRoot(repository, `.phase5-test-${target}-`);
  stages.push(stage);
  const context = createProjectionBuildContext(registry.targets.get(target), canonicalRoot, stage);
  const adapter = getProjectionAdapter(target);
  adapter.build(context);
  const validation = adapter.validate(context);
  assert.equal(validation.valid, true, `${target}: ${JSON.stringify(validation.diagnostics)}`);
  assert.equal(validation.diagnostics.length, 0);
  const result = { stage, context };
  materializedTargets.set(target, result);
  return result;
}
function freshProjection(target) {
  const stage = createStagedRoot(repository, `.phase5-mutation-${target}-`);
  stages.push(stage);
  const context = createProjectionBuildContext(registry.targets.get(target), canonicalRoot, stage);
  const adapter = getProjectionAdapter(target);
  adapter.build(context);
  const validation = adapter.validate(context);
  assert.equal(validation.valid, true, `${target}: ${JSON.stringify(validation.diagnostics)}`);
  return { stage, context, adapter };
}
function filesUnder(root, prefix = '') {
  const entries = readdirSync(join(root, prefix), { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name));
  const result = [];
  for (const entry of entries) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) result.push(...filesUnder(root, path));
    else if (entry.isFile()) result.push(path);
  }
  return result;
}

before(() => {
  for (const target of PROJECTION_QUALIFICATION_ORDER) materialize(target);
});
after(() => {
  for (const stage of stages.splice(0)) stage.cleanup();
});
afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});
test('projection registry is complete and qualification order is fixed', () => {
  assert.deepEqual([...registeredProjectionAdapters().keys()], [...PROJECTION_REGISTRY_ORDER]);
  assert.deepEqual([...PROJECTION_QUALIFICATION_ORDER], ['claude', 'gemini', 'antigravity', 'codex', 'pi', 'omp', 'copilot']);
  assert.equal(getProjectionAdapter('agy').id, 'antigravity');
  assert.deepEqual([...PROJECTION_QUALIFICATION_ORDER].sort(), [...PROJECTION_REGISTRY_ORDER].sort());
});
test('brainstormer model projects through each target contract', () => {
  const claude = materialize('claude').stage.path;
  assert.match(readFileSync(join(claude, '.claude/agents/brainstormer.md'), 'utf8'), /^model: opus$/mu);

  const gemini = materialize('gemini').stage.path;
  assert.match(readFileSync(join(gemini, '.gemini/agents/brainstormer.md'), 'utf8'), /^model: pro$/mu);

  const codex = materialize('codex').stage.path;
  const codexAgent = readFileSync(join(codex, '.codex/agents/brainstormer.toml'), 'utf8');
  assert.match(codexAgent, /^model = "gpt-5\.6-sol"$/mu);
  assert.match(codexAgent, /^model_reasoning_effort = "high"$/mu);

  const omp = materialize('omp').stage.path;
  assert.match(readFileSync(join(omp, '.omp/agents/brainstormer.md'), 'utf8'), /^model: "@slow"$/mu);

  const pi = materialize('pi').stage.path;
  const piRoles = JSON.parse(readFileSync(join(pi, '.pi/agent/evcrate/model-roles.json'), 'utf8'));
  assert.deepEqual(piRoles.agents.brainstormer, { role: 'strong', source: 'canonical-agent-frontmatter' });

  const copilot = materialize('copilot').stage.path;
  const copilotAudit = JSON.parse(readFileSync(join(copilot, '.copilot/evcrate/agent-tool-audit.json'), 'utf8'));
  assert.deepEqual(copilotAudit.agents.brainstormer.model, {
    source: 'opus',
    target: null,
    reason: 'Copilot inherits the active model',
  });
  assert.equal(copilotAudit.agents.brainstormer.droppedFields.includes('model'), true);
  assert.doesNotMatch(readFileSync(join(copilot, '.copilot/agents/evcrate-brainstormer.agent.md'), 'utf8'), /^model\s*:/mu);

  const antigravity = materialize('antigravity').stage.path;
  assert.throws(() => lstatSync(join(antigravity, '.antigravity/agents/brainstormer.md')), { code: 'ENOENT' });
});


test('every target builds only its declared staged roots', () => {
  const expectedRoots = {
    claude: ['.claude'],
    gemini: ['.gemini', 'GEMINI.md'],
    antigravity: ['.antigravity'],
    codex: ['.agents', '.codex', 'AGENTS.md'],
    pi: ['.pi'],
    omp: ['.omp'],
    copilot: ['.copilot'],
  };
  for (const target of PROJECTION_QUALIFICATION_ORDER) {
    const { stage } = materialize(target);
    assert.deepEqual(readdirSync(stage.path).sort(), expectedRoots[target]);
    for (const path of filesUnder(stage.path)) {
      assert.equal(path.includes('/bin/lib/advisor/'), false, `${target} copied controller path ${path}`);
      assert.equal(path.endsWith('/bin/evcrate-advisor'), false, `${target} copied controller entrypoint ${path}`);
      const value = readFileSync(join(stage.path, path), 'utf8');
      for (const marker of forbiddenControllerMarkers) assert.equal(value.includes(marker), false, `${target} copied ${marker} in ${path}`);
    }
  }
});

test('target-specific managed settings and command maps stay independent', () => {
  const pi = materialize('pi').stage.path;
  const piSettings = JSON.parse(readFileSync(join(pi, '.pi/agent/evcrate/managed-settings.json'), 'utf8'));
  assert.deepEqual(Object.keys(piSettings).sort(), ['packages', 'schema']);
  assert.deepEqual(piSettings.packages, [
    'npm:pi-subagents@0.44.0',
    'npm:@juicesharp/rpiv-ask-user-question@2.4.0',
    'npm:@juicesharp/rpiv-todo@2.4.0',
  ]);
  const omp = materialize('omp').stage.path;
  const commandMap = JSON.parse(readFileSync(join(omp, '.omp/evcrate/command-name-map.json'), 'utf8'));
  assert.equal(commandMap.schema, 'evcrate-omp-command-map-v1');
  assert.ok(commandMap.commands.length > 0);
  assert.ok(commandMap.commands.every(({ target }) => /^cmd-[A-Za-z0-9_-]+\.md$/u.test(target)));
  const copilot = materialize('copilot').stage.path;
  const managed = JSON.parse(readFileSync(join(copilot, '.copilot/evcrate/managed-settings.json'), 'utf8'));
  assert.deepEqual(Object.keys(managed).sort(), ['effortLevel', 'includeCoAuthoredBy', 'statusLine']);
  assert.equal(managed.includeCoAuthoredBy, false);
  assert.equal(managed.effortLevel, 'high');
});

test('resource graph snapshots dist assets and rejects unsafe source entries', () => {
  const graph = createResourceGraph(canonicalRoot);
  assert.ok(graph.files.some(({ path }) => path === 'skills/mcp-management/scripts/dist/cli.js'));
  assert.equal(Object.isFrozen(graph), true);
  assert.equal(Object.isFrozen(graph.files), true);
  assert.equal(Object.isFrozen(graph.files[0]), true);
  assert.equal(graph.files.find(({ path }) => path === 'skills/mcp-management/scripts/dist/cli.js').hash.length, 64);
  const root = temporaryDirectory();
  writeFileSync(join(root, 'safe.txt'), 'safe');
  symlinkSync(join(root, 'safe.txt'), join(root, 'unsafe.txt'));
  assert.throws(() => createResourceGraph(root), code('PATH_UNSAFE'));
});
test('registered adapters reject mutated resource graph byte buffers', () => {
  const stage = createStagedRoot(repository, '.phase5-graph-mutation-');
  stages.push(stage);
  const context = createProjectionBuildContext(registry.targets.get('claude'), canonicalRoot, stage);
  const file = context.resources.files.find(({ bytes }) => bytes.byteLength > 0);
  const original = file.bytes[0];
  file.bytes[0] ^= 0xff;
  assert.throws(() => getProjectionAdapter('claude').build(context), code('PATH_UNSAFE'));
  file.bytes[0] = original;
});

test('projection writes reject traversal and preserve graph bytes', () => {
  const { context } = materialize('claude');
  assert.throws(() => writeProjectionFile(context, '../outside', new TextEncoder().encode('escape')), code('PATH_UNSAFE'));
  assert.throws(() => writeProjectionFile(context, 'manual/file.txt', new TextEncoder().encode('escape')), code('PATH_UNSAFE'));
  const expected = new TextEncoder().encode('stable');
  assert.equal(hashBytes(expected).length, 64);
  assert.throws(() => lstatSync(join(context.stage.path, 'outside')), { code: 'ENOENT' });
  assert.throws(() => lstatSync(join(context.stage.path, 'manual')), { code: 'ENOENT' });
  writeProjectionFile(context, '.claude/manual/file.txt', expected, 0o600);
  assert.deepEqual([...readFileSync(join(context.stage.path, '.claude/manual/file.txt'))], [...expected]);
});

test('validators reject missing, extra, modified, wrong-mode, symlink, and special outputs', () => {
  const missing = freshProjection('gemini');
  rmSync(join(missing.stage.path, '.gemini/agents/advisor.md'));
  assert.equal(missing.adapter.validate(missing.context).diagnostics.some(({ code }) => code === 'missing'), true);

  const extra = freshProjection('codex');
  writeFileSync(join(extra.stage.path, '.codex/unexpected-output'), 'unexpected');
  assert.equal(extra.adapter.validate(extra.context).diagnostics.some(({ code }) => code === 'unexpected'), true);

  const modified = freshProjection('antigravity');
  const modifiedPath = join(modified.stage.path, '.antigravity/hooks.json');
  const changed = Uint8Array.from(readFileSync(modifiedPath));
  changed[0] ^= 0xff;
  writeFileSync(modifiedPath, changed);
  assert.equal(modified.adapter.validate(modified.context).diagnostics.some(({ code }) => code === 'hash-mismatch'), true);

  const wrongMode = freshProjection('omp');
  const modePath = join(wrongMode.stage.path, '.omp/commands/cmd-advise.md');
  chmodSync(modePath, (lstatSync(modePath).mode & 0o777) ^ 0o100);
  assert.equal(wrongMode.adapter.validate(wrongMode.context).diagnostics.some(({ code }) => code === 'mode-mismatch'), true);
  const wrongDirectoryMode = freshProjection('gemini');
  const directoryModePath = join(wrongDirectoryMode.stage.path, '.gemini/agents');
  chmodSync(directoryModePath, 0o700);
  assert.equal(wrongDirectoryMode.adapter.validate(wrongDirectoryMode.context).diagnostics.some(({ code }) => code === 'mode-mismatch'), true);

  const claudeDirectoryMode = freshProjection('claude');
  chmodSync(join(claudeDirectoryMode.stage.path, '.claude'), 0o700);
  assert.equal(claudeDirectoryMode.adapter.validate(claudeDirectoryMode.context).diagnostics.some(({ code }) => code === 'mode-mismatch'), true);

  const symlink = freshProjection('pi');
  const outside = temporaryDirectory();
  const outsidePath = join(outside, 'payload');
  const symlinkPath = join(symlink.stage.path, '.pi/agent/evcrate/commands/advise.md');
  writeFileSync(outsidePath, 'outside');
  rmSync(symlinkPath);
  symlinkSync(outsidePath, symlinkPath);
  assert.equal(symlink.adapter.validate(symlink.context).diagnostics.some(({ code }) => code === 'unsafe'), true);

  if (process.platform !== 'win32') {
    const special = freshProjection('copilot');
    const specialPath = join(special.stage.path, '.copilot/special-output');
    execFileSync('mkfifo', [specialPath]);
    assert.equal(special.adapter.validate(special.context).diagnostics.some(({ code }) => code === 'unsafe'), true);
  }
});
