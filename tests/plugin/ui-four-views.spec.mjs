/**
 * @file ui-four-views.spec.mjs
 * End-to-end scenarios for embedded DamHopper Advisor Plugin four views (Phase E03).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../..');
const UI_INDEX_HTML = path.join(ROOT_DIR, 'plugin', 'ui', 'index.html');

test('E03 Four Views: self-contained UI document exists and is under 5 MiB', () => {
  assert.ok(fs.existsSync(UI_INDEX_HTML), 'plugin/ui/index.html must exist');
  const stat = fs.statSync(UI_INDEX_HTML);
  assert.ok(stat.size > 10000, `UI document should be non-trivial, got ${stat.size} bytes`);
  assert.ok(stat.size <= 5 * 1024 * 1024, `UI document must be <= 5 MiB, got ${stat.size} bytes`);
});

test('E03 Four Views: self-contained document contains no external assets or scripts', () => {
  const html = fs.readFileSync(UI_INDEX_HTML, 'utf8');

  // Must not have external script src
  const scriptSrcs = (html.match(/<script[^>]+src=["'][^"']*["']/gi) || []);
  assert.equal(scriptSrcs.length, 0, 'Must have zero external script src tags');

  // Must not have external stylesheet links
  const styleLinks = (html.match(/<link[^>]+rel=["']stylesheet["']/gi) || []);
  assert.equal(styleLinks.length, 0, 'Must have zero external stylesheet link tags');

  // Must contain inlined classic script and root element
  assert.ok(html.includes('<div id="root"></div>'));
  assert.ok(html.includes('<script>'));
  assert.ok(html.includes('</script>'));
});

test('E03 Four Views: manifest declares opaque-srcdoc UI entrypoint and navigation', () => {
  const manifestPath = path.join(ROOT_DIR, 'plugin', 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

  assert.ok(manifest.entrypoints.ui, 'manifest must declare ui entrypoint');
  assert.equal(manifest.entrypoints.ui.entry, 'ui/index.html');
  assert.equal(manifest.entrypoints.ui.mode, 'opaque-srcdoc');

  assert.ok(Array.isArray(manifest.navigation), 'manifest must declare navigation');
  assert.ok(manifest.navigation.length > 0);
  assert.equal(manifest.navigation[0].id, 'evcrate.advisor.overview');
  assert.equal(manifest.navigation[0].route, '/plugins/evcrate.advisor');
});

test('E03 Four Views: candidate tarball includes valid ui/index.html inventory entry', () => {
  const manifestPath = path.join(ROOT_DIR, 'plugin', 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

  const uiEntry = manifest.inventory.find(item => item.path === 'ui/index.html');
  assert.ok(uiEntry, 'Inventory must contain ui/index.html');
  assert.ok(uiEntry.size > 0);
  assert.equal(uiEntry.sha256.length, 64);
  assert.equal(uiEntry.mode, 0o644);
});
