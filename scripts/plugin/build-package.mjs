#!/usr/bin/env node
'use strict';

/**
 * @file build-package.mjs
 * Deterministic build wrapper for EVCrate Advisor Plugin package (Phase E04).
 *
 * Implements:
 * - Closure traversal starting from backend/worker.cjs
 * - Canonical inventory generation sorted by Unicode code point
 * - Exact logical members: manifest.json, inventory.json, contracts/*, backend/**, ui/index.html
 * - Rejection of tests, maps, fixtures, package manager files, and ambient files
 * - Output artifact: dist/advisor-plugin/evcrate-advisor-plugin-v<version>.tar.gz
 * - Sidecar receipt: dist/advisor-plugin/evcrate-advisor-plugin-v<version>.tar.gz.sha256
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { collectPluginPackageRecords, buildCanonicalManifest, compareCodePoints } = require('./package-inventory.cjs');
const { createDeterministicTarArchive } = require('./tar-builder.cjs');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..', '..');
const PLUGIN_DIR = path.join(ROOT_DIR, 'plugin');
const PKG_JSON_PATH = path.join(PLUGIN_DIR, 'package.json');

export async function buildPluginPackage(options = {}) {
  const isCheck = options.check || false;
  const outDir = options.outDir || path.join(ROOT_DIR, 'dist', 'advisor-plugin');

  const pkgJson = JSON.parse(fs.readFileSync(PKG_JSON_PATH, 'utf8'));
  const version = pkgJson.version || '0.1.0';
  const archiveName = `evcrate-advisor-plugin-v${version}.tar.gz`;
  const tarGzPath = path.join(outDir, archiveName);
  const sidecarPath = path.join(outDir, `${archiveName}.sha256`);

  const { records, inventory } = collectPluginPackageRecords(PLUGIN_DIR);
  const manifest = buildCanonicalManifest(inventory, pkgJson);

  // Validate via @dam-hopper/plugin-sdk if available
  try {
    const sdkPath = path.join(PLUGIN_DIR, 'node_modules', '@dam-hopper', 'plugin-sdk', 'dist', 'manifest.js');
    if (fs.existsSync(sdkPath)) {
      const { validateManifest } = await import(sdkPath);
      validateManifest(manifest);
    }
  } catch (err) {
    throw new Error(`Plugin manifest validation failed: ${err.message}`);
  }

  const manifestJsonText = JSON.stringify(manifest, null, 2) + '\n';
  const manifestBuffer = Buffer.from(manifestJsonText, 'utf8');

  const inventoryJsonText = JSON.stringify(inventory, null, 2) + '\n';
  const inventoryBuffer = Buffer.from(inventoryJsonText, 'utf8');

  // Archive records contain manifest.json, inventory.json, and all collected files
  const archiveRecords = [
    { path: 'manifest.json', data: manifestBuffer, mode: 0o644 },
    { path: 'inventory.json', data: inventoryBuffer, mode: 0o644 },
    ...records
  ];

  archiveRecords.sort((a, b) => compareCodePoints(a.path, b.path));

  if (isCheck) {
    if (!fs.existsSync(tarGzPath)) {
      throw new Error(`Package archive missing for check: ${tarGzPath}`);
    }
    if (!fs.existsSync(sidecarPath)) {
      throw new Error(`Package sidecar missing for check: ${sidecarPath}`);
    }
    const currentArchiveData = fs.readFileSync(tarGzPath);
    const currentSha256 = crypto.createHash('sha256').update(currentArchiveData).digest('hex');
    const sidecarText = fs.readFileSync(sidecarPath, 'utf8').trim();
    if (!sidecarText.startsWith(currentSha256)) {
      throw new Error(`Sidecar SHA256 mismatch for ${archiveName}`);
    }
    return { ok: true, path: tarGzPath, sha256: currentSha256 };
  }

  // Update plugin/manifest.json on disk for consistency
  const pluginManifestPath = path.join(PLUGIN_DIR, 'manifest.json');
  fs.writeFileSync(pluginManifestPath, manifestJsonText);

  // Write standalone inventory.json in plugin/ as well
  const pluginInventoryPath = path.join(PLUGIN_DIR, 'inventory.json');
  fs.writeFileSync(pluginInventoryPath, inventoryJsonText);

  const result = createDeterministicTarArchive(archiveRecords, tarGzPath);
  const sidecarContent = `${result.sha256}  ${archiveName}\n`;
  fs.writeFileSync(sidecarPath, sidecarContent);

  return {
    ok: true,
    version,
    archiveName,
    path: result.path,
    sidecarPath,
    size: result.size,
    sha256: result.sha256,
    fileCount: archiveRecords.length
  };
}

async function main() {
  const args = process.argv.slice(2);
  const check = args.includes('--check');
  const outDirIdx = args.indexOf('--out-dir');
  const outDir = outDirIdx !== -1 && args[outDirIdx + 1] ? path.resolve(args[outDirIdx + 1]) : undefined;

  try {
    const res = await buildPluginPackage({ check, outDir });
    if (check) {
      console.log(`✓ Check passed: ${res.path} is valid (${res.sha256})`);
    } else {
      console.log(`✓ Built plugin package: ${res.path}`);
      console.log(`  Version: ${res.version}`);
      console.log(`  Size: ${res.size} bytes`);
      console.log(`  SHA-256: ${res.sha256}`);
      console.log(`  Members: ${res.fileCount}`);
    }
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
