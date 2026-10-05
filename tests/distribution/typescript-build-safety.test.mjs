import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

import { buildTypeScript } from '../../scripts/build-typescript.mjs';
import { resolveConfigOutputs } from '../../scripts/typescript-build-cache.mjs';
import { cleanStaleOutputs } from '../../scripts/typescript-build-receipt.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(__dirname, '..', '..');

function makeTempWorkspace() {
  const ws = mkdtempSync(join(tmpdir(), 'evcrate-ts-safety-'));
  mkdirSync(join(ws, 'src'), { recursive: true });
  mkdirSync(join(ws, '.cache', 'evcrate'), { recursive: true });
  try {
    symlinkSync(join(packageRoot, 'node_modules'), join(ws, 'node_modules'), 'junction');
  } catch {}
  return ws;
}

function writeJson(filePath, data) {
  writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

describe('TypeScript Build Safety & Regressions (F1-F5)', () => {
  let ws;

  before(() => {
    ws = makeTempWorkspace();
  });

  after(() => {
    if (ws && existsSync(ws)) {
      rmSync(ws, { recursive: true, force: true });
    }
  });

  it('F1: preserves external files when output subdirectory is an ancestor symlink', () => {
    const outDir = join(ws, 'dist-symlink-f1');
    mkdirSync(outDir, { recursive: true });

    const externalDir = mkdtempSync(join(tmpdir(), 'evcrate-external-data-'));
    const externalFile = join(externalDir, 'unrelated.js');
    writeFileSync(externalFile, '/* sensitive external content */\n', 'utf8');

    // Create ancestor symlink dist-symlink-f1/linked -> externalDir
    symlinkSync(externalDir, join(outDir, 'linked'), 'dir');

    const receiptPath = join(ws, 'symlink-f1.receipt.json');
    const receiptData = {
      version: 1,
      config: 'tsconfig.json',
      outDir: 'dist-symlink-f1',
      outputs: ['dist-symlink-f1/linked/unrelated.js'],
    };
    writeJson(receiptPath, receiptData);

    const { cleaned, errors, uncleaned } = cleanStaleOutputs(
      receiptPath,
      new Set(),
      outDir,
      ws
    );

    // External file MUST survive
    assert.equal(existsSync(externalFile), true, 'External file must survive ancestor symlink cleanup');
    assert.equal(readFileSync(externalFile, 'utf8'), '/* sensitive external content */\n');
    assert.equal(cleaned.length, 0, 'Cleaned list must be empty');
    assert.ok(errors.length > 0, 'Errors must report symlink traversal refusal');
    assert.ok(errors.some((e) => e.includes('symlink')));
    assert.ok(uncleaned.includes('dist-symlink-f1/linked/unrelated.js'), 'Uncleaned output must retain ownership');

    rmSync(externalDir, { recursive: true, force: true });
  });

  it('F2: retains live imported module and allows require after config root removal', async () => {
    const testWs = makeTempWorkspace();

    try {
      const tsconfig = {
        compilerOptions: {
          target: 'ES2022',
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
          outDir: 'dist',
          rootDir: 'src',
          strict: true,
          incremental: true,
          tsBuildInfoFile: '.cache/evcrate/tsconfig.tsbuildinfo',
        },
        files: ['src/entry.ts', 'src/imported-helper.ts'],
      };
      writeJson(join(testWs, 'tsconfig.json'), tsconfig);

      writeFileSync(
        join(testWs, 'src', 'imported-helper.ts'),
        'export const helperVal: number = 42;\n',
        'utf8'
      );
      writeFileSync(
        join(testWs, 'src', 'entry.ts'),
        'import { helperVal } from "./imported-helper.js";\nexport const result: number = helperVal * 2;\n',
        'utf8'
      );

      // Build 1: both entry and imported-helper are config roots
      const build1 = buildTypeScript({ config: 'tsconfig.json', root: testWs, logger: { warn: () => {} } });
      assert.equal(build1.status, 0);
      assert.equal(existsSync(join(testWs, 'dist', 'imported-helper.js')), true);
      assert.equal(existsSync(join(testWs, 'dist', 'entry.js')), true);

      // Build 2: remove imported-helper from config roots (leaving only entry.ts)
      tsconfig.files = ['src/entry.ts'];
      writeJson(join(testWs, 'tsconfig.json'), tsconfig);

      const build2 = buildTypeScript({ config: 'tsconfig.json', root: testWs, logger: { warn: () => {} } });
      assert.equal(build2.status, 0);

      // imported-helper.js MUST survive because entry.ts still imports it
      assert.equal(existsSync(join(testWs, 'dist', 'imported-helper.js')), true, 'Imported module JS must not be deleted');
      assert.ok(!build2.cleaned.includes('dist/imported-helper.js'), 'imported-helper must not be in cleaned list');

      // Consumer require/import check
      const entryUrl = pathToFileURL(join(testWs, 'dist', 'entry.js')).href;
      const loaded = await import(entryUrl);
      assert.equal(loaded.result, 84, 'Entry module must successfully require imported module');

      // Verify resolveConfigOutputs includes imported-helper in expectedOutputs
      const resolved = resolveConfigOutputs('tsconfig.json', testWs);
      assert.ok(resolved.expectedOutputs.includes('dist/imported-helper.js'), 'expectedOutputs must contain imported module');
    } finally {
      rmSync(testWs, { recursive: true, force: true });
    }
  });

  it('F2: heals deleted imported-only output on incremental rebuild', () => {
    const testWs = makeTempWorkspace();

    try {
      const tsconfig = {
        compilerOptions: {
          target: 'ES2022',
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
          outDir: 'dist',
          rootDir: 'src',
          strict: true,
          incremental: true,
          tsBuildInfoFile: '.cache/evcrate/tsconfig.tsbuildinfo',
        },
        files: ['src/entry.ts'], // imported-only module not listed in files
      };
      writeJson(join(testWs, 'tsconfig.json'), tsconfig);

      writeFileSync(
        join(testWs, 'src', 'dep.ts'),
        'export const depValue = 100;\n',
        'utf8'
      );
      writeFileSync(
        join(testWs, 'src', 'entry.ts'),
        'import { depValue } from "./dep.js";\nexport const val = depValue;\n',
        'utf8'
      );

      // Initial build
      const build1 = buildTypeScript({ config: 'tsconfig.json', root: testWs, logger: { warn: () => {} } });
      assert.equal(build1.status, 0);
      assert.equal(existsSync(join(testWs, 'dist', 'dep.js')), true);

      // Simulate accidental deletion of imported-only output while cache is warm
      rmSync(join(testWs, 'dist', 'dep.js'));
      assert.equal(existsSync(join(testWs, 'dist', 'dep.js')), false);

      // Incremental build must detect missing dep.js and re-emit it
      const build2 = buildTypeScript({ config: 'tsconfig.json', root: testWs, clean: false, logger: { warn: () => {} } });
      assert.equal(build2.status, 0);
      assert.equal(existsSync(join(testWs, 'dist', 'dep.js')), true, 'dep.js must be re-emitted');
    } finally {
      rmSync(testWs, { recursive: true, force: true });
    }
  });

  it('F3: clean-after-rename removes obsolete output while preserving unrelated outputs', () => {
    const testWs = makeTempWorkspace();

    try {
      const tsconfig = {
        compilerOptions: {
          target: 'ES2022',
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
          outDir: 'dist',
          rootDir: 'src',
          strict: true,
          incremental: true,
          declaration: true,
          tsBuildInfoFile: '.cache/evcrate/tsconfig.tsbuildinfo',
        },
        include: ['src/**/*.ts'],
      };
      writeJson(join(testWs, 'tsconfig.json'), tsconfig);

      writeFileSync(join(testWs, 'src', 'old-feature.ts'), 'export const oldFeature = 1;\n', 'utf8');

      // Initial build creates dist/old-feature.js and receipt
      const build1 = buildTypeScript({ config: 'tsconfig.json', root: testWs, logger: { warn: () => {} } });
      assert.equal(build1.status, 0);
      assert.equal(existsSync(join(testWs, 'dist', 'old-feature.js')), true);

      // Create an unrelated manual file in dist that compiler does not own
      const manualFile = join(testWs, 'dist', 'manual-asset.txt');
      writeFileSync(manualFile, 'user generated content', 'utf8');

      // Rename source
      rmSync(join(testWs, 'src', 'old-feature.ts'));
      writeFileSync(join(testWs, 'src', 'new-feature.ts'), 'export const newFeature = 2;\n', 'utf8');

      // Run build with --clean: must clean old-feature outputs from previous receipt
      const buildClean = buildTypeScript({ config: 'tsconfig.json', root: testWs, clean: true, logger: { warn: () => {} } });
      assert.equal(buildClean.status, 0);

      // Old compiler output removed
      assert.equal(existsSync(join(testWs, 'dist', 'old-feature.js')), false, 'Obsolete JS must be cleaned');
      assert.equal(existsSync(join(testWs, 'dist', 'old-feature.d.ts')), false, 'Obsolete d.ts must be cleaned');

      // New compiler output emitted
      assert.equal(existsSync(join(testWs, 'dist', 'new-feature.js')), true, 'New JS must exist');
      assert.equal(existsSync(join(testWs, 'dist', 'new-feature.d.ts')), true, 'New d.ts must exist');

      // Unrelated file preserved
      assert.equal(existsSync(manualFile), true, 'Unrelated output must be preserved');
      assert.equal(readFileSync(manualFile, 'utf8'), 'user generated content');

      // Receipt contains new outputs and neither old output nor unrelated manual file
      const receiptPath = join(testWs, '.cache', 'evcrate', 'tsconfig.tsbuildinfo.receipt.json');
      assert.equal(existsSync(receiptPath), true);
      const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'));
      assert.ok(receipt.outputs.includes('dist/new-feature.js'));
      assert.ok(!receipt.outputs.includes('dist/old-feature.js'));
      assert.ok(!receipt.outputs.includes('dist/manual-asset.txt'));
    } finally {
      rmSync(testWs, { recursive: true, force: true });
    }
  });

  it('F5: forwarded --noEmit preserves existing output and receipt without deleting outputs', () => {
    const testWs = makeTempWorkspace();

    try {
      const tsconfig = {
        compilerOptions: {
          target: 'ES2022',
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
          outDir: 'dist',
          rootDir: 'src',
          strict: true,
          incremental: true,
          tsBuildInfoFile: '.cache/evcrate/tsconfig.tsbuildinfo',
        },
        include: ['src/**/*.ts'],
      };
      writeJson(join(testWs, 'tsconfig.json'), tsconfig);

      writeFileSync(join(testWs, 'src', 'original.ts'), 'export const alive = true;\n', 'utf8');

      // Build 1: emit runnable output
      const build1 = buildTypeScript({ config: 'tsconfig.json', root: testWs, logger: { warn: () => {} } });
      assert.equal(build1.status, 0);
      assert.equal(existsSync(join(testWs, 'dist', 'original.js')), true);

      const receiptPath = join(testWs, '.cache', 'evcrate', 'tsconfig.tsbuildinfo.receipt.json');
      assert.equal(existsSync(receiptPath), true);
      const receiptBefore = readFileSync(receiptPath, 'utf8');

      // Rename source file
      rmSync(join(testWs, 'src', 'original.ts'));
      writeFileSync(join(testWs, 'src', 'renamed.ts'), 'export const alive = true;\n', 'utf8');

      // Run build with --noEmit (typecheck-only)
      const buildNoEmit = buildTypeScript({
        config: 'tsconfig.json',
        root: testWs,
        extraArgs: ['--noEmit'],
        logger: { warn: () => {} },
      });

      assert.equal(buildNoEmit.status, 0);
      assert.equal(buildNoEmit.receiptWritten, false, 'Receipt must not be rewritten on noEmit');
      assert.equal(buildNoEmit.cleaned.length, 0, 'No files must be cleaned on noEmit');

      // Existing runnable JS MUST still be present
      assert.equal(existsSync(join(testWs, 'dist', 'original.js')), true, 'Existing output must not be deleted by --noEmit');

      // No new output should have been emitted
      assert.equal(existsSync(join(testWs, 'dist', 'renamed.js')), false, 'noEmit must not emit new output');

      // Receipt must be completely preserved
      const receiptAfter = readFileSync(receiptPath, 'utf8');
      assert.equal(receiptAfter, receiptBefore, 'Receipt must remain untouched by --noEmit');
    } finally {
      rmSync(testWs, { recursive: true, force: true });
    }
  });

  it('F1: refuses cleanup when the output root itself is a symlink', () => {
    const external = mkdtempSync(join(tmpdir(), 'evcrate-external-root-'));
    try {
      writeFileSync(join(external, 'owned.js'), 'external content');
      symlinkSync(external, join(ws, 'linked-root'), 'dir');
      const receiptPath = join(ws, 'linked-root.receipt.json');
      writeJson(receiptPath, { version: 1, outDir: 'linked-root', outputs: ['linked-root/owned.js'] });
      const result = cleanStaleOutputs(receiptPath, new Set(), join(ws, 'linked-root'), ws);
      assert.equal(readFileSync(join(external, 'owned.js'), 'utf8'), 'external content');
      assert.ok(result.errors.length > 0);
      assert.deepEqual(result.uncleaned, ['linked-root/owned.js']);
    } finally {
      rmSync(external, { recursive: true, force: true });
    }
  });

  it('F1: real failed cleanup preserves prior ownership receipt and external bytes', () => {
    const root = makeTempWorkspace();
    try {
      writeJson(join(root, 'tsconfig.json'), {
        compilerOptions: { target: 'ES2022', module: 'CommonJS', rootDir: 'src', outDir: 'dist',
          incremental: true, tsBuildInfoFile: '.cache/build.tsbuildinfo' },
        include: ['src/**/*.ts'],
      });
      mkdirSync(join(root, 'src', 'linked'));
      writeFileSync(join(root, 'src', 'linked', 'old.ts'), 'export const old = 1;');
      assert.equal(buildTypeScript({ root }).status, 0);
      const receiptPath = resolveConfigOutputs('tsconfig.json', root).receiptPath;
      const receiptBefore = readFileSync(receiptPath);
      const external = join(root, 'external');
      mkdirSync(external);
      writeFileSync(join(external, 'old.js'), 'external data survives');
      rmSync(join(root, 'src', 'linked'), { recursive: true });
      rmSync(join(root, 'dist', 'linked'), { recursive: true });
      symlinkSync(external, join(root, 'dist', 'linked'), 'dir');
      writeFileSync(join(root, 'src', 'new.ts'), 'export const current = 2;');
      const result = buildTypeScript({ root, logger: { warn() {} } });
      assert.equal(result.status, 1);
      assert.equal(result.receiptWritten, false);
      assert.deepEqual(readFileSync(receiptPath), receiptBefore);
      assert.equal(readFileSync(join(external, 'old.js'), 'utf8'), 'external data survives');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('forwarded output and declaration directories retain independent ownership', () => {
    const testWs = makeTempWorkspace();
    try {
      writeJson(join(testWs, 'tsconfig.json'), {
        compilerOptions: { target: 'ES2022', module: 'CommonJS', outDir: 'dist', rootDir: 'src',
          incremental: true, declaration: true, tsBuildInfoFile: '.cache/build.tsbuildinfo' },
        include: ['src/**/*.ts'],
      });
      writeFileSync(join(testWs, 'src', 'entry.ts'), 'export const value = 42;');
      assert.equal(buildTypeScript({ root: testWs }).status, 0);
      const originalReceipt = resolveConfigOutputs('tsconfig.json', testWs).receiptPath;
      const before = readFileSync(originalReceipt, 'utf8');
      const extraArgs = ['--outDir', 'alternate', '--declarationDir', 'types'];
      assert.equal(buildTypeScript({ root: testWs, extraArgs }).status, 0);
      assert.equal(readFileSync(originalReceipt, 'utf8'), before);
      assert.equal(existsSync(join(testWs, 'dist', 'entry.js')), true);
      assert.equal(existsSync(join(testWs, 'types', 'entry.d.ts')), true);
      assert.equal(JSON.parse(readFileSync(resolveConfigOutputs('tsconfig.json', testWs, extraArgs).receiptPath, 'utf8')).outDir, 'alternate');
      assert.equal(createRequire(import.meta.url)(join(testWs, 'alternate', 'entry.js')).value, 42);
      rmSync(join(testWs, 'alternate', 'entry.js'));
      assert.equal(buildTypeScript({ root: testWs, extraArgs }).status, 0);
      assert.equal(existsSync(join(testWs, 'alternate', 'entry.js')), true);
    } finally {
      rmSync(testWs, { recursive: true, force: true });
    }
  });
});
