import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, lstatSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  createAdvisorSettingsCoordinator, createAdvisorSettingsRequest, readAdvisorPolicy
} from '../../dist/index.js';
import { createPhase6Fixture, closePhase6Fixture } from '../phase6-fixture.mjs';

const POLICY = Object.freeze({
  version: 1,
  advisor: { backend: 'codex', model: 'gpt-5.6-sol', effort: 'high', timeout_ms: 60000 }
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
    assert.equal(JSON.parse(readFileSync(destination(context), 'utf8')).advisor.backend, 'codex');

    const replay = coordinator.handle(request('settings-replay-1', 'apply', {
      token: preview.token, currentRevision: preview.currentRevision
    }), context);
    assert.equal(replay.status, 'CONFLICT');
    assert.equal(replay.error.code, 'CAS_CONFLICT');
    assert.deepEqual(replay.expectedRevision, preview.currentRevision);
    assert.equal(replay.actualRevision.kind, 'present');

    const staleRevision = file.revision;
    writeFileSync(destination(context), JSON.stringify({
      version: 1,
      advisor: { ...POLICY.advisor, model: 'manually-edited' }
    }));
    chmodSync(destination(context), 0o600);
    const edited = coordinator.handle(request('settings-get-2', 'get'), context);
    assert.equal(edited.policy.advisor.model, 'manually-edited');
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
    const replacement = { version: 1, advisor: { ...POLICY.advisor, model: 'replacement' } };
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
    assert.equal(readAdvisorPolicy(destination(context)).policy.advisor.model, 'replacement');
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
