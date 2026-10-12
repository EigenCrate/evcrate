import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifySourceSettings,
  renderRegistrationExamples,
  renderMcpExamples,
  renderEvcrateConfigExample,
  renderActivationGuide,
  validateLocalConfiguration,
  resolveCanonicalModelIntent,
  validateAgentIntentManifest,
  validateAgentToolAuditV2,
  VSCODE_AGENT_INTENT_SCHEMA_V1,
  VSCODE_AGENT_TOOL_AUDIT_SCHEMA_V2,
  VSCODE_CANONICAL_TIERS
} from '../../dist/adapters/vscode/index.js';

test('configuration: classifySourceSettings correctly maps and classifies keys', () => {
  const source = {
    hooks: { SessionStart: [] },
    includeCoAuthoredBy: false,
    statusLine: { type: 'command' },
    effortLevel: 'high',
    env: { CLAUDE_CODE_DISABLE_1M_CONTEXT: '1' },
    customUnknownKey: 'value'
  };

  const disposition = classifySourceSettings(source);
  assert.equal(disposition.schema, 'evcrate-vscode-settings-disposition-v1');
  assert.equal(disposition.source, 'settings.json');

  assert.equal(disposition.keys.hooks.disposition, 'mapped');
  assert.equal(disposition.keys.includeCoAuthoredBy.disposition, 'unsupported');
  assert.equal(disposition.keys.statusLine.disposition, 'unsupported');
  assert.equal(disposition.keys.effortLevel.disposition, 'unsupported');
  assert.equal(disposition.keys.env.disposition, 'inactive');
  assert.equal(disposition.keys['settings.local.json'].disposition, 'inactive');
  assert.equal(disposition.keys.customUnknownKey.disposition, 'unsupported');
});

test('configuration: renderRegistrationExamples produces inert disabled entries', () => {
  const defaultRes = renderRegistrationExamples();
  assert.equal(
    defaultRes.vscodeSettings['chat.pluginLocations']['/absolute/selected/.evcrate-vscode'],
    false,
    'Must be disabled (false) by default'
  );
  assert.equal(defaultRes.vscodeSettings['chat.plugins.enabled'], true);
  assert.equal(defaultRes.vscodeSettings['chat.useHooks'], true);

  const parsed = JSON.parse(defaultRes.content);
  assert.equal(parsed['chat.pluginLocations']['/absolute/selected/.evcrate-vscode'], false);

  const customRes = renderRegistrationExamples({ pluginPath: '/custom/path/.evcrate-vscode' });
  assert.equal(customRes.vscodeSettings['chat.pluginLocations']['/custom/path/.evcrate-vscode'], false);
});

test('configuration: renderMcpExamples pins versions and uses secure password input', () => {
  const { mcpServersExample, content } = renderMcpExamples();

  assert.ok(mcpServersExample.servers.context7);
  const context7Args = mcpServersExample.servers.context7.args;
  assert.ok(context7Args.some((arg) => arg.includes('@upstash/context7-mcp@0.1.18')));
  assert.equal(context7Args.includes('YOUR_API_KEY'), false);
  assert.equal(
    mcpServersExample.servers.context7.env.CONTEXT7_API_KEY,
    '${input:context7ApiKey}'
  );

  const chromeDevtoolsArgs = mcpServersExample.servers['chrome-devtools'].args;
  assert.ok(chromeDevtoolsArgs.some((arg) => arg.includes('chrome-devtools-mcp@0.1.0')));
  assert.equal(chromeDevtoolsArgs.some((arg) => arg.includes('@latest')), false);

  const seqArgs = mcpServersExample.servers['sequential-thinking'].args;
  assert.ok(seqArgs.some((arg) => arg.includes('@modelcontextprotocol/server-sequential-thinking@0.1.0')));

  assert.equal(mcpServersExample.inputs.length, 1);
  assert.equal(mcpServersExample.inputs[0].id, 'context7ApiKey');
  assert.equal(mcpServersExample.inputs[0].password, true);

  const parsed = JSON.parse(content);
  assert.deepEqual(parsed, mcpServersExample);
});

test('configuration: renderEvcrateConfigExample and renderActivationGuide output valid guidance', () => {
  const { configExample, content } = renderEvcrateConfigExample();
  assert.equal(configExample.codingLevel, -1);
  assert.equal(configExample.privacyBlock, true);
  assert.deepEqual(JSON.parse(content), configExample);

  const guide = renderActivationGuide();
  assert.ok(guide.includes('chat.pluginLocations'));
  assert.ok(guide.includes('Workspace Trust'));
  assert.ok(guide.includes('Inert by Default'));
  assert.ok(guide.includes('Companion Extension'));
  assert.ok(guide.includes('eigencrate.evcrate-model-bindings'));
  assert.ok(guide.includes('chatPromptFiles'));
});

test('configuration: resolveCanonicalModelIntent handles canonical tiers, inheritance, and invalid models', () => {
  assert.deepEqual(resolveCanonicalModelIntent('opus'), { mode: 'tier', tier: 'opus' });
  assert.deepEqual(resolveCanonicalModelIntent('sonnet'), { mode: 'tier', tier: 'sonnet' });
  assert.deepEqual(resolveCanonicalModelIntent('haiku'), { mode: 'tier', tier: 'haiku' });

  assert.deepEqual(resolveCanonicalModelIntent(undefined), { mode: 'inherit', tier: null });
  assert.deepEqual(resolveCanonicalModelIntent(null), { mode: 'inherit', tier: null });
  assert.deepEqual(resolveCanonicalModelIntent(''), { mode: 'inherit', tier: null });
  assert.deepEqual(resolveCanonicalModelIntent('inherit'), { mode: 'inherit', tier: null });

  assert.throws(() => resolveCanonicalModelIntent('future-unsupported-model'), { code: 'CONTRACT_INVALID' });
  assert.throws(() => resolveCanonicalModelIntent('claude-3-opus'), { code: 'CONTRACT_INVALID' });
  assert.throws(() => resolveCanonicalModelIntent(12345), { code: 'CONTRACT_INVALID' });
});

test('configuration: obsolete local model map exports are completely removed', async () => {
  const vscodeExports = await import('../../dist/adapters/vscode/index.js');
  assert.equal(vscodeExports.resolveLocalModel, undefined);
  assert.equal(vscodeExports.buildVscodeModelMap, undefined);
  assert.equal(vscodeExports.VSCODE_LOCAL_MODEL_MAP, undefined);
});

test('configuration: validateLocalConfiguration enforces security and secret bounds', () => {
  const valid = validateLocalConfiguration({
    settings: { 'chat.plugins.enabled': true },
    mcp: { servers: {} }
  });
  assert.equal(valid.valid, true);
  assert.equal(valid.errors.length, 0);

  const autoApprove = validateLocalConfiguration({
    settings: { 'chat.tools.autoApprove': true }
  });
  assert.equal(autoApprove.valid, false);
  assert.ok(autoApprove.errors.some((e) => e.includes('autoApprove')));

  const noTrust = validateLocalConfiguration({
    settings: { 'security.workspace.trust.enabled': false }
  });
  assert.equal(noTrust.valid, false);
  assert.ok(noTrust.errors.some((e) => e.includes('Workspace Trust')));

  const placeholderKey = validateLocalConfiguration({
    mcp: { servers: { context7: { args: ['YOUR_API_KEY'] } } }
  });
  assert.equal(placeholderKey.valid, false);
  assert.ok(placeholderKey.errors.some((e) => e.includes('YOUR_API_KEY')));

  const rawKey = validateLocalConfiguration({
    mcp: { servers: { custom: { key: 'sk-1234567890123456789012345' } } }
  });
  assert.equal(rawKey.valid, false);
  assert.ok(rawKey.errors.some((e) => e.includes('raw API credentials')));
});
