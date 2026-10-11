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
    const plan = planInstallation({ sourceDir: PACKAGE_ROOT, target: 'agents', directory: tmpDir });
    const result = executeInstallation(plan);

    assert.equal(result.unchanged.length, 0);

    for (const rel of ASSET_INVENTORY) {
      const srcPath = path.join(PACKAGE_ROOT, '.agents', rel);
      const destPath = path.join(tmpDir, '.agents', rel);
      assert.ok(fs.existsSync(destPath), `File does not exist: ${destPath}`);
      assert.ok(fs.readFileSync(srcPath).equals(fs.readFileSync(destPath)));
    }
  });

  test('preserves unrelated pre-existing files in .agents directory', () => {
    const unrelated = path.join(tmpDir, '.agents', 'custom-agent.md');
    fs.mkdirSync(path.dirname(unrelated), { recursive: true });
    fs.writeFileSync(unrelated, '# My Custom Agent');

    const plan = planInstallation({ sourceDir: PACKAGE_ROOT, target: 'agents', directory: tmpDir });
    executeInstallation(plan);

    assert.ok(fs.existsSync(unrelated));
    assert.equal(fs.readFileSync(unrelated, 'utf8'), '# My Custom Agent');
  });

  test('leaves unrelated project directories untouched', () => {
    const otherFile = path.join(tmpDir, '.custom-config', 'agents', 'agent.md');
    fs.mkdirSync(path.dirname(otherFile), { recursive: true });
    fs.writeFileSync(otherFile, 'EXISTING CONFIGURATION');

    executeInstallation(planInstallation({ sourceDir: PACKAGE_ROOT, target: 'agents', directory: tmpDir }));

    assert.equal(fs.readFileSync(otherFile, 'utf8'), 'EXISTING CONFIGURATION');
    assert.deepEqual(fs.readdirSync(path.dirname(otherFile)), ['agent.md']);
  });

  test('refuses to overwrite collision without --force', () => {
    const agentDest = path.join(tmpDir, '.agents', 'agents', 'snyk-expert.md');
    fs.mkdirSync(path.dirname(agentDest), { recursive: true });
    fs.writeFileSync(agentDest, 'USER WORK');

    const plan = planInstallation({ sourceDir: PACKAGE_ROOT, target: 'agents', directory: tmpDir });
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
    const agentDest = path.join(tmpDir, '.agents', 'agents', 'snyk-expert.md');
    fs.mkdirSync(path.dirname(agentDest), { recursive: true });
    fs.writeFileSync(agentDest, 'USER WORK');

    const plan = planInstallation({ sourceDir: PACKAGE_ROOT, target: 'agents', directory: tmpDir });
    assert.throws(
      () => executeInstallation(plan, { force: false, yes: true }),
      (err) => {
        assert.equal(err.code, 'ERR_OVERWRITE_UNAUTHORIZED');
        return true;
      }
    );
  });

  test('requires confirmation when --force is passed without --yes', () => {
    const agentDest = path.join(tmpDir, '.agents', 'agents', 'snyk-expert.md');
    fs.mkdirSync(path.dirname(agentDest), { recursive: true });
    fs.writeFileSync(agentDest, 'USER WORK');

    const plan = planInstallation({ sourceDir: PACKAGE_ROOT, target: 'agents', directory: tmpDir });
    assert.throws(
      () => executeInstallation(plan, { force: true, yes: false }),
      (err) => {
        assert.equal(err.code, 'ERR_CONFIRMATION_REQUIRED');
        return true;
      }
    );
  });

  test('overwrites colliding files when both --force and --yes are provided', () => {
    const agentDest = path.join(tmpDir, '.agents', 'agents', 'snyk-expert.md');
    fs.mkdirSync(path.dirname(agentDest), { recursive: true });
    fs.writeFileSync(agentDest, 'USER WORK');

    const plan = planInstallation({ sourceDir: PACKAGE_ROOT, target: 'agents', directory: tmpDir });
    const result = executeInstallation(plan, { force: true, yes: true });

    const srcAgent = path.join(PACKAGE_ROOT, '.agents', 'agents', 'snyk-expert.md');
    assert.ok(fs.readFileSync(agentDest).equals(fs.readFileSync(srcAgent)));
  });

  test('dryRun writes zero files to disk', () => {
    const plan = planInstallation({ sourceDir: PACKAGE_ROOT, target: 'agents', directory: tmpDir });
    const result = executeInstallation(plan, { dryRun: true });

    assert.equal(result.dryRun, true);
    assert.ok(!fs.existsSync(path.join(tmpDir, '.agents')));
  });

  test('exclusive installation locking prevents concurrent installer execution', () => {
    const lockPath = path.join(tmpDir, '.agents', '.install.lock');
    fs.mkdirSync(path.dirname(lockPath), { recursive: true });
    fs.writeFileSync(lockPath, 'active');
    const plan = planInstallation({ sourceDir: PACKAGE_ROOT, target: 'agents', directory: tmpDir });
    assert.throws(
      () => executeInstallation(plan),
      /Installation locked by another process/
    );
  });

  test('refuses a changed replacement after planning before writing any additions', () => {
    executeInstallation(planInstallation({ sourceDir: PACKAGE_ROOT, target: 'agents', directory: tmpDir }));
    const plan = planInstallation({ sourceDir: PACKAGE_ROOT, target: 'agents', directory: tmpDir });
    fs.writeFileSync(path.join(tmpDir, '.agents', 'agents', 'snyk-expert.md'), 'changed after planning');
    assert.throws(
      () => executeInstallation(plan, { force: true, yes: true }),
      /Destination changed after planning/
    );
  });

  test('prevents overwriting a destination created concurrently immediately before publication', () => {
    const plan = planInstallation({ sourceDir: PACKAGE_ROOT, target: 'agents', directory: tmpDir });
    assert.throws(
      () => executeInstallation(plan, {
        _beforePublish: action => {
          if (action.status === 'add') {
            fs.mkdirSync(path.dirname(action.destinationPath), { recursive: true });
            fs.writeFileSync(action.destinationPath, 'concurrent');
          }
        }
      }),
      /already exists/
    );
  });

  test('rolls back to previous usable installation if a fault occurs during replacement', () => {
    executeInstallation(planInstallation({ sourceDir: PACKAGE_ROOT, target: 'agents', directory: tmpDir }));
    const targetFile = path.join(tmpDir, '.agents', 'agents', 'snyk-expert.md');
    fs.writeFileSync(targetFile, 'v1-custom');
    const plan = planInstallation({ sourceDir: PACKAGE_ROOT, target: 'agents', directory: tmpDir });
    let replacedCount = 0;
    assert.throws(
      () => executeInstallation(plan, {
        force: true,
        yes: true,
        _beforePublish: action => {
          if (action.status === 'replace') {
            replacedCount += 1;
            if (replacedCount === 1) throw new Error('simulated disk failure');
          }
        }
      }),
      /simulated disk failure/
    );
    assert.equal(fs.readFileSync(targetFile, 'utf8'), 'v1-custom');
  });
});
