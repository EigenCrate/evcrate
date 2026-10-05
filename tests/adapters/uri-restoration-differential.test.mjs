import test from 'node:test';
import assert from 'node:assert/strict';
import { restoreIndexedTokens } from '../../dist/adapters/projection-utils.js';
import { applyReplacements } from '../../dist/adapters/codex/transforms.js';

function legacyRestoreTuples(text, saved) {
  let result = text;
  for (const [token, original] of saved) {
    result = result.replaceAll(token, original);
  }
  return result;
}

function legacyRestoreStrings(text, prefix, saved) {
  let result = text;
  for (let i = 0; i < saved.length; i += 1) {
    result = result.replaceAll(`${prefix}${i}__`, saved[i]);
  }
  return result;
}

test('restoreIndexedTokens: empty saved array returns original text unchanged', () => {
  const text = 'No tokens here or maybe __URI_0__';
  assert.equal(restoreIndexedTokens(text, '__URI_', []), text);
});

test('restoreIndexedTokens: common-case single and multiple tokens restore identically to legacy', () => {
  const text = 'Visit __EVCRATE_VSCODE_URI_0__ or __EVCRATE_VSCODE_URI_1__ for docs.';
  const saved = [
    ['__EVCRATE_VSCODE_URI_0__', 'https://example.com/one'],
    ['__EVCRATE_VSCODE_URI_1__', 'https://example.com/two']
  ];
  const expected = legacyRestoreTuples(text, saved);
  const actual = restoreIndexedTokens(text, '__EVCRATE_VSCODE_URI_', saved);
  assert.equal(actual, expected);
  assert.equal(actual, 'Visit https://example.com/one or https://example.com/two for docs.');
});

test('restoreIndexedTokens: string-array table shape restores identically to legacy', () => {
  const text = 'Harness: __EVCRATE_HARNESS_URL_0__ and __EVCRATE_HARNESS_URL_1__';
  const saved = ['https://claude.ai/docs', 'https://github.com/EigenCrate'];
  const expected = legacyRestoreStrings(text, '__EVCRATE_HARNESS_URL_', saved);
  const actual = restoreIndexedTokens(text, '__EVCRATE_HARNESS_URL_', saved);
  assert.equal(actual, expected);
  assert.equal(actual, 'Harness: https://claude.ai/docs and https://github.com/EigenCrate');
});

test('restoreIndexedTokens: duplicate token occurrences in text are all replaced', () => {
  const text = '__OMP_URI_0__ repeated: __OMP_URI_0__ and again __OMP_URI_0__';
  const saved = ['https://omp.example.org'];
  const expected = legacyRestoreStrings(text, '__OMP_URI_', saved);
  const actual = restoreIndexedTokens(text, '__OMP_URI_', saved);
  assert.equal(actual, expected);
  assert.equal(actual, 'https://omp.example.org repeated: https://omp.example.org and again https://omp.example.org');
});

test('restoreIndexedTokens: out-of-bounds and non-matching tokens are left untouched', () => {
  const text = 'Valid: __PI_URL_0__, out-of-bounds: __PI_URL_99__, wrong-prefix: __OTHER_0__';
  const saved = ['https://pi.example.com'];
  const expected = legacyRestoreStrings(text, '__PI_URL_', saved);
  const actual = restoreIndexedTokens(text, '__PI_URL_', saved);
  assert.equal(actual, expected);
  assert.equal(actual, 'Valid: https://pi.example.com, out-of-bounds: __PI_URL_99__, wrong-prefix: __OTHER_0__');
});

test('restoreIndexedTokens: tokens with leading zeros remain untouched', () => {
  const text = 'Zero: __GEMINI_PROTECTED_01__ and normal: __GEMINI_PROTECTED_1__';
  const saved = ['first', 'second'];
  const expected = legacyRestoreStrings(text, '__GEMINI_PROTECTED_', saved);
  const actual = restoreIndexedTokens(text, '__GEMINI_PROTECTED_', saved);
  assert.equal(actual, expected);
  assert.equal(actual, 'Zero: __GEMINI_PROTECTED_01__ and normal: second');
});

test('restoreIndexedTokens: replacement template $$ in saved URL preserves legacy replaceAll behavior', () => {
  const text = 'Query: __URI_0__';
  const saved = ['https://api.example.com?filter=$$escaped'];
  const expected = legacyRestoreStrings(text, '__URI_', saved);
  const actual = restoreIndexedTokens(text, '__URI_', saved);
  assert.equal(actual, expected);
  assert.equal(actual, 'Query: https://api.example.com?filter=$escaped');
});

test('restoreIndexedTokens: replacement template $& in saved URL preserves legacy replaceAll behavior', () => {
  const text = 'Before __URI_0__ After';
  const saved = ['https://api.example.com?matched=$&value'];
  const expected = legacyRestoreStrings(text, '__URI_', saved);
  const actual = restoreIndexedTokens(text, '__URI_', saved);
  assert.equal(actual, expected);
  assert.equal(actual, 'Before https://api.example.com?matched=__URI_0__value After');
});

test('restoreIndexedTokens: replacement templates $` and $\' preserve legacy behavior', () => {
  const text = 'Prefix: __URI_0__ Suffix';
  const saved = ['https://api.example.com?prefix=$`&suffix=$\''];
  const expected = legacyRestoreStrings(text, '__URI_', saved);
  const actual = restoreIndexedTokens(text, '__URI_', saved);
  assert.equal(actual, expected);
});

test('restoreIndexedTokens: cascading token collision preserves legacy sequential replacement', () => {
  const text = 'Cascade: __TOKEN_0__';
  const saved = [
    ['__TOKEN_0__', 'reveals __TOKEN_1__'],
    ['__TOKEN_1__', 'final-resolution']
  ];
  const expected = legacyRestoreTuples(text, saved);
  const actual = restoreIndexedTokens(text, '__TOKEN_', saved);
  assert.equal(actual, expected);
  assert.equal(actual, 'Cascade: reveals final-resolution');
});

test('restoreIndexedTokens: adjacent URIs without whitespace', () => {
  const text = '__URI_0____URI_1__';
  const saved = ['https://a.org/', 'https://b.org/'];
  const expected = legacyRestoreStrings(text, '__URI_', saved);
  const actual = restoreIndexedTokens(text, '__URI_', saved);
  assert.equal(actual, expected);
  assert.equal(actual, 'https://a.org/https://b.org/');
});

test('restoreIndexedTokens: Unicode surrounding and within URIs', () => {
  const text = '日本語: __URI_0__ и русский текст: __URI_1__';
  const saved = ['https://ja.wikipedia.org/wiki/東京', 'https://ru.wikipedia.org/wiki/Москва'];
  const expected = legacyRestoreStrings(text, '__URI_', saved);
  const actual = restoreIndexedTokens(text, '__URI_', saved);
  assert.equal(actual, expected);
});

test('restoreIndexedTokens: scale parity check on 5,000 synthetic URIs', () => {
  const count = 5000;
  const saved = [];
  const parts = [];
  for (let i = 0; i < count; i += 1) {
    saved.push(`https://schemas.openxmlformats.org/spreadsheetml/2006/main/elem_${i}`);
    parts.push(`element_${i}: __EVCRATE_VSCODE_URI_${i}__`);
  }
  const text = parts.join('\n');
  const actual = restoreIndexedTokens(text, '__EVCRATE_VSCODE_URI_', saved);
  assert.ok(actual.startsWith('element_0: https://schemas.openxmlformats.org/spreadsheetml/2006/main/elem_0'));
  assert.ok(actual.endsWith(`element_${count - 1}: https://schemas.openxmlformats.org/spreadsheetml/2006/main/elem_${count - 1}`));
  assert.equal(actual.includes('__EVCRATE_VSCODE_URI_'), false);
});

test('applyReplacements (Codex): preserves literal valid URL containing $& without replacement-template expansion', () => {
  const input = 'Documentation at https://example.org/search?q=$& and more text';
  const expected = 'Documentation at https://example.org/search?q=$& and more text';
  assert.equal(applyReplacements(input), expected);
});

test('applyReplacements (Codex): preserves literal valid URL containing $$ without collapsing to single dollar', () => {
  const input = 'API endpoint https://example.org/$$slots/items and query https://example.org/?val=$$100';
  const expected = 'API endpoint https://example.org/$$slots/items and query https://example.org/?val=$$100';
  assert.equal(applyReplacements(input), expected);
});

test('applyReplacements (Codex): preserves literal valid URLs containing $\' and $`', () => {
  const input = 'Links: https://example.org/prefix?val=$`&tail=1 and https://example.org/suffix?val=$\'&lead=2';
  const expected = 'Links: https://example.org/prefix?val=$`&tail=1 and https://example.org/suffix?val=$\'&lead=2';
  assert.equal(applyReplacements(input), expected);
});

test('applyReplacements (Codex): URLs containing token patterns do not cascade into other URLs', () => {
  const input = 'First: https://example.org/__EVCRATE_GLOBAL_URL_1__ and second: https://example.org/resolved';
  const expected = 'First: https://example.org/__EVCRATE_GLOBAL_URL_1__ and second: https://example.org/resolved';
  assert.equal(applyReplacements(input), expected);
});

test('applyReplacements (Codex): preserves base callback edge behavior on authored tokens outside url bounds', () => {
  const input = 'Authored non-existent token: __EVCRATE_GLOBAL_URL_99__ in text';
  // Base callback: urls[Number(index)] ?? '', which resolves out-of-bounds indices to empty string
  const expected = 'Authored non-existent token:  in text';
  assert.equal(applyReplacements(input), expected);
});

test('applyReplacements (Codex): preserves protected URLs while performing non-URL canonical replacements', () => {
  const input = 'Migrate CLAUDE.md to AGENTS.md; see https://example.org/.claude/reference?q=$$test for claude details.';
  // Surrounding CLAUDE.md -> AGENTS.md, claude -> codex; URL https://example.org/.claude/reference?q=$$test preserved verbatim
  const expected = 'Migrate AGENTS.md to AGENTS.md; see https://example.org/.claude/reference?q=$$test for codex details.';
  assert.equal(applyReplacements(input), expected);
});

test('differential: sequential helper vs literal Codex applyReplacements semantics', () => {
  const dollarUrl = 'https://example.org/query?val=$$slots';
  // Sequential helper preserves legacy replaceAll template expansion ($$ -> $)
  const helperOutput = restoreIndexedTokens('Target: __TOKEN_0__', '__TOKEN_', [dollarUrl]);
  assert.equal(helperOutput, 'Target: https://example.org/query?val=$slots');

  // Codex applyReplacements preserves literal callback URL bytes ($$ retained)
  const codexOutput = applyReplacements(`Target: ${dollarUrl}`);
  assert.equal(codexOutput, 'Target: https://example.org/query?val=$$slots');
});
