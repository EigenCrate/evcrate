import { chmodSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyScopeChange, createResourceHandler, createResourceRequest, main,
  projectIdentity, readScopeDocument, scopePath
} from '../../dist/index.js';
import { createPhase6Fixture, closePhase6Fixture } from '../resource-fixture.mjs';

function envelope(context) {
  const target = context.selectedTargets[0];
  return {
    canonicalSourceRoot: context.canonicalSourceRoot,
    targetManifestPath: target.manifestPath,
    generatedRoot: target.generatedRoots[0],
    homeRoot: target.homeBindings[0].homeRoot,
    stateRoot: context.stateRoot,
    projectId: context.projectId ?? 'global',
    projectRoot: context.projectRoot,
    target: target.id
  };
}
function request(context, requestId, operation, payload) {
  return createResourceRequest(requestId, operation, envelope(context), payload);
}
function invoke(handler, context, requestId, operation, payload) {
  return handler.handle(request(context, requestId, operation, payload), context);
}

function revision(registryRevision, globalScopeRevision, projectScopeRevision) {
  return { registryRevision, globalScopeRevision, projectScopeRevision };
}

test('scope assignments layer, disable inheritance, and expose vector conflicts', () => {
  const fixture = createPhase6Fixture('evcrate-scopes-');
  try {
    const project = fixture.context({ projectId: 'project-1' });
    const global = fixture.context({ projectId: 'global' });
    const handler = createResourceHandler({ now: () => 1_700_000_000_000 });
    const alpha = 'agent:agents/alpha.md';
    const beta = 'agent:agents/beta.md';

    const initial = invoke(handler, project, 'scope-list-1', 'scopes.list', {});
    assert.equal(initial.status, 'ok');
    assert.equal(initial.payload.projectId, projectIdentity(fixture.root));
    assert.deepEqual(initial.payload.revisionVector, revision(1, 0, null));

    const projectAssignment = invoke(handler, project, 'scope-assign-1', 'scopes.assign', {
      resourceId: alpha, targets: ['claude'], capabilityApprovals: [],
      expectedRevision: initial.payload.revisionVector
    });
    assert.equal(projectAssignment.status, 'applied');
    assert.equal(projectAssignment.payload.scopeRevision, 1);

    const globalInitial = invoke(handler, global, 'scope-list-2', 'scopes.list', {});
    const globalAssignment = invoke(handler, global, 'scope-assign-2', 'scopes.assign', {
      resourceId: beta, targets: ['claude'], capabilityApprovals: [],
      expectedRevision: globalInitial.payload.revisionVector
    });
    assert.equal(globalAssignment.status, 'applied');

    const inherited = invoke(handler, project, 'scope-list-3', 'scopes.list', {});
    const inheritedBeta = inherited.payload.effective.find(({ resourceId }) => resourceId === beta);
    assert.equal(inheritedBeta.source, 'inherited');
    assert.equal(inheritedBeta.effective.enabled, true);

    const disabled = invoke(handler, project, 'scope-disable-1', 'scopes.disable', {
      resourceId: beta, expectedRevision: inherited.payload.revisionVector
    });
    assert.equal(disabled.status, 'applied');
    const disabledState = invoke(handler, project, 'scope-list-4', 'scopes.list', {});
    const disabledBeta = disabledState.payload.effective.find(({ resourceId }) => resourceId === beta);
    assert.equal(disabledBeta.source, 'disabled');
    assert.equal(disabledBeta.effective, null);

    const enabled = invoke(handler, project, 'scope-enable-1', 'scopes.enable', {
      resourceId: beta, expectedRevision: disabledState.payload.revisionVector
    });
    assert.equal(enabled.status, 'applied');
    const enabledState = invoke(handler, project, 'scope-list-5', 'scopes.list', {});
    const enabledBeta = enabledState.payload.effective.find(({ resourceId }) => resourceId === beta);
    assert.equal(enabledBeta.source, 'project');

    const removed = invoke(handler, project, 'scope-remove-1', 'scopes.remove', {
      resourceId: beta, expectedRevision: enabledState.payload.revisionVector
    });
    assert.equal(removed.status, 'applied');
    const current = invoke(handler, project, 'scope-list-6', 'scopes.list', {});
    const restored = current.payload.effective.find(({ resourceId }) => resourceId === beta);
    assert.equal(restored.source, 'inherited');

    const stale = invoke(handler, project, 'scope-stale-1', 'scopes.assign', {
      resourceId: alpha, targets: ['claude'], capabilityApprovals: [],
      expectedRevision: initial.payload.revisionVector
    });
    assert.equal(stale.status, 'conflict');
    assert.equal(stale.error.code, 'CAS_CONFLICT');
    assert.deepEqual(stale.conflict.expectedRevision, initial.payload.revisionVector);
    assert.deepEqual(stale.conflict.actualRevision, current.payload.revisionVector);

    const hook = 'hook:hooks/notify.sh';
    assert.throws(() => invoke(handler, global, 'scope-hook-1', 'scopes.assign', {
      resourceId: hook, targets: ['claude'], capabilityApprovals: [],
      expectedRevision: invoke(handler, global, 'scope-list-7', 'scopes.list', {}).payload.revisionVector
    }), { code: 'CAPABILITY_UNSUPPORTED' });
  } finally {
    closePhase6Fixture(fixture);
  }
});

test('scope changes bind hashes, consume tokens, and reject expiry', () => {
  const fixture = createPhase6Fixture('evcrate-changes-');
  try {
    const project = fixture.context({ projectId: 'project-1' });
    const handler = createResourceHandler({ now: () => 1_700_000_000_000 });
    const alpha = 'agent:agents/alpha.md';
    const list = invoke(handler, project, 'changes-list-1', 'scopes.list', {});
    const preview = invoke(handler, project, 'changes-preview-1', 'changes.preview', {
      mutation: 'scopes.assign',
      payload: {
        resourceId: alpha, targets: ['claude'], capabilityApprovals: [],
        expectedRevision: list.payload.revisionVector
      },
      expiresInSeconds: 300
    });
    assert.equal(preview.status, 'preview');
    assert.equal(preview.payload.selectedTargets[0], 'claude');
    assert.match(preview.payload.canonicalSourceHash, /^[a-f0-9]{64}$/u);
    assert.equal(preview.payload.before.source, 'absent');
    assert.equal(preview.payload.after.source, 'project');

    const applied = invoke(handler, project, 'changes-apply-1', 'changes.apply', {
      previewToken: preview.payload.token
    });
    assert.equal(applied.status, 'applied');
    assert.equal(applied.payload.changed, true);
    assert.throws(() => invoke(handler, project, 'changes-replay-1', 'changes.apply', {
      previewToken: preview.payload.token
    }), { code: 'CAS_CONFLICT' });

    const latest = invoke(handler, project, 'changes-list-2', 'scopes.list', {});
    const expiringHandler = createResourceHandler({ now: () => 1_700_000_000_000 });
    const expiring = invoke(expiringHandler, project, 'changes-preview-2', 'changes.preview', {
      mutation: 'scopes.disable',
      payload: { resourceId: alpha, expectedRevision: latest.payload.revisionVector },
      expiresInSeconds: 1
    });
    const expiredHandler = createResourceHandler({ now: () => 1_700_000_001_001 });
    const expired = invoke(expiredHandler, project, 'changes-apply-2', 'changes.apply', {
      previewToken: expiring.payload.token
    });
    assert.equal(expired.status, 'conflict');
    assert.equal(expired.error.code, 'CAS_CONFLICT');
    const afterExpiry = invoke(expiringHandler, project, 'changes-list-3', 'scopes.list', {});
    assert.deepEqual(afterExpiry.payload.revisionVector, latest.payload.revisionVector);
    const hashPreview = invoke(handler, project, 'changes-preview-3', 'changes.preview', {
      mutation: 'scopes.disable',
      payload: { resourceId: alpha, expectedRevision: afterExpiry.payload.revisionVector },
      expiresInSeconds: 300
    });
    writeFileSync(join(fixture.canonical, 'agents', 'alpha.md'), '# Alpha changed\\n');
    assert.throws(() => invoke(handler, project, 'changes-apply-3', 'changes.apply', {
      previewToken: hashPreview.payload.token
    }), { code: 'CAS_CONFLICT' });
  } finally {
    closePhase6Fixture(fixture);
  }
});
test('scope preview token survives a failed mutation boundary', () => {
  const fixture = createPhase6Fixture('evcrate-scope-retry-');
  try {
    const project = fixture.context({ projectId: 'project-1' });
    const handler = createResourceHandler({ now: () => 1_700_000_000_000 });
    const list = invoke(handler, project, 'scope-retry-list-1', 'scopes.list', {});
    const preview = invoke(handler, project, 'scope-retry-preview-1', 'changes.preview', {
      mutation: 'scopes.assign',
      payload: { resourceId: 'agent:agents/alpha.md', targets: ['claude'], capabilityApprovals: [], expectedRevision: list.payload.revisionVector },
      expiresInSeconds: 300
    });
    assert.throws(() => applyScopeChange(project, preview.payload.token, 1_700_000_000_000, {
      mutationHooks: { beforeWrite: () => { throw new Error('injected mutation boundary'); } }
    }), /injected mutation boundary/u);
    const unchanged = invoke(handler, project, 'scope-retry-list-2', 'scopes.list', {});
    assert.deepEqual(unchanged.payload.revisionVector, list.payload.revisionVector);
    assert.equal(unchanged.payload.assignments.length, 0);
    const retried = invoke(handler, project, 'scope-retry-apply-1', 'changes.apply', {
      previewToken: preview.payload.token
    });
    assert.equal(retried.status, 'applied');
    assert.equal(retried.payload.changed, true);
  } finally {
    closePhase6Fixture(fixture);
  }
});

test('scope output snapshots bind presence and mode', () => {
  const fixture = createPhase6Fixture('evcrate-scope-output-');
  try {
    const project = fixture.context({ targets: ['codex'], projectId: 'project-1' });
    const handler = createResourceHandler({ now: () => 1_700_000_000_000 });
    const root = project.selectedTargets[0].generatedRoots[0];
    const list = invoke(handler, project, 'scope-output-list-1', 'scopes.list', {});
    const preview = (id) => invoke(handler, project, id, 'changes.preview', {
      mutation: 'scopes.assign',
      payload: { resourceId: 'agent:agents/alpha.md', targets: ['codex'], capabilityApprovals: [], expectedRevision: list.payload.revisionVector },
      expiresInSeconds: 300
    });
    const directoryPreview = preview('scope-output-preview-dir');
    mkdirSync(root, { recursive: true, mode: 0o700 });
    chmodSync(root, 0o700);
    assert.equal(invoke(handler, project, 'scope-output-apply-dir', 'changes.apply', { previewToken: directoryPreview.payload.token }).status, 'conflict');
    rmSync(root, { recursive: true, force: true });
    const filePreview = preview('scope-output-preview-file');
    writeFileSync(root, '');
    assert.equal(invoke(handler, project, 'scope-output-apply-file', 'changes.apply', { previewToken: filePreview.payload.token }).status, 'conflict');
    rmSync(root, { recursive: true, force: true });
    const modePreview = preview('scope-output-preview-mode');
    mkdirSync(root, { recursive: true, mode: 0o700 });
    chmodSync(root, 0o755);
    assert.equal(invoke(handler, project, 'scope-output-apply-mode', 'changes.apply', { previewToken: modePreview.payload.token }).status, 'conflict');
  } finally {
    closePhase6Fixture(fixture);
  }
});


test('CLI routes scope commands through the typed revision-vector contract', async () => {
  const fixture = createPhase6Fixture('evcrate-scopes-cli-');
  try {
    const values = [];
    const runtime = {
      packageRoot: fixture.root,
      cwd: fixture.root,
      output: { isTTY: false, write: (value) => values.push(value) }
    };
    const common = [
      '--json', '--target', 'claude', '--home', fixture.home, '--state-home', fixture.state,
      '--project-id', 'project-1', '--project-root', fixture.root
    ];
    assert.equal(await main(['scopes', 'list', ...common], runtime), 0);
    const listed = JSON.parse(values.at(-1));
    assert.equal(listed.status, 'ok');
    assert.equal(listed.payload.projectId, projectIdentity(fixture.root));
    assert.equal(listed.payload.revisionVector.projectScopeRevision, null);

    assert.equal(await main([
      'scopes', 'assign', '--id', 'agent:agents/alpha.md',
      '--expected-revision', JSON.stringify(listed.payload.revisionVector), ...common
    ], runtime), 0);
    const assigned = JSON.parse(values.at(-1));
    assert.equal(assigned.status, 'applied');
    assert.equal(assigned.payload.assignment.resourceId, 'agent:agents/alpha.md');
  } finally {
    closePhase6Fixture(fixture);
  }
});
