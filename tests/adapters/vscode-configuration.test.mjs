import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifySourceSettings,
  renderRegistrationExamples,
  renderMcpExamples,
  renderEvcrateConfigExample,
  renderActivationGuide,
  validateLocalConfiguration,
  resolveLocalModel,
  buildVscodeModelMap,
  VSCODE_LOCAL_MODEL_MAP
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
});

test('configuration: resolveLocalModel handles pin, inheritance, and unavailable models', () => {
  assert.deepEqual(resolveLocalModel('opus'), { mode: 'pin', nativeModel: 'claude-3-opus' });
  assert.deepEqual(resolveLocalModel('sonnet'), { mode: 'pin', nativeModel: 'claude-3.5-sonnet' });
  assert.deepEqual(resolveLocalModel('haiku'), { mode: 'pin', nativeModel: 'claude-3.5-haiku' });

  assert.deepEqual(resolveLocalModel(undefined), { mode: 'inherit', nativeModel: null });
  assert.deepEqual(resolveLocalModel(null), { mode: 'inherit', nativeModel: null });
  assert.deepEqual(resolveLocalModel(''), { mode: 'inherit', nativeModel: null });
  assert.deepEqual(resolveLocalModel('inherit'), { mode: 'inherit', nativeModel: null });

  const unavail = resolveLocalModel('future-unsupported-model');
  assert.equal(unavail.mode, 'unavailable');
  assert.equal(unavail.code, 'LOCAL_MODEL_UNAVAILABLE');

  const invalidType = resolveLocalModel(12345);
  assert.equal(invalidType.mode, 'unavailable');
  assert.equal(invalidType.code, 'LOCAL_MODEL_UNAVAILABLE');
});

test('configuration: buildVscodeModelMap produces valid audit map schema', () => {
  const map = buildVscodeModelMap();
  assert.equal(map.schema, 'evcrate-vscode-model-map-v1');
  assert.equal(map.mappings.opus.nativeModel, 'claude-3-opus');
  assert.equal(map.mappings.sonnet.nativeModel, 'claude-3.5-sonnet');
  assert.equal(map.mappings.haiku.nativeModel, 'claude-3.5-haiku');
  assert.equal(map.mappings.inherit.nativeModel, null);
  assert.ok(map.unsupported.skillModelPins);
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
