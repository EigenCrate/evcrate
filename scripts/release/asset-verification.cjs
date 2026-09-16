'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const releaseContract = require('./release-contract.cjs');

/**
 * Returns the exact list of 7 release asset filenames sorted by Unicode code point.
 * @param {string} version Semantic version string (e.g. "2.1.0")
 * @returns {string[]} Canonical exact 7 filenames sorted by compareCodePoints
 */
function getExpectedReleaseAssetNames(version) {
  if (typeof version !== 'string' || !version.trim()) {
    throw new Error(`Invalid version argument: ${JSON.stringify(version)}`);
  }
  const v = version.trim();
  const linuxArchive = releaseContract.linuxArchiveName(v);
  const windowsArchive = releaseContract.windowsArchiveName(v);
  const metadata = releaseContract.releaseMetadataName(v);
  const names = [
    linuxArchive,
    releaseContract.sidecarName(linuxArchive),
    windowsArchive,
    releaseContract.sidecarName(windowsArchive),
    metadata,
    'install.sh',
    'install.ps1'
  ];
  return names.sort(releaseContract.compareCodePoints);
}

/**
 * Returns the exact list of 4 Windows asset filenames sorted by Unicode code point.
 * Internal helper for verifyWindowsAssetSet.
 * @param {string} version Semantic version string (e.g. "2.1.0")
 * @returns {string[]} Canonical exact 4 filenames sorted by compareCodePoints
 */
function getExpectedWindowsAssetNames(version) {
  if (typeof version !== 'string' || !version.trim()) {
    throw new Error(`Invalid version argument: ${JSON.stringify(version)}`);
  }
  const v = version.trim();
  const windowsArchive = releaseContract.windowsArchiveName(v);
  const metadata = releaseContract.releaseMetadataName(v);
  const names = [
    windowsArchive,
    releaseContract.sidecarName(windowsArchive),
    metadata,
    'install.ps1'
  ];
  return names.sort(releaseContract.compareCodePoints);
}

/**
 * Computes lowercase SHA-256 hex digest for a file using streaming chunks to avoid whole-file allocation.
 * @param {string} filePath Absolute or relative path to regular file
 * @returns {string} Lowercase 64-character hex SHA-256 digest
 */
function sha256File(filePath) {
  if (typeof filePath !== 'string' || !filePath) {
    throw new Error(`Invalid filePath: ${JSON.stringify(filePath)}`);
  }
  const hash = crypto.createHash('sha256');
  const fd = fs.openSync(filePath, 'r');
  try {
    const buffer = Buffer.alloc(64 * 1024);
    let bytesRead = 0;
    while ((bytesRead = fs.readSync(fd, buffer, 0, buffer.length, null)) > 0) {
      hash.update(buffer.subarray(0, bytesRead));
    }
  } finally {
    fs.closeSync(fd);
  }
  return hash.digest('hex');
}

/**
 * Internal core verifier handling both exact-seven and exact-four asset sets.
 * Read-only: never mutates, repairs, or writes any bytes or directories.
 */
function verifyAssetSetInternal(kind, options) {
  if (!options || typeof options !== 'object') {
    throw new Error(`Options must be an object, got ${typeof options}`);
  }
  const targetDir = options.dir || options.assetsDir;
  if (typeof targetDir !== 'string' || !targetDir.trim()) {
    throw new Error(`Missing required directory option "dir"`);
  }

  let dirStat;
  try {
    dirStat = fs.lstatSync(targetDir);
  } catch (err) {
    throw new Error(`Cannot access assets directory "${targetDir}": ${err.message}`);
  }
  if (dirStat.isSymbolicLink()) {
    throw new Error(`Release assets directory cannot be a symbolic link: "${targetDir}"`);
  }
  if (!dirStat.isDirectory()) {
    throw new Error(`Release assets directory is not a directory: "${targetDir}"`);
  }

  // 1. Enumerate target directory once and lstat every entry
  const entries = fs.readdirSync(targetDir);
  for (const entry of entries) {
    const entryPath = path.join(targetDir, entry);
    const stat = fs.lstatSync(entryPath);
    if (stat.isSymbolicLink()) {
      throw new Error(`Symbolic link rejected in release assets directory: "${entry}"`);
    }
    if (!stat.isFile()) {
      throw new Error(`Non-regular file rejected in release assets directory: "${entry}"`);
    }
  }

  // 2. Resolve version
  let version = options.version ? String(options.version).trim() : null;
  if (!version) {
    const metaCandidates = entries.filter((e) => /^evcrate-v.+?\.release\.json$/u.test(e));
    if (metaCandidates.length === 0) {
      throw new Error(`Missing release metadata file matching "evcrate-v*.release.json" in "${targetDir}"`);
    }
    if (metaCandidates.length > 1) {
      throw new Error(`Ambiguous release metadata files in "${targetDir}": ${metaCandidates.join(', ')}`);
    }
    const match = metaCandidates[0].match(/^evcrate-v(.+?)\.release\.json$/u);
    version = match[1];
  }

  // 3. Determine expected exact name list
  const expectedNames = kind === 'windows'
    ? getExpectedWindowsAssetNames(version)
    : getExpectedReleaseAssetNames(version);

  const expectedCount = kind === 'windows' ? 4 : 7;
  const actualSorted = [...entries].sort(releaseContract.compareCodePoints);

  // Check extra and missing
  const extras = actualSorted.filter((n) => !expectedNames.includes(n));
  if (extras.length > 0) {
    throw new Error(
      `Extra unexpected ${kind === 'windows' ? 'Windows' : 'release'} asset entries found: ${extras.join(', ')}`
    );
  }
  const missing = expectedNames.filter((n) => !actualSorted.includes(n));
  if (missing.length > 0) {
    throw new Error(
      `Missing expected ${kind === 'windows' ? 'Windows' : 'release'} asset entries: ${missing.join(', ')}`
    );
  }
  if (actualSorted.length !== expectedCount) {
    throw new Error(
      `Exact ${expectedCount} ${kind} assets required, found ${actualSorted.length}`
    );
  }

  // 4. Read and parse release metadata
  const metadataName = releaseContract.releaseMetadataName(version);
  const metadataPath = path.join(targetDir, metadataName);
  let rawMetadata;
  try {
    rawMetadata = fs.readFileSync(metadataPath, 'utf8');
  } catch (err) {
    throw new Error(`Failed to read release metadata "${metadataPath}": ${err.message}`);
  }

  let metadata;
  try {
    metadata = JSON.parse(rawMetadata);
  } catch (err) {
    throw new Error(`Invalid JSON in release metadata "${metadataPath}": ${err.message}`);
  }

  // Schema-level validation via release-contract
  releaseContract.validateReleaseMetadata(metadata);

  // Version and tag cross-checks
  if (metadata.version !== version) {
    throw new Error(
      `Metadata version "${metadata.version}" does not match expected version "${version}"`
    );
  }
  if (metadata.tag !== `v${version}`) {
    throw new Error(
      `Metadata tag "${metadata.tag}" does not match expected tag "v${version}"`
    );
  }
  if (options.tag && options.tag !== metadata.tag) {
    throw new Error(
      `Caller expected tag "${options.tag}" does not match metadata tag "${metadata.tag}"`
    );
  }
  if (!/^[a-f0-9]{40}$/u.test(metadata.source_commit)) {
    throw new Error(
      `Metadata source_commit "${metadata.source_commit}" is not a valid 40-character lowercase hex commit SHA`
    );
  }
  if (options.sourceCommit && options.sourceCommit !== metadata.source_commit) {
    throw new Error(
      `Caller expected source commit "${options.sourceCommit}" does not match metadata source_commit "${metadata.source_commit}"`
    );
  }

  const computedHashes = new Map();

  // 5. Cross-check Windows platform & installer (required for both sets)
  const winArchive = releaseContract.windowsArchiveName(version);
  const winRecord = metadata.platforms && metadata.platforms['windows-x64'];
  if (!winRecord) {
    throw new Error(`Metadata missing "windows-x64" platform record`);
  }
  if (winRecord.archive_name !== winArchive) {
    throw new Error(
      `Windows archive name in metadata "${winRecord.archive_name}" does not match expected "${winArchive}"`
    );
  }

  const winSidecarName = releaseContract.sidecarName(winArchive);
  const winSidecarPath = path.join(targetDir, winSidecarName);
  const winSidecarRaw = fs.readFileSync(winSidecarPath, 'utf8');
  const parsedWinSidecar = releaseContract.parseSidecar(winSidecarRaw, winArchive);
  if (parsedWinSidecar.sha256 !== winRecord.sha256) {
    throw new Error(
      `Windows sidecar SHA-256 "${parsedWinSidecar.sha256}" does not match metadata platform SHA-256 "${winRecord.sha256}"`
    );
  }

  const winArchivePath = path.join(targetDir, winArchive);
  const winArchiveStat = fs.statSync(winArchivePath);
  if (winArchiveStat.size !== winRecord.size) {
    throw new Error(
      `Windows archive size mismatch: disk has ${winArchiveStat.size} bytes, metadata records ${winRecord.size} bytes`
    );
  }
  const winArchiveHash = sha256File(winArchivePath);
  if (winArchiveHash !== winRecord.sha256) {
    throw new Error(
      `Windows archive SHA-256 mismatch: computed ${winArchiveHash}, metadata records ${winRecord.sha256}`
    );
  }
  computedHashes.set(winArchive, winArchiveHash);

  const ps1Record = metadata.installers && metadata.installers['install.ps1'];
  if (!ps1Record) {
    throw new Error(`Metadata missing "install.ps1" installer record`);
  }
  const ps1Path = path.join(targetDir, 'install.ps1');
  const ps1Stat = fs.statSync(ps1Path);
  if (ps1Stat.size !== ps1Record.size) {
    throw new Error(
      `install.ps1 size mismatch: disk has ${ps1Stat.size} bytes, metadata records ${ps1Record.size} bytes`
    );
  }
  const ps1Hash = sha256File(ps1Path);
  if (ps1Hash !== ps1Record.sha256) {
    throw new Error(
      `install.ps1 SHA-256 mismatch: computed ${ps1Hash}, metadata records ${ps1Record.sha256}`
    );
  }
  computedHashes.set('install.ps1', ps1Hash);

  // 6. Cross-check Linux platform & installer (required only for exact-seven release set)
  if (kind === 'release') {
    const linuxArchive = releaseContract.linuxArchiveName(version);
    const linuxRecord = metadata.platforms && metadata.platforms['linux-x64'];
    if (!linuxRecord) {
      throw new Error(`Metadata missing "linux-x64" platform record`);
    }
    if (linuxRecord.archive_name !== linuxArchive) {
      throw new Error(
        `Linux archive name in metadata "${linuxRecord.archive_name}" does not match expected "${linuxArchive}"`
      );
    }

    const linuxSidecarName = releaseContract.sidecarName(linuxArchive);
    const linuxSidecarPath = path.join(targetDir, linuxSidecarName);
    const linuxSidecarRaw = fs.readFileSync(linuxSidecarPath, 'utf8');
    const parsedLinuxSidecar = releaseContract.parseSidecar(linuxSidecarRaw, linuxArchive);
    if (parsedLinuxSidecar.sha256 !== linuxRecord.sha256) {
      throw new Error(
        `Linux sidecar SHA-256 "${parsedLinuxSidecar.sha256}" does not match metadata platform SHA-256 "${linuxRecord.sha256}"`
      );
    }

    const linuxArchivePath = path.join(targetDir, linuxArchive);
    const linuxArchiveStat = fs.statSync(linuxArchivePath);
    if (linuxArchiveStat.size !== linuxRecord.size) {
      throw new Error(
        `Linux archive size mismatch: disk has ${linuxArchiveStat.size} bytes, metadata records ${linuxRecord.size} bytes`
      );
    }
    const linuxArchiveHash = sha256File(linuxArchivePath);
    if (linuxArchiveHash !== linuxRecord.sha256) {
      throw new Error(
        `Linux archive SHA-256 mismatch: computed ${linuxArchiveHash}, metadata records ${linuxRecord.sha256}`
      );
    }
    computedHashes.set(linuxArchive, linuxArchiveHash);

    const shRecord = metadata.installers && metadata.installers['install.sh'];
    if (!shRecord) {
      throw new Error(`Metadata missing "install.sh" installer record`);
    }
    const shPath = path.join(targetDir, 'install.sh');
    const shStat = fs.statSync(shPath);
    if (shStat.size !== shRecord.size) {
      throw new Error(
        `install.sh size mismatch: disk has ${shStat.size} bytes, metadata records ${shRecord.size} bytes`
      );
    }
    const shHash = sha256File(shPath);
    if (shHash !== shRecord.sha256) {
      throw new Error(
        `install.sh SHA-256 mismatch: computed ${shHash}, metadata records ${shRecord.sha256}`
      );
    }
    computedHashes.set('install.sh', shHash);
  }

  // 7. Compute size and sha256 for all materialized files
  const fileRecords = [];
  for (const name of expectedNames) {
    const filePath = path.join(targetDir, name);
    const stat = fs.statSync(filePath);
    let hash = computedHashes.get(name);
    if (!hash) {
      hash = sha256File(filePath);
      computedHashes.set(name, hash);
    }
    fileRecords.push({
      name,
      size: stat.size,
      sha256: hash
    });
  }
  fileRecords.sort((a, b) => releaseContract.compareCodePoints(a.name, b.name));

  // 8. Caller expected hashes / expected receipt validation
  if (options.expectedHashes) {
    if (typeof options.expectedHashes !== 'object' || options.expectedHashes === null) {
      throw new Error(`options.expectedHashes must be an object`);
    }
    const expectedKeys = Object.keys(options.expectedHashes);
    for (const key of expectedKeys) {
      if (!expectedNames.includes(key)) {
        throw new Error(
          `Unknown expected file key "${key}" rejected (allowed keys: ${expectedNames.join(', ')})`
        );
      }
      const record = fileRecords.find((r) => r.name === key);
      const expectedSha = options.expectedHashes[key];
      if (typeof expectedSha !== 'string' || record.sha256.toLowerCase() !== expectedSha.toLowerCase()) {
        throw new Error(
          `Expected SHA-256 mismatch for "${key}": caller expected "${expectedSha}", disk has "${record.sha256}"`
        );
      }
    }
  }

  if (options.expectedFiles) {
    const list = Array.isArray(options.expectedFiles)
      ? options.expectedFiles
      : Object.entries(options.expectedFiles).map(([name, val]) => ({
          name,
          ...(typeof val === 'string' ? { sha256: val } : val)
        }));
    for (const item of list) {
      if (!item || !item.name) continue;
      if (!expectedNames.includes(item.name)) {
        throw new Error(
          `Unknown expected file entry "${item.name}" rejected (allowed keys: ${expectedNames.join(', ')})`
        );
      }
      const record = fileRecords.find((r) => r.name === item.name);
      if (item.sha256 && record.sha256.toLowerCase() !== item.sha256.toLowerCase()) {
        throw new Error(
          `Expected SHA-256 mismatch for "${item.name}": expected "${item.sha256}", disk has "${record.sha256}"`
        );
      }
      if (typeof item.size === 'number' && record.size !== item.size) {
        throw new Error(
          `Expected size mismatch for "${item.name}": expected ${item.size}, disk has ${record.size}`
        );
      }
    }
  }

  // 9. Build frozen normalized summary
  const summary = Object.freeze({
    version,
    tag: metadata.tag,
    sourceCommit: metadata.source_commit,
    files: Object.freeze(fileRecords.map((f) => Object.freeze({ ...f }))),
    metadata: Object.freeze({ ...metadata })
  });

  return summary;
}

/**
 * Verifies exact four Windows assets:
 *   - evcrate-v<version>-windows-x64.zip
 *   - evcrate-v<version>-windows-x64.zip.sha256
 *   - evcrate-v<version>.release.json
 *   - install.ps1
 * Read-only; permits Linux records in metadata while rejecting Linux files on disk.
 * @param {object} options Verification options ({ dir, version?, tag?, sourceCommit?, expectedHashes? })
 * @returns {object} Normalized frozen summary { version, tag, sourceCommit, files, metadata }
 */
function verifyWindowsAssetSet(options) {
  return verifyAssetSetInternal('windows', options);
}

/**
 * Verifies exact seven release assets:
 *   - evcrate-v<version>-linux-x64.tar.gz
 *   - evcrate-v<version>-linux-x64.tar.gz.sha256
 *   - evcrate-v<version>-windows-x64.zip
 *   - evcrate-v<version>-windows-x64.zip.sha256
 *   - evcrate-v<version>.release.json
 *   - install.sh
 *   - install.ps1
 * Read-only; rejects missing, extra, stale/mixed version, symlinks, and directories.
 * @param {object} options Verification options ({ dir, version?, tag?, sourceCommit?, expectedHashes? })
 * @returns {object} Normalized frozen summary { version, tag, sourceCommit, files, metadata }
 */
function verifyReleaseAssetSet(options) {
  return verifyAssetSetInternal('release', options);
}

/**
 * Parses CLI arguments for asset verification tool.
 * @param {string[]} argv Array of arguments (e.g. process.argv or process.argv.slice(2))
 * @returns {object} Parsed options object
 */
function parseVerifierArgs(argv) {
  const args = Array.isArray(argv) ? argv : [];
  let dir = null;
  let set = 'release';
  let version = null;
  let tag = null;
  let sourceCommit = null;
  let expectedHashes = null;
  let help = false;

  let i = 0;
  if (args.length >= 2 && (args[0].endsWith('node') || args[0].endsWith('node.exe')) && args[1].endsWith('.cjs')) {
    i = 2;
  }

  for (; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') {
      help = true;
    } else if (arg === '--dir' || arg === '-d') {
      if (i + 1 >= args.length) throw new Error('Missing value for --dir');
      dir = args[++i];
    } else if (arg.startsWith('--dir=')) {
      dir = arg.slice(6);
    } else if (arg === '--set') {
      if (i + 1 >= args.length) throw new Error('Missing value for --set');
      const val = args[++i];
      if (val !== 'release' && val !== 'windows') {
        throw new Error(`Invalid --set value: "${val}" (must be "release" or "windows")`);
      }
      set = val;
    } else if (arg.startsWith('--set=')) {
      const val = arg.slice(6);
      if (val !== 'release' && val !== 'windows') {
        throw new Error(`Invalid --set value: "${val}" (must be "release" or "windows")`);
      }
      set = val;
    } else if (arg === '--windows') {
      set = 'windows';
    } else if (arg === '--version') {
      if (i + 1 >= args.length) throw new Error('Missing value for --version');
      version = args[++i];
    } else if (arg.startsWith('--version=')) {
      version = arg.slice(10);
    } else if (arg === '--tag') {
      if (i + 1 >= args.length) throw new Error('Missing value for --tag');
      tag = args[++i];
    } else if (arg.startsWith('--tag=')) {
      tag = arg.slice(6);
    } else if (arg === '--commit' || arg === '--source-commit') {
      if (i + 1 >= args.length) throw new Error(`Missing value for ${arg}`);
      sourceCommit = args[++i];
    } else if (arg.startsWith('--commit=')) {
      sourceCommit = arg.slice(9);
    } else if (arg.startsWith('--source-commit=')) {
      sourceCommit = arg.slice(16);
    } else if (arg === '--expected-hash') {
      if (i + 1 >= args.length) throw new Error('Missing value for --expected-hash');
      const pair = args[++i];
      const eqIdx = pair.indexOf('=');
      if (eqIdx <= 0) throw new Error(`Invalid --expected-hash format (expected name=sha256): "${pair}"`);
      const name = pair.slice(0, eqIdx);
      const sha = pair.slice(eqIdx + 1);
      expectedHashes = expectedHashes || {};
      expectedHashes[name] = sha;
    } else if (arg.startsWith('--expected-hash=')) {
      const pair = arg.slice(16);
      const eqIdx = pair.indexOf('=');
      if (eqIdx <= 0) throw new Error(`Invalid --expected-hash format (expected name=sha256): "${pair}"`);
      const name = pair.slice(0, eqIdx);
      const sha = pair.slice(eqIdx + 1);
      expectedHashes = expectedHashes || {};
      expectedHashes[name] = sha;
    } else if (arg === '--expected-hashes') {
      if (i + 1 >= args.length) throw new Error('Missing value for --expected-hashes');
      try {
        expectedHashes = JSON.parse(args[++i]);
      } catch (e) {
        throw new Error(`Invalid JSON for --expected-hashes: ${e.message}`);
      }
    } else if (!arg.startsWith('-') && !dir) {
      dir = arg;
    } else {
      throw new Error(`Unknown argument: "${arg}"`);
    }
  }

  if (!help && !dir) {
    throw new Error('Missing required directory argument (specify path or --dir <path>)');
  }

  return { dir, set, version, tag, sourceCommit, expectedHashes, help };
}

/**
 * Main entry point for standalone CLI execution.
 * @param {string[]} [argv] Command-line arguments
 * @param {object} [env] Environment variables
 * @returns {object|number} Summary object on success or 0 for help
 */
function main(argv = process.argv, env = process.env) {
  const parsed = parseVerifierArgs(argv);
  if (parsed.help) {
    console.log(`Usage: node scripts/release/asset-verification.cjs [options] <dir>

Options:
  --dir <path>                  Release asset directory to verify
  --set <release|windows>       Exact asset set to verify (default: release)
  --windows                     Alias for --set windows
  --version <version>           Expected version (derived from metadata if omitted)
  --tag <tag>                   Expected tag (e.g. v2.1.0)
  --commit, --source-commit     Expected 40-hex source commit
  --expected-hash <name=sha>    Expected SHA-256 for a specific file
  --expected-hashes <json>      JSON mapping of filename to SHA-256
  -h, --help                    Show this help message
`);
    return 0;
  }

  const verifier = parsed.set === 'windows' ? verifyWindowsAssetSet : verifyReleaseAssetSet;
  const summary = verifier({
    dir: parsed.dir,
    version: parsed.version,
    tag: parsed.tag,
    sourceCommit: parsed.sourceCommit,
    expectedHashes: parsed.expectedHashes
  });

  console.log(`✓ Verified ${parsed.set === 'windows' ? 'exact-four Windows' : 'exact-seven release'} assets in ${parsed.dir}`);
  console.log(`  Version: ${summary.version} (${summary.tag})`);
  console.log(`  Commit:  ${summary.sourceCommit}`);
  console.log(`  Files (${summary.files.length}):`);
  for (const f of summary.files) {
    console.log(`    - ${f.name} (${f.size} bytes, sha256: ${f.sha256})`);
  }
  return summary;
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`✗ Asset verification failed: ${error.message}`);
    process.exit(1);
  }
}

module.exports = {
  getExpectedReleaseAssetNames,
  sha256File,
  verifyWindowsAssetSet,
  verifyReleaseAssetSet,
  parseVerifierArgs,
  main
};
