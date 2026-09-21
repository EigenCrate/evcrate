/**
 * @file advisor-plugin-data-api.test.mjs
 * Unit tests for EVCrate Advisor Plugin Domain Data API v1.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DATA_API_PROTOCOL_V1,
  DATA_API_VERSION_V1,
  ADVISOR_DATA_METHODS,
  PLUGIN_ERROR_CODES,
  MAX_PAGE_LIMIT,
  MAX_OPAQUE_ID_BYTES,
  MAX_CURSOR_BYTES,
  PluginDataApiError,
  validateHistoryRefreshParams,
  validateHistoryRefreshResult,
  validateHistorySummaryParams,
  validateHistorySummaryResult,
  validateHistoryPageParams,
  validateHistoryPageResult,
  validateHistoryDetailParams,
  validateHistoryDetailResult,
  validatePolicyReadCurrentParams,
  validatePolicyReadCurrentResult,
  validateEvaluationsListParams,
  validateEvaluationsListResult,
  validateEvaluationsReadParams,
  validateEvaluationsReadResult,
  validateEvaluationsCompareParams,
  validateEvaluationsCompareResult,
  validateHistoryRowV1,
  validateEvaluationDescriptorV1,
} from '../../dist/protocol/advisor-plugin-data-api.js';
import { buildDataApiSchema, buildManifest } from '../../scripts/generate-advisor-plugin-data-schema.mjs';

const positiveFixtures = JSON.parse(
  readFileSync(new URL('../fixtures/advisor-plugin/domain-v1/positive-wire-fixtures.json', import.meta.url), 'utf8')
);

const negativeFixtures = JSON.parse(
  readFileSync(new URL('../fixtures/advisor-plugin/domain-v1/negative-wire-fixtures.json', import.meta.url), 'utf8')
);

test('Domain protocol constants and error codes', () => {
  assert.equal(DATA_API_PROTOCOL_V1, 'evcrate-advisor-data');
  assert.equal(DATA_API_VERSION_V1, 1);
  assert.equal(ADVISOR_DATA_METHODS.length, 8);
  assert.ok(ADVISOR_DATA_METHODS.includes('history.refresh'));
  assert.ok(ADVISOR_DATA_METHODS.includes('history.summary'));
  assert.ok(ADVISOR_DATA_METHODS.includes('history.page'));
  assert.ok(ADVISOR_DATA_METHODS.includes('history.detail'));
  assert.ok(ADVISOR_DATA_METHODS.includes('policy.readCurrent'));
  assert.ok(ADVISOR_DATA_METHODS.includes('evaluations.list'));
  assert.ok(ADVISOR_DATA_METHODS.includes('evaluations.read'));
  assert.ok(ADVISOR_DATA_METHODS.includes('evaluations.compare'));

  assert.ok(PLUGIN_ERROR_CODES.includes('INVALID_INPUT'));
  assert.ok(PLUGIN_ERROR_CODES.includes('FORBIDDEN'));
  assert.ok(PLUGIN_ERROR_CODES.includes('UNAUTHORIZED'));
  assert.ok(PLUGIN_ERROR_CODES.includes('SNAPSHOT_EXPIRED'));
  assert.ok(PLUGIN_ERROR_CODES.includes('DETAIL_CHANGED'));
  assert.ok(PLUGIN_ERROR_CODES.includes('DETAIL_MISSING'));
});

test('Positive wire fixtures pass validation for all 8 operations', () => {
  const ops = positiveFixtures.operations;

  // 1. history.refresh
  const refParams = validateHistoryRefreshParams(ops['history.refresh'].params);
  assert.deepEqual(refParams, {});
  const refResult = validateHistoryRefreshResult(ops['history.refresh'].result);
  assert.equal(refResult.state, 'fresh');
  assert.equal(refResult.snapshot_id, 'snap-20260921-0001');

  // 2. history.summary
  const sumParams = validateHistorySummaryParams(ops['history.summary'].params);
  assert.equal(sumParams.snapshot_id, 'snap-20260921-0001');
  const sumResult = validateHistorySummaryResult(ops['history.summary'].result);
  assert.equal(sumResult.state, 'fresh');
  assert.equal(sumResult.metrics.metric_definition_version, 1);

  // 3. history.page
  const pageParams = validateHistoryPageParams(ops['history.page'].params);
  assert.equal(pageParams.limit, 50);
  assert.equal(pageParams.sort, 'started_at_desc');
  const pageResult = validateHistoryPageResult(ops['history.page'].result);
  assert.equal(pageResult.entries.length, 1);
  assert.equal(pageResult.entries[0].record_ref, 'rec-001');

  // 4. history.detail
  const detParams = validateHistoryDetailParams(ops['history.detail'].params);
  assert.equal(detParams.record_ref, 'rec-001');
  const detResult = validateHistoryDetailResult(ops['history.detail'].result);
  assert.equal(detResult.status, 'ready');
  if (detResult.status === 'ready') {
    assert.equal(detResult.detail_revision, 'rev-1');
    assert.equal(detResult.execution.consultation_id, '44444444-4444-4000-8000-000000000001');
    assert.ok(detResult.outcome);
    assert.equal(detResult.outcome.outcome, 'resolved');
  }

  // 5. policy.readCurrent
  const polParams = validatePolicyReadCurrentParams(ops['policy.readCurrent'].params);
  assert.deepEqual(polParams, {});
  const polResult = validatePolicyReadCurrentResult(ops['policy.readCurrent'].result);
  assert.equal(polResult.status, 'ready');
  assert.equal(polResult.scope, 'account');
  assert.equal(polResult.temporal, 'current');
  assert.ok(polResult.policy);
  assert.equal(polResult.policy.version, 2);

  // 6. evaluations.list
  const evlParams = validateEvaluationsListParams(ops['evaluations.list'].params);
  assert.equal(evlParams.limit, 50);
  const evlResult = validateEvaluationsListResult(ops['evaluations.list'].result);
  assert.equal(evlResult.status, 'ready');
  assert.equal(evlResult.items.length, 1);
  assert.equal(evlResult.items[0].evaluation_ref, 'eval-ref-001');

  // 7. evaluations.read
  const evrParams = validateEvaluationsReadParams(ops['evaluations.read'].params);
  assert.equal(evrParams.evaluation_ref, 'eval-ref-001');
  const evrResult = validateEvaluationsReadResult(ops['evaluations.read'].result);
  assert.equal(evrResult.status, 'ready');
  if (evrResult.status === 'ready') {
    assert.equal(evrResult.document.protocol, 'evcrate-advisor-counsel-evaluation');
    assert.equal(evrResult.document.version, 1);
  }

  // 8. evaluations.compare
  const evcParams = validateEvaluationsCompareParams(ops['evaluations.compare'].params);
  assert.equal(evcParams.items.length, 1);
  const evcResult = validateEvaluationsCompareResult(ops['evaluations.compare'].result);
  assert.equal(evcResult.status, 'ready');
  if (evcResult.status === 'ready') {
    assert.equal(evcResult.source_revisions.length, 1);
  }
});

test('Negative wire fixtures reject invalid parameters and results', () => {
  for (const tc of negativeFixtures.cases) {
    let failed = false;
    try {
      if (tc.method === 'history.refresh') {
        if (tc.target === 'params') validateHistoryRefreshParams(tc.payload);
        else validateHistoryRefreshResult(tc.payload);
      } else if (tc.method === 'history.summary') {
        if (tc.target === 'params') validateHistorySummaryParams(tc.payload);
        else validateHistorySummaryResult(tc.payload);
      } else if (tc.method === 'history.page') {
        if (tc.target === 'params') validateHistoryPageParams(tc.payload);
        else validateHistoryPageResult(tc.payload);
      } else if (tc.method === 'history.detail') {
        if (tc.target === 'params') validateHistoryDetailParams(tc.payload);
        else validateHistoryDetailResult(tc.payload);
      } else if (tc.method === 'policy.readCurrent') {
        if (tc.target === 'params') validatePolicyReadCurrentParams(tc.payload);
        else validatePolicyReadCurrentResult(tc.payload);
      } else if (tc.method === 'evaluations.list') {
        if (tc.target === 'params') validateEvaluationsListParams(tc.payload);
        else validateEvaluationsListResult(tc.payload);
      } else if (tc.method === 'evaluations.read') {
        if (tc.target === 'params') validateEvaluationsReadParams(tc.payload);
        else validateEvaluationsReadResult(tc.payload);
      } else if (tc.method === 'evaluations.compare') {
        if (tc.target === 'params') validateEvaluationsCompareParams(tc.payload);
        else validateEvaluationsCompareResult(tc.payload);
      }
    } catch (err) {
      failed = true;
      assert.ok(err instanceof PluginDataApiError, `Expected PluginDataApiError for ${tc.name}, got ${String(err)}`);
      assert.equal(err.code, tc.expected_error);
    }
    assert.ok(failed, `Expected failure for case: ${tc.name}`);
  }
});

test('Discriminated union states in detail, policy, and evaluations', () => {
  // history.detail changed
  const detChanged = validateHistoryDetailResult({
    status: 'changed',
    snapshot_id: 'snap-1',
    record_ref: 'rec-1',
    observed_revision: 'rev-2'
  });
  assert.equal(detChanged.status, 'changed');

  // history.detail missing
  const detMissing = validateHistoryDetailResult({
    status: 'missing',
    snapshot_id: 'snap-1',
    record_ref: 'rec-1',
    observed_revision: null
  });
  assert.equal(detMissing.status, 'missing');

  // policy not_configured
  const polNotConfigured = validatePolicyReadCurrentResult({
    status: 'not_configured',
    scope: 'account',
    temporal: 'current',
    observed_at: 1726900000000,
    revision: 'none'
  });
  assert.equal(polNotConfigured.status, 'not_configured');

  // evaluations.list not_configured
  const evlNotConfigured = validateEvaluationsListResult({
    status: 'not_configured',
    observed_at: 1726900000000,
    binding_revision: 'none',
    items: [],
    next_cursor: null
  });
  assert.equal(evlNotConfigured.status, 'not_configured');

  // evaluations.read changed
  const evrChanged = validateEvaluationsReadResult({
    status: 'changed',
    evaluation_ref: 'eval-1',
    observed_revision: 'rev-new'
  });
  assert.equal(evrChanged.status, 'changed');

  // evaluations.compare missing
  const evcMissing = validateEvaluationsCompareResult({
    status: 'missing',
    evaluation_ref: 'eval-1',
    observed_revision: null
  });
  assert.equal(evcMissing.status, 'missing');
});

test('Schema generator and manifest builder output matches files on disk', () => {
  const schemaOnDisk = readFileSync(
    new URL('../../plugin/contracts/evcrate-advisor-data-v1.schema.json', import.meta.url),
    'utf8'
  );
  const manifestOnDisk = readFileSync(
    new URL('../../plugin/contracts/contract-manifest.json', import.meta.url),
    'utf8'
  );

  const builtSchema = JSON.stringify(buildDataApiSchema(), null, 2) + '\n';
  const builtManifest = JSON.stringify(buildManifest(builtSchema), null, 2) + '\n';

  assert.equal(schemaOnDisk, builtSchema, 'evcrate-advisor-data-v1.schema.json must match built schema');
  assert.equal(manifestOnDisk, builtManifest, 'contract-manifest.json must match built manifest');
});
