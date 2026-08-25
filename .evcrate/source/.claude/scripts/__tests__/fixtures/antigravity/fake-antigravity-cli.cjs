#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = __dirname;
const configFile = path.join(process.cwd(), 'antigravity-fixture.json');
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

const mode = modeArg || readConfig().mode || 'success';

function has(flag) {
  return args.includes(flag);
}

function mutateHelp(help) {
  const removals = {
    'read-only': /--sandbox[^\n]*\n/gu,
    session: /--input-format[^\n]*\n/gu,
    output: /--output-format[^\n]*\n/gu
  };
  return removals[mode] ? help.replace(removals[mode], '') : help;
}

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', () => {
  if (has('--version')) {
    output(mode === 'version' ? 'agy 9.9.9' : readFixture('version-1.0.0.txt'));
    return;
  }
  if (has('--help')) {
    output(mutateHelp(readFixture('help-1.0.0.txt')));
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
    fs.writeFileSync(path.join(process.cwd(), 'antigravity-argv.json'), JSON.stringify(args), { mode: 0o600 });
    fs.writeFileSync(path.join(process.cwd(), 'antigravity-stdin.txt'), input, { mode: 0o600 });
  }
  if (mode === 'nonzero' || mode === 'auth-nonzero') {
    process.stderr.write('token=fixture-secret path=/private/fake\n');
    process.exitCode = 17;
    return;
  }
  if (mode === 'auth') {
    output(JSON.stringify({ status: 'ERROR', response: '', error: 'authentication required' }));
    return;
  }
  if (mode === 'model') {
    output(JSON.stringify({ status: 'ERROR', response: '', error: 'invalid model selection: model flash is not recognized' }));
    return;
  }
  if (mode === 'effort') {
    output(JSON.stringify({ status: 'ERROR', response: '', error: 'invalid effort: effort xhigh is unsupported' }));
    return;
  }
  if (mode === 'cancel-nonzero') {
    process.stderr.write('request cancelled by user\n');
    process.exitCode = 17;
    return;
  }
  if (mode === 'protocol' || mode === 'malformed') {
    output('not-json');
    return;
  }
  if (mode === 'missing-terminal') {
    output(JSON.stringify({ event: 'init', init: {
      tools: ['read_file'], permission_mode: 'request-review'
    }}));
    return;
  }
  if (mode === 'duplicate-terminal') {
    output(JSON.stringify({ event: 'init', init: {
      tools: ['read_file'], permission_mode: 'request-review'
    }}));
    output(JSON.stringify({ event: 'result', result: { status: 'SUCCESS', response: 'one' } }));
    output(JSON.stringify({ event: 'result', result: { status: 'SUCCESS', response: 'two' } }));
    return;
  }
  if (mode === 'dangerous-tool') {
    output(JSON.stringify({ event: 'init', init: {
      tools: ['read_file', 'write_file'], permission_mode: 'request-review'
    }}));
    output(JSON.stringify({ event: 'result', result: { status: 'SUCCESS', response: 'unsafe' } }));
    return;
  }
  if (mode === 'json') {
    output(JSON.stringify({
      conversation_id: 'fixture-conversation', status: 'SUCCESS', response: 'AGY_JSON_OK', num_turns: 1
    }));
    return;
  }
  output(readFixture('stream-success.jsonl'));
});
