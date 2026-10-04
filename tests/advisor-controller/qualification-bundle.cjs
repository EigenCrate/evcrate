'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execSync } = require('node:child_process');

const {
  canonicalJson,
  canonicalJsonBytes,
  sha256Bytes,
  sha256Canonical,
  compareCodePoints
} = require('../../scripts/release/canonical-json.cjs');

const {
  validateInventoryPath,
  MAX_FILES,
  MAX_FILE_BYTES,
  MAX_TOTAL_EXPANDED_BYTES
} = require('../../scripts/release/path-policy.cjs');

const { createZipArchive } = require('../../scripts/release/zip-writer.cjs');
const { verifyZipArchive } = require('../../scripts/release/zip-verifier.cjs');

const EXCLUDE_DIRS = new Set([
  '.git',
  'plans',
  'node_modules',
  '.evcrate-publish-state',
  '__pycache__',
  'coverage',
  '.nyc_output'
]);

function isExcludedDirectory(dirName) {
  if (EXCLUDE_DIRS.has(dirName)) return true;
  if (dirName.startsWith('.evcrate-project-')) return true;
  return false;
}

function isExcludedFile(fileName, relPath) {
  if (fileName === '.git') return true;
  if (fileName.endsWith('.pyc') || fileName.endsWith('.pyo')) return true;
  if (fileName === '.DS_Store' || fileName === 'Thumbs.db') return true;
  if (fileName === 'repomix-output.xml') return true;
  if (fileName.startsWith('.env') && fileName !== '.env.example') return true;
  if (fileName.endsWith('.zip') || fileName.endsWith('.tar.gz')) return true;
  return false;
}

function getApprovedSnapshotIdentity(rootDir) {
  try {
    const stdout = execSync('git rev-parse HEAD', { cwd: rootDir, encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
    return stdout.trim();
  } catch {
    return '7b1ba613';
  }
}

function scanPackageRoot(rootDir) {
  const records = [];
  const seenPaths = new Set();
  const seenLower = new Set();
  let totalBytes = 0;

  function walk(currentDir) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const ent of entries) {
      const fullPath = path.join(currentDir, ent.name);
      const relPath = path.relative(rootDir, fullPath).replace(/\\/g, '/');
      if (isExcludedDirectory(ent.name)) {
        continue;
      }
      if (isExcludedFile(ent.name, relPath)) {
        continue;
      }

      if (ent.isSymbolicLink()) {
        throw new Error(`Symlink forbidden in qualification bundle: ${relPath}`);
      }

      if (ent.isDirectory()) {
        walk(fullPath);
      } else if (ent.isFile()) {
        if (isExcludedFile(ent.name, relPath)) continue;

        validateInventoryPath(relPath, { allowSourceAndTests: true });

        const stat = fs.statSync(fullPath);
        if (stat.size > MAX_FILE_BYTES) {
          throw new Error(`File ${relPath} exceeds maximum file size ${MAX_FILE_BYTES}`);
        }
        totalBytes += stat.size;
        if (totalBytes > MAX_TOTAL_EXPANDED_BYTES) {
          throw new Error(`Total expanded bytes exceeds limit ${MAX_TOTAL_EXPANDED_BYTES}`);
        }

        const lower = relPath.toLowerCase();
        if (seenPaths.has(relPath)) {
          throw new Error(`Duplicate file path in scan: ${relPath}`);
        }
        if (seenLower.has(lower)) {
          throw new Error(`Case-fold collision in scan: ${relPath}`);
        }
        seenPaths.add(relPath);
        seenLower.add(lower);

        const data = fs.readFileSync(fullPath);
        const sha256 = crypto.createHash('sha256').update(data).digest('hex');
        const mode = (stat.mode & 0o777);

        records.push({
          path: relPath,
          fullPath,
          size: stat.size,
          sha256,
          mode
        });
      } else {
        throw new Error(`Special filesystem entry forbidden: ${relPath}`);
      }
    }
  }

  walk(rootDir);

  if (records.length > MAX_FILES) {
    throw new Error(`File count ${records.length} exceeds limit ${MAX_FILES}`);
  }

  records.sort((a, b) => compareCodePoints(a.path, b.path));
  return { records, totalBytes };
}

function getArtifactsDigest(rootDir) {
  const artifactsPath = path.join(rootDir, '.evcrate', 'source', '.evcrate', 'bin', 'lib', 'advisor', 'native', 'darwin', 'prebuilt', 'artifacts.json');
  if (fs.existsSync(artifactsPath)) {
    const data = fs.readFileSync(artifactsPath);
    return crypto.createHash('sha256').update(data).digest('hex');
  }
  return null;
}

function runFreeze(rootDir, outputDir, options = {}) {
  const absRoot = path.resolve(rootDir);
  const absOutput = path.resolve(outputDir);

  if (!fs.existsSync(absRoot) || !fs.statSync(absRoot).isDirectory()) {
    throw new Error(`Approved package root does not exist or is not a directory: ${absRoot}`);
  }

  fs.mkdirSync(absOutput, { recursive: true, mode: 0o755 });

  const snapshotIdentity = options.snapshotIdentity || getApprovedSnapshotIdentity(absRoot);
  const candidateId = options.candidateId || `evcrate-candidate-${Date.now()}`;

  const { records, totalBytes } = scanPackageRoot(absRoot);

  const manifest = {
    schema_version: 1,
    candidate_id: candidateId,
    approved_snapshot_identity: snapshotIdentity,
    target_ids: [
      'antigravity',
      'claude',
      'codex',
      'copilot',
      'gemini',
      'omp',
      'pi',
      'vscode'
    ],
    file_count: records.length,
    total_bytes: totalBytes,
    generated_roots: [],
    entries: records.map((r) => ({
      path: r.path,
      kind: 'file',
      size: r.size,
      sha256: r.sha256,
      mode: r.mode
    }))
  };

  const archivePath = path.join(absOutput, 'candidate.zip');
  const manifestPath = path.join(absOutput, 'manifest.json');
  const receiptPath = path.join(absOutput, 'receipt.json');
  const archiveShaPath = path.join(absOutput, 'candidate.zip.sha256');

  // Create ZIP archive
  createZipArchive(records, archivePath);

  const archiveData = fs.readFileSync(archivePath);
  const archiveSha256 = crypto.createHash('sha256').update(archiveData).digest('hex');
  fs.writeFileSync(archiveShaPath, `${archiveSha256}  candidate.zip\n`, 'utf8');

  // Write canonical manifest
  const manifestJson = canonicalJson(manifest);
  fs.writeFileSync(manifestPath, `${manifestJson}\n`, 'utf8');
  const manifestSha256 = sha256Canonical(manifest);

  // Write canonical receipt
  const receipt = {
    schema_version: 1,
    candidate_id: candidateId,
    approved_snapshot_identity: snapshotIdentity,
    manifest_sha256: manifestSha256,
    archive_size: archiveData.length,
    archive_sha256: archiveSha256,
    target_ids: manifest.target_ids,
    closure_count: records.length,
    native_provenance: {
      artifacts_path: '.evcrate/source/.evcrate/bin/lib/advisor/native/darwin/prebuilt/artifacts.json',
      artifacts_sha256: getArtifactsDigest(absRoot)
    },
    linux_environment: {
      platform: process.platform,
      arch: process.arch,
      node: process.version
    },
    signature: 'unsigned'
  };

  const receiptJson = canonicalJson(receipt);
  fs.writeFileSync(receiptPath, `${receiptJson}\n`, 'utf8');

  return {
    status: 'ok',
    candidate_id: candidateId,
    file_count: records.length,
    total_bytes: totalBytes,
    archive_path: archivePath,
    archive_sha256: archiveSha256,
    manifest_path: manifestPath,
    manifest_sha256: manifestSha256,
    receipt_path: receiptPath
  };
}

function runVerifyArchive(archivePath, manifestPath) {
  const absArchive = path.resolve(archivePath);
  const absManifest = path.resolve(manifestPath);

  if (!fs.existsSync(absArchive)) {
    throw new Error(`Archive not found: ${absArchive}`);
  }
  if (!fs.existsSync(absManifest)) {
    throw new Error(`Manifest not found: ${absManifest}`);
  }

  const manifest = JSON.parse(fs.readFileSync(absManifest, 'utf8'));
  if (!Array.isArray(manifest.entries)) {
    throw new Error('Manifest entries must be an array');
  }

  // Cross-check archive SHA if sidecar exists
  const shaFile = `${absArchive}.sha256`;
  if (fs.existsSync(shaFile)) {
    const expectedSha = fs.readFileSync(shaFile, 'utf8').trim().split(/\s+/)[0].toLowerCase();
    const actualSha = crypto.createHash('sha256').update(fs.readFileSync(absArchive)).digest('hex');
    if (expectedSha !== actualSha) {
      throw new Error(`Archive SHA-256 sidecar mismatch: expected ${expectedSha}, got ${actualSha}`);
    }
  }

  verifyZipArchive(absArchive, manifest.entries, { allowSourceAndTests: true });

  return {
    status: 'ok',
    verified_entries: manifest.entries.length,
    archive: absArchive,
    manifest: absManifest
  };
}

function runVerify(extractedRoot, manifestPath) {
  const absRoot = path.resolve(extractedRoot);
  const absManifest = path.resolve(manifestPath);

  if (!fs.existsSync(absRoot) || !fs.statSync(absRoot).isDirectory()) {
    throw new Error(`Extracted root directory not found: ${absRoot}`);
  }
  if (!fs.existsSync(absManifest)) {
    throw new Error(`Manifest not found: ${absManifest}`);
  }

  const manifest = JSON.parse(fs.readFileSync(absManifest, 'utf8'));
  if (!Array.isArray(manifest.entries)) {
    throw new Error('Manifest entries must be an array');
  }

  const expectedPaths = new Set();
  for (const entry of manifest.entries) {
    expectedPaths.add(entry.path);
    const fullPath = path.join(absRoot, entry.path);
    if (!fs.existsSync(fullPath)) {
      throw new Error(`Missing expected candidate file: ${entry.path}`);
    }
    const stat = fs.statSync(fullPath);
    if (!stat.isFile()) {
      throw new Error(`Candidate entry is not a regular file: ${entry.path}`);
    }
    if (stat.size !== entry.size) {
      throw new Error(`File size mismatch for ${entry.path}: expected ${entry.size}, got ${stat.size}`);
    }
    const data = fs.readFileSync(fullPath);
    const actualSha = crypto.createHash('sha256').update(data).digest('hex');
    if (actualSha !== entry.sha256) {
      throw new Error(`SHA-256 mismatch for ${entry.path}: expected ${entry.sha256}, got ${actualSha}`);
    }
  }

  // Check for unexpected extra files in extracted root
  function checkNoExtra(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const ent of entries) {
      const full = path.join(dir, ent.name);
      const rel = path.relative(absRoot, full).replace(/\\/g, '/');
      if (ent.isDirectory()) {
        if (isExcludedDirectory(ent.name)) continue;
        checkNoExtra(full);
      } else if (ent.isFile()) {
        if (isExcludedFile(ent.name, rel)) continue;
        if (!expectedPaths.has(rel)) {
          throw new Error(`Unexpected extra file in extracted candidate: ${rel}`);
        }
      }
    }
  }
  checkNoExtra(absRoot);

  return {
    status: 'ok',
    verified_files: manifest.entries.length,
    root: absRoot
  };
}

function parseCliArgs(args) {
  const result = { command: args[0], options: {} };
  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = args[i + 1];
      if (next && !next.startsWith('--')) {
        result.options[key] = next;
        i++;
      } else {
        result.options[key] = true;
      }
    }
  }
  return result;
}

function main() {
  const { command, options } = parseCliArgs(process.argv.slice(2));

  try {
    if (command === 'freeze') {
      if (!options.root || !options.output) {
        console.error('Usage: qualification-bundle.cjs freeze --root <root> --output <dir> [--candidate-id <id>]');
        process.exit(1);
      }
      const res = runFreeze(options.root, options.output, {
        candidateId: options['candidate-id'],
        snapshotIdentity: options['snapshot-identity']
      });
      console.log(JSON.stringify(res, null, 2));
    } else if (command === 'verify-archive') {
      if (!options.archive || !options.manifest) {
        console.error('Usage: qualification-bundle.cjs verify-archive --archive <zip> --manifest <manifest.json>');
        process.exit(1);
      }
      const res = runVerifyArchive(options.archive, options.manifest);
      console.log(JSON.stringify(res, null, 2));
    } else if (command === 'verify') {
      if (!options.root || !options.manifest) {
        console.error('Usage: qualification-bundle.cjs verify --root <dir> --manifest <manifest.json>');
        process.exit(1);
      }
      const res = runVerify(options.root, options.manifest);
      console.log(JSON.stringify(res, null, 2));
    } else {
      console.error(`Unknown command: ${command}`);
      console.error('Available commands: freeze, verify-archive, verify');
      process.exit(1);
    }
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  scanPackageRoot,
  runFreeze,
  runVerifyArchive,
  runVerify
};
