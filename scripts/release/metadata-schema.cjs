'use strict';

const { compareCodePoints } = require('./canonical-json.cjs');

const SCHEMA_ID = 'evcrate-private-release/v1';
const PLATFORM_LINUX_X64 = 'linux-x64';
const PLATFORM_WINDOWS_X64 = 'windows-x64';
const SUPPORTED_PLATFORMS = Object.freeze([PLATFORM_LINUX_X64, PLATFORM_WINDOWS_X64]);
const STANDALONE_INSTALLERS = Object.freeze(['install.sh', 'install.ps1']);

const HEX_64 = /^[a-f0-9]{64}$/u;
const COMMIT_SHA = /^[a-f0-9]{40}$/u;
const SEMVER = /^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?$/u;

const METADATA_EXACT_KEYS = Object.freeze([
  'schema',
  'version',
  'tag',
  'source_commit',
  'node_floor',
  'inventory_digest',
  'build_manifest_digests',
  'controller_closure_digest',
  'platforms',
  'installers',
  'mutable_paths'
]);

function linuxArchiveName(version) {
  if (!SEMVER.test(version)) {
    throw new Error(`Invalid semver version: ${version}`);
  }
  return `evcrate-v${version}-linux-x64.tar.gz`;
}

function windowsArchiveName(version) {
  if (!SEMVER.test(version)) {
    throw new Error(`Invalid semver version: ${version}`);
  }
  return `evcrate-v${version}-windows-x64.zip`;
}

function releaseMetadataName(version) {
  if (!SEMVER.test(version)) {
    throw new Error(`Invalid semver version: ${version}`);
  }
  return `evcrate-v${version}.release.json`;
}

function validateReleaseMetadata(data, mutablePathsExpected) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Release metadata must be a non-null object');
  }

  const keys = Object.keys(data).sort(compareCodePoints);
  const expectedKeys = [...METADATA_EXACT_KEYS].sort(compareCodePoints);

  if (keys.length !== expectedKeys.length || keys.some((k, i) => k !== expectedKeys[i])) {
    const extra = keys.filter((k) => !expectedKeys.includes(k));
    const missing = expectedKeys.filter((k) => !keys.includes(k));
    throw new Error(`Release metadata keys mismatch. Extra: [${extra.join(', ')}], Missing: [${missing.join(', ')}]`);
  }

  if (data.schema !== SCHEMA_ID) {
    throw new Error(`Invalid schema: ${data.schema}, expected: ${SCHEMA_ID}`);
  }
  if (!SEMVER.test(data.version)) {
    throw new Error(`Invalid semver version: ${data.version}`);
  }
  if (data.tag !== `v${data.version}`) {
    throw new Error(`Tag "${data.tag}" does not match version "v${data.version}"`);
  }
  if (!COMMIT_SHA.test(data.source_commit)) {
    throw new Error(`Invalid source_commit (must be 40-hex lowercase): ${data.source_commit}`);
  }
  if (typeof data.node_floor !== 'string' || data.node_floor.length === 0) {
    throw new Error(`Invalid node_floor: ${data.node_floor}`);
  }
  if (!HEX_64.test(data.inventory_digest)) {
    throw new Error(`Invalid inventory_digest: ${data.inventory_digest}`);
  }
  if (!data.build_manifest_digests || typeof data.build_manifest_digests !== 'object') {
    throw new Error('build_manifest_digests must be an object');
  }
  for (const [target, digest] of Object.entries(data.build_manifest_digests)) {
    if (!HEX_64.test(digest)) {
      throw new Error(`Invalid build manifest digest for target "${target}": ${digest}`);
    }
  }
  if (!HEX_64.test(data.controller_closure_digest)) {
    throw new Error(`Invalid controller_closure_digest: ${data.controller_closure_digest}`);
  }

  if (!data.platforms || typeof data.platforms !== 'object') {
    throw new Error('platforms must be an object');
  }
  const platformKeys = Object.keys(data.platforms).sort();
  if (platformKeys.length !== 2 || platformKeys[0] !== 'linux-x64' || platformKeys[1] !== 'windows-x64') {
    throw new Error(`platforms must contain exactly linux-x64 and windows-x64, got: [${platformKeys.join(', ')}]`);
  }
  for (const p of SUPPORTED_PLATFORMS) {
    const entry = data.platforms[p];
    if (!entry || typeof entry !== 'object') {
      throw new Error(`Platform entry for ${p} must be an object`);
    }
    const pKeys = Object.keys(entry).sort();
    if (pKeys.length !== 3 || pKeys[0] !== 'archive_name' || pKeys[1] !== 'sha256' || pKeys[2] !== 'size') {
      throw new Error(`Platform ${p} keys must be archive_name, sha256, size; got: [${pKeys.join(', ')}]`);
    }
    if (!HEX_64.test(entry.sha256)) {
      throw new Error(`Platform ${p} sha256 invalid: ${entry.sha256}`);
    }
    if (typeof entry.size !== 'number' || entry.size <= 0 || !Number.isInteger(entry.size)) {
      throw new Error(`Platform ${p} size must be a positive integer: ${entry.size}`);
    }
    if (p === PLATFORM_LINUX_X64 && entry.archive_name !== linuxArchiveName(data.version)) {
      throw new Error(`Linux archive name mismatch: ${entry.archive_name} vs ${linuxArchiveName(data.version)}`);
    }
    if (p === PLATFORM_WINDOWS_X64 && entry.archive_name !== windowsArchiveName(data.version)) {
      throw new Error(`Windows archive name mismatch: ${entry.archive_name} vs ${windowsArchiveName(data.version)}`);
    }
  }

  if (!data.installers || typeof data.installers !== 'object') {
    throw new Error('installers must be an object');
  }
  const installerKeys = Object.keys(data.installers).sort();
  if (installerKeys.length !== 2 || installerKeys[0] !== 'install.ps1' || installerKeys[1] !== 'install.sh') {
    throw new Error(`installers must contain exactly install.ps1 and install.sh, got: [${installerKeys.join(', ')}]`);
  }
  for (const inst of STANDALONE_INSTALLERS) {
    const entry = data.installers[inst];
    if (!entry || typeof entry !== 'object') {
      throw new Error(`Installer entry for ${inst} must be an object`);
    }
    const iKeys = Object.keys(entry).sort();
    if (iKeys.length !== 3 || iKeys[0] !== 'name' || iKeys[1] !== 'sha256' || iKeys[2] !== 'size') {
      throw new Error(`Installer ${inst} keys must be name, sha256, size; got: [${iKeys.join(', ')}]`);
    }
    if (entry.name !== inst) {
      throw new Error(`Installer name mismatch: ${entry.name} vs ${inst}`);
    }
    if (!HEX_64.test(entry.sha256)) {
      throw new Error(`Installer ${inst} sha256 invalid: ${entry.sha256}`);
    }
    if (typeof entry.size !== 'number' || entry.size <= 0 || !Number.isInteger(entry.size)) {
      throw new Error(`Installer ${inst} size must be a positive integer: ${entry.size}`);
    }
  }

  if (!Array.isArray(data.mutable_paths)) {
    throw new Error('mutable_paths must be an array');
  }
  const expected = mutablePathsExpected || [];
  if (data.mutable_paths.length !== expected.length ||
      data.mutable_paths.some((p, i) => p !== expected[i])) {
    throw new Error(`mutable_paths must exactly match: [${expected.join(', ')}]`);
  }

  return data;
}

module.exports = {
  SCHEMA_ID,
  PLATFORM_LINUX_X64,
  PLATFORM_WINDOWS_X64,
  SUPPORTED_PLATFORMS,
  STANDALONE_INSTALLERS,
  METADATA_EXACT_KEYS,
  linuxArchiveName,
  windowsArchiveName,
  releaseMetadataName,
  validateReleaseMetadata
};
