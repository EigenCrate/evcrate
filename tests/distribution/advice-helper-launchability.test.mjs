import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { stageAdvisorController } from '../../dist/index.js';
import { collectPackInventory } from '../../scripts/release/pack-inventory.cjs';

const repository = process.cwd();
const helperRelative = '.evcrate/source/.evcrate/bin/evcrate-advice-mode';

test('controller staging restores helper launchability when checkout permissions lack execute bits', {
  skip: process.platform === 'win32',
}, (t) => {
  const root = mkdtempSync(join(tmpdir(), 'evcrate-helper-launch-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const source = join(root, 'source');
  const stage = join(root, 'stage');
  const project = join(root, 'workspace');
  const home = join(root, 'home');
  mkdirSync(project);
  mkdirSync(home);
  cpSync(join(repository, '.evcrate/source/.evcrate/bin'), source, { recursive: true });
  chmodSync(join(source, 'evcrate-advice-mode'), 0o644);
  stageAdvisorController(source, stage);
  const helper = join(stage, 'evcrate-advice-mode');
  assert.equal(statSync(helper).mode & 0o111, 0o111);
  const result = spawnSync(process.execPath, [helper], {
    cwd: project, env: { ...process.env, HOME: home }, encoding: 'utf8',
    input: JSON.stringify({
      protocol: 'evcrate-advice-mode', version: 1, raw_arguments: 'unicode 雪\t"--advice"',
      context: { project_root: project, command: 'code', work_target: 'code',
        plan_path: null, phase_path: null, phase_id: null }, handoff: null,
    }),
  });
  assert.equal(result.status, 0, result.stderr);
  const envelope = JSON.parse(result.stdout);
  assert.equal(envelope.status, 'MODE_READY');
  assert.equal(envelope.mode, 'off');
  assert.equal(envelope.work_arguments, 'unicode 雪\t"--advice"');
});

test('release inventory declares helper execution intent independent of checkout permissions', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'evcrate-helper-pack-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const helper = join(root, helperRelative);
  mkdirSync(join(root, '.evcrate/source/.evcrate/bin'), { recursive: true });
  writeFileSync(join(root, 'package.json'), JSON.stringify({
    name: 'advice-helper-release-fixture', version: '1.0.0', files: ['.evcrate/**'],
  }));
  writeFileSync(helper, readFileSync(join(repository, helperRelative)), { mode: 0o644 });
  chmodSync(helper, 0o644);
  const inventory = collectPackInventory(root);
  const entry = inventory.find(({ path }) => path === helperRelative);
  assert.equal(entry?.mode, 0o755);
});
