import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import {
  DamHopperConflictError,
  DamHopperSubprocessClient
} from './dam-hopper-adapter.mjs';
import { createConsumerWorkspace } from './dam-hopper-test-fixture.mjs';

test('dam-hopper consumer exercises full resource-control lifecycle with packed npm CLI', () => {
  const ws = createConsumerWorkspace();
  try {
    assert.ok(ws.packageInfo.sha256.length === 64, 'Valid SHA-256 for tarball');

    const client = new DamHopperSubprocessClient({
      cliPath: ws.packageInfo.cliPath,
      cwd: ws.fixture.root,
      projectRoot: ws.fixture.root,
      projectId: 'damhopper-test-proj',
      home: ws.fixture.home,
      stateHome: ws.fixture.state,
      targets: ['claude']
    });

    // 1. Version
    const versionRes = client.version();
    assert.equal(versionRes.status, 'ok');
    assert.ok(versionRes.payload.version);

    // 2. Resource Discovery
    const listRes = client.resourcesList();
    assert.equal(listRes.status, 'ok');
    assert.ok(Array.isArray(listRes.payload.resources));
    const initialRev = listRes.payload.registryRevision;

    const alphaRes = client.resourcesGet('agent:agents/alpha.md');
    assert.equal(alphaRes.status, 'ok');
    assert.equal(alphaRes.payload.resource.id, 'agent:agents/alpha.md');

    // 3. Import Preview & Apply
    const previewRes = client.importsPreview({
      sourcePath: ws.agentPath,
      kind: 'agent',
      destination: 'custom-agent.md',
      provenance: 'damhopper-store'
    });
    assert.equal(previewRes.status, 'preview');
    assert.ok(previewRes.payload.token);

    const applyRes = client.importsApply({
      token: previewRes.payload.token
    });
    assert.equal(applyRes.status, 'applied');
    assert.equal(applyRes.payload.registryRevision, initialRev + 1);

    // 4. Scopes List, Assign, Enable, Disable, Remove
    const scopesRes = client.scopesList();
    assert.equal(scopesRes.status, 'ok');
    const revVector = scopesRes.payload.revisionVector;

    const assignRes = client.scopesAssign({
      resourceId: 'agent:agents/custom-agent.md',
      target: 'claude',
      expectedRevision: revVector
    });
    assert.equal(assignRes.status, 'applied');

    // CAS conflict on stale revision
    assert.throws(
      () => client.scopesAssign({
        resourceId: 'agent:agents/custom-agent.md',
        target: 'claude',
        expectedRevision: { registryRevision: 0, globalScopeRevision: 0, projectScopeRevision: null }
      }),
      (err) => err instanceof DamHopperConflictError && err.code === 'CAS_CONFLICT'
    );

    const updatedScopes = client.scopesList();
    const curVector = updatedScopes.payload.revisionVector;

    const disableRes = client.scopesDisable({
      resourceId: 'agent:agents/custom-agent.md',
      target: 'claude',
      expectedRevision: curVector
    });
    assert.equal(disableRes.status, 'applied');

    const curVector2 = client.scopesList().payload.revisionVector;
    const enableRes = client.scopesEnable({
      resourceId: 'agent:agents/custom-agent.md',
      target: 'claude',
      expectedRevision: curVector2
    });
    assert.equal(enableRes.status, 'applied');

    const curVector3 = client.scopesList().payload.revisionVector;
    const removeRes = client.scopesRemove({
      resourceId: 'agent:agents/custom-agent.md',
      target: 'claude',
      expectedRevision: curVector3
    });
    assert.equal(removeRes.status, 'applied');
  } finally {
    ws.cleanup();
  }
});

test('dam-hopper consumer exercises separate OMP and Copilot targets and health diagnostic', () => {
  const ws = createConsumerWorkspace();
  const home = mkdtempSync(join(tmpdir(), 'evcrate-dh-home-'));
  const state = mkdtempSync(join(tmpdir(), 'evcrate-dh-state-'));
  chmodSync(state, 0o700);
  try {
    const packageRoot = process.cwd();
    const client = new DamHopperSubprocessClient({
      cliPath: ws.packageInfo.cliPath,
      cwd: packageRoot,
      projectRoot: ws.fixture.root,
      projectId: 'damhopper-test-proj-2',
      home,
      stateHome: state,
      targets: ['omp', 'copilot']
    });

    const pubOmp = client.publishDryRun({ targets: ['omp'] });
    assert.equal(pubOmp.status, 'preview');
    assert.deepEqual(pubOmp.payload.selectedTargets, ['omp']);

    const pubCopilot = client.publishDryRun({ targets: ['copilot'] });
    assert.equal(pubCopilot.status, 'preview');
    assert.deepEqual(pubCopilot.payload.selectedTargets, ['copilot']);

    const pubApply = client.publishApply({ targets: ['omp'] });
    assert.equal(pubApply.status, 'published');
    assert.deepEqual(pubApply.payload.selectedTargets, ['omp']);

    const recoverRes = client.recover({ targets: ['omp'] });
    assert.equal(recoverRes.status, 'recovered');

    const healthRes = client.health();
    assert.ok(healthRes.status === 'QUALIFIED' || healthRes.status === 'FAILED');
    assert.equal(healthRes.protocol, 'evcrate-advisor-diagnostic');
  } finally {
    ws.cleanup();
    try { rmSync(home, { recursive: true, force: true }); } catch { /* ignore */ }
    try { rmSync(state, { recursive: true, force: true }); } catch { /* ignore */ }
  }
});
