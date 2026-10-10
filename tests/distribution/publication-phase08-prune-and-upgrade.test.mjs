import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { buildTestReleaseSet } from '../installers/fixtures/private-release-fixture.mjs';
import { createIsolatedEnv } from '../installers/fixtures/test-env.mjs';
import {
  existsSync, mkdirSync, mkdtempSync, readFileSync,
  rmSync, writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  PERSISTED_TARGETS, createPublicationPlanSet, publishApply,
  publicationStateRoot, resolveInvocationContext, resolvePublicationProjectContext, runLocalBuild
} from '../../dist/index.js';
import { resolve } from 'node:path';
import { prepareFixtureWorkspace } from './parity-verification-helpers.mjs';
import { renderResult } from '../../dist/cli/output.js';
import { validatePublishApplyResultPayload } from '../../dist/protocol/publication-payloads.js';
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

test('Phase 08: validatePublishApplyResultPayload enforces strict leftover validation and absent-field compatibility', () => {
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

  // 1. Absent legacyLeftovers is valid and accepted (backward compatibility)
  const withoutLeftovers = validatePublishApplyResultPayload(validBase);
  assert.equal(withoutLeftovers.scope, 'home');

  // 2. Valid legacyLeftovers is preserved
  const withValid = {
    ...validBase,
    legacyLeftovers: [
      { target: 'omp', path: 'commands/cmd-code.md', kind: 'command' }
    ]
  };
  const validatedWith = validatePublishApplyResultPayload(withValid);
  assert.deepEqual(validatedWith.legacyLeftovers, withValid.legacyLeftovers);

  // 3. Unselected target in legacyLeftovers throws VALIDATION_INVALID
  assert.throws(
    () => validatePublishApplyResultPayload({
      ...validBase,
      legacyLeftovers: [{ target: 'claude', path: 'commands/code.md', kind: 'command' }]
    }),
    (err) => err?.code === 'VALIDATION_INVALID'
  );

  // 4. Invalid kind throws VALIDATION_INVALID
  assert.throws(
    () => validatePublishApplyResultPayload({
      ...validBase,
      legacyLeftovers: [{ target: 'omp', path: 'commands/cmd-code.md', kind: 'invalid-kind' }]
    }),
    (err) => err?.code === 'VALIDATION_INVALID'
  );

  // 5. Unsorted entries throw VALIDATION_INVALID
  assert.throws(
    () => validatePublishApplyResultPayload({
      ...validBase,
      phases: [
        validBase.phases[0],
        { ...validBase.phases[1], selectedTargets: ['claude', 'omp'] }
      ],
      legacyLeftovers: [
        { target: 'omp', path: 'commands/cmd-code.md', kind: 'command' },
        { target: 'claude', path: 'commands/code.md', kind: 'command' }
      ]
    }),
    (err) => err?.code === 'VALIDATION_INVALID'
  );
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

    // Staging: owned files (one locally modified), untracked file, and existing antigravity AGENTS.md
    const ownedGeminiCmd = userFile(project, '.gemini/commands/worktree.toml', '# User Modified Owned Gemini Cmd\n');
    const ownedGeminiMd = userFile(project, 'GEMINI.md', '# User Modified Owned GEMINI.md\n');
    const untrackedVendor = userFile(project, '.gemini/vendor-user.txt', 'Untracked vendor content\n');

    // 1. First invocation: publish antigravity
    const firstResult = publishApply(projectContext, {}, { scope: 'project', selectedTargets: ['antigravity'] });
    assert.equal(firstResult.scope, 'project');

    // Verify owned Gemini files were pruned despite local edits
    assert.equal(existsSync(ownedGeminiCmd), false, 'Owned Gemini command must be pruned');
    assert.equal(existsSync(ownedGeminiMd), false, 'Owned GEMINI.md must be pruned');

    // Verify untracked user file is strictly preserved
    assert.equal(existsSync(untrackedVendor), true, 'Untracked vendor file must be preserved');
    assert.equal(readFileSync(untrackedVendor, 'utf8'), 'Untracked vendor content\n');

    // Verify active binding order in payload does not include .gemini or GEMINI.md
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
