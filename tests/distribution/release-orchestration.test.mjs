import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const runReleaseCandidate = require('../../scripts/release/run-release-candidate.cjs');
const publishRelease = require('../../scripts/release/publish-release.cjs');
const assetVerification = require('../../scripts/release/asset-verification.cjs');
const releaseContract = require('../../scripts/release/release-contract.cjs');
const { buildReleaseArchives } = require('../../scripts/release/archive-writers.cjs');
const { createMinimalValidRecords } = await import('../installers/fixtures/fixture-records.mjs');
const {
  getRealInstallerEntry,
  computeControllerClosureDigest,
  computeBuildManifestDigests
} = await import('../installers/fixtures/release-fixture-shared-helpers.mjs');
const { buildWindowsTestReleaseSet } = await import('../installers/fixtures/windows-release-fixture.mjs');

const projectRoot = process.cwd();

/**
 * Helper to build exact-seven valid release assets in a directory.
 */
function createExactSevenAssets(outputDir, version = '2.2.0', commit = 'c'.repeat(40)) {
  fs.mkdirSync(outputDir, { recursive: true });
  const records = createMinimalValidRecords(version);
  const sortedRecords = [...records].sort((a, b) => releaseContract.compareCodePoints(a.path, b.path));

  const installSh = getRealInstallerEntry('install.sh', projectRoot);
  const installPs1 = getRealInstallerEntry('install.ps1', projectRoot);

  buildReleaseArchives({
    records: sortedRecords,
    installers: [installSh, installPs1],
    outputDir,
    version,
    metadataGenerator: ({ inventoryDigest, platforms }) => ({
      schema: 'evcrate-private-release/v1',
      version,
      tag: `v${version}`,
      source_commit: commit,
      node_floor: '>=22.19.0',
      inventory_digest: inventoryDigest,
      build_manifest_digests: computeBuildManifestDigests(sortedRecords),
      controller_closure_digest: computeControllerClosureDigest(sortedRecords),
      platforms,
      installers: {
        'install.sh': { name: 'install.sh', size: installSh.size, sha256: installSh.sha256 },
        'install.ps1': { name: 'install.ps1', size: installPs1.size, sha256: installPs1.sha256 }
      },
      mutable_paths: releaseContract.MUTABLE_PATHS
    })
  });

  fs.writeFileSync(path.join(outputDir, 'install.sh'), installSh.data);
  fs.writeFileSync(path.join(outputDir, 'install.ps1'), installPs1.data);

  return assetVerification.verifyReleaseAssetSet({
    dir: outputDir,
    version,
    tag: `v${version}`,
    sourceCommit: commit
  });
}

// Real REST response shapes; only the external HTTP boundary is replaced.
function githubApprovalFixture(receipt) {
  const root = 'https://api.github.com/repos/EigenCrate/evcrate';
  const reviewer = { id: 40543421, login: 'release-maintainer', type: 'User' };
  const actor = { id: 61918651, login: 'run-author', type: 'User' };
  const environment = { id: 23939029728, name: 'production' };
  const runPath = `/actions/runs/${receipt.workflow_run_id}`;
  const responses = {
    [runPath]: {
      id: receipt.workflow_run_id, run_attempt: receipt.workflow_run_attempt,
      head_sha: receipt.source_commit, head_branch: 'main', path: '.github/workflows/release.yml',
      repository: { full_name: 'EigenCrate/evcrate' },
      head_repository: { full_name: 'EigenCrate/evcrate' },
      actor, triggering_actor: actor
    },
    '/environments/production': {
      ...environment, can_admins_bypass: false,
      deployment_branch_policy: { protected_branches: false, custom_branch_policies: true },
      protection_rules: [
        { id: 14, type: 'required_reviewers', prevent_self_review: true, reviewers: [{ type: 'User', reviewer }] },
        { id: 15, type: 'branch_policy' }
      ]
    },
    '/environments/production/deployment-branch-policies?per_page=100': {
      total_count: 1,
      branch_policies: [{ id: 62566638, node_id: 'MDE2OkdhdGViBrb2xpY3k2MjU2NjYzOA==', name: 'main' }]
    },
    [`${runPath}/approvals`]: [{ user: reviewer, state: 'approved', environments: [environment], comment: 'Candidate reviewed' }],
    '/collaborators/release-maintainer/permission': {
      permission: 'write', role_name: 'maintain', user: reviewer
    }
  };
  const calls = [];
  return {
    responses, calls, runPath,
    async fetchFn(url, options) {
      assert.ok(url.startsWith(`${root}/`), 'issuer must remain the canonical GitHub repository');
      assert.equal(options.method, 'GET');
      assert.equal(options.redirect, 'error');
      assert.equal(options.headers.Authorization, 'Bearer test-token');
      assert.ok(options.signal instanceof AbortSignal);
      const endpoint = url.slice(root.length);
      calls.push(endpoint);
      assert.ok(Object.hasOwn(responses, endpoint), `Unexpected GitHub request: ${endpoint}`);
      const response = responses[endpoint];
      return response instanceof Response ? response : Response.json(response);
    }
  };
}

test('readCanonicalReleaseConfig strictly validates canonical configuration and returns a deep copy', () => {
  const config = runReleaseCandidate.readCanonicalReleaseConfig({ projectRoot });
  assert.ok(Array.isArray(config.branches));
  assert.ok(config.branches.includes('main'));
  assert.ok(Array.isArray(config.plugins));

  // Verify deep copy: mutating returned object does not affect next read
  config.branches.push('tampered-branch');
  const freshConfig = runReleaseCandidate.readCanonicalReleaseConfig({ projectRoot });
  assert.equal(freshConfig.branches.includes('tampered-branch'), false);

  // Rejection cases
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evcrate-config-test-'));
  try {
    // Missing file
    assert.throws(
      () => runReleaseCandidate.readCanonicalReleaseConfig({ configPath: path.join(tmpDir, 'missing.json') }),
      /Canonical release configuration file not found/
    );

    // Invalid JSON
    const badJsonPath = path.join(tmpDir, 'bad.json');
    fs.writeFileSync(badJsonPath, 'not-json');
    assert.throws(
      () => runReleaseCandidate.readCanonicalReleaseConfig({ configPath: badJsonPath }),
      /Failed to parse canonical release config/
    );

    // Non-object
    const arrayJsonPath = path.join(tmpDir, 'array.json');
    fs.writeFileSync(arrayJsonPath, '[]');
    assert.throws(
      () => runReleaseCandidate.readCanonicalReleaseConfig({ configPath: arrayJsonPath }),
      /must be a non-null object/
    );

    // Missing branches
    const noBranchesPath = path.join(tmpDir, 'no-branches.json');
    fs.writeFileSync(noBranchesPath, JSON.stringify({ plugins: [] }));
    assert.throws(
      () => runReleaseCandidate.readCanonicalReleaseConfig({ configPath: noBranchesPath }),
      /must specify "branches"/
    );

    // Empty branches array
    const emptyBranchesPath = path.join(tmpDir, 'empty-branches.json');
    fs.writeFileSync(emptyBranchesPath, JSON.stringify({ branches: [], plugins: [] }));
    assert.throws(
      () => runReleaseCandidate.readCanonicalReleaseConfig({ configPath: emptyBranchesPath }),
      /"branches" array cannot be empty/
    );

    // Missing plugins array
    const noPluginsPath = path.join(tmpDir, 'no-plugins.json');
    fs.writeFileSync(noPluginsPath, JSON.stringify({ branches: ['main'] }));
    assert.throws(
      () => runReleaseCandidate.readCanonicalReleaseConfig({ configPath: noPluginsPath }),
      /must specify a "plugins" array/
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('createCandidatePluginSpecs retains required plugins in order, removes github, and wraps notes generator', async () => {
  const canonicalConfig = runReleaseCandidate.readCanonicalReleaseConfig({ projectRoot });
  const adapted = runReleaseCandidate.createCandidatePluginSpecs(canonicalConfig.plugins, {
    canonicalRepositoryUrl: 'https://github.com/EigenCrate/evcrate'
  });

  // Exactly 6 plugins (canonical has 7: analyzer, notes, changelog, npm, exec, github, git -> minus github = 6)
  assert.equal(adapted.length, 6);

  // Verify github plugin is removed
  const hasGithub = adapted.some((item) => {
    const id = typeof item === 'string' ? item : (Array.isArray(item) ? item[0] : item?.path);
    return id === '@semantic-release/github';
  });
  assert.equal(hasGithub, false);

  // Verify notes generator is wrapped
  // Verify notes generator is wrapped in a plugin object (not bare function) to avoid EPLUGINSCONF
  const notesItem = adapted[1];
  assert.ok(Array.isArray(notesItem));
  const [notesObj, notesConfig] = notesItem;
  assert.equal(typeof notesObj, 'object');
  assert.equal(typeof notesObj.generateNotes, 'function');
  assert.equal(notesObj.generateNotes.pluginName, '@semantic-release/release-notes-generator');
  assert.equal(notesConfig.preset, 'conventionalcommits');

  // Verify wrapped notes generator passes canonical repositoryUrl in context
  const dummyContext = {
    options: { repositoryUrl: 'file:///disposable/mirror.git' },
    commits: [
      {
        message: 'feat: add windows qualification\n\nBREAKING CHANGE: none',
        hash: 'a'.repeat(40)
      }
    ],
    lastRelease: { version: '2.1.0', gitTag: 'v2.1.0', gitHead: 'b'.repeat(40) },
    nextRelease: { version: '2.2.0', gitTag: 'v2.2.0', gitHead: 'a'.repeat(40) },
    cwd: projectRoot,
    logger: {
      log: () => {},
      error: () => {},
      warn: () => {},
      scope: () => ({ log: () => {}, error: () => {}, warn: () => {} })
    }
  };

  const notesResult = await notesObj.generateNotes(notesConfig, dummyContext);
  assert.ok(typeof notesResult === 'string');
  assert.ok(notesResult.includes('Features') || notesResult.includes('windows qualification'));
  // Test error on missing required plugins
  assert.throws(
    () => runReleaseCandidate.createCandidatePluginSpecs([['@semantic-release/commit-analyzer', {}]]),
    /Canonical plugins missing required plugin/
  );
});
test('semantic-release runtime validation accepts candidate plugins without EPLUGINSCONF and resolves callable default', async () => {
  const canonicalConfig = runReleaseCandidate.readCanonicalReleaseConfig({ projectRoot });
  const adapted = runReleaseCandidate.createCandidatePluginSpecs(canonicalConfig.plugins, {
    canonicalRepositoryUrl: 'https://github.com/EigenCrate/evcrate'
  });

  // Verify CJS semantic-release export resolution
  const rawSr = require('semantic-release');
  const resolvedSr = typeof rawSr === 'function' ? rawSr : rawSr.default;
  assert.equal(typeof resolvedSr, 'function');

  // Verify semantic-release plugins normalize without EPLUGINSCONF
  const pluginsModule = await import('semantic-release/lib/plugins/index.js');
  const getPlugins = pluginsModule.default || pluginsModule;
  const dummyContext = {
    cwd: projectRoot,
    options: {
      plugins: adapted,
      repositoryUrl: 'file:///tmp/dummy'
    },
    stdout: process.stdout,
    stderr: process.stderr,
    logger: {
      log: () => {},
      error: () => {},
      warn: () => {},
      success: () => {},
      scope: () => ({ log: () => {}, error: () => {}, warn: () => {}, success: () => {} })
    }
  };

  const loadedPlugins = await getPlugins(dummyContext, {});
  assert.ok(loadedPlugins);
  assert.equal(typeof loadedPlugins.generateNotes, 'function');
  assert.equal(typeof loadedPlugins.analyzeCommits, 'function');
});


test('createLocalReleaseMirror initializes bare repo, seeds branch and tags, and cleans up', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evcrate-mirror-test-'));
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim().toLowerCase();

  try {
    const mirror = runReleaseCandidate.createLocalReleaseMirror({
      cwd: projectRoot,
      tempDir: tmpDir,
      branch: 'main',
      sourceCommit: head
    });

    assert.ok(mirror.mirrorPath);
    assert.ok(mirror.mirrorUrl.startsWith('file://'));
    assert.ok(fs.existsSync(mirror.mirrorPath));

    // Verify branch ref in bare repo points to HEAD
    const mirrorHead = execFileSync('git', ['rev-parse', 'refs/heads/main'], {
      cwd: mirror.mirrorPath,
      encoding: 'utf8'
    }).trim().toLowerCase();
    assert.equal(mirrorHead, head);

    // Verify bare mirror HEAD points to the target branch ref and is fetchable
    const symbolicHead = execFileSync('git', ['--git-dir', mirror.mirrorPath, 'symbolic-ref', 'HEAD'], {
      encoding: 'utf8'
    }).trim();
    assert.equal(symbolicHead, 'refs/heads/main');
    execFileSync('git', ['fetch', '--tags', mirror.mirrorUrl], { cwd: projectRoot, encoding: 'utf8' });
    // Test cleanup
    mirror.cleanup();
    assert.equal(fs.existsSync(mirror.mirrorPath), false);

    // Negative tests
    assert.throws(
      () => runReleaseCandidate.createLocalReleaseMirror({ cwd: projectRoot, tempDir: tmpDir, branch: 'main', sourceCommit: 'short' }),
      /requires exact lowercase 40-hex sourceCommit/
    );
    assert.throws(
      () => runReleaseCandidate.createLocalReleaseMirror({ cwd: projectRoot, tempDir: tmpDir, branch: '', sourceCommit: head }),
      /requires valid branch name/
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('writeGithubOutputs writes exact 9 keys with safe encoding and rejects invalid characters', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evcrate-output-test-'));
  const outputFile = path.join(tmpDir, 'github_output.txt');

  try {
    const validOutputs = {
      has_release: 'true',
      version: '2.2.0',
      tag: 'v2.2.0',
      source_commit: 'a'.repeat(40),
      artifact_name: 'release-candidate-1-1-' + 'a'.repeat(40),
      windows_archive_sha256: 'b'.repeat(64),
      windows_sidecar_sha256: 'c'.repeat(64),
      metadata_sha256: 'd'.repeat(64),
      install_ps1_sha256: 'e'.repeat(64)
    };

    runReleaseCandidate.writeGithubOutputs(validOutputs, { githubOutput: outputFile });

    const content = fs.readFileSync(outputFile, 'utf8');
    const lines = content.trim().split('\n');
    assert.equal(lines.length, 9);
    assert.ok(lines.includes('has_release=true'));
    assert.ok(lines.includes('version=2.2.0'));
    assert.ok(lines.includes('tag=v2.2.0'));

    // Rejection of invalid characters (injection protection)
    assert.throws(
      () => runReleaseCandidate.writeGithubOutputs({ version: 'bad\nvalue' }, { githubOutput: outputFile }),
      /contains invalid characters/
    );
    assert.throws(
      () => runReleaseCandidate.writeGithubOutputs({ version: 'bad value with spaces' }, { githubOutput: outputFile }),
      /contains invalid characters/
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('stageCandidateArtifact stages exact tree, hashes staged bytes, creates canonical candidate.json, and promotes atomically', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evcrate-stage-test-'));
  const assetsDir = path.join(tmpDir, 'source-assets');
  const predDir = path.join(tmpDir, 'source-predecessor');
  const finalOutputDir = path.join(tmpDir, 'final-candidate');
  const harnessPath = path.join(projectRoot, 'tests', 'installers', 'windows-release-qualification.mjs');

  const version = '2.2.0';
  const sourceCommit = '1'.repeat(40);
  const pVersion = '1.0.0';
  const pCommit = 'a'.repeat(40);

  try {
    // 1. Create exact 7 assets
    createExactSevenAssets(assetsDir, version, sourceCommit);

    // 2. Create exact 4 predecessor assets
    buildWindowsTestReleaseSet({
      outputDir: predDir,
      version: pVersion,
      commit: pCommit
    });

    const staged = await runReleaseCandidate.stageCandidateArtifact({
      outputDir: finalOutputDir,
      tempDir: tmpDir,
      distReleaseDir: assetsDir,
      predecessorDir: predDir,
      predecessorInfo: {
        kind: 'bootstrap-fixture',
        version: pVersion,
        tag: `v${pVersion}`,
        sourceCommit: pCommit
      },
      harnessPath,
      candidateVersion: version,
      sourceCommit,
      repository: 'EigenCrate/evcrate',
      workflowRunId: 42,
      workflowRunAttempt: 2
    });

    assert.equal(staged.stagedDir, finalOutputDir);
    assert.ok(fs.existsSync(finalOutputDir));

    // Verify layout: assets/ (7), predecessor/ (4), qualification/ (1), candidate.json (1)
    const topEntries = fs.readdirSync(finalOutputDir).sort();
    assert.deepEqual(topEntries, ['assets', 'candidate.json', 'predecessor', 'qualification']);

    const stagedAssets = fs.readdirSync(path.join(finalOutputDir, 'assets')).sort();
    assert.equal(stagedAssets.length, 7);

    const stagedPred = fs.readdirSync(path.join(finalOutputDir, 'predecessor')).sort();
    assert.equal(stagedPred.length, 4);

    const stagedQual = fs.readdirSync(path.join(finalOutputDir, 'qualification')).sort();
    assert.deepEqual(stagedQual, ['windows-release-qualification.mjs']);

    // Verify candidate.json
    const receiptRaw = fs.readFileSync(path.join(finalOutputDir, 'candidate.json'), 'utf8');
    const receipt = JSON.parse(receiptRaw);
    assert.equal(receipt.schema, 'evcrate-release-candidate/v1');
    assert.equal(receipt.repository, 'EigenCrate/evcrate');
    assert.equal(receipt.workflow_run_id, 42);
    assert.equal(receipt.workflow_run_attempt, 2);
    assert.equal(receipt.source_commit, sourceCommit);
    assert.equal(receipt.version, version);
    assert.equal(receipt.tag, `v${version}`);
    assert.equal(receipt.files.length, 7);
    assert.equal(receipt.predecessor.kind, 'bootstrap-fixture');
    assert.equal(receipt.predecessor.version, pVersion);
    assert.equal(receipt.predecessor.files.length, 4);

    // Verify candidate.json files sort canonically by code points
    for (let i = 1; i < receipt.files.length; i++) {
      assert.ok(releaseContract.compareCodePoints(receipt.files[i - 1].name, receipt.files[i].name) < 0);
    }
    for (let i = 1; i < receipt.predecessor.files.length; i++) {
      assert.ok(releaseContract.compareCodePoints(receipt.predecessor.files[i - 1].name, receipt.predecessor.files[i].name) < 0);
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('runCandidateRelease rejects dirty working tree when requireClean is enabled', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evcrate-runner-dirty-test-'));
  execFileSync('git', ['init', tmpDir]);
  fs.writeFileSync(path.join(tmpDir, 'uncommitted.txt'), 'dirty');
  try {
    await assert.rejects(
      () => runReleaseCandidate.runCandidateRelease({
        cwd: tmpDir,
        runnerTemp: tmpDir,
        outputDir: path.join(tmpDir, 'rc'),
        distReleaseDir: path.join(tmpDir, 'dist'),
        sourceCommit: 'a'.repeat(40),
        branch: 'main',
        requireClean: true
      }),
      /Working directory is dirty: clean checkout required for candidate release/
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('runCandidateRelease handles no-release (false) branch: outputs has_release=false, clears outputDir, cleans mirror', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evcrate-runner-false-test-'));
  const outputDir = path.join(tmpDir, 'release-candidate');
  const distReleaseDir = path.join(tmpDir, 'dist-release');
  const outputFile = path.join(tmpDir, 'github-output.txt');
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim().toLowerCase();

  // Create dummy outputDir to ensure it gets cleaned up on false
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, 'stale.txt'), 'stale');

  try {
    const dummySemanticRelease = async (options, context) => {
      // Assert tokens are stripped from environment
      assert.equal(context.env.GITHUB_TOKEN, undefined);
      assert.equal(context.env.GH_TOKEN, undefined);
      assert.equal(context.env.NPM_TOKEN, undefined);
      assert.equal(context.env.EVCRATE_RELEASE_ASSET_MODE, 'build');
      return false; // simulate no release needed
    };

    const res = await runReleaseCandidate.runCandidateRelease({
      cwd: projectRoot,
      runnerTemp: tmpDir,
      outputDir,
      distReleaseDir,
      githubOutput: outputFile,
      sourceCommit: head,
      branch: 'main',
      requireClean: false,
      semanticReleaseFn: dummySemanticRelease
    });

    assert.equal(res.hasRelease, false);
    assert.equal(res.outputs.has_release, 'false');
    assert.equal(res.outputs.version, '');
    assert.equal(res.outputs.artifact_name, '');

    // Output dir must be absent
    assert.equal(fs.existsSync(outputDir), false);

    // GitHub output was written
    const outputContent = fs.readFileSync(outputFile, 'utf8');
    assert.ok(outputContent.includes('has_release=false'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('runCandidateRelease handles release branch with mock semantic-release: verifies assets, stages candidate, outputs scalars', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evcrate-runner-release-test-'));
  const outputDir = path.join(tmpDir, 'release-candidate');
  const distReleaseDir = path.join(tmpDir, 'dist-release');
  const outputFile = path.join(tmpDir, 'github-output.txt');
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim().toLowerCase();
  const version = '2.2.0';

  try {
    const dummySemanticRelease = async (options, context) => {
      // Create exact-seven assets in distReleaseDir as semantic-release prepare would
      createExactSevenAssets(distReleaseDir, version, head);

      return {
        lastRelease: { version: '2.1.0' },
        nextRelease: {
          version,
          gitTag: `v${version}`,
          gitHead: head,
          notes: 'Release notes'
        }
      };
    };

    const res = await runReleaseCandidate.runCandidateRelease({
      cwd: projectRoot,
      runnerTemp: tmpDir,
      outputDir,
      distReleaseDir,
      githubOutput: outputFile,
      sourceCommit: head,
      workflowRunId: 100,
      workflowRunAttempt: 3,
      requireClean: false,
      semanticReleaseFn: dummySemanticRelease,
      predecessorResolver: async (opts) => {
        const { prepareWindowsPredecessor } = await import('../../scripts/release/prepare-windows-predecessor.mjs');
        return prepareWindowsPredecessor({ ...opts, releases: [] });
      }
    });
    assert.equal(res.hasRelease, true);
    assert.equal(res.outputs.has_release, 'true');
    assert.equal(res.outputs.version, version);
    assert.equal(res.outputs.tag, `v${version}`);
    assert.equal(res.outputs.source_commit, head);
    assert.equal(res.outputs.artifact_name, `release-candidate-100-3-${head}`);
    assert.ok(/^[0-9a-f]{64}$/.test(res.outputs.windows_archive_sha256));
    assert.ok(/^[0-9a-f]{64}$/.test(res.outputs.windows_sidecar_sha256));
    assert.ok(/^[0-9a-f]{64}$/.test(res.outputs.metadata_sha256));
    assert.ok(/^[0-9a-f]{64}$/.test(res.outputs.install_ps1_sha256));

    // Staged artifact exists
    assert.ok(fs.existsSync(path.join(outputDir, 'candidate.json')));
    assert.ok(fs.existsSync(path.join(outputDir, 'assets')));
    assert.ok(fs.existsSync(path.join(outputDir, 'predecessor')));
    assert.ok(fs.existsSync(path.join(outputDir, 'qualification')));

    // GitHub output file contains all 9 values
    const outRaw = fs.readFileSync(outputFile, 'utf8');
    assert.ok(outRaw.includes('has_release=true'));
    assert.ok(outRaw.includes(`version=${version}`));
    assert.ok(outRaw.includes(`artifact_name=release-candidate-100-3-${head}`));
    // Rejection when semanticRelease returns an unrelated gitHead commit
    const unrelatedCommit = 'f'.repeat(40);
    await assert.rejects(
      () => runReleaseCandidate.runCandidateRelease({
        cwd: projectRoot,
        runnerTemp: tmpDir,
        outputDir,
        distReleaseDir,
        githubOutput: outputFile,
        sourceCommit: head,
        workflowRunId: 101,
        workflowRunAttempt: 1,
        requireClean: false,
        semanticReleaseFn: async () => ({
          lastRelease: { version: '2.1.0' },
          nextRelease: {
            version,
            gitTag: `v${version}`,
            gitHead: unrelatedCommit,
            notes: 'Release notes'
          }
        })
      }),
      /Release gitHead "f{40}" does not match captured sourceCommit/
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

});

test('runCandidateRelease cleans mirror when semanticRelease throws an error', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evcrate-runner-error-test-'));
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim().toLowerCase();

  try {
    const throwingSemanticRelease = async () => {
      throw new Error('Simulated semantic-release catastrophic error');
    };

    await assert.rejects(
      () => runReleaseCandidate.runCandidateRelease({
        cwd: projectRoot,
        runnerTemp: tmpDir,
        outputDir: path.join(tmpDir, 'rc'),
        distReleaseDir: path.join(tmpDir, 'dist'),
        sourceCommit: head,
        branch: 'main',
        requireClean: false,
        semanticReleaseFn: throwingSemanticRelease
      }),
      /Simulated semantic-release catastrophic error/
    );

    // Verify no leftover mirror directories under runnerTemp
    const remaining = fs.readdirSync(tmpDir).filter((e) => e.startsWith('evcrate-release-mirror-'));
    assert.equal(remaining.length, 0);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('publish-release validates receipt, verifies assets, copies to dist/release, and enforces verify mode', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evcrate-publish-test-'));
  const candidateDir = path.join(tmpDir, 'release-candidate');
  const distReleaseDir = path.join(tmpDir, 'dist-release');
  const assetsDir = path.join(tmpDir, 'source-assets');
  const predDir = path.join(tmpDir, 'source-predecessor');
  const harnessPath = path.join(projectRoot, 'tests', 'installers', 'windows-release-qualification.mjs');

  const version = '2.2.0';
  const commit = '1'.repeat(40);

  try {
    // Stage candidate
    createExactSevenAssets(assetsDir, version, commit);
    buildWindowsTestReleaseSet({ outputDir: predDir, version: '1.0.0', commit: 'a'.repeat(40) });

    await runReleaseCandidate.stageCandidateArtifact({
      outputDir: candidateDir,
      tempDir: tmpDir,
      distReleaseDir: assetsDir,
      predecessorDir: predDir,
      predecessorInfo: { kind: 'bootstrap-fixture', version: '1.0.0', tag: 'v1.0.0', sourceCommit: 'a'.repeat(40) },
      harnessPath,
      candidateVersion: version,
      sourceCommit: commit,
      repository: 'EigenCrate/evcrate',
      workflowRunId: 77,
      workflowRunAttempt: 1
    });

    const receiptPath = path.join(candidateDir, 'candidate.json');

    // 1. Rejection without EVCRATE_RELEASE_ASSET_MODE=verify
    assert.throws(
      () => publishRelease.parsePublisherOptions(['node', 'publish.js'], {}),
      /EVCRATE_RELEASE_ASSET_MODE must be set to "verify"/
    );
    assert.throws(
      () => publishRelease.parsePublisherOptions(['node', 'publish.js'], { EVCRATE_RELEASE_ASSET_MODE: 'build' }),
      /EVCRATE_RELEASE_ASSET_MODE must be set to "verify"/
    );

    // 2. Receipt verification positive
    const verifiedReceipt = publishRelease.verifyCandidateReceipt(receiptPath, {
      expectedVersion: version,
      expectedTag: `v${version}`,
      expectedSourceCommit: commit,
      expectedRunId: 77,
      expectedRunAttempt: 1
    });
    assert.equal(verifiedReceipt.version, version);

    // 3. Receipt identity mismatches
    assert.throws(
      () => publishRelease.verifyCandidateReceipt(receiptPath, { expectedVersion: '2.3.0' }),
      /Receipt version "2.2.0" does not match expectedVersion "2.3.0"/
    );
    assert.throws(
      () => publishRelease.verifyCandidateReceipt(receiptPath, { expectedSourceCommit: '2'.repeat(40) }),
      /Receipt source_commit/
    );
    assert.throws(
      () => publishRelease.verifyCandidateReceipt(receiptPath, { expectedRunId: 999 }),
      /Receipt workflow_run_id/
    );

    // 4. Asset tampering rejection
    const winZipPath = path.join(candidateDir, 'assets', `evcrate-v${version}-windows-x64.zip`);
    const originalBytes = fs.readFileSync(winZipPath);
    try {
      fs.appendFileSync(winZipPath, Buffer.from('corrupt'));
      assert.throws(
        () => publishRelease.verifyCandidateReceipt(receiptPath, {}),
        /size.*does not match receipt size/
      );
    } finally {
      fs.writeFileSync(winZipPath, originalBytes);
    }
    const github = githubApprovalFixture(verifiedReceipt);

    // 5. Successful publish run with mock semanticRelease
    let modeSeenInPublish = null;
    const mockPublishSemanticRelease = async (cfg, ctx) => {
      modeSeenInPublish = ctx.env.EVCRATE_RELEASE_ASSET_MODE;
      // Assert distReleaseDir contains exact 7 files
      const inDist = fs.readdirSync(distReleaseDir).sort();
      assert.equal(inDist.length, 7);
      return {
        nextRelease: {
          version,
          gitTag: `v${version}`,
          gitHead: commit
        }
      };
    };

    const pubResult = await publishRelease.runPublishRelease({
      receiptPath,
      distReleaseDir,
      runnerTemp: tmpDir,
      env: { EVCRATE_RELEASE_ASSET_MODE: 'verify', GITHUB_TOKEN: 'test-token' },
      fetchFn: github.fetchFn,
      branch: 'main',
      semanticReleaseFn: mockPublishSemanticRelease,
      config: { branches: ['main'], plugins: [] }
    });

    assert.equal(pubResult.success, true);
    assert.equal(pubResult.publishedRelease.version, version);
    assert.equal(modeSeenInPublish, 'verify');

    // 6. Rejection when semanticRelease returns false in publish mode
    await assert.rejects(
      () => publishRelease.runPublishRelease({
        receiptPath,
        distReleaseDir,
        runnerTemp: tmpDir,
        env: { EVCRATE_RELEASE_ASSET_MODE: 'verify', GITHUB_TOKEN: 'test-token' },
        fetchFn: github.fetchFn,
        branch: 'main',
        semanticReleaseFn: async () => false,
        config: { branches: ['main'], plugins: [] }
      }),
      /semantic-release returned false \(no release\) in publish mode/
    );

    // 7. Rejection when semanticRelease returns an unrelated gitHead commit
    await assert.rejects(
      () => publishRelease.runPublishRelease({
        receiptPath,
        distReleaseDir,
        runnerTemp: tmpDir,
        env: { EVCRATE_RELEASE_ASSET_MODE: 'verify', GITHUB_TOKEN: 'test-token' },
        fetchFn: github.fetchFn,
        branch: 'main',
        semanticReleaseFn: async () => ({
          nextRelease: {
            version,
            gitTag: `v${version}`,
            gitHead: 'e'.repeat(40)
          }
        }),
        config: { branches: ['main'], plugins: [] }
      }),
      /Published release gitHead "e{40}" does not match receipt source_commit/
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('CLI entries support -h and --help gracefully', () => {
  const candidateHelp = execFileSync('node', ['scripts/release/run-release-candidate.cjs', '--help'], { encoding: 'utf8' });
  assert.ok(candidateHelp.includes('Usage: node scripts/release/run-release-candidate.cjs'));

  const publishHelp = execFileSync('node', ['scripts/release/publish-release.cjs', '--help'], {
    encoding: 'utf8',
    env: { ...process.env, EVCRATE_RELEASE_ASSET_MODE: 'verify' }
  });
  assert.ok(publishHelp.includes('Usage: node scripts/release/publish-release.cjs'));
});

test('WRQ-042: .github/workflows/windows-smoke.yml enforces read-only PR triggers, Windows 2025 PS7/Node22, and pinned actions', () => {
  const workflowPath = path.join(projectRoot, '.github', 'workflows', 'windows-smoke.yml');
  assert.ok(fs.existsSync(workflowPath), 'windows-smoke.yml must exist');
  const content = fs.readFileSync(workflowPath, 'utf8');

  // Must not contain banned triggers
  assert.match(content, /on:\s*\n\s*pull_request:\s*\n\s*workflow_dispatch:/u);
  assert.doesNotMatch(content, /pull_request_target/u, 'Must not use pull_request_target');
  assert.doesNotMatch(content, /workflow_run/u, 'Must not use workflow_run');
  assert.doesNotMatch(content, /push:/u, 'Must not trigger on push');

  // Top-level permissions: contents: read
  assert.match(content, /permissions:\s*\n\s*contents:\s*read/u);
  assert.doesNotMatch(content, /contents:\s*write/u, 'Must not have contents write permission');
  assert.doesNotMatch(content, /pull-requests:\s*write/u, 'Must not have pull-requests write permission');
  assert.doesNotMatch(content, /issues:\s*write/u, 'Must not have issues write permission');

  // Concurrency with cancel-in-progress: true
  assert.match(content, /concurrency:\s*\n\s*group:\s*windows-smoke-/u);
  assert.match(content, /cancel-in-progress:\s*true/u);

  // Job definition: windows-2025, Node 22.19.0, explicit pwsh.exe
  assert.match(content, /runs-on:\s*windows-2025/u);
  assert.match(content, /node-version:\s*'22\.19\.0'/u);
  assert.match(content, /architecture:\s*x64/u);
  assert.match(content, /--powershell\s+pwsh\.exe/u);

  // Pinned actions with exact SHAs and # v4 comments
  const checkoutPin = 'actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4';
  const setupNodePin = 'actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4';
  assert.ok(content.includes(checkoutPin), `Must use pinned checkout: ${checkoutPin}`);
  assert.ok(content.includes(setupNodePin), `Must use pinned setup-node: ${setupNodePin}`);

  // No secrets or release publication/upload
  assert.doesNotMatch(content, /secrets\./u, 'Must not reference secrets');
  assert.doesNotMatch(content, /upload-artifact/u, 'Must not upload artifacts');
  assert.doesNotMatch(content, /semantic-release/u, 'Must not publish releases');
});

test('WRQ-043: windows-smoke workflow builds fixture identity, verifies exact-seven, and runs smoke harness', () => {
  const workflowPath = path.join(projectRoot, '.github', 'workflows', 'windows-smoke.yml');
  const content = fs.readFileSync(workflowPath, 'utf8');

  // Requires --allow-fixture-identity with checked-in version and commit
  assert.match(content, /scripts\/prepare-release-assets\.cjs[\s\S]*?--allow-fixture-identity/u);
  assert.match(content, /scripts\/release\/asset-verification\.cjs[\s\S]*?--set\s+release/u);
  assert.match(content, /tests\/installers\/windows-release-qualification\.mjs[\s\S]*?--mode\s+smoke/u);

  // Rejects invalid commit SHA pattern
  assert.match(content, /\^\[a-f0-9\]\{40\}\$/u);
});

test('WRQ-044: .releaserc.json replaces deferred labels with exact post-qualification labels', () => {
  const configPath = path.join(projectRoot, '.releaserc.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

  const githubPlugin = config.plugins.find((p) => Array.isArray(p) && p[0] === '@semantic-release/github');
  assert.ok(githubPlugin, 'GitHub plugin must be configured in .releaserc.json');
  const assets = githubPlugin[1].assets;

  const winZipAsset = assets.find((a) => a.path === 'dist/release/evcrate-*-windows-x64.zip');
  assert.ok(winZipAsset, 'Windows zip asset must exist in .releaserc.json');
  assert.equal(winZipAsset.label, 'Windows x64 Archive');

  const winPs1Asset = assets.find((a) => a.path === 'dist/release/install.ps1');
  assert.ok(winPs1Asset, 'Windows install.ps1 asset must exist in .releaserc.json');
  assert.equal(winPs1Asset.label, 'Windows Installer Entrypoint (install.ps1)');

  // Verify other assets remain intact with canonical labels
  const linuxTarAsset = assets.find((a) => a.path === 'dist/release/evcrate-*-linux-x64.tar.gz');
  assert.equal(linuxTarAsset.label, 'Linux x64 Archive');

  const linuxSidecarAsset = assets.find((a) => a.path === 'dist/release/evcrate-*-linux-x64.tar.gz.sha256');
  assert.equal(linuxSidecarAsset.label, 'Linux x64 SHA-256 Sidecar');

  const winSidecarAsset = assets.find((a) => a.path === 'dist/release/evcrate-*-windows-x64.zip.sha256');
  assert.equal(winSidecarAsset.label, 'Windows x64 SHA-256 Sidecar');

  const metaAsset = assets.find((a) => a.path === 'dist/release/evcrate-*.release.json');
  assert.equal(metaAsset.label, 'Release Metadata');

  const linuxShAsset = assets.find((a) => a.path === 'dist/release/install.sh');
  assert.equal(linuxShAsset.label, 'Linux Installer Entrypoint (install.sh)');

  const changelogAsset = assets.find((a) => a.path === 'CHANGELOG.md');
  assert.equal(changelogAsset.label, 'Changelog');
});

test('releaseContract.isValidReleaseCommitOrSource enforces strict release commit lineage and rejects merge/unrelated/malformed commits', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evcrate-lineage-test-'));
  try {
    execFileSync('git', ['init', tmpDir]);
    execFileSync('git', ['-C', tmpDir, 'config', 'user.name', 'Tester']);
    execFileSync('git', ['-C', tmpDir, 'config', 'user.email', 'tester@example.com']);

    // Base commit (sourceCommit)
    fs.writeFileSync(path.join(tmpDir, 'README.md'), '# Base');
    execFileSync('git', ['-C', tmpDir, 'add', '.']);
    execFileSync('git', ['-C', tmpDir, 'commit', '-m', 'chore: base']);
    const sourceCommit = execFileSync('git', ['-C', tmpDir, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim().toLowerCase();

    // 1. Source commit equality
    assert.equal(releaseContract.isValidReleaseCommitOrSource(sourceCommit, sourceCommit, '2.2.0', tmpDir), true);

    // 2. Valid single-parent release child
    fs.writeFileSync(path.join(tmpDir, 'package.json'), '{}');
    execFileSync('git', ['-C', tmpDir, 'add', 'package.json']);
    execFileSync('git', ['-C', tmpDir, 'commit', '-m', 'chore(release): 2.2.0 [skip ci]\n\nRelease notes']);
    const releaseChild = execFileSync('git', ['-C', tmpDir, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim().toLowerCase();
    assert.equal(releaseContract.isValidReleaseCommitOrSource(releaseChild, sourceCommit, '2.2.0', tmpDir), true);

    // 3. Unrelated direct child (different message or non-release file)
    execFileSync('git', ['-C', tmpDir, 'checkout', sourceCommit], { stdio: 'pipe' });
    execFileSync('git', ['-C', tmpDir, 'checkout', '-b', 'unrelated-branch'], { stdio: 'pipe' });
    fs.writeFileSync(path.join(tmpDir, 'feature.txt'), 'feature');
    execFileSync('git', ['-C', tmpDir, 'add', 'feature.txt']);
    execFileSync('git', ['-C', tmpDir, 'commit', '-m', 'feat: ordinary feature']);
    const unrelatedChild = execFileSync('git', ['-C', tmpDir, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim().toLowerCase();
    assert.equal(releaseContract.isValidReleaseCommitOrSource(unrelatedChild, sourceCommit, '2.2.0', tmpDir), false);

    // 4. Non-child commit
    assert.equal(releaseContract.isValidReleaseCommitOrSource('f'.repeat(40), sourceCommit, '2.2.0', tmpDir), false);

    // 5. Merge commit (2 parents)
    execFileSync('git', ['-C', tmpDir, 'checkout', releaseChild], { stdio: 'pipe' });
    execFileSync('git', ['-C', tmpDir, 'merge', '--no-ff', '-m', 'chore(release): 2.2.0 [skip ci]', unrelatedChild], { stdio: 'pipe' });
    const mergeCommit = execFileSync('git', ['-C', tmpDir, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim().toLowerCase();
    assert.equal(releaseContract.isValidReleaseCommitOrSource(mergeCommit, sourceCommit, '2.2.0', tmpDir), false);

    // 6. Malformed and empty values
    assert.equal(releaseContract.isValidReleaseCommitOrSource('not-a-sha', sourceCommit, '2.2.0', tmpDir), false);
    assert.equal(releaseContract.isValidReleaseCommitOrSource('', sourceCommit, '2.2.0', tmpDir), false);
    assert.equal(releaseContract.isValidReleaseCommitOrSource(null, sourceCommit, '2.2.0', tmpDir), false);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});


test('Phase 10: createLocalReleaseMirror seeds main and next refs and fails closed if main is missing', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evcrate-mirror-test-dual-'));
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim().toLowerCase();

  try {
    // 1. Dual branch seeding when triggering from next
    const mirror = runReleaseCandidate.createLocalReleaseMirror({
      cwd: projectRoot,
      tempDir: tmpDir,
      branch: 'next',
      sourceCommit: head,
      configuredBranches: ['main', { name: 'next', channel: 'next', prerelease: 'rc' }]
    });

    assert.ok(fs.existsSync(mirror.mirrorPath));
    const mirrorNext = execFileSync('git', ['rev-parse', 'refs/heads/next'], {
      cwd: mirror.mirrorPath,
      encoding: 'utf8'
    }).trim().toLowerCase();
    assert.equal(mirrorNext, head);

    const mirrorMain = execFileSync('git', ['rev-parse', 'refs/heads/main'], {
      cwd: mirror.mirrorPath,
      encoding: 'utf8'
    }).trim().toLowerCase();
    assert.ok(/^[0-9a-f]{40}$/.test(mirrorMain));

    const symbolicHead = execFileSync('git', ['--git-dir', mirror.mirrorPath, 'symbolic-ref', 'HEAD'], {
      encoding: 'utf8'
    }).trim();
    assert.equal(symbolicHead, 'refs/heads/next');
    mirror.cleanup();

    // 2. Fail closed when main is missing in repository
    const emptyRepoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evcrate-empty-repo-'));
    try {
      execFileSync('git', ['-c', 'init.defaultBranch=feature', 'init', emptyRepoDir]);
      execFileSync('git', ['-C', emptyRepoDir, 'config', 'user.name', 'Tester']);
      execFileSync('git', ['-C', emptyRepoDir, 'config', 'user.email', 'tester@example.com']);
      fs.writeFileSync(path.join(emptyRepoDir, 'dummy.txt'), 'hello');
      execFileSync('git', ['-C', emptyRepoDir, 'add', '.']);
      execFileSync('git', ['-C', emptyRepoDir, 'commit', '-m', 'chore: dummy']);
      const dummyHead = execFileSync('git', ['-C', emptyRepoDir, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim().toLowerCase();

      assert.throws(
        () => runReleaseCandidate.createLocalReleaseMirror({
          cwd: emptyRepoDir,
          tempDir: tmpDir,
          branch: 'feature',
          sourceCommit: dummyHead,
          configuredBranches: ['main', 'feature']
        }),
        /createLocalReleaseMirror requires verified "main" ref in repository to seed canonical release topology/
      );
    } finally {
      fs.rmSync(emptyRepoDir, { recursive: true, force: true });
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('stable publication requires a candidate-bound independent GitHub review before invoking the publisher', async (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evcrate-pub-approval-test-'));
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
  const version = '3.0.0';
  const commit = '7'.repeat(40);
  const receiptPath = path.join(tmpDir, 'candidate.json');
  const distReleaseDir = path.join(tmpDir, 'dist-release');
  const assetsDir = path.join(tmpDir, 'assets');
  const verifiedSummary = createExactSevenAssets(assetsDir, version, commit);
  const candidateReceipt = {
    schema: 'evcrate-release-candidate/v1', repository: 'EigenCrate/evcrate',
    version, tag: `v${version}`, source_commit: commit,
    workflow_run_id: 101, workflow_run_attempt: 1, files: verifiedSummary.files
  };
  fs.writeFileSync(receiptPath, JSON.stringify(candidateReceipt));
  let publishCalls = 0;
  const options = {
    receiptPath, distReleaseDir, runnerTemp: tmpDir,
    env: { EVCRATE_RELEASE_ASSET_MODE: 'verify', GITHUB_TOKEN: 'test-token' },
    branch: 'main',
    semanticReleaseFn: async () => {
      publishCalls += 1;
      return { nextRelease: { version, gitTag: `v${version}`, gitHead: commit } };
    },
    config: { branches: ['main', { name: 'next', channel: 'next', prerelease: 'rc' }], plugins: [] }
  };
  const environmentPath = '/environments/production';
  const branchPath = `${environmentPath}/deployment-branch-policies?per_page=100`;
  const permissionPath = '/collaborators/release-maintainer/permission';
  const cases = [
    ['missing environment', (r) => { r[environmentPath] = new Response('{}', { status: 404 }); }, /HTTP 404/],
    ['unprotected environment', (r) => { r[environmentPath].protection_rules = []; }, /protection rules/],
    ['admin bypass', (r) => { r[environmentPath].can_admins_bypass = true; }, /disable admin bypass/],
    ['unspecified admin bypass', (r) => { delete r[environmentPath].can_admins_bypass; }, /disable admin bypass/],
    ['self-review allowed', (r) => { r[environmentPath].protection_rules[0].prevent_self_review = false; }, /prevent_self_review/],
    ['no configured reviewers', (r) => { r[environmentPath].protection_rules[0].reviewers = []; }, /User reviewers/],
    ['team rule', (r) => { r[environmentPath].protection_rules[0].reviewers[0].type = 'Team'; }, /User reviewers/],
    ['unsupported protection', (r) => { r[environmentPath].protection_rules.push({ type: 'custom' }); }, /unsupported protection/],
    ['unrestricted branches', (r) => { r[environmentPath].deployment_branch_policy = null; }, /restrict selected branches/],
    ['wildcard branch', (r) => { r[branchPath].branch_policies[0].name = '*'; }, /only the main branch/],
    ['missing branch policy id', (r) => { delete r[branchPath].branch_policies[0].id; }, /only the main branch/],
    ['invalid branch policy node_id', (r) => { r[branchPath].branch_policies[0].node_id = ''; }, /only the main branch/],
    ['main tag instead of branch', (r) => { r[branchPath].branch_policies[0].type = 'tag'; }, /only the main branch/],
    ['additional branch', (r) => { r[branchPath].total_count = 2; r[branchPath].branch_policies.push({ id: 62566639, name: 'next' }); }, /only the main branch/],
    ['wrong run', (r, p) => { r[p].id += 1; }, /does not match candidate/],
    ['wrong commit', (r, p) => { r[p].head_sha = '8'.repeat(40); }, /does not match candidate/],
    ['wrong attempt', (r, p) => { r[p].run_attempt = 2; }, /does not match candidate/],
    ['wrong branch', (r, p) => { r[p].head_branch = 'next'; }, /does not match candidate/],
    ['wrong workflow', (r, p) => { r[p].path = '.github/workflows/other.yml'; }, /does not match candidate/],
    ['wrong repository', (r, p) => { r[p].repository.full_name = 'attacker/evcrate'; }, /does not match candidate/],
    ['fork source', (r, p) => { r[p].head_repository.full_name = 'attacker/evcrate'; }, /does not match candidate/],
    ['missing actor', (r, p) => { delete r[p].triggering_actor; }, /actor identities/],
    ['wrong environment id', (r, p) => { r[`${p}/approvals`][0].environments = [{ id: 999, name: 'production' }]; }, /mismatched environment/],
    ['wrong environment name', (r, p) => { r[`${p}/approvals`][0].environments = [{ id: 23939029728, name: 'prerelease' }]; }, /mismatched environment/],
    ['unrelated environment', (r, p) => { r[`${p}/approvals`][0].environments = [{ id: 999, name: 'prerelease' }]; }, /review is absent/],
    ['no review', (r, p) => { r[`${p}/approvals`] = []; }, /review is absent/],
    ['rejected review', (r, p) => { r[`${p}/approvals`][0].state = 'rejected'; }, /rejected/],
    ['pending review', (r, p) => { r[`${p}/approvals`][0].state = 'pending'; }, /pending/],
    ['rejection alongside approval', (r, p) => { r[`${p}/approvals`].push({ ...r[`${p}/approvals`][0], state: 'rejected' }); }, /rejected/],
    ['unconfigured reviewer', (r, p) => { r[`${p}/approvals`][0].user = { id: 55, login: 'outsider', type: 'User' }; }, /configured independent User/],
    ['bot reviewer', (r, p) => { r[`${p}/approvals`][0].user = { id: 40543421, login: 'release-maintainer', type: 'Bot' }; }, /configured independent User/],
    ['run actor reviewer', (r, p) => { r[p].actor = { ...r[`${p}/approvals`][0].user }; }, /not the run actor/],
    ['triggering actor reviewer', (r, p) => { r[p].triggering_actor = { ...r[`${p}/approvals`][0].user }; }, /not the run actor/],
    ['write-only reviewer', (r) => { r[permissionPath].role_name = 'write'; }, /maintain or admin/],
    ['missing collaborator', (r) => { r[permissionPath] = new Response('{}', { status: 404 }); }, /HTTP 404/],
    ['wrong collaborator identity', (r) => { r[permissionPath].user = { id: 55, login: 'release-maintainer', type: 'User' }; }, /maintain or admin/],
    ['bot collaborator', (r) => { r[permissionPath].user = { id: 40543421, login: 'release-maintainer', type: 'Bot' }; }, /maintain or admin/],
    ['incomplete history', (r, p) => { r[`${p}/approvals`] = Response.json(r[`${p}/approvals`], { headers: { link: '<https://api.github.com/next>; rel="next"' } }); }, /complete, unpaginated/],
    ['redirect response', (r, p) => { r[p] = new Response(null, { status: 302, headers: { location: 'https://attacker.invalid' } }); }, /HTTP 302/],
    ['oversized body', (r, p) => { r[p] = new Response('x'.repeat(1024 * 1024 + 1)); }, /size limit/],
    ['oversized declared body', (r, p) => { r[p] = new Response('{}', { headers: { 'content-length': String(1024 * 1024 + 1) } }); }, /size limit/],
    ['invalid JSON', (r, p) => { r[p] = new Response('not JSON'); }, /JSON/]
  ];
  for (const [name, mutate, error] of cases) {
    await t.test(name, async () => {
      const github = githubApprovalFixture(candidateReceipt);
      mutate(github.responses, github.runPath);
      await assert.rejects(() => publishRelease.runPublishRelease({ ...options, fetchFn: github.fetchFn }), error);
      assert.equal(publishCalls, 0);
      assert.equal(fs.existsSync(distReleaseDir), false, 'authorization must precede workspace publication');
    });
  }

  await t.test('forged local approval cannot authorize a stable candidate', async () => {
    const approvalPath = path.join(tmpDir, 'approval.json');
    fs.writeFileSync(approvalPath, JSON.stringify({
      status: 'approved', approved_by: 'release-maintainer', approved_at: '2026-10-09T18:00:00Z',
      ...candidateReceipt
    }));
    const github = githubApprovalFixture(candidateReceipt);
    github.responses[`${github.runPath}/approvals`] = [];
    await assert.rejects(() => publishRelease.runPublishRelease({
      ...options, approvalPath, requireStableApproval: false, fetchFn: github.fetchFn,
      env: { ...options.env, EVCRATE_STABLE_APPROVAL_PATH: approvalPath, EVCRATE_REQUIRE_APPROVAL: 'false' }
    }), /review is absent/);
    await assert.rejects(() => publishRelease.runPublishRelease({ ...options, approvalPath, env: {} }), /requires a GitHub token/);
    assert.throws(() => publishRelease.parsePublisherOptions(
      ['node', 'publish-release.cjs', '--approval', approvalPath], options.env
    ), /Unknown publisher option/);
    assert.equal(publishCalls, 0);
  });

  await t.test('reruns cannot reuse attempt-one approval', async () => {
    const rerun = { ...candidateReceipt, workflow_run_attempt: 2 };
    fs.writeFileSync(receiptPath, JSON.stringify(rerun));
    const github = githubApprovalFixture(rerun);
    await assert.rejects(() => publishRelease.runPublishRelease({ ...options, fetchFn: github.fetchFn }), /start a new workflow run/);
    assert.equal(publishCalls, 0);
    fs.writeFileSync(receiptPath, JSON.stringify(candidateReceipt));
  });

  await t.test('candidate repository cannot redirect the issuer', async () => {
    fs.writeFileSync(receiptPath, JSON.stringify({ ...candidateReceipt, repository: 'attacker/evcrate' }));
    const github = githubApprovalFixture(candidateReceipt);
    await assert.rejects(() => publishRelease.runPublishRelease({ ...options, fetchFn: github.fetchFn }), /canonical repository/);
    assert.equal(github.calls.length, 0);
    fs.writeFileSync(receiptPath, JSON.stringify(candidateReceipt));
  });

  await t.test('authorized exact candidate proceeds and records the actual reviewer and API', async () => {
    const github = githubApprovalFixture(candidateReceipt);
    const result = await publishRelease.runPublishRelease({
      ...options, fetchFn: github.fetchFn,
      env: { ...options.env, GITHUB_REPOSITORY: 'attacker/evcrate', GITHUB_API_URL: 'https://attacker.invalid' }
    });
    assert.equal(publishCalls, 1);
    assert.equal(result.success, true);
    assert.equal(result.approval.approved_by, 'release-maintainer');
    assert.deepEqual(result.approval.reviewer, { id: 40543421, login: 'release-maintainer', type: 'User' });
    assert.equal(result.approval.source_api, 'https://api.github.com/repos/EigenCrate/evcrate/actions/runs/101/approvals');
    assert.equal(Object.hasOwn(result.approval, 'approved_at'), false);
    assert.equal(result.approval.source_commit, commit);
    assert.equal(result.approval.workflow_run_attempt, 1);
    assert.deepEqual(result.receipt, candidateReceipt);
  });

  await t.test('admin reviewer, explicit branch type, and GH_TOKEN are supported', async () => {
    const github = githubApprovalFixture(candidateReceipt);
    github.responses[branchPath].branch_policies[0].type = 'branch';
    github.responses[permissionPath].role_name = 'admin';
    github.responses[permissionPath].permission = 'admin';
    const result = await publishRelease.runPublishRelease({ ...options, env: { GH_TOKEN: 'test-token' }, fetchFn: github.fetchFn });
    assert.equal(result.success, true);
    assert.equal(publishCalls, 2);
  });

  await assert.rejects(() => publishRelease.runPublishRelease({ ...options, branch: 'next' }), /Topology violation/);
  const rcVersion = '3.0.0-rc.1';
  const rcAssetsDir = path.join(tmpDir, 'rc-assets');
  const rcSummary = createExactSevenAssets(rcAssetsDir, rcVersion, commit);
  const rcCandidate = { ...candidateReceipt, version: rcVersion, tag: `v${rcVersion}`, files: rcSummary.files };
  fs.writeFileSync(receiptPath, JSON.stringify(rcCandidate));
  await assert.rejects(() => publishRelease.runPublishRelease({ ...options, assetsDir: rcAssetsDir }), /Topology violation/);
  const prerelease = await publishRelease.runPublishRelease({
    ...options, branch: 'next', assetsDir: rcAssetsDir, env: {},
    fetchFn: async () => assert.fail('prerelease must not require a production review'),
    semanticReleaseFn: async () => ({ nextRelease: { version: rcVersion, gitTag: `v${rcVersion}`, gitHead: commit } })
  });
  assert.equal(prerelease.success, true);
  assert.equal(prerelease.approval, null);
});

test('Phase 10: real semantic-release dry-run predicts 3.0.0-rc.1 on next and 3.0.0 on merged main', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evcrate-sr-dryrun-'));
  const srModule = require('semantic-release');
  const semanticRelease = typeof srModule === 'function' ? srModule : srModule.default;
  const { pathToFileURL } = require('node:url');

  try {
    const repoDir = path.join(tmpDir, 'repo');
    fs.mkdirSync(repoDir);
    execFileSync('git', ['init', repoDir]);
    execFileSync('git', ['-C', repoDir, 'config', 'user.name', 'Tester']);
    execFileSync('git', ['-C', repoDir, 'config', 'user.email', 'tester@example.com']);
    execFileSync('git', ['-C', repoDir, 'checkout', '-b', 'main']);

    // Seed v2.9.1 baseline commit and tag
    fs.writeFileSync(path.join(repoDir, 'package.json'), JSON.stringify({ name: 'test-pkg', version: '2.9.1' }, null, 2));
    execFileSync('git', ['-C', repoDir, 'add', '.']);
    execFileSync('git', ['-C', repoDir, 'commit', '-m', 'chore: release 2.9.1']);
    execFileSync('git', ['-C', repoDir, 'tag', 'v2.9.1']);

    // Create next branch with breaking change commit
    execFileSync('git', ['-C', repoDir, 'checkout', '-b', 'next']);
    fs.writeFileSync(path.join(repoDir, 'feature.txt'), 'unified naming');
    execFileSync('git', ['-C', repoDir, 'add', '.']);
    execFileSync('git', ['-C', repoDir, 'commit', '-m', 'feat(naming)!: unified command and agent naming across all harnesses\n\nBREAKING CHANGE: all command and agent identities unified']);

    const bareRemote = path.join(tmpDir, 'remote.git');
    execFileSync('git', ['init', '--bare', bareRemote]);
    const remoteUrl = pathToFileURL(bareRemote).href;
    execFileSync('git', ['-C', repoDir, 'push', remoteUrl, 'main:refs/heads/main', 'next:refs/heads/next', '--tags']);

    const branchesConfig = [
      'main',
      { name: 'next', channel: 'next', prerelease: 'rc' }
    ];

    // 1. Dry run on next branch: must predict 3.0.0-rc.1
    const nextResult = await semanticRelease({
      branches: branchesConfig,
      repositoryUrl: remoteUrl,
      dryRun: true,
      ci: false,
      plugins: [
        '@semantic-release/commit-analyzer'
      ]
    }, {
      cwd: repoDir,
      env: { ...process.env, CI: 'false' },
      stdout: new (require('node:stream').Writable)({ write(c, e, cb) { cb(); } }),
      stderr: new (require('node:stream').Writable)({ write(c, e, cb) { cb(); } })
    });

    assert.ok(nextResult, 'semantic-release must calculate a release on next');
    assert.equal(nextResult.nextRelease.version, '3.0.0-rc.1');
    assert.equal(nextResult.nextRelease.channel, 'next');

    // 2. Merge next into main: dry run on main must predict 3.0.0
    execFileSync('git', ['-C', repoDir, 'checkout', 'main']);
    execFileSync('git', ['-C', repoDir, 'merge', '--no-ff', '-m', 'merge next into main', 'next']);
    execFileSync('git', ['-C', repoDir, 'push', remoteUrl, 'main:refs/heads/main']);

    const mainResult = await semanticRelease({
      branches: branchesConfig,
      repositoryUrl: remoteUrl,
      dryRun: true,
      ci: false,
      plugins: [
        '@semantic-release/commit-analyzer'
      ]
    }, {
      cwd: repoDir,
      env: { ...process.env, CI: 'false' },
      stdout: new (require('node:stream').Writable)({ write(c, e, cb) { cb(); } }),
      stderr: new (require('node:stream').Writable)({ write(c, e, cb) { cb(); } })
    });

    assert.ok(mainResult, 'semantic-release must calculate a release on main');
    assert.equal(mainResult.nextRelease.version, '3.0.0');
    assert.equal(mainResult.nextRelease.channel, null);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
