#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const stateRoot = path.join(process.env.HOME || '', '.evcrate');
const modePath = path.join(stateRoot, 'fake-codex-mode');
const statePath = path.join(stateRoot, 'fake-codex-state.json');
const mode = fs.existsSync(modePath) ? fs.readFileSync(modePath, 'utf8').trim() : 'success';
const args = process.argv.slice(2);
const FINAL_ARGS = Object.freeze([
  'exec', '--ephemeral', '--ignore-user-config', '--ignore-rules', '--strict-config',
  '--skip-git-repo-check', '--sandbox', 'read-only', '--model', 'gpt-5.6-sol',
  '--config', 'model_reasoning_effort="high"', '--json', '-'
]);
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { input += chunk; });

function state() {
  try { return JSON.parse(fs.readFileSync(statePath, 'utf8')); }
  catch { return { finalCount: 0, calls: [] }; }
}
function save(value) {
  fs.mkdirSync(stateRoot, { recursive: true, mode: 0o700 });
  fs.writeFileSync(statePath, `${JSON.stringify(value)}\n`, { mode: 0o600 });
}
function output(value) { process.stdout.write(value.endsWith('\n') ? value : `${value}\n`); }
function help() {
  return [
    'Usage: codex exec [OPTIONS]',
    '  --model <model>',
    '  --config <key=value>',
    '  --ephemeral',
    '  --sandbox <mode> (read-only)',
    '  --ignore-user-config',
    '  --ignore-rules',
    '  --strict-config',
    '  --skip-git-repo-check',
    '  --json',
  ].join('\n');
}
function success({ implicitStart = false } = {}) {
  return [
    JSON.stringify({ type: 'thread.started', thread_id: 'fixture-thread' }),
    JSON.stringify({ type: 'turn.started', turn_id: 'fixture-turn' }),
    ...(implicitStart ? [] : [JSON.stringify({ type: 'item.started', item: { id: 'fixture-message', type: 'agent_message' } })]),
    JSON.stringify({ type: 'item.completed', item: { id: 'fixture-message', type: 'agent_message', text: 'FAKE_CODEX_OK' } }),
    JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 1, output_tokens: 1 } }),
  ].join('\n');
}
function record(finalRun) {
  const current = state();
  current.calls.push({ args, cwd: process.cwd(), final: finalRun });
  if (finalRun) {
    current.finalCount = (current.finalCount || 0) + 1;
    current.lastCwd = process.cwd();
    current.lastCwdExists = fs.existsSync(process.cwd());
    current.lastStdin = input;
  }
  save(current);
}

process.stdin.on('end', () => {
  if (args.length === 1 && args[0] === '--version') {
    record(false);
    output(mode === 'version' ? 'codex unknown' : 'codex-cli 0.150.1');
    return;
  }
  if (args.length === 2 && args[0] === 'login' && args[1] === 'status') {
    record(false);
    if (mode === 'auth') {
      process.stderr.write('Not logged in; credential details omitted\n');
      process.exitCode = 1;
    } else {
      output('Logged in using ChatGPT');
    }
    return;
  }
  if (args.length === 2 && args[0] === 'exec' && args[1] === '--help') {
    record(false);
    if (mode === 'model' || mode === 'effort' || mode === 'read-only' || mode === 'session' || mode === 'output') {
      const marker = { model: '--model', effort: '--config', 'read-only': '--sandbox', session: '--ephemeral', output: '--json' }[mode];
      output(help().replace(marker, `unsupported-${marker.slice(2)}`));
    } else {
      output(help());
    }
    return;
  }
  if (args.length === 3 && args[0] === 'debug' && args[1] === 'models' && args[2] === '--bundled') {
    record(false);
    const catalog = { models: [{ slug: 'gpt-5.6-sol', supported_reasoning_levels: [{ effort: 'high' }] }] };
    if (mode === 'model') catalog.models[0].slug = 'other-model';
    if (mode === 'effort') catalog.models[0].supported_reasoning_levels = [];
    output(JSON.stringify(catalog));
    return;
  }
  const finalRun = args[0] === 'exec' && args.includes('--json') && args.at(-1) === '-';
  if (!finalRun) {
    process.stderr.write('unexpected fixture command\n');
    process.exitCode = 2;
    return;
  }
  if (JSON.stringify(args) !== JSON.stringify(FINAL_ARGS)) {
    process.stderr.write('unexpected final fixture command\n');
    process.exitCode = 2;
    return;
  }
  record(true);
  if (mode === 'timeout') {
    setInterval(() => {}, 1000);
    return;
  }
  if (mode === 'delayed-31s') {
    setTimeout(() => {
      output(success());
    }, 31000);
    return;
  }
  if (mode === 'nonzero') {
    process.stderr.write('token=fixture-secret authorization=Bearer fixture-token\n');
    process.exitCode = 17;
    return;
  }
  if (mode === 'malformed') { output('{not-json'); return; }
  if (mode === 'invalid-utf8') { process.stdout.write(Buffer.from([0xc3, 0x28])); return; }
  if (mode === 'command') {
    output(JSON.stringify({ type: 'item.started', item: { id: 'command-fixture', type: 'command_execution' } }));
    return;
  }
  if (mode === 'late') {
    output(`${success()}\n${JSON.stringify({ type: 'item.started', item: { id: 'late', type: 'reasoning' } })}`);
    return;
  }
  if (mode === 'between') {
    output(`${success()}\n${JSON.stringify({ type: 'turn.started', turn_id: 'late-turn' })}`);
    return;
  }
  if (mode === 'oversized') {
    const lines = success().split('\n');
    lines[3] = JSON.stringify({ type: 'item.completed', item: { id: 'fixture-message', type: 'agent_message', text: 'x'.repeat(17 * 1024) } });
    output(lines.join('\n'));
    return;
  }
  if (mode === 'implicit-reasoning') {
    const lines = success().split('\n');
    lines.splice(2, 0, JSON.stringify({ type: 'item.completed', item: { id: 'reasoning-fixture', type: 'reasoning' } }));
    output(lines.join('\n'));
    return;
  }
  if (mode === 'empty-id') {
    const lines = success().split('\n');
    lines[2] = lines[2].replace('fixture-message', '');
    lines[3] = lines[3].replace('fixture-message', '');
    output(lines.join('\n'));
    return;
  }
  if (mode === 'post-response') {
    const lines = success().split('\n');
    lines.splice(4, 0, JSON.stringify({ type: 'item.started', item: { id: 'late-reasoning', type: 'reasoning' } }));
    output(lines.join('\n'));
    return;
  }
  output(success({ implicitStart: mode === 'implicit-start' }));
});
