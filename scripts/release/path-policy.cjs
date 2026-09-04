'use strict';

const { compareCodePoints, sha256Canonical } = require('./canonical-json.cjs');

const MAX_FILES = 100000;
const MAX_DIRECTORIES = 100000;
const MAX_FILE_BYTES = 16 * 1024 * 1024; // 16 MiB
const MAX_TOTAL_EXPANDED_BYTES = 512 * 1024 * 1024; // 512 MiB
const MAX_ARCHIVE_BYTES = 512 * 1024 * 1024; // 512 MiB
const MAX_PATH_BYTES = 4096; // 4 KiB
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
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f]/u;

function validateInventoryPath(relativePath) {
  if (typeof relativePath !== 'string') {
    throw new TypeError('Inventory path must be a string');
  }
  if (relativePath.length === 0) {
    throw new Error('Empty path is invalid');
  }
  if (Buffer.byteLength(relativePath, 'utf8') > MAX_PATH_BYTES) {
    throw new Error(`Path exceeds maximum length of ${MAX_PATH_BYTES} bytes: ${relativePath}`);
  }
  if (relativePath.includes('\\')) {
    throw new Error(`Path contains backslash: ${relativePath}`);
  }
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

  // Deny-listed prefixes/suffixes
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

function computeInventoryDigest(records) {
  if (!Array.isArray(records)) {
    throw new TypeError('Records must be an array');
  }
  const sorted = [...records].sort((a, b) => compareCodePoints(a.path, b.path));

  const seenPaths = new Set();
  const seenLower = new Set();
  for (const rec of sorted) {
    if (seenPaths.has(rec.path)) {
      throw new Error(`Duplicate path in inventory: ${rec.path}`);
    }
    const lower = rec.path.toLowerCase();
    if (seenLower.has(lower)) {
      throw new Error(`Case-fold collision in inventory: ${rec.path}`);
    }
    seenPaths.add(rec.path);
    seenLower.add(lower);
  }

  const canonicalRecords = sorted.map((rec) => ({
    mode: rec.mode,
    path: rec.path,
    sha256: rec.sha256,
    size: rec.size
  }));

  return sha256Canonical(canonicalRecords);
}

module.exports = {
  MAX_FILES,
  MAX_DIRECTORIES,
  MAX_FILE_BYTES,
  MAX_TOTAL_EXPANDED_BYTES,
  MAX_ARCHIVE_BYTES,
  MAX_PATH_BYTES,
  MAX_PATH_DEPTH,
  MUTABLE_PATHS,
  validateInventoryPath,
  computeInventoryDigest
};
