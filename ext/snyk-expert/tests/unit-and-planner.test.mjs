import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

import {
  resolveTarget,
  resolveInstallTarget,
  getSourceInventory,
  planInstallation,
  executeInstallation,
  ASSET_INVENTORY
} from '../lib/install.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.resolve(__dirname, '..');

describe('Snyk Expert Installer - Unit & Planner', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'snyk-test-'));
  });

  afterEach(() => {
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  describe('resolveInstallTarget', () => {
    test('resolves agents target and directory', () => {
      const res = resolveInstallTarget({ target: 'agents', directory: tmpDir });
      assert.equal(res.target, 'agents');
      assert.equal(res.targetDir, path.resolve(tmpDir));
      assert.equal(res.installationRoot, path.join(path.resolve(tmpDir), '.agents'));
    });

    test('rejects missing or unsupported target', () => {
      assert.throws(
        () => resolveInstallTarget({ target: 'vscode', directory: tmpDir }),
        /Unsupported target or missing target 'vscode'\. Choose agents\./
      );
      assert.throws(
        () => resolveInstallTarget({ target: undefined, directory: tmpDir }),
        /Unsupported target or missing target 'undefined'\. Choose agents\./
      );
    });

    test('rejects missing or empty directory', () => {
      assert.throws(
        () => resolveInstallTarget({ target: 'agents', directory: '' }),
        /The agents target requires --directory <project-root>\./
      );
      assert.throws(
        () => resolveInstallTarget({ target: 'agents', directory: undefined }),
        /The agents target requires --directory <project-root>\./
      );
    });

    test('rejects file or symbolic link supplied as project root', () => {
      const regularFile = path.join(tmpDir, 'not-a-dir.txt');
      fs.writeFileSync(regularFile, 'content');
      assert.throws(
        () => resolveInstallTarget({ target: 'agents', directory: regularFile }),
        /The project root must be a non-symbolic-link directory\./
      );

      const symlinkDir = path.join(tmpDir, 'symlink-dir');
      const realTarget = path.join(tmpDir, 'real-dir');
      fs.mkdirSync(realTarget);
      fs.symlinkSync(realTarget, symlinkDir);
      assert.throws(
        () => resolveInstallTarget({ target: 'agents', directory: symlinkDir }),
        /The project root must be a non-symbolic-link directory\./
      );
    });
  });

  describe('resolveTarget', () => {
    test('resolves target using { target, directory } object', () => {
      const res = resolveTarget({ target: 'agents', directory: tmpDir });
      assert.equal(res.targetDir, path.resolve(tmpDir));
    });

    test('resolves explicit target directory string', () => {
      const explicit = path.join(tmpDir, 'custom-project');
      fs.mkdirSync(explicit);
      const res = resolveTarget(explicit, tmpDir, '/home/fake');
      assert.equal(res.targetDir, path.resolve(explicit));
      assert.equal(res.isExplicit, true);
    });

    test('defaults to cwd when target is omitted and cwd != home', () => {
      const cwd = path.join(tmpDir, 'my-project');
      fs.mkdirSync(cwd);
      const home = path.join(tmpDir, 'home-user');
      const res = resolveTarget(undefined, cwd, home);
      assert.equal(res.targetDir, path.resolve(cwd));
      assert.equal(res.isExplicit, false);
    });

    test('refuses to default to user home directory', () => {
      const home = path.join(tmpDir, 'home-user');
      assert.throws(
        () => resolveTarget(undefined, home, home),
        (err) => {
          assert.equal(err.code, 'ERR_HOME_TARGET_DISALLOWED');
          return true;
        }
      );
    });
  });

  describe('getSourceInventory', () => {
    test('throws if source bundle .agents directory is missing', () => {
      const emptyDir = path.join(tmpDir, 'empty');
      fs.mkdirSync(emptyDir);
      assert.throws(() => getSourceInventory(emptyDir));
    });
  });

  describe('planInstallation', () => {
    test('plans a fresh target with target and directory without collisions', () => {
      const plan = planInstallation({
        sourceDir: PACKAGE_ROOT,
        target: 'agents',
        directory: tmpDir
      });
      assert.equal(plan.target, 'agents');
      assert.equal(plan.hasCollisions, false);
      assert.equal(plan.isBlocked, false);
      assert.equal(plan.replacements.length, 0);
      assert.equal(plan.unchanged.length, 0);
      assert.equal(plan.additions.length, ASSET_INVENTORY.length);
    });

    test('detects unchanged files when identical files exist', () => {
      const plan1 = planInstallation({ sourceDir: PACKAGE_ROOT, target: 'agents', directory: tmpDir });
      executeInstallation(plan1);

      const plan2 = planInstallation({ sourceDir: PACKAGE_ROOT, target: 'agents', directory: tmpDir });
      assert.equal(plan2.hasCollisions, false);
      assert.equal(plan2.isBlocked, false);
      assert.equal(plan2.additions.length, 0);
      assert.equal(plan2.unchanged.length, ASSET_INVENTORY.length);
    });

    test('detects collisions when existing file content differs', () => {
      const agentDest = path.join(tmpDir, '.agents', 'agents', 'snyk-expert.md');
      fs.mkdirSync(path.dirname(agentDest), { recursive: true });
      fs.writeFileSync(agentDest, 'DIFFERENT CONTENT');

      const plan = planInstallation({ sourceDir: PACKAGE_ROOT, target: 'agents', directory: tmpDir });
      assert.equal(plan.hasCollisions, true);
      assert.equal(plan.replacements.length, 1);
      assert.equal(plan.replacements[0].relPath, 'agents/snyk-expert.md');
    });

    test('blocks installation if destination path is a directory instead of file', () => {
      const conflictDir = path.join(tmpDir, '.agents', 'agents', 'snyk-expert.md');
      fs.mkdirSync(conflictDir, { recursive: true });

      const plan = planInstallation({ sourceDir: PACKAGE_ROOT, target: 'agents', directory: tmpDir });
      assert.equal(plan.isBlocked, true);
      assert.ok(plan.blockers.some(b => b.relPath === 'agents/snyk-expert.md'));
    });

    test('blocks installation if destination path is a dangling symlink', () => {
      const symlinkDest = path.join(tmpDir, '.agents', 'agents', 'snyk-expert.md');
      fs.mkdirSync(path.dirname(symlinkDest), { recursive: true });
      fs.symlinkSync('/tmp/nonexistent-target-' + Date.now(), symlinkDest);

      const plan = planInstallation({ sourceDir: PACKAGE_ROOT, target: 'agents', directory: tmpDir });
      assert.equal(plan.isBlocked, true);
      assert.ok(plan.blockers.some(b => b.destPath === symlinkDest));
    });

    test('blocks installation if destination contains a symlink escaping targetDir', () => {
      const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'outside-'));
      try {
        const agentsDir = path.join(tmpDir, '.agents');
        fs.mkdirSync(agentsDir, { recursive: true });
        fs.symlinkSync(outsideDir, path.join(agentsDir, 'skills'));

        const plan = planInstallation({ sourceDir: PACKAGE_ROOT, target: 'agents', directory: tmpDir });
        assert.equal(plan.isBlocked, true);
        assert.ok(plan.blockers.some(b => b.destPath.startsWith(path.join(agentsDir, 'skills') + path.sep)));
      } finally {
        fs.rmSync(outsideDir, { recursive: true, force: true });
      }
    });
  });
});
