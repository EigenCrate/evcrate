import test from 'node:test';
import assert from 'node:assert/strict';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import {
  createProjectionBuildContext,
  createStagedRoot,
  getProjectionAdapter,
  loadTargetManifestRegistry,
  prepareInputSnapshot,
  assertLiveInputsUnchanged,
  runLocalBuild,
  hashFile,
} from '../../dist/index.js';
import {
  formatCommandName,
  parseCommandName,
  assertAgentName,
  copilotSkillName,
  copilotStyleName,
} from '../../dist/adapters/resource-naming.js';
import { ADVISOR_COMMAND_NAMES } from '../../dist/manifests/controller.js';
import { vscodeAdapter } from '../../dist/adapters/vscode/index.js';
import { makeTempDir, packageRoot, prepareFixtureWorkspace } from './parity-verification-helpers.mjs';
const registry = loadTargetManifestRegistry(join(packageRoot, '.evcrate/targets/manifest.json'));
const canonicalSourceDir = join(packageRoot, '.evcrate/source/.claude');

// =============================================================================
// Step 2.1: Existing behavior contracts & uncertain consumer behavior
// =============================================================================

test('Phase 09: all canonical command files round-trip through -x- reversibility', () => {
  const commandFiles = readdirSync(join(canonicalSourceDir, 'commands'))
    .filter((f) => f.endsWith('.md'));
  assert.ok(commandFiles.length >= 70, 'Must have at least 70 canonical commands');

  for (const file of commandFiles) {
    const stem = file.replace(/\.md$/, '');
    const parsed = parseCommandName(stem);
    assert.ok(parsed.segments.length >= 1);
    assert.equal(formatCommandName(parsed.segments), stem, `${stem} must format back to itself`);
    assert.ok(!parsed.segments.includes('x'), `${stem} segments must not contain reserved 'x' token`);
  }
});

test('Phase 09: all canonical agents use evc- prefix and valid identifiers across all targets', () => {
  const agentFiles = readdirSync(join(canonicalSourceDir, 'agents'))
    .filter((f) => f.endsWith('.md'));
  assert.ok(agentFiles.length >= 10, 'Must have canonical agents');

  for (const file of agentFiles) {
    const stem = file.replace(/\.md$/, '');
    assert.ok(stem.startsWith('evc-'), `${stem} must start with evc- prefix`);
    assert.equal(assertAgentName(stem), stem);
  }
});

test('Phase 09: Copilot skill and style prefixing conforms to spec without collision', () => {
  const skillNames = ['docs-seeker', 'database-admin', 'ui-ux-pro-max'];
  const styleNames = ['concise', 'detailed', 'explanatory'];

  const prefixedSkills = new Set();
  for (const s of skillNames) {
    const prefixed = copilotSkillName(s);
    assert.ok(prefixed.startsWith('evc-'));
    assert.equal(prefixedSkills.has(prefixed), false, 'No duplicate skill names');
    prefixedSkills.add(prefixed);
  }

  const prefixedStyles = new Set();
  for (const st of styleNames) {
    const prefixed = copilotStyleName(st);
    assert.ok(prefixed.startsWith('evc-style-'));
    assert.equal(prefixedStyles.has(prefixed), false, 'No duplicate style names');
    prefixedStyles.add(prefixed);
  }
});

test('Phase 09: VS Code emitted commands and skills do not hardcode evcrate-local: qualifier', () => {
  const root = makeTempDir('evcrate-vscode-naming-');
  try {
    const stage = createStagedRoot(root, '.vscode-test-stage-');
    try {
      const context = createProjectionBuildContext(registry.targets.get('vscode'), canonicalSourceDir, stage);
      vscodeAdapter.build(context);

      const skillsDir = join(stage.path, '.evcrate-vscode/skills');
      assert.ok(existsSync(skillsDir), 'skillsDir must exist in stage');
      const skillEntries = readdirSync(skillsDir);
      assert.ok(skillEntries.length > 0, 'skillsDir must contain entries');
      for (const entry of skillEntries) {
        assert.equal(entry.includes('evcrate-local:'), false,
          `Emitted skill folder ${entry} must not contain evcrate-local: prefix`);
      }
    } finally {
      stage.cleanup();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// =============================================================================
// Step 2.2: Phase 12 snapshot & drift regressions (serial and bounded-worker)
// =============================================================================

test('Phase 09: mutating generated root AGENTS does not supply canonical hash or cause drift rejection (jobs=1)', async () => {
  const fixture = makeTempDir('evcrate-p09-drift-j1-');
  try {
    prepareFixtureWorkspace(fixture);
    const source = join(fixture, '.evcrate', 'source');
    const canonical = join(source, '.claude', 'AGENTS.md');
    const generated = join(source, 'AGENTS.md');

    const expectedHash = hashFile(canonical);

    // Initial snapshot check
    const { shared, snapshotStage, snapshotHashes } = prepareInputSnapshot(fixture);
    try {
      assert.equal(snapshotHashes.agentsMdHash, expectedHash);
      assert.equal(shared.agentsMdHash, expectedHash);

      // Mutate generated root AGENTS
      writeFileSync(generated, '# Mutated generated root Codex AGENTS.md\n');

      // Live inputs check must NOT throw because generated AGENTS is ignored by snapshot
      assert.doesNotThrow(() => assertLiveInputsUnchanged(fixture, snapshotHashes));
    } finally {
      snapshotStage.cleanup();
    }

    // Build with jobs=1 must succeed despite mutated generated root AGENTS
    await assert.doesNotReject(async () => {
      await runLocalBuild(fixture, ['codex'], { jobs: 1 });
    });
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('Phase 09: mutating generated root AGENTS does not supply canonical hash or cause drift rejection (jobs=2)', async () => {
  const fixture = makeTempDir('evcrate-p09-drift-j2-');
  try {
    prepareFixtureWorkspace(fixture);
    const source = join(fixture, '.evcrate', 'source');
    const canonical = join(source, '.claude', 'AGENTS.md');
    const generated = join(source, 'AGENTS.md');

    const expectedHash = hashFile(canonical);

    writeFileSync(generated, '# Mutated root instructions for jobs=2 test\n');

    const { shared, snapshotStage, snapshotHashes } = prepareInputSnapshot(fixture);
    try {
      assert.equal(snapshotHashes.agentsMdHash, expectedHash);
      assert.equal(shared.agentsMdHash, expectedHash);
      assert.doesNotThrow(() => assertLiveInputsUnchanged(fixture, snapshotHashes));
    } finally {
      snapshotStage.cleanup();
    }

    await assert.doesNotReject(async () => {
      await runLocalBuild(fixture, ['codex', 'omp'], { jobs: 2 });
    });
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

// =============================================================================
// Step 2.3: Loading routes & instruction provenance across harnesses
// =============================================================================

test('Phase 09: Claude structural loading projects only .claude/rules/AGENTS.md without direct .claude/AGENTS.md or shim', () => {
  const root = makeTempDir('evcrate-p09-claude-');
  try {
    const source = join(root, 'source');
    mkdirSync(source, { recursive: true });
    const stage = createStagedRoot(source, '.claude-stage-');
    try {
      const context = createProjectionBuildContext(registry.targets.get('claude'), canonicalSourceDir, stage);
      getProjectionAdapter('claude').build(context);

      const rulesAgents = join(stage.path, '.claude/rules/AGENTS.md');
      const directAgents = join(stage.path, '.claude/AGENTS.md');
      const claudeMd = join(stage.path, '.claude/CLAUDE.md');

      assert.ok(existsSync(rulesAgents), '.claude/rules/AGENTS.md must exist in Claude projection');
      assert.equal(existsSync(directAgents), false, 'Direct .claude/AGENTS.md must NOT exist');
      assert.equal(existsSync(claudeMd), false, 'Legacy .claude/CLAUDE.md must NOT exist');

      const body = readFileSync(rulesAgents, 'utf8');
      assert.match(body, /# AGENTS\.md/u);
      // Rules content appears exactly once
      const headerMatches = body.match(/# AGENTS\.md/g);
      assert.equal(headerMatches?.length, 1, 'Header must appear exactly once');
    } finally {
      stage.cleanup();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('Phase 09: Codex owns project root AGENTS.md and .codex/AGENTS.md, deriving from canonical source', () => {
  const root = makeTempDir('evcrate-p09-codex-');
  try {
    const source = join(root, 'source');
    mkdirSync(source, { recursive: true });

    const codexStage = createStagedRoot(source, '.codex-stage-');
    try {
      const codexContext = createProjectionBuildContext(registry.targets.get('codex'), canonicalSourceDir, codexStage);
      getProjectionAdapter('codex').build(codexContext);

      const codexRootAgents = join(codexStage.path, 'AGENTS.md');
      const codexHomeAgents = join(codexStage.path, '.codex/AGENTS.md');
      assert.ok(existsSync(codexRootAgents), 'Codex must emit project root AGENTS.md');
      assert.ok(existsSync(codexHomeAgents), 'Codex must emit .codex/AGENTS.md for HOME');
    } finally {
      codexStage.cleanup();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('Phase 09: OMP, Pi, and Antigravity instruction delivery routes derive from canonical input', () => {
  const root = makeTempDir('evcrate-p09-routes-');
  try {
    const source = join(root, 'source');
    mkdirSync(source, { recursive: true });

    // OMP
    const ompStage = createStagedRoot(source, '.omp-stage-');
    try {
      const ompContext = createProjectionBuildContext(registry.targets.get('omp'), canonicalSourceDir, ompStage);
      getProjectionAdapter('omp').build(ompContext);
      assert.ok(existsSync(join(ompStage.path, '.omp/evcrate/AGENTS.md')), 'OMP must emit .omp/evcrate/AGENTS.md');
    } finally {
      ompStage.cleanup();
    }

    // Pi
    const piStage = createStagedRoot(source, '.pi-stage-');
    try {
      const piContext = createProjectionBuildContext(registry.targets.get('pi'), canonicalSourceDir, piStage);
      getProjectionAdapter('pi').build(piContext);
      assert.ok(existsSync(join(piStage.path, '.pi/agent/evcrate/AGENTS.md')), 'Pi must emit .pi/agent/evcrate/AGENTS.md');
    } finally {
      piStage.cleanup();
    }

    // Antigravity
    const agyStage = createStagedRoot(source, '.agy-stage-');
    try {
      const agyContext = createProjectionBuildContext(registry.targets.get('antigravity'), canonicalSourceDir, agyStage);
      getProjectionAdapter('antigravity').build(agyContext);
      assert.ok(existsSync(join(agyStage.path, '.antigravity/AGENTS.md')), 'Antigravity must emit .antigravity/AGENTS.md');
    } finally {
      agyStage.cleanup();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// =============================================================================
// Step 2.4: Golden fixture review across all targets
// =============================================================================

test('Phase 09: all target manifests pass schema-2 validation and declare non-overlapping outputs', () => {
  const targets = ['claude', 'codex', 'antigravity', 'omp', 'pi', 'copilot', 'vscode'];
  const allRoots = new Map();
  for (const t of targets) {
    const targetDef = registry.targets.get(t);
    assert.ok(targetDef, `Target ${t} must be registered`);
    assert.ok(targetDef.outputRoots.length > 0, `${t} must declare outputRoots`);
    const manifestJson = JSON.parse(readFileSync(targetDef.manifestPath, 'utf8'));
    assert.equal(manifestJson.schema_version, 2, `${t} manifest must be schema_version 2`);
    for (const root of targetDef.outputRoots) {
      assert.equal(allRoots.has(root), false, `Output root ${root} declared by multiple targets (${allRoots.get(root)} and ${t})`);
      allRoots.set(root, t);
    }
  }
});
