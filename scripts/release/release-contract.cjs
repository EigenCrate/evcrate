'use strict';

const canonical = require('./canonical-json.cjs');
const sidecar = require('./sidecar.cjs');
const pathPolicy = require('./path-policy.cjs');
const metadataSchema = require('./metadata-schema.cjs');

function validateReleaseMetadata(data) {
  return metadataSchema.validateReleaseMetadata(data, pathPolicy.MUTABLE_PATHS);
}

module.exports = {
  // Schema and platforms
  SCHEMA_ID: metadataSchema.SCHEMA_ID,
  PLATFORM_LINUX_X64: metadataSchema.PLATFORM_LINUX_X64,
  PLATFORM_WINDOWS_X64: metadataSchema.PLATFORM_WINDOWS_X64,
  SUPPORTED_PLATFORMS: metadataSchema.SUPPORTED_PLATFORMS,
  STANDALONE_INSTALLERS: metadataSchema.STANDALONE_INSTALLERS,
  METADATA_EXACT_KEYS: metadataSchema.METADATA_EXACT_KEYS,

  // Limits and path policy
  MAX_FILES: pathPolicy.MAX_FILES,
  MAX_DIRECTORIES: pathPolicy.MAX_DIRECTORIES,
  MAX_FILE_BYTES: pathPolicy.MAX_FILE_BYTES,
  MAX_TOTAL_EXPANDED_BYTES: pathPolicy.MAX_TOTAL_EXPANDED_BYTES,
  MAX_ARCHIVE_BYTES: pathPolicy.MAX_ARCHIVE_BYTES,
  MAX_PATH_BYTES: pathPolicy.MAX_PATH_BYTES,
  MAX_PATH_DEPTH: pathPolicy.MAX_PATH_DEPTH,
  MUTABLE_PATHS: pathPolicy.MUTABLE_PATHS,
  validateInventoryPath: pathPolicy.validateInventoryPath,
  computeInventoryDigest: pathPolicy.computeInventoryDigest,

  // Canonical JSON and hashing
  compareCodePoints: canonical.compareCodePoints,
  canonicalJson: canonical.canonicalJson,
  canonicalJsonBytes: canonical.canonicalJsonBytes,
  sha256Bytes: canonical.sha256Bytes,
  sha256Canonical: canonical.sha256Canonical,

  // Filenames and sidecars
  linuxArchiveName: metadataSchema.linuxArchiveName,
  windowsArchiveName: metadataSchema.windowsArchiveName,
  releaseMetadataName: metadataSchema.releaseMetadataName,
  sidecarName: sidecar.sidecarName,
  serializeSidecar: sidecar.serializeSidecar,
  parseSidecar: sidecar.parseSidecar,

  // Metadata validation
  validateReleaseMetadata
};
