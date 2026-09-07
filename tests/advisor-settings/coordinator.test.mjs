import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  createAdvisorSettingsCoordinator, createAdvisorSettingsRequest, readAdvisorPolicy
} from '../../dist/index.js';
import { createPhase6Fixture, closePhase6Fixture } from '../resource-fixture.mjs';

const POLICY = Object.freeze({
  version: 2,
  advisor: {
    primary: { backend: 'codex', model: 'gpt-5.6-sol', effort: 'high' },
    backup: { backend: 'omp', model: 'openai-codex/gpt-5.6-sol', effort: 'high' }
  },
  wait: { mode: 'until_terminal', warn_after_ms: 120000, warn_every_ms: 300000 },
  history: { retention_days: 30, max_bytes: 104857600 }
});

function settingsContext(fixture) {
  return fixture.context({ projectId: 'project-1' });
}
function destination(context) {
  return join(context.homeRoot, '.evcrate', 'advisor-routing.json');
}
function request(id, operation, payload) {
  return createAdvisorSettingsRequest(id, operation, payload);
}

test('advisor settings coordinator creates whole policy with independent CAS', () => {
  const fixture = createPhase6Fixture('evcrate-settings-');
  try {
    const context = settingsContext(fixture);
    let clock = 1_700_000_000_000;
    const coordinator = createAdvisorSettingsCoordinator({ now: () => clock });
    const absent = coordinator.handle(request('settings-get-1', 'get'), context);
    assert.equal(absent.status, 'OK');
    assert.equal(absent.policy, null);
    assert.deepEqual(absent.revision, { kind: 'absent', identity: 'absent' });

    const preview = coordinator.handle(request('settings-preview-1', 'preview', {
      policy: POLICY,
      currentRevision: absent.revision,
      destination: destination(context),
      mode: { kind: 'create', mode: 0o600 }
    }), context);
    assert.equal(preview.status, 'PREVIEW');
    assert.equal(preview.currentRevision.kind, 'absent');
    assert.equal(preview.mode.kind, 'create');
    assert.match(preview.intendedDigest, /^[a-f0-9]{64}$/u);

    const applied = coordinator.handle(request('settings-apply-1', 'apply', {
      token: preview.token, currentRevision: preview.currentRevision
    }), context);
    assert.equal(applied.status, 'APPLIED');
    assert.equal(applied.recovery.kind, 'none');
    const file = readAdvisorPolicy(destination(context));
    assert.deepEqual(file.policy, POLICY);
    assert.equal(Number(lstatSync(destination(context)).mode) & 0o777, 0o600);
    assert.equal(JSON.parse(readFileSync(destination(context), 'utf8')).advisor.primary.backend, 'codex');

    const replay = coordinator.handle(request('settings-replay-1', 'apply', {
      token: preview.token, currentRevision: preview.currentRevision
    }), context);
    assert.equal(replay.status, 'CONFLICT');
    assert.equal(replay.error.code, 'CAS_CONFLICT');
    assert.deepEqual(replay.expectedRevision, preview.currentRevision);
    assert.equal(replay.actualRevision.kind, 'present');

    const staleRevision = file.revision;
    writeFileSync(destination(context), JSON.stringify({
      ...POLICY,
      advisor: {
        ...POLICY.advisor,
        primary: { ...POLICY.advisor.primary, model: 'manually-edited' }
      }
    }));
    chmodSync(destination(context), 0o600);
    const edited = coordinator.handle(request('settings-get-2', 'get'), context);
    assert.equal(edited.policy.advisor.primary.model, 'manually-edited');
    const stalePreview = coordinator.handle(request('settings-preview-stale', 'preview', {
      policy: POLICY, currentRevision: staleRevision,
      destination: destination(context), mode: { kind: 'existing', mode: 0o600 }
    }), context);
    assert.equal(stalePreview.status, 'FAILED');
    assert.equal(stalePreview.error.code, 'CAS_CONFLICT');
  } finally {
    closePhase6Fixture(fixture);
  }
});
test('settings preview token survives a failed publication boundary', () => {
  const fixture = createPhase6Fixture('evcrate-settings-retry-');
  try {
    const context = settingsContext(fixture);
    let clock = 1_700_000_000_000;
    const coordinator = createAdvisorSettingsCoordinator({ now: () => clock });
    const initial = coordinator.handle(request('settings-retry-get-1', 'get'), context);
    const created = coordinator.handle(request('settings-retry-preview-1', 'preview', {
      policy: POLICY, currentRevision: initial.revision, destination: destination(context),
      mode: { kind: 'create', mode: 0o600 }
    }), context);
    assert.equal(coordinator.handle(request('settings-retry-apply-1', 'apply', {
      token: created.token, currentRevision: created.currentRevision
    }), context).status, 'APPLIED');
    const current = coordinator.handle(request('settings-retry-get-2', 'get'), context);
    const replacement = {
      ...POLICY,
      advisor: {
        ...POLICY.advisor,
        primary: { ...POLICY.advisor.primary, model: 'replacement' }
      }
    };
    const preview = coordinator.handle(request('settings-retry-preview-2', 'preview', {
      policy: replacement, currentRevision: current.revision, destination: destination(context),
      mode: { kind: 'existing', mode: 0o600 }
    }), context);
    const failing = createAdvisorSettingsCoordinator({
      now: () => clock, applyHooks: { beforePromote: () => { throw new Error('injected boundary'); } }
    });
    const failed = failing.handle(request('settings-retry-apply-2', 'apply', {
      token: preview.token, currentRevision: preview.currentRevision
    }), context);
    assert.equal(failed.status, 'FAILED');
    assert.equal(failed.error.code, 'PUBLICATION_FAILED');
    assert.deepEqual(readAdvisorPolicy(destination(context)).policy, POLICY);
    const retried = coordinator.handle(request('settings-retry-apply-3', 'apply', {
      token: preview.token, currentRevision: preview.currentRevision
    }), context);
    assert.equal(retried.status, 'APPLIED');
    assert.equal(readAdvisorPolicy(destination(context)).policy.advisor.primary.model, 'replacement');
  } finally {
    closePhase6Fixture(fixture);
  }
});


test('advisor settings expiry conflicts before mutation', () => {
  const fixture = createPhase6Fixture('evcrate-settings-expiry-');
  try {
    const context = settingsContext(fixture);
    let clock = 1_700_000_000_000;
    const coordinator = createAdvisorSettingsCoordinator({ now: () => clock });
    const initial = coordinator.handle(request('settings-get-expiry-1', 'get'), context);
    const preview = coordinator.handle(request('settings-preview-expiry-1', 'preview', {
      policy: POLICY,
      currentRevision: initial.revision,
      destination: destination(context),
      mode: { kind: 'create', mode: 0o600 }
    }), context);
    clock = preview.expiresAt;
    const expired = coordinator.handle(request('settings-apply-expiry-1', 'apply', {
      token: preview.token, currentRevision: preview.currentRevision
    }), context);
    assert.equal(expired.status, 'CONFLICT');
    assert.equal(expired.error.code, 'CAS_CONFLICT');
    assert.equal(coordinator.handle(request('settings-get-expiry-2', 'get'), context).policy, null);
  } finally {
    closePhase6Fixture(fixture);
  }
});

test('legacy v1 policy is readable via get with migration_required but cannot be previewed', () => {
  const fixture = createPhase6Fixture('evcrate-settings-legacy-');
  try {
    const context = settingsContext(fixture);
    const dest = destination(context);
    mkdirSync(join(context.homeRoot, '.evcrate'), { recursive: true, mode: 0o700 });
    writeFileSync(dest, JSON.stringify({
      version: 1,
      advisor: { backend: 'codex', model: 'gpt-5.6-sol', effort: 'high', timeout_ms: 60000 }
    }));
    chmodSync(dest, 0o600);
    const coordinator = createAdvisorSettingsCoordinator();
    const result = coordinator.handle(request('settings-legacy-get', 'get'), context);
    assert.equal(result.status, 'OK');
    assert.equal(result.policy.version, 1);
    assert.equal(result.policy.migration_required, true);
    assert.equal(result.policy.advisor.backend, 'codex');
    assert.throws(() => request('settings-legacy-preview', 'preview', {
      policy: {
        version: 1,
        advisor: { backend: 'codex', model: 'gpt-5.6-sol', effort: 'high', timeout_ms: 60000 }
      },
      currentRevision: result.revision,
      destination: destination(context),
      mode: { kind: 'existing', mode: 0o600 }
    }), (error) => error.code === 'SETTINGS_INVALID');
  } finally {
    closePhase6Fixture(fixture);
  }
});

test('migrates legacy v1 policy to v2 preserving CAS revision and applying new policy', () => {
  const fixture = createPhase6Fixture('evcrate-settings-migrate-');
  try {
    const context = settingsContext(fixture);
    const dest = destination(context);
    mkdirSync(join(context.homeRoot, '.evcrate'), { recursive: true, mode: 0o700 });
    writeFileSync(dest, JSON.stringify({
      version: 1,
      advisor: { backend: 'codex', model: 'gpt-5.6-sol', effort: 'high', timeout_ms: 60000 }
    }));
    chmodSync(dest, 0o600);
    const coordinator = createAdvisorSettingsCoordinator();
    const legacyGet = coordinator.handle(request('settings-migrate-get-1', 'get'), context);
    assert.equal(legacyGet.status, 'OK');
    assert.equal(legacyGet.policy.version, 1);
    assert.equal(legacyGet.policy.migration_required, true);

    const preview = coordinator.handle(request('settings-migrate-preview-1', 'preview', {
      policy: POLICY,
      currentRevision: legacyGet.revision,
      destination: dest,
      mode: { kind: 'existing', mode: 0o600 }
    }), context);
    assert.equal(preview.status, 'PREVIEW');
    assert.deepEqual(preview.currentRevision, legacyGet.revision);

    const apply = coordinator.handle(request('settings-migrate-apply-1', 'apply', {
      token: preview.token,
      currentRevision: preview.currentRevision
    }), context);
    assert.equal(apply.status, 'APPLIED');

    const postGet = coordinator.handle(request('settings-migrate-get-2', 'get'), context);
    assert.equal(postGet.status, 'OK');
    assert.equal(postGet.policy.version, 2);
    assert.deepEqual(postGet.policy, POLICY);
  } finally {
    closePhase6Fixture(fixture);
  }
});

test('stale v1 preview token fails on apply with CAS_CONFLICT', () => {
  const fixture = createPhase6Fixture('evcrate-settings-stale-');
  try {
    const context = settingsContext(fixture);
    const dest = destination(context);
    mkdirSync(join(context.homeRoot, '.evcrate'), { recursive: true, mode: 0o700 });
    writeFileSync(dest, JSON.stringify({
      version: 1,
      advisor: { backend: 'codex', model: 'gpt-5.6-sol', effort: 'high', timeout_ms: 60000 }
    }));
    chmodSync(dest, 0o600);
    const coordinator = createAdvisorSettingsCoordinator();
    const legacyGet = coordinator.handle(request('settings-stale-token-get', 'get'), context);

    const previewsDir = join(context.stateRoot, 'advisor-settings-previews');
    mkdirSync(previewsDir, { recursive: true, mode: 0o700 });
    const token = 'stale-v1-token-1234567890abcdef1234567890abcdef';
    const tokenPath = join(previewsDir, `${token}.json`);
    writeFileSync(tokenPath, JSON.stringify({
      schema_version: 1,
      operation: 'advisor-settings.preview',
      token,
      destination: dest,
      policy: {
        version: 1,
        advisor: { backend: 'codex', model: 'gpt-5.6-sol', effort: 'high', timeout_ms: 60000 }
      },
      current_revision: legacyGet.revision,
      mode: { kind: 'existing', mode: 0o600 },
      expires_at: Date.now() + 600_000,
      intended_digest: '0'.repeat(64)
    }));
    chmodSync(tokenPath, 0o600);

    const applied = coordinator.handle(request('settings-stale-token-apply', 'apply', {
      token,
      currentRevision: legacyGet.revision
    }), context);
    assert.equal(applied.status, 'FAILED');
    assert.equal(applied.error.code, 'CAS_CONFLICT');
  } finally {
    closePhase6Fixture(fixture);
  }
});
