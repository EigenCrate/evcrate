import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import {
  safePath, validateWindowsPath, resolveSafePath, lexicalAbsoluteWindows,
  assertNoSymlinkAncestors, normalizeRelativePath, resolveHomeRoot,
  resolveStateRoot, resolveProjectRoot, validatePublicationAncestors, sameVolume
} from '../../dist/index.js';

test('Linux safePath rejects Windows drive paths and keeps POSIX rules', {
  skip: process.platform === 'win32' ? 'Non-Windows test' : false
}, () => {
  assert.throws(() => safePath('C:/workspace'), (err) => err?.code === 'PATH_UNSAFE');
  assert.throws(() => safePath('C:\\workspace'), (err) => err?.code === 'PATH_UNSAFE');
  assert.throws(() => safePath('c:/workspace'), (err) => err?.code === 'PATH_UNSAFE');
  assert.equal(safePath('/workspace/project'), '/workspace/project');
});

test('normalizeRelativePath remains POSIX relative only', () => {
  assert.equal(normalizeRelativePath('docs/guide.md'), 'docs/guide.md');
  assert.equal(normalizeRelativePath('assets/image.png'), 'assets/image.png');
  assert.throws(() => normalizeRelativePath('docs\\guide.md'), (err) => err?.code === 'PATH_UNSAFE');
  assert.throws(() => normalizeRelativePath('/docs/guide.md'), (err) => err?.code === 'PATH_UNSAFE');
  assert.throws(() => normalizeRelativePath('C:/docs/guide.md'), (err) => err?.code === 'PATH_UNSAFE');
  assert.throws(() => normalizeRelativePath('C:\\docs\\guide.md'), (err) => err?.code === 'PATH_UNSAFE');
  assert.throws(() => normalizeRelativePath('../guide.md'), (err) => err?.code === 'PATH_UNSAFE');
  assert.throws(() => normalizeRelativePath('./guide.md'), (err) => err?.code === 'PATH_UNSAFE');
});

test('validatePublicationAncestors accepts children and rejects escapes cross-platform', () => {
  const root = mkdtempSync(join(tmpdir(), 'evcrate-pub-ancestors-'));
  const childDir = join(root, '.claude', 'commands');
  mkdirSync(childDir, { recursive: true });

  assert.doesNotThrow(() => validatePublicationAncestors(root, childDir));
  assert.doesNotThrow(() => validatePublicationAncestors(root, root));

  const escapeDir = mkdtempSync(join(tmpdir(), 'evcrate-pub-escape-'));
  assert.throws(() => validatePublicationAncestors(root, escapeDir), (err) => err?.code === 'PATH_UNSAFE');
});

test('sameVolume handles Windows drive roots', () => {
  if (process.platform === 'win32') {
    assert.equal(sameVolume('C:\\work', 'c:\\Users'), true);
    assert.equal(sameVolume('C:\\work', 'D:\\work'), false);
  }
});

test('Windows path validator accepts canonical drive roots and normalizes separators', () => {
  assert.equal(validateWindowsPath('C:\\work\\evcrate'), 'C:\\work\\evcrate');
  assert.equal(validateWindowsPath('C:/work/evcrate'), 'C:\\work\\evcrate');
  assert.equal(validateWindowsPath('c:\\work\\evcrate'), 'c:\\work\\evcrate');
  assert.equal(validateWindowsPath('d:/project/dir'), 'd:\\project\\dir');
  assert.equal(validateWindowsPath('C:\\'), 'C:\\');
  assert.equal(validateWindowsPath('C:/'), 'C:\\');
  assert.equal(validateWindowsPath('C:\\path with spaces\\project'), 'C:\\path with spaces\\project');
  assert.equal(validateWindowsPath('C:/path with spaces/project'), 'C:\\path with spaces\\project');
});

test('Windows path validator rejects hostile path families', () => {
  const hostilePaths = [
    // Drive-relative
    'C:foo', 'C:', 'c:bar\\baz', 'd:relative',
    // UNC and device namespaces
    '\\\\server\\share', '//server/share', '\\\\?\\C:\\work', '\\\\.\\COM1',
    // Ambiguous root-relative
    '\\work', '/work', '\\foo\\bar', '/foo/bar',
    // Non-root trailing separators
    'C:\\work\\', 'C:\\work/', 'C:/work/', 'C:/work\\',
    // Duplicate separators
    'C:\\work\\\\sub', 'C:\\\\work', 'C:/work//sub',
    // ADS colons
    'C:\\work\\file:stream', 'C:\\work:stream', 'C:/work/foo:bar',
    // Invalid filename characters
    'C:\\work\\foo<bar', 'C:\\work\\foo>bar', 'C:\\work\\foo"bar',
    'C:\\work\\foo|bar', 'C:\\work\\foo?bar', 'C:\\work\\foo*bar',
    // Trailing dot and space
    'C:\\work\\sub.', 'C:\\work\\sub ', 'C:\\work\\sub. \\more',
    // DOS devices
    'C:\\work\\CON', 'C:\\work\\PRN', 'C:\\work\\AUX', 'C:\\work\\NUL',
    'C:\\work\\COM1', 'C:\\work\\COM9', 'C:\\work\\LPT1', 'C:\\work\\LPT9',
    'C:\\work\\con.txt', 'C:\\work\\aux.json', 'C:\\work\\nul.tar.gz',
    'C:\\work\\com1.dat', 'C:\\work\\lpt9.log', 'C:\\work\\cOn', 'C:\\work\\AuX',
    'C:\\work\\CONIN$', 'C:\\work\\CONOUT$', 'C:\\work\\conin$.txt', 'C:\\work\\conout$.dat',
    'C:\\work\\CLOCK$', 'C:\\work\\clock$.txt',
    // Traversal and dots
    'C:\\work\\..\\secret', 'C:\\work\\.\\foo', 'C:\\work\\..', 'C:\\work\\.',
    // Metadata directories
    'C:\\work\\.git\\config', 'C:\\work\\.git', 'C:\\work\\.gitignore',
    'C:\\work\\.github\\workflows', 'C:\\work\\.GIT\\HEAD',
    // Sensitive path segments
    'C:\\work\\.env', 'C:\\work\\.env.local', 'C:\\work\\my_secret_key.pem',
    'C:\\work\\token_store.json', 'C:\\work\\private-key.txt'
  ];

  for (const hostile of hostilePaths) {
    assert.throws(
      () => validateWindowsPath(hostile),
      (err) => err?.code === 'PATH_UNSAFE',
      `Expected ${hostile} to be rejected`
    );
  }
});

test('lexicalAbsoluteWindows rejects hostile relative and absolute forms before resolve', () => {
  const base = 'C:\\work\\base';
  const hostileInputs = [
    '..', '.', '../secret', './foo', 'foo/../bar', 'foo/./bar',
    'sub.', 'sub ', 'sub. \\dir', 'sub .\\dir',
    'CON', 'con.txt', 'aux', 'NUL', 'COM1', 'lpt9.txt',
    'bad<name', 'bad>name', 'bad"name', 'bad|name', 'bad?name', 'bad*name',
    'foo:bar', 'file:stream',
    '\\\\server\\share', 'C:foo', '\\foo', '/foo',
    '.git', '.env', 'secret-key.pem'
  ];

  for (const input of hostileInputs) {
    assert.throws(
      () => lexicalAbsoluteWindows(input, base),
      (err) => err?.code === 'PATH_UNSAFE',
      `Expected ${input} to be rejected by lexicalAbsoluteWindows`
    );
  }
});

test('Windows native context and reparse contract suite', {
  skip: process.platform !== 'win32' ? 'Windows-only suite' : false
}, () => {
  // Positive Windows host path resolution
  assert.equal(safePath('C:\\Windows'), 'C:\\Windows');
  assert.equal(safePath('C:/Windows'), 'C:\\Windows');

  const cwd = process.cwd();
  const safeCwd = resolveSafePath(cwd);
  assert.ok(/^[A-Za-z]:\\/u.test(safeCwd));

  // Context roots
  const home = resolveHomeRoot();
  assert.ok(/^[A-Za-z]:\\/u.test(home));

  const state = resolveStateRoot({ home });
  assert.ok(/^[A-Za-z]:\\/u.test(state));

  const project = resolveProjectRoot(safeCwd);
  assert.ok(/^[A-Za-z]:\\/u.test(project));

  // Reparse / symlink ancestor test
  const tempRoot = mkdtempSync(join(tmpdir(), 'evcrate-win-reparse-'));
  const targetDir = join(tempRoot, 'target');
  const linkDir = join(tempRoot, 'link');
  mkdirSync(targetDir);

  // Publication ancestors with native Windows paths
  const winPubRoot = join(tempRoot, 'winhome');
  const winPubChild = join(winPubRoot, '.claude');
  mkdirSync(winPubChild, { recursive: true });
  assert.doesNotThrow(() => validatePublicationAncestors(winPubRoot, winPubChild));
  let linkCreated = false;
  try {
    symlinkSync(targetDir, linkDir, 'junction');
    linkCreated = true;
  } catch {
    try {
      symlinkSync(targetDir, linkDir, 'dir');
      linkCreated = true;
    } catch {
      // Runner may lack privileges for symlinks
    }
  }

  if (linkCreated) {
    const linkChild = join(linkDir, 'child');
    assert.throws(
      () => assertNoSymlinkAncestors(linkChild),
      (err) => err?.code === 'PATH_UNSAFE',
      'assertNoSymlinkAncestors must reject symlinked/junction ancestor'
    );
    assert.throws(
      () => resolveSafePath(linkChild),
      (err) => err?.code === 'PATH_UNSAFE',
      'resolveSafePath must reject symlinked/junction ancestor'
    );
  }
});
