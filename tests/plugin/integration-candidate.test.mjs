/**
 * @file integration-candidate.test.mjs
 * Validation tests for early G1 EVCrate Advisor Plugin integration candidate closure,
 * manifest inventory, and archive structure (Phase E02).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..', '..');
const PLUGIN_DIR = path.join(ROOT_DIR, 'plugin');
const CANDIDATE_TAR_PATH = path.join(ROOT_DIR, 'artifacts', 'candidate', 'evcrate-advisor-plugin-0.1.0-candidate.tar.gz');

const pluginRequire = createRequire(new URL('../../plugin/package.json', import.meta.url));
const { validateManifest } = pluginRequire('@dam-hopper/plugin-sdk');

test('Integration Candidate: candidate package exists and manifest is valid', () => {
  assert.ok(fs.existsSync(CANDIDATE_TAR_PATH), `Candidate archive missing at ${CANDIDATE_TAR_PATH}`);
  const stats = fs.statSync(CANDIDATE_TAR_PATH);
  assert.ok(stats.size > 0, 'Candidate archive must not be empty');

  const manifestPath = path.join(PLUGIN_DIR, 'manifest.json');
  assert.ok(fs.existsSync(manifestPath), 'plugin/manifest.json missing');

  const manifestRaw = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const validated = validateManifest(manifestRaw);

  assert.equal(validated.id, 'evcrate.advisor');
  assert.equal(validated.version, '0.1.0');
  assert.equal(validated.publisher, 'evcrate');
  assert.equal(validated.entrypoints.backend.runtime, 'node');
  assert.equal(validated.entrypoints.backend.entry, 'backend/worker.cjs');
  if (validated.entrypoints.ui !== undefined) {
    assert.equal(validated.entrypoints.ui.entry, 'ui/index.html');
    assert.equal(validated.entrypoints.ui.mode, 'opaque-srcdoc');
    assert.ok(Array.isArray(validated.navigation));
  } else {
    assert.equal(validated.navigation, undefined, 'Candidate without UI must not include navigation');
  }

  const expectedCaps = [
    'history.refresh',
    'history.summary',
    'history.page',
    'history.detail',
    'policy.readCurrent',
    'evaluations.list',
    'evaluations.read',
    'evaluations.compare'
  ];
  assert.deepEqual(validated.capabilities, expectedCaps);
});

test('Integration Candidate: inventory matches disk files and checksums', () => {
  const manifestPath = path.join(PLUGIN_DIR, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

  assert.ok(Array.isArray(manifest.inventory), 'inventory must be an array');
  assert.ok(manifest.inventory.length > 20, 'inventory must contain complete closure');

  // manifest.json must not be listed in its own inventory
  const selfEntry = manifest.inventory.find(i => i.path === 'manifest.json');
  assert.equal(selfEntry, undefined, 'manifest.json must not be listed in inventory');

  for (const item of manifest.inventory) {
    const fullPath = path.join(PLUGIN_DIR, item.path);
    assert.ok(fs.existsSync(fullPath), `Inventory file missing on disk: ${item.path}`);

    const data = fs.readFileSync(fullPath);
    assert.equal(data.length, item.size, `Size mismatch for ${item.path}`);

    const digest = crypto.createHash('sha256').update(data).digest('hex');
    assert.equal(digest, item.sha256, `SHA-256 mismatch for ${item.path}`);

    const expectedMode = item.path === 'backend/worker.cjs' ? 0o755 : 0o644;
    assert.equal(item.mode, expectedMode, `Mode mismatch for ${item.path}`);
  }
});

test('Integration Candidate: archive entries match manifest inventory exactly', () => {
  const manifestPath = path.join(PLUGIN_DIR, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

  const gzipped = fs.readFileSync(CANDIDATE_TAR_PATH);
  const tarBuf = zlib.gunzipSync(gzipped);

  const archiveEntries = new Map();
  let offset = 0;

  while (offset + 512 <= tarBuf.length) {
    const header = tarBuf.subarray(offset, offset + 512);
    // Two consecutive zero blocks indicate EOF
    if (header.every(b => b === 0)) break;

    const name = header.toString('utf8', 0, 100).replace(/\0.*$/, '');
    const prefix = header.toString('utf8', 345, 500).replace(/\0.*$/, '');
    const fullPath = prefix ? `${prefix}/${name}` : name;
    const typeflag = String.fromCharCode(header[156]);

    const sizeStr = header.toString('ascii', 124, 136).replace(/\0.*$/, '').trim();
    const size = parseInt(sizeStr, 8) || 0;

    offset += 512;
    const data = tarBuf.subarray(offset, offset + size);
    const pad = size % 512 === 0 ? 0 : 512 - (size % 512);
    offset += size + pad;

    // Normal file or pax header
    if (typeflag === '0' || typeflag === '\0') {
      const digest = crypto.createHash('sha256').update(data).digest('hex');
      archiveEntries.set(fullPath, { size, sha256: digest });
    }
  }

  // Root manifest.json must be in the archive
  assert.ok(archiveEntries.has('manifest.json'), 'manifest.json must be in archive root');

  // Every inventory file must be in the archive with matching size and sha256
  for (const inv of manifest.inventory) {
    assert.ok(archiveEntries.has(inv.path), `Archive missing inventory item: ${inv.path}`);
    const inArchive = archiveEntries.get(inv.path);
    assert.equal(inArchive.size, inv.size, `Archive size mismatch for ${inv.path}`);
    assert.equal(inArchive.sha256, inv.sha256, `Archive SHA-256 mismatch for ${inv.path}`);
  }

  // No path in archive should have a package/ prefix
  for (const p of archiveEntries.keys()) {
    assert.ok(!p.startsWith('package/'), `Archive path ${p} must not start with package/`);
  }
});
