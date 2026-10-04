import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  resolveVscodeSettingsPaths,
  normalizePluginPathKey,
  detectVscodeRegistration,
  planVscodeSettingsRegistration,
  registerVscodeSettings
} from '../../dist/distribution/vscode-settings.js';
import { decodeJsonc } from '../../dist/distribution/jsonc.js';

test('resolveVscodeSettingsPaths: project scope', () => {
  const paths = resolveVscodeSettingsPaths({
    scope: 'project',
    projectRoot: '/test/workspace'
  });
  assert.equal(paths.settingsPath, '/test/workspace/.vscode/settings.json');
  assert.equal(paths.pluginPath, '/test/workspace/.evcrate-vscode');
  assert.equal(paths.scope, 'project');
});

test('resolveVscodeSettingsPaths: home scope on Linux', () => {
  const paths = resolveVscodeSettingsPaths({
    scope: 'home',
    homeRoot: '/custom/home',
    nativeUserHome: '/home/user',
    platform: 'linux'
  });
  assert.equal(paths.settingsPath, '/home/user/.config/Code/User/settings.json');
  assert.equal(paths.pluginPath, '/custom/home/.evcrate-vscode');
  assert.equal(paths.scope, 'home');
});

test('resolveVscodeSettingsPaths: home scope on macOS', () => {
  const paths = resolveVscodeSettingsPaths({
    scope: 'home',
    homeRoot: '/Users/test',
    nativeUserHome: '/Users/test',
    platform: 'darwin'
  });
  assert.equal(paths.settingsPath, '/Users/test/Library/Application Support/Code/User/settings.json');
  assert.equal(paths.pluginPath, '/Users/test/.evcrate-vscode');
});

test('resolveVscodeSettingsPaths: home scope on Windows', () => {
  const paths = resolveVscodeSettingsPaths({
    scope: 'home',
    homeRoot: 'C:\\Users\\test',
    nativeUserHome: 'C:\\Users\\test',
    env: { APPDATA: 'C:\\Users\\test\\AppData\\Roaming' },
    platform: 'win32'
  });
  assert.equal(paths.settingsPath, 'C:\\Users\\test\\AppData\\Roaming\\Code\\User\\settings.json');
  assert.equal(paths.pluginPath, 'C:\\Users\\test\\.evcrate-vscode');
});
test('resolveVscodeSettingsPaths: errors on invalid paths', () => {
  assert.throws(() => resolveVscodeSettingsPaths({ scope: 'project', projectRoot: 'relative/path' }), (err) => err.code === 'PATH_UNSAFE');
  assert.throws(() => resolveVscodeSettingsPaths({ scope: 'home', platform: 'win32', env: {} }), (err) => err.code === 'CAPABILITY_UNSUPPORTED');
});

test('normalizePluginPathKey handles slashes and platform casing', () => {
  assert.equal(normalizePluginPathKey('/home/user/project/.evcrate-vscode/', 'linux'), '/home/user/project/.evcrate-vscode');
  assert.equal(normalizePluginPathKey('C:\\Users\\User\\project\\.evcrate-vscode\\', 'win32'), 'c:\\users\\user\\project\\.evcrate-vscode');
  assert.equal(normalizePluginPathKey('C:/Users/User/project/.evcrate-vscode', 'win32'), 'c:\\users\\user\\project\\.evcrate-vscode');
});

test('detectVscodeRegistration: absent, enabled, disabled states', () => {
  assert.deepEqual(detectVscodeRegistration(null, '/plugin'), { state: 'absent', originalKey: null });

  const emptyDoc = new TextEncoder().encode('{\n  "editor.tabSize": 2\n}\n');
  assert.deepEqual(detectVscodeRegistration(emptyDoc, '/plugin'), { state: 'absent', originalKey: null });

  const enabledDoc = new TextEncoder().encode('{\n  "chat.pluginLocations": {\n    "/plugin": true\n  }\n}\n');
  assert.deepEqual(detectVscodeRegistration(enabledDoc, '/plugin'), { state: 'enabled', originalKey: '/plugin' });

  const disabledDoc = new TextEncoder().encode('{\n  "chat.pluginLocations": {\n    "/plugin": false\n  }\n}\n');
  assert.deepEqual(detectVscodeRegistration(disabledDoc, '/plugin'), { state: 'disabled', originalKey: '/plugin' });
});

test('detectVscodeRegistration: duplicate equivalent keys throws VALIDATION_INVALID', () => {
  const dupDoc = new TextEncoder().encode('{\n  "chat.pluginLocations": {\n    "/plugin": true,\n    "/plugin/": false\n  }\n}\n');
  assert.throws(() => detectVscodeRegistration(dupDoc, '/plugin', { platform: 'linux' }), (err) => err.code === 'VALIDATION_INVALID');
});
test('planVscodeSettingsRegistration: creates new file if absent', () => {
  const plan = planVscodeSettingsRegistration(null, '/test/.evcrate-vscode');
  assert.equal(plan.action, 'create');
  assert.equal(plan.registration, 'absent');
  const decoded = decodeJsonc(plan.result, 'test').value;
  assert.deepEqual(decoded, {
    'chat.pluginLocations': {
      '/test/.evcrate-vscode': true
    }
  });
});

test('planVscodeSettingsRegistration: noop on already enabled', () => {
  const doc = new TextEncoder().encode('{\n  // comment\n  "chat.pluginLocations": {\n    "/plugin": true\n  }\n}\n');
  const plan = planVscodeSettingsRegistration(doc, '/plugin');
  assert.equal(plan.action, 'noop');
  assert.equal(plan.registration, 'enabled');
  assert.equal(new TextDecoder().decode(plan.result), new TextDecoder().decode(doc));
});

test('planVscodeSettingsRegistration: preserves disabled unless enableDisabled: true', () => {
  const doc = new TextEncoder().encode('{\n  "chat.pluginLocations": {\n    "/plugin": false\n  }\n}\n');
  const planPreserve = planVscodeSettingsRegistration(doc, '/plugin', { enableDisabled: false });
  assert.equal(planPreserve.action, 'noop');
  assert.equal(planPreserve.registration, 'disabled');

  const planEnable = planVscodeSettingsRegistration(doc, '/plugin', { enableDisabled: true });
  assert.equal(planEnable.action, 'update');
  assert.equal(planEnable.registration, 'disabled');
  const decoded = decodeJsonc(planEnable.result, 'test').value;
  assert.equal(decoded['chat.pluginLocations']['/plugin'], true);
});

test('planVscodeSettingsRegistration: surgical insertion preserving comments', () => {
  const doc = new TextEncoder().encode(`{
  // User settings
  "editor.fontSize": 14,
  "chat.pluginLocations": {
    // Other plugin
    "/other/plugin": true
  }
}
`);
  const plan = planVscodeSettingsRegistration(doc, '/new/plugin');
  assert.equal(plan.action, 'update');
  const text = new TextDecoder().decode(plan.result);
  assert.ok(text.includes('// User settings'));
  assert.ok(text.includes('// Other plugin'));
  assert.ok(text.includes('"/new/plugin": true'));

  const decoded = decodeJsonc(plan.result, 'test').value;
  assert.equal(decoded['editor.fontSize'], 14);
  assert.equal(decoded['chat.pluginLocations']['/other/plugin'], true);
  assert.equal(decoded['chat.pluginLocations']['/new/plugin'], true);
});

test('registerVscodeSettings: end-to-end atomic file write', async () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'evcrate-settings-test-'));
  try {
    const settingsPath = join(tempDir, '.vscode', 'settings.json');
    const pluginPath = join(tempDir, '.evcrate-vscode');
    const paths = { settingsPath, pluginPath, scope: 'project' };

    const first = await registerVscodeSettings(paths);
    assert.equal(first.action, 'created');

    const content = readFileSync(settingsPath, 'utf8');
    assert.ok(content.includes('chat.pluginLocations'));
    assert.ok(content.includes(pluginPath));

    const second = await registerVscodeSettings(paths);
    assert.equal(second.action, 'already-enabled');
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});
