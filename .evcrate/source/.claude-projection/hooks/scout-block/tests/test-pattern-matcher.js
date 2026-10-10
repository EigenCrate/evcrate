#!/usr/bin/env node
/**
 * test-pattern-matcher.js - Unit tests for pattern-matcher module
 * Covers Phase 02 & Phase 04 requirements:
 * - Standard trailing-slash directory defaults
 * - Bare lexical tokens vs directory operands and descendants
 * - All 12 default heavy directories
 * - Safe near-matches
 * - Windows separators
 * - Matched pattern reporting
 * - Legacy bare custom patterns
 * - Negation rules
 * - Empty/missing file fallback
 */

const path = require('path');
const { loadPatterns, normalizePattern, createMatcher, matchPath, findMatchingPattern, DEFAULT_PATTERNS } = require('../pattern-matcher.cjs');

console.log('Testing pattern-matcher module...\n');

let passed = 0;
let failed = 0;

function assertTest(desc, condition, details = '') {
  if (condition) {
    console.log(`\x1b[32m✓\x1b[0m ${desc}`);
    passed++;
  } else {
    console.log(`\x1b[31m✗\x1b[0m ${desc} ${details}`);
    failed++;
  }
}

// === 1. Standard Defaults Structure ===
console.log('--- 1. Standard Defaults Structure ---');
assertTest('DEFAULT_PATTERNS contains exactly 12 entries', DEFAULT_PATTERNS.length === 12, `got ${DEFAULT_PATTERNS.length}`);
assertTest('All DEFAULT_PATTERNS end with trailing slash', DEFAULT_PATTERNS.every(p => p.endsWith('/')));
assertTest('No negation rules in DEFAULT_PATTERNS', DEFAULT_PATTERNS.every(p => !p.startsWith('!')));

// === 2. Standard Matcher: Directory Operands and Descendants ===
console.log('\n--- 2. Standard Matcher: Directory Operands & Descendants ---');
const standardMatcher = createMatcher(DEFAULT_PATTERNS);

const standardCases = [
  // Directory operands with trailing slash (must be BLOCKED)
  { path: 'node_modules/', expected: true, desc: 'root node_modules/ directory operand' },
  { path: 'build/', expected: true, desc: 'root build/ directory operand' },
  { path: 'dist/', expected: true, desc: 'root dist/ directory operand' },
  { path: 'target/', expected: true, desc: 'root target/ directory operand' },
  { path: 'coverage/', expected: true, desc: 'root coverage/ directory operand' },
  { path: 'packages/web/node_modules/', expected: true, desc: 'subfolder node_modules/ directory operand' },
  { path: 'apps/backend/build/', expected: true, desc: 'subfolder build/ directory operand' },
  { path: 'apps/api/dist/', expected: true, desc: 'subfolder dist/ directory operand' },

  // Descendants of heavy directories (must be BLOCKED)
  { path: 'node_modules/lodash/index.js', expected: true, desc: 'root node_modules content' },
  { path: 'dist/bundle.js', expected: true, desc: 'root dist content' },
  { path: 'build/output.js', expected: true, desc: 'root build content' },
  { path: '.git/objects/abc', expected: true, desc: 'root .git content' },
  { path: '.next/server/pages.js', expected: true, desc: 'root .next content' },
  { path: '.nuxt/dist/server.js', expected: true, desc: 'root .nuxt content' },
  { path: '__pycache__/file.pyc', expected: true, desc: 'root __pycache__ content' },
  { path: '.venv/bin/activate', expected: true, desc: 'root .venv content' },
  { path: 'venv/lib/python.py', expected: true, desc: 'root venv content' },
  { path: 'vendor/autoload.php', expected: true, desc: 'root vendor content' },
  { path: 'target/release/app', expected: true, desc: 'root target content' },
  { path: 'coverage/lcov.info', expected: true, desc: 'root coverage content' },
  { path: 'packages/web/node_modules/react/index.js', expected: true, desc: 'nested node_modules content' },
  { path: 'apps/web/build/out.js', expected: true, desc: 'nested build content' },
  { path: 'services/auth/dist/index.js', expected: true, desc: 'nested dist content' },
  { path: 'deep/nested/path/packages/web/node_modules/react/index.js', expected: true, desc: 'deeply nested node_modules content' },

  // Windows path separators (must be BLOCKED)
  { path: 'build\\output.js', expected: true, desc: 'windows separator in build path' },
  { path: 'packages\\web\\dist\\bundle.js', expected: true, desc: 'windows separator in nested dist path' },

  // Bare lexical tokens (must be ALLOWED under directory policy)
  { path: 'build', expected: false, desc: 'bare lexical token build is ALLOWED' },
  { path: 'node_modules', expected: false, desc: 'bare lexical token node_modules is ALLOWED' },
  { path: 'dist', expected: false, desc: 'bare lexical token dist is ALLOWED' },
  { path: 'target', expected: false, desc: 'bare lexical token target is ALLOWED' },

  // Safe near-matches (must be ALLOWED)
  { path: 'src/index.js', expected: false, desc: 'standard source file' },
  { path: 'src/build-tools.js', expected: false, desc: 'safe path containing build in filename' },
  { path: 'build-tools/script.sh', expected: false, desc: 'safe path with build- prefix' },
  { path: 'src/dist-utils.js', expected: false, desc: 'safe path with dist- prefix' },
  { path: 'distro/file.js', expected: false, desc: 'safe path with distro prefix' },
  { path: 'vendorized/file.js', expected: false, desc: 'safe path with vendorized prefix' },
  { path: 'my-node_modules-project/file.js', expected: false, desc: 'safe path with node_modules in name' },
  { path: 'README.md', expected: false, desc: 'root documentation file' }
];

for (const tc of standardCases) {
  const res = matchPath(standardMatcher, tc.path);
  assertTest(tc.desc, res.blocked === tc.expected, `(path: '${tc.path}', got blocked=${res.blocked})`);
}

// === 3. Matched Pattern Reporting ===
console.log('\n--- 3. Matched Pattern Reporting ---');
const reportBuild = matchPath(standardMatcher, 'build/output.js');
assertTest('Report build/ rule for build/output.js', reportBuild.pattern === 'build/', `got ${reportBuild.pattern}`);

const reportNested = matchPath(standardMatcher, 'packages/web/node_modules/react');
assertTest('Report node_modules/ rule for nested node_modules', reportNested.pattern === 'node_modules/', `got ${reportNested.pattern}`);

const reportDist = matchPath(standardMatcher, 'dist/bundle.js');
assertTest('Report dist/ rule for dist/bundle.js', reportDist.pattern === 'dist/', `got ${reportDist.pattern}`);

// === 4. Legacy Bare Custom Patterns Compatibility ===
console.log('\n--- 4. Legacy Bare Custom Patterns Compatibility ---');
const legacyPatterns = ['build', 'node_modules', 'custom_cache'];
const legacyMatcher = createMatcher(legacyPatterns);

assertTest('Legacy bare pattern blocks bare lexical token build', matchPath(legacyMatcher, 'build').blocked === true);
assertTest('Legacy bare pattern blocks bare lexical token node_modules', matchPath(legacyMatcher, 'node_modules').blocked === true);
assertTest('Legacy bare pattern blocks build/output.js', matchPath(legacyMatcher, 'build/output.js').blocked === true);
assertTest('Legacy bare pattern blocks nested subfolder/build', matchPath(legacyMatcher, 'apps/web/build').blocked === true);
assertTest('Legacy bare pattern allows unrelated path', matchPath(legacyMatcher, 'src/index.js').blocked === false);

// === 5. Negation Rules Handling ===
console.log('\n--- 5. Negation Rules Handling ---');
const negationPatterns = ['build/', '!packages/safe/build/', 'vendor/', '!src/vendor/'];
const negationMatcher = createMatcher(negationPatterns);

assertTest('Blocked path under build/ is blocked', matchPath(negationMatcher, 'build/output.js').blocked === true);
assertTest('Negated path under packages/safe/build/ is ALLOWED', matchPath(negationMatcher, 'packages/safe/build/app.js').blocked === false);
assertTest('Blocked path under vendor/ is blocked', matchPath(negationMatcher, 'vendor/lib.js').blocked === true);
assertTest('Negated path under src/vendor/ is ALLOWED (canonical comment example)', matchPath(negationMatcher, 'src/vendor/lib.js').blocked === false);
// === 6. Fallback and Empty Policy ===
console.log('\n--- 6. Fallback and Empty Policy ---');
const emptyFallback = loadPatterns('');
assertTest('Empty path falls back to DEFAULT_PATTERNS', emptyFallback === DEFAULT_PATTERNS);

const nonexistentFallback = loadPatterns('/nonexistent/path/.evcrateignore');
assertTest('Nonexistent file falls back to DEFAULT_PATTERNS', nonexistentFallback === DEFAULT_PATTERNS);

// === 7. Leading Slashes and Temp File Safety ===
console.log('\n--- 7. Leading Slashes and Temp File Safety ---');
assertTest('Leading backslash path does not throw RangeError', matchPath(standardMatcher, '\\Local\\Temp\\1790759856711-copilot-tool-output-674e060c7f0f45029339dc964f3ad433.txt').blocked === false);
assertTest('Leading forward slash path does not throw RangeError', matchPath(standardMatcher, '/Local/Temp/1790759856711-copilot-tool-output-674e060c7f0f45029339dc964f3ad433.txt').blocked === false);
assertTest('Windows absolute temp file path is allowed', matchPath(standardMatcher, 'C:\\Users\\f2s1\\AppData\\Local\\Temp\\1790759856711-copilot-tool-output-674e060c7f0f45029339dc964f3ad433.txt', 'C:\\Users\\f2s1\\my-project').blocked === false);
assertTest('POSIX absolute temp file path is allowed', matchPath(standardMatcher, '/tmp/1790759856711-copilot-tool-output-674e060c7f0f45029339dc964f3ad433.txt', '/home/user/my-project').blocked === false);
assertTest('Blocked relative path containing copilot-tool-output in name remains blocked', matchPath(standardMatcher, 'node_modules/copilot-tool-output.txt').blocked === true);
assertTest('Blocked absolute path containing copilot-tool-output in name remains blocked', matchPath(standardMatcher, 'C:\\Users\\f2s1\\my-project\\node_modules\\copilot-tool-output.txt', 'C:\\Users\\f2s1\\my-project').blocked === true);
assertTest('Blocked POSIX absolute path containing copilot-tool-output in name remains blocked', matchPath(standardMatcher, '/home/user/my-project/dist/copilot-tool-output.txt', '/home/user/my-project').blocked === true);

console.log(`\nResults: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
