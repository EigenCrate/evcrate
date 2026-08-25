#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = __dirname;
const configFile = path.join(process.cwd(), 'claude-fixture.json');
const modeIndex = process.argv.indexOf('--case');
const modeArg = modeIndex >= 0 ? process.argv[modeIndex + 1] : null;
const args = modeIndex >= 0
  ? process.argv.slice(modeIndex + 2)
  : process.argv.slice(2);

function readConfig() {
  try { return JSON.parse(fs.readFileSync(configFile, 'utf8')); }
  catch { return { mode: 'success' }; }
}

const mode = modeArg || readConfig().mode || 'success';

function readFixture(name) {
  return fs.readFileSync(path.join(root, name), 'utf8');
}

function writeJson(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

function failProcess() {
  process.stderr.write('token=fixture-secret path=/private/fake/workspace Bearer fixture-bearer\n');
  process.exitCode = 17;
}

function has(name) {
  return args.includes(name);
}

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', () => {
  if ((mode === 'timeout' || mode === 'cancel') && (modeArg === null || has('-p'))) {
    setInterval(() => {}, 1000);
    return;
  }
  if (has('--version')) {
    process.stdout.write(mode === 'version' ? '2.1.999 (Claude Code)\n' : readFixture('version-2.1.207.txt'));
    return;
  }
  if (args[0] === 'auth' && args[1] === 'status') {
    if (args.length !== 2) {
      process.stderr.write('unsupported auth probe\n');
      process.exitCode = 64;
      return;
    }
    if (mode === 'auth') {
      writeJson({ loggedIn: false, authMethod: 'none', apiProvider: 'firstParty' });
    } else {
      process.stdout.write(readFixture('auth-status-2.1.207.json'));
    }
    return;
  }
  if (has('--help')) {
    const controlProbe = [
      '--model', 'opus', '--effort', 'high', '--permission-mode', 'plan',
      '--output-format', 'json', '--no-session-persistence', '--max-turns', '3', '--help'
    ];
    if (args.length > 1 && JSON.stringify(args) !== JSON.stringify(controlProbe)) {
      process.stderr.write('unexpected capability probe argv\n');
      process.exitCode = 64;
      return;
    }
    let help = readFixture('help-2.1.207.txt');
    const removals = {
      model: /--model[^\n]*\n/gu,
      effort: /--effort[^\n]*\n/gu,
      'read-only': /--permission-mode[^\n]*\n/gu,
      session: /--no-session-persistence[^\n]*\n/gu,
      output: /(?:--output-format[^\n]*\n|--max-turns[^\n]*\n)/gu
    };
    if (removals[mode]) help = help.replace(removals[mode], '');
    process.stdout.write(help);
    return;
  }
  if (!has('-p') || mode === 'nonzero') {
    if (mode === 'nonzero') failProcess();
    else process.exitCode = 64;
    return;
  }
  const expected = [
    '-p', '--model', 'opus', '--effort', 'high', '--permission-mode', 'plan',
    '--output-format', 'json', '--no-session-persistence', '--max-turns', '3'
  ];
  if (JSON.stringify(args) !== JSON.stringify(expected)) {
    process.stderr.write('unexpected argv\n');
    process.exitCode = 64;
    return;
  }
  if (fs.existsSync(configFile)) {
    fs.writeFileSync(path.join(process.cwd(), 'claude-argv.json'), JSON.stringify(args), { mode: 0o600 });
    fs.writeFileSync(path.join(process.cwd(), 'claude-stdin.txt'), input, { mode: 0o600 });
  }
  if (mode === 'protocol' || mode === 'malformed') {
    process.stdout.write('not-json\n');
    return;
  }
  if (mode === 'missing-terminal' || mode === 'missing') {
    writeJson({ type: 'assistant', message: { role: 'assistant', content: [] } });
    return;
  }
  if (mode === 'duplicate-terminal' || mode === 'duplicate') {
    const result = readFixture('result-2.1.207.json').trim();
    process.stdout.write(`${result}\n${result}\n`);
    return;
  }
  if (mode === 'unexpected') {
    writeJson({
      type: 'result', subtype: 'success', is_error: false, result: 'CLAUDE_OK', unexpected: true
    });
    return;
  }
  if (mode === 'oversized') {
    const result = JSON.parse(readFixture('result-2.1.207.json'));
    result.result = 'x'.repeat(64 * 1024);
    writeJson(result);
    return;
  }
  if (mode === 'nonzero') return;
  const result = JSON.parse(readFixture('result-2.1.207.json'));
  result.result = `CLAUDE_OK:${input}`;
  writeJson(result);
});
