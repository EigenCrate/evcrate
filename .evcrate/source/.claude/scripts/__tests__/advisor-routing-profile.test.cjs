'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const profile = require('../advisor-routing/profile.cjs');
const { BUILTIN_CAPABILITIES, resolveRoute } = require('../advisor-routing/resolve-route.cjs');
const dispatcher = require('../advisor-dispatch.cjs');
const { serializeRoutingError } = require('../advisor-routing/errors.cjs');

const HOSTS = profile.HOSTS;

function withHome(home, callback) {
  const original = os.homedir;
  os.homedir = () => home;
  try { return callback(); } finally { os.homedir = original; }
}

function testEnvironment(home) {
  const environment = Object.assign({}, globalThis.process['env']);
  const privateParts = 'KEY TOKEN SECRET PASSWORD AUTH CREDENTIAL COOKIE'.split(' ');
  for (const key of Object.keys(environment)) {
    if (privateParts.some((part) => key.toUpperCase().includes(part))) delete environment[key];
  }
  if (home) environment.HOME = home;
  return environment;
}

function fixtureHome() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'evcrate-advisor-routing-'));
  const home = path.join(root, 'home');
  fs.mkdirSync(home, { mode: 0o700 });
  fs.chmodSync(home, 0o700);
  return { root, home, directory: path.join(home, '.evcrate'), policy: path.join(home, '.evcrate', 'advisor-routing.json') };
}

function cleanup(fixture) {
  fs.rmSync(fixture.root, { recursive: true, force: true });
}

function writePolicy(fixture, value, mode = 0o600) {
  fs.mkdirSync(fixture.directory, { recursive: true, mode: 0o700 });
  fs.chmodSync(fixture.directory, 0o700);
  const content = Buffer.isBuffer(value) || typeof value === 'string' ? value : JSON.stringify(value);
  fs.writeFileSync(fixture.policy, content);
  fs.chmodSync(fixture.policy, mode);
}

function validEntry(overrides = {}) {
  return { backend: 'codex', model: 'gpt-5.6-sol', effort: 'high', execution: 'auto', ...overrides };
}

function validPolicy(hosts = {}) {
  return { version: 1, hosts: { codex: validEntry(), ...hosts } };
}

function expectCode(callback, code) {
  assert.throws(callback, (error) => error && error.code === code);
}

test('resolves the literal platform-home path and ignores repository policy files', () => {
  const fixture = fixtureHome();
  try {
    const repository = path.join(fixture.root, 'repository');
    fs.mkdirSync(path.join(repository, '.evcrate'), { recursive: true, mode: 0o700 });
    fs.writeFileSync(path.join(repository, '.evcrate', 'advisor-routing.json'), '{}');
    const resolved = withHome(fixture.home, () => profile.resolvePolicyPath());
    assert.equal(resolved, path.join(fixture.home, '.evcrate', 'advisor-routing.json'));
    assert.equal(withHome(fixture.home, () => profile.loadGlobalPolicy()).present, false);
  } finally {
    cleanup(fixture);
  }
});

test('missing policy and missing active-host entry select independent built-in defaults', () => {
  const fixture = fixtureHome();
  try {
    const missing = withHome(fixture.home, () => profile.loadGlobalPolicy());
    assert.equal(missing.source, 'builtin');
    for (const host of HOSTS) {
      if (host === 'gemini') {
        expectCode(() => resolveRoute({ activeHost: host, policy: missing.policy }), 'EFFORT_UNSUPPORTED');
        continue;
      }
      const descriptor = resolveRoute({ activeHost: host, policy: missing.policy });
      assert.equal(descriptor.activeHost, host);
      assert.equal(descriptor.source, 'builtin');
      assert.equal(descriptor.action, 'native');
      assert.equal(descriptor.route.backend, host);
      assert.ok(descriptor.route.model);
      assert.ok(descriptor.route.effort);
      assert.ok(Object.isFrozen(descriptor));
      assert.ok(Object.isFrozen(descriptor.route));
      assert.ok(Object.isFrozen(descriptor.nativeCapability));
    }
    assert.ok(Object.isFrozen(BUILTIN_CAPABILITIES));

    writePolicy(fixture, validPolicy({ claude: {
      backend: 'claude', model: 'opus', effort: 'high', execution: 'auto'
    } }));
    const loaded = withHome(fixture.home, () => profile.loadGlobalPolicy());
    const configured = resolveRoute({ activeHost: 'claude', policy: loaded.policy });
    assert.equal(configured.source, 'global');
    assert.equal(configured.action, 'native');
    assert.equal(configured.route.model, 'opus');
    expectCode(() => resolveRoute({ activeHost: 'gemini', policy: loaded.policy }), 'EFFORT_UNSUPPORTED');
  } finally {
    cleanup(fixture);
  }
});

test('global entries are complete and never merge with defaults or other hosts', () => {
  const fixture = fixtureHome();
  try {
    writePolicy(fixture, validPolicy({
      codex: { backend: 'claude', model: 'opus', effort: 'high', execution: 'auto' }
    }));
    const loaded = withHome(fixture.home, () => profile.loadGlobalPolicy());
    const route = resolveRoute({ activeHost: 'codex', policy: loaded.policy });
    assert.deepEqual(route.route, {
      backend: 'claude', model: 'opus', effort: 'high', execution: 'auto'
    });
    assert.equal(route.action, 'external');
    assert.equal(route.adapter, 'claude');

    writePolicy(fixture, validPolicy({ codex: { backend: 'codex', model: 'gpt-5.6-sol', execution: 'auto' } }));
    expectCode(() => withHome(fixture.home, () => profile.loadGlobalPolicy()), 'ROUTE_SCHEMA_INVALID');
  } finally {
    cleanup(fixture);
  }
});

test('validates root, host, entry, credential, array, version, and value boundaries', () => {
  const fixture = fixtureHome();
  try {
    const invalidValues = [
      [{ version: 2, hosts: {} }, 'ROUTE_SCHEMA_INVALID'],
      [{ version: 1, hosts: [] }, 'ROUTE_SCHEMA_INVALID'],
      [{ version: 1, hosts: { nope: validEntry() } }, 'HOST_INVALID'],
      [{ version: 1, hosts: { codex: validEntry({ secret: 'x' }) } }, 'ROUTE_CREDENTIAL_FIELD'],
      [{ version: 1, hosts: { codex: validEntry({ model: '' }) } }, 'ROUTE_ENTRY_INVALID'],
      [{ version: 1, hosts: { codex: validEntry({ effort: 'x'.repeat(profile.MAX_EFFORT_BYTES + 1) }) } }, 'ROUTE_ENTRY_INVALID'],
      [{ version: 1, hosts: { codex: validEntry() }, extra: true }, 'ROUTE_SCHEMA_INVALID']
    ];
    for (const [value, code] of invalidValues) {
      writePolicy(fixture, value);
      expectCode(() => withHome(fixture.home, () => profile.loadGlobalPolicy()), code);
    }

    writePolicy(fixture, `{"version":1,"version":1,"hosts":{}}`);
    expectCode(() => withHome(fixture.home, () => profile.loadGlobalPolicy()), 'ROUTE_DUPLICATE_KEY');

    writePolicy(fixture, 'x'.repeat(profile.MAX_POLICY_BYTES + 1));
    expectCode(() => withHome(fixture.home, () => profile.loadGlobalPolicy()), 'ROUTE_POLICY_OVERSIZED');
  } finally {
    cleanup(fixture);
  }
});

test('rejects unsafe home, parent, symlink, non-regular, and policy permission state', () => {
  const fixture = fixtureHome();
  try {
    expectCode(() => withHome(path.join(fixture.root, 'missing'), () => profile.resolvePolicyPath()), 'HOME_UNAVAILABLE');

    fs.chmodSync(fixture.home, 0o777);
    expectCode(() => withHome(fixture.home, () => profile.resolvePolicyPath()), 'ROUTE_PATH_UNSAFE');
    fs.chmodSync(fixture.home, 0o700);

    writePolicy(fixture, validPolicy());
    fs.chmodSync(fixture.directory, 0o777);
    expectCode(() => withHome(fixture.home, () => profile.loadGlobalPolicy()), 'ROUTE_PATH_UNSAFE');
    fs.chmodSync(fixture.directory, 0o700);
    fs.chmodSync(fixture.policy, 0o644);
    expectCode(() => withHome(fixture.home, () => profile.loadGlobalPolicy()), 'ROUTE_PATH_UNSAFE');
    fs.unlinkSync(fixture.policy);

    const target = path.join(fixture.root, 'target.json');
    fs.writeFileSync(target, JSON.stringify(validPolicy()));
    fs.chmodSync(target, 0o600);
    fs.symlinkSync(target, fixture.policy);
    expectCode(() => withHome(fixture.home, () => profile.loadGlobalPolicy()), 'ROUTE_PATH_UNSAFE');
    fs.unlinkSync(fixture.policy);
    fs.mkdirSync(fixture.policy);
    expectCode(() => withHome(fixture.home, () => profile.loadGlobalPolicy()), 'ROUTE_PATH_UNSAFE');
  } finally {
    cleanup(fixture);
  }
});

test('fails closed when a policy parent realpath changes during resolution', () => {
  const fixture = fixtureHome();
  const originalRealpath = fs.realpathSync.native;
  try {
    writePolicy(fixture, validPolicy());
    let parentChecks = 0;
    fs.realpathSync.native = (file) => {
      const resolved = originalRealpath(file);
      if (file === fixture.directory && ++parentChecks > 1) return `${resolved}-raced`;
      return resolved;
    };
    expectCode(() => withHome(fixture.home, () => profile.loadGlobalPolicy()), 'ROUTE_PATH_UNSAFE');
  } finally {
    fs.realpathSync.native = originalRealpath;
    cleanup(fixture);
  }
});

test('fails closed when the policy grows while it is being read', () => {
  const fixture = fixtureHome();
  const originalFstat = fs.fstatSync;
  let calls = 0;
  try {
    writePolicy(fixture, validPolicy());
    fs.fstatSync = (descriptor) => {
      const stat = originalFstat(descriptor);
      if (++calls === 2) return { ...stat, size: profile.MAX_POLICY_BYTES + 1 };
      return stat;
    };
    expectCode(() => withHome(fixture.home, () => profile.loadGlobalPolicy()), 'ROUTE_POLICY_OVERSIZED');
  } finally {
    fs.fstatSync = originalFstat;
    cleanup(fixture);
  }
});

test('enforces the native/external backend truth table before capability probing', () => {
  const cases = [
    ['codex', validEntry({ execution: 'auto' }), 'native'],
    ['codex', validEntry({ execution: 'native' }), 'native'],
    ['codex', validEntry({ execution: 'external' }), 'ROUTE_EXECUTION_INVALID'],
    ['codex', validEntry({ backend: 'claude', model: 'opus', execution: 'auto' }), 'external'],
    ['codex', validEntry({ backend: 'claude', model: 'opus', execution: 'external' }), 'external'],
    ['codex', validEntry({ backend: 'claude', model: 'opus', execution: 'native' }), 'ROUTE_EXECUTION_INVALID']
  ];
  for (const [activeHost, entry, expected] of cases) {
    if (expected.includes('_')) expectCode(() => resolveRoute({ activeHost, policy: validPolicy({ codex: entry }) }), expected);
    else assert.equal(resolveRoute({ activeHost, policy: validPolicy({ codex: entry }) }).action, expected);
  }
});

test('fails exact native model and effort gaps without substitution or inheritance', () => {
  expectCode(() => resolveRoute({
    activeHost: 'codex',
    policy: validPolicy({ codex: validEntry({ model: 'gpt-unknown' }) })
  }), 'MODEL_UNSUPPORTED');
  expectCode(() => resolveRoute({
    activeHost: 'codex',
    policy: validPolicy({ codex: validEntry({ effort: 'xhigh' }) })
  }), 'EFFORT_UNSUPPORTED');
  expectCode(() => resolveRoute({
    activeHost: 'pi',
    policy: validPolicy({ pi: {
      backend: 'pi', model: 'parent', effort: 'high', execution: 'auto'
    } })
  }), 'MODEL_UNSUPPORTED');
  expectCode(() => resolveRoute({
    activeHost: 'gemini',
    policy: validPolicy({ gemini: {
      backend: 'gemini', model: 'pro', effort: 'high', execution: 'auto'
    } })
  }), 'EFFORT_UNSUPPORTED');
});

test('serializes only stable sanitized error fields', () => {
  const fixture = fixtureHome();
  try {
    writePolicy(fixture, '{"version":1, "hosts": [');
    let caught;
    try { withHome(fixture.home, () => profile.loadGlobalPolicy()); } catch (error) { caught = error; }
    const serialized = serializeRoutingError(caught);
    assert.ok(Object.isFrozen(caught));
    assert.deepEqual(Object.keys(serialized), ['code', 'category', 'action', 'message']);
    assert.equal(serialized.code, 'ROUTE_POLICY_MALFORMED');
    assert.doesNotMatch(JSON.stringify(serialized), new RegExp(fixture.root.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.doesNotMatch(JSON.stringify(serialized), /version|hosts|secret|token/i);
  } finally {
    cleanup(fixture);
  }
});

test('rejects invalid UTF-8 policy bytes and bounds dispatcher stdin before parsing', () => {
  const fixture = fixtureHome();
  try {
    writePolicy(fixture, Buffer.from([0x7b, 0x22, 0x76, 0xc3, 0x7b]));
    expectCode(() => withHome(fixture.home, () => profile.loadGlobalPolicy()), 'ROUTE_POLICY_MALFORMED');
    const child = spawnSync(process.execPath, [path.join(__dirname, '..', 'advisor-dispatch.cjs')], {
      input: Buffer.alloc(dispatcher.MAX_REQUEST_BYTES + 1, 0x20),
      env: testEnvironment(fixture.home),
      encoding: 'utf8'
    });
    assert.equal(child.status, 1);
    assert.equal(JSON.parse(child.stdout).error.code, 'REQUEST_INVALID');
  } finally {
    cleanup(fixture);
  }
});

test('dispatcher accepts only the active host resolve request and returns JSON-safe routing', () => {
  const fixture = fixtureHome();
  try {
    writePolicy(fixture, validPolicy({ codex: {
      backend: 'claude', model: 'opus', effort: 'high', execution: 'external'
    } }));
    const result = withHome(fixture.home, () => dispatcher.dispatchRequest({ activeHost: 'codex' }));
    assert.equal(result.ok, true);
    assert.equal(result.descriptor.action, 'external');
    assert.equal(result.descriptor.adapter, 'claude');
    assert.throws(() => dispatcher.dispatchRequest({ activeHost: 'codex', backend: 'pi' }), /request/i);
    assert.throws(() => dispatcher.dispatchRequest({ activeHost: 'codex', homeDirectory: fixture.home }), /request/i);

    const child = spawnSync(process.execPath, [path.join(__dirname, '..', 'advisor-dispatch.cjs')], {
      input: JSON.stringify({ activeHost: 'codex' }),
      env: testEnvironment(fixture.home),
      encoding: 'utf8'
    });
    assert.equal(child.status, 0);
    assert.equal(JSON.parse(child.stdout).descriptor.action, 'external');
  } finally {
    cleanup(fixture);
  }
});

test('validates the complete built-in capability document before route use', () => {
  assert.deepEqual(BUILTIN_CAPABILITIES.hosts.gemini, {
    backend: 'gemini', model: 'pro', efforts: [], selector: 'model'
  });
  const invalid = JSON.parse(JSON.stringify(BUILTIN_CAPABILITIES));
  delete invalid.hosts.pi;
  expectCode(() => profile.validateCapabilities(invalid), 'NATIVE_CAPABILITY_UNSUPPORTED');
  const invalidGeminiEfforts = JSON.parse(JSON.stringify(BUILTIN_CAPABILITIES));
  invalidGeminiEfforts.hosts.gemini.efforts = ['high'];
  expectCode(() => profile.validateCapabilities(invalidGeminiEfforts), 'NATIVE_CAPABILITY_UNSUPPORTED');
  for (const selector of [[], {}]) {
    const invalidSelector = JSON.parse(JSON.stringify(BUILTIN_CAPABILITIES));
    invalidSelector.hosts.claude.selector = selector;
    expectCode(() => profile.validateCapabilities(invalidSelector), 'NATIVE_CAPABILITY_UNSUPPORTED');
  }
  assert.ok(Object.isFrozen(BUILTIN_CAPABILITIES.hosts.pi));
});

test('normalizes malformed bundled capabilities through the dispatcher contract', () => {
  const fixture = fixtureHome();
  try {
    const runtime = path.join(fixture.root, 'scripts');
    fs.cpSync(path.join(__dirname, '..'), runtime, { recursive: true });
    fs.writeFileSync(
      path.join(runtime, 'advisor-routing/native-capabilities.json'),
      '{"schema":"evcrate-advisor-native-capabilities/v1","schema":"duplicate"}'
    );
    const child = spawnSync(process.execPath, [path.join(runtime, 'advisor-dispatch.cjs')], {
      input: JSON.stringify({ activeHost: 'codex' }),
      env: testEnvironment(fixture.home),
      encoding: 'utf8'
    });
    assert.equal(child.status, 1);
    assert.equal(child.stderr, '');
    assert.equal(JSON.parse(child.stdout).error.code, 'NATIVE_CAPABILITY_UNSUPPORTED');
  } finally {
    cleanup(fixture);
  }
});

test('rejects oversized bundled capabilities before route use', () => {
  const fixture = fixtureHome();
  try {
    const runtime = path.join(fixture.root, 'scripts');
    fs.cpSync(path.join(__dirname, '..'), runtime, { recursive: true });
    const capabilitiesPath = path.join(runtime, 'advisor-routing/native-capabilities.json');
    const capabilities = fs.readFileSync(capabilitiesPath, 'utf8');
    fs.writeFileSync(capabilitiesPath, `${capabilities}${' '.repeat(16 * 1024)}`);
    const child = spawnSync(process.execPath, [path.join(runtime, 'advisor-dispatch.cjs')], {
      input: JSON.stringify({ activeHost: 'codex' }),
      env: testEnvironment(fixture.home),
      encoding: 'utf8'
    });
    assert.equal(child.status, 1);
    assert.equal(child.stderr, '');
    assert.equal(JSON.parse(child.stdout).error.code, 'NATIVE_CAPABILITY_UNSUPPORTED');
  } finally {
    cleanup(fixture);
  }
});
