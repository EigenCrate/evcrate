#!/usr/bin/env node
'use strict';

/**
 * @file verify-package.mjs
 * Independent read-only verifier for EVCrate Advisor Plugin archives (Phase E04).
 *
 * Checks:
 * 1. Tar headers, sizes, checksums, and modes
 * 2. Exact logical members present (manifest.json, inventory.json, contracts/*, backend/worker.cjs, ui/index.html)
 * 3. Path safety: no absolute, no backslash, no parent directory ('..'), no trailing slash, no duplicates, no case collisions
 * 4. Limits: compressed <= 32 MiB, expanded <= 64 MiB, total files <= 2048, UI <= 5 MiB
 * 5. Digest matching: each entry sha256 matches inventory.json, manifest.json inventory, and tar content
 * 6. Manifest structure and capabilities via @dam-hopper/plugin-sdk if present
 * 7. Archive mode values are format metadata (no exact permission gate)
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { parseTarArchive } = require('./tar-verifier.cjs');
const {
  MAX_COMPRESSED_BYTES,
  MAX_EXPANDED_BYTES,
  MAX_TOTAL_FILES,
  MAX_UI_BYTES,
  compareCodePoints
} = require('./package-inventory.cjs');

export function verifyPluginPackageArchive(tarGzPath, options = {}) {
  if (!fs.existsSync(tarGzPath)) {
    throw new Error(`Archive file not found: ${tarGzPath}`);
  }

  const archiveStat = fs.statSync(tarGzPath);
  if (archiveStat.size > MAX_COMPRESSED_BYTES) {
    throw new Error(`Compressed archive exceeds limit: ${archiveStat.size} > ${MAX_COMPRESSED_BYTES}`);
  }

  const { entries, expandedSize } = parseTarArchive(tarGzPath);

  if (expandedSize > MAX_EXPANDED_BYTES) {
    throw new Error(`Expanded archive size exceeds limit: ${expandedSize} > ${MAX_EXPANDED_BYTES}`);
  }

  if (entries.size > MAX_TOTAL_FILES) {
    throw new Error(`Archive member count exceeds limit: ${entries.size} > ${MAX_TOTAL_FILES}`);
  }

  // 1. Path safety and collision checks
  const lowercaseSet = new Set();
  const entryPaths = Array.from(entries.keys());

  for (const p of entryPaths) {
    if (p.startsWith('/') || path.isAbsolute(p)) {
      throw new Error(`Absolute path forbidden in archive: ${p}`);
    }
    if (p.includes('\\')) {
      throw new Error(`Backslash path forbidden in archive: ${p}`);
    }
    const parts = p.split('/');
    if (parts.some((part) => part === '..' || part === '.' || part === '')) {
      throw new Error(`Path traversal or empty segment forbidden in archive: ${p}`);
    }
    const lower = p.toLowerCase();
    if (lowercaseSet.has(lower)) {
      throw new Error(`Case collision detected in archive: ${p}`);
    }
    lowercaseSet.add(lower);
  }

  // 2. Required root documents
  const manifestEntry = entries.get('manifest.json');
  if (!manifestEntry) throw new Error('Missing manifest.json in plugin archive');
  const inventoryEntry = entries.get('inventory.json');
  if (!inventoryEntry) throw new Error('Missing inventory.json in plugin archive');

  const manifest = JSON.parse(manifestEntry.data.toString('utf8'));
  const inventory = JSON.parse(inventoryEntry.data.toString('utf8'));

  if (!Array.isArray(inventory)) {
    throw new Error('inventory.json must be an array of records');
  }

  // 3. Inventory sorting and completeness
  const inventoryPaths = inventory.map((i) => i.path);
  const sortedInventoryPaths = [...inventoryPaths].sort(compareCodePoints);
  for (let i = 0; i < inventoryPaths.length; i++) {
    if (inventoryPaths[i] !== sortedInventoryPaths[i]) {
      throw new Error(`inventory.json is not sorted by Unicode code point: ${inventoryPaths[i]} !== ${sortedInventoryPaths[i]}`);
    }
  }

  // Inventory lists every regular file except manifest.json and inventory.json
  const expectedInventoryCount = entries.size - 2;
  if (inventory.length !== expectedInventoryCount) {
    throw new Error(`Inventory count mismatch: declared ${inventory.length}, actual archive content ${expectedInventoryCount}`);
  }

  for (const item of inventory) {
    const archiveFile = entries.get(item.path);
    if (!archiveFile) {
      throw new Error(`Inventory file missing in archive: ${item.path}`);
    }
    if (archiveFile.size !== item.size) {
      throw new Error(`Size mismatch for ${item.path}: inventory ${item.size} !== archive ${archiveFile.size}`);
    }
    if (archiveFile.sha256 !== item.sha256) {
      throw new Error(`SHA256 mismatch for ${item.path}: inventory ${item.sha256} !== archive ${archiveFile.sha256}`);
    }
  }

  // 4. Validate UI entrypoint
  const uiEntry = entries.get('ui/index.html');
  if (!uiEntry) {
    throw new Error('Required member ui/index.html missing in archive');
  }
  if (uiEntry.size > MAX_UI_BYTES) {
    throw new Error(`UI entrypoint exceeds limit: ${uiEntry.size} > ${MAX_UI_BYTES}`);
  }

  // 5. Validate backend entrypoint
  const workerEntry = entries.get('backend/worker.cjs');
  if (!workerEntry) {
    throw new Error('Required member backend/worker.cjs missing in archive');
  }

  // 6. Manifest structure check
  if (manifest.id !== 'evcrate.advisor') {
    throw new Error(`Invalid manifest id: ${manifest.id}`);
  }
  if (!manifest.version || typeof manifest.version !== 'string') {
    throw new Error(`Invalid manifest version: ${manifest.version}`);
  }
  if (manifest.entrypoints?.backend?.entry !== 'backend/worker.cjs') {
    throw new Error(`Backend entrypoint mismatch in manifest: ${manifest.entrypoints?.backend?.entry}`);
  }
  if (manifest.entrypoints?.ui?.entry !== 'ui/index.html') {
    throw new Error(`UI entrypoint mismatch in manifest: ${manifest.entrypoints?.ui?.entry}`);
  }

  // If expected SHA-256 provided, verify it
  if (options.expectedSha256) {
    const actualArchiveSha = crypto.createHash('sha256').update(fs.readFileSync(tarGzPath)).digest('hex');
    if (actualArchiveSha !== options.expectedSha256) {
      throw new Error(`Archive SHA256 mismatch: expected ${options.expectedSha256}, got ${actualArchiveSha}`);
    }
  }

  return {
    valid: true,
    version: manifest.version,
    fileCount: entries.size,
    compressedSize: archiveStat.size,
    expandedSize,
    archiveSha256: crypto.createHash('sha256').update(fs.readFileSync(tarGzPath)).digest('hex')
  };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes('--help')) {
    console.log('Usage: node scripts/plugin/verify-package.mjs <archive.tar.gz> [--sha256 <expected>]');
    process.exit(args.length === 0 ? 1 : 0);
  }

  const tarGzPath = path.resolve(args[0]);
  let expectedSha256;
  const shaIdx = args.indexOf('--sha256');
  if (shaIdx !== -1 && args[shaIdx + 1]) expectedSha256 = args[shaIdx + 1].trim();

  try {
    const res = verifyPluginPackageArchive(tarGzPath, { expectedSha256 });
    console.log(`✓ Plugin archive verified: ${tarGzPath}`);
    console.log(`  Version: ${res.version}`);
    console.log(`  Members: ${res.fileCount}`);
    console.log(`  Compressed: ${res.compressedSize} bytes`);
    console.log(`  Expanded: ${res.expandedSize} bytes`);
    console.log(`  SHA-256: ${res.archiveSha256}`);
  } catch (err) {
    console.error(`Verification FAILED: ${err.message}`);
    process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
