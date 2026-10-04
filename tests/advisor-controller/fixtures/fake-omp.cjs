#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const stateRoot = path.join(process.env.HOME || process.env.USERPROFILE || '', '.evcrate');
const modePath = path.join(stateRoot, 'fake-omp-mode');
const statePath = path.join(stateRoot, 'fake-omp-state.json');
const mode = fs.existsSync(modePath) ? fs.readFileSync(modePath, 'utf8').trim() : 'success';
const args = process.argv.slice(2);
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
    'Usage: omp [COMMAND]',
    '  -p, --print',
    '  --mode=<value>',
    '  Output mode: text, json',
    '  --model=<value>',
    '  --thinking=<value>',
    '  --no-session',
    '  --no-tools',
    '  --no-lsp',
    '  --no-pty',
    '  --no-extensions',
    '  --no-skills',
    '  --no-rules',
    '  usage',
    '  models',
  ].join('\n');
}
function usageHelp() {
  return ['Usage: omp usage [ACTION] [FLAGS]', '  -j, --json', '  -r, --redact', '  -p, --provider=<value>'].join('\n');
}
function modelsHelp() { return 'Usage: omp models [ACTION] [PATTERN] find --json --no-extensions'; }
function usageStatus() {
  return JSON.stringify({
    generatedAt: 1,
    reports: [{ provider: 'openai-codex', limits: [{ id: 'primary', status: 'ok' }] }],
    accountsWithoutUsage: [],
    disabledCredentials: [],
    capacity: { 'openai-codex': [{ remainingAccounts: 1 }] }
  });
}
function catalog() {
  return JSON.stringify({ models: [{ provider: 'openai-codex', id: 'gpt-5.6-sol',
    selector: 'openai-codex/gpt-5.6-sol', thinking: ['high'] }] });
}
function usage() {
  return { input: 1, output: 2, cacheRead: 0, cacheWrite: 0, totalTokens: 3,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
}
function stream() {
  const user = { role: 'user', content: [{ type: 'text', text: 'checkpoint' }], attribution: 'user', timestamp: 1 };
  const assistantStart = { role: 'assistant', content: [], api: 'openai-codex-responses', provider: 'openai-codex',
    model: 'gpt-5.6-sol', usage: usage(), stopReason: 'pending', timestamp: 2 };
  const assistant = { ...assistantStart, content: [{ type: 'text', text: 'FAKE_OMP_OK' }], stopReason: 'stop',
    responseId: 'omp-response', duration: 1, ttft: 1, completedAt: 3 };
  const turnAssistant = { ...assistant };
  delete turnAssistant.completedAt;
  const events = [
    { type: 'session', version: 3, id: 'omp-session', timestamp: '2026-08-29T00:00:00.000Z', cwd: process.cwd() },
    { type: 'agent_start' }, { type: 'turn_start' },
    { type: 'message_start', message: user }, { type: 'message_end', message: user },
    { type: 'message_start', message: assistantStart },
    { type: 'message_update', assistantMessageEvent: { type: 'text_start', contentIndex: 0 } },
    { type: 'message_update', assistantMessageEvent: { type: 'text_delta', contentIndex: 0, delta: 'FAKE_OMP_OK' } },
    { type: 'message_update', assistantMessageEvent: { type: 'text_end', contentIndex: 0, content: 'FAKE_OMP_OK' } },
    { type: 'message_end', message: assistant },
    { type: 'turn_end', message: turnAssistant, toolResults: [] },
    { type: 'agent_end', messages: [user, assistant], isTerminal: true },
  ];
  return events.map((event) => JSON.stringify(event)).join('\n');
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
  record(false);
  if (args.length === 1 && args[0] === '--version') {
    output(mode === 'version' ? 'omp unknown' : 'omp v18.0.11');
    return;
  }
  if (args[0] === 'usage' && args[1] === '--help') { output(usageHelp()); return; }
  if (args[0] === 'models' && args[1] === '--help') { output(modelsHelp()); return; }
  if (args[0] === 'usage' && args.includes('--json')) {
    if (mode === 'auth') {
      process.stderr.write('provider authentication unavailable\n');
      process.exitCode = 1;
    } else if (mode === 'auth-malformed') output('{not-json');
    else output(usageStatus());
    return;
  }
  if (args[0] === 'models' && args[1] === 'find') {
    if (mode === 'catalog-failure') {
      process.stderr.write('model catalog unavailable\n');
      process.exitCode = 17;
    } else if (mode === 'model') output(JSON.stringify({ models: [{ provider: 'openai-codex', id: 'other', selector: 'other/model', thinking: ['high'] }] }));
    else if (mode === 'effort') output(JSON.stringify({ models: [{ provider: 'openai-codex', id: 'gpt-5.6-sol', selector: 'openai-codex/gpt-5.6-sol', thinking: [] }] }));
    else output(catalog());
    return;
  }
  if (args.length === 1 && args[0] === '--help') {
    let value = help();
    if (mode === 'read-only') value = value.replace('--no-tools', '--no-tools-unsafe');
    if (mode === 'session') value = value.replace('--no-session', '--no-session-unsupported');
    if (mode === 'output') value = value.replace('--mode=<value>', '--unsupported-mode');
    output(value);
    return;
  }
  const finalRun = args.includes('--mode') && args.includes('json') && args.at(-1) === '-p';
  if (!finalRun) {
    process.stderr.write('unexpected fixture command\n');
    process.exitCode = 2;
    return;
  }
  record(true);
  if (mode === 'timeout') { setInterval(() => {}, 1000); return; }
  if (mode === 'nonzero') { process.stderr.write('token=fixture-secret authorization=Bearer fixture-token\n'); process.exitCode = 17; return; }
  if (mode === 'malformed') { output('{not-json'); return; }
  if (mode === 'tool') { output(JSON.stringify({ type: 'tool_execution_start', toolCallId: 'x', toolName: 'read', args: {} })); return; }
  if (mode === 'late') { output(`${stream()}\n${JSON.stringify({ type: 'turn_start' })}`); return; }
  if (mode === 'between') { output(`${stream()}\n${JSON.stringify({ type: 'message_start', message: { role: 'user', content: 'late', timestamp: 4 } })}`); return; }
  if (mode === 'oversized') { output(`${stream()}${'x'.repeat(33 * 1024)}`); return; }
  output(stream());
});
