#!/usr/bin/env node

/**
 * Test script for .devkitignore functionality.
 * Tests that scout-block.cjs respects .devkitignore patterns.
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const scriptPath = path.join(__dirname, '..', 'scout-block.cjs');
const devkitIgnorePath = path.join(__dirname, '..', '..', '.devkitignore');
const devkitIgnoreBackupPath = devkitIgnorePath + '.backup';

// Backup original .devkitignore if it exists.
let originalDevkitIgnore = null;
if (fs.existsSync(devkitIgnorePath)) {
  originalDevkitIgnore = fs.readFileSync(devkitIgnorePath, 'utf-8');
  fs.copyFileSync(devkitIgnorePath, devkitIgnoreBackupPath);
}

function runTest(name, input, expected) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [scriptPath], {
      stdio: ['pipe', 'pipe', 'pipe']
    });
    let stderr = '';
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', error => resolve({
      name, expected, actual: 'ERROR', success: false, error: error.message
    }));
    child.on('close', status => {
      const actual = status === 2 ? 'BLOCKED' : status === 0 ? 'ALLOWED' : 'ERROR';
      resolve({ name, expected, actual, success: actual === expected, error: stderr.trim() });
    });
    child.stdin.end(JSON.stringify(input));
  });
}

function writeDevkitIgnore(patterns) {
  fs.writeFileSync(devkitIgnorePath, patterns.join('\n') + '\n');
}

function restoreDevkitIgnore() {
  if (originalDevkitIgnore !== null) {
    fs.writeFileSync(devkitIgnorePath, originalDevkitIgnore);
  } else if (fs.existsSync(devkitIgnorePath)) {
    fs.unlinkSync(devkitIgnorePath);
  }
  if (fs.existsSync(devkitIgnoreBackupPath)) {
    fs.unlinkSync(devkitIgnoreBackupPath);
  }
}

process.on('exit', restoreDevkitIgnore);

(async function main() {
console.log('Testing .devkitignore functionality...\n');

let passed = 0;
let failed = 0;

// Test 1: Default patterns work (with existing .devkitignore)
console.log('--- Test 1: Default patterns from .devkitignore ---');
let result = await runTest(
  'node_modules blocked (default)',
  { tool_name: 'Read', tool_input: { file_path: 'node_modules/pkg.json' } },
  'BLOCKED'
);
if (result.success) {
  console.log(`✓ ${result.name}: ${result.actual}`);
  passed++;
} else {
  console.log(`✗ ${result.name}: expected ${result.expected}, got ${result.actual}`);
  failed++;
}

// Test 2: Custom pattern - only block 'vendor' directory
console.log('\n--- Test 2: Custom .devkitignore with only "vendor" ---');
writeDevkitIgnore(['# Custom ignore', 'vendor']);

result = await runTest(
  'vendor blocked (custom)',
  { tool_name: 'Read', tool_input: { file_path: 'vendor/lib.js' } },
  'BLOCKED'
);
if (result.success) {
  console.log(`✓ ${result.name}: ${result.actual}`);
  passed++;
} else {
  console.log(`✗ ${result.name}: expected ${result.expected}, got ${result.actual}`);
  failed++;
}

result = await runTest(
  'node_modules ALLOWED when not in .devkitignore',
  { tool_name: 'Read', tool_input: { file_path: 'node_modules/pkg.json' } },
  'ALLOWED'
);
if (result.success) {
  console.log(`✓ ${result.name}: ${result.actual}`);
  passed++;
} else {
  console.log(`✗ ${result.name}: expected ${result.expected}, got ${result.actual}`);
  failed++;
}

// Test 3: Multiple custom patterns
console.log('\n--- Test 3: Multiple custom patterns ---');
writeDevkitIgnore(['vendor', 'temp', '.cache']);

result = await runTest(
  'vendor blocked',
  { tool_name: 'Grep', tool_input: { pattern: 'test', path: 'vendor' } },
  'BLOCKED'
);
if (result.success) {
  console.log(`✓ ${result.name}: ${result.actual}`);
  passed++;
} else {
  console.log(`✗ ${result.name}: expected ${result.expected}, got ${result.actual}`);
  failed++;
}

result = await runTest(
  'temp blocked',
  { tool_name: 'Bash', tool_input: { command: 'ls temp/' } },
  'BLOCKED'
);
if (result.success) {
  console.log(`✓ ${result.name}: ${result.actual}`);
  passed++;
} else {
  console.log(`✗ ${result.name}: expected ${result.expected}, got ${result.actual}`);
  failed++;
}

result = await runTest(
  '.cache blocked',
  { tool_name: 'Glob', tool_input: { pattern: '.cache/**' } },
  'BLOCKED'
);
if (result.success) {
  console.log(`✓ ${result.name}: ${result.actual}`);
  passed++;
} else {
  console.log(`✗ ${result.name}: expected ${result.expected}, got ${result.actual}`);
  failed++;
}

result = await runTest(
  'src still allowed',
  { tool_name: 'Read', tool_input: { file_path: 'src/index.js' } },
  'ALLOWED'
);
if (result.success) {
  console.log(`✓ ${result.name}: ${result.actual}`);
  passed++;
} else {
  console.log(`✗ ${result.name}: expected ${result.expected}, got ${result.actual}`);
  failed++;
}

// Test 4: Comments and empty lines ignored
console.log('\n--- Test 4: Comments and empty lines handled ---');
writeDevkitIgnore(['# This is a comment', '', 'blockeddir', '# Another comment', '']);

result = await runTest(
  'blockeddir blocked',
  { tool_name: 'Read', tool_input: { file_path: 'blockeddir/file.txt' } },
  'BLOCKED'
);
if (result.success) {
  console.log(`✓ ${result.name}: ${result.actual}`);
  passed++;
} else {
  console.log(`✗ ${result.name}: expected ${result.expected}, got ${result.actual}`);
  failed++;
}

result = await runTest(
  'otherdir allowed',
  { tool_name: 'Read', tool_input: { file_path: 'otherdir/file.txt' } },
  'ALLOWED'
);
if (result.success) {
  console.log(`✓ ${result.name}: ${result.actual}`);
  passed++;
} else {
  console.log(`✗ ${result.name}: expected ${result.expected}, got ${result.actual}`);
  failed++;
}

// Restore original .devkitignore
restoreDevkitIgnore();

console.log(`\nResults: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
})();
