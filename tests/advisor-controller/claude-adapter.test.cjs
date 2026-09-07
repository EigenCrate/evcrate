'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const CLAUDE = require(path.resolve(__dirname, '../../.evcrate/source/.evcrate/bin/lib/advisor/adapters/claude.cjs'));
const { createRoutingError } = require(path.resolve(__dirname, '../../.evcrate/source/.evcrate/bin/lib/advisor/errors.cjs'));

const TARGET = { model: 'claude-3-7-sonnet-20250219', effort: 'high' };
const VALID_RESULT = {
  type: 'result',
  subtype: 'success',
  is_error: false,
  result: 'Use the smallest safe change and verify before approval.',
  session_id: 'session-uuid-1',
  uuid: 'uuid-1',
  duration_ms: 1200,
  duration_api_ms: 1100,
  total_cost_usd: 0.005,
  usage: { input_tokens: 100, output_tokens: 50 },
  permission_denials: [],
  stop_reason: 'end_turn',
  model: 'claude-3-7-sonnet-20250219'
};

const CLAUDE_HELP = [
  'Usage: claude [options] [command] [prompt]',
  'Claude Code - starts an interactive session by default, use -p/--print for non-interactive output',
  'Options:',
  '  -p, --print                           Print output and exit',
  '  --safe-mode                           Start with all customizations disabled',
  '  --disable-slash-commands              Disable all skills',
  '  --disallowed-tools <tools...>         Comma or space-separated list of tool names to disallow',
  '  --strict-mcp-config                   Only use MCP servers from --mcp-config',
  '  --mcp-config <configs...>             Load MCP servers from JSON files',
  '  --permission-mode <mode>              Permission mode to use (plan, default, bypass)',
  '  --no-session-persistence              Disable session persistence',
  '  --model <model>                       Model for the current session',
  '  --effort <level>                      Effort level for the current session',
  '  --output-format <format>              Output format (json, stream-json, text)',
].join('\n');

function parse(stdout, target = TARGET) {
  return CLAUDE.parseResult({ target, execution: { stdout } });
}

function probeContext({
  versionStdout = '2.1.250 (Claude Code)',
  authStdout = '{"loggedIn":true,"authMethod":"oauth","apiProvider":"anthropic"}',
  helpStdout = CLAUDE_HELP,
  probeHelpStdout = 'Usage: claude [options] [command] [prompt]'
} = {}) {
  const calls = [];
  const context = {
    target: TARGET,
    cwd: process.cwd(),
    workspaceRoot: process.cwd(),
    createInvocation: (inv) => ({ ...inv }),
    environment: {},
    requestDepth: 0,
    runner: {
      run: async (invocation) => {
        calls.push(invocation.argv);
        const key = invocation.argv.join(' ');
        if (key === '--version') return { stdout: versionStdout, stderr: '' };
        if (key === 'auth status') return { stdout: authStdout, stderr: '' };
        if (key === '--help') return { stdout: helpStdout, stderr: '' };
        if (invocation.argv.includes('--help')) return { stdout: probeHelpStdout, stderr: '' };
        throw new Error(`Unexpected probe invocation: ${key}`);
      }
    }
  };
  return { context, calls };
}

test('Claude parser accepts valid end_turn result', () => {
  const parsed = parse(JSON.stringify(VALID_RESULT));
  assert.deepEqual(parsed, {
    recommendation: 'Use the smallest safe change and verify before approval.'
  });
});

test('Claude parser accepts stop_reason: stop and absent optional stop_reason', () => {
  const withStop = { ...VALID_RESULT, stop_reason: 'stop' };
  assert.equal(parse(JSON.stringify(withStop)).recommendation, VALID_RESULT.result);

  const withoutStop = { ...VALID_RESULT };
  delete withoutStop.stop_reason;
  assert.equal(parse(JSON.stringify(withoutStop)).recommendation, VALID_RESULT.result);
});

test('Claude parser rejects permission denials (F06 security violation)', () => {
  const denied = {
    ...VALID_RESULT,
    permission_denials: [{ tool_name: 'Bash', tool_input: { command: 'cat /etc/passwd' } }]
  };
  assert.throws(() => parse(JSON.stringify(denied)), { code: 'READ_ONLY_UNSUPPORTED' });
});

test('Claude parser rejects non-array permission denials', () => {
  const invalidDenials = { ...VALID_RESULT, permission_denials: 'unexpected-string' };
  assert.throws(() => parse(JSON.stringify(invalidDenials)), { code: 'PROTOCOL_INVALID' });
});

test('Claude parser rejects tool_use and tool_call stop reasons', () => {
  const toolUse = { ...VALID_RESULT, stop_reason: 'tool_use' };
  assert.throws(() => parse(JSON.stringify(toolUse)), { code: 'READ_ONLY_UNSUPPORTED' });

  const toolCall = { ...VALID_RESULT, stop_reason: 'tool_call' };
  assert.throws(() => parse(JSON.stringify(toolCall)), { code: 'READ_ONLY_UNSUPPORTED' });
});

test('Claude parser maps max_tokens stop reason to OUTPUT_LIMIT', () => {
  const truncated = { ...VALID_RESULT, stop_reason: 'max_tokens' };
  assert.throws(() => parse(JSON.stringify(truncated)), { code: 'OUTPUT_LIMIT' });
});

test('Claude parser rejects unexpected or nonterminal stop reasons', () => {
  const cancelled = { ...VALID_RESULT, stop_reason: 'cancelled' };
  assert.throws(() => parse(JSON.stringify(cancelled)), { code: 'PROTOCOL_INVALID' });

  const nonString = { ...VALID_RESULT, stop_reason: 42 };
  assert.throws(() => parse(JSON.stringify(nonString)), { code: 'PROTOCOL_INVALID' });
});

test('Claude parser validates model attestation when present', () => {
  const mismatch = { ...VALID_RESULT, model: 'claude-3-haiku-20240307' };
  assert.throws(() => parse(JSON.stringify(mismatch)), { code: 'MODEL_UNSUPPORTED' });

  const matched = { ...VALID_RESULT, model: TARGET.model };
  assert.equal(parse(JSON.stringify(matched)).recommendation, VALID_RESULT.result);
});

test('Claude parser enforces output byte limits', () => {
  const oversizedResult = { ...VALID_RESULT, result: 'x'.repeat(16 * 1024 + 1) };
  assert.throws(() => parse(JSON.stringify(oversizedResult)), { code: 'OUTPUT_LIMIT' });

  const hugePayload = ' '.repeat(32 * 1024 + 1);
  assert.throws(() => parse(hugePayload), { code: 'OUTPUT_LIMIT' });
});

test('Claude parser rejects error results and malformed output', () => {
  assert.throws(() => parse('not-json'), { code: 'PROTOCOL_INVALID' });
  assert.throws(() => parse(JSON.stringify({ ...VALID_RESULT, is_error: true })), { code: 'PROTOCOL_INVALID' });
  assert.throws(() => parse(JSON.stringify({ ...VALID_RESULT, subtype: 'error' })), { code: 'PROTOCOL_INVALID' });
  assert.throws(() => parse(JSON.stringify({ ...VALID_RESULT, result: '   ' })), { code: 'PROTOCOL_INVALID' });
  assert.throws(() => parse(JSON.stringify({ ...VALID_RESULT, extra_unexpected_key: 123 })), { code: 'PROTOCOL_INVALID' });
});

test('Claude probeVersion parses clean semantic versions', async () => {
  const { context } = probeContext({ versionStdout: '2.1.250 (Claude Code)\n' });
  assert.equal(await CLAUDE.probeVersion(context), '2.1.250');

  const { context: vContext } = probeContext({ versionStdout: 'v3.0.1\n' });
  assert.equal(await CLAUDE.probeVersion(vContext), '3.0.1');

  const { context: failContext } = probeContext({ versionStdout: 'Claude Code alpha build\n' });
  await assert.rejects(() => CLAUDE.probeVersion(failContext), { code: 'CLI_VERSION_UNSUPPORTED' });
});

test('Claude probeAuth verifies loggedIn status and authMethod', async () => {
  const { context } = probeContext();
  await CLAUDE.probeVersion(context);
  assert.deepEqual(await CLAUDE.probeAuth(context), { authenticated: true });

  const { context: notLoggedIn } = probeContext({ authStdout: '{"loggedIn":false,"authMethod":"none"}' });
  await CLAUDE.probeVersion(notLoggedIn);
  await assert.rejects(() => CLAUDE.probeAuth(notLoggedIn), { code: 'AUTH_UNAVAILABLE' });
});

test('Claude probeCapabilities validates read-only, session, and output controls', async () => {
  const { context } = probeContext();
  await CLAUDE.probeVersion(context);
  await CLAUDE.probeAuth(context);
  const capabilities = await CLAUDE.probeCapabilities(context);
  assert.deepEqual(capabilities, {
    model: TARGET.model,
    effort: TARGET.effort,
    noninteractive: true,
    session: 'isolated',
    tools: 'none',
    output: 'json'
  });
});

test('Claude probeCapabilities succeeds with --no-session-persistence even without --max-turns in help', async () => {
  assert.equal(CLAUDE_HELP.includes('--max-turns'), false);
  const { context } = probeContext({ helpStdout: CLAUDE_HELP });
  await CLAUDE.probeVersion(context);
  await CLAUDE.probeAuth(context);
  const caps = await CLAUDE.probeCapabilities(context);
  assert.equal(caps.session, 'isolated');
});

test('Claude probeCapabilities fails if read-only or session persistence controls are missing', async () => {
  const missingSafeMode = CLAUDE_HELP.replace('--safe-mode', '--unsafe-mode');
  const { context: ctx1 } = probeContext({ helpStdout: missingSafeMode });
  await CLAUDE.probeVersion(ctx1);
  await CLAUDE.probeAuth(ctx1);
  await assert.rejects(() => CLAUDE.probeCapabilities(ctx1), { code: 'READ_ONLY_UNSUPPORTED' });

  const missingSession = CLAUDE_HELP.replace('--no-session-persistence', '--session-always');
  const { context: ctx2 } = probeContext({ helpStdout: missingSession });
  await CLAUDE.probeVersion(ctx2);
  await CLAUDE.probeAuth(ctx2);
  await assert.rejects(() => CLAUDE.probeCapabilities(ctx2), { code: 'SESSION_UNSUPPORTED' });
});

test('Claude buildInvocation passes explicit generation limits and fixed controls', async () => {
  const { context } = probeContext();
  await CLAUDE.probeVersion(context);
  await CLAUDE.probeAuth(context);
  await CLAUDE.probeCapabilities(context);
  delete context.createInvocation;
  context.prompt = '{"checkpoint":"test"}';
  context.limits = { mode: 'generation', warnAfterMs: 120000 };
  const invocation = CLAUDE.buildInvocation(context);
  assert.equal(invocation.adapter, 'claude');
  assert.equal(invocation.prompt, context.prompt);
  assert.equal(invocation.limits.mode, 'generation');
  assert.equal(invocation.limits.warnAfterMs, 120000);
  assert.equal(invocation.limits.timeoutMs, undefined);
  assert.equal(invocation.argv.includes('--max-turns'), false);
  assert.ok(invocation.argv.includes('--safe-mode'));
  assert.ok(invocation.argv.includes('--no-session-persistence'));
  assert.ok(invocation.argv.includes('--output-format'));
  assert.ok(invocation.argv.includes('json'));
});

test('Claude classifyFailure preserves structured transient and lifecycle errors', () => {
  assert.equal(CLAUDE.classifyFailure(createRoutingError('TRANSIENT_PROVIDER_ERROR')), 'TRANSIENT_PROVIDER_ERROR');
  assert.equal(CLAUDE.classifyFailure(createRoutingError('READ_ONLY_UNSUPPORTED')), 'READ_ONLY_UNSUPPORTED');
  assert.equal(CLAUDE.classifyFailure(createRoutingError('OUTPUT_LIMIT')), 'OUTPUT_LIMIT');
  assert.equal(CLAUDE.classifyFailure(createRoutingError('TIMEOUT')), 'TIMEOUT');
  assert.equal(CLAUDE.classifyFailure(createRoutingError('CANCELLED')), 'CANCELLED');
  assert.equal(CLAUDE.classifyFailure(new Error('arbitrary unknown exit')), 'PROCESS_FAILED');
});

test('classifyAttemptFailure enforces cooldown upper bounds and fail-closed malformed handling (W1)', () => {
  const { classifyAttemptFailure } = require(path.resolve(__dirname, '../../.evcrate/source/.evcrate/bin/lib/advisor/adapter-contract.cjs'));

  // Valid cooldown <= 1 hour
  const valid = classifyAttemptFailure(createRoutingError('TRANSIENT_PROVIDER_ERROR', { cooldown_ms: 5000 }));
  assert.equal(valid.classification, 'transient');
  assert.equal(valid.retryable, true);
  assert.equal(valid.cooldown_ms, 5000);

  // Boundary 1 hour (3600000 ms)
  const maxCooldown = classifyAttemptFailure(createRoutingError('TRANSIENT_PROVIDER_ERROR', { cooldown_ms: 3600000 }));
  assert.equal(maxCooldown.classification, 'transient');
  assert.equal(maxCooldown.retryable, true);
  assert.equal(maxCooldown.cooldown_ms, 3600000);

  // Oversized cooldown (> 1 hour) fails closed as fatal
  const oversized = classifyAttemptFailure(createRoutingError('TRANSIENT_PROVIDER_ERROR', { cooldown_ms: 3600001 }));
  assert.equal(oversized.classification, 'fatal');
  assert.equal(oversized.retryable, false);

  // Malformed Infinity, float, string fail closed as fatal
  assert.equal(classifyAttemptFailure(createRoutingError('TRANSIENT_PROVIDER_ERROR', { cooldown_ms: Infinity })).retryable, false);
  assert.equal(classifyAttemptFailure(createRoutingError('TRANSIENT_PROVIDER_ERROR', { cooldown_ms: 1.5 })).retryable, false);
  assert.equal(classifyAttemptFailure(createRoutingError('TRANSIENT_PROVIDER_ERROR', { cooldown_ms: '7200000' })).retryable, false);
});
