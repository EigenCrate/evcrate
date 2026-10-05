import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

import {
  planInstallation,
  executeInstallation,
  ASSET_INVENTORY
} from '../lib/install.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.resolve(__dirname, '..');

describe('Snyk Expert Installer - Executor', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'snyk-test-'));
  });

  afterEach(() => {
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('performs fresh installation and validates byte equality', () => {
    const plan = planInstallation({ sourceDir: PACKAGE_ROOT, targetDir: tmpDir });
    const result = executeInstallation(plan);

    assert.equal(result.committed.length, 8);
    assert.equal(result.unchanged.length, 0);

    for (const rel of ASSET_INVENTORY) {
      const srcPath = path.join(PACKAGE_ROOT, '.claude', rel);
      const destPath = path.join(tmpDir, '.claude', rel);
      assert.ok(fs.existsSync(destPath), `File does not exist: ${destPath}`);
      assert.ok(fs.readFileSync(srcPath).equals(fs.readFileSync(destPath)));
    }
  });

  test('preserves unrelated pre-existing files in .claude directory', () => {
    const unrelated = path.join(tmpDir, '.claude', 'custom-agent.md');
    fs.mkdirSync(path.dirname(unrelated), { recursive: true });
    fs.writeFileSync(unrelated, '# My Custom Agent');

    const plan = planInstallation({ sourceDir: PACKAGE_ROOT, targetDir: tmpDir });
    executeInstallation(plan);

    assert.ok(fs.existsSync(unrelated));
    assert.equal(fs.readFileSync(unrelated, 'utf8'), '# My Custom Agent');
  });

  test('refuses to overwrite collision without --force', () => {
    const agentDest = path.join(tmpDir, '.claude', 'agents', 'snyk-expert.md');
    fs.mkdirSync(path.dirname(agentDest), { recursive: true });
    fs.writeFileSync(agentDest, 'USER WORK');

    const plan = planInstallation({ sourceDir: PACKAGE_ROOT, targetDir: tmpDir });
    assert.throws(
      () => executeInstallation(plan, { force: false }),
      (err) => {
        assert.equal(err.code, 'ERR_COLLISION_DETECTED');
        return true;
      }
    );
    assert.equal(fs.readFileSync(agentDest, 'utf8'), 'USER WORK');
  });

  test('refuses to overwrite when --yes is passed without --force', () => {
    const agentDest = path.join(tmpDir, '.claude', 'agents', 'snyk-expert.md');
    fs.mkdirSync(path.dirname(agentDest), { recursive: true });
    fs.writeFileSync(agentDest, 'USER WORK');

    const plan = planInstallation({ sourceDir: PACKAGE_ROOT, targetDir: tmpDir });
    assert.throws(
      () => executeInstallation(plan, { force: false, yes: true }),
      (err) => {
        assert.equal(err.code, 'ERR_OVERWRITE_UNAUTHORIZED');
        return true;
      }
    );
  });

  test('requires confirmation when --force is passed without --yes', () => {
    const agentDest = path.join(tmpDir, '.claude', 'agents', 'snyk-expert.md');
    fs.mkdirSync(path.dirname(agentDest), { recursive: true });
    fs.writeFileSync(agentDest, 'USER WORK');

    const plan = planInstallation({ sourceDir: PACKAGE_ROOT, targetDir: tmpDir });
    assert.throws(
      () => executeInstallation(plan, { force: true, yes: false }),
      (err) => {
        assert.equal(err.code, 'ERR_CONFIRMATION_REQUIRED');
        return true;
      }
    );
  });

  test('overwrites colliding files when both --force and --yes are provided', () => {
    const agentDest = path.join(tmpDir, '.claude', 'agents', 'snyk-expert.md');
    fs.mkdirSync(path.dirname(agentDest), { recursive: true });
    fs.writeFileSync(agentDest, 'USER WORK');

    const plan = planInstallation({ sourceDir: PACKAGE_ROOT, targetDir: tmpDir });
    const result = executeInstallation(plan, { force: true, yes: true });

    assert.equal(result.committed.length, 8);
    const srcAgent = path.join(PACKAGE_ROOT, '.claude', 'agents', 'snyk-expert.md');
    assert.ok(fs.readFileSync(agentDest).equals(fs.readFileSync(srcAgent)));
  });

  test('dryRun writes zero files to disk', () => {
    const plan = planInstallation({ sourceDir: PACKAGE_ROOT, targetDir: tmpDir });
    const result = executeInstallation(plan, { dryRun: true });

    assert.equal(result.dryRun, true);
    assert.equal(result.plannedAdditions.length, 8);
    assert.ok(!fs.existsSync(path.join(tmpDir, '.claude')));
  });
});
