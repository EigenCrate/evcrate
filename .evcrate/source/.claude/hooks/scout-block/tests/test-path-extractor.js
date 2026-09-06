#!/usr/bin/env node
/**
 * test-path-extractor.js - Unit tests for path-extractor module
 */

const {
  extractFromToolInput,
  extractFromCommand,
  looksLikePath,
  splitCommandSegments,
  cleanCommandSegment
} = require('../path-extractor.cjs');

const toolInputTests = [
  {
    input: { file_path: 'packages/web/src/index.js' },
    expected: ['packages/web/src/index.js'],
    desc: 'file_path extraction'
  },
  {
    input: { path: 'node_modules' },
    expected: ['node_modules'],
    desc: 'path extraction'
  },
  {
    input: { pattern: '**/node_modules/**' },
    expected: ['**/node_modules/**'],
    desc: 'pattern extraction'
  },
  {
    input: { command: 'ls packages/web/node_modules' },
    hasPath: 'packages/web/node_modules',
    desc: 'command path extraction'
  },
  {
    input: { file_path: '/home/user/project/node_modules/pkg/index.js' },
    expected: ['/home/user/project/node_modules/pkg/index.js'],
    desc: 'absolute path extraction'
  },
  {
    input: { file_path: 'packages/web/node_modules/react/package.json', path: 'src' },
    hasPath: 'packages/web/node_modules',
    desc: 'multiple params extraction'
  },
  {
    input: { path: 'node_modules', pattern: 'test' },
    expected: ['node_modules/', 'node_modules'],
    desc: 'Grep path with node_modules emits directory candidate'
  },
  {
    input: { file_path: 'build/app.js' },
    expected: ['build/app.js'],
    desc: 'Read file_path under build directory'
  }
];

const commandTests = [
  { cmd: 'ls packages/web/node_modules', hasPath: 'packages/web/node_modules', desc: 'ls with subfolder' },
  { cmd: 'cat "path with spaces/file.js"', hasPath: 'path with spaces/file.js', desc: 'quoted path' },
  { cmd: "cat 'single/quoted/path.js'", hasPath: 'single/quoted/path.js', desc: 'single quoted path' },
  { cmd: 'cd apps/api/node_modules && ls', hasPath: 'apps/api/node_modules', desc: 'cd with chained command' },
  { cmd: 'rm -rf node_modules', hasPath: 'node_modules', desc: 'rm with flags' },
  { cmd: 'cp -r dist/ backup/', hasPath: 'dist', desc: 'cp with flags' },

  // Note: Build commands may extract 'build' as a blocked dir name, but this is handled
  // at the dispatcher level (build commands bypass path checking entirely).
  // The path extractor correctly identifies blocked dir names like 'build'.
  { cmd: 'npm run build', hasPath: 'build', desc: 'npm run build (extracts build)' },
  { cmd: 'pnpm build', hasPath: 'build', desc: 'pnpm build (extracts build)' },
  { cmd: 'cd build', hasPath: 'build', desc: 'cd build (extracts build)' },
  { cmd: 'yarn test', hasPath: null, desc: 'yarn test (no blocked paths)' },
  { cmd: 'npm install', hasPath: null, desc: 'npm install (no blocked paths)' },

  // New language runners & subcommand syntax (Phase 01)
  { cmd: 'python -m build', hasPath: null, desc: 'python -m build (does not emit build)' },
  { cmd: 'python3 -m build', hasPath: null, desc: 'python3 -m build (does not emit build)' },
  { cmd: 'python setup.py build', hasPath: null, desc: 'python setup.py build (does not emit build)' },
  { cmd: 'zig build', hasPath: null, desc: 'zig build (does not emit build)' },
  { cmd: 'deno task build', hasPath: null, desc: 'deno task build (does not emit build)' },
  { cmd: 'dotnet build', hasPath: null, desc: 'dotnet build (does not emit build)' },
  { cmd: 'swift build', hasPath: null, desc: 'swift build (does not emit build)' },

  // Directory exploration commands - emit directory-marked candidates
  { cmd: 'cd build', hasPath: 'build/', desc: 'cd build (emits directory-marked candidate)' },
  { cmd: 'ls dist', hasPath: 'dist/', desc: 'ls dist (emits directory-marked candidate)' },
  { cmd: 'tree target', hasPath: 'target/', desc: 'tree target (emits directory-marked candidate)' },
  { cmd: 'cat build/app.js', hasPath: 'build/app.js', desc: 'cat build/app.js (extracts path)' },
  // Directory operand detection under exploration commands (Phase 02)
  { cmd: 'cd packages/web/build', hasPath: 'packages/web/build/', desc: 'cd subfolder build emits trailing slash' },
  { cmd: 'ls apps/api/dist', hasPath: 'apps/api/dist/', desc: 'ls subfolder dist emits trailing slash' },
  { cmd: 'echo build', hasPath: 'build', desc: 'echo build emits bare token without trailing slash' },
  { cmd: 'cat src/build-tools.js', hasPath: 'src/build-tools.js', desc: 'safe path containing build' },
  { cmd: 'ls distro/file.js', hasPath: 'distro/file.js', desc: 'safe path containing dist' },
  { cmd: 'cat vendorized/file', hasPath: 'vendorized/file', desc: 'safe path containing vendor' }
];

const looksLikePathTests = [
  { str: 'packages/web/src', expected: true, desc: 'relative path with slashes' },
  { str: '/home/user/project', expected: true, desc: 'absolute path' },
  { str: './src/index.js', expected: true, desc: 'dot-relative path' },
  { str: '../parent/file.js', expected: true, desc: 'parent-relative path' },
  { str: 'file.txt', expected: true, desc: 'file with extension' },
  { str: 'node_modules', expected: true, desc: 'blocked dir name' },
  { str: 'ls', expected: false, desc: 'command word' },
  { str: 'npm', expected: false, desc: 'package manager' },
  { str: '-rf', expected: false, desc: 'flag' },
  { str: '123', expected: false, desc: 'number' },
];

const splitCommandTests = [
  {
    cmd: 'cd packages/foo && npm run build',
    expected: ['cd packages/foo', 'npm run build'],
    desc: 'split on &&'
  },
  {
    cmd: 'echo "a && b" && npm test',
    expected: ['echo "a && b"', 'npm test'],
    desc: 'respect quotes with &&'
  },
  {
    cmd: 'cd packages/foo; npm run build && npm test',
    expected: ['cd packages/foo', 'npm run build', 'npm test'],
    desc: 'split on ; and &&'
  },
  {
    cmd: 'pnpm --filter web run build 2>&1 | tail -100',
    expected: ['pnpm --filter web run build 2>&1', 'tail -100'],
    desc: 'split on pipe without splitting 2>&1'
  },
  {
    cmd: '(cd packages/foo && npm run build)',
    expected: ['(cd packages/foo', 'npm run build)'],
    desc: 'split inside parentheses'
  }
];

const cleanCommandTests = [
  {
    segment: '(cd packages/foo',
    expected: 'cd packages/foo',
    desc: 'clean leading parenthesis'
  },
  {
    segment: 'npm run build)',
    expected: 'npm run build',
    desc: 'clean trailing parenthesis'
  },
  {
    segment: 'NODE_ENV=production npm run build',
    expected: 'npm run build',
    desc: 'clean single env var'
  },
  {
    segment: 'FOO="bar baz" BAR=1 npm test',
    expected: 'npm test',
    desc: 'clean multiple env vars with quotes'
  }
];

console.log('Testing path-extractor module...\n');

let passed = 0;
let failed = 0;

// Tool input tests
console.log('--- Tool Input Tests ---');
for (const test of toolInputTests) {
  const result = extractFromToolInput(test.input);
  let success;

  if (test.expected) {
    success = test.expected.every(e => result.includes(e));
  } else if (test.hasPath) {
    success = result.some(p => p.includes(test.hasPath));
  }

  if (success) {
    console.log(`\x1b[32m✓\x1b[0m ${test.desc}`);
    passed++;
  } else {
    console.log(`\x1b[31m✗\x1b[0m ${test.desc}: got ${JSON.stringify(result)}`);
    failed++;
  }
}

// Command tests
console.log('\n--- Command Tests ---');
for (const test of commandTests) {
  const result = extractFromCommand(test.cmd);
  let success;

  if (test.hasPath === null) {
    // Build commands should extract few/no blocked-related paths
    success = result.length === 0 || !result.some(p =>
      p.includes('node_modules') || p.includes('dist') || p.includes('build')
    );
  } else {
    success = result.some(p => p.includes(test.hasPath));
  }

  if (success) {
    console.log(`\x1b[32m✓\x1b[0m ${test.desc}: ${JSON.stringify(result)}`);
    passed++;
  } else {
    console.log(`\x1b[31m✗\x1b[0m ${test.desc}: expected path containing '${test.hasPath}', got ${JSON.stringify(result)}`);
    failed++;
  }
}

// looksLikePath tests
console.log('\n--- looksLikePath Tests ---');
for (const test of looksLikePathTests) {
  const result = looksLikePath(test.str);
  const success = result === test.expected;

  if (success) {
    console.log(`\x1b[32m✓\x1b[0m ${test.desc}: '${test.str}' -> ${result}`);
    passed++;
  } else {
    console.log(`\x1b[31m✗\x1b[0m ${test.desc}: expected ${test.expected}, got ${result}`);
    failed++;
  }
}

// splitCommandSegments tests
console.log('\n--- splitCommandSegments Tests ---');
for (const test of splitCommandTests) {
  const result = splitCommandSegments(test.cmd);
  const success = JSON.stringify(result) === JSON.stringify(test.expected);

  if (success) {
    console.log(`\x1b[32m✓\x1b[0m ${test.desc}: ${JSON.stringify(result)}`);
    passed++;
  } else {
    console.log(`\x1b[31m✗\x1b[0m ${test.desc}: expected ${JSON.stringify(test.expected)}, got ${JSON.stringify(result)}`);
    failed++;
  }
}

// cleanCommandSegment tests
console.log('\n--- cleanCommandSegment Tests ---');
for (const test of cleanCommandTests) {
  const result = cleanCommandSegment(test.segment);
  const success = result === test.expected;

  if (success) {
    console.log(`\x1b[32m✓\x1b[0m ${test.desc}: '${test.segment}' -> '${result}'`);
    passed++;
  } else {
    console.log(`\x1b[31m✗\x1b[0m ${test.desc}: expected '${test.expected}', got '${result}'`);
    failed++;
  }
}

console.log(`\nResults: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
