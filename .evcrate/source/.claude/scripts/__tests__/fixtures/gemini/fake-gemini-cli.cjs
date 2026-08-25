#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = __dirname;
const configFile = path.join(process.cwd(), 'gemini-fixture.json');
const rawArgs = process.argv.slice(2);
const modeIndex = rawArgs.indexOf('--mode');
const modeArg = modeIndex >= 0 ? rawArgs[modeIndex + 1] : null;
const args = modeIndex >= 0
  ? rawArgs.slice(0, modeIndex).concat(rawArgs.slice(modeIndex + 2)) : rawArgs;

function readConfig() {
  try { return JSON.parse(fs.readFileSync(configFile, 'utf8')); }
  catch { return { mode: 'success' }; }
}

function readFixture(name) {
  return fs.readFileSync(path.join(root, name), 'utf8');
}

function output(value) {
  process.stdout.write(value.endsWith('\n') ? value : `${value}\n`);
}

const config = readConfig();
const mode = modeArg || config.mode || 'success';
const version = mode === 'legacy' ? '0.47.0' : mode === 'version' ? '0.99.0' : '0.48.0';

function has(flag) {
  return args.includes(flag);
}

function mutateHelp(help) {
  const removals = {
    model: /--model[^\n]*\n/gu,
    'read-only': /--approval-mode[^\n]*\n/gu,
    session: /(?:--resume[^\n]*\n|--list-sessions[^\n]*\n)/gu,
    output: /--output-format[^\n]*\n/gu
  };
  return removals[mode] ? help.replace(removals[mode], '') : help;
}

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', () => {
  if (has('--version')) {
    output(version);
    return;
  }
  if (has('--list-sessions')) {
    if (mode === 'auth') {
      process.stderr.write('authentication required; no session data available\n');
      process.exitCode = 1;
      return;
    }
    output('[]');
    return;
  }
  if (has('--help')) {
    output(mutateHelp(readFixture(version === '0.47.0' ? 'help-0.47.0.txt' : 'help-0.48.0.txt')));
    return;
  }
  if (!has('--output-format')) {
    process.stderr.write('unexpected fixture command\n');
    process.exitCode = 64;
    return;
  }
  if (mode === 'timeout' || mode === 'cancel') {
    setInterval(() => {}, 1000);
    return;
  }
  if (fs.existsSync(configFile)) {
    fs.writeFileSync(path.join(process.cwd(), 'gemini-argv.json'), JSON.stringify(args), { mode: 0o600 });
    fs.writeFileSync(path.join(process.cwd(), 'gemini-stdin.txt'), input, { mode: 0o600 });
  }
  if (mode === 'nonzero' || mode === 'auth-nonzero') {
    process.stderr.write('token=fixture-secret path=/private/fake authentication required; authorization=Bearer fixture-token\n');
    process.exitCode = 17;
    return;
  }
  if (mode === 'model-nonzero') {
    process.stderr.write('invalid model selection: model flash is not recognized\n');
    process.exitCode = 1;
    return;
  }
  if (mode === 'effort-nonzero') {
    process.stderr.write('invalid effort: effort xhigh is not supported\n');
    process.exitCode = 1;
    return;
  }
  if (mode === 'cancel-nonzero') {
    process.stderr.write('AgentExecutionStopped: request cancelled\n');
    process.exitCode = 17;
    return;
  }
  if (mode === 'protocol' || mode === 'malformed') {
    output('not-json');
    return;
  }
  if (mode === 'missing-terminal') {
    output(JSON.stringify({ response: '' }));
    return;
  }
  if (mode === 'duplicate-terminal') {
    output(JSON.stringify({ event: 'init', init: {} }));
    output(JSON.stringify({ event: 'result', result: { response: 'one' } }));
    output(JSON.stringify({ event: 'result', result: { response: 'two' } }));
    return;
  }
  if (mode === 'stream') {
    process.stdout.write(readFixture('stream-success.jsonl'));
    return;
  }
  if (mode === 'error-event') {
    output(JSON.stringify({ event: 'init', init: { session_id: 'fixture-session', model: 'pro' } }));
    output(JSON.stringify({ event: 'error', error: 'model unavailable' }));
    output(JSON.stringify({ event: 'result', result: { response: 'must-not-succeed' } }));
    return;
  }
  if (mode === 'oversized') {
    output(JSON.stringify({ response: 'x'.repeat(40 * 1024), stats: {} }));
    return;
  }
  output(JSON.stringify({ response: `GEMINI_OK:${input}`, stats: {} }));
});
