#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

function has(value) { return process.argv.includes(value); }
function argument(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] !== undefined
    ? process.argv[index + 1]
    : fallback;
}
function mode() {
  return argument('--mode', 'success');
}
function write(value) { process.stdout.write(`${value}\n`); }
function fixture(name) {
  return fs.readFileSync(path.join(__dirname, name), 'utf8');
}
function successOutput() {
  return fixture('result-success.jsonl')
    .replaceAll('"provider":"openai-codex"', `"provider":${JSON.stringify(provider)}`)
    .replaceAll('"model":"gpt-5.6-sol"', `"model":${JSON.stringify(model)}`);
}
function helpText() {
  const current = mode();
  const markers = [
    '-p, --print', '--mode <mode>: text, json, or rpc',
    '--provider <name>', '--model <pattern>',
    '--thinking <level>: off, minimal, low, medium, high, xhigh, max',
    '--no-session', '--no-extensions', '--no-tools'
  ];
  if (current === 'effort') markers[4] = '--thinking <level>: off, minimal, low, medium, xhigh, max';
  if (current === 'session') markers[5] = '--session <path>';
  if (current === 'output') markers[1] = '--mode <mode>: text or rpc';
  if (current === 'read-only') markers[7] = '--tools <list>';
  return `${markers.join('\n')}\n`;
}

const current = mode();
const provider = argument('--provider', 'openai-codex');
const model = argument('--model', 'gpt-5.6-sol');
if ((current === 'timeout' || current === 'cancel') && has('--no-tools')) {
  setInterval(() => {}, 1000);
} else if (has('--version')) {
  write(current === 'version' ? '0.99.0' : '0.84.1');
} else if (has('auth')) {
  if (current === 'auth') write(JSON.stringify({ status: 'not_ready', provider, reason: 'credentials_not_configured' }));
  else if (current === 'auth-missing-model') write(JSON.stringify({ status: 'ready', provider, authType: 'fixture' }));
  else if (current === 'model') write(JSON.stringify({ status: 'not_ready', provider, reason: 'model_not_found' }));
  else write(JSON.stringify({ status: 'ready', provider, model, authType: 'fixture' }));
} else if (has('--help')) {
  write(helpText());
} else if (has('--mode') && process.argv.includes('json')) {
  if (current === 'process') {
    process.stderr.write('provider unavailable\n');
    process.exitCode = 17;
  } else if (current === 'malformed') {
    process.stdout.write('not-json\n');
  } else if (current === 'dangerous') {
    process.stdout.write(fixture('result-dangerous.jsonl'));
  } else if (current === 'stopped') {
    process.stdout.write(fixture('result-stopped.jsonl'));
  } else {
    process.stdout.write(successOutput());
  }
} else {
  write(JSON.stringify({ status: 'error', code: 'OUTPUT_UNSUPPORTED' }));
}
