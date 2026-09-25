/**
 * @file ui-security-accessibility.spec.mjs
 * Security, sandbox isolation, and accessibility assertions for embedded Advisor Plugin UI (Phase E03).
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

test('E03 Security: self-contained bundle contains no eval or Function constructors', () => {
  const html = fs.readFileSync(UI_INDEX_HTML, 'utf8');
  assert.equal(/\beval\s*\(/.test(html), false, 'Bundle must not contain eval()');
  assert.equal(/new\s+Function\s*\(/.test(html), false, 'Bundle must not use new Function()');
});

test('E03 Security: embedded document does not invoke fetch, WebSocket, or XHR', () => {
  const html = fs.readFileSync(UI_INDEX_HTML, 'utf8');

  // Verify no direct network client invocations in plugin UI
  assert.equal(/window\.fetch\s*\(/.test(html), false, 'Plugin UI must not invoke window.fetch');
  assert.equal(/new\s+WebSocket\s*\(/.test(html), false, 'Plugin UI must not instantiate WebSocket');
  assert.equal(/new\s+XMLHttpRequest\s*\(/.test(html), false, 'Plugin UI must not instantiate XMLHttpRequest');
  assert.equal(/new\s+EventSource\s*\(/.test(html), false, 'Plugin UI must not instantiate EventSource');
});

test('E03 Security: embedded document does not invoke filesystem pickers', () => {
  const html = fs.readFileSync(UI_INDEX_HTML, 'utf8');

  // Verify that the embedded bundle does not invoke showDirectoryPicker
  assert.equal(/window\.showDirectoryPicker\s*\(/.test(html), false, 'Plugin UI must not invoke showDirectoryPicker');
});

test('E03 Security: opaque-origin CSP compatibility', () => {
  const html = fs.readFileSync(UI_INDEX_HTML, 'utf8');

  // Must not have base tag
  assert.equal(/<base\b/i.test(html), false, 'Self-contained document must not contain <base> tag');

  // Must not have external forms
  assert.equal(/<form\b[^>]*action=/i.test(html), false, 'Must not contain external form actions');

  // All styles and scripts must be inline
  assert.equal(/<link\b[^>]*rel=["']stylesheet["']/i.test(html), false);
  assert.equal(/<script\b[^>]*src=/i.test(html), false);
});
