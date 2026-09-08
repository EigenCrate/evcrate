#!/bin/sh
# EVCrate Linux standalone installer entrypoint
# Standalone POSIX entrypoint containing preflight and embedded Node installer.
set -eu

# 1. Platform validation (Linux only)
OS="$(uname -s)"
if [ "$OS" != "Linux" ]; then
  echo "Error: EVCrate Linux installer supports Linux only (detected $OS)" >&2
  exit 1
fi

# 2. Architecture validation (x86_64 / amd64 only)
ARCH="$(uname -m)"
if [ "$ARCH" != "x86_64" ] && [ "$ARCH" != "amd64" ]; then
  echo "Error: EVCrate Linux installer supports x86_64 only (detected $ARCH)" >&2
  exit 1
fi

# 3. Node.js binary presence
if ! command -v node >/dev/null 2>&1; then
  echo "Error: Node.js is required but not found in PATH. Please install Node.js >= 22.19.0." >&2
  exit 1
fi

# 4. Node.js version floor check (>= 22.19.0)
NODE_CHECK="$(node -e '
const [M, m] = process.versions.node.split(".").map(Number);
if (M > 22 || (M === 22 && m >= 19)) {
  process.stdout.write("OK");
} else {
  process.stdout.write(process.versions.node);
}
' 2>/dev/null || echo "FAIL")"

if [ "$NODE_CHECK" != "OK" ]; then
  echo "Error: Node.js >= 22.19.0 is required (found $NODE_CHECK)" >&2
  exit 1
fi

# 5. Script path resolution
SCRIPT_PATH="$0"
if command -v realpath >/dev/null 2>&1; then
  SCRIPT_PATH="$(realpath "$SCRIPT_PATH")"
elif command -v readlink >/dev/null 2>&1; then
  SCRIPT_PATH="$(readlink -f "$SCRIPT_PATH" 2>/dev/null || readlink "$SCRIPT_PATH" 2>/dev/null || echo "$SCRIPT_PATH")"
fi
case "$SCRIPT_PATH" in
  /*) ;;
  *) SCRIPT_PATH="$(pwd)/$SCRIPT_PATH" ;;
esac

# 6. Execute embedded Node installer
exec node - "$SCRIPT_PATH" "$@" <<'EVCRATE_INSTALLER_PAYLOAD'
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const { execFileSync } = require('node:child_process');

const SCHEMA_RELEASE = 'evcrate-private-release/v1';
const SCHEMA_JOURNAL = 'evcrate-install-journal/v1';
const SCHEMA_RECEIPT = 'evcrate-installer-receipt/v1';
const SCHEMA_OWNED = 'evcrate-installer-owned/v1';

const MAX_ARCHIVE_BYTES = 512 * 1024 * 1024;
const MAX_TOTAL_EXPANDED_BYTES = 512 * 1024 * 1024;
const MAX_FILE_BYTES = 16 * 1024 * 1024;
const MAX_PATH_BYTES = 4096;
const MAX_PATH_DEPTH = 32;

const MUTABLE_PATHS = Object.freeze([
  '.evcrate/source/.claude/**',
  '.evcrate/registry.json',
  '.evcrate/scopes/**'
]);

const DOS_DEVICE_NAMES = new Set([
  'CON', 'PRN', 'AUX', 'NUL',
  'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
  'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9'
]);

const ADVISOR_CONTROLLER_FILES = Object.freeze([
  'evcrate-advisor',
  'lib/advisor/adapter-contract.cjs',
  'lib/advisor/adapter-registry.cjs',
  'lib/advisor/adapters/claude.cjs',
  'lib/advisor/adapters/codex.cjs',
  'lib/advisor/adapters/omp.cjs',
  'lib/advisor/adapters/omp-parser.cjs',
  'lib/advisor/adapters/pi.cjs',
  'lib/advisor/checkpoint-contract.cjs',
  'lib/advisor/contracts-v2.cjs',
  'lib/advisor/controller-envelope.cjs',
  'lib/advisor/controller.cjs',
  'lib/advisor/errors.cjs',
  'lib/advisor/history-contract.cjs',
  'lib/advisor/history-prune.cjs',
  'lib/advisor/history-query.cjs',
  'lib/advisor/history-store.cjs',
  'lib/advisor/isolated-workspace.cjs',
  'lib/advisor/json-document.cjs',
  'lib/advisor/managed-checkpoint.cjs',
  'lib/advisor/policy-schema.cjs',
  'lib/advisor/profile.cjs',
  'lib/advisor/runner.cjs',
  'lib/advisor/runtime-brief.generated.cjs',
  'lib/advisor/state-baseline.cjs',
  'lib/advisor/state-contract.cjs',
  'lib/advisor/state-human.cjs',
  'lib/advisor/state-io.cjs',
  'lib/advisor/task-state.cjs'
]);
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f]/u;

function compareCodePoints(a, b) {
  const codePointsA = Array.from(a, (char) => char.codePointAt(0));
  const codePointsB = Array.from(b, (char) => char.codePointAt(0));
  const minLength = Math.min(codePointsA.length, codePointsB.length);
  for (let i = 0; i < minLength; i += 1) {
    if (codePointsA[i] !== codePointsB[i]) {
      return codePointsA[i] - codePointsB[i];
    }
  }
  return codePointsA.length - codePointsB.length;
}

function canonicalJson(value, depth = 0) {
  if (depth > 32) throw new RangeError('JSON nesting too deep');
  if (value === null || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('JSON number is not finite');
    return value.toString();
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item, depth + 1)).join(',')}]`;
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value).sort(compareCodePoints);
    const entries = keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key], depth + 1)}`);
    return `{${entries.join(',')}}`;
  }
  throw new TypeError(`Cannot canonically encode type: ${typeof value}`);
}

function canonicalJsonBytes(value) {
  return Buffer.from(`${canonicalJson(value)}\n`, 'utf8');
}

function sha256Bytes(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  const buf = fs.readFileSync(filePath);
  hash.update(buf);
  return hash.digest('hex');
}
function computeInventoryDigest(records) {
  const sorted = [...records].sort((a, b) => compareCodePoints(a.path, b.path));
  const seenPaths = new Set();
  const seenLower = new Set();
  for (const rec of sorted) {
    if (seenPaths.has(rec.path)) throw new Error(`Duplicate path in inventory: ${rec.path}`);
    const lower = rec.path.toLowerCase();
    if (seenLower.has(lower)) throw new Error(`Case-fold collision in inventory: ${rec.path}`);
    seenPaths.add(rec.path);
    seenLower.add(lower);
  }
  const canonicalRecords = sorted.map((rec) => ({
    mode: rec.mode,
    path: rec.path,
    sha256: rec.sha256,
    size: rec.size
  }));
  return sha256Bytes(canonicalJsonBytes(canonicalRecords));
}

function parseSidecar(content, expectedBasename) {
  if (typeof content !== 'string') throw new TypeError('Sidecar content must be a string');
  if (content.includes('\r') || /[\u0000-\u0009\u000b-\u001f\u007f-\u009f]/u.test(content)) {
    throw new Error('Sidecar contains forbidden CR or control characters');
  }
  if (!content.endsWith('\n') || content.endsWith('\n\n')) {
    throw new Error('Sidecar must end with exactly one newline');
  }
  const parts = content.split('\n');
  if (parts.length !== 2 || parts[1] !== '') {
    throw new Error('Sidecar must contain exactly one record');
  }
  const match = /^([a-f0-9]{64})  ([^/\s\\]+)$/u.exec(parts[0]);
  if (!match) throw new Error('Sidecar does not match grammar "<64-hex>  <basename>\\n"');
  const digest = match[1];
  const basename = match[2];
  if (basename === '.' || basename === '..' || basename.trim() !== basename) {
    throw new Error('Sidecar basename is invalid or contains padding');
  }
  if (expectedBasename !== undefined && basename !== expectedBasename) {
    throw new Error(`Sidecar basename mismatch: expected ${expectedBasename}, got ${basename}`);
  }
  return { sha256: digest, basename };
}

function validateInventoryPath(relativePath) {
  if (typeof relativePath !== 'string') throw new TypeError('Inventory path must be a string');
  if (relativePath.length === 0) throw new Error('Empty path is invalid');
  if (Buffer.byteLength(relativePath, 'utf8') > MAX_PATH_BYTES) {
    throw new Error(`Path exceeds maximum length of ${MAX_PATH_BYTES} bytes: ${relativePath}`);
  }
  if (relativePath.includes('\\')) throw new Error(`Path contains backslash: ${relativePath}`);
  if (relativePath.startsWith('/') || relativePath.endsWith('/')) {
    throw new Error(`Path has leading or trailing slash: ${relativePath}`);
  }
  if (CONTROL_CHARS.test(relativePath)) {
    throw new Error(`Path contains control characters or NUL: ${relativePath}`);
  }
  const segments = relativePath.split('/');
  if (segments.length > MAX_PATH_DEPTH) {
    throw new Error(`Path exceeds maximum depth of ${MAX_PATH_DEPTH}: ${relativePath}`);
  }
  for (const seg of segments) {
    if (seg === '' || seg === '.' || seg === '..') {
      throw new Error(`Path contains invalid traversal segment: ${relativePath}`);
    }
    if (seg.endsWith('.') || seg.endsWith(' ')) {
      throw new Error(`Path segment ends with dot or space: ${relativePath}`);
    }
    if (seg.includes(':')) {
      throw new Error(`Path segment contains colon (alternate data stream syntax): ${relativePath}`);
    }
    const baseSeg = seg.split('.')[0].toUpperCase();
    if (DOS_DEVICE_NAMES.has(baseSeg)) {
      throw new Error(`Path segment contains Windows DOS device name "${seg}": ${relativePath}`);
    }
  }
  if (relativePath.startsWith('plans/') || relativePath === 'plans') {
    throw new Error(`Confidential path denied: ${relativePath}`);
  }
  if (relativePath.startsWith('.git/') || relativePath === '.git') {
    throw new Error(`.git path denied: ${relativePath}`);
  }
  if (relativePath.startsWith('node_modules/') || relativePath.includes('/node_modules/')) {
    throw new Error(`node_modules path denied: ${relativePath}`);
  }
  if (relativePath.startsWith('distribution/') || relativePath.startsWith('distribute') ||
      relativePath.startsWith('migrate_') || relativePath.includes('/__pycache__') ||
      relativePath.endsWith('.pyc') || relativePath.endsWith('.pyo')) {
    throw new Error(`Python distribution/migrator/bytecode denied: ${relativePath}`);
  }
  if (relativePath.startsWith('tests/') || relativePath.startsWith('src/')) {
    throw new Error(`Repository test/source directory denied: ${relativePath}`);
  }
  const fileName = segments.at(-1) || '';
  if (fileName === '.env' || (fileName.startsWith('.env.') && fileName !== '.env.example')) {
    throw new Error(`Environment/secret file denied: ${relativePath}`);
  }
  return relativePath;
}

function parseStrictOctal(buf, fieldName) {
  const str = buf.toString('ascii').replace(/\0.*$/u, '').trim();
  if (str === '') return 0;
  if (!/^[0-7]+$/u.test(str)) {
    throw new Error(`Invalid octal field "${fieldName}" in tar header: "${str}"`);
  }
  const val = parseInt(str, 8);
  if (!Number.isSafeInteger(val) || val < 0) {
    throw new Error(`Out-of-range octal value in "${fieldName}": ${str}`);
  }
  return val;
}

function verifyTarChecksum(header) {
  const recorded = parseStrictOctal(header.subarray(148, 154), 'chksum');
  let sum = 0;
  for (let i = 0; i < 512; i += 1) {
    sum += (i >= 148 && i < 156) ? 0x20 : header[i];
  }
  return sum === recorded;
}

function parsePaxPath(data, declaredSize) {
  if (data.length !== declaredSize) {
    throw new Error(`PAX record length ${data.length} does not match declared size ${declaredSize}`);
  }
  const text = data.toString('utf8');
  const match = /^(\d+) path=(.+)\n$/u.exec(text);
  if (!match) throw new Error(`Malformed PAX path record: ${JSON.stringify(text)}`);
  const declaredLen = parseInt(match[1], 10);
  if (Buffer.byteLength(text, 'utf8') !== declaredLen) {
    throw new Error(`PAX length field mismatch: declared ${declaredLen}, actual ${Buffer.byteLength(text, 'utf8')}`);
  }
  return match[2];
}

function decompressTarBounded(archivePath) {
  const stat = fs.statSync(archivePath);
  if (stat.size > MAX_ARCHIVE_BYTES) {
    throw new Error(`Archive size ${stat.size} exceeds maximum ${MAX_ARCHIVE_BYTES}`);
  }
  const gzipped = fs.readFileSync(archivePath);
  return zlib.gunzipSync(gzipped, { maxOutputLength: MAX_TOTAL_EXPANDED_BYTES });
}

function extractTarArchive(archivePath, targetStageDir) {
  const tar = decompressTarBounded(archivePath);
  let offset = 0;
  let pendingPaxPath = null;
  let zeroBlockCount = 0;
  const records = [];

  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    offset += 512;

    const isAllZero = header.every((b) => b === 0);
    if (isAllZero) {
      zeroBlockCount += 1;
      if (zeroBlockCount >= 2) {
        const remainder = tar.subarray(offset);
        if (!remainder.every((b) => b === 0)) {
          throw new Error('Non-zero trailing data detected after end-of-archive blocks');
        }
        break;
      }
      continue;
    } else if (zeroBlockCount > 0) {
      throw new Error('Single zero block encountered before valid header');
    }

    if (!verifyTarChecksum(header)) {
      throw new Error(`Invalid tar header checksum at offset ${offset - 512}`);
    }

    const magic = header.subarray(257, 263).toString('ascii');
    const version = header.subarray(263, 265).toString('ascii');
    if (magic !== 'ustar\0') throw new Error(`Invalid tar magic: "${magic}"`);
    if (version !== '00') throw new Error(`Invalid tar version: "${version}"`);

    const typeflag = String.fromCharCode(header[156] || 0x30);
    const size = parseStrictOctal(header.subarray(124, 135), 'size');
    const mode = parseStrictOctal(header.subarray(100, 107), 'mode');

    const dataPad = size % 512 === 0 ? 0 : 512 - (size % 512);
    if (offset + size + dataPad > tar.length) {
      throw new Error(`Truncated tar payload or padding at offset ${offset}`);
    }

    const fileData = tar.subarray(offset, offset + size);
    const padData = tar.subarray(offset + size, offset + size + dataPad);
    if (!padData.every((b) => b === 0)) {
      throw new Error(`Tar data padding must contain only zeros at offset ${offset + size}`);
    }
    offset += size + dataPad;

    if (typeflag === 'x') {
      if (pendingPaxPath !== null) throw new Error('Consecutive PAX headers without file entry');
      pendingPaxPath = parsePaxPath(fileData, size);
      continue;
    }

    if (typeflag !== '0' && typeflag !== '\0') {
      throw new Error(`Unsupported or unsafe tar entry typeflag "${typeflag}"`);
    }

    let entryPath = pendingPaxPath;
    pendingPaxPath = null;
    if (!entryPath) {
      const rawName = header.subarray(0, 100).toString('utf8').replace(/\0.*$/u, '');
      const rawPrefix = header.subarray(345, 500).toString('utf8').replace(/\0.*$/u, '');
      entryPath = rawPrefix ? `${rawPrefix}/${rawName}` : rawName;
    }

    if (!entryPath.startsWith('package/')) {
      throw new Error(`Entry does not start with package/: ${entryPath}`);
    }

    const packageRelative = entryPath.slice('package/'.length);
    validateInventoryPath(packageRelative);

    if (size > MAX_FILE_BYTES) {
      throw new Error(`File ${packageRelative} exceeds max file bytes ${MAX_FILE_BYTES}`);
    }

    const normMode = (mode & 0o111) !== 0 ? 0o755 : 0o644;
    const sha256 = sha256Bytes(fileData);

    // Write file into stage
    const fullDest = path.join(targetStageDir, 'package', ...packageRelative.split('/'));
    fs.mkdirSync(path.dirname(fullDest), { recursive: true });
    fs.writeFileSync(fullDest, fileData, { mode: normMode });

    records.push({
      path: packageRelative,
      size,
      mode: normMode,
      sha256
    });
  }

  if (pendingPaxPath !== null) throw new Error('Dangling PAX header at end of archive');
  if (zeroBlockCount < 2) throw new Error(`Archive truncated: saw only ${zeroBlockCount} zero blocks`);

  return records;
}

function resolveRoots(options) {
  const home = os.homedir();
  const dataRoot = options.dataDir || (process.env.XDG_DATA_HOME ? path.join(process.env.XDG_DATA_HOME, 'evcrate') : path.join(home, '.local', 'share', 'evcrate'));
  const stateRoot = options.stateDir || (process.env.XDG_STATE_HOME ? path.join(process.env.XDG_STATE_HOME, 'evcrate') : path.join(home, '.local', 'state', 'evcrate'));
  const binDir = options.binDir || process.env.EVCRATE_BIN_DIR || path.join(home, '.local', 'bin');

  fs.mkdirSync(dataRoot, { recursive: true, mode: 0o700 });
  fs.mkdirSync(stateRoot, { recursive: true, mode: 0o700 });
  fs.mkdirSync(binDir, { recursive: true, mode: 0o755 });

  const currentUid = process.getuid ? process.getuid() : null;
  for (const [name, dir] of [['data', dataRoot], ['state', stateRoot]]) {
    const st = fs.statSync(dir);
    if (currentUid !== null && currentUid !== 0 && st.uid !== currentUid) {
      throw new Error(`Insecure ${name} directory: not owned by current user (${dir})`);
    }
  }

  return {
    dataRoot: path.resolve(dataRoot),
    stateRoot: path.resolve(stateRoot),
    binDir: path.resolve(binDir),
    snapshotsDir: path.resolve(dataRoot, 'snapshots'),
    stagingDir: path.resolve(dataRoot, 'staging'),
    currentLink: path.resolve(dataRoot, 'current'),
    launcherLink: path.resolve(binDir, 'evcrate'),
    lockPath: path.resolve(stateRoot, 'install.lock'),
    journalPath: path.resolve(stateRoot, 'install-journal.json'),
    ownedPath: path.resolve(stateRoot, 'installer-owned.json')
  };
}

function acquireLock(roots) {
  const payload = JSON.stringify({
    pid: process.pid,
    hostname: os.hostname(),
    created_at: new Date().toISOString()
  });

  try {
    const fd = fs.openSync(roots.lockPath, 'wx');
    fs.writeFileSync(fd, payload);
    return { fd, roots };
  } catch (err) {
    if (err.code !== 'EEXIST') throw err;

    let stale = false;
    try {
      const raw = fs.readFileSync(roots.lockPath, 'utf8');
      const data = JSON.parse(raw);
      if (data.hostname === os.hostname() && typeof data.pid === 'number') {
        try {
          process.kill(data.pid, 0);
        } catch (killErr) {
          if (killErr.code === 'ESRCH') stale = true;
        }
      }
    } catch {
      // corrupt lock file treated as unsafe
    }

    if (stale) {
      const quarantine = `${roots.lockPath}.stale-${Date.now()}`;
      try {
        fs.renameSync(roots.lockPath, quarantine);
      } catch {
        fs.unlinkSync(roots.lockPath);
      }
      const fd = fs.openSync(roots.lockPath, 'wx');
      fs.writeFileSync(fd, payload);
      return { fd, roots };
    }

    throw new Error(`Installer is busy: active lock at ${roots.lockPath}`);
  }
}

function releaseLock(lockHandle) {
  if (!lockHandle) return;
  try {
    fs.closeSync(lockHandle.fd);
  } catch { /* ignore */ }
  try {
    fs.unlinkSync(lockHandle.roots.lockPath);
  } catch { /* ignore */ }
}

function readJournal(roots) {
  if (!fs.existsSync(roots.journalPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(roots.journalPath, 'utf8'));
  } catch {
    return null;
  }
}

function writeJournal(roots, data) {
  const tmp = `${roots.journalPath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, canonicalJson(data) + '\n');
  fs.renameSync(tmp, roots.journalPath);
}

function clearJournal(roots) {
  try {
    if (fs.existsSync(roots.journalPath)) fs.unlinkSync(roots.journalPath);
  } catch { /* ignore */ }
}

function recoverJournal(roots) {
  const journal = readJournal(roots);
  if (!journal) return;

  if (journal.state === 'staged') {
    if (journal.stage_path && fs.existsSync(journal.stage_path)) {
      if (journal.stage_path.startsWith(roots.stagingDir)) {
        fs.rmSync(journal.stage_path, { recursive: true, force: true });
      }
    }
    clearJournal(roots);
  } else if (journal.state === 'pointer-ready') {
    if (journal.target_snapshot_path && fs.existsSync(journal.target_snapshot_path)) {
      commitPointers(roots, journal.target_snapshot_path, journal.new_snapshot);
      journal.state = 'committed';
      journal.updated_at = new Date().toISOString();
      writeJournal(roots, journal);
    }
  }
}

function commitPointers(roots, targetSnapshotDir, snapshotId) {
  // 1. Current symlink
  const tmpCurrent = path.join(roots.dataRoot, `.tmp-current-${process.pid}-${Date.now()}`);
  const relativeSnapshot = path.relative(roots.dataRoot, targetSnapshotDir);
  fs.symlinkSync(relativeSnapshot, tmpCurrent);
  fs.renameSync(tmpCurrent, roots.currentLink);

  // 2. Launcher symlink
  const tmpLauncher = path.join(roots.binDir, `.tmp-launcher-${process.pid}-${Date.now()}`);
  const targetCli = path.join(roots.dataRoot, 'current', 'package', 'dist', 'cli', 'evcrate.js');
  const relativeLauncherTarget = path.relative(roots.binDir, targetCli);
  fs.symlinkSync(relativeLauncherTarget, tmpLauncher);
  fs.renameSync(tmpLauncher, roots.launcherLink);

  // 3. Ownership marker
  const marker = {
    schema: SCHEMA_OWNED,
    data_root: roots.dataRoot,
    state_root: roots.stateRoot,
    bin_dir: roots.binDir,
    launcher_path: roots.launcherLink,
    current_snapshot: snapshotId,
    updated_at: new Date().toISOString()
  };
  fs.writeFileSync(roots.ownedPath, canonicalJson(marker) + '\n');
}

function resolveAssets(installerScriptPath, options) {
  const explicit = [options.archive, options.checksum, options.metadata];
  const someExplicit = explicit.some(Boolean);
  const allExplicit = explicit.every(Boolean);

  if (someExplicit && !allExplicit) {
    throw new Error('Explicit local install requires all three arguments: --archive, --checksum, and --metadata.');
  }

  if (allExplicit) {
    const archivePath = path.resolve(options.archive);
    const checksumPath = path.resolve(options.checksum);
    const metadataPath = path.resolve(options.metadata);

    if (!fs.existsSync(archivePath)) throw new Error(`Archive file not found: ${archivePath}`);
    if (!fs.existsSync(checksumPath)) throw new Error(`Checksum file not found: ${checksumPath}`);
    if (!fs.existsSync(metadataPath)) throw new Error(`Metadata file not found: ${metadataPath}`);

    return { archivePath, checksumPath, metadataPath };
  }

  // Adjacent discovery
  const searchDirs = [
    path.dirname(installerScriptPath),
    path.join(path.dirname(installerScriptPath), 'dist', 'release')
  ];

  let foundDir = null;
  let matchingArchives = [];

  for (const dir of searchDirs) {
    if (!fs.existsSync(dir)) continue;
    const files = fs.readdirSync(dir);
    const archives = files.filter((f) => /^evcrate-v.*-linux-x64\.tar\.gz$/u.test(f));
    if (archives.length > 0) {
      foundDir = dir;
      matchingArchives = archives;
      break;
    }
  }

  if (matchingArchives.length === 0) {
    throw new Error('No matching Linux release archives found adjacent to install.sh. Please provide --archive, --checksum, and --metadata.');
  }
  if (matchingArchives.length > 1) {
    throw new Error(`Ambiguous adjacent release assets: found multiple archives [${matchingArchives.join(', ')}]. Please provide --archive, --checksum, and --metadata.`);
  }

  const archiveName = matchingArchives[0];
  const archivePath = path.join(foundDir, archiveName);
  const checksumPath = `${archivePath}.sha256`;
  if (!fs.existsSync(checksumPath)) {
    throw new Error(`Matching sidecar checksum not found for adjacent archive: ${checksumPath}`);
  }

  const verMatch = /^evcrate-v([0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?)-linux-x64\.tar\.gz$/u.exec(archiveName);
  if (!verMatch) throw new Error(`Cannot parse semver version from archive name: ${archiveName}`);
  const version = verMatch[1];
  const metadataPath = path.join(foundDir, `evcrate-v${version}.release.json`);
  if (!fs.existsSync(metadataPath)) {
    throw new Error(`Matching release metadata not found for adjacent archive: ${metadataPath}`);
  }

  return { archivePath, checksumPath, metadataPath };
}

function parseAndValidateMetadata(metadataPath, archivePath, archiveSha256) {
  const raw = fs.readFileSync(metadataPath, 'utf8');
  let data;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Failed to parse release metadata JSON: ${err.message}`);
  }

  if (data.schema !== SCHEMA_RELEASE) {
    throw new Error(`Invalid metadata schema: ${data.schema}, expected ${SCHEMA_RELEASE}`);
  }

  const linuxPlatform = data.platforms && data.platforms['linux-x64'];
  if (!linuxPlatform) throw new Error('Metadata missing platforms["linux-x64"] definition');

  const archiveBase = path.basename(archivePath);
  if (linuxPlatform.archive_name !== archiveBase) {
    throw new Error(`Metadata archive_name "${linuxPlatform.archive_name}" does not match file "${archiveBase}"`);
  }

  const archiveStat = fs.statSync(archivePath);
  if (linuxPlatform.size !== archiveStat.size) {
    throw new Error(`Metadata archive size ${linuxPlatform.size} does not match file size ${archiveStat.size}`);
  }

  if (linuxPlatform.sha256 !== archiveSha256) {
    throw new Error(`Metadata archive SHA-256 does not match file SHA-256`);
  }

  return data;
}

function executeStagedSmoke(stagedCliPath, expectedVersion) {
  if (!fs.existsSync(stagedCliPath)) {
    throw new Error(`Staged CLI not found at ${stagedCliPath}`);
  }

  const output = execFileSync(process.execPath, [stagedCliPath, 'version', '--json'], {
    cwd: os.tmpdir(),
    shell: false,
    timeout: 10000,
    maxBuffer: 1024 * 1024,
    encoding: 'utf8'
  });

  let parsed;
  try {
    parsed = JSON.parse(output);
  } catch (err) {
    throw new Error(`Staged CLI version --json emitted invalid JSON: ${err.message}`);
  }

  if (parsed.status !== 'ok' || !parsed.payload || parsed.payload.version !== expectedVersion) {
    throw new Error(`Staged CLI validation failed: unexpected response ${output.trim()}`);
  }
}

function pruneOldSnapshots(roots, keepSnapshotIds) {
  if (!fs.existsSync(roots.snapshotsDir)) return;
  const entries = fs.readdirSync(roots.snapshotsDir);
  const keepSet = new Set(keepSnapshotIds.filter(Boolean));

  for (const entry of entries) {
    if (keepSet.has(entry)) continue;
    const p = path.join(roots.snapshotsDir, entry);
    try {
      fs.rmSync(p, { recursive: true, force: true });
    } catch { /* ignore */ }
  }
}

function performInstall(roots, assets, options, isRepair = false) {
  // 1. Verify sidecar
  const sidecarRaw = fs.readFileSync(assets.checksumPath, 'utf8');
  const sidecar = parseSidecar(sidecarRaw, path.basename(assets.archivePath));

  // 2. Verify archive SHA-256
  const archiveSha = sha256File(assets.archivePath);
  if (archiveSha !== sidecar.sha256) {
    throw new Error(`Archive SHA-256 ${archiveSha} does not match sidecar ${sidecar.sha256}`);
  }

  // 3. Verify metadata
  const metadata = parseAndValidateMetadata(assets.metadataPath, assets.archivePath, archiveSha);

  // 4. Current snapshot check for idempotent retry
  let oldSnapshotId = null;
  let oldSnapshotDir = null;
  if (fs.existsSync(roots.currentLink)) {
    try {
      const currentTarget = fs.readlinkSync(roots.currentLink);
      oldSnapshotDir = path.resolve(roots.dataRoot, currentTarget);
      oldSnapshotId = path.basename(oldSnapshotDir);
    } catch { /* ignore */ }
  }

  if (!isRepair && oldSnapshotId && oldSnapshotId.startsWith(`${metadata.version}-${archiveSha}-`)) {
    const journal = readJournal(roots);
    if (journal && journal.state === 'committed' && journal.new_snapshot === oldSnapshotId) {
      return {
        action: 'idempotent',
        snapshotId: oldSnapshotId,
        version: metadata.version,
        backupSnapshot: null,
        launcher: roots.launcherLink
      };
    }
  }

  // 5. Stage fresh extraction
  fs.mkdirSync(roots.stagingDir, { recursive: true, mode: 0o700 });
  const stageDir = path.join(roots.stagingDir, `stage-${process.pid}-${Date.now()}`);
  fs.mkdirSync(stageDir, { recursive: true, mode: 0o700 });

  writeJournal(roots, {
    schema: SCHEMA_JOURNAL,
    operation: isRepair ? 'repair' : (oldSnapshotId ? 'upgrade' : 'install'),
    state: 'staged',
    old_snapshot: oldSnapshotId,
    new_snapshot: null,
    archive_digest: archiveSha,
    stage_path: stageDir,
    target_snapshot_path: null,
    current_pointer: roots.currentLink,
    launcher_path: roots.launcherLink,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  });

  // Extract
  const extractedRecords = extractTarArchive(assets.archivePath, stageDir);

  // Verify inventory digest
  const computedInventoryDigest = computeInventoryDigest(extractedRecords);
  if (computedInventoryDigest !== metadata.inventory_digest) {
    throw new Error(`Extracted inventory digest ${computedInventoryDigest} does not match metadata ${metadata.inventory_digest}`);
  }

  // Verify package.json version
  const pkgJsonPath = path.join(stageDir, 'package', 'package.json');
  if (!fs.existsSync(pkgJsonPath)) throw new Error('package/package.json missing from extracted payload');
  const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
  if (pkg.version !== metadata.version) {
    throw new Error(`package.json version ${pkg.version} does not match metadata ${metadata.version}`);
  }

  // Verify build manifests
  if (metadata.build_manifest_digests) {
    for (const [key, expectedSha] of Object.entries(metadata.build_manifest_digests)) {
      const rel = key === 'all' ? '.evcrate/build-manifest.json' : `.evcrate/build-manifest-${key}.json`;
      const full = path.join(stageDir, 'package', rel);
      if (!fs.existsSync(full)) throw new Error(`Build manifest ${rel} missing from stage`);
      const fileSha = sha256File(full);
      if (fileSha !== expectedSha) throw new Error(`Build manifest ${rel} SHA-256 mismatch`);
    }
  }

  // Verify controller closure
  if (metadata.controller_closure_digest) {
    const controllerDir = path.join(stageDir, 'package', '.evcrate', 'source', '.evcrate', 'bin');
    if (!fs.existsSync(controllerDir)) throw new Error('Controller closure directory missing from stage');
    const controllerMap = {};
    for (const entry of ADVISOR_CONTROLLER_FILES) {
      const full = path.join(controllerDir, entry);
      if (!fs.existsSync(full)) throw new Error(`Controller file missing from stage: ${entry}`);
      controllerMap[`.evcrate/bin/${entry}`] = sha256File(full);
    }
    const computedClosureDigest = sha256Bytes(canonicalJsonBytes(controllerMap));
    if (computedClosureDigest !== metadata.controller_closure_digest) {
      throw new Error(`Controller closure digest ${computedClosureDigest} does not match metadata ${metadata.controller_closure_digest}`);
    }
  }

  // Non-mutating smoke check
  const stagedCli = path.join(stageDir, 'package', 'dist', 'cli', 'evcrate.js');
  executeStagedSmoke(stagedCli, metadata.version);

  // Determine generation
  fs.mkdirSync(roots.snapshotsDir, { recursive: true, mode: 0o700 });
  const existingSnapshots = fs.readdirSync(roots.snapshotsDir);
  const prefix = `${metadata.version}-${archiveSha}-`;
  let maxGen = 0;
  for (const s of existingSnapshots) {
    if (s.startsWith(prefix)) {
      const genStr = s.slice(prefix.length);
      const g = parseInt(genStr, 10);
      if (Number.isSafeInteger(g) && g > maxGen) maxGen = g;
    }
  }
  const nextGen = maxGen + 1;
  const newSnapshotId = `${prefix}${nextGen}`;
  const targetSnapshotDir = path.join(roots.snapshotsDir, newSnapshotId);

  // Write snapshot receipt
  const immutableFiles = {};
  for (const r of extractedRecords) {
    immutableFiles[r.path] = { size: r.size, sha256: r.sha256, mode: r.mode };
  }
  const receipt = {
    schema: SCHEMA_RECEIPT,
    snapshot_id: newSnapshotId,
    version: metadata.version,
    archive_name: path.basename(assets.archivePath),
    archive_sha256: archiveSha,
    inventory_digest: computedInventoryDigest,
    immutable_files: immutableFiles,
    mutable_paths: [...MUTABLE_PATHS],
    installed_at: new Date().toISOString()
  };
  fs.writeFileSync(path.join(stageDir, 'installer-receipt.json'), canonicalJson(receipt) + '\n');

  // Promote stage to snapshot
  fs.renameSync(stageDir, targetSnapshotDir);

  // Update journal to pointer-ready
  writeJournal(roots, {
    schema: SCHEMA_JOURNAL,
    operation: isRepair ? 'repair' : (oldSnapshotId ? 'upgrade' : 'install'),
    state: 'pointer-ready',
    old_snapshot: oldSnapshotId,
    new_snapshot: newSnapshotId,
    archive_digest: archiveSha,
    stage_path: null,
    target_snapshot_path: targetSnapshotDir,
    current_pointer: roots.currentLink,
    launcher_path: roots.launcherLink,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  });

  // Commit pointers
  commitPointers(roots, targetSnapshotDir, newSnapshotId);

  // Update journal to committed
  writeJournal(roots, {
    schema: SCHEMA_JOURNAL,
    operation: isRepair ? 'repair' : (oldSnapshotId ? 'upgrade' : 'install'),
    state: 'committed',
    old_snapshot: oldSnapshotId,
    new_snapshot: newSnapshotId,
    archive_digest: archiveSha,
    stage_path: null,
    target_snapshot_path: targetSnapshotDir,
    current_pointer: roots.currentLink,
    launcher_path: roots.launcherLink,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  });

  // Prune older snapshots (retaining new snapshot and old backup snapshot)
  pruneOldSnapshots(roots, [newSnapshotId, oldSnapshotId]);

  return {
    action: isRepair ? 'repaired' : (oldSnapshotId ? 'upgraded' : 'installed'),
    snapshotId: newSnapshotId,
    version: metadata.version,
    backupSnapshot: oldSnapshotDir,
    launcher: roots.launcherLink
  };
}

function performRollback(roots, targetSnapshotArg) {
  if (!fs.existsSync(roots.snapshotsDir)) {
    throw new Error('No snapshots directory found; rollback unavailable.');
  }

  const snapshots = fs.readdirSync(roots.snapshotsDir);
  if (snapshots.length === 0) {
    throw new Error('No snapshots found in data directory.');
  }

  let targetId = targetSnapshotArg;
  if (!targetId) {
    throw new Error(`Rollback requires an explicit snapshot identifier. Available snapshots: [${snapshots.join(', ')}]`);
  }

  if (targetId.includes('/')) targetId = path.basename(targetId);

  const targetDir = path.join(roots.snapshotsDir, targetId);
  if (!fs.existsSync(targetDir)) {
    throw new Error(`Snapshot "${targetId}" not found in ${roots.snapshotsDir}. Available: [${snapshots.join(', ')}]`);
  }

  // Read and validate receipt
  const receiptPath = path.join(targetDir, 'installer-receipt.json');
  if (!fs.existsSync(receiptPath)) {
    throw new Error(`Snapshot receipt missing: ${receiptPath}`);
  }

  const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
  if (receipt.schema !== SCHEMA_RECEIPT) {
    throw new Error(`Invalid snapshot receipt schema: ${receipt.schema}`);
  }

  // Validate immutable files
  for (const [relPath, fileMeta] of Object.entries(receipt.immutable_files)) {
    // Check if this path is under mutable paths
    const isMutable = MUTABLE_PATHS.some((m) => {
      const prefix = m.replace(/\/\*\*$/u, '').replace(/\*$/u, '');
      return relPath === prefix || relPath.startsWith(`${prefix}/`);
    });
    if (isMutable) continue;

    const full = path.join(targetDir, 'package', relPath);
    if (!fs.existsSync(full)) {
      throw new Error(`Immutable file missing from rollback target: ${relPath}`);
    }
    const stat = fs.lstatSync(full);
    if (stat.isSymbolicLink() || !stat.isFile()) {
      throw new Error(`Immutable entry is not regular file: ${relPath}`);
    }
    if (stat.size !== fileMeta.size) {
      throw new Error(`Immutable file size changed in rollback target: ${relPath}`);
    }
    const actualSha = sha256File(full);
    if (actualSha !== fileMeta.sha256) {
      throw new Error(`Immutable file content hash changed in rollback target: ${relPath}`);
    }
  }

  // Determine current snapshot for backup reporting
  let displacedSnapshotDir = null;
  let displacedSnapshotId = null;
  if (fs.existsSync(roots.currentLink)) {
    try {
      displacedSnapshotDir = path.resolve(roots.dataRoot, fs.readlinkSync(roots.currentLink));
      displacedSnapshotId = path.basename(displacedSnapshotDir);
    } catch { /* ignore */ }
  }

  // Commit pointers
  commitPointers(roots, targetDir, targetId);

  writeJournal(roots, {
    schema: SCHEMA_JOURNAL,
    operation: 'rollback',
    state: 'committed',
    old_snapshot: displacedSnapshotId,
    new_snapshot: targetId,
    archive_digest: receipt.archive_sha256,
    stage_path: null,
    target_snapshot_path: targetDir,
    current_pointer: roots.currentLink,
    launcher_path: roots.launcherLink,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  });

  return {
    action: 'rolled_back',
    snapshotId: targetId,
    version: receipt.version,
    backupSnapshot: displacedSnapshotDir,
    launcher: roots.launcherLink
  };
}

function performUninstall(roots) {
  // Idempotent check
  if (!fs.existsSync(roots.dataRoot) && !fs.existsSync(roots.stateRoot) && !fs.existsSync(roots.launcherLink)) {
    return { action: 'already_uninstalled' };
  }

  // Remove launcher symlink if owned
  if (fs.existsSync(roots.launcherLink)) {
    try {
      const st = fs.lstatSync(roots.launcherLink);
      if (st.isSymbolicLink()) {
        fs.unlinkSync(roots.launcherLink);
      }
    } catch { /* ignore */ }
  }

  // Remove data root snapshots and staging
  if (fs.existsSync(roots.dataRoot)) {
    try {
      fs.rmSync(roots.dataRoot, { recursive: true, force: true });
    } catch { /* ignore */ }
  }

  // Remove state files
  if (fs.existsSync(roots.stateRoot)) {
    try {
      fs.rmSync(roots.stateRoot, { recursive: true, force: true });
    } catch { /* ignore */ }
  }

  return { action: 'uninstalled' };
}

function parseCliArgs(rawArgs) {
  let subcommand = 'install';
  let targetSnapshot = null;
  const options = {
    archive: null,
    checksum: null,
    metadata: null,
    dataDir: null,
    stateDir: null,
    binDir: null
  };

  let i = 0;
  if (rawArgs.length > 0 && !rawArgs[0].startsWith('-')) {
    const cmd = rawArgs[0];
    if (cmd === 'install' || cmd === 'repair' || cmd === 'upgrade' || cmd === 'rollback' || cmd === 'uninstall') {
      subcommand = cmd === 'upgrade' ? 'install' : cmd;
      i = 1;
      if (subcommand === 'rollback' && rawArgs.length > 1 && !rawArgs[1].startsWith('-')) {
        targetSnapshot = rawArgs[1];
        i = 2;
      }
    }
  }

  while (i < rawArgs.length) {
    const arg = rawArgs[i];
    if (arg === '--archive' && i + 1 < rawArgs.length) {
      options.archive = rawArgs[i + 1];
      i += 2;
    } else if (arg === '--checksum' && i + 1 < rawArgs.length) {
      options.checksum = rawArgs[i + 1];
      i += 2;
    } else if (arg === '--metadata' && i + 1 < rawArgs.length) {
      options.metadata = rawArgs[i + 1];
      i += 2;
    } else if (arg === '--data-dir' && i + 1 < rawArgs.length) {
      options.dataDir = rawArgs[i + 1];
      i += 2;
    } else if (arg === '--state-dir' && i + 1 < rawArgs.length) {
      options.stateDir = rawArgs[i + 1];
      i += 2;
    } else if (arg === '--bin-dir' && i + 1 < rawArgs.length) {
      options.binDir = rawArgs[i + 1];
      i += 2;
    } else if (arg === '--help' || arg === '-h') {
      subcommand = 'help';
      i += 1;
    } else {
      throw new Error(`Unrecognized argument: ${arg}`);
    }
  }

  return { subcommand, targetSnapshot, options };
}

function main() {
  const installerScriptPath = process.argv[2];
  const userArgs = process.argv.slice(3);

  const { subcommand, targetSnapshot, options } = parseCliArgs(userArgs);

  if (subcommand === 'help') {
    console.log(`EVCrate Linux Unpack Installer

Usage:
  ./install.sh [command] [options]

Commands:
  install               Install or upgrade EVCrate (default)
  repair                Perform same-version repair from clean assets
  rollback <snapshot>   Roll back to a retained prior snapshot
  uninstall             Safely remove installer-owned roots and launcher

Options:
  --archive <path>      Path to evcrate-v*-linux-x64.tar.gz
  --checksum <path>     Path to evcrate-v*-linux-x64.tar.gz.sha256
  --metadata <path>     Path to evcrate-v*.release.json
  --data-dir <path>     Override XDG_DATA_HOME/evcrate
  --state-dir <path>    Override XDG_STATE_HOME/evcrate
  --bin-dir <path>      Override ~/.local/bin
  -h, --help            Show this help message
`);
    return;
  }

  const roots = resolveRoots(options);
  const lock = acquireLock(roots);

  try {
    recoverJournal(roots);

    let result;
    if (subcommand === 'uninstall') {
      result = performUninstall(roots);
      console.log('✓ Successfully uninstalled EVCrate CLI.');
      return;
    }

    if (subcommand === 'rollback') {
      result = performRollback(roots, targetSnapshot);
      console.log(`✓ Rolled back to snapshot: ${result.snapshotId} (v${result.version})`);
      if (result.backupSnapshot) {
        console.log(`  Displaced snapshot preserved at: ${result.backupSnapshot}`);
      }
      return;
    }

    const assets = resolveAssets(installerScriptPath, options);
    const isRepair = subcommand === 'repair';
    result = performInstall(roots, assets, options, isRepair);

    if (result.action === 'idempotent') {
      console.log(`✓ EVCrate v${result.version} is already installed at snapshot ${result.snapshotId}.`);
      return;
    }

    console.log(`✓ Successfully ${result.action} EVCrate v${result.version}`);
    console.log(`  Snapshot: ${result.snapshotId}`);
    console.log(`  Launcher: ${result.launcher}`);
    if (result.backupSnapshot) {
      console.log(`  Backup preserved at: ${result.backupSnapshot}`);
    } else {
      console.log('  No prior backup snapshot.');
    }

    const pathDirs = (process.env.PATH || '').split(':');
    if (!pathDirs.includes(roots.binDir)) {
      console.log(`\nNote: "${roots.binDir}" is not in your PATH.`);
      console.log(`Add it by appending to your profile:\n  export PATH="${roots.binDir}:$PATH"`);
    }

    console.log('\nNext steps to publish coding agent harnesses:');
    console.log('  evcrate publish --dry-run');
    console.log('  evcrate publish --apply');
  } finally {
    releaseLock(lock);
  }
}

try {
  main();
} catch (err) {
  console.error(`Installation error: ${err.message}`);
  process.exit(1);
}
EVCRATE_INSTALLER_PAYLOAD
