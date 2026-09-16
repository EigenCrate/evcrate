import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const assetVerification = require('./asset-verification.cjs');

import {
  BOOTSTRAP_VERSION,
  BOOTSTRAP_TAG,
  BOOTSTRAP_COMMIT,
  BOOTSTRAP_KIND,
  fetchAllReleases,
  resolvePredecessorPlan
} from './predecessor-resolver-core.mjs';
import { downloadAndVerifyQualifiedPredecessor } from './predecessor-downloader.mjs';
import { buildWindowsTestReleaseSet } from '../../tests/installers/fixtures/windows-release-fixture.mjs';


export async function prepareWindowsPredecessor(options = {}) {
  const {
    candidateVersion,
    outputDir,
    repository = process.env.GITHUB_REPOSITORY || 'EigenCrate/evcrate',
    githubToken = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || null,
    apiUrl = process.env.GITHUB_API_URL || 'https://api.github.com',
    releases = null,
    fetchFn = fetch,
    downloadFn = null,
    bootstrapBuilder = buildWindowsTestReleaseSet,
    verifyFn = assetVerification.verifyWindowsAssetSet
  } = options;

  if (!candidateVersion) throw new Error('candidateVersion is required');
  if (!outputDir) throw new Error('outputDir is required');

  const resolvedReleases = releases != null
    ? releases
    : await fetchAllReleases({ repository, githubToken, apiUrl, fetchFn });

  const plan = resolvePredecessorPlan({
    releases: resolvedReleases,
    candidateVersion
  });

  if (plan.mode === 'bootstrap') {
    fs.mkdirSync(outputDir, { recursive: true });
    bootstrapBuilder({
      outputDir,
      version: BOOTSTRAP_VERSION,
      commit: BOOTSTRAP_COMMIT
    });

    const verified = verifyFn({
      dir: outputDir,
      version: BOOTSTRAP_VERSION,
      tag: BOOTSTRAP_TAG,
      sourceCommit: BOOTSTRAP_COMMIT
    });

    return {
      kind: BOOTSTRAP_KIND,
      version: BOOTSTRAP_VERSION,
      tag: BOOTSTRAP_TAG,
      sourceCommit: BOOTSTRAP_COMMIT,
      files: verified.files,
      directory: path.resolve(outputDir)
    };
  }

  // mode: 'qualified'
  const qualifiedResult = await downloadAndVerifyQualifiedPredecessor(plan, {
    outputDir,
    githubToken,
    fetchFn,
    verifyFn,
    downloadFn
  });

  return {
    ...qualifiedResult,
    directory: path.resolve(outputDir)
  };
}

export function parsePredecessorArgs(argv) {
  const args = Array.isArray(argv) ? argv : [];
  let candidateVersion = null;
  let outputDir = null;
  let repository = null;
  let githubToken = null;
  let apiUrl = null;
  let json = false;

  let i = 0;
  if (args.length >= 2 && args[0].includes('node') && args[1].endsWith('.mjs')) i = 2;

  for (; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--version' || arg === '--candidate-version') {
      candidateVersion = args[++i];
    } else if (arg.startsWith('--version=')) {
      candidateVersion = arg.slice(10);
    } else if (arg.startsWith('--candidate-version=')) {
      candidateVersion = arg.slice(20);
    } else if (arg === '--output-dir' || arg === '--output' || arg === '--destination') {
      outputDir = args[++i];
    } else if (arg.startsWith('--output-dir=')) {
      outputDir = arg.slice(13);
    } else if (arg.startsWith('--output=')) {
      outputDir = arg.slice(9);
    } else if (arg === '--repository' || arg === '--repo') {
      repository = args[++i];
    } else if (arg.startsWith('--repository=')) {
      repository = arg.slice(13);
    } else if (arg === '--github-token' || arg === '--token') {
      githubToken = args[++i];
    } else if (arg.startsWith('--token=')) {
      githubToken = arg.slice(8);
    } else if (arg === '--api-url') {
      apiUrl = args[++i];
    } else if (arg.startsWith('--api-url=')) {
      apiUrl = arg.slice(10);
    } else if (arg === '--json') {
      json = true;
    } else if (arg === '--help' || arg === '-h') {
      // help flag
    } else {
      throw new Error(`Unknown argument: "${arg}"`);
    }
  }

  return { candidateVersion, outputDir, repository, githubToken, apiUrl, json };
}

export async function main(argv = process.argv, env = process.env) {
  const parsed = parsePredecessorArgs(argv.slice(2));
  const candidateVersion = parsed.candidateVersion || env.CANDIDATE_VERSION;
  const outputDir = parsed.outputDir || env.PREDECESSOR_OUTPUT_DIR;
  const repository = parsed.repository || env.GITHUB_REPOSITORY || 'EigenCrate/evcrate';
  const githubToken = parsed.githubToken || env.GITHUB_TOKEN || env.GH_TOKEN || null;
  const apiUrl = parsed.apiUrl || env.GITHUB_API_URL || 'https://api.github.com';

  const result = await prepareWindowsPredecessor({
    candidateVersion,
    outputDir,
    repository,
    githubToken,
    apiUrl
  });

  if (parsed.json) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } else {
    console.log(`✓ Predecessor prepared (${result.kind}): ${result.tag} (${result.files.length} files in ${result.directory})`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(`✗ Failed to prepare Windows predecessor: ${err.message}`);
    process.exit(1);
  });
}
