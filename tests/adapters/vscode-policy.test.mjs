import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const cjsToolInputs = require('../../.evcrate/source/.evcrate-vscode/evcrate/runtime/local-tool-inputs.cjs');
const cjsPolicy = require('../../.evcrate/source/.evcrate-vscode/evcrate/runtime/local-policy.cjs');

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

  // Host native filePath parameter
  const norm3 = normalizeLocalTool('read/readFile', { filePath: 'src/index.ts' });
  assert.equal(norm3.kind, 'read');
  assert.deepEqual(norm3.operands, ['src/index.ts']);

  const norm4 = normalizeLocalTool('readFile', { FilePath: 'src/config.ts' });
  assert.equal(norm4.kind, 'read');
  assert.deepEqual(norm4.operands, ['src/config.ts']);

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

  // Host concrete createFile and replaceString with filePath
  const cf = normalizeLocalTool('createFile', { filePath: 'src/new-file.ts' });
  assert.equal(cf.kind, 'edit');
  assert.deepEqual(cf.operands, ['src/new-file.ts']);

  const rs = normalizeLocalTool('replaceString', { filePath: 'src/existing.ts' });
  assert.equal(rs.kind, 'edit');
  assert.deepEqual(rs.operands, ['src/existing.ts']);

  // Host multiReplaceString with replacements array containing filePath
  const mrs = normalizeLocalTool('multiReplaceString', {
    replacements: [
      { filePath: 'src/mod-a.ts' },
      { filePath: 'src/mod-b.ts' }
    ]
  });
  assert.equal(mrs.kind, 'edit');
  assert.deepEqual(mrs.operands, ['src/mod-a.ts', 'src/mod-b.ts']);

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

  // Host directory listing
  const listDir = normalizeLocalTool('search/listDirectory', { path: 'src/adapters' });
  assert.equal(listDir.kind, 'search');
  assert.equal(listDir.pattern, '*');
  assert.deepEqual(listDir.operands, ['src/adapters']);

  // Subagent
  const sub = normalizeLocalTool('runSubagent', { agentName: 'evc-planner', prompt: 'plan something' });
  assert.equal(sub.kind, 'subagent');
  assert.deepEqual(sub.operands, ['evc-planner']);

  // Unrelated tool
  const unrel = normalizeLocalTool('ask_user', { question: 'Are you sure?' });
  assert.equal(unrel.kind, 'unrelated');

  // VS Code's todo tool must stay allowed once TodoWrite maps to it
  assert.equal(normalizeLocalTool('manage_todo_list', { todoList: [] }).kind, 'unrelated');
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

test('policy: paired regressions for native host tool permissions and policy gates', () => {
  // 1. Native readFile with filePath variants
  const readPermitted = evaluateLocalPolicies(normalizeLocalTool('readFile', { filePath: 'src/utils/math.ts' }));
  assert.equal(readPermitted.decision, 'none');

  const readScoutBlocked = evaluateLocalPolicies(normalizeLocalTool('readFile', { filePath: 'node_modules/lodash/index.js' }));
  assert.equal(readScoutBlocked.decision, 'deny');
  assert.ok(readScoutBlocked.reason.includes('Scout policy blocked'));

  const readPrivacyAsk = evaluateLocalPolicies(normalizeLocalTool('read/readFile', { FilePath: '.env.local' }));
  assert.equal(readPrivacyAsk.decision, 'ask');
  assert.ok(readPrivacyAsk.reason.includes('privacy-sensitive'));

  // 2. Native createFile and replaceString with filePath
  const createPermitted = evaluateLocalPolicies(normalizeLocalTool('createFile', { filePath: 'src/components/card.tsx' }));
  assert.equal(createPermitted.decision, 'none');

  const createScoutBlocked = evaluateLocalPolicies(normalizeLocalTool('createFile', { filePath: '.git/hooks/pre-commit' }));
  assert.equal(createScoutBlocked.decision, 'deny');

  const replacePrivacyAsk = evaluateLocalPolicies(normalizeLocalTool('replaceString', { filePath: 'config/master.key' }));
  assert.equal(replacePrivacyAsk.decision, 'ask');

  // 3. Native multiReplaceString multi-operand denial
  const multiAllPermitted = evaluateLocalPolicies(normalizeLocalTool('multiReplaceString', {
    replacements: [{ filePath: 'src/a.ts' }, { filePath: 'src/b.ts' }]
  }));
  assert.equal(multiAllPermitted.decision, 'none');

  const multiOneBlocked = evaluateLocalPolicies(normalizeLocalTool('multiReplaceString', {
    replacements: [{ filePath: 'src/a.ts' }, { filePath: 'vendor/cache/pkg.json' }]
  }));
  assert.equal(multiOneBlocked.decision, 'deny');

  // 4. Native listDirectory with path
  const listPermitted = evaluateLocalPolicies(normalizeLocalTool('listDirectory', { path: 'src/services' }));
  assert.equal(listPermitted.decision, 'none');

  const listScoutBlocked = evaluateLocalPolicies(normalizeLocalTool('listDirectory', { path: 'node_modules' }));
  assert.equal(listScoutBlocked.decision, 'deny');
});

test('policy: native search parameters normalize scope and block protected directories', () => {
  // P2 regression: search/textSearch with includePattern targeting node_modules/** and includeIgnoredFiles
  const textSearchBlocked = evaluateLocalPolicies(normalizeLocalTool('search/textSearch', {
    query: 'API_KEY',
    includePattern: 'node_modules/**',
    includeIgnoredFiles: true
  }));
  assert.equal(textSearchBlocked.decision, 'deny');
  assert.ok(textSearchBlocked.reason.includes('Scout policy blocked'));

  // search/textSearch with array of includePatterns containing blocked directory
  const textSearchArrayBlocked = evaluateLocalPolicies(normalizeLocalTool('search/textSearch', {
    query: 'secret',
    includePattern: ['src/**', 'node_modules/**']
  }));
  assert.equal(textSearchArrayBlocked.decision, 'deny');

  // search/textSearch with permitted includePattern
  const textSearchPermitted = evaluateLocalPolicies(normalizeLocalTool('search/textSearch', {
    query: 'export function',
    folder: 'src',
    includePattern: '**/*.ts'
  }));
  assert.equal(textSearchPermitted.decision, 'none');

  // P2 regression: search/fileSearch with query glob targeting node_modules/**
  const fileSearchBlocked = evaluateLocalPolicies(normalizeLocalTool('search/fileSearch', {
    query: 'node_modules/**'
  }));
  assert.equal(fileSearchBlocked.decision, 'deny');
  assert.ok(fileSearchBlocked.reason.includes('Scout policy blocked'));

  // search/fileSearch with query targeting .git/
  const fileSearchGitBlocked = evaluateLocalPolicies(normalizeLocalTool('search/fileSearch', {
    query: '.git/config'
  }));
  assert.equal(fileSearchGitBlocked.decision, 'deny');

  // search/fileSearch with permitted query in specific folder
  const fileSearchPermitted = evaluateLocalPolicies(normalizeLocalTool('search/fileSearch', {
    query: '*.ts',
    folder: 'src/adapters'
  }));
  assert.equal(fileSearchPermitted.decision, 'none');
});

test('policy: web fetch tools validate HTTP(S) URLs and exempt remote URLs from local directory/privacy blocks', () => {
  // Allowed external web fetch with valid urls array and query
  const webAllowed = evaluateLocalPolicies(normalizeLocalTool('web/fetch', {
    urls: ['https://code.visualstudio.com/docs'],
    query: 'API reference'
  }));
  assert.equal(webAllowed.decision, 'none');

  // P1 regression: remote URLs containing /dist/, /build/, or /.env are NOT blocked or prompted by local workspace rules
  const webDistAndEnvAllowed = evaluateLocalPolicies(normalizeLocalTool('web/fetch', {
    urls: [
      'https://nodejs.org/dist/v20.0.0/',
      'https://example.com/build/artifacts',
      'https://example.com/docs/.env/configuration'
    ],
    query: 'Node release and environment docs'
  }));
  assert.equal(webDistAndEnvAllowed.decision, 'none');

  // P2 regression: non-HTTP(S) scheme (file://) fails closed as unqualified and is denied
  const webFileScheme = normalizeLocalTool('web/fetch', {
    urls: ['file:///etc/passwd'],
    query: 'content'
  });
  assert.equal(webFileScheme.kind, 'unqualified');
  assert.ok(webFileScheme.reason.includes('only permits http: or https: protocols'));
  assert.equal(evaluateLocalPolicies(webFileScheme).decision, 'deny');

  // P2 regression: relative local path fails closed as unqualified and is denied
  const webRelativePath = normalizeLocalTool('web/fetch', {
    urls: ['node_modules/express/README.md'],
    query: 'express docs'
  });
  assert.equal(webRelativePath.kind, 'unqualified');
  assert.equal(evaluateLocalPolicies(webRelativePath).decision, 'deny');

  // P2 regression: single url string without urls array fails closed as unqualified
  const webSingleUrl = normalizeLocalTool('copilot_fetchWebPage', {
    url: 'https://github.com/microsoft/vscode',
    query: 'README'
  });
  assert.equal(webSingleUrl.kind, 'unqualified');
  assert.ok(webSingleUrl.reason.includes('non-empty urls array'));

  // P2 regression: missing query fails closed as unqualified
  const webMissingQuery = normalizeLocalTool('web/fetch', {
    urls: ['https://code.visualstudio.com/docs']
  });
  assert.equal(webMissingQuery.kind, 'unqualified');
  assert.ok(webMissingQuery.reason.includes('non-empty query string'));

  // Missing urls fails closed as unqualified
  const webMissingUrls = normalizeLocalTool('web/fetch', { query: 'test' });
  assert.equal(webMissingUrls.kind, 'unqualified');
});

test('policy: notebook edit and summary tools enforce file policies and valid editType', () => {
  // Allowed notebook edit with valid native editType ('edit', 'insert', 'delete')
  for (const editType of ['edit', 'insert', 'delete']) {
    const nbEditAllowed = evaluateLocalPolicies(normalizeLocalTool('edit/editNotebook', {
      filePath: 'notebooks/pipeline.ipynb',
      editType,
      cellId: 'cell-0',
      newCode: 'print(1)'
    }));
    assert.equal(nbEditAllowed.decision, 'none');
  }

  // P2 regression: invalid editType ('replace') fails closed as unqualified and is denied
  const nbInvalidEditType = normalizeLocalTool('edit/editNotebook', {
    filePath: 'notebooks/pipeline.ipynb',
    editType: 'replace',
    cellId: 'cell-0'
  });
  assert.equal(nbInvalidEditType.kind, 'unqualified');
  assert.ok(nbInvalidEditType.reason.includes('editType to be "insert", "edit", or "delete"'));
  assert.equal(evaluateLocalPolicies(nbInvalidEditType).decision, 'deny');

  // Allowed notebook summary read
  const nbSummaryAllowed = evaluateLocalPolicies(normalizeLocalTool('read/getNotebookSummary', {
    filePath: 'notebooks/pipeline.ipynb'
  }));
  assert.equal(nbSummaryAllowed.decision, 'none');

  // Scout-blocked notebook edit
  const nbEditBlocked = evaluateLocalPolicies(normalizeLocalTool('copilot_editNotebook', {
    filePath: 'node_modules/demo/notebook.ipynb',
    editType: 'insert',
    cellId: 'cell-0'
  }));
  assert.equal(nbEditBlocked.decision, 'deny');
  assert.ok(nbEditBlocked.reason.includes('Scout policy blocked'));

  // Privacy ask for sensitive notebook or config
  const nbPrivacyAsk = evaluateLocalPolicies(normalizeLocalTool('getNotebookSummary', {
    filePath: '.env.local'
  }));
  assert.equal(nbPrivacyAsk.decision, 'ask');
  assert.ok(nbPrivacyAsk.reason.includes('privacy-sensitive'));
});

test('policy: TypeScript and generated CommonJS runtime maintain exact fallback and normalization parity', () => {
  const testCases = [
    // P3 regression: empty string on earlier property must not fall through via || when TS uses ??
    ['read/readFile', { filePath: '', path: 'src/fallback.ts' }],
    ['editFiles', { filePath: '', path: 'src/fallback.ts' }],
    ['search/textSearch', { query: 'test', path: '', folder: 'src' }],
    ['search/fileSearch', { pattern: '', query: 'src/**/*.ts' }],
    // WebFetch cases
    ['web/fetch', { urls: ['https://nodejs.org/dist/v20.0.0/'], query: 'Node 20' }],
    ['web/fetch', { urls: ['file:///etc/passwd'], query: 'passwd' }],
    ['web/fetch', { url: 'https://example.com', query: 'single' }],
    ['web/fetch', { urls: ['https://example.com'] }],
    // Notebook cases
    ['edit/editNotebook', { filePath: 'notebooks/a.ipynb', editType: 'edit', cellId: 'c1' }],
    ['edit/editNotebook', { filePath: 'notebooks/a.ipynb', editType: 'replace', cellId: 'c1' }],
    ['read/getNotebookSummary', { filePath: 'notebooks/a.ipynb' }]
  ];

  for (const [toolName, input] of testCases) {
    const tsNorm = normalizeLocalTool(toolName, input);
    const cjsNorm = cjsToolInputs.normalizeLocalTool(toolName, input);
    assert.deepEqual(cjsNorm, tsNorm, `Normalization parity mismatch for ${toolName} with ${JSON.stringify(input)}`);

    const tsPol = evaluateLocalPolicies(tsNorm);
    const cjsPol = cjsPolicy.evaluateLocalPolicies(cjsNorm);
    assert.deepEqual(cjsPol, tsPol, `Policy parity mismatch for ${toolName} with ${JSON.stringify(input)}`);
  }
});
