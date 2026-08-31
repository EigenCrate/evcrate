import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { runBoundedProcess, sanitizeEnvironment } from '../../dist/cli/process-runner.js';

test('runs argv without shell interpolation and filters environment', async () => {
  const result = await runBoundedProcess({
    executable: process.execPath,
    args: ['-e', 'process.stdout.write(`${process.env.EVCRATE_HOME || ""}:${process.env.SECRET || ""}`)'],
    env: { EVCRATE_HOME: '/safe/home', SECRET: 'must-not-pass' },
    timeoutMs: 2000
  });
  assert.equal(result.termination, 'completed');
  assert.equal(result.exitCode, 0);
  assert.equal(result.stdout, '/safe/home:');
  assert.equal(sanitizeEnvironment({ SECRET: 'x', PATH: '/bin' }).SECRET, undefined);
});

test('returns bounded timeout and abort outcomes after child cleanup', async () => {
  const timeout = await runBoundedProcess({
    executable: process.execPath, args: ['-e', 'setTimeout(() => {}, 5000)'], timeoutMs: 30
  });
  assert.equal(timeout.termination, 'timeout');
  assert.equal(timeout.timedOut, true);

  const controller = new AbortController();
  const pending = runBoundedProcess({
    executable: process.execPath, args: ['-e', 'setTimeout(() => {}, 5000)'],
    timeoutMs: 2000, signal: controller.signal
  });
  setTimeout(() => controller.abort(), 30);
  const aborted = await pending;
  assert.equal(aborted.termination, 'aborted');
  assert.equal(aborted.aborted, true);
});

test('stops oversized output and rejects oversized input before spawn', async () => {
  const output = await runBoundedProcess({
    executable: process.execPath, args: ['-e', 'process.stdout.write("a\\nb\\nc\\n")'],
    maxLines: 2, maxStdoutBytes: 1000, timeoutMs: 2000
  });
  assert.equal(output.termination, 'output-limit');
  await assert.rejects(
    runBoundedProcess({ executable: process.execPath, input: 'x'.repeat(10), maxInputBytes: 5 }),
    /oversized/
  );
});

test('kills descendants with timed-out process group', async () => {
  const root = mkdtempSync(join(tmpdir(), 'evcrate-process-'));
  const marker = join(root, 'descendant-ran');
  const descendant = `const fs=require('node:fs'); setTimeout(() => fs.writeFileSync(${JSON.stringify(marker)}, 'leaked'), 250);`;
  const parent = `const {spawn}=require('node:child_process'); spawn(process.execPath, ['-e', ${JSON.stringify(descendant)}], {stdio:'ignore'}); setTimeout(() => {}, 5000);`;
  const result = await runBoundedProcess({
    executable: process.execPath, args: ['-e', parent], timeoutMs: 100
  });
  assert.equal(result.termination, 'timeout');
  await new Promise((resolve) => setTimeout(resolve, 350));
  assert.equal(existsSync(marker), false);
});
