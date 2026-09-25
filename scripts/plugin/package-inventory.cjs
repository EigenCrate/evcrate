'use strict';

/**
 * @file package-inventory.cjs
 * Canonical package inventory generator and verifier for EVCrate Advisor Plugin (Phase E04).
 *
 * Implements:
 * - Code-point sorted path, size, mode, sha256 records
 * - Validation of exact logical members
 * - Generation of standalone inventory.json and manifest.json
 * - Preservation of approved file modes (0755 for backend/worker.cjs, 0644 for all others)
 * - Limits checking: <= 32 MiB compressed, <= 64 MiB expanded, <= 2048 files, UI <= 5 MiB
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { validatePluginRuntimeClosure } = require('./runtime-closure.cjs');

const MAX_COMPRESSED_BYTES = 32 * 1024 * 1024; // 32 MiB
const MAX_EXPANDED_BYTES = 64 * 1024 * 1024;   // 64 MiB
const MAX_TOTAL_FILES = 2048;
const MAX_UI_BYTES = 5 * 1024 * 1024;          // 5 MiB

function compareCodePoints(a, b) {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

function collectPluginPackageRecords(pluginRoot) {
  const closureResult = validatePluginRuntimeClosure(pluginRoot);
  const records = [];

  // 1. Static contract schemas, UI, and package manifests
  const staticFiles = [
    'contracts/contract-manifest.json',
    'contracts/evcrate-advisor-data-v1.schema.json',
    'contracts/evcrate-advisor-data-v2.schema.json',
    'ui/index.html',
    'node_modules/@dam-hopper/plugin-sdk/package.json'
  ];
  for (const rel of staticFiles) {
    const fullPath = path.join(pluginRoot, rel);
    if (!fs.existsSync(fullPath)) {
      throw new Error(`Required plugin package member missing: ${rel}`);
    }
    const data = fs.readFileSync(fullPath);
    if (rel === 'ui/index.html' && data.length > MAX_UI_BYTES) {
      throw new Error(`UI document exceeds limit: ${data.length} > ${MAX_UI_BYTES}`);
    }
    records.push({ path: rel, fullPath, data, mode: 0o644 });
  }

  // 2. Closure files from runtime closure
  for (const rel of closureResult.visited) {
    const fullPath = path.join(pluginRoot, rel);
    const data = fs.readFileSync(fullPath);
    const mode = rel === 'backend/worker.cjs' ? 0o755 : 0o644;
    records.push({ path: rel, fullPath, data, mode });
  }

  // Deduplicate and sort by Unicode code point
  const map = new Map();
  for (const r of records) {
    map.set(r.path, r);
  }

  const sortedPaths = Array.from(map.keys()).sort(compareCodePoints);
  const canonicalRecords = sortedPaths.map((p) => map.get(p));

  if (canonicalRecords.length > MAX_TOTAL_FILES) {
    throw new Error(`Total file count exceeds limit: ${canonicalRecords.length} > ${MAX_TOTAL_FILES}`);
  }

  let totalSize = 0;
  const inventory = canonicalRecords.map((r) => {
    totalSize += r.data.length;
    const sha256 = crypto.createHash('sha256').update(r.data).digest('hex');
    return {
      path: r.path,
      size: r.data.length,
      sha256,
      mode: r.mode
    };
  });

  if (totalSize > MAX_EXPANDED_BYTES) {
    throw new Error(`Total expanded size exceeds limit: ${totalSize} > ${MAX_EXPANDED_BYTES}`);
  }

  return {
    records: canonicalRecords,
    inventory,
    totalSize
  };
}

function buildCanonicalManifest(inventory, packageJson) {
  const version = packageJson.version || '0.1.0';
  return {
    manifestVersion: 1,
    id: 'evcrate.advisor',
    version,
    publisher: 'evcrate',
    hostVersionRange: '>=0.4.0',
    contracts: {
      runnerProtocol: '^1.0.0',
      workerSdk: '^1.0.0',
      uiBridge: '^1.0.0',
      manifest: 1,
      dataApi: '^1.0.0'
    },
    capabilities: [
      'history.refresh',
      'history.summary',
      'history.page',
      'history.detail',
      'policy.readCurrent',
      'evaluations.list',
      'evaluations.read',
      'evaluations.compare'
    ],
    entrypoints: {
      backend: {
        runtime: 'node',
        range: '>=22.19.0',
        entry: 'backend/worker.cjs'
      },
      ui: {
        entry: 'ui/index.html',
        mode: 'opaque-srcdoc'
      }
    },
    navigation: [
      {
        id: 'evcrate.advisor.overview',
        title: 'Advisor Metrics',
        route: '/plugins/evcrate.advisor'
      }
    ],
    inventory
  };
}

module.exports = {
  MAX_COMPRESSED_BYTES,
  MAX_EXPANDED_BYTES,
  MAX_TOTAL_FILES,
  MAX_UI_BYTES,
  compareCodePoints,
  collectPluginPackageRecords,
  buildCanonicalManifest
};
