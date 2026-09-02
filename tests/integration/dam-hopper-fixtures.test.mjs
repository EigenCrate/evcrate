import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  validateDiagnosticResult,
  validateResourceResult
} from '../../dist/protocol/index.js';
import { detectCounselFields } from './dam-hopper-errors.mjs';

const fixturesDir = new URL('../fixtures/dam-hopper-v1', import.meta.url).pathname;

function readFixture(name) {
  return JSON.parse(readFileSync(join(fixturesDir, name), 'utf8'));
}

test('dam-hopper discovery fixture matches protocol v1 schema', () => {
  const { response } = readFixture('discovery.json');
  assert.doesNotThrow(() => validateResourceResult(response));
  assert.equal(response.protocol, 'evcrate-resource-control');
  assert.equal(response.status, 'ok');
  assert.equal(detectCounselFields(response), false);
});

test('dam-hopper import preview and apply fixtures match protocol v1 schema', () => {
  const preview = readFixture('import-preview.json').response;
  const apply = readFixture('import-apply.json').response;
  assert.doesNotThrow(() => validateResourceResult(preview));
  assert.doesNotThrow(() => validateResourceResult(apply));
  assert.equal(preview.status, 'preview');
  assert.equal(apply.status, 'applied');
  assert.equal(detectCounselFields(preview), false);
  assert.equal(detectCounselFields(apply), false);
});

test('dam-hopper scope mutation and publish fixtures match protocol v1 schema', () => {
  const scope = readFixture('scope-mutation.json').response;
  const publish = readFixture('publish-apply.json').response;
  assert.doesNotThrow(() => validateResourceResult(scope));
  assert.doesNotThrow(() => validateResourceResult(publish));
  assert.equal(scope.status, 'applied');
  assert.equal(publish.status, 'published');
  assert.equal(detectCounselFields(scope), false);
  assert.equal(detectCounselFields(publish), false);
});

test('dam-hopper health qualification fixture matches diagnostic v1 schema', () => {
  const { response } = readFixture('health-qualification.json');
  assert.doesNotThrow(() => validateDiagnosticResult(response));
  assert.equal(response.protocol, 'evcrate-advisor-diagnostic');
  assert.equal(response.status, 'QUALIFIED');
  assert.equal(detectCounselFields(response), false);
});

test('dam-hopper conflict and error fixtures match protocol schema', () => {
  const { casConflict, validationError } = readFixture('conflict-and-errors.json');
  assert.doesNotThrow(() => validateResourceResult(casConflict));
  assert.doesNotThrow(() => validateResourceResult(validationError));
  assert.equal(casConflict.status, 'conflict');
  assert.equal(validationError.status, 'error');
  assert.equal(casConflict.conflict.retryable, true);
});

test('dam-hopper negative proxy fixtures trigger counsel detection', () => {
  const { counselPayloadInResourceRequest, counselPayloadInHealthRequest } = readFixture('negative-proxy.json');
  assert.equal(detectCounselFields(counselPayloadInResourceRequest), true);
  assert.equal(detectCounselFields(counselPayloadInHealthRequest), true);
});
