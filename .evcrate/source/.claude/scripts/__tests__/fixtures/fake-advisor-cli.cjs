#!/usr/bin/env node
'use strict';

const childProcess = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

function argument(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] !== undefined ? process.argv[index + 1] : fallback;
}

function output(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', () => {
  const mode = argument('--mode', 'success');
  const bytes = Number(argument('--bytes', '70000'));
  const lines = Number(argument('--lines', '3000'));
  const failures = {
    version: 'CLI_VERSION_UNSUPPORTED',
    auth: 'AUTH_UNAVAILABLE',
    model: 'MODEL_UNSUPPORTED',
    effort: 'EFFORT_UNSUPPORTED',
    'read-only': 'READ_ONLY_UNSUPPORTED',
    session: 'SESSION_UNSUPPORTED',
    recursion: 'ADVISOR_RECURSION'
  };

  if (mode === 'success') {
    output({ status: 'ok', response: 'FAKE_OK', promptBytes: Buffer.byteLength(input, 'utf8') });
    return;
  }
  if (mode === 'recursion') {
    output({
      status: 'error',
      code: failures[mode],
      marker: process['env'].EVCRATE_ADVISOR_ACTIVE || null
    });
    return;
  }
  if (failures[mode]) {
    output({ status: 'error', code: failures[mode] });
    return;
  }
  if (mode === 'invalid-output') {
    process.stdout.write('not-json');
    return;
  }
  if (mode === 'output') {
    process.stdout.write('x'.repeat(bytes));
    return;
  }
  if (mode === 'lines') {
    process.stdout.write(`${'x\n'.repeat(lines)}`);
    return;
  }
  if (mode === 'stderr') {
    const auth = process['env'].FAKE_ADVISOR_AUTH || 'opaque-secret';
    process.stderr.write(`token=super-secret auth=${auth} Bearer bearer-secret ${'d'.repeat(bytes)}`);
    return;
  }
  if (mode === 'process') {
    const auth = process['env'].FAKE_ADVISOR_AUTH || 'opaque-secret';
    process.stdout.write('{"error":"access_token=stdout-secret"}\n');
    process.stderr.write(`token=super-secret auth=${auth} fake process failure\n`);
    process.exitCode = 17;
    return;
  }
  if (mode === 'timeout' || mode === 'cancel') {
    setInterval(() => {}, 1000);
    return;
  }
  if (mode === 'tree-timeout' || mode === 'tree-cancel' || mode === 'tree-output'
    || mode === 'tree-process' || mode === 'tree-signal') {
    const descendant = childProcess.spawn(process.execPath, [
      '-e',
      "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000);"
    ], { stdio: 'ignore' });
    fs.writeFileSync(path.join(process.cwd(), 'descendant.pid'), `${descendant.pid}\n`, { mode: 0o600 });
    if (mode === 'tree-output') {
      process.stdout.write('x'.repeat(bytes));
      setInterval(() => {}, 1000);
      return;
    }
    if (mode === 'tree-process') {
      process.exit(17);
      return;
    }
    if (mode === 'tree-signal') {
      process.kill(process.pid, 'SIGTERM');
      return;
    }
    process.once('SIGTERM', () => process.exit(0));
    setInterval(() => {}, 1000);
    return;
  }
  if (mode === 'invalid-utf8') {
    fs.writeSync(1, Buffer.from([0xc3, 0x28]));
    return;
  }
  output({ status: 'error', code: 'OUTPUT_UNSUPPORTED' });
});
