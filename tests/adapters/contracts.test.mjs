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
import { projectionExpectations, registerProjectionExpectation } from '../../dist/adapters/types.js';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  cpSync,
  chmodSync,
  existsSync,
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
  const source = materialize(target);
  const stage = createStagedRoot(repository, `.phase5-mutation-${target}-`);
  stages.push(stage);
  const context = createProjectionBuildContext(registry.targets.get(target), canonicalRoot, stage);
  for (const name of readdirSync(source.stage.path)) {
    cpSync(join(source.stage.path, name), join(stage.path, name), { recursive: true });
  }
  for (const expectation of projectionExpectations(source.context)) {
    registerProjectionExpectation(context, expectation);
  }
  return { stage, context, adapter: getProjectionAdapter(target) };
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
function invokeRuntime(args, cwd, env, input = '{}') {
  const result = spawnSync(process.execPath, args, {
    cwd, env: { ...process.env, ...env }, input, encoding: 'utf8'
  });
  assert.equal(result.status, 0, `${args.join(' ')} failed: ${result.stderr}`);
  return result.stdout;
}
function installProjections(destination) {
  for (const target of PROJECTION_QUALIFICATION_ORDER) {
    const source = materialize(target).stage.path;
    for (const name of readdirSync(source)) {
      cpSync(join(source, name), join(destination, name), { recursive: true });
    }
  }
}
function installedProjectionRoot() {
  const stage = createStagedRoot(repository, '.phase7-installed-');
  stages.push(stage);
  installProjections(stage.path);
  symlinkSync(join(repository, 'node_modules'), join(stage.path, 'node_modules'), 'dir');
  return stage.path;
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

test('Gemini rejects declared malformed or non-object settings', () => {
  for (const document of ['{', '[]', 'null', '"scalar"']) {
    const sourceContainer = temporaryDirectory();
    const sourceRoot = join(sourceContainer, '.claude');
    mkdirSync(sourceRoot);
    cpSync(canonicalRoot, sourceRoot, { recursive: true, dereference: true });
    writeFileSync(join(sourceContainer, 'CLAUDE.md'), '# Test project context');
    writeFileSync(join(sourceRoot, 'settings.json'), document);
    const stage = createStagedRoot(repository, '.phase5-invalid-gemini-');
    stages.push(stage);
    const context = createProjectionBuildContext(registry.targets.get('gemini'), sourceRoot, stage);
    assert.throws(() => getProjectionAdapter('gemini').build(context), code('VALIDATION_INVALID'), document);
  }
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
  const initialMode = lstatSync(modePath).mode & 0o777;
  chmodSync(modePath, initialMode ^ 0o100);
  if ((lstatSync(modePath).mode & 0o777) !== 0o777 && (lstatSync(modePath).mode & 0o777) !== initialMode) {
    assert.equal(wrongMode.adapter.validate(wrongMode.context).diagnostics.some(({ code }) => code === 'mode-mismatch'), true);
    const wrongDirectoryMode = freshProjection('gemini');
    const directoryModePath = join(wrongDirectoryMode.stage.path, '.gemini/agents');
    chmodSync(directoryModePath, 0o700);
    assert.equal(wrongDirectoryMode.adapter.validate(wrongDirectoryMode.context).diagnostics.some(({ code }) => code === 'mode-mismatch'), true);

    const claudeDirectoryMode = freshProjection('claude');
    chmodSync(join(claudeDirectoryMode.stage.path, '.claude'), 0o700);
    assert.equal(claudeDirectoryMode.adapter.validate(claudeDirectoryMode.context).diagnostics.some(({ code }) => code === 'mode-mismatch'), true);
  }

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

test('installed runtime entrypoints resolve children from their own roots and keep workspace context', () => {
  const container = temporaryDirectory();
  const installed = installedProjectionRoot();
  const workspace = join(container, 'workspace with spaces');
  mkdirSync(workspace, { recursive: true });
  mkdirSync(join(container, '.codex'), { recursive: true });

  const claude = invokeRuntime(
    [join(installed, '.claude/hooks/session-init.cjs')],
    workspace, { CLAUDE_PROJECT_DIR: workspace }
  );
  assert.equal(claude.includes('EVCREATE_HOOK_UNAVAILABLE'), false);

  const codex = JSON.parse(invokeRuntime(
    [join(installed, '.codex/hooks/session-start.cjs')],
    workspace, { CODEX_PROJECT_DIR: workspace }
  ));
  assert.equal(codex.hookSpecificOutput?.hookEventName, 'SessionStart');

  const gemini = JSON.parse(invokeRuntime(
    [join(installed, '.gemini/hooks/session-start.cjs')],
    workspace, { GEMINI_PROJECT_DIR: workspace }
  ));
  assert.equal(gemini.hookSpecificOutput?.hookEventName, 'SessionStart');

  const antigravity = JSON.parse(invokeRuntime(
    [join(installed, '.antigravity/hooks/scout-block.cjs')],
    workspace, { AGY_PROJECT_DIR: workspace }
  ));
  assert.equal(antigravity.decision, 'allow');

  const ompProgram = [
    `import { runCanonicalHook } from ${JSON.stringify(`file://${join(installed, '.omp/evcrate/omp-hook-runtime.ts')}`)};`,
    `const result = await runCanonicalHook('session-init.cjs', {}, { cwd: ${JSON.stringify(workspace)} });`,
    'process.exitCode = result.code;'
  ].join('\n');
  invokeRuntime(
    ['--experimental-strip-types', '--input-type=module', '--eval', ompProgram],
    workspace, {}
  );


  const piProgram = [
    `import extension from ${JSON.stringify(`file://${join(installed, '.pi/agent/extensions/evcrate/index.js')}`)};`,
    'const handlers = new Map();',
    'const pi = { on(name, handler) { handlers.set(name, handler); }, registerCommand() {}, registerTool() {}, getActiveTools() { return []; }, getAllTools() { return []; }, setActiveTools() {}, events: { on() {} } };',
    'const result = await extension(pi);',
    'process.stdout.write(JSON.stringify({ agentRoot: result.agentRoot, resourceRoot: result.resourceRoot }));'
  ].join('\n');
  const pi = JSON.parse(invokeRuntime(
    ['--input-type=module', '--eval', piProgram],
    workspace, { PI_CODING_AGENT_DIR: join(installed, '.pi/agent') }
  ));
  assert.equal(pi.agentRoot, join(installed, '.pi/agent'));
  assert.equal(pi.resourceRoot, join(installed, '.pi/agent/evcrate'));
});

test('installed runtime wrappers deny missing and symlinked child hooks', () => {
  const container = temporaryDirectory();
  const installed = installedProjectionRoot();
  const workspace = join(container, 'workspace');
  mkdirSync(workspace, { recursive: true });

  const codexChild = join(installed, '.codex/hooks/scout-block.cjs');
  rmSync(codexChild);
  const missing = JSON.parse(invokeRuntime(
    [join(installed, '.codex/hooks/pretool-scout-block.cjs')],
    workspace, { CODEX_PROJECT_DIR: workspace }
  ));
  assert.equal(missing.hookSpecificOutput.permissionDecision, 'deny');
  assert.equal(missing.hookSpecificOutput.permissionDecisionReason, 'EVCREATE_HOOK_UNAVAILABLE');

  const geminiChild = join(installed, '.gemini/hooks/scout-block.cjs');
  rmSync(geminiChild);
  symlinkSync(join(installed, '.gemini/hooks/privacy-block.cjs'), geminiChild);
  const symlinked = JSON.parse(invokeRuntime(
    [join(installed, '.gemini/hooks/before-tool-scout-block.cjs')],
    workspace, { GEMINI_PROJECT_DIR: workspace },
    '{"toolCall":{"args":{"CommandLine":"echo safe"}}}'
  ));
  assert.equal(symlinked.decision, 'deny');
  assert.equal(symlinked.reason, 'EVCREATE_HOOK_UNAVAILABLE');
});

const SCRIPT_DIRS = {
  claude: '.claude/scripts',
  gemini: '.gemini/scripts',
  antigravity: '.antigravity/scripts',
  codex: '.codex/scripts',
  pi: '.pi/agent/evcrate/scripts',
  omp: '.omp/evcrate/scripts',
  copilot: '.copilot/evcrate/scripts',
};

test('seven-target scanner and catalog contracts hold from foreign CWD', () => {
  for (const target of PROJECTION_QUALIFICATION_ORDER) {
    const { stage } = materialize(target);
    const scriptDir = join(stage.path, SCRIPT_DIRS[target]);
    const scanCommands = join(scriptDir, 'scan_commands.py');
    const scanSkills = join(scriptDir, 'scan_skills.py');
    const genCatalogs = join(scriptDir, 'generate_catalogs.py');
    const layoutPath = join(scriptDir, 'scanner-layout.json');

    assert.equal(existsSync(scanCommands), true, `${target}: scan_commands.py missing`);
    assert.equal(existsSync(scanSkills), true, `${target}: scan_skills.py missing`);
    assert.equal(existsSync(genCatalogs), true, `${target}: generate_catalogs.py missing`);
    assert.equal(existsSync(layoutPath), true, `${target}: scanner-layout.json missing`);

    const layout = JSON.parse(readFileSync(layoutPath, 'utf8'));
    assert.equal(layout.schema, 'evcrate-scanner-layout-v1');

    const cmdRoot = join(scriptDir, layout.commands.root);
    const skillRoot = join(scriptDir, layout.skills.root);
    assert.equal(existsSync(cmdRoot), true, `${target}: commands root missing: ${cmdRoot}`);
    assert.equal(existsSync(skillRoot), true, `${target}: skills root missing: ${skillRoot}`);

    const initialCmdData = readFileSync(join(scriptDir, 'commands_data.yaml'), 'utf8');
    const initialSkillData = readFileSync(join(scriptDir, 'skills_data.yaml'), 'utf8');

    // Plant unrelated valid command and skill in target native roots
    let cleanupUnrelated = () => {};
    if (layout.commands.format === 'toml') {
      const cmdFile = join(cmdRoot, 'unrelated-user-cmd.toml');
      writeFileSync(cmdFile, 'description = "Unrelated user command"\nprompt = "Unrelated"');
      cleanupUnrelated = () => rmSync(cmdFile, { force: true });
    } else if (layout.commands.format === 'command-skill') {
      const dir = join(cmdRoot, 'cmd_unrelated_user');
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'SKILL.md'), '---\nname: cmd_unrelated_user\ndescription: Unrelated command\n---\n# Unrelated');
      cleanupUnrelated = () => rmSync(dir, { recursive: true, force: true });
    } else {
      const cmdFile = join(cmdRoot, 'unrelated-user-cmd.md');
      writeFileSync(cmdFile, '---\ndescription: Unrelated command\nargument-hint: ""\n---\n# Unrelated');
      cleanupUnrelated = () => rmSync(cmdFile, { force: true });
    }

    const unrelatedSkillDir = join(skillRoot, 'unrelated-user-skill');
    mkdirSync(unrelatedSkillDir, { recursive: true });
    writeFileSync(join(unrelatedSkillDir, 'SKILL.md'), '---\nname: unrelated-user-skill\ndescription: Unrelated skill\n---\n# Unrelated');

    // Run both scanners from foreign CWD
    const foreignCwd = temporaryDirectory();
    const env = { ...process.env, PYTHONDONTWRITEBYTECODE: '1' };

    const cmdRun = spawnSync('python3', [scanCommands], { cwd: foreignCwd, env, encoding: 'utf8' });
    assert.equal(cmdRun.status, 0, `${target} scan_commands.py failed: ${cmdRun.stderr}`);

    const skillRun = spawnSync('python3', [scanSkills], { cwd: foreignCwd, env, encoding: 'utf8' });
    assert.equal(skillRun.status, 0, `${target} scan_skills.py failed: ${skillRun.stderr}`);

    const regeneratedCmd = readFileSync(join(scriptDir, 'commands_data.yaml'), 'utf8');
    const regeneratedSkill = readFileSync(join(scriptDir, 'skills_data.yaml'), 'utf8');

    assert.equal(regeneratedCmd.includes('unrelated'), false, `${target} included unrelated command`);
    assert.equal(regeneratedSkill.includes('unrelated'), false, `${target} included unrelated skill`);

    const genCmd = spawnSync('python3', [genCatalogs, '--commands'], { cwd: foreignCwd, env, encoding: 'utf8' });
    assert.equal(genCmd.status, 0, `${target} generate_catalogs --commands failed: ${genCmd.stderr}`);

    const genSkill = spawnSync('python3', [genCatalogs, '--skills'], { cwd: foreignCwd, env, encoding: 'utf8' });
    assert.equal(genSkill.status, 0, `${target} generate_catalogs --skills failed: ${genSkill.stderr}`);

    cleanupUnrelated();
    rmSync(unrelatedSkillDir, { recursive: true, force: true });
  }
});

test('projected scanners fail closed on missing target, duplicate map, and unsafe path', () => {
  const { stage } = materialize('omp');
  const scriptDir = join(stage.path, SCRIPT_DIRS.omp);
  const scanCommands = join(scriptDir, 'scan_commands.py');
  const cmdDataFile = join(scriptDir, 'commands_data.yaml');
  const cmdMapFile = join(stage.path, '.omp/evcrate/command-name-map.json');
  const foreignCwd = temporaryDirectory();
  const env = { ...process.env, PYTHONDONTWRITEBYTECODE: '1' };
  const initialCmdData = readFileSync(cmdDataFile, 'utf8');

  // Missing allowlisted command file
  const targetCmd = join(stage.path, '.omp/commands/cmd-advise.md');
  const backupCmd = readFileSync(targetCmd, 'utf8');
  rmSync(targetCmd);
  const missingRun = spawnSync('python3', [scanCommands], { cwd: foreignCwd, env, encoding: 'utf8' });
  assert.notEqual(missingRun.status, 0);
  assert.match(missingRun.stderr, /missing or unsafe/i);
  assert.equal(readFileSync(cmdDataFile, 'utf8'), initialCmdData);
  writeFileSync(targetCmd, backupCmd);

  // Duplicate target in authority map
  const backupMap = readFileSync(cmdMapFile, 'utf8');
  const dupMap = JSON.parse(backupMap);
  dupMap.commands.push({ ...dupMap.commands[0] });
  writeFileSync(cmdMapFile, JSON.stringify(dupMap, null, 2));
  const dupRun = spawnSync('python3', [scanCommands], { cwd: foreignCwd, env, encoding: 'utf8' });
  assert.notEqual(dupRun.status, 0);
  assert.match(dupRun.stderr, /duplicate/i);
  assert.equal(readFileSync(cmdDataFile, 'utf8'), initialCmdData);
  writeFileSync(cmdMapFile, backupMap);

  // Unsafe path in authority map
  const unsafeMap = JSON.parse(backupMap);
  unsafeMap.commands.push({ source: 'outside.md', sourceName: 'outside', target: '../outside.md', targetName: 'outside' });
  writeFileSync(cmdMapFile, JSON.stringify(unsafeMap, null, 2));
  const unsafeRun = spawnSync('python3', [scanCommands], { cwd: foreignCwd, env, encoding: 'utf8' });
  assert.notEqual(unsafeRun.status, 0);
  assert.match(unsafeRun.stderr, /missing or unsafe/i);
  assert.equal(readFileSync(cmdDataFile, 'utf8'), initialCmdData);
  writeFileSync(cmdMapFile, backupMap);
});
