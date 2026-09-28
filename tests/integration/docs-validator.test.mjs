import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync, symlinkSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url)).replace(/[/\\]+$/u, '');
const validatorScript = join(repoRoot, '.evcrate/source/.claude/scripts/validate-docs.cjs');
const docsManagerInstruction = join(repoRoot, '.evcrate/source/.claude/agents/docs-manager.md');

function runValidator(cwd, args = ['docs', '--src', 'src']) {
  return spawnSync(process.execPath, [validatorScript, ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env }
  });
}
function findSystemGrep() {
  if (process.platform === 'win32') return null;
  const check = spawnSync('which', ['grep'], { encoding: 'utf8' });
  if (check.status === 0 && check.stdout.trim()) {
    return check.stdout.trim();
  }
  if (existsSync('/usr/bin/grep')) return '/usr/bin/grep';
  if (existsSync('/bin/grep')) return '/bin/grep';
  return null;
}

function createFixture(setupFn) {
  const dir = mkdtempSync(join(tmpdir(), 'validator-test-'));
  try {
    const docsDir = join(dir, 'docs');
    const srcDir = join(dir, 'src');
    mkdirSync(docsDir, { recursive: true });
    mkdirSync(srcDir, { recursive: true });
    setupFn({ dir, docsDir, srcDir });
  } catch (err) {
    rmSync(dir, { recursive: true, force: true });
    throw err;
  }
  return {
    dir,
    cleanup: () => rmSync(dir, { recursive: true, force: true })
  };
}

test('validator validates ordinary visible source references', () => {
  const fixture = createFixture(({ docsDir, srcDir }) => {
    writeFileSync(join(docsDir, 'guide.md'), '# Guide\nUse `reviewWidget()` to check.\n');
    writeFileSync(join(srcDir, 'widget.js'), 'function reviewWidget() { return true; }\n');
  });
  try {
    const res = runValidator(fixture.dir);
    assert.equal(res.status, 0);
    assert.match(res.stdout, /1 code references validated/);
    assert.doesNotMatch(res.stdout, /⚠️ \*\*Code References\*\*/);
  } finally {
    fixture.cleanup();
  }
});

test('validator includes hidden files and hidden directories (regression fix)', () => {
  const fixture = createFixture(({ docsDir, srcDir }) => {
    writeFileSync(join(docsDir, 'guide.md'), '# Guide\nUse `hiddenFunc()` and `nestedHidden()`.\n');
    writeFileSync(join(srcDir, '.hidden.js'), 'function hiddenFunc() {}\n');
    const hiddenSub = join(srcDir, '.internal');
    mkdirSync(hiddenSub, { recursive: true });
    writeFileSync(join(hiddenSub, 'widget.js'), 'function nestedHidden() {}\n');
  });
  try {
    const res = runValidator(fixture.dir);
    assert.equal(res.status, 0);
    assert.match(res.stdout, /2 code references validated/);
    assert.doesNotMatch(res.stdout, /⚠️ \*\*Code References\*\*/);
  } finally {
    fixture.cleanup();
  }
});

test('validator excludes node_modules, dist, target, and .git even in non-Git repos', () => {
  const fixture = createFixture(({ docsDir, srcDir }) => {
    writeFileSync(join(docsDir, 'guide.md'), '# Guide\nUse `depOnlyFunc()`.\n');
    const nmDir = join(srcDir, 'node_modules');
    const distDir = join(srcDir, 'dist');
    const targetDir = join(srcDir, 'target');
    const gitDir = join(srcDir, '.git');
    mkdirSync(nmDir, { recursive: true });
    mkdirSync(distDir, { recursive: true });
    mkdirSync(targetDir, { recursive: true });
    mkdirSync(gitDir, { recursive: true });
    writeFileSync(join(nmDir, 'dep.js'), 'function depOnlyFunc() {}\n');
    writeFileSync(join(distDir, 'dist.js'), 'function depOnlyFunc() {}\n');
    writeFileSync(join(targetDir, 'target.js'), 'function depOnlyFunc() {}\n');
    writeFileSync(join(gitDir, 'git.js'), 'function depOnlyFunc() {}\n');
  });
  try {
    const res = runValidator(fixture.dir);
    assert.equal(res.status, 0);
    // Because it is only in excluded directories, it must NOT be validated as codebase source
    assert.doesNotMatch(res.stdout, /1 code references validated/);
    assert.match(res.stdout, /⚠️ \*\*Code References\*\*/);
    assert.match(res.stdout, /`depOnlyFunc\(\)` in docs\/guide\.md:\d+ - not found in codebase/);
  } finally {
    fixture.cleanup();
  }
});
test('validator ignores RIPGREP_CONFIG_PATH via --no-config', () => {
  const fixture = createFixture(({ dir, docsDir, srcDir }) => {
    writeFileSync(join(docsDir, 'guide.md'), '# Guide\nUse `configResistantFunc()`.\n');
    writeFileSync(join(srcDir, 'app.js'), 'function configResistantFunc() {}\n');
    const invalidConfig = join(dir, '.rg-invalid-config');
    writeFileSync(invalidConfig, '--nonexistent-flag-that-causes-status-2\n');
  });
  try {
    const invalidConfig = join(fixture.dir, '.rg-invalid-config');
    const res = spawnSync(process.execPath, [validatorScript, 'docs', '--src', 'src'], {
      cwd: fixture.dir,
      encoding: 'utf8',
      env: { ...process.env, RIPGREP_CONFIG_PATH: invalidConfig }
    });
    assert.equal(res.status, 0);
    assert.match(res.stdout, /1 code references validated/);
    assert.doesNotMatch(res.stdout, /⚠️ \*\*Code References\*\*/);
  } finally {
    fixture.cleanup();
  }
});

test('validator distinguishes genuine missing symbol from incomplete search', () => {
  const fixture = createFixture(({ docsDir, srcDir }) => {
    writeFileSync(join(docsDir, 'guide.md'), '# Guide\nUse `actuallyMissing()`.\n');
    writeFileSync(join(srcDir, 'app.js'), 'function existingFunc() {}\n');
  });
  try {
    const res = runValidator(fixture.dir);
    assert.equal(res.status, 0);
    assert.match(res.stdout, /⚠️ \*\*Code References\*\*/);
    assert.match(res.stdout, /`actuallyMissing\(\)` in docs\/guide\.md:\d+ - not found in codebase/);
    assert.doesNotMatch(res.stdout, /⚠️ \*\*Unverified Code References\*\*/);
  } finally {
    fixture.cleanup();
  }
});

test('validator aggregates multiple source dirs and patterns correctly', () => {
  const fixture = createFixture(({ dir, docsDir, srcDir }) => {
    const libDir = join(dir, 'lib');
    mkdirSync(libDir, { recursive: true });
    writeFileSync(join(docsDir, 'guide.md'), '# Guide\nUse `inLibDir()`, `ConstExport`, and `missingOne()`.\n');
    writeFileSync(join(srcDir, 'app.js'), '// only comment here\n');
    writeFileSync(join(libDir, 'helper.js'), 'export const inLibDir = () => {};\nconst ConstExport = 42;\n');
  });
  try {
    const res = runValidator(fixture.dir, ['docs', '--src', 'src,lib']);
    assert.equal(res.status, 0);
    assert.match(res.stdout, /2 code references validated/);
    assert.match(res.stdout, /`missingOne\(\)` in docs\/guide\.md:\d+ - not found in codebase/);
  } finally {
    fixture.cleanup();
  }
});

test('validator reports unverified code references when search fails or tools unavailable', () => {
  const fixture = createFixture(({ docsDir, srcDir }) => {
    writeFileSync(join(docsDir, 'guide.md'), '# Guide\nUse `unverifiedFunc()`.\n');
    writeFileSync(join(srcDir, 'app.js'), 'function unverifiedFunc() {}\n');
  });
  try {
    // Run with empty PATH so neither rg nor grep can be found (ENOENT)
    const res = spawnSync(process.execPath, [validatorScript, 'docs', '--src', 'src'], {
      cwd: fixture.dir,
      encoding: 'utf8',
      env: { PATH: '' }
    });
    assert.equal(res.status, 0);
    // Must NOT falsely claim "not found in codebase"
    assert.doesNotMatch(res.stdout, /not found in codebase/);
    // Must report under Unverified Code References
    assert.match(res.stdout, /⚠️ \*\*Unverified Code References\*\*/);
    assert.match(res.stdout, /`unverifiedFunc\(\)` in docs\/guide\.md:\d+ - search failed or incomplete/);
  } finally {
    fixture.cleanup();
  }
});

test('docs-manager instructions specify rg with fallback and declaration inspection', () => {
  const content = readFileSync(docsManagerInstruction, 'utf8');
  assert.match(content, /rg -l "function {name}\|class {name}" src/);
  assert.match(content, /grep -rE "function {name}\|class {name}" src/);
  assert.match(content, /open the matched file and inspect the declaration/);
});

test('validator falls back to grep when rg is missing and preserves directory exclusion', {
  skip: process.platform === 'win32' ? 'POSIX grep simulation' : false
}, () => {
  const grepPath = findSystemGrep();
  if (!grepPath) return;
  const fixture = createFixture(({ dir, docsDir, srcDir }) => {
    const binDir = join(dir, 'grep-only-bin');
    mkdirSync(binDir, { recursive: true });
    symlinkSync(grepPath, join(binDir, 'grep'));

    writeFileSync(join(docsDir, 'guide.md'), '# Guide\nUse `grepFallbackFunc()`.\n');
    writeFileSync(join(srcDir, 'app.js'), 'function grepFallbackFunc() {}\n');

    const nmDir = join(srcDir, 'node_modules');
    mkdirSync(nmDir, { recursive: true });
    writeFileSync(join(nmDir, 'dep.js'), 'function depOnlyFunc() {}\n');
  });
  try {
    const binDir = join(fixture.dir, 'grep-only-bin');
    const res = spawnSync(process.execPath, [validatorScript, 'docs', '--src', 'src'], {
      cwd: fixture.dir,
      encoding: 'utf8',
      env: { PATH: binDir }
    });
    assert.equal(res.status, 0);
    assert.match(res.stdout, /1 code references validated/);
    assert.doesNotMatch(res.stdout, /depOnlyFunc/);
    assert.doesNotMatch(res.stdout, /⚠️ \*\*Unverified Code References\*\*/);
  } finally {
    fixture.cleanup();
  }
});

test('validator handles UTF-16LE with BOM under rg and documents fallback boundary under grep', {
  skip: process.platform === 'win32' ? 'POSIX grep simulation' : false
}, () => {
  const grepPath = findSystemGrep();
  if (!grepPath) return;
  const fixture = createFixture(({ dir, docsDir, srcDir }) => {
    const binDir = join(dir, 'grep-only-bin');
    mkdirSync(binDir, { recursive: true });
    symlinkSync(grepPath, join(binDir, 'grep'));

    writeFileSync(join(docsDir, 'guide.md'), '# Guide\nUse `utf16Func()`.\n');
    const buf = Buffer.concat([Buffer.from([0xFF, 0xFE]), Buffer.from('function utf16Func() {}\n', 'utf16le')]);
    writeFileSync(join(srcDir, 'utf16.js'), buf);
  });
  try {
    // 1. With rg: UTF-16LE with BOM is recognized and validated (if rg is available)
    const hasRg = spawnSync('rg', ['--version']).status === 0;
    if (hasRg) {
      const resRg = spawnSync(process.execPath, [validatorScript, 'docs', '--src', 'src'], {
        cwd: fixture.dir,
        encoding: 'utf8',
        env: { ...process.env }
      });
      assert.equal(resRg.status, 0);
      assert.match(resRg.stdout, /1 code references validated/);
    }

    // 2. With grep fallback: grep treats UTF-16LE as binary (--binary-files=without-match), reported not found
    const binDir = join(fixture.dir, 'grep-only-bin');
    const resGrep = spawnSync(process.execPath, [validatorScript, 'docs', '--src', 'src'], {
      cwd: fixture.dir,
      encoding: 'utf8',
      env: { PATH: binDir }
    });
    assert.equal(resGrep.status, 0);
    assert.match(resGrep.stdout, /`utf16Func\(\)` in docs\/guide\.md:\d+ - not found in codebase/);
  } finally {
    fixture.cleanup();
  }
});

test('validator documents ignore differences between rg and grep fallback', {
  skip: process.platform === 'win32' ? 'POSIX grep simulation' : false
}, () => {
  const grepPath = findSystemGrep();
  if (!grepPath) return;
  const fixture = createFixture(({ dir, docsDir, srcDir }) => {
    const binDir = join(dir, 'grep-only-bin');
    mkdirSync(binDir, { recursive: true });
    symlinkSync(grepPath, join(binDir, 'grep'));

    spawnSync('git', ['init'], { cwd: dir });
    writeFileSync(join(dir, '.gitignore'), 'ignored.js\n');

    writeFileSync(join(docsDir, 'guide.md'), '# Guide\nUse `ignoredFunc()`.\n');
    writeFileSync(join(srcDir, 'ignored.js'), 'function ignoredFunc() {}\n');
  });
  try {
    // 1. With rg: respects .gitignore, ignores ignored.js -> not found in codebase (if rg is available)
    const hasRg = spawnSync('rg', ['--version']).status === 0;
    if (hasRg) {
      const resRg = spawnSync(process.execPath, [validatorScript, 'docs', '--src', 'src'], {
        cwd: fixture.dir,
        encoding: 'utf8',
        env: { ...process.env }
      });
      assert.equal(resRg.status, 0);
      assert.match(resRg.stdout, /`ignoredFunc\(\)` in docs\/guide\.md:\d+ - not found in codebase/);
    }

    // 2. With grep fallback: grep does not parse .gitignore -> finds ignored.js
    const binDir = join(fixture.dir, 'grep-only-bin');
    const resGrep = spawnSync(process.execPath, [validatorScript, 'docs', '--src', 'src'], {
      cwd: fixture.dir,
      encoding: 'utf8',
      env: { PATH: binDir }
    });
    assert.equal(resGrep.status, 0);
    assert.match(resGrep.stdout, /1 code references validated/);
  } finally {
    fixture.cleanup();
  }
});

test('validator handles paths with spaces and Unicode characters safely', () => {
  const fixture = createFixture(({ dir }) => {
    const docsDir = join(dir, 'docs with spaces');
    const srcDir = join(dir, 'src 特殊路径');
    mkdirSync(docsDir, { recursive: true });
    mkdirSync(srcDir, { recursive: true });

    writeFileSync(join(docsDir, 'guide.md'), '# Guide\nUse `unicodePathFunc()`.\n');
    writeFileSync(join(srcDir, 'app.js'), 'function unicodePathFunc() {}\n');
  });
  try {
    const res = spawnSync(process.execPath, [validatorScript, 'docs with spaces', '--src', 'src 特殊路径'], {
      cwd: fixture.dir,
      encoding: 'utf8',
      env: { ...process.env }
    });
    assert.equal(res.status, 0);
    assert.match(res.stdout, /1 code references validated/);
    assert.doesNotMatch(res.stdout, /⚠️ \*\*Code References\*\*/);
  } finally {
    fixture.cleanup();
  }
});
