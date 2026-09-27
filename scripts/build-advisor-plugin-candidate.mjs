#!/usr/bin/env node
'use strict';

/**
 * @file build-advisor-plugin-candidate.mjs
 * Deterministic builder and validator for early G1 EVCrate Advisor Plugin integration candidate.
 *
 * Produces:
 * - plugin/manifest.json (with updated exact inventory)
 * - artifacts/candidate/evcrate-advisor-plugin-0.1.0-candidate.tar.gz
 *
 * Flags:
 *   --check     Verify current manifest inventory and package consistency without rebuilding
 *   --out-dir   Custom output directory for candidate artifact (default: artifacts/candidate)
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { collectPluginPackageRecords } = require('./plugin/package-inventory.cjs');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const PLUGIN_DIR = path.join(ROOT_DIR, 'plugin');
function writeOctal(buf, offset, length, value) {
  const str = value.toString(8).padStart(length - 1, '0');
  buf.write(str, offset, length - 1, 'ascii');
  buf[offset + length - 1] = 0;
}

function calcTarChecksum(header) {
  let sum = 0;
  for (let i = 0; i < 512; i += 1) {
    sum += header[i];
  }
  return sum;
}

function createUstarHeader(name, size, mode, typeflag = '0', prefix = '') {
  const header = Buffer.alloc(512, 0);
  header.write(name, 0, 100, 'utf8');
  writeOctal(header, 100, 8, mode);
  writeOctal(header, 108, 8, 0);
  writeOctal(header, 116, 8, 0);
  writeOctal(header, 124, 12, size);
  writeOctal(header, 136, 12, 0);
  header.fill(0x20, 148, 156);
  header[156] = typeflag.charCodeAt(0);
  header.write('ustar\0', 257, 6, 'ascii');
  header.write('00', 263, 2, 'ascii');
  if (prefix) {
    header.write(prefix, 345, 155, 'utf8');
  }
  const chk = calcTarChecksum(header);
  header.write(chk.toString(8).padStart(6, '0'), 148, 6, 'ascii');
  header[154] = 0;
  header[155] = 0x20;
  return header;
}

function formatPaxRecord(key, value) {
  let len = 3 + Buffer.byteLength(key, 'utf8') + Buffer.byteLength(value, 'utf8');
  let line = `${len} ${key}=${value}\n`;
  while (Buffer.byteLength(line, 'utf8') !== len) {
    len = Buffer.byteLength(line, 'utf8');
    line = `${len} ${key}=${value}\n`;
  }
  return Buffer.from(line, 'utf8');
}

function findUstarSplit(fullPath) {
  let lastSlash = -1;
  while (true) {
    const nextSlash = fullPath.indexOf('/', lastSlash + 1);
    if (nextSlash === -1) break;
    const prefix = fullPath.slice(0, nextSlash);
    const name = fullPath.slice(nextSlash + 1);
    const prefixBytes = Buffer.byteLength(prefix, 'utf8');
    const nameBytes = Buffer.byteLength(name, 'utf8');
    if (prefixBytes > 0 && prefixBytes <= 155 && nameBytes > 0 && nameBytes <= 100) {
      return { prefix, name };
    }
    lastSlash = nextSlash;
  }
  return null;
}

/**
 * Creates deterministic tar.gz with exact paths (no package/ prefix).
 *
 * @param {Array<{ path: string, data: Buffer, mode: number }>} records
 * @param {string} outputPath
 * @returns {{ path: string, size: number, sha256: string }}
 */
function createDeterministicTarArchive(records, outputPath) {
  const chunks = [];
  let paxCounter = 0;

  for (const rec of records) {
    const archivePath = rec.path;
    const data = rec.data;
    const normMode = (rec.mode & 0o111) !== 0 ? 0o755 : 0o644;
    const totalNameBytes = Buffer.byteLength(archivePath, 'utf8');

    if (totalNameBytes <= 100) {
      chunks.push(createUstarHeader(archivePath, data.length, normMode, '0'));
    } else {
      const split = findUstarSplit(archivePath);
      if (split) {
        chunks.push(createUstarHeader(split.name, data.length, normMode, '0', split.prefix));
      } else {
        paxCounter += 1;
        const paxData = formatPaxRecord('path', archivePath);
        chunks.push(createUstarHeader(`PaxHeaders.0/${paxCounter}`, paxData.length, 0o644, 'x'));
        chunks.push(paxData);
        const paxPad = paxData.length % 512 === 0 ? 0 : 512 - (paxData.length % 512);
        if (paxPad > 0) chunks.push(Buffer.alloc(paxPad, 0));

        chunks.push(createUstarHeader('file', data.length, normMode, '0'));
      }
    }

    chunks.push(data);
    const dataPad = data.length % 512 === 0 ? 0 : 512 - (data.length % 512);
    if (dataPad > 0) chunks.push(Buffer.alloc(dataPad, 0));
  }

  chunks.push(Buffer.alloc(1024, 0));
  const tarBuffer = Buffer.concat(chunks);
  const gzipped = zlib.gzipSync(tarBuffer, { level: 9, mtime: 0 });

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, gzipped);

  return {
    path: outputPath,
    size: gzipped.length,
    sha256: crypto.createHash('sha256').update(gzipped).digest('hex')
  };
}

/**
 * Recursively walks a directory and collects file paths relative to base.
 */
function walkDir(dir, base = '') {
  let results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const ent of entries) {
    const rel = base ? `${base}/${ent.name}` : ent.name;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      results = results.concat(walkDir(full, rel));
    } else if (ent.isFile()) {
      results.push(rel);
    }
  }
  return results;
}

/**
 * Collects all candidate closure records and inventory.
 */
function collectCandidateRecords() {
  const { records, inventory } = collectPluginPackageRecords(PLUGIN_DIR);
  return { records, inventory };
}

/**
 * Builds candidate manifest with inventory.
 */
function buildManifest(inventory, hasUi = false) {
  return {
    manifestVersion: 1,
    id: 'evcrate.advisor',
    version: '0.1.0',
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
      ...(hasUi ? {
        ui: {
          entry: 'ui/index.html',
          mode: 'opaque-srcdoc'
        }
      } : {})
    },
    ...(hasUi ? {
      navigation: [
        {
          id: 'evcrate.advisor.overview',
          title: 'Advisor Metrics',
          route: '/plugins/evcrate.advisor'
        }
      ]
    } : {}),
    inventory
  };
}

async function main() {
  const args = process.argv.slice(2);
  const isCheck = args.includes('--check');
  const outDirIdx = args.indexOf('--out-dir');
  const outDir = outDirIdx !== -1 && args[outDirIdx + 1]
    ? path.resolve(args[outDirIdx + 1])
    : path.join(ROOT_DIR, 'artifacts', 'candidate');

  const candidateTarGzPath = path.join(outDir, 'evcrate-advisor-plugin-0.1.0-candidate.tar.gz');
  const manifestPath = path.join(PLUGIN_DIR, 'manifest.json');

  const { records, inventory } = collectCandidateRecords();
  const hasUi = records.some(r => r.path === 'ui/index.html');
  const manifest = buildManifest(inventory, hasUi);

  // Validate via @dam-hopper/plugin-sdk if available
  try {
    const { validateManifest } = await import(pathToFileURL(path.join(PLUGIN_DIR, 'node_modules', '@dam-hopper', 'plugin-sdk', 'dist', 'manifest.js')).href);
    validateManifest(manifest);
  } catch (err) {
    console.error('Manifest validation failed:', err.message);
    process.exit(1);
  }

  const manifestJsonText = JSON.stringify(manifest, null, 2) + '\n';
  const manifestBuffer = Buffer.from(manifestJsonText, 'utf8');

  if (isCheck) {
    if (!fs.existsSync(manifestPath)) {
      console.error(`Error: Manifest file missing at ${manifestPath}`);
      process.exit(1);
    }
    const currentManifestText = fs.readFileSync(manifestPath, 'utf8');
    if (currentManifestText !== manifestJsonText) {
      console.error('Error: plugin/manifest.json is not up to date with current inventory.');
      process.exit(1);
    }
    if (!fs.existsSync(candidateTarGzPath)) {
      console.error(`Error: Candidate tarball missing at ${candidateTarGzPath}`);
      process.exit(1);
    }
    console.log(`✓ Check passed: plugin/manifest.json and candidate package ${candidateTarGzPath} are valid.`);
    return;
  }

  // Write updated manifest.json
  fs.writeFileSync(manifestPath, manifestJsonText);
  console.log(`Updated ${manifestPath} with ${inventory.length} inventory entries.`);

  // Build tarball including manifest.json at root
  const allRecords = [
    { path: 'manifest.json', data: manifestBuffer, mode: 0o644 },
    ...records
  ];
  allRecords.sort((a, b) => a.path.localeCompare(b.path));

  const result = createDeterministicTarArchive(allRecords, candidateTarGzPath);
  console.log(`✓ Built candidate package: ${result.path}`);
  console.log(`  Size: ${result.size} bytes`);
  console.log(`  SHA-256: ${result.sha256}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
