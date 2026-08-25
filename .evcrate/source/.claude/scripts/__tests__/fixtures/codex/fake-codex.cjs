#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, 'v0.149.1');
const CONFIG_FILE = path.join(process.cwd(), 'codex-fixture.json');

function readConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); }
  catch { return { mode: 'success' }; }
}

function readFixture(name) {
  return fs.readFileSync(path.join(ROOT, name), 'utf8');
}

function output(value) {
  process.stdout.write(value.endsWith('\n') ? value : `${value}\n`);
}

function alterHelp(help, mode) {
  const markers = {
    model: '--model',
    effort: '--config',
    'read-only': '--sandbox',
    session: '--ephemeral',
    output: '--json'
  };
  const marker = markers[mode];
  if (!marker) return help;
  return help.replace(marker, `unsupported-${marker.slice(2)}`);
}

function alterModels(models, mode) {
  const document = JSON.parse(models);
  const model = document.models.find((entry) => entry.slug === 'gpt-5.6-sol');
  if (mode === 'model') model.slug = 'other-model';
  if (mode === 'effort') model.supported_reasoning_levels = model.supported_reasoning_levels
    .filter((entry) => entry.effort !== 'high');
  return JSON.stringify(document);
}

function capture(input, args) {
  const captured = args[0] === 'run' ? ['exec', ...args.slice(1)] : args;
  fs.writeFileSync(path.join(process.cwd(), 'codex-argv.json'), JSON.stringify(captured), { mode: 0o600 });
  fs.writeFileSync(path.join(process.cwd(), 'codex-stdin.txt'), input, { mode: 0o600 });
}

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', () => {
  const config = readConfig();
  const args = process.argv.slice(2);
  if (config.mode === 'timeout' || config.mode === 'cancel') {
    setInterval(() => {}, 1000);
    return;
  }
  if (args.length === 1 && args[0] === '--version') {
    output(config.mode === 'version' ? 'codex-cli 9.9.9' : readFixture('version.txt'));
    return;
  }
  if (args[0] === 'login' && args[1] === 'status') {
    if (config.mode === 'auth') {
      process.stderr.write('Not logged in; credential details omitted\n');
      process.exitCode = 1;
      return;
    }
    output(readFixture('login-status.txt'));
    return;
  }
  const execCommand = args[0] === 'exec' || args[0] === 'run';
  if (execCommand && args[1] === '--help') {
    output(alterHelp(readFixture('exec-help.txt'), config.mode));
    return;
  }
  if (args[0] === 'debug' && args[1] === 'models' && args[2] === '--bundled') {
    output(alterModels(readFixture('models.json'), config.mode));
    return;
  }
  if (execCommand) {
    capture(input, args);
    if (config.mode === 'nonzero') {
      process.stderr.write('token=fixture-secret authorization=Bearer fixture-token\n');
      process.exitCode = 17;
      return;
    }
    if (config.mode === 'oversized') {
      output(JSON.stringify({ type: 'item.completed', item: {
        id: 'fixture-message', type: 'agent_message', text: 'x'.repeat(17 * 1024)
      }}));
      return;
    }
    output(readFixture(`${config.mode || 'success'}.jsonl`));
    return;
  }
  process.stderr.write('unexpected fixture command\n');
  process.exitCode = 2;
});
