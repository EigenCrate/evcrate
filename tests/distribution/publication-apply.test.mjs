import test from 'node:test';
import assert from 'node:assert/strict';
import {
  chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync,
  rmSync, writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import {
  ControlPlaneError, MAX_RETAINED_RELEASE_AGE_MS, PERSISTED_TARGETS, publishApply, publishDryRun,
  publicationStateRoot, recoverPublication, resolveCurrentPublicationBuild,
  resolveInvocationContext, resolvePublicationProjectContext,
  runLocalBuild
} from '../../dist/index.js';
import { prepareFixtureWorkspace } from './parity-verification-helpers.mjs';

let packageRoot;
let fixtureRoot;
test.before(async () => {
  fixtureRoot = mkdtempSync(join(tmpdir(), 'evcrate-publication-package-'));
  packageRoot = join(fixtureRoot, 'package');
  prepareFixtureWorkspace(packageRoot);
  await runLocalBuild(packageRoot, PERSISTED_TARGETS, { emitAllManifests: true });
});
test.after(() => {
  if (fixtureRoot !== undefined) rmSync(fixtureRoot, { recursive: true, force: true });
});
const policyBytes = Buffer.from('{"version":1,"advisor":{"backend":"codex","model":"m","effort":"low","timeout_ms":60000}}\n');

function directory(path) {
  mkdirSync(path, { recursive: true, mode: 0o700 });
  chmodSync(path, 0o700);
}

test('OMP publication is real, isolated, recoverable, and retention-bounded', () => {
  const home = mkdtempSync(join(tmpdir(), 'evcrate-publication-'));
  try {
    const context = resolveInvocationContext({ packageRoot, cwd: packageRoot, home, targets: ['omp'] });
    directory(join(home, '.evcrate'));
    const policy = join(home, '.evcrate', 'advisor-routing.json');
    writeFileSync(policy, policyBytes, { mode: 0o600 });
    chmodSync(policy, 0o600);
    const oldPath = join(home, '.omp', 'agent', '.evcrate.json');
    directory(join(home, '.omp', 'agent'));
    writeFileSync(oldPath, 'user-version\n', { mode: 0o600 });
    chmodSync(oldPath, 0o600);
    const beforePolicyMode = Number(lstatSync(policy).mode) & 0o777;
    const state = publicationStateRoot(home);
    const preview = publishDryRun(context);
    assert.deepEqual(preview.phases[0].selectedTargets, ['omp']);
    assert.deepEqual(preview.phases[0].bindingOrder, ['.omp']);
    assert.equal(existsSync(state), false);
    assert.deepEqual(readFileSync(policy), policyBytes);
    const first = publishApply(context);
    const firstRelease = first.phases[0].releaseId;
    assert.equal(first.phases[0].selectedTargets[0], 'omp');
    assert.equal(first.phases[0].retainedReleaseId, firstRelease);
    assert.equal(readFileSync(policy).equals(policyBytes), true);
    assert.equal(Number(lstatSync(policy).mode) & 0o777, beforePolicyMode);
    assert.notEqual(readFileSync(oldPath, 'utf8'), 'user-version\n');
    assert.equal(existsSync(join(state, `release-${firstRelease}`)), true);
    const marker = JSON.parse(readFileSync(join(state, 'release-marker.json'), 'utf8'));
    assert.equal(marker.schema_version, 3);
    assert.equal(marker.scope, 'home');
    assert.deepEqual(Object.keys(marker.records), ['harness']);
    assert.equal(marker.records.harness.status, 'complete');
    assert.equal(marker.records.harness.retained_release_id, firstRelease);
    assert.equal(recoverPublication(context).action, 'none');
    const second = publishApply(context);
    assert.equal(second.phases[0].retainedReleaseId, firstRelease);
    assert.equal(existsSync(join(state, `release-${firstRelease}`)), true);
    const third = publishApply(context, { now: () => Date.now() + MAX_RETAINED_RELEASE_AGE_MS + 1 });
    assert.equal(third.phases[0].retainedReleaseId, null);
    assert.equal(existsSync(join(state, `release-${firstRelease}`)), false);
    const finalMarker = JSON.parse(readFileSync(join(state, 'release-marker.json'), 'utf8'));
    assert.equal(finalMarker.records.harness.retained_release_id, null);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('project publication commits only scoped harness without retaining workspace', () => {
  const root = mkdtempSync(join(tmpdir(), 'evcrate-project-publication-'));
  const home = join(root, 'home');
  const project = join(root, 'project');
  directory(home);
  directory(project);
  try {
    const context = resolveInvocationContext({ packageRoot, cwd: packageRoot, home, projectRoot: project, targets: ['omp'] });
    const request = { scope: 'project', selectedTargets: ['omp'] };
    const identity = resolvePublicationProjectContext(context).projectIdentity;
    const preview = publishDryRun(context, request);
    assert.equal(preview.scope, 'project');
    assert.equal(preview.phases[0].scope, 'project');
    const projectState = join(context.stateRoot, 'project-publication', identity);
    assert.equal(existsSync(projectState), false);

    const result = publishApply(context, {}, request);
    assert.equal(result.scope, 'project');
    assert.equal(result.phases[0].scope, 'project');
    assert.equal(existsSync(join(home, '.evcrate', 'bin')), false);
    assert.equal(existsSync(join(home, '.omp')), false);
    assert.equal(existsSync(join(project, '.omp')), true);
    assert.equal(existsSync(join(project, `.evcrate-publish-${result.phases[0].releaseId}`)), false);
    assert.equal(existsSync(join(projectState, 'publication-journal.json')), false);
    const marker = JSON.parse(readFileSync(join(projectState, 'release-marker.json'), 'utf8'));
    assert.equal(marker.schema_version, 3);
    assert.equal(marker.scope, 'project');
    assert.equal(marker.records.harness.status, 'complete');
    assert.equal(marker.records.harness.destination_root, project);
    assert.equal(marker.records.harness.retention, 'none');
    assert.equal(marker.records.harness.retained_release_id, null);
    assert.equal(Object.hasOwn(marker.records, 'shared'), false);
    assert.equal(recoverPublication(context, {
      scope: 'project', projectIdentity: identity, releaseId: null
    }).action, 'none');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('project apply rejects a marker substituted to another destination root before HOME mutation', () => {
  const root = mkdtempSync(join(tmpdir(), 'evcrate-project-root-binding-'));
  const home = join(root, 'home');
  const project = join(root, 'project');
  const other = join(root, 'other');
  directory(home);
  directory(project);
  directory(other);
  try {
    const context = resolveInvocationContext({
      packageRoot, cwd: packageRoot, home, projectRoot: project, targets: ['omp']
    });
    const request = { scope: 'project', selectedTargets: ['omp'] };
    publishApply(context, {}, request);
    const identity = resolvePublicationProjectContext(context).projectIdentity;
    const homeState = publicationStateRoot(home);
    const projectState = join(context.stateRoot, 'project-publication', identity);
    const controllerPath = join(home, '.evcrate', 'bin', 'custom');
    directory(dirname(controllerPath));
    writeFileSync(controllerPath, 'unrelated custom bytes');
    const controllerBefore = readFileSync(controllerPath);
    const projectMarkerPath = join(projectState, 'release-marker.json');
    const projectMarker = JSON.parse(readFileSync(projectMarkerPath, 'utf8'));
    projectMarker.records.harness.destination_root = resolve(other);
    projectMarker.records.harness.workspace_root = join(
      resolve(other), projectMarker.records.harness.workspace_name
    );
    writeFileSync(projectMarkerPath, JSON.stringify(projectMarker), { mode: 0o600 });

    assert.throws(
      () => publishApply(context, {}, request),
      (error) => error?.code === 'PATH_UNSAFE'
    );
    assert.deepEqual(readFileSync(controllerPath), controllerBefore);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('project apply never consults or recovers HOME publication state', () => {
  const root = mkdtempSync(join(tmpdir(), 'evcrate-project-home-isolation-'));
  const home = join(root, 'home');
  const project = join(root, 'project');
  directory(home); directory(project);
  try {
    const context = resolveInvocationContext({ packageRoot, cwd: packageRoot, home, projectRoot: project, targets: ['omp'] });
    const homeState = publicationStateRoot(home);
    directory(homeState);
    const journalPath = join(homeState, 'publication-journal.json');
    const lockPath = join(homeState, 'publish.lock');
    writeFileSync(journalPath, 'unreadable unrelated HOME journal');
    writeFileSync(lockPath, 'unrelated HOME lock');
    const before = [journalPath, lockPath].map((path) => ({ path, bytes: readFileSync(path), inode: lstatSync(path).ino }));
    const result = publishApply(context, {}, { scope: 'project', selectedTargets: ['omp'] });
    assert.equal(result.phases.length, 1);
    assert.equal(result.phases[0].scope, 'project');
    assert.equal(existsSync(join(project, '.omp')), true);
    for (const entry of before) {
      assert.deepEqual(readFileSync(entry.path), entry.bytes);
      assert.equal(lstatSync(entry.path).ino, entry.inode);
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('project recovery migrates only project-owned schema-1 state', () => {
  const root = mkdtempSync(join(tmpdir(), 'evcrate-project-migration-'));
  const home = join(root, 'home');
  const project = join(root, 'project');
  directory(home);
  directory(project);
  try {
    const context = resolveInvocationContext({
      packageRoot, cwd: packageRoot, home, projectRoot: project, targets: ['omp']
    });
    const identity = resolvePublicationProjectContext(context).projectIdentity;
    const state = join(context.stateRoot, 'project-publication', identity);
    directory(state);
    const homeState = publicationStateRoot(home);
    directory(homeState);
    const homeMarkerPath = join(homeState, 'release-marker.json');
    writeFileSync(homeMarkerPath, 'home-sentinel\n', { mode: 0o600 });
    writeFileSync(join(state, 'release-marker.json'), JSON.stringify({
      schema_version: 1, status: 'complete', transaction_type: 'target-publication',
      release_id: 'legacy-project', selected_targets: ['omp'], binding_order: ['.omp'],
      managed_paths: { '.omp': ['agent/owned.md'] }, previous_managed_paths: {},
      build_manifest_path: '.evcrate/build-manifest-omp.json', build_manifest_digest: 'a'.repeat(64),
      transaction_dir: 'release-legacy-project', retained_release_id: null, scope: 'project',
      destination_root: project, durable_state_root: state,
      workspace_root: join(project, '.evcrate-publish-legacy-project'),
      workspace_name: '.evcrate-publish-legacy-project', project_identity: identity, retention: 'none'
    }), { mode: 0o600 });

    const result = recoverPublication(context, {
      scope: 'project', projectIdentity: identity, releaseId: null
    });
    assert.equal(result.action, 'none');
    const marker = JSON.parse(readFileSync(join(state, 'release-marker.json'), 'utf8'));
    assert.equal(marker.schema_version, 2);
    assert.equal(marker.scope, 'project');
    assert.deepEqual(marker.records.harness.managed_paths, {
      omp: { '.omp': ['agent/owned.md'] }
    });
    assert.deepEqual(marker.records.harness.previous_managed_paths, {});
    assert.equal(readFileSync(homeMarkerPath, 'utf8'), 'home-sentinel\n');
    assert.equal(existsSync(join(home, '.evcrate', 'bin')), false);
    assert.equal(existsSync(join(project, '.evcrate-publish-legacy-project')), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});


test('project publication preserves HOME harness ownership and custom runtime data', () => {
  const root = mkdtempSync(join(tmpdir(), 'evcrate-project-home-state-'));
  const home = join(root, 'home');
  const project = join(root, 'project');
  directory(home);
  directory(project);
  try {
    directory(join(home, '.evcrate', 'bin'));
    const controllerSentinel = join(home, '.evcrate', 'bin', 'old-controller');
    writeFileSync(controllerSentinel, 'old\n', { mode: 0o600 });
    chmodSync(controllerSentinel, 0o600);
    const homeContext = resolveInvocationContext({ packageRoot, cwd: packageRoot, home, targets: ['omp'] });
    const homeResult = publishApply(homeContext);
    assert.equal(homeResult.phases.length, 1);
    const homeState = publicationStateRoot(home);
    const beforeMarker = JSON.parse(readFileSync(join(homeState, 'release-marker.json'), 'utf8'));

    const projectContext = resolveInvocationContext({
      packageRoot, cwd: packageRoot, home, projectRoot: project, targets: ['omp']
    });
    const identity = resolvePublicationProjectContext(projectContext).projectIdentity;
    publishApply(projectContext, {}, { scope: 'project', selectedTargets: ['omp'] });

    const afterMarker = JSON.parse(readFileSync(join(homeState, 'release-marker.json'), 'utf8'));
    assert.deepEqual(afterMarker.records.harness.managed_paths, beforeMarker.records.harness.managed_paths);
    assert.equal(readFileSync(controllerSentinel, 'utf8'), 'old\n');
    assert.equal(recoverPublication(projectContext, {
      scope: 'project', projectIdentity: identity, releaseId: null
    }).action, 'none');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('project preflight rejects an unusable destination without creating publication state', () => {
  const root = mkdtempSync(join(tmpdir(), 'evcrate-project-preflight-'));
  const home = join(root, 'home');
  const project = join(root, 'project');
  directory(home);
  directory(project);
  try {
    const context = resolveInvocationContext({
      packageRoot, cwd: packageRoot, home, projectRoot: project, targets: ['omp']
    });
    writeFileSync(join(project, '.omp'), 'occupied\n', { mode: 0o600 });
    assert.throws(
      () => publishApply(context, {}, { scope: 'project', selectedTargets: ['omp'] }),
      (error) => error?.code === 'PATH_UNSAFE'
    );
    const identity = resolvePublicationProjectContext(context).projectIdentity;
    assert.equal(existsSync(publicationStateRoot(home)), false);
    assert.equal(existsSync(join(context.stateRoot, 'project-publication', identity)), false);
    assert.equal(existsSync(join(home, '.evcrate', 'bin')), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('project recovery rejects replacement of the durable workspace inode', () => {
  const root = mkdtempSync(join(tmpdir(), 'evcrate-project-workspace-'));
  const home = join(root, 'home');
  const project = join(root, 'project');
  directory(home);
  directory(project);
  try {
    const context = resolveInvocationContext({
      packageRoot, cwd: packageRoot, home, projectRoot: project, targets: ['omp']
    });
    const request = { scope: 'project', selectedTargets: ['omp'] };
    const preview = publishDryRun(context, request);
    const firstMutation = preview.phases[0].changes.find(({ action }) =>
      action !== 'noop' && action !== 'preserve'
    );
    assert.ok(firstMutation);
    const collisionPath = join(project, firstMutation.path);
    let interrupted = false;
    assert.throws(
      () => publishApply(context, {
        hooks: {
          afterOperation: (operation) => {
            if (operation.target === 'omp' && !interrupted) {
              interrupted = true;
              directory(join(collisionPath, '..'));
              writeFileSync(collisionPath, 'external-collision\n', { mode: 0o600 });
              throw new ControlPlaneError('CAS_CONFLICT');
            }
          }
        }
      }, request),
      (error) => error?.code === 'ROLLBACK_FAILED'
    );
    const identity = resolvePublicationProjectContext(context).projectIdentity;
    const state = join(context.stateRoot, 'project-publication', identity);
    const journal = JSON.parse(readFileSync(join(state, 'publication-journal.json'), 'utf8'));
    rmSync(journal.workspace_root, { recursive: true, force: true });
    directory(journal.workspace_root);
    assert.throws(
      () => recoverPublication(context, {
        scope: 'project', projectIdentity: identity, releaseId: null
      }),
      (error) => error?.code === 'PATH_UNSAFE' || error?.code === 'RECOVERY_FAILED'
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('project recovery rejects a journal bound to another project identity', () => {
  const root = mkdtempSync(join(tmpdir(), 'evcrate-project-identity-'));
  const home = join(root, 'home');
  const project = join(root, 'project');
  directory(home);
  directory(project);
  try {
    const context = resolveInvocationContext({
      packageRoot, cwd: packageRoot, home, projectRoot: project, targets: ['omp']
    });
    const request = { scope: 'project', selectedTargets: ['omp'] };
    const preview = publishDryRun(context, request);
    const firstMutation = preview.phases[0].changes.find(({ action }) =>
      action !== 'noop' && action !== 'preserve'
    );
    assert.ok(firstMutation);
    const collisionPath = join(project, firstMutation.path);
    let interrupted = false;
    assert.throws(
      () => publishApply(context, {
        hooks: {
          afterOperation: (operation) => {
            if (operation.target === 'omp' && !interrupted) {
              interrupted = true;
              directory(join(collisionPath, '..'));
              writeFileSync(collisionPath, 'external-collision\n', { mode: 0o600 });
              throw new ControlPlaneError('CAS_CONFLICT');
            }
          }
        }
      }, request),
      (error) => error?.code === 'ROLLBACK_FAILED'
    );
    const identity = resolvePublicationProjectContext(context).projectIdentity;
    const state = join(context.stateRoot, 'project-publication', identity);
    const journalPath = join(state, 'publication-journal.json');
    const journal = JSON.parse(readFileSync(journalPath, 'utf8'));
    journal.project_identity = '0'.repeat(64);
    writeFileSync(journalPath, JSON.stringify(journal));
    const markerPath = join(state, 'release-marker.json');
    const marker = JSON.parse(readFileSync(markerPath, 'utf8'));
    marker.records.harness.project_identity = '0'.repeat(64);
    writeFileSync(markerPath, JSON.stringify(marker));
    assert.throws(
      () => recoverPublication(context, {
        scope: 'project', projectIdentity: identity, releaseId: null
      }),
      (error) => error?.code === 'PATH_UNSAFE' || error?.code === 'RECOVERY_FAILED'
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('project apply rejects an oversized result before transaction mutation', async () => {
  const root = mkdtempSync(join(tmpdir(), 'evcrate-project-result-limit-'));
  const fixturePackage = join(root, 'package');
  const home = join(root, 'home');
  const project = join(root, 'project');
  directory(home);
  directory(project);
  try {
    prepareFixtureWorkspace(fixturePackage);
    const sourceRoot = join(fixturePackage, '.evcrate', 'source');
    const workflowRoot = join(sourceRoot, '.claude', 'workflows');
    const syntheticWorkflowRoot = join(workflowRoot, 'helpers');
    directory(syntheticWorkflowRoot);
    const suffix = 'x'.repeat(20);
    for (let index = 0; index < 9170; index += 1) {
      writeFileSync(
        join(syntheticWorkflowRoot, `phase05-${String(index).padStart(4, '0')}-${suffix}.md`),
        '# oversized\n',
        { mode: 0o644 }
      );
    }
    const build = await runLocalBuild(fixturePackage, PERSISTED_TARGETS);
    assert.equal(build.outputPaths['.claude'], join(sourceRoot, '.claude-projection'));
    assert.equal(existsSync(join(build.outputPaths['.claude'], 'rules', 'AGENTS.md')), true);
    const context = resolveInvocationContext({
      packageRoot: fixturePackage, cwd: fixturePackage, home, projectRoot: project, targets: ['omp']
    });
    assert.deepEqual(resolveCurrentPublicationBuild(context).manifest, build.manifest);
    const identity = resolvePublicationProjectContext(context).projectIdentity;
    assert.throws(
      () => publishApply(context, {}, { scope: 'project', selectedTargets: ['omp'] }),
      (error) => error?.code === 'PUBLICATION_FAILED'
    );
    assert.equal(existsSync(join(home, '.evcrate', 'bin')), false);
    assert.equal(existsSync(join(project, '.omp')), false);
    assert.equal(existsSync(join(context.stateRoot, 'project-publication', identity)), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('publication returns CAS conflict without masking or deleting an external path', () => {
  const home = mkdtempSync(join(tmpdir(), 'evcrate-publication-cas-'));
  try {
    const context = resolveInvocationContext({ packageRoot, cwd: packageRoot, home, targets: ['omp'] });
    let injected = false;
    assert.throws(
      () => publishApply(context, {
        hooks: {
          beforeOperation: (operation) => {
            if (injected) return;
            injected = true;
            directory(dirname(operation.destination));
            writeFileSync(operation.destination, 'external-conflict\n', { mode: 0o600 });
            directory(join(home, '.evcrate', 'bin'));
            writeFileSync(join(home, '.evcrate', 'bin', 'external'), 'keep\n', { mode: 0o600 });
          }
        }
      }),
      (error) => error?.code === 'CAS_CONFLICT'
    );
    assert.equal(readFileSync(join(home, '.evcrate', 'bin', 'external'), 'utf8'), 'keep\n');
    assert.equal(existsSync(join(publicationStateRoot(home), 'publication-journal.json')), false);
    assert.equal(existsSync(join(publicationStateRoot(home), 'release-marker.json')), false);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('post-first-promotion CAS conflict retains promoting journal, fails closed on recovery, and rolls back after reconciliation', () => {
  const home = mkdtempSync(join(tmpdir(), 'evcrate-pub-post-cas-'));
  try {
    const context = resolveInvocationContext({ packageRoot, cwd: packageRoot, home, targets: ['omp'] });
    directory(join(home, '.evcrate'));
    const policy = join(home, '.evcrate', 'advisor-routing.json');
    writeFileSync(policy, policyBytes, { mode: 0o600 });
    directory(join(home, '.evcrate', 'tasks'));
    const taskSentinel = join(home, '.evcrate', 'tasks', 'task-sentinel.json');
    writeFileSync(taskSentinel, '{"task":"durable"}\n', { mode: 0o600 });
    directory(join(home, '.evcrate', 'advisor-history'));
    const historySentinel = join(home, '.evcrate', 'advisor-history', 'history-sentinel.json');
    writeFileSync(historySentinel, '{"history":"active"}\n', { mode: 0o600 });
    const unrelatedSentinel = join(home, 'unrelated.txt');
    writeFileSync(unrelatedSentinel, 'user-data\n', { mode: 0o600 });

    const state = publicationStateRoot(home);
    const plan = publishDryRun(context);
    const changes = plan.phases.flatMap(({ changes: phaseChanges }) => phaseChanges);
    assert.ok(changes.length > 2, 'publication plan must have multiple operations');
    const op1 = changes[1];
    const targetConflictPath = join(home, op1.path);
    let injected = false;

    assert.throws(
      () => publishApply(context, {
        hooks: {
          afterOperation: (_op, index) => {
            if (index === 0 && !injected) {
              injected = true;
              directory(join(targetConflictPath, '..'));
              writeFileSync(targetConflictPath, 'external-collision\n', { mode: 0o600 });
            }
          }
        }
      }),
      (error) => error?.code === 'CAS_CONFLICT'
    );

    assert.equal(existsSync(join(state, 'publication-journal.json')), true);
    assert.equal(existsSync(join(state, 'release-marker.json')), true);
    const marker = JSON.parse(readFileSync(join(state, 'release-marker.json'), 'utf8'));
    assert.equal(marker.records.harness.status, 'promoting');

    assert.equal(readFileSync(targetConflictPath, 'utf8'), 'external-collision\n');
    assert.equal(readFileSync(policy).equals(policyBytes), true);
    assert.equal(readFileSync(taskSentinel, 'utf8'), '{"task":"durable"}\n');
    assert.equal(readFileSync(historySentinel, 'utf8'), '{"history":"active"}\n');
    assert.equal(readFileSync(unrelatedSentinel, 'utf8'), 'user-data\n');

    assert.throws(
      () => recoverPublication(context),
      (error) => error?.code === 'RECOVERY_FAILED'
    );
    assert.equal(readFileSync(targetConflictPath, 'utf8'), 'external-collision\n');

    rmSync(targetConflictPath);

    const recovery = recoverPublication(context);
    assert.equal(recovery.action, 'recovered');
    assert.deepEqual(recovery.phases.map(({ phase, action }) => [phase, action]), [
      ['harness', 'rolled-back']
    ]);
    assert.equal(existsSync(join(state, 'publication-journal.json')), false);

    assert.equal(readFileSync(policy).equals(policyBytes), true);
    assert.equal(readFileSync(taskSentinel, 'utf8'), '{"task":"durable"}\n');
    assert.equal(readFileSync(historySentinel, 'utf8'), '{"history":"active"}\n');
    assert.equal(readFileSync(unrelatedSentinel, 'utf8'), 'user-data\n');
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
test('publishApply auto-creates homeRoot when missing on disk', () => {
  const root = mkdtempSync(join(tmpdir(), 'evcrate-missing-home-'));
  const home = join(root, 'non-existent-home');
  try {
    const context = resolveInvocationContext({ packageRoot, cwd: packageRoot, home, targets: ['omp'] });
    assert.equal(existsSync(home), false);
    const dryRunResult = publishDryRun(context);
    assert.equal(existsSync(home), false);
    assert.equal(dryRunResult.phases.length, 1);

    const applyResult = publishApply(context);
    assert.equal(existsSync(home), true);
    assert.equal(lstatSync(home).isDirectory(), true);
    assert.equal(typeof applyResult.phases[0].releaseId, 'string');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

for (const scope of ['home', 'project']) {
  test(`${scope} v4 journal has actual workspace identity before first destination mutation`, () => {
    const root = mkdtempSync(join(tmpdir(), 'evcrate-journal-identity-'));
    const home = join(root, 'home');
    const project = join(root, 'project');
    directory(home); directory(project);
    try {
      const context = resolveInvocationContext({ packageRoot, home, projectRoot: project, targets: ['omp'] });
      const state = scope === 'home' ? publicationStateRoot(home)
        : join(context.stateRoot, 'project-publication', resolvePublicationProjectContext(context).projectIdentity);
      let admitted = false;
      assert.throws(() => publishApply(context, {
        hooks: { beforeOperation(operation) {
          if (admitted) return;
          admitted = true;
          const journal = JSON.parse(readFileSync(join(state, 'publication-journal.json'), 'utf8'));
          const workspace = lstatSync(journal.workspace_root);
          const parent = lstatSync(dirname(journal.workspace_root));
          assert.equal(journal.schema_version, 4);
          assert.equal(journal.logical_phase, 'harness');
          assert.deepEqual(Object.keys(journal.records), ['harness']);
          assert.deepEqual(journal.lock_order, [scope]);
          assert.deepEqual(journal.lock_paths, [join(state, 'publish.lock')]);
          assert.deepEqual([journal.workspace_device, journal.workspace_inode, journal.workspace_parent_device, journal.workspace_parent_inode],
            [Number(workspace.dev), Number(workspace.ino), Number(parent.dev), Number(parent.ino)]);
          assert.equal(operation.beforeSnapshot.present, false);
          assert.equal(existsSync(operation.destination), false);
          throw new ControlPlaneError('CAS_CONFLICT');
        } }
      }, { scope, selectedTargets: ['omp'] }), (error) => error.code === 'CAS_CONFLICT');
      assert.equal(admitted, true);
      assert.equal(recoverPublication(context, { scope,
        projectIdentity: scope === 'home' ? null : resolvePublicationProjectContext(context).projectIdentity, releaseId: null }).action, 'none');
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  test(`${scope} selected harness updates preserve unselected ownership and bytes`, () => {
    const root = mkdtempSync(join(tmpdir(), 'evcrate-selected-ownership-'));
    const home = join(root, 'home');
    const project = join(root, 'project');
    directory(home); directory(project);
    try {
      const initial = resolveInvocationContext({ packageRoot, home, projectRoot: project, targets: ['codex', 'omp'] });
      publishApply(initial, {}, { scope, selectedTargets: ['codex', 'omp'] });
      const state = scope === 'home' ? publicationStateRoot(home)
        : join(initial.stateRoot, 'project-publication', resolvePublicationProjectContext(initial).projectIdentity);
      const before = JSON.parse(readFileSync(join(state, 'release-marker.json'), 'utf8'));
      const destination = scope === 'home' ? home : project;
      const entries = Object.entries(before.records.harness.managed_paths.codex).flatMap(([binding, paths]) =>
        paths.map((path) => {
          const absolute = path === binding ? join(destination, binding) : join(destination, binding, path);
          return { absolute, bytes: readFileSync(absolute), inode: lstatSync(absolute).ino };
        }));
      const selected = resolveInvocationContext({ packageRoot, home, projectRoot: project, targets: ['omp'] });
      publishApply(selected, {}, { scope, selectedTargets: ['omp'] });
      const marker = JSON.parse(readFileSync(join(state, 'release-marker.json'), 'utf8'));
      assert.equal(marker.schema_version, 3);
      assert.deepEqual(marker.records.harness.managed_paths.codex, before.records.harness.managed_paths.codex);
      for (const entry of entries) {
        assert.deepEqual(readFileSync(entry.absolute), entry.bytes);
        assert.equal(lstatSync(entry.absolute).ino, entry.inode);
      }
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
}

test('v4 journal and v3 marker strictly reject retired phases, null identity and forged lock roots', () => {
  const home = mkdtempSync(join(tmpdir(), 'evcrate-v4-admission-'));
  try {
    const context = resolveInvocationContext({ packageRoot, home, targets: ['omp'] });
    const state = publicationStateRoot(home);
    assert.throws(() => publishApply(context, { hooks: { afterOperation() { throw new ControlPlaneError('CAS_CONFLICT'); } } }),
      (error) => error.code === 'CAS_CONFLICT');
    const journalPath = join(state, 'publication-journal.json');
    const markerPath = join(state, 'release-marker.json');
    const journalBytes = readFileSync(journalPath);
    const markerBytes = readFileSync(markerPath);
    const journal = JSON.parse(journalBytes);
    const marker = JSON.parse(markerBytes);
    for (const mutate of [
      (value) => { value.workspace_device = value.workspace_inode = value.workspace_parent_device = value.workspace_parent_inode = null; },
      (value) => { value.lock_paths = [join(home, '.evcrate/bin/publish.lock')]; },
      (value) => { value.lock_order = ['home', 'project']; },
      (value) => { value.logical_phase = 'shared'; },
      (value) => { value.records.shared = value.records.harness; },
      (value) => { value.extra = true; }
    ]) {
      const malformed = structuredClone(journal);
      mutate(malformed);
      writeFileSync(journalPath, JSON.stringify(malformed));
      assert.throws(() => recoverPublication(context));
      assert.deepEqual(readFileSync(markerPath), markerBytes);
    }
    writeFileSync(journalPath, journalBytes);
    for (const mutate of [
      (value) => { value.records.shared = value.records.harness; },
      (value) => { value.records.harness = null; },
      (value) => { value.extra = true; }
    ]) {
      const malformed = structuredClone(marker);
      mutate(malformed);
      writeFileSync(markerPath, JSON.stringify(malformed));
      assert.throws(() => recoverPublication(context));
      assert.deepEqual(readFileSync(journalPath), journalBytes);
    }
    writeFileSync(markerPath, markerBytes);
    assert.equal(recoverPublication(context).action, 'recovered');
  } finally { rmSync(home, { recursive: true, force: true }); }
});
