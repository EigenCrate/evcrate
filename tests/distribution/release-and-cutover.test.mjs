import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { execNpmSync } from '../../scripts/release/npm-runner.cjs';
import { readFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ADVISOR_CONTROLLER_FILES,
  assertLegacyRootClean,
  assertUniformAuthoritativeEngine,
  authoritativeEngineForTarget,
  getAllTargetGateReceipts,
  getTargetGateReceipt,
  PERSISTED_TARGETS,
  runLocalBuild,
  runLocalCheck,
  main,
  resolveInvocationContext
} from '../../dist/index.js';

const packageRoot = process.cwd();
const packageMetadata = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'));

test('all persisted targets have completed cutover gate receipts', () => {
  const receipts = getAllTargetGateReceipts();
  assert.equal(receipts.length, PERSISTED_TARGETS.length);

  for (const target of PERSISTED_TARGETS) {
    const receipt = getTargetGateReceipt(target);
    assert.equal(receipt.target, target);
    assert.equal(receipt.authoritativeEngine, 'typescript');
    if (target === 'vscode') {
      assert.equal(receipt.parityVerified, false);
      assert.equal(receipt.closureVerified, false);
    } else {
      assert.equal(receipt.parityVerified, true);
      assert.equal(receipt.closureVerified, true);
    }
    assert.equal(receipt.schemaVersion, 2);
    assert.ok(typeof receipt.cutoverTimestamp === 'string' && receipt.cutoverTimestamp.length > 0);
    assert.ok(typeof receipt.notes === 'string' && receipt.notes.length > 0);
  }
});

test('authoritative engine selection normalizes aliases and rejects retired python overrides', () => {
  assert.equal(authoritativeEngineForTarget('claude'), 'typescript');
  assert.equal(authoritativeEngineForTarget('agy'), 'typescript');
  assert.equal(authoritativeEngineForTarget('omp'), 'typescript');

  // Override to python for specific target is retired and throws CAPABILITY_UNSUPPORTED
  assert.throws(
    () => authoritativeEngineForTarget('omp', { overrides: { omp: 'python' } }),
    (err) => err?.code === 'CAPABILITY_UNSUPPORTED'
  );
});

test('mixed-stage atomic transactions spanning python and typescript are rejected', () => {
  // Pure typescript targets pass
  const uniformTs = assertUniformAuthoritativeEngine(['omp', 'copilot']);
  assert.equal(uniformTs, 'typescript');

  // Mixed targets throw CAPABILITY_UNSUPPORTED
  assert.throws(
    () => {
      assertUniformAuthoritativeEngine(['omp', 'copilot'], {
        overrides: { omp: 'python', copilot: 'typescript' }
      });
    },
    (err) => err?.code === 'CAPABILITY_UNSUPPORTED'
  );
});


test('local distribution build executes and generates verified build manifest', async () => {
  const buildResult = await runLocalBuild(packageRoot, PERSISTED_TARGETS);
  assert.ok(buildResult.manifestPath);
  assert.ok(buildResult.manifest);
  assert.equal(buildResult.selectedManifests.length, PERSISTED_TARGETS.length);

  const ompBuild = await runLocalBuild(packageRoot, ['omp']);
  assert.ok(ompBuild.manifestPath);
  assert.ok(ompBuild.manifest);
  assert.equal(ompBuild.selectedManifests.length, 1);
  assert.equal(ompBuild.selectedManifests[0].id, 'omp');

  // Restore full workspace build for subsequent tests
  await runLocalBuild(packageRoot, PERSISTED_TARGETS);
});

test('local distribution check validates artifact tree without drift', async () => {
  assertLegacyRootClean(packageRoot);
  await assert.doesNotReject(async () => {
    await runLocalCheck(packageRoot, PERSISTED_TARGETS);
  });
});
test('packaged artifact allowlist is Python-free and contains required runtime assets', () => {
  const packOutput = execNpmSync(['pack', '--dry-run', '--json'], {
    cwd: packageRoot,
    encoding: 'utf8'
  });
  const jsonIndex = Math.max(packOutput.lastIndexOf('\n{'), packOutput.lastIndexOf('\n['));
  const jsonText = jsonIndex >= 0 ? packOutput.slice(jsonIndex + 1).trim() : packOutput.trim();
  const parsed = JSON.parse(jsonText);
  const packMeta = Array.isArray(parsed) ? parsed[0] : Object.values(parsed)[0];
  assert.ok(packMeta.files && Array.isArray(packMeta.files));
  assert.equal(packageMetadata.private, true, 'Package must be private: true');
  assert.equal(packageMetadata.publishConfig, undefined, 'Package must not declare publishConfig');
  assert.equal(packageMetadata.dependencies, undefined, 'Package must declare zero production dependencies');

  const files = packMeta.files.map((f) => f.path);

  // Assert NO distribution or migration Python scripts and NO pycache
  const distributionPythonFiles = files.filter((f) =>
    f.startsWith('distribution/') ||
    f.startsWith('distribute') ||
    f.startsWith('migrate_') ||
    f.startsWith('omp_adapter/') ||
    f.startsWith('copilot_adapter/') ||
    f.startsWith('pi_adapter/') ||
    f.includes('__pycache__') ||
    f.endsWith('.pyc')
  );
  assert.deepEqual(distributionPythonFiles, [], 'Packaged artifact must contain no distribution/migrator Python files or bytecode');
  assert.equal(files.some((f) => f.startsWith('plans/')), false, 'Packaged artifact must not contain plans/');
  assert.equal(files.some((f) => f.startsWith('tests/')), false, 'Packaged artifact must not contain tests/');

  // Assert compiled JS is present
  const jsFiles = files.filter((f) => f.startsWith('dist/'));
  assert.ok(jsFiles.length > 0, 'Compiled JS files must be present in package');

  // Assert exact controller files present
  for (const entry of ADVISOR_CONTROLLER_FILES) {
    const controllerPath = `.evcrate/source/.evcrate/bin/${entry}`;
    assert.ok(
      files.includes(controllerPath),
      `Packaged files must include controller file: ${controllerPath}`
    );
  }

  // Assert target manifests present
  for (const target of PERSISTED_TARGETS) {
    const manifestPath = `.evcrate/targets/${target}/manifest.json`;
    assert.ok(
      files.includes(manifestPath),
      `Packaged files must include target manifest: ${manifestPath}`
    );
  }
});

test('pure TypeScript CLI routes health, settings, version, and publication without Python', async () => {
  const home = mkdtempSync(join(tmpdir(), 'evcrate-p10-home-'));
  try {
    const capturedVersion = [];
    const vCode = await main(['version', '--json'], {
      output: { isTTY: false, write: (v) => capturedVersion.push(v) }
    });
    assert.equal(vCode, 0);
    const vParsed = JSON.parse(capturedVersion[0]);
    assert.equal(vParsed.status, 'ok');
    assert.ok(vParsed.payload.version);

    const capturedSettings = [];
    const sCode = await main(['advisor', 'settings', 'get', '--home', home, '--json'], {
      output: { isTTY: false, write: (v) => capturedSettings.push(v) }
    });
    assert.equal(sCode, 0);
    const capturedPub = [];
    const pCode = await main(['publish', '--dry-run', '--target', 'omp', '--home', home, '--json'], {
      output: { isTTY: false, write: (v) => capturedPub.push(v) }
    });
    assert.equal(pCode, 0);
    const pParsed = JSON.parse(capturedPub[0]);
    assert.equal(pParsed.status, 'preview');
    assert.deepEqual(pParsed.payload.phases[1].selectedTargets, ['omp']);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
