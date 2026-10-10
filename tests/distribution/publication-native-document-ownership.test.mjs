import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { PERSISTED_TARGETS, createPublicationPlanSet, publishApply, resolveInvocationContext, runAllManifestsBuild } from '../../dist/index.js';
import { prepareFixtureWorkspace } from './parity-verification-helpers.mjs';

let packageRoot;
let fixtureRoot;
test.before(async () => {
  fixtureRoot = mkdtempSync(join(tmpdir(), 'evcrate-native-leaf-package-'));
  packageRoot = join(fixtureRoot, 'package');
  prepareFixtureWorkspace(packageRoot);
  const authority = join(packageRoot, '.evcrate/source/.claude/AGENTS.md');
  const original = readFileSync(authority);
  await runAllManifestsBuild(packageRoot, { jobs: 2 });
  assert.deepEqual(readFileSync(authority), original, 'projection must preserve canonical authoring bytes');
});
test.after(() => rmSync(fixtureRoot, { recursive: true, force: true }));

function installation(t, targets = PERSISTED_TARGETS) {
  const root = mkdtempSync(join(tmpdir(), 'evcrate-native-leaf-install-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const home = join(root, 'home');
  const project = join(root, 'project');
  for (const directory of [home, project]) mkdirSync(directory, { mode: 0o700 });
  const context = resolveInvocationContext({ packageRoot, cwd: packageRoot, home, projectRoot: project, targets });
  return { home, project, context };
}

function userFile(root, name, bytes) {
  const filename = join(root, name);
  mkdirSync(dirname(filename), { recursive: true, mode: 0o700 });
  writeFileSync(filename, bytes);
  return filename;
}

test('mixed publication owns native leaves without replacing shared parents', (t) => {
  const { home, project, context } = installation(t);
  const foreign = [
    [userFile(project, '.github/workflows/user.yml', 'name: user\n'), 'name: user\n'],
    [userFile(project, '.agents/rules/user.md', 'User rule\n'), 'User rule\n'],
    [userFile(home, '.gemini/vendor-user.txt', 'Vendor parent\n'), 'Vendor parent\n'],
  ];
  publishApply(context, {}, { scope: 'project', selectedTargets: context.selectedTargetIds });
  publishApply(context);
  for (const [filename, bytes] of foreign) assert.equal(readFileSync(filename, 'utf8'), bytes);
  for (const leaf of ['.github/copilot-instructions.md', '.agents/hooks.json', '.agents/rules/evcrate-antigravity.md', '.claude/rules/AGENTS.md', 'AGENTS.md']) {
    assert.ok(existsSync(join(project, leaf)), leaf);
  }
  assert.equal(existsSync(join(project, '.claude/AGENTS.md')), false);
  assert.ok(existsSync(join(home, '.codex/AGENTS.md')));
  assert.ok(existsSync(join(home, '.gemini/config/AGENTS.md')));
  assert.equal(existsSync(join(home, '.gemini/GEMINI.md')), false);
  const rule = readFileSync(join(project, '.agents/rules/evcrate-antigravity.md'), 'utf8');
  assert.match(rule, /trigger: always_on/);
  assert.ok(rule.includes('../../.antigravity/AGENTS.md'));
});

test('unmanaged native instruction and hook collisions refuse without changing user bytes', (t) => {
  for (const [target, leaf] of [['copilot', '.github/copilot-instructions.md'], ['antigravity', '.agents/hooks.json']]) {
    const { project, context } = installation(t, [target]);
    const filename = userFile(project, leaf, 'USER-OWNED NATIVE LEAF\n');
    const plan = createPublicationPlanSet(context, { scope: 'project' });
    const binding = plan.harness.bindings.find(({ binding }) => binding === leaf);
    assert.ok(binding, `${target} must publish the native leaf`);
    const collision = binding.operations.find(({ destination }) => destination === filename);
    assert.ok(collision, `${target} must plan the actual user-owned destination`);
    assert.equal(collision.action, 'conflict', `${target} must reject an unmanaged native leaf`);
    assert.equal(readFileSync(filename, 'utf8'), 'USER-OWNED NATIVE LEAF\n');
    assert.throws(
      () => publishApply(context, {}, { scope: 'project', selectedTargets: [target] }),
      (error) => error?.code === 'PUBLICATION_FAILED',
      `${target} apply must refuse the planned collision`
    );
    assert.equal(readFileSync(filename, 'utf8'), 'USER-OWNED NATIVE LEAF\n');
  }
});
