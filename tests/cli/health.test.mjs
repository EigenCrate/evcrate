import test from 'node:test';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { createDiagnosticRequest } from '../../dist/protocol/diagnostic.js';
import { runHealth } from '../../dist/cli/health.js';

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'evcrate-health-'));
  const controllerRoot = join(root, 'controller');
  mkdirSync(controllerRoot);
  const script = join(controllerRoot, 'evcrate-advisor');
  const log = join(root, 'request.json');
  return {
    root, controllerRoot, script, log,
    context: {
      packageRoot: root, canonicalHarnessRoot: root, canonicalSourceRoot: root,
      controllerRoot, registryPath: join(root, 'manifest.json'), selectedTargets: [],
      selectedTargetIds: [], targetManifestPaths: [], generatedRoots: [], homeBindings: [],
      homeRoot: root, stateRoot: root, projectRoot: root, projectId: null
    }
  };
}

function qualifiedScript(log, extra = '') {
  return `const fs=require('node:fs'); const input=fs.readFileSync(0,'utf8'); fs.writeFileSync(${JSON.stringify(log)}, input); const request=JSON.parse(input); const result={protocol:'evcrate-advisor-diagnostic',protocolVersion:1,requestId:request.requestId,status:'QUALIFIED',target:{backend:'codex',model:'model',effort:'high'},probes:{version:{status:'passed',value:'1.0.0'},auth:{status:'passed'},capabilities:{status:'passed',model:'model',effort:'high',noninteractive:true,session:'isolated',tools:'none',output:'json'}}}; process.stdout.write(JSON.stringify(result)+'\\n');${extra}`;
}

test('health invokes only the qualification diagnostic boundary', async () => {
  const value = fixture();
  writeFileSync(value.script, qualifiedScript(value.log), { mode: 0o700 });
  const result = await runHealth(value.context, {
    execPath: process.execPath, requestId: () => 'health-1', now: () => 1
  });
  assert.equal(result.status, 'QUALIFIED');
  const request = JSON.parse(readFileSync(value.log, 'utf8'));
  assert.deepEqual(request, {
    protocol: 'evcrate-advisor-diagnostic', protocolVersion: 1,
    requestId: 'health-1', operation: 'qualify'
  });
  assert.equal(Object.hasOwn(request, 'question'), false);
});

test('health accepts a correlated diagnostic failure without synthesizing counsel', async () => {
  const value = fixture();
  const result = {
    protocol: 'evcrate-advisor-diagnostic', protocolVersion: 1, requestId: 'health-2',
    status: 'FAILED', target: null,
    probes: { version: { status: 'not-run' }, auth: { status: 'not-run' }, capabilities: { status: 'not-run' } },
    error: {
      code: 'ROUTE_POLICY_REQUIRED', category: 'config',
      action: 'Create ~/.evcrate/advisor-routing.json with one version 1 advisor target.',
      message: 'Global advisor policy is required'
    }
  };
  writeFileSync(value.script, `const fs=require('node:fs'); fs.readFileSync(0,'utf8'); process.stdout.write(${JSON.stringify(JSON.stringify(result))}+'\\n'); process.exitCode=1;`, { mode: 0o700 });
  const failure = await runHealth(value.context, { execPath: process.execPath, requestId: () => 'health-2' }, createDiagnosticRequest('health-2'));
  assert.equal(failure.status, 'FAILED');
  assert.equal(failure.error.code, 'ROUTE_POLICY_REQUIRED');
});

test('health rejects counsel-shaped, malformed, extra-line, or stderr output', async () => {
  const value = fixture();
  for (const output of [
    JSON.stringify({ protocol: 'evcrate-advisor-result', protocolVersion: 1, requestId: 'x' }),
    '{not-json}',
    `${JSON.stringify({ protocol: 'evcrate-advisor-diagnostic', protocolVersion: 1, requestId: 'x', status: 'QUALIFIED' })}\nextra`
  ]) {
    writeFileSync(value.script, `process.stdout.write(${JSON.stringify(output+'\\n')});`, { mode: 0o700 });
    await assert.rejects(
      runHealth(value.context, { execPath: process.execPath, requestId: () => 'health-3' }),
      (error) => error.code === 'DIAGNOSTIC_INVALID'
    );
  }
  writeFileSync(value.script, `process.stdout.write(${JSON.stringify(JSON.stringify({ protocol: 'evcrate-advisor-diagnostic' }))}+'\\n'); process.stderr.write('raw secret');`, { mode: 0o700 });
  await assert.rejects(
    runHealth(value.context, { execPath: process.execPath, requestId: () => 'health-4' }),
    (error) => error.code === 'DIAGNOSTIC_INVALID'
  );
});

test('health rejects inconsistent exit status and malformed UTF-8', async () => {
  const value = fixture();
  writeFileSync(value.script, qualifiedScript(value.log, 'process.exitCode=1;'), { mode: 0o700 });
  await assert.rejects(
    runHealth(value.context, { execPath: process.execPath, requestId: () => 'health-5' }),
    (error) => error.code === 'DIAGNOSTIC_INVALID'
  );

  writeFileSync(value.script, 'process.stdout.write(Buffer.from([0x7b, 0xff, 0x7d, 0x0a]));', { mode: 0o700 });
  await assert.rejects(
    runHealth(value.context, { execPath: process.execPath, requestId: () => 'health-6' }),
    (error) => error.code === 'DIAGNOSTIC_INVALID'
  );
});

test('health executes controller in packageRoot cwd even when projectRoot differs', async () => {
  const value = fixture();
  const cwdLog = join(value.root, 'cwd.log');
  value.context.projectRoot = join(value.root, 'different-project-root');
  mkdirSync(value.context.projectRoot, { recursive: true });
  writeFileSync(value.script, qualifiedScript(value.log, `fs.writeFileSync(${JSON.stringify(cwdLog)}, process.cwd());`), { mode: 0o700 });
  const result = await runHealth(value.context, {
    execPath: process.execPath, requestId: () => 'health-cwd'
  });
  assert.equal(result.status, 'QUALIFIED');
  assert.equal(readFileSync(cwdLog, 'utf8'), value.context.packageRoot);
  assert.notEqual(readFileSync(cwdLog, 'utf8'), value.context.projectRoot);
});

test('health succeeds with non-executable controller script via explicit Node launch', async () => {
  const value = fixture();
  writeFileSync(value.script, qualifiedScript(value.log), { mode: 0o644 });
  const result = await runHealth(value.context, {
    execPath: process.execPath, requestId: () => 'health-nonexec'
  });
  assert.equal(result.status, 'QUALIFIED');
});

test('health fails closed when Node runtime executable is unlaunchable or missing', async () => {
  const value = fixture();
  writeFileSync(value.script, qualifiedScript(value.log), { mode: 0o700 });
  await assert.rejects(
    runHealth(value.context, {
      execPath: join(value.root, 'missing-node-binary'),
      requestId: () => 'health-bad-runtime'
    }),
    (error) => error.code === 'DIAGNOSTIC_INVALID'
  );
});

test('health succeeds with Unicode and space-containing package and controller paths', async () => {
  const root = mkdtempSync(join(tmpdir(), 'evcrate-health-sp ace-🚀-'));
  const controllerRoot = join(root, 'ctrl-dir-📦');
  mkdirSync(controllerRoot, { recursive: true });
  const script = join(controllerRoot, 'evcrate-advisor');
  const log = join(root, 'request.json');
  const context = {
    packageRoot: root, canonicalHarnessRoot: root, canonicalSourceRoot: root,
    controllerRoot, registryPath: join(root, 'manifest.json'), selectedTargets: [],
    selectedTargetIds: [], targetManifestPaths: [], generatedRoots: [], homeBindings: [],
    homeRoot: root, stateRoot: root, projectRoot: root, projectId: null
  };
  writeFileSync(script, qualifiedScript(log), { mode: 0o644 });
  const result = await runHealth(context, {
    execPath: process.execPath, requestId: () => 'health-unicode'
  });
  assert.equal(result.status, 'QUALIFIED');
});
