import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  createProjectionBuildContext,
  createStagedRoot,
  getProjectionAdapter,
  loadTargetManifestRegistry,
  PROJECTION_QUALIFICATION_ORDER,
} from '../../dist/index.js';
import { parityDeltaRecords } from './parity-deltas.mjs';
import { existsSync, lstatSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { after, test } from 'node:test';

const repository = process.cwd();
const sourceRoot = join(repository, '.evcrate/source');
const canonicalRoot = join(sourceRoot, '.claude');
const registry = loadTargetManifestRegistry(join(repository, '.evcrate/targets/manifest.json'));
const cleanups = [];
const pythonStages = [];
const pythonScripts = {
  gemini: 'migrate_claude_to_gemini.py',
  codex: 'migrate_claude_to_codex.py',
  pi: 'migrate_claude_to_pi.py',
  omp: 'migrate_claude_to_omp.py',
  copilot: 'migrate_claude_to_copilot.py',
};
const approvedPiExtras = new Set([
  '.pi/agent/extensions',
  '.pi/agent/extensions/evcrate',
  '.pi/agent/extensions/evcrate/ATTRIBUTION.md',
  '.pi/agent/extensions/evcrate/child-context.js',
  '.pi/agent/extensions/evcrate/command-files.js',
  '.pi/agent/extensions/evcrate/command-tool.js',
  '.pi/agent/extensions/evcrate/commands.js',
  '.pi/agent/extensions/evcrate/delegation-tool.js',
  '.pi/agent/extensions/evcrate/hook-adapter.cjs',
  '.pi/agent/extensions/evcrate/hooks.js',
  '.pi/agent/extensions/evcrate/index.js',
  '.pi/agent/extensions/evcrate/model-roles.js',
  '.pi/agent/extensions/evcrate/paths.js',
  '.pi/agent/extensions/evcrate/operation-policy.js',
]);
const parityAnchors = {
  gemini: ['.gemini/hooks/.env.example', '.gemini/commands/coding-level.toml'],
  antigravity: ['.antigravity/.evcrate.json', '.antigravity/scripts/commands_data.yaml'],
  codex: ['.codex/.evcrate.json', '.codex/config.toml'],
  pi: ['.pi/.evcrate.json', '.pi/agent/evcrate/commands/ask.md'],
  omp: ['.omp/evcrate/command-name-map.json', '.omp/evcrate/skills/common/README.md'],
  copilot: ['.copilot/evcrate/workflows/advisor-mentoring.md', '.copilot/evcrate/skills/common/README.md'],
};

function snapshot(root) {
  const files = new Map();
  const visit = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = join(current, entry.name);
      const path = relative(root, full).split('\\').join('/');
      const stat = lstatSync(full);
      assert.equal(stat.isSymbolicLink(), false, `symlink in parity output: ${full}`);
      if (entry.isDirectory()) {
        assert.equal(stat.isDirectory(), true, `directory identity changed in parity output: ${full}`);
        files.set(path, { kind: 'directory', mode: stat.mode & 0o777 });
        visit(full);
        continue;
      }
      assert.equal(stat.isFile(), true, `non-file in parity output: ${full}`);
      const bytes = readFileSync(full);
      files.set(path, {
        kind: 'file',
        bytes: bytes.byteLength,
        hash: createHash('sha256').update(bytes).digest('hex'),
        mode: stat.mode & 0o777,
      });
    }
  };
  visit(root);
  return files;
}

function runPython(target, stage) {
  const output = join(stage, target === 'antigravity' ? '.antigravity' : `.${target}`);
  if (target !== 'antigravity') mkdirSync(output);
  const env = {
    ...process.env,
    EVCRATE_REPOSITORY: repository,
    EVCRATE_SOURCE_DIR: sourceRoot,
    CLAUDE_SOURCE_DIR: canonicalRoot,
    GEMINI_OUTPUT_DIR: join(stage, '.gemini'),
    GEMINI_PROJECT_DOCS_OUTPUT_DIR: stage,
    CODEX_OUTPUT_DIR: join(stage, '.codex'),
    AGENTS_OUTPUT_DIR: join(stage, '.agents'),
    PI_OUTPUT_DIR: join(stage, '.pi'),
    PI_STAGE_ROOT: stage,
    OMP_OUTPUT_DIR: join(stage, '.omp'),
    OMP_STAGE_ROOT: stage,
    COPILOT_OUTPUT_DIR: join(stage, '.copilot'),
    COPILOT_STAGE_ROOT: stage,
    PROJECT_DOCS_OUTPUT_DIR: stage,
  };
  const args = target === 'antigravity'
    ? ['-c', 'import sys; from pathlib import Path; from distribution.antigravity_publish import build_antigravity_config; build_antigravity_config(Path(sys.argv[1]), Path(sys.argv[2]))', canonicalRoot, output]
    : [pythonScripts[target]];
  const result = spawnSync('python3', args, { cwd: repository, env, encoding: 'utf8' });
  assert.equal(result.status, 0, `${target} Python authority failed: ${result.stderr}`);
  return stage;
}

function runTypeScript(target) {
  const stage = createStagedRoot(repository, `.phase5-parity-${target}-`);
  cleanups.push(stage.cleanup);
  const context = createProjectionBuildContext(registry.targets.get(target), canonicalRoot, stage);
  const adapter = getProjectionAdapter(target);
  adapter.build(context);
  const validation = adapter.validate(context);
  assert.equal(validation.valid, true, `${target} TypeScript validation failed: ${JSON.stringify(validation.diagnostics)}`);
  return stage.path;
}


function compare(target, expected, actual) {
  const missing = [...expected.keys()].filter((path) => !actual.has(path));
  const extra = [...actual.keys()].filter((path) => !expected.has(path));
  assert.deepEqual(missing, [], `${target} missing parity entries`);
  const expectedExtras = target === 'pi' ? [...approvedPiExtras].sort() : [];
  assert.deepEqual(extra.sort(), expectedExtras, `${target} unexpected parity entries`);
  const deltas = parityDeltaRecords[target] ?? {};
  for (const [path, delta] of Object.entries(deltas)) {
    assert.ok(expected.has(path), `${target} parity delta has no Python entry: ${path}`);
    assert.ok(delta.kind === 'file' || delta.kind === 'directory', `${target} parity delta kind missing: ${path}`);
    const expectedKeys = delta.kind === 'file'
      ? ['bytes', 'hash', 'kind', 'mode', 'reason']
      : ['kind', 'mode', 'reason'];
    assert.deepEqual(Object.keys(delta).sort(), expectedKeys, `${target} parity delta shape changed: ${path}`);
    if (delta.kind === 'file') {
      assert.equal(typeof delta.bytes, 'number', `${target} parity delta byte length missing: ${path}`);
      assert.equal(typeof delta.hash, 'string', `${target} parity delta hash missing: ${path}`);
    }
    assert.equal(Number.isInteger(delta.mode), true, `${target} parity delta mode missing: ${path}`);
    assert.equal(typeof delta.reason, 'string', `${target} parity delta reason missing: ${path}`);
    assert.notEqual(delta.reason, '', `${target} parity delta reason empty: ${path}`);
  }
  for (const path of expected.keys()) {
    const wanted = expected.get(path);
    const received = actual.get(path);
    const delta = deltas[path];
    assert.ok(received, `${target} parity entry missing: ${path}`);
    if (delta) {
      assert.equal(received.kind, delta.kind, `${target} recorded kind delta changed: ${path}`);
      assert.equal(received.mode, delta.mode, `${target} recorded mode delta changed: ${path}`);
      if (delta.kind === 'file') {
        assert.equal(received.bytes, delta.bytes, `${target} recorded byte length delta changed: ${path}`);
        assert.equal(received.hash, delta.hash, `${target} recorded hash delta changed: ${path}`);
      }
    } else {
      assert.deepEqual(received, wanted, `${target} unrecorded parity delta at ${path}`);
    }
  }
  for (const path of parityAnchors[target] ?? []) {
    const received = actual.get(path);
    const wanted = expected.get(path);
    assert.ok(received && wanted, `${target} parity anchor missing: ${path}`);
    assert.equal(received.kind, wanted.kind, `${target} parity anchor kind differs: ${path}`);
    if (wanted.kind === 'file') {
      assert.equal(received.bytes, wanted.bytes, `${target} parity anchor byte length differs: ${path}`);
      assert.equal(received.hash, wanted.hash, `${target} parity anchor hash differs: ${path}`);
    }
    const delta = deltas[path];
    assert.equal(received.mode, delta?.mode ?? wanted.mode, `${target} parity anchor mode differs: ${path}`);
  }
}

after(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  for (const stage of pythonStages.splice(0)) rmSync(stage, { recursive: true, force: true });
});

test('TypeScript projections match Python inventories with explicit deltas', () => {
  for (const target of PROJECTION_QUALIFICATION_ORDER) {
    const actualRoot = runTypeScript(target);
    if (target === 'claude') {
      const expected = new Map([...snapshot(canonicalRoot)].map(([path, value]) => [`.claude/${path}`, value]));
      expected.set('.claude', { kind: 'directory', mode: 0o755 });
      compare(target, expected, snapshot(actualRoot));
      continue;
    }
    if (pythonScripts[target] && existsSync(join(repository, pythonScripts[target]))) {
      const pythonStage = mkdtempSync(join(tmpdir(), `evcrate-phase5-python-${target}-`));
      pythonStages.push(pythonStage);
      const expectedRoot = runPython(target, pythonStage);
      compare(target, snapshot(expectedRoot), snapshot(actualRoot));
    } else {
      const targetManifest = registry.targets.get(target);
      const expected = new Map();
      for (const root of targetManifest.outputRoots) {
        const full = join(sourceRoot, root);
        if (existsSync(full)) {
          expected.set(root, { kind: 'directory', mode: lstatSync(full).mode & 0o777 });
          for (const [p, v] of snapshot(full)) expected.set(`${root}/${p}`, v);
        }
      }
      for (const doc of targetManifest.projectDocs) {
        const full = join(sourceRoot, doc);
        if (existsSync(full)) {
          const bytes = readFileSync(full);
          expected.set(doc, {
            kind: 'file',
            bytes: bytes.byteLength,
            hash: createHash('sha256').update(bytes).digest('hex'),
            mode: lstatSync(full).mode & 0o777
          });
        }
      }
      const actual = snapshot(actualRoot);
      for (const [path, wanted] of expected) {
        const received = actual.get(path);
        assert.ok(received, `${target} missing committed output: ${path}`);
        assert.equal(received.kind, wanted.kind, `${target} kind differs for ${path}`);
        if (wanted.kind === 'file') {
          assert.equal(received.hash, wanted.hash, `${target} hash differs for ${path}`);
          assert.equal(received.bytes, wanted.bytes, `${target} byte count differs for ${path}`);
        }
      }
    }
  }
});
