import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ControlPlaneError, createPublicationPlan, main, recoverPublication, resolveInvocationContext,
  resolvePublicationProjectContext, runAllManifestsBuild
} from '../../dist/index.js';
import { PublicationPartialError } from '../../dist/distribution/publication.js';

import { prepareFixtureWorkspace } from '../distribution/parity-verification-helpers.mjs';

let packageRoot;
let fixtureRoot;
test.before(async () => {
  fixtureRoot = mkdtempSync(join(tmpdir(), 'evcrate-cli-publication-package-'));
  packageRoot = join(fixtureRoot, 'package');
  prepareFixtureWorkspace(packageRoot);
  await runAllManifestsBuild(packageRoot, { jobs: 2 });
});
test.after(() => {
  if (fixtureRoot !== undefined) rmSync(fixtureRoot, { recursive: true, force: true });
});
const bindingOrder = ['.omp'];
const dryRun = Object.freeze({
  scope: 'home', projectIdentity: null,
  buildManifestPath: '.evcrate/build-manifest-omp.json', buildManifestDigest: 'a'.repeat(64),
  phases: [
    { phase: 'shared', scope: 'home', selectedTargets: [], bindingOrder: ['.evcrate/bin'], changes: [] },
    { phase: 'harness', scope: 'home', selectedTargets: ['omp'], bindingOrder, changes: [] }
  ]
});
const applied = Object.freeze({
  ...dryRun,
  phases: dryRun.phases.map((phase) => ({
    ...phase, status: 'committed', releaseId: 'release-cli-1', retainedReleaseId: null
  }))
});

function capture() {
  const values = [];
  return { values, output: { isTTY: false, write: (value) => values.push(value) } };
}
function runtime(home, captured, publicationHandler, extra = {}) {
  return {
    packageRoot, cwd: packageRoot, packageVersion: '1.0.0', requestId: () => 'phase8-cli',
    output: captured.output, publicationHandler, home, ...extra
  };
}

test('top-level publish routes dry-run and apply through the typed resource envelope', async () => {
  const home = mkdtempSync(join(tmpdir(), 'evcrate-cli-publish-'));
  try {
    const handler = {
      publishDryRun: () => dryRun,
      publishApply: () => applied,
      recover: () => ({ scope: 'home', projectIdentity: null, action: 'none', phases: [] })
    };
    const preview = capture();
    assert.equal(await main(['publish', '--dry-run', '--target', 'omp', '--home', home, '--json'], runtime(home, preview, handler)), 0);
    assert.equal(JSON.parse(preview.values[0]).status, 'preview');
    assert.deepEqual(JSON.parse(preview.values[0]).payload.phases[1].bindingOrder, bindingOrder);
    const result = capture();
    assert.equal(await main(['publish', '--apply', '--target', 'omp', '--home', home, '--json'], runtime(home, result, handler)), 0);
    assert.equal(JSON.parse(result.values[0]).status, 'published');
    assert.equal(JSON.parse(result.values[0]).payload.phases[1].releaseId, 'release-cli-1');
    const recovery = capture();
    assert.equal(await main(['recover', '--target', 'omp', '--home', home, '--json'], runtime(home, recovery, handler)), 0);
    const recovered = JSON.parse(recovery.values[0]);
    assert.equal(recovered.status, 'recovered');
    assert.deepEqual(recovered.payload, { scope: 'home', projectIdentity: null, action: 'none', phases: [] });
    assert.deepEqual(recovered.recovery, { kind: 'none', identity: 'none' });
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('publication with retired python engine override fails with CAPABILITY_UNSUPPORTED', async () => {
  const home = mkdtempSync(join(tmpdir(), 'evcrate-cli-retired-python-'));
  try {
    const captured = capture();
    const retiredRuntime = {
      ...runtime(home, captured),
      engineSelectionOptions: { overrides: { omp: 'python' } }
    };
    assert.equal(await main(['publish', '--dry-run', '--target', 'omp', '--home', home, '--json'], retiredRuntime), 3);
    assert.equal(JSON.parse(captured.values[0]).error.code, 'CAPABILITY_UNSUPPORTED');
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
test('real authority dry-run is exact and leaves HOME and state untouched', async () => {
  const home = mkdtempSync(join(tmpdir(), 'evcrate-cli-real-dry-run-'));
  try {
    const captured = capture();
    assert.equal(await main(['publish', '--dry-run', '--target', 'omp', '--home', home, '--json'],
      runtime(home, captured)), 0);
    assert.equal(JSON.parse(captured.values[0]).status, 'preview');
    assert.equal(existsSync(join(home, '.evcrate')), false);
    assert.equal(existsSync(join(home, '.local')), false);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('real authority apply matches the typed plan on repeat', async () => {
  const home = mkdtempSync(join(tmpdir(), 'evcrate-cli-real-apply-'));
  try {
    const applied = capture();
    assert.equal(await main(['publish', '--apply', '--target', 'omp', '--home', home, '--json'],
      runtime(home, applied)), 0);
    assert.equal(JSON.parse(applied.values[0]).status, 'published');
    const repeated = capture();
    assert.equal(await main(['publish', '--dry-run', '--target', 'omp', '--home', home, '--json'],
      runtime(home, repeated)), 0);
    const payload = JSON.parse(repeated.values[0]).payload;
    assert.ok(payload.phases.flatMap(({ changes }) => changes)
      .every(({ action }) => action === 'noop' || action === 'preserve'));
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('project typed publication serializes a valid partial result with exit five', async () => {
  const home = mkdtempSync(join(tmpdir(), 'evcrate-cli-project-partial-'));
  try {
    const captured = capture();
    const handler = {
      publishApply(context) {
        const partial = {
          scope: 'project',
          projectIdentity: resolvePublicationProjectContext(context).projectIdentity,
          buildManifestPath: '.evcrate/build-manifest-omp.json',
          buildManifestDigest: 'a'.repeat(64),
          phases: [
            { ...dryRun.phases[0], status: 'committed', releaseId: 'shared-release', retainedReleaseId: null },
            { ...dryRun.phases[1], scope: 'project', status: 'failed', releaseId: null, retainedReleaseId: null }
          ]
        };
        throw new PublicationPartialError(partial, 'PUBLICATION_FAILED');
      }
    };
    assert.equal(await main([
      'publish', '--apply', '--scope', 'project', '--target', 'omp',
      '--home', home, '--project-root', packageRoot, '--json'
    ], runtime(home, captured, handler)), 5);
    const result = JSON.parse(captured.values[0]);
    assert.equal(result.status, 'partial');
    assert.equal(result.error.code, 'PUBLICATION_FAILED');
    assert.equal(result.payload.phases[0].status, 'committed');
    assert.equal(result.payload.phases[1].status, 'failed');
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});



test('typed publication rejects handler output with mismatched binding order', async () => {
  const home = mkdtempSync(join(tmpdir(), 'evcrate-cli-correlation-'));
  try {
    const captured = capture();
    const handler = {
      publishDryRun: () => ({
        scope: 'home', projectIdentity: null,
        buildManifestPath: '.evcrate/build-manifest.json', buildManifestDigest: 'a'.repeat(64),
        phases: [
          { phase: 'shared', scope: 'home', selectedTargets: [], bindingOrder: ['.evcrate/bin'], changes: [] },
          { phase: 'harness', scope: 'home', selectedTargets: ['codex'], bindingOrder: ['.agents/skills', '.codex'], changes: [] }
        ]
      }),
      publishApply: () => applied,
      recover: () => ({ scope: 'home', projectIdentity: null, action: 'none', phases: [] })
    };
    assert.equal(
      await main(['publish', '--dry-run', '--target', 'codex', '--target', 'omp', '--home', home, '--json'],
        runtime(home, captured, handler)),
      2
    );
    const result = JSON.parse(captured.values[0]);
    assert.equal(result.status, 'error');
    assert.equal(result.error.code, 'PROTOCOL_INVALID');
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('target recovery reads only publication state and leaves advisor settings untouched', () => {
  const home = mkdtempSync(join(tmpdir(), 'evcrate-cli-isolation-'));
  try {
    const context = resolveInvocationContext({ packageRoot, cwd: packageRoot, home, targets: ['omp'] });
    mkdirSync(join(home, '.evcrate'), { recursive: true, mode: 0o700 });
    const policy = join(home, '.evcrate', 'advisor-routing.json');
    const bytes = Buffer.from('{"version":1,"advisor":{"backend":"codex","model":"m","effort":"low","timeout_ms":60000}}\n');
    writeFileSync(policy, bytes, { mode: 0o600 });
    chmodSync(policy, 0o600);
    const beforeMode = Number(lstatSync(policy).mode) & 0o777;
    const outcome = recoverPublication(context);
    assert.equal(outcome.action, 'none');
    assert.deepEqual(readFileSync(policy), bytes);
    assert.equal(Number(lstatSync(policy).mode) & 0o777, beforeMode);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('publish --apply --debug outputs debug detail on failure', async () => {
  const home = mkdtempSync(join(tmpdir(), 'evcrate-cli-debug-'));
  try {
    const handler = {
      publishApply: () => {
        throw new ControlPlaneError('PATH_UNSAFE', 'custom debug test reason');
      }
    };
    const captured = capture();
    captured.output.isTTY = true;
    const exitCode = await main(
      ['publish', '--apply', '--debug', '--target', 'omp'],
      runtime(home, captured, handler)
    );
    assert.equal(exitCode, 3);
    const text = captured.values.join('');
    assert.ok(text.includes('[DEBUG] Detail: custom debug test reason'));
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
