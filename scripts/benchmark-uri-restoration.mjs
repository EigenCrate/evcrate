import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { restoreIndexedTokens } from '../dist/adapters/projection-utils.js';

const schemaPath = '.evcrate/source/.claude/skills/document-skills/docx/ooxml/schemas/ISO-IEC29500-4_2016/sml.xsd';
const content = readFileSync(schemaPath, 'utf8');

const URI_PATTERN = /(?<![A-Za-z0-9_./])(?:[A-Za-z][A-Za-z0-9+.-]*:|\/\/)[^\s<>"']+/gu;

// Prepare protected text and saved entries
const savedTuples = [];
const protectedText = content.replace(URI_PATTERN, (original) => {
  if (/^(?:claude|vscode):(?!\/\/)/iu.test(original)) return original;
  const token = `__EVCRATE_VSCODE_URI_${savedTuples.length}__`;
  savedTuples.push([token, original]);
  return token;
});

console.log(`Schema file size: ${content.length} bytes`);
console.log(`Extracted URIs: ${savedTuples.length}`);

// Measure legacy sequential replaceAll
function legacyRestore(text, saved) {
  let result = text;
  for (const [token, original] of saved) {
    result = result.replaceAll(token, original);
  }
  return result;
}

const t0 = performance.now();
const legacyResult = legacyRestore(protectedText, savedTuples);
const t1 = performance.now();
const legacyMs = t1 - t0;

// Measure new linear restoreIndexedTokens
const t2 = performance.now();
const newResult = restoreIndexedTokens(protectedText, '__EVCRATE_VSCODE_URI_', savedTuples);
const t3 = performance.now();
const newMs = t3 - t2;

console.log(`Legacy replaceAll duration: ${legacyMs.toFixed(2)} ms`);
console.log(`Linear restoreIndexedTokens duration: ${newMs.toFixed(2)} ms`);
console.log(`Speedup: ${(legacyMs / newMs).toFixed(1)}x faster`);
console.log(`Byte-for-byte identical output: ${legacyResult === newResult && legacyResult === content}`);

if (legacyResult !== newResult) {
  console.error('ERROR: Output mismatch between legacy and linear restoration!');
  process.exit(1);
}
