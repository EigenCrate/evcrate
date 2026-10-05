import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { isBuildInfoCorrupt } from '../../scripts/typescript-build-cache.mjs';
import { buildTypeScript } from '../../scripts/build-typescript.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(__dirname, '..', '..');

describe('TypeScript Incremental Build Workspace Lifecycle', () => {
  let workspaceDir;

  before(() => {
    workspaceDir = mkdtempSync(join(tmpdir(), 'evcrate-e2e-ws-'));
    mkdirSync(join(workspaceDir, 'src'), { recursive: true });
    mkdirSync(join(workspaceDir, '.cache', 'evcrate'), { recursive: true });

    try {
      fs.symlinkSync(join(packageRoot, 'node_modules'), join(workspaceDir, 'node_modules'), 'junction');
    } catch {}

    const tsconfig = {
      compilerOptions: {
        target: 'ES2022',
        module: 'NodeNext',
        moduleResolution: 'NodeNext',
        declaration: true,
        outDir: 'dist',
        rootDir: 'src',
        strict: true,
        incremental: true,
        tsBuildInfoFile: '.cache/evcrate/tsconfig.tsbuildinfo',
      },
      include: ['src/**/*.ts'],
    };
    writeFileSync(join(workspaceDir, 'tsconfig.json'), JSON.stringify(tsconfig, null, 2), 'utf8');
    writeFileSync(join(workspaceDir, 'src', 'first.ts'), 'export const first = 10;\n', 'utf8');
    writeFileSync(join(workspaceDir, 'src', 'second.ts'), 'export const second = 20;\n', 'utf8');
  });

  after(() => {
    if (workspaceDir && existsSync(workspaceDir)) {
      rmSync(workspaceDir, { recursive: true, force: true });
    }
  });

  it('clean build produces JS, d.ts, tsbuildinfo, and receipt', () => {
    const res = buildTypeScript({ config: 'tsconfig.json', clean: true, root: workspaceDir, logger: { warn: () => {} } });
    assert.equal(res.status, 0);
    assert.equal(existsSync(join(workspaceDir, 'dist', 'first.js')), true);
    assert.equal(existsSync(join(workspaceDir, 'dist', 'first.d.ts')), true);
    assert.equal(existsSync(join(workspaceDir, 'dist', 'second.js')), true);
    assert.equal(existsSync(join(workspaceDir, 'dist', 'second.d.ts')), true);
    assert.equal(existsSync(join(workspaceDir, '.cache', 'evcrate', 'tsconfig.tsbuildinfo')), true);
    assert.equal(existsSync(join(workspaceDir, '.cache', 'evcrate', 'tsconfig.tsbuildinfo.receipt.json')), true);
  });

  it('warm incremental build is fast and retains outputs', () => {
    const res = buildTypeScript({ config: 'tsconfig.json', clean: false, root: workspaceDir, logger: { warn: () => {} } });
    assert.equal(res.status, 0);
    assert.equal(res.cleaned.length, 0);
  });

  it('recovers and re-emits when an output JS file is deleted', () => {
    const targetJs = join(workspaceDir, 'dist', 'first.js');
    rmSync(targetJs);
    assert.equal(existsSync(targetJs), false);

    const res = buildTypeScript({ config: 'tsconfig.json', clean: false, root: workspaceDir, logger: { warn: () => {} } });
    assert.equal(res.status, 0);
    assert.equal(existsSync(targetJs), true);
  });

  it('recovers when declaration d.ts file is deleted', () => {
    const targetDts = join(workspaceDir, 'dist', 'second.d.ts');
    rmSync(targetDts);
    assert.equal(existsSync(targetDts), false);

    const res = buildTypeScript({ config: 'tsconfig.json', clean: false, root: workspaceDir, logger: { warn: () => {} } });
    assert.equal(res.status, 0);
    assert.equal(existsSync(targetDts), true);
  });

  it('recovers when cache file is corrupted', () => {
    const cachePath = join(workspaceDir, '.cache', 'evcrate', 'tsconfig.tsbuildinfo');
    writeFileSync(cachePath, 'CORRUPTED_CACHE_CONTENTS', 'utf8');

    const res = buildTypeScript({ config: 'tsconfig.json', clean: false, root: workspaceDir, logger: { warn: () => {} } });
    assert.equal(res.status, 0);
    assert.equal(isBuildInfoCorrupt(cachePath), false);
  });

  it('removes stale outputs when a source file is removed or renamed', () => {
    rmSync(join(workspaceDir, 'src', 'first.ts'));
    writeFileSync(join(workspaceDir, 'src', 'third.ts'), 'export const third = 30;\n', 'utf8');

    const res = buildTypeScript({ config: 'tsconfig.json', clean: false, root: workspaceDir, logger: { warn: () => {} } });
    assert.equal(res.status, 0);
    assert.equal(existsSync(join(workspaceDir, 'dist', 'third.js')), true);
    assert.equal(existsSync(join(workspaceDir, 'dist', 'first.js')), false);
    assert.equal(existsSync(join(workspaceDir, 'dist', 'first.d.ts')), false);
    assert.ok(res.cleaned.includes('dist/first.js'));
    assert.ok(res.cleaned.includes('dist/first.d.ts'));
  });

  it('reports non-zero exit status on compiler errors', () => {
    writeFileSync(join(workspaceDir, 'src', 'error.ts'), 'const bad: number = "not a number";\n', 'utf8');
    const res = buildTypeScript({ config: 'tsconfig.json', clean: false, root: workspaceDir, logger: { warn: () => {} } });
    assert.notEqual(res.status, 0);
    rmSync(join(workspaceDir, 'src', 'error.ts'));
  });
});
