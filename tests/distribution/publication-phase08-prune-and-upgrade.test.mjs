import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { buildTestReleaseSet } from '../installers/fixtures/private-release-fixture.mjs';
import { createIsolatedEnv } from '../installers/fixtures/test-env.mjs';
import {
  existsSync, mkdirSync, mkdtempSync, readFileSync,
  rmSync, symlinkSync, writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  PERSISTED_TARGETS, createPublicationPlanSet, publishApply, publishDryRun,
  publicationStateRoot, resolveInvocationContext, resolvePublicationProjectContext, runLocalBuild,
  canonicalJsonBytes, hashBytes, readPublicationJournal, recoverPublicationUnlocked
} from '../../dist/index.js';
import { resolve } from 'node:path';
import { prepareFixtureWorkspace } from './parity-verification-helpers.mjs';
import { renderResult } from '../../dist/cli/output.js';
import {
  validatePublishApplyResultPayload, validatePublishDryRunResultPayload
} from '../../dist/protocol/publication-payloads.js';
import { readOptionalPublicationMarker, validatePublicationStateRecord } from '../../dist/distribution/publication-inventory.js';
let packageRoot;
let fixtureRoot;

test.before(async () => {
  fixtureRoot = mkdtempSync(join(tmpdir(), 'evcrate-phase08-package-'));
  packageRoot = join(fixtureRoot, 'package');
  prepareFixtureWorkspace(packageRoot);
  await runLocalBuild(packageRoot, PERSISTED_TARGETS, { emitAllManifests: true });
});

test.after(() => {
  if (fixtureRoot !== undefined) rmSync(fixtureRoot, { recursive: true, force: true });
});

function directory(path) {
  mkdirSync(path, { recursive: true, mode: 0o700 });
}

function userFile(root, relativePath, content) {
  const full = join(root, relativePath);
  directory(dirname(full));
  writeFileSync(full, content);
  return full;
}

function recordedMarker(destination, state, scope, selected, bindings, ownership, projectIdentity = null, status = 'complete') {
  const release = 'predecessor';
  const workspaceName = scope === 'home' ? `release-${release}` : `.evcrate-publish-${release}`;
  const harness = {
    phase: 'harness', scope, status, release_id: release,
    selected_targets: selected, binding_order: bindings,
    managed_paths: ownership, previous_managed_paths: structuredClone(ownership),
    build_manifest_path: '.evcrate/build-manifest.json', build_manifest_digest: 'a'.repeat(64),
    transaction_dir: `release-${release}`, retained_release_id: null,
    destination_root: resolve(destination), durable_state_root: resolve(state),
    workspace_root: join(scope === 'home' ? state : destination, workspaceName),
    workspace_name: workspaceName, project_identity: projectIdentity,
    retention: scope === 'home' ? 'bounded-one-home-release' : 'none'
  };
  return {
    schema_version: 2, transaction_type: 'target-publication', scope,
    records: scope === 'home' ? {
      shared: { ...harness, phase: 'shared', selected_targets: [], binding_order: ['.evcrate/bin'],
        managed_paths: {}, previous_managed_paths: {} },
      harness
    } : { harness }
  };
}

function retiredCleanupFixture(scope) {
  const root = mkdtempSync(join(tmpdir(), `evcrate-retired-rollback-${scope}-`));
  const home = join(root, 'home');
  const project = join(root, 'project');
  directory(home);
  directory(project);
  const context = resolveInvocationContext({
    packageRoot, cwd: packageRoot, home, projectRoot: project, targets: ['antigravity']
  });
  const destination = scope === 'home' ? home : project;
  const identity = scope === 'home' ? null : resolvePublicationProjectContext(context).projectIdentity;
  const state = scope === 'home' ? publicationStateRoot(home)
    : join(context.stateRoot, 'project-publication', identity);
  directory(state);
  const activeBinding = scope === 'home' ? '.gemini/config' : '.antigravity';
  const ownership = {
    antigravity: { [activeBinding]: ['AGENTS.md'] },
    gemini: { '.gemini': ['commands/worktree.toml'],
      ...(scope === 'project' ? { 'GEMINI.md': ['GEMINI.md'] } : {}) }
  };
  const marker = recordedMarker(
    destination, state, scope, ['antigravity', 'gemini'],
    scope === 'home' ? ['.gemini', activeBinding] : [activeBinding, '.gemini', 'GEMINI.md'],
    ownership, identity
  );
  writeFileSync(join(state, 'release-marker.json'), JSON.stringify(marker));
  const owned = [
    ['.gemini/commands/worktree.toml', '# Locally edited owned Gemini command\n'],
    ...(scope === 'project' ? [['GEMINI.md', '# Locally edited owned Gemini document\n']] : [])
  ].map(([path, content]) => [userFile(destination, path, content), content]);
  const active = userFile(destination, `${activeBinding}/AGENTS.md`, '# Previous active instructions\n');
  const untracked = userFile(destination, '.gemini/vendor-user.txt', 'Untracked vendor content\n');
  const plan = createPublicationPlanSet(context, { scope, priorManagedOwnership: ownership });
  assert.deepEqual(plan.harness.selectedTargets, ['antigravity']);
  assert.equal(plan.harness.bindingOrder.includes('.gemini'), false);
  assert.equal(plan.harness.bindingOrder.includes('GEMINI.md'), false);
  assert.equal(plan.harness.changes.some(({ target }) => target === 'gemini'), false);
  const created = plan.harness.bindings.flatMap(({ operations }) =>
    operations.filter(({ beforeSnapshot }) => !beforeSnapshot.present).map(({ destination }) => destination));
  return { root, scope, home, project, context, destination, identity, state, owned, active, untracked, created, ownership };
}

function assertRetiredCleanupRestored(value) {
  for (const [path, content] of value.owned) assert.equal(readFileSync(path, 'utf8'), content);
  assert.equal(readFileSync(value.active, 'utf8'), '# Previous active instructions\n');
  assert.equal(readFileSync(value.untracked, 'utf8'), 'Untracked vendor content\n');
  for (const path of value.created) assert.equal(existsSync(path), false, `rollback must remove ${path}`);
  assert.equal(existsSync(join(value.home, '.evcrate/bin')), value.scope === 'project',
    'HOME rollback includes the controller; project rollback preserves the separately committed shared phase');
  assert.equal(existsSync(join(value.state, 'publication-journal.json')), false);
  const record = readOptionalPublicationMarker(join(value.state, 'release-marker.json')).records.harness;
  assert.equal(record.status, 'recovered');
  assert.deepEqual(record.managed_paths, value.ownership);
  assert.deepEqual(record.selected_targets, ['antigravity']);
  assert.equal(record.binding_order.includes('.gemini'), false);
  assert.equal(record.binding_order.includes('GEMINI.md'), false);
}

for (const scope of ['home', 'project']) {
  test(`retired Gemini ${scope} cleanup rolls back edited owned files after an operation failure`, () => {
    const value = retiredCleanupFixture(scope);
    try {
      let deleted = 0;
      assert.throws(() => publishApply(value.context, {
        hooks: {
          afterOperation(operation) {
            if (operation.target !== 'gemini') return;
            assert.equal(operation.action, 'delete');
            assert.equal(existsSync(operation.destination), false);
            if (++deleted === value.owned.length) throw new Error('injected after retired cleanup');
          }
        }
      }, { scope, selectedTargets: ['antigravity'] }), (error) => error?.code === 'PUBLICATION_FAILED');
      assert.equal(deleted, value.owned.length, 'fault must happen after all retired deletions');
      assertRetiredCleanupRestored(value);
    } finally {
      rmSync(value.root, { recursive: true, force: true });
    }
  });

  test(`retired Gemini ${scope} persisted cleanup rejects forgery and recovers a crashed publisher`, () => {
    const value = retiredCleanupFixture(scope);
    try {
      const child = spawnSync(process.execPath, ['--input-type=module', '--eval', `
        import { publishApply, resolveInvocationContext } from ${JSON.stringify(new URL('../../dist/index.js', import.meta.url).href)};
        const input = JSON.parse(process.argv[1]);
        const context = resolveInvocationContext(input.context);
        let deleted = 0;
        publishApply(context, { hooks: { afterOperation(operation) {
          if (operation.target === 'gemini' && ++deleted === input.count) process.exit(86);
        } } }, { scope: input.scope, selectedTargets: ['antigravity'] });
        process.exit(87);
      `, JSON.stringify({
        context: { packageRoot, cwd: packageRoot, home: value.home, projectRoot: value.project, targets: ['antigravity'] },
        scope, count: value.owned.length
      })], { encoding: 'utf8', timeout: 120_000 });
      assert.equal(child.status, 86, child.stderr || child.error?.message);
      for (const [path] of value.owned) assert.equal(existsSync(path), false);
      assert.equal(readFileSync(value.untracked, 'utf8'), 'Untracked vendor content\n');
      const journalPath = join(value.state, 'publication-journal.json');
      const original = readFileSync(journalPath);
      const journal = JSON.parse(original);
      const cleanupIndex = journal.operations.findIndex(({ cleanup }) => cleanup === 'retired-binding');
      assert.notEqual(cleanupIndex, -1);
      const decoded = readPublicationJournal(value.state);
      assert.equal(decoded.operations[cleanupIndex].promoted, true, 'recovery must consume durable progress');
      assert.deepEqual(decoded.selected_targets, ['antigravity']);
      assert.equal(decoded.binding_order.includes('.gemini'), false);
      assert.equal(decoded.binding_order.includes('GEMINI.md'), false);

      const mutations = [
        ['unowned leaf', (raw, op) => {
          op.relative_path = 'vendor-user.txt';
          op.destination = '.gemini/vendor-user.txt';
        }],
        ['missing predecessor ownership', (raw) => {
          delete raw.previous_managed_paths.gemini;
          delete raw.records.harness.previous_managed_paths.gemini;
        }],
        ['record ownership mismatch', (raw) => { delete raw.records.harness.previous_managed_paths.gemini; }],
        ['create', (raw, op) => { op.action = 'create'; op.intendedHash = 'a'.repeat(64); }],
        ['update', (raw, op) => { op.action = 'update'; op.intendedHash = 'a'.repeat(64); }],
        ['wrong destination', (raw, op) => { op.destination = '.gemini/vendor-user.txt'; }],
        ['traversal', (raw, op) => { op.destination = '../outside'; }],
        ['wrong local root', (raw, op) => { op.local_root = '.antigravity'; }],
        ['unapproved binding', (raw, op) => { op.binding = '.gemini/config'; }],
        ['active target cleanup disguise', (raw, op) => { op.target = 'antigravity'; }],
        ['ordinary operation disguise', (raw, op) => { delete op.cleanup; }],
        ['unknown cleanup kind', (raw, op) => { op.cleanup = 'anything'; }],
        ['missing regular file', (raw, op) => { op.before = { present: false }; op.backup = null; }],
        ['directory', (raw, op) => { op.kind = 'directory'; op.before.kind = 'directory'; }],
        ['non-null intended hash', (raw, op) => { op.intendedHash = 'a'.repeat(64); }],
        ['wrong backup', (raw, op) => { op.backup = 'backups/999999'; }],
        ['duplicate destination', (raw, op) => { raw.operations.push({ ...op, backup: `backups/${raw.operations.length}` }); }],
        ['wrong workspace identity', (raw) => { raw.workspace_inode += 1; }],
        ['legacy schema cleanup', (raw) => { raw.schema_version = 2; }]
      ];
      if (scope === 'home') mutations.push(['project-only binding', (raw, op) => {
        op.binding = 'GEMINI.md'; op.local_root = 'GEMINI.md';
        op.relative_path = 'GEMINI.md'; op.destination = 'GEMINI.md';
      }]);
      for (const [name, mutate] of mutations) {
        const malformed = structuredClone(journal);
        mutate(malformed, malformed.operations[cleanupIndex]);
        malformed.operation_count = malformed.operations.length;
        malformed.operations_digest = hashBytes(canonicalJsonBytes(malformed.operations));
        writeFileSync(journalPath, canonicalJsonBytes(malformed));
        assert.throws(() => recoverPublicationUnlocked(value.state, value.destination, null, value.identity),
          undefined, name);
        for (const [path] of value.owned) assert.equal(existsSync(path), false, name);
        assert.equal(readFileSync(value.untracked, 'utf8'), 'Untracked vendor content\n', name);
      }
      writeFileSync(journalPath, original);
      const progressPath = join(journal.workspace_root, 'progress', `${cleanupIndex}.json`);
      const progress = readFileSync(progressPath);
      writeFileSync(progressPath, canonicalJsonBytes({
        index: cleanupIndex, promoted: true, intended: journal.operations[cleanupIndex].before
      }));
      assert.throws(() => recoverPublicationUnlocked(value.state, value.destination, null, value.identity));
      writeFileSync(progressPath, progress);
      const recovered = recoverPublicationUnlocked(value.state, value.destination, null, value.identity);
      assert.equal(recovered.action, 'rolled-back');
      assertRetiredCleanupRestored(value);
      assert.equal(existsSync(journal.workspace_root), false);
    } finally {
      rmSync(value.root, { recursive: true, force: true });
    }
  });

  test(`retired Gemini ${scope} cleanup refuses a symlink instead of deleting its referent`, { skip: process.platform === 'win32' }, () => {
    const value = retiredCleanupFixture(scope);
    try {
      const [ownedPath] = value.owned[0];
      rmSync(ownedPath);
      symlinkSync(value.untracked, ownedPath);
      assert.throws(() => publishApply(value.context, {}, { scope, selectedTargets: ['antigravity'] }));
      assert.equal(readFileSync(value.untracked, 'utf8'), 'Untracked vendor content\n');
      assert.equal(existsSync(join(value.state, 'publication-journal.json')), false);
    } finally {
      rmSync(value.root, { recursive: true, force: true });
    }
  });
}

test('Phase 08: Universal collision refusal protects unmanaged files at migrated destinations', () => {
  for (const target of ['claude', 'codex', 'omp']) {
    const root = mkdtempSync(join(tmpdir(), `evcrate-collision-${target}-`));
    try {
      const home = join(root, 'home');
      const project = join(root, 'project');
      directory(home);
      directory(project);

      const context = resolveInvocationContext({
        packageRoot, cwd: packageRoot, home, projectRoot: project, targets: [target]
      });

      // Place an unmanaged file where evc-cmd-code will be published
      let collidingRelPath;
      if (target === 'claude') {
        collidingRelPath = join(home, '.claude', 'commands', 'evc-cmd-code.md');
      } else if (target === 'omp') {
        collidingRelPath = join(home, '.omp', 'agent', 'evcrate', 'commands', 'evc-cmd-code.md');
      } else {
        collidingRelPath = join(home, '.agents', 'skills', 'evc-cmd-code', 'SKILL.md');
      }

      directory(dirname(collidingRelPath));
      writeFileSync(collidingRelPath, '# User Custom Unmanaged Code\n');

      // Planning must flag conflict
      const plan = createPublicationPlanSet(context, { scope: 'home' });
      const change = plan.harness.changes.find(({ path }) => path.endsWith('/evc-cmd-code.md') || path.endsWith('evc-cmd-code/SKILL.md'));
      assert.ok(change, `Plan must include evc-cmd-code for target ${target}`);
      assert.equal(change.action, 'conflict', `Unmanaged collision must be planned as conflict for ${target}`);

      // Apply must fail closed without changing user content
      assert.throws(
        () => publishApply(context, {}, { scope: 'home', selectedTargets: [target] }),
        (err) => err?.code === 'PUBLICATION_FAILED'
      );
      assert.equal(readFileSync(collidingRelPath, 'utf8'), '# User Custom Unmanaged Code\n');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test('Phase 08: Obsolete owned files are deleted even if edited locally by the user', () => {
  const root = mkdtempSync(join(tmpdir(), 'evcrate-edited-owned-'));
  try {
    const home = join(root, 'home');
    const project = join(root, 'project');
    directory(home);
    directory(project);

    const context = resolveInvocationContext({
      packageRoot, cwd: packageRoot, home, projectRoot: project, targets: ['claude']
    });

    // Simulate prior marker where .claude had commands/code.md (legacy command)
    const legacyPath = join(home, '.claude', 'commands', 'code.md');
    directory(dirname(legacyPath));
    writeFileSync(legacyPath, '# User Modified Stale Command\n');

    const state = publicationStateRoot(home);
    directory(state);
    const marker = recordedMarker(
      home, state, 'home', ['claude'], ['.claude'],
      { claude: { '.claude': ['commands/code.md'] } }
    );
    writeFileSync(join(state, 'release-marker.json'), JSON.stringify(marker));

    // Plan must delete the obsolete owned file despite user edits
    const plan = createPublicationPlanSet(context, {
      scope: 'home',
      priorManagedOwnership: {
        claude: { '.claude': ['commands/code.md'] }
      }
    });
    const deleteOp = plan.harness.changes.find(({ path }) => path === '.claude/commands/code.md');
    assert.ok(deleteOp, 'Plan must include deletion of obsolete owned commands/code.md');
    assert.equal(deleteOp.action, 'delete', 'Action must be delete');

    // Apply the publication
    publishApply(context, {}, { scope: 'home', selectedTargets: ['claude'] });

    // Obsolete owned file must be gone
    assert.equal(existsSync(legacyPath), false, 'Edited obsolete owned file must be deleted on apply');
    // New unified file must exist
    assert.ok(existsSync(join(home, '.claude', 'commands', 'evc-cmd-code.md')));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('Phase 08: Obsolete owned instruction documents (e.g. .claude/CLAUDE.md) are deleted when owned', () => {
  const root = mkdtempSync(join(tmpdir(), 'evcrate-removed-doc-'));
  try {
    const home = join(root, 'home');
    const project = join(root, 'project');
    directory(home);
    directory(project);

    const context = resolveInvocationContext({
      packageRoot, cwd: packageRoot, home, projectRoot: project, targets: ['claude']
    });

    // Seed owned CLAUDE.md inside .claude
    const claudeMd = join(project, '.claude', 'CLAUDE.md');
    directory(dirname(claudeMd));
    writeFileSync(claudeMd, '# Obsolete Managed .claude/CLAUDE.md\n');

    const identity = resolvePublicationProjectContext(context).projectIdentity;
    const projectState = join(context.stateRoot, 'project-publication', identity);
    directory(projectState);
    const marker = recordedMarker(
      project, projectState, 'project', ['claude'], ['.claude'],
      { claude: { '.claude': ['CLAUDE.md'] } },
      identity
    );
    writeFileSync(join(projectState, 'release-marker.json'), JSON.stringify(marker));


    // Plan for project scope must detect obsolete owned document and plan delete
    const plan = createPublicationPlanSet(context, {
      scope: 'project',
      priorManagedOwnership: {
        claude: { '.claude': ['CLAUDE.md'] }
      }
    });

    const docDelete = plan.harness.changes.find(({ path }) => path === '.claude/CLAUDE.md');
    assert.ok(docDelete, 'Plan must delete obsolete owned .claude/CLAUDE.md');
    assert.equal(docDelete.action, 'delete');

    // Apply in project scope
    publishApply(context, {}, { scope: 'project', selectedTargets: ['claude'] });

    // Owned .claude/CLAUDE.md must be deleted
    assert.equal(existsSync(claudeMd), false, 'Owned .claude/CLAUDE.md must be deleted');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('Phase 08: Untracked legacy files are preserved and reported in legacyLeftovers', () => {
  const root = mkdtempSync(join(tmpdir(), 'evcrate-untracked-leftovers-'));
  try {
    const home = join(root, 'home');
    const project = join(root, 'project');
    directory(home);
    directory(project);

    const context = resolveInvocationContext({
      packageRoot, cwd: packageRoot, home, projectRoot: project, targets: ['claude']
    });

    // Create an untracked legacy command and an untracked legacy agent in HOME
    const untrackedCmd = userFile(home, '.claude/commands/code.md', '# Untracked legacy code\n');
    const untrackedAgent = userFile(home, '.claude/agents/planner.md', '# Untracked legacy planner\n');
    // Also create an unrelated user file that should NOT be reported
    const unrelatedFile = userFile(home, '.claude/commands/my-custom-script.md', '# Custom\n');

    // Dry-run must report legacyLeftovers without modifying disk state
    const dryRunResult = publishDryRun(context, { scope: 'home', selectedTargets: ['claude'] });
    assert.equal(existsSync(join(home, '.claude/commands/evc-cmd-code.md')), false, 'Dry-run must not write new commands');
    assert.ok(Array.isArray(dryRunResult.legacyLeftovers), 'Dry-run result must contain legacyLeftovers array');
    assert.deepEqual(
      dryRunResult.legacyLeftovers.map((l) => l.path),
      ['agents/planner.md', 'commands/code.md'],
      'Dry-run must report exact untracked legacy leftovers'
    );
    const dryRunTty = renderResult({
      protocol: 'evcrate-resource-control',
      protocolVersion: 1,
      requestId: 'test-dry-req',
      operation: 'publish.dry-run',
      status: 'preview',
      payload: dryRunResult
    }, { isTTY: true });
    assert.match(dryRunTty, /^preview\nWarning: Preserved untracked legacy artifacts detected:/);

    // Publish without prior ownership (fresh install / untracked predecessor)
    const result = publishApply(context, {}, { scope: 'home', selectedTargets: ['claude'] });
    // Files must be preserved
    assert.equal(existsSync(untrackedCmd), true, 'Untracked legacy command must be preserved');
    assert.equal(readFileSync(untrackedCmd, 'utf8'), '# Untracked legacy code\n');
    assert.equal(existsSync(untrackedAgent), true, 'Untracked legacy agent must be preserved');
    assert.equal(existsSync(unrelatedFile), true, 'Unrelated user file must be preserved');

    // legacyLeftovers must report the legacy files, but NOT unrelated file
    assert.ok(Array.isArray(result.legacyLeftovers), 'Result must contain legacyLeftovers array');
    const leftovers = result.legacyLeftovers;
    const paths = leftovers.map((l) => l.path);
    assert.ok(paths.includes('commands/code.md'), 'Must report untracked legacy commands/code.md');
    assert.ok(paths.includes('agents/planner.md'), 'Must report untracked legacy agents/planner.md');
    assert.equal(paths.includes('commands/my-custom-script.md'), false, 'Must NOT report unrelated user file');

    // Kinds must be correct
    const cmdLeftover = leftovers.find((l) => l.path === 'commands/code.md');
    assert.equal(cmdLeftover?.kind, 'command');
    assert.equal(cmdLeftover?.target, 'claude');

    const agentLeftover = leftovers.find((l) => l.path === 'agents/planner.md');
    assert.equal(agentLeftover?.kind, 'agent');
    assert.equal(agentLeftover?.target, 'claude');

    // Machine rendering: single valid JSON with no appended prose
    const jsonOutput = renderResult({
      protocol: 'evcrate-resource-control',
      protocolVersion: 1,
      requestId: 'test-req',
      operation: 'publish.apply',
      status: 'published',
      payload: result
    }, { json: true });
    assert.doesNotThrow(() => JSON.parse(jsonOutput), 'Machine output must be valid JSON');
    assert.equal(jsonOutput.endsWith('\n'), true);

    // Human TTY rendering: displays warning with exact locations
    const ttyOutput = renderResult({
      protocol: 'evcrate-resource-control',
      protocolVersion: 1,
      requestId: 'test-req',
      operation: 'publish.apply',
      status: 'published',
      payload: result
    }, { isTTY: true });
    assert.match(ttyOutput, /published/);
    assert.match(ttyOutput, /Warning: Preserved untracked legacy artifacts detected:/);
    assert.match(ttyOutput, /commands\/code\.md \(command\)/);
    assert.match(ttyOutput, /agents\/planner\.md \(agent\)/);
    assert.match(ttyOutput, /Manual review recommended/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('Phase 08: validatePublishApplyResultPayload and validatePublishDryRunResultPayload enforce strict leftover validation and absent-field compatibility', () => {
  const validBase = {
    scope: 'home',
    projectIdentity: null,
    buildManifestPath: '.evcrate/build-manifest-omp.json',
    buildManifestDigest: 'a'.repeat(64),
    phases: [
      { phase: 'shared', scope: 'home', status: 'committed', releaseId: 'rel-1', retainedReleaseId: null, selectedTargets: [], bindingOrder: ['.evcrate/bin'], changes: [] },
      { phase: 'harness', scope: 'home', status: 'committed', releaseId: 'rel-1', retainedReleaseId: null, selectedTargets: ['omp'], bindingOrder: ['.omp'], changes: [] }
    ]
  };
  const validDryRunBase = {
    scope: 'home',
    projectIdentity: null,
    buildManifestPath: '.evcrate/build-manifest-omp.json',
    buildManifestDigest: 'a'.repeat(64),
    phases: [
      { phase: 'shared', scope: 'home', selectedTargets: [], bindingOrder: ['.evcrate/bin'], changes: [] },
      { phase: 'harness', scope: 'home', selectedTargets: ['omp'], bindingOrder: ['.omp'], changes: [] }
    ]
  };

  for (const [validate, base] of [
    [validatePublishApplyResultPayload, validBase],
    [validatePublishDryRunResultPayload, validDryRunBase]
  ]) {
    // 1. Absent legacyLeftovers is valid and accepted (backward compatibility)
    const withoutLeftovers = validate(base);
    assert.equal(withoutLeftovers.scope, 'home');

    // 2. Valid legacyLeftovers is preserved
    const withValid = {
      ...base,
      legacyLeftovers: [
        { target: 'omp', path: 'commands/cmd-code.md', kind: 'command' }
      ]
    };
    const validatedWith = validate(withValid);
    assert.deepEqual(validatedWith.legacyLeftovers, withValid.legacyLeftovers);

    // 3. Unselected target in legacyLeftovers throws VALIDATION_INVALID
    assert.throws(
      () => validate({
        ...base,
        legacyLeftovers: [{ target: 'claude', path: 'commands/code.md', kind: 'command' }]
      }),
      (err) => err?.code === 'VALIDATION_INVALID'
    );

    // 4. Invalid kind throws VALIDATION_INVALID
    assert.throws(
      () => validate({
        ...base,
        legacyLeftovers: [{ target: 'omp', path: 'commands/cmd-code.md', kind: 'invalid-kind' }]
      }),
      (err) => err?.code === 'VALIDATION_INVALID'
    );

    // 5. Unsorted entries throw VALIDATION_INVALID
    assert.throws(
      () => validate({
        ...base,
        phases: [
          base.phases[0],
          { ...base.phases[1], selectedTargets: ['claude', 'omp'] }
        ],
        legacyLeftovers: [
          { target: 'omp', path: 'commands/cmd-code.md', kind: 'command' },
          { target: 'claude', path: 'commands/code.md', kind: 'command' }
        ]
      }),
      (err) => err?.code === 'VALIDATION_INVALID'
    );
  }
});
test('Phase 08: Pinned stable (v2.10.2) to candidate upgrade smoke scenario across scopes', () => {
  const env = createIsolatedEnv();
  try {
    // 1. Build and install pinned stable release v2.10.2
    const stableAssets = buildTestReleaseSet({ outputDir: env.assetsDir, version: '2.10.2' });
    const installSh = join(env.assetsDir, 'install.sh');
    const installArgs = ['--data-dir', env.dataDir, '--state-dir', env.stateDir, '--bin-dir', env.binDir];
    execFileSync(installSh, ['install', ...installArgs], { cwd: env.tmp, encoding: 'utf8' });

    const launcher = join(env.binDir, 'evcrate');
    assert.ok(existsSync(launcher), 'Launcher must exist after stable install');

    // 2. Setup disposable HOME and project
    const home = join(env.tmp, 'user-home');
    const project = join(env.tmp, 'user-project');
    directory(home);
    directory(project);

    const context = resolveInvocationContext({
      packageRoot, cwd: packageRoot, home, projectRoot: project, targets: ['omp', 'claude']
    });

    // 3. Establish genuine predecessor state with edited-owned files, untracked leftovers, and unrelated files
    const editedOwnedClaudeCmd = userFile(home, '.claude/commands/code.md', '# User Modified Owned Code Cmd\n');
    const editedOwnedOmpCmd = userFile(home, '.omp/agent/commands/cmd-code.md', '# User Modified Owned OMP Cmd\n');
    const untrackedLegacyCmd = userFile(home, '.claude/commands/advise.md', '# Untracked Legacy Advise\n');
    const untrackedLegacyAgent = userFile(home, '.claude/agents/planner.md', '# Untracked Legacy Planner\n');
    const unrelatedUserFile = userFile(home, '.claude/commands/my-custom-script.sh', '#!/bin/sh\necho custom\n');

    const homeState = publicationStateRoot(home);
    directory(homeState);
    const predecessorMarker = recordedMarker(
      home, homeState, 'home', ['omp', 'claude'], ['.omp', '.claude'],
      {
        omp: { '.omp': ['agent/commands/cmd-code.md'] },
        claude: { '.claude': ['commands/code.md'] }
      }
    );
    writeFileSync(join(homeState, 'release-marker.json'), JSON.stringify(predecessorMarker));

    // 4. Test unmanaged candidate-name collision refusal
    const collidingFile = userFile(home, '.claude/commands/evc-cmd-code.md', '# Colliding Custom Code\n');
    assert.throws(
      () => publishApply(context, {}, { scope: 'home', selectedTargets: ['omp', 'claude'] }),
      (err) => err?.code === 'PUBLICATION_FAILED',
      'Must refuse candidate destination collision'
    );
    assert.equal(readFileSync(collidingFile, 'utf8'), '# Colliding Custom Code\n');
    assert.equal(existsSync(editedOwnedClaudeCmd), true, 'Owned files must not be touched on collision refusal');

    // Manually resolve the collision in sandbox
    rmSync(collidingFile, { force: true });

    // 5. Upgrade publication apply across HOME
    const homeResult = publishApply(context, {}, { scope: 'home', selectedTargets: ['omp', 'claude'] });
    // Verify edited-owned obsolete files are deleted
    assert.equal(existsSync(editedOwnedClaudeCmd), false, 'Edited owned obsolete Claude command must be deleted');
    assert.equal(existsSync(editedOwnedOmpCmd), false, 'Edited owned obsolete OMP command must be deleted');

    // Verify candidate unified files exist
    assert.ok(existsSync(join(home, '.claude', 'commands', 'evc-cmd-code.md')), 'Unified Claude command must exist');
    assert.ok(existsSync(join(home, '.omp', 'agent', 'evcrate', 'commands', 'evc-cmd-code.md')), 'Unified OMP command must exist');

    // Verify untracked legacy files are preserved byte-for-byte
    assert.equal(existsSync(untrackedLegacyCmd), true, 'Untracked legacy command must be preserved');
    assert.equal(readFileSync(untrackedLegacyCmd, 'utf8'), '# Untracked Legacy Advise\n');
    assert.equal(existsSync(untrackedLegacyAgent), true, 'Untracked legacy agent must be preserved');
    assert.equal(readFileSync(untrackedLegacyAgent, 'utf8'), '# Untracked Legacy Planner\n');
    assert.equal(existsSync(unrelatedUserFile), true, 'Unrelated user file must be preserved');

    // Verify legacyLeftovers reporting
    assert.ok(Array.isArray(homeResult.legacyLeftovers));
    const reportedPaths = homeResult.legacyLeftovers.map((l) => `${l.target}:${l.path}`);
    assert.ok(reportedPaths.includes('claude:commands/advise.md'), 'Must report untracked commands/advise.md');
    assert.ok(reportedPaths.includes('claude:agents/planner.md'), 'Must report untracked agents/planner.md');
    assert.equal(reportedPaths.some((p) => p.includes('my-custom-script.sh')), false, 'Must not report unrelated file');

    // Verify human TTY output
    const ttyOutput = renderResult({
      protocol: 'evcrate-resource-control',
      protocolVersion: 1,
      requestId: 'smoke-req',
      operation: 'publish.apply',
      status: 'published',
      payload: homeResult
    }, { isTTY: true });
    assert.match(ttyOutput, /published/);
    assert.match(ttyOutput, /Warning: Preserved untracked legacy artifacts detected:/);
    assert.match(ttyOutput, /\[claude\] commands\/advise\.md \(command\)/);
    assert.match(ttyOutput, /\[claude\] agents\/planner\.md \(agent\)/);
    assert.match(ttyOutput, /Manual review recommended/);

    // Verify machine JSON output
    const jsonOutput = renderResult({
      protocol: 'evcrate-resource-control',
      protocolVersion: 1,
      requestId: 'smoke-req',
      operation: 'publish.apply',
      status: 'published',
      payload: homeResult
    }, { json: true });
    const parsedJson = JSON.parse(jsonOutput);
    assert.equal(parsedJson.status, 'published');
    assert.ok(Array.isArray(parsedJson.payload.legacyLeftovers));

    // 6. Project scope upgrade
    const projectContext = resolveInvocationContext({
      packageRoot, cwd: packageRoot, home, projectRoot: project, targets: ['claude']
    });
    const projectIdentity = resolvePublicationProjectContext(projectContext).projectIdentity;
    const projectState = join(projectContext.stateRoot, 'project-publication', projectIdentity);
    directory(projectState);
    const projectPredecessorMarker = recordedMarker(
      project, projectState, 'project', ['claude'], ['.claude'],
      { claude: { '.claude': ['commands/cook.md'] } },
      projectIdentity
    );
    writeFileSync(join(projectState, 'release-marker.json'), JSON.stringify(projectPredecessorMarker));

    const projectOwnedCook = userFile(project, '.claude/commands/cook.md', '# Project Owned Cook\n');
    const projectUntrackedScout = userFile(project, '.claude/commands/scout.md', '# Project Untracked Scout\n');

    const projectResult = publishApply(projectContext, {}, { scope: 'project', selectedTargets: ['claude'] });
    assert.equal(existsSync(projectOwnedCook), false, 'Project owned obsolete file must be deleted');
    assert.equal(existsSync(projectUntrackedScout), true, 'Project untracked file must be preserved');
    assert.ok(projectResult.legacyLeftovers?.some((l) => l.target === 'claude' && l.path === 'commands/scout.md'));
  } finally {
    env.cleanup();
  }
});

test('Phase 08 / PR #24: Predecessor Gemini cleanup in project scope preserves layout validity and allows re-publication', () => {
  const env = createIsolatedEnv();
  try {
    const home = join(env.tmp, 'user-home');
    const project = join(env.tmp, 'user-project');
    directory(home);
    directory(project);

    const projectContext = resolveInvocationContext({
      packageRoot, cwd: packageRoot, home, projectRoot: project, targets: ['antigravity']
    });
    const projectIdentity = resolvePublicationProjectContext(projectContext).projectIdentity;
    const projectState = join(projectContext.stateRoot, 'project-publication', projectIdentity);
    directory(projectState);

    // Predecessor marker with antigravity and gemini ownership
    const predecessorMarker = recordedMarker(
      project, projectState, 'project',
      ['antigravity', 'gemini'],
      ['.antigravity', '.gemini', 'GEMINI.md'],
      {
        antigravity: { '.antigravity': ['AGENTS.md'] },
        gemini: {
          '.gemini': ['commands/worktree.toml'],
          'GEMINI.md': ['GEMINI.md']
        }
      },
      projectIdentity
    );
    writeFileSync(join(projectState, 'release-marker.json'), JSON.stringify(predecessorMarker));

    // Staging: owned files (one locally modified), untracked command skill, untracked vendor file
    const ownedGeminiCmd = userFile(project, '.gemini/commands/worktree.toml', '# User Modified Owned Gemini Cmd\n');
    const ownedGeminiMd = userFile(project, 'GEMINI.md', '# User Modified Owned GEMINI.md\n');
    const untrackedCmdSkill = userFile(project, '.gemini/skills/cmd_advise/SKILL.md', '# Untracked Project Advise Skill\n');
    const untrackedVendor = userFile(project, '.gemini/vendor-user.txt', 'Untracked vendor content\n');

    // 0. Dry-run before apply: reports untracked .gemini leftover while excluding recorded-owned files and leaving disk untouched
    const dryRunResult = publishDryRun(projectContext, { scope: 'project', selectedTargets: ['antigravity'] });
    assert.equal(existsSync(ownedGeminiCmd), true, 'Dry-run must not delete owned Gemini command');
    assert.equal(existsSync(ownedGeminiMd), true, 'Dry-run must not delete owned GEMINI.md');
    assert.deepEqual(dryRunResult.legacyLeftovers, [
      { target: 'antigravity', path: 'skills/cmd_advise/SKILL.md', kind: 'command' }
    ]);

    // 1. First invocation: publish antigravity
    const firstResult = publishApply(projectContext, {}, { scope: 'project', selectedTargets: ['antigravity'] });
    assert.equal(firstResult.scope, 'project');

    // Verify owned Gemini files were pruned despite local edits
    assert.equal(existsSync(ownedGeminiCmd), false, 'Owned Gemini command must be pruned');
    assert.equal(existsSync(ownedGeminiMd), false, 'Owned GEMINI.md must be pruned');

    // Verify untracked files are strictly preserved and untracked legacy skill is reported in legacyLeftovers
    assert.equal(existsSync(untrackedCmdSkill), true, 'Untracked command skill must be preserved');
    assert.equal(existsSync(untrackedVendor), true, 'Untracked vendor file must be preserved');
    assert.equal(readFileSync(untrackedVendor, 'utf8'), 'Untracked vendor content\n');
    assert.deepEqual(firstResult.legacyLeftovers, [
      { target: 'antigravity', path: 'skills/cmd_advise/SKILL.md', kind: 'command' }
    ]);
    const harnessPhase = firstResult.phases[1];
    assert.deepEqual([...harnessPhase.selectedTargets], ['antigravity']);
    assert.equal(harnessPhase.bindingOrder.includes('.gemini'), false, 'bindingOrder must not include .gemini');
    assert.equal(harnessPhase.bindingOrder.includes('GEMINI.md'), false, 'bindingOrder must not include GEMINI.md');

    // Verify changes do not include retired target gemini
    assert.equal(harnessPhase.changes.some((c) => c.target === 'gemini'), false, 'changes must not contain gemini');

    // Verify written marker is valid
    const markerAfterFirst = readOptionalPublicationMarker(join(projectState, 'release-marker.json'));
    assert.ok(markerAfterFirst !== null, 'Marker must exist after publication');
    validatePublicationStateRecord(markerAfterFirst.records.harness, 'harness', 'project');

    // Verify managed_paths in marker no longer has gemini
    assert.equal(Object.hasOwn(markerAfterFirst.records.harness.managed_paths, 'gemini'), false, 'Marker must not manage gemini');

    // 2. Second invocation: must cleanly succeed, reread marker, and maintain stability
    const secondResult = publishApply(projectContext, {}, { scope: 'project', selectedTargets: ['antigravity'] });
    assert.equal(secondResult.scope, 'project');
    const markerAfterSecond = readOptionalPublicationMarker(join(projectState, 'release-marker.json'));
    validatePublicationStateRecord(markerAfterSecond.records.harness, 'harness', 'project');
  } finally {
    env.cleanup();
  }
});

test('Phase 08 / PR #24: Predecessor Gemini cleanup in HOME scope prunes owned files and reports untracked leftovers', () => {
  const env = createIsolatedEnv();
  try {
    const home = join(env.tmp, 'user-home');
    const project = join(env.tmp, 'user-project');
    directory(home);
    directory(project);

    const context = resolveInvocationContext({
      packageRoot, cwd: packageRoot, home, projectRoot: project, targets: ['antigravity']
    });
    const homeState = publicationStateRoot(home);
    directory(homeState);

    // Predecessor marker with antigravity and gemini ownership
    const predecessorMarker = recordedMarker(
      home, homeState, 'home',
      ['antigravity', 'gemini'],
      ['.gemini', '.gemini/config'],
      {
        antigravity: { '.gemini/config': ['AGENTS.md'] },
        gemini: {
          '.gemini': ['skills/cmd_worktree/SKILL.md']
        }
      }
    );
    writeFileSync(join(homeState, 'release-marker.json'), JSON.stringify(predecessorMarker));

    // Staging: owned file, untracked command leftover, and untracked user file
    const ownedGeminiSkill = userFile(home, '.gemini/skills/cmd_worktree/SKILL.md', '# Owned Worktree Skill\n');
    const untrackedCmdSkill = userFile(home, '.gemini/skills/cmd_advise/SKILL.md', '# Untracked Advise Skill\n');
    const untrackedVendor = userFile(home, '.gemini/vendor-user.txt', 'Untracked vendor content\n');

    // 1. First invocation: publish antigravity in HOME scope
    const firstResult = publishApply(context, {}, { scope: 'home', selectedTargets: ['antigravity'] });
    assert.equal(firstResult.scope, 'home');

    // Verify owned Gemini skill is deleted
    assert.equal(existsSync(ownedGeminiSkill), false, 'Owned Gemini skill must be pruned');

    // Verify untracked files are preserved
    assert.equal(existsSync(untrackedCmdSkill), true, 'Untracked command skill must be preserved');
    assert.equal(existsSync(untrackedVendor), true, 'Untracked vendor file must be preserved');

    // Verify untracked legacy command is reported in legacyLeftovers
    assert.ok(Array.isArray(firstResult.legacyLeftovers));
    assert.ok(
      firstResult.legacyLeftovers.some((l) => l.target === 'antigravity' && l.path === 'skills/cmd_advise/SKILL.md'),
      'Must report untracked skills/cmd_advise/SKILL.md in legacyLeftovers'
    );
    assert.equal(
      firstResult.legacyLeftovers.some((l) => l.path.includes('vendor-user.txt')),
      false,
      'Must not report unrelated vendor file in legacyLeftovers'
    );

    // Verify written marker is valid
    const markerAfterFirst = readOptionalPublicationMarker(join(homeState, 'release-marker.json'));
    assert.ok(markerAfterFirst !== null, 'Marker must exist after publication');
    validatePublicationStateRecord(markerAfterFirst.records.harness, 'harness', 'home');

    // 2. Second invocation: must cleanly succeed, reread marker, and maintain stability
    const secondResult = publishApply(context, {}, { scope: 'home', selectedTargets: ['antigravity'] });
    assert.equal(secondResult.scope, 'home');
    const markerAfterSecond = readOptionalPublicationMarker(join(homeState, 'release-marker.json'));
    validatePublicationStateRecord(markerAfterSecond.records.harness, 'harness', 'home');
  } finally {
    env.cleanup();
  }
});
