import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeLocalTool,
  extractCommandOperands,
  MAX_OPERANDS,
  MAX_OPERAND_BYTES
} from '../../dist/adapters/vscode/tool-inputs.js';

import {
  evaluateLocalPolicies,
  isBuildCommand,
  isBroadPattern,
  isPrivacySensitive,
  compileScoutPatterns,
  matchesScoutPattern,
  DEFAULT_SCOUT_PATTERNS
} from '../../dist/adapters/vscode/policy.js';

test('tool-inputs: normalizes read operations and aliases', () => {
  const norm1 = normalizeLocalTool('read_file', { path: 'src/index.ts' });
  assert.equal(norm1.kind, 'read');
  assert.deepEqual(norm1.operands, ['src/index.ts']);

  const norm2 = normalizeLocalTool('view', { file_path: 'docs/readme.md' });
  assert.equal(norm2.kind, 'read');
  assert.deepEqual(norm2.operands, ['docs/readme.md']);

  // Missing path returns unqualified
  const unq = normalizeLocalTool('read_file', {});
  assert.equal(unq.kind, 'unqualified');
});

test('tool-inputs: normalizes edit operations including batch and patch forms', () => {
  // Single path edit
  const single = normalizeLocalTool('edit_file', { path: 'src/main.ts' });
  assert.equal(single.kind, 'edit');
  assert.deepEqual(single.operands, ['src/main.ts']);

  // Multi-file edits
  const multi = normalizeLocalTool('editFiles', {
    files: [
      { path: 'src/a.ts' },
      { path: 'src/b.ts' }
    ]
  });
  assert.equal(multi.kind, 'edit');
  assert.deepEqual(multi.operands, ['src/a.ts', 'src/b.ts']);

  // Patch header extraction
  const patch = normalizeLocalTool('apply_patch', {
    patch: '--- a/src/core.ts\n+++ b/src/core.ts\n@@ -1 +1 @@\n-old\n+new'
  });
  assert.equal(patch.kind, 'edit');
  assert.ok(patch.operands.includes('src/core.ts'));
});

test('tool-inputs: normalizes terminal operations and extracts lexical operands', () => {
  const norm = normalizeLocalTool('run_in_terminal', {
    command: 'cat "src/secret config.json" ./dist/bundle.js --verbose'
  });
  assert.equal(norm.kind, 'terminal');
  assert.ok(norm.operands.includes('src/secret config.json'));
  assert.ok(norm.operands.includes('dist/bundle.js'));
  assert.ok(!norm.operands.includes('--verbose'));
});

test('tool-inputs: normalizes search, subagent, and unrelated tools', () => {
  // Grep
  const grep = normalizeLocalTool('grep_search', { query: 'testPattern', path: 'src' });
  assert.equal(grep.kind, 'search');
  assert.equal(grep.pattern, 'testPattern');
  assert.deepEqual(grep.operands, ['src']);

  // File search
  const glob = normalizeLocalTool('file_search', { pattern: '**/*.ts', folder: 'tests' });
  assert.equal(glob.kind, 'search');
  assert.equal(glob.pattern, '**/*.ts');
  assert.deepEqual(glob.operands, ['tests']);

  // Subagent
  const sub = normalizeLocalTool('runSubagent', { agentName: 'planner', prompt: 'plan something' });
  assert.equal(sub.kind, 'subagent');
  assert.deepEqual(sub.operands, ['planner']);

  // Unrelated tool
  const unrel = normalizeLocalTool('ask_user', { question: 'Are you sure?' });
  assert.equal(unrel.kind, 'unrelated');
});

test('tool-inputs: enforces operand count and size limits', () => {
  // Excess operands > 256
  const excessOps = Array.from({ length: MAX_OPERANDS + 5 }, (_, i) => `file_${i}.ts`);
  const normExcess = normalizeLocalTool('editFiles', {
    files: excessOps.map((p) => ({ path: p }))
  });
  assert.equal(normExcess.kind, 'unqualified');
  assert.ok(normExcess.reason.includes('exceed maximum permitted limit'));

  // Oversized single operand > 4096 bytes
  const bigPath = 'a/'.repeat(2100) + 'test.ts';
  const normOversized = normalizeLocalTool('read_file', { path: bigPath });
  assert.equal(normOversized.kind, 'unqualified');
  assert.ok(normOversized.reason.includes('Operand length'));
});

test('policy: scout blocks 12 canonical directories and honors directory-only semantics', () => {
  const compiled = compileScoutPatterns(DEFAULT_SCOUT_PATTERNS);

  // Blocked directory targets
  assert.equal(matchesScoutPattern('node_modules/lib/index.js', compiled).blocked, true);
  assert.equal(matchesScoutPattern('dist/bundle.js', compiled).blocked, true);
  assert.equal(matchesScoutPattern('.git/config', compiled).blocked, true);
  assert.equal(matchesScoutPattern('.venv/bin/python', compiled).blocked, true);
  assert.equal(matchesScoutPattern('vendor/autoload.php', compiled).blocked, true);

  // Directory-only boundary: file named "dist.ts" or "build.json" is NOT blocked
  assert.equal(matchesScoutPattern('src/dist.ts', compiled).blocked, false);
  assert.equal(matchesScoutPattern('build.config.js', compiled).blocked, false);
});

test('policy: scout supports negation patterns in .evcrateignore', () => {
  const patterns = [
    'build/',
    '!build/reports/**'
  ];
  const compiled = compileScoutPatterns(patterns);

  assert.equal(matchesScoutPattern('build/output.js', compiled).blocked, true);
  assert.equal(matchesScoutPattern('build/reports/summary.html', compiled).blocked, false);
});

test('policy: scout blocks broad search patterns at project root', () => {
  const op = normalizeLocalTool('file_search', { pattern: '**/*', folder: '.' });
  const pol = evaluateLocalPolicies(op);
  assert.equal(pol.decision, 'deny');
  assert.ok(pol.reason.includes('overly broad search pattern'));

  // Specific folder search is allowed
  const opSpecific = normalizeLocalTool('file_search', { pattern: '**/*.ts', folder: 'src/adapters' });
  const polSpecific = evaluateLocalPolicies(opSpecific);
  assert.equal(polSpecific.decision, 'none');
});

test('policy: terminal build commands are allowed by scout even when referencing blocked dirs', () => {
  assert.equal(isBuildCommand('npm run build'), true);
  assert.equal(isBuildCommand('npm test'), true);
  assert.equal(isBuildCommand('pnpm --filter web build'), true);
  assert.equal(isBuildCommand('cargo build --release'), true);
  assert.equal(isBuildCommand('tsc -p tsconfig.json'), true);
  assert.equal(isBuildCommand('node scripts/build.mjs'), true);

  // Build command touching node_modules or dist is allowed
  const opBuild = normalizeLocalTool('run_in_terminal', { command: 'npm test node_modules/jest' });
  const polBuild = evaluateLocalPolicies(opBuild);
  assert.equal(polBuild.decision, 'none');

  // Non-build exploration command touching node_modules is blocked
  const opCat = normalizeLocalTool('run_in_terminal', { command: 'cat node_modules/lodash/index.js' });
  const polCat = evaluateLocalPolicies(opCat);
  assert.equal(polCat.decision, 'deny');
  assert.ok(polCat.reason.includes('Scout policy blocked'));
});

test('policy: multi-operand check denies if ANY operand is blocked', () => {
  const op = normalizeLocalTool('editFiles', {
    files: [
      { path: 'src/safe.ts' },
      { path: 'node_modules/bad.js' }
    ]
  });
  const pol = evaluateLocalPolicies(op);
  assert.equal(pol.decision, 'deny');
  assert.ok(pol.reason.includes('node_modules'));
});

test('policy: privacy detects sensitive files and exempts safe patterns', () => {
  // Sensitive files
  assert.equal(isPrivacySensitive('.env'), true);
  assert.equal(isPrivacySensitive('.env.local'), true);
  assert.equal(isPrivacySensitive('config/.env.prod'), true);
  assert.equal(isPrivacySensitive('credentials.json'), true);
  assert.equal(isPrivacySensitive('secrets.yaml'), true);
  assert.equal(isPrivacySensitive('id_rsa'), true);
  assert.equal(isPrivacySensitive('server.key'), true);

  // Safe files exempt
  assert.equal(isPrivacySensitive('.env.example'), false);
  assert.equal(isPrivacySensitive('.env.sample'), false);
  assert.equal(isPrivacySensitive('config.template'), false);
});

test('policy: APPROVED: prefix is never trusted in Local and still triggers ask', () => {
  // Strip APPROVED: only for comparison; APPROVED:.env is NOT auto-approved!
  assert.equal(isPrivacySensitive('APPROVED:.env'), true);

  const op = normalizeLocalTool('read_file', { path: 'APPROVED:.env' });
  const pol = evaluateLocalPolicies(op);
  assert.equal(pol.decision, 'ask');
  assert.ok(pol.reason.includes('privacy-sensitive file'));
});
test('policy: bare command operands without slashes/dots are extracted and blocked', () => {
  // rm -rf node_modules
  const opRm = normalizeLocalTool('run_in_terminal', { command: 'rm -rf node_modules' });
  assert.ok(opRm.operands.includes('node_modules'));
  const polRm = evaluateLocalPolicies(opRm);
  assert.equal(polRm.decision, 'deny');
  assert.ok(polRm.reason.includes('Scout policy blocked'));

  // cat credentials
  const opCat = normalizeLocalTool('run_in_terminal', { command: 'cat credentials' });
  assert.ok(opCat.operands.includes('credentials'));
  const polCat = evaluateLocalPolicies(opCat);
  assert.ok(polCat.warnings.length > 0);
  assert.ok(polCat.warnings[0].includes('privacy-sensitive path "credentials"'));

  // Flag assignment --config=.env
  const opFlag = normalizeLocalTool('run_in_terminal', { command: 'app --config=.env' });
  assert.ok(opFlag.operands.includes('.env'));
  const polFlag = evaluateLocalPolicies(opFlag);
  assert.ok(polFlag.warnings.length > 0);
  assert.ok(polFlag.warnings[0].includes('privacy-sensitive path ".env"'));
});

test('policy: percent-encoded scout directories are decoded and blocked', () => {
  const op = normalizeLocalTool('read_file', { path: 'node%5Fmodules/index.js' });
  const pol = evaluateLocalPolicies(op);
  assert.equal(pol.decision, 'deny');
  assert.ok(pol.reason.includes('Scout policy blocked'));
});


test('policy: sensitive read/edit triggers ask, shell triggers warning-only', () => {
  // Read sensitive file -> ask
  const opRead = normalizeLocalTool('read_file', { path: '.env' });
  const polRead = evaluateLocalPolicies(opRead);
  assert.equal(polRead.decision, 'ask');

  // Terminal sensitive command -> none with warning
  const opShell = normalizeLocalTool('run_in_terminal', { command: 'echo .env' });
  const polShell = evaluateLocalPolicies(opShell);
  assert.equal(polShell.decision, 'none');
  assert.ok(polShell.warnings.length > 0);
  assert.ok(polShell.warnings[0].includes('privacy-sensitive path'));
  assert.ok(polShell.systemMessage.includes('not blocked in shell'));
});

test('policy: scout deny takes precedence over privacy ask', () => {
  // If operand is both scout-blocked and privacy-sensitive (e.g. node_modules/.env)
  const op = normalizeLocalTool('read_file', { path: 'node_modules/pkg/.env' });
  const pol = evaluateLocalPolicies(op);
  assert.equal(pol.decision, 'deny');
  assert.ok(pol.reason.includes('Scout policy blocked'));
});

test('policy: privacyEnabled=false disables privacy checks', () => {
  const op = normalizeLocalTool('read_file', { path: '.env' });
  const pol = evaluateLocalPolicies(op, { privacyEnabled: false });
  assert.equal(pol.decision, 'none');
});

test('policy: unqualified tool fails closed with deny', () => {
  const op = normalizeLocalTool('unknown_custom_tool', { foo: 'bar' });
  assert.equal(op.kind, 'unqualified');
  const pol = evaluateLocalPolicies(op);
  assert.equal(pol.decision, 'deny');
  assert.ok(pol.reason.includes('PreToolUse security policy denied unqualified tool'));
});
