import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

import releaseContract from '../../scripts/release/release-contract.cjs';
import { validateRuntimeClosure } from '../../scripts/release/runtime-closure.cjs';
import { buildReleaseArchives } from '../../scripts/release/archive-writers.cjs';
import { ADVISOR_CONTROLLER_FILES, PERSISTED_TARGETS } from '../../dist/index.js';

// Import negative fixtures suite so authoritative command runs all tests
import './private-release-negative-fixtures.mjs';

const packageRoot = process.cwd();

test('release-contract freezes schema, platforms, limits, and mutable path policy', () => {
  assert.equal(releaseContract.SCHEMA_ID, 'evcrate-private-release/v1');
  assert.deepEqual(releaseContract.SUPPORTED_PLATFORMS, ['linux-x64', 'windows-x64']);
  assert.equal(releaseContract.MAX_FILES, 100000);
  assert.equal(releaseContract.MAX_FILE_BYTES, 16 * 1024 * 1024);
  assert.equal(releaseContract.MAX_TOTAL_EXPANDED_BYTES, 512 * 1024 * 1024);

  assert.deepEqual(releaseContract.MUTABLE_PATHS, [
    '.evcrate/source/.claude/**',
    '.evcrate/registry.json',
    '.evcrate/scopes/**'
  ]);
});

test('sidecar serializer and strict parser enforce grammar <sha256>  <basename>\\n', () => {
  const hash = 'a'.repeat(64);
  const name = 'evcrate-v1.0.0-linux-x64.tar.gz';
  const serialized = releaseContract.serializeSidecar(hash, name);
  assert.equal(serialized, `${hash}  ${name}\n`);

  const parsed = releaseContract.parseSidecar(serialized, name);
  assert.equal(parsed.sha256, hash);
  assert.equal(parsed.basename, name);
});

test('runtime closure validator verifies current project with zero external dependencies', () => {
  const result = validateRuntimeClosure(packageRoot);
  assert.equal(result.valid, true);
  assert.ok(result.visitedCount > 50, `Expected many modules traversed, got ${result.visitedCount}`);
  assert.ok(result.visited.includes('dist/cli/evcrate.js'));
  assert.ok(result.visited.includes('dist/index.js'));
});

test('archive writers produce verified tar.gz, zip, sidecars, and metadata including empty files', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'evcrate-arch-test-'));
  const data1 = Buffer.from('#!/usr/bin/env node\nconsole.log("cli");\n');
  const data2 = Buffer.from('{"name":"test"}\n');
  const emptyData = Buffer.alloc(0);
  const hash1 = crypto.createHash('sha256').update(data1).digest('hex');
  const hash2 = crypto.createHash('sha256').update(data2).digest('hex');
  const emptyHash = crypto.createHash('sha256').update(emptyData).digest('hex');

  const records = [
    { path: 'package.json', size: data2.length, mode: 0o644, sha256: hash2, data: data2 },
    { path: 'dist/cli/evcrate.js', size: data1.length, mode: 0o755, sha256: hash1, data: data1 },
    { path: 'empty.txt', size: 0, mode: 0o644, sha256: emptyHash, data: emptyData }
  ];

  const instData = Buffer.from('#!/bin/sh\necho install\n');
  const instHash = crypto.createHash('sha256').update(instData).digest('hex');
  const installers = [
    { name: 'install.sh', size: instData.length, sha256: instHash, data: instData },
    { name: 'install.ps1', size: instData.length, sha256: instHash, data: instData }
  ];

  const version = '9.9.9';
  const commit = 'd'.repeat(40);
  const hash = 'e'.repeat(64);

  try {
    const result = buildReleaseArchives({
      records,
      installers,
      outputDir: tmp,
      version,
      metadataGenerator: ({ inventoryDigest, platforms }) => ({
        schema: 'evcrate-private-release/v1',
        version,
        tag: `v${version}`,
        source_commit: commit,
        node_floor: '>=22.19.0',
        inventory_digest: inventoryDigest,
        build_manifest_digests: { all: hash },
        controller_closure_digest: hash,
        platforms,
        installers: {
          'install.sh': { name: 'install.sh', size: instData.length, sha256: instHash },
          'install.ps1': { name: 'install.ps1', size: instData.length, sha256: instHash }
        },
        mutable_paths: releaseContract.MUTABLE_PATHS
      })
    });

    assert.ok(result.inventoryDigest);
    assert.equal(result.platforms['linux-x64'].archive_name, `evcrate-v${version}-linux-x64.tar.gz`);
    assert.equal(result.platforms['windows-x64'].archive_name, `evcrate-v${version}-windows-x64.zip`);

    // Verify sidecars exist and match
    const linuxSidecar = readFileSync(join(tmp, `evcrate-v${version}-linux-x64.tar.gz.sha256`), 'utf8');
    const parsedLinuxSidecar = releaseContract.parseSidecar(linuxSidecar, `evcrate-v${version}-linux-x64.tar.gz`);
    assert.equal(parsedLinuxSidecar.sha256, result.platforms['linux-x64'].sha256);

    const winSidecar = readFileSync(join(tmp, `evcrate-v${version}-windows-x64.zip.sha256`), 'utf8');
    const parsedWinSidecar = releaseContract.parseSidecar(winSidecar, `evcrate-v${version}-windows-x64.zip`);
    assert.equal(parsedWinSidecar.sha256, result.platforms['windows-x64'].sha256);

    // Verify metadata exists and is valid
    const metaFile = JSON.parse(readFileSync(join(tmp, `evcrate-v${version}.release.json`), 'utf8'));
    assert.doesNotThrow(() => releaseContract.validateReleaseMetadata(metaFile));
    assert.equal(metaFile.inventory_digest, result.inventoryDigest);

    // Verify installers were linked
    assert.ok(existsSync(join(tmp, 'install.sh')));
    assert.ok(existsSync(join(tmp, 'install.ps1')));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('packed artifact allowlist is Python-free, plan-free, test-free, and contains runtime assets', () => {
  const packOutput = execFileSync('npm', ['pack', '--dry-run', '--json'], {
    cwd: packageRoot,
    encoding: 'utf8'
  });
  const jsonIndex = packOutput.search(/[[{]/);
  const parsed = JSON.parse(packOutput.slice(jsonIndex).trim());
  const [packMeta] = Array.isArray(parsed) ? parsed : Object.values(parsed);
  const files = packMeta.files.map((f) => f.path);

  // Assert compiled JS is present
  assert.ok(files.includes('dist/cli/evcrate.js'), 'Must include dist/cli/evcrate.js');
  assert.ok(files.includes('dist/index.js'), 'Must include dist/index.js');
  assert.ok(files.includes('dist/index.d.ts'), 'Must include dist/index.d.ts');

  // Assert authoritative controller files present (ADVISOR_CONTROLLER_FILES)
  for (const entry of ADVISOR_CONTROLLER_FILES) {
    const p = `.evcrate/source/.evcrate/bin/${entry}`;
    assert.ok(files.includes(p), `Missing controller file: ${p}`);
  }

  // Assert target manifests present
  for (const target of PERSISTED_TARGETS) {
    assert.ok(files.includes(`.evcrate/targets/${target}/manifest.json`), `Missing target manifest: ${target}`);
  }

  // Assert NO distribution, migration, adapter Python scripts and NO pycache/bytecode
  const forbiddenPython = files.filter((f) =>
    f.startsWith('distribution/') ||
    f.startsWith('distribute') ||
    f.startsWith('migrate_') ||
    f.startsWith('omp_adapter/') ||
    f.startsWith('copilot_adapter/') ||
    f.startsWith('pi_adapter/') ||
    f.includes('__pycache__') ||
    f.endsWith('.pyc') ||
    f.endsWith('.pyo')
  );
  assert.deepEqual(forbiddenPython, [], 'Packaged artifact must contain no distribution/migrator/adapter Python files or bytecode');

  // Assert no plans, no repo tests, no repo source, no node_modules
  assert.equal(files.some((f) => f.startsWith('plans/')), false, 'Must not contain plans/');
  assert.equal(files.some((f) => f.startsWith('tests/')), false, 'Must not contain tests/');
  assert.equal(files.some((f) => f.startsWith('src/')), false, 'Must not contain src/');
  assert.equal(files.some((f) => f.includes('node_modules')), false, 'Must not contain node_modules/');

  // Assert registry-authorized skill resources remain present
  const registry = JSON.parse(readFileSync(join(packageRoot, '.evcrate', 'registry.json'), 'utf8'));
  assert.ok(registry.resources && registry.resources.length > 0);
  assert.ok(files.some((f) => f.includes('docx') && f.endsWith('.py')), 'Authorized skill script resources must be present');

  // Assert package.json metadata has private: true and no forbidden lifecycle hooks
  const pkg = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'));
  assert.equal(pkg.private, true);
  assert.equal(pkg.publishConfig, undefined);
  assert.equal(pkg.dependencies, undefined);
  assert.equal(pkg.scripts?.preinstall, undefined);
  assert.equal(pkg.scripts?.install, undefined);
  assert.equal(pkg.scripts?.postinstall, undefined);
  assert.equal(pkg.scripts?.prepare, undefined);
});
