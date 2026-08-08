#!/usr/bin/env node
/**
 * test-privacy-block.js - Unit tests for privacy-block hook
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const HOOK_PATH = path.join(__dirname, '..', 'privacy-block.cjs');

async function runHook(hookData, cwd = undefined) {
  return new Promise((resolve) => {
    const options = cwd ? { cwd } : {};
    const proc = spawn('node', [HOOK_PATH], options);
    let stderr = '';

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      resolve({ code, stderr });
    });

    proc.stdin.write(JSON.stringify(hookData));
    proc.stdin.end();
  });
}

// Test cases - blocking without APPROVED: prefix
const blockTests = [
  {
    name: '.env file - should block',
    input: { tool_input: { file_path: '.env' } },
    expectBlock: true,
    expectContains: 'PRIVACY BLOCK'
  },
  {
    name: '.env.local - should block',
    input: { tool_input: { file_path: '.env.local' } },
    expectBlock: true,
    expectContains: 'APPROVED:'
  },
  {
    name: 'credentials.json - should block',
    input: { tool_input: { file_path: 'config/credentials.json' } },
    expectBlock: true
  },
  {
    name: 'id_rsa - should block',
    input: { tool_input: { file_path: '~/.ssh/id_rsa' } },
    expectBlock: true
  },
  {
    name: '.env in bash command - should block',
    input: { tool_input: { command: 'cat .env' } },
    expectBlock: true
  },
  {
    name: 'secrets.yaml - should block',
    input: { tool_input: { file_path: 'secrets.yaml' } },
    expectBlock: true
  },
  {
    name: 'private.key - should block',
    input: { tool_input: { file_path: 'certs/private.key' } },
    expectBlock: true
  },
  // NEW: URL-encoded paths
  {
    name: 'URL-encoded .env (%2e%65%6e%76) - should block',
    input: { tool_input: { file_path: '%2eenv' } },
    expectBlock: true
  },
  // NEW: Bash variable assignments
  {
    name: 'bash variable FILE=.env - should block',
    input: { tool_input: { command: 'FILE=.env cat $FILE' } },
    expectBlock: true
  },
  // NEW: Command substitution
  {
    name: 'command substitution $(cat .env) - should block',
    input: { tool_input: { command: 'echo $(cat .env)' } },
    expectBlock: true
  }
];

// Test cases - allowing with APPROVED: prefix
const allowTests = [
  {
    name: 'APPROVED:.env - should allow',
    input: { tool_input: { file_path: 'APPROVED:.env' } },
    expectBlock: false,
    expectContains: 'User-approved'
  },
  {
    name: 'APPROVED:.env.local - should allow',
    input: { tool_input: { file_path: 'APPROVED:.env.local' } },
    expectBlock: false
  },
  {
    name: 'APPROVED:credentials.json - should allow',
    input: { tool_input: { file_path: 'APPROVED:config/credentials.json' } },
    expectBlock: false
  },
  {
    name: 'APPROVED in bash command - should allow',
    input: { tool_input: { command: 'cat APPROVED:.env' } },
    expectBlock: false
  }
];

// Test cases - non-sensitive files (always allowed)
const safeTests = [
  {
    name: 'regular file - should allow',
    input: { tool_input: { file_path: 'src/index.ts' } },
    expectBlock: false
  },
  {
    name: 'package.json - should allow',
    input: { tool_input: { file_path: 'package.json' } },
    expectBlock: false
  },
  {
    name: 'README.md - should allow',
    input: { tool_input: { file_path: 'README.md' } },
    expectBlock: false
  }
];

// Test cases - example/sample/template files (exempt from privacy checks)
const exemptTests = [
  {
    name: '.env.example - should allow (exempt)',
    input: { tool_input: { file_path: '.env.example' } },
    expectBlock: false
  },
  {
    name: '.env.local.example - should allow (exempt)',
    input: { tool_input: { file_path: '.env.local.example' } },
    expectBlock: false
  },
  {
    name: '.env.sample - should allow (exempt)',
    input: { tool_input: { file_path: '.env.sample' } },
    expectBlock: false
  },
  {
    name: '.env.template - should allow (exempt)',
    input: { tool_input: { file_path: '.env.template' } },
    expectBlock: false
  },
  {
    name: 'config/.env.example - should allow (exempt)',
    input: { tool_input: { file_path: 'config/.env.example' } },
    expectBlock: false
  },
  {
    name: 'credentials.example - should allow (exempt)',
    input: { tool_input: { file_path: 'credentials.example' } },
    expectBlock: false
  },
  {
    name: 'cat .env.example in bash - should allow (exempt)',
    input: { tool_input: { command: 'cat .env.example' } },
    expectBlock: false
  }
];

// Test cases - config toggle (privacyBlock: false)
const configToggleTests = [
  {
    name: 'privacyBlock: false - .env should allow',
    input: { tool_input: { file_path: '.env' } },
    config: { privacyBlock: false },
    expectBlock: false
  },
  {
    name: 'privacyBlock: false - credentials.json should allow',
    input: { tool_input: { file_path: 'credentials.json' } },
    config: { privacyBlock: false },
    expectBlock: false
  },
  {
    name: 'privacyBlock: true - .env should block',
    input: { tool_input: { file_path: '.env' } },
    config: { privacyBlock: true },
    expectBlock: true
  }
];

async function main() {
  console.log('Testing privacy-block hook...\n');

  let passed = 0;
  let failed = 0;

  console.log('\x1b[1m--- Block Tests (no APPROVED: prefix) ---\x1b[0m');
  for (const test of blockTests) {
    const result = await runHook(test.input);
    const blocked = result.code === 2;
    const success = blocked === test.expectBlock;
    const containsOk = !test.expectContains || result.stderr.includes(test.expectContains);

    if (success && containsOk) {
      console.log(`\x1b[32m✓\x1b[0m ${test.name}`);
      passed++;
    } else {
      console.log(`\x1b[31m✗\x1b[0m ${test.name}: expected BLOCK, got ${blocked ? 'BLOCK' : 'ALLOW'}`);
      failed++;
    }
  }

  console.log('\n\x1b[1m--- Allow Tests (with APPROVED: prefix) ---\x1b[0m');
  for (const test of allowTests) {
    const result = await runHook(test.input);
    const blocked = result.code === 2;
    const success = blocked === test.expectBlock;
    const containsOk = !test.expectContains || result.stderr.includes(test.expectContains);

    if (success && containsOk) {
      console.log(`\x1b[32m✓\x1b[0m ${test.name}`);
      passed++;
    } else {
      console.log(`\x1b[31m✗\x1b[0m ${test.name}: expected ALLOW, got ${blocked ? 'BLOCK' : 'ALLOW'}`);
      failed++;
    }
  }

  console.log('\n\x1b[1m--- Safe Files (always allowed) ---\x1b[0m');
  for (const test of safeTests) {
    const result = await runHook(test.input);
    const blocked = result.code === 2;
    const success = blocked === test.expectBlock;

    if (success) {
      console.log(`\x1b[32m✓\x1b[0m ${test.name}`);
      passed++;
    } else {
      console.log(`\x1b[31m✗\x1b[0m ${test.name}: expected ALLOW, got ${blocked ? 'BLOCK' : 'ALLOW'}`);
      failed++;
    }
  }

  console.log('\n\x1b[1m--- Exempt Files (example/sample/template) ---\x1b[0m');
  for (const test of exemptTests) {
    const result = await runHook(test.input);
    const blocked = result.code === 2;
    const success = blocked === test.expectBlock;

    if (success) {
      console.log(`\x1b[32m✓\x1b[0m ${test.name}`);
      passed++;
    } else {
      console.log(`\x1b[31m✗\x1b[0m ${test.name}: expected ALLOW (exempt), got ${blocked ? 'BLOCK' : 'ALLOW'}`);
      failed++;
    }
  }

  // Config toggle tests - requires temp directory with .claude/.evcrate.json
  console.log('\n\x1b[1m--- Config Toggle (privacyBlock setting) ---\x1b[0m');
  const os = require('os');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'privacy-test-'));
  const tmpClaudeDir = path.join(tmpDir, '.claude');
  const tmpCodexDir = path.join(tmpDir, '.codex');
  fs.mkdirSync(tmpClaudeDir, { recursive: true });
  fs.mkdirSync(tmpCodexDir, { recursive: true });

  for (const test of configToggleTests) {
    // Write test config
    fs.writeFileSync(
      path.join(tmpClaudeDir, '.evcrate.json'),
      JSON.stringify(test.config)
    );

    const result = await runHook(test.input, tmpDir);
    const blocked = result.code === 2;
    const success = blocked === test.expectBlock;

    if (success) {
      console.log(`\x1b[32m✓\x1b[0m ${test.name}`);
      passed++;
    } else {
      console.log(`\x1b[31m✗\x1b[0m ${test.name}: expected ${test.expectBlock ? 'BLOCK' : 'ALLOW'}, got ${blocked ? 'BLOCK' : 'ALLOW'}`);
      failed++;
    }
  }

  const oldHome = process['env'].HOME;
  const oldUserProfile = process['env'].USERPROFILE;
  const oldSelector = process['env'].EVCRATE_CONFIG_DIR;
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'privacy-home-'));
  const tmpHomeClaudeDir = path.join(tmpHome, '.claude');
  const sensitivePath = ['.', 'env'].join('');

  try {
    fs.mkdirSync(tmpHomeClaudeDir, { recursive: true });
    fs.writeFileSync(
      path.join(tmpHomeClaudeDir, '.evcrate.json'),
      JSON.stringify({ privacyBlock: false })
    );
    process['env'].HOME = tmpHome;
    process['env'].USERPROFILE = tmpHome;
    delete process['env'].EVCRATE_CONFIG_DIR;

    const globalOnlyResult = await runHook({ tool_input: { file_path: sensitivePath } }, tmpDir);
    const globalOnlyBlocked = globalOnlyResult.code === 2;
    if (globalOnlyBlocked) {
      console.log(`\x1b[32m✓\x1b[0m global privacyBlock: false is ignored by privacy hook`);
      passed++;
    } else {
      console.log(`\x1b[31m✗\x1b[0m global privacyBlock: false should not disable local privacy hook`);
      failed++;
    }

    process['env'].EVCRATE_CONFIG_DIR = '.codex';
    fs.writeFileSync(
      path.join(tmpCodexDir, '.evcrate.json'),
      JSON.stringify({ privacyBlock: false })
    );

    const codexResult = await runHook({ tool_input: { file_path: sensitivePath } }, tmpDir);
    const codexBlocked = codexResult.code === 2;
    if (!codexBlocked) {
      console.log(`\x1b[32m✓\x1b[0m EVCRATE_CONFIG_DIR=.codex reads .codex/.evcrate.json`);
      passed++;
    } else {
      console.log(`\x1b[31m✗\x1b[0m EVCRATE_CONFIG_DIR=.codex should read local .codex/.evcrate.json`);
      failed++;
    }

    process['env'].EVCRATE_CONFIG_DIR = '../outside';
    const invalidSelectorResult = await runHook({ tool_input: { file_path: sensitivePath } }, tmpDir);
    const invalidSelectorBlocked = invalidSelectorResult.code === 2;
    if (invalidSelectorBlocked) {
      console.log(`\x1b[32m✓\x1b[0m invalid selector falls back to .claude/.evcrate.json`);
      passed++;
    } else {
      console.log(`\x1b[31m✗\x1b[0m invalid selector should fall back to local .claude/.evcrate.json and block`);
      failed++;
    }
  } finally {
    if (oldHome === undefined) {
      delete process['env'].HOME;
    } else {
      process['env'].HOME = oldHome;
    }
    if (oldUserProfile === undefined) {
      delete process['env'].USERPROFILE;
    } else {
      process['env'].USERPROFILE = oldUserProfile;
    }
    if (oldSelector === undefined) {
      delete process['env'].EVCRATE_CONFIG_DIR;
    } else {
      process['env'].EVCRATE_CONFIG_DIR = oldSelector;
    }
    fs.rmSync(tmpHome, { recursive: true, force: true });
  }

  // Cleanup temp directory
  fs.rmSync(tmpDir, { recursive: true, force: true });

  console.log(`\n\x1b[1mResults:\x1b[0m ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
