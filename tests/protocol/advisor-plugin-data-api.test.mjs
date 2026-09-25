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
  DATA_API_PROTOCOL_V2,
  DATA_API_VERSION_V2,
  MAX_PROJECT_NAME_CHARS,
  MAX_PROJECT_INVENTORY_ENTRIES,
  PROJECT_METADATA_SIDECAR_VERSION_V1,
  validateProjectDisplayName,
  validateProjectMetadataSidecarV1,
  validateProjectInventoryItemV2,
  validateProjectInventoryV2,
  validateHistoryRefreshParamsV2,
  validateHistoryRefreshResultV2,
  validateHistorySummaryParamsV2,
  validateHistorySummaryResultV2,
  validateHistorySummaryQueryV2,
  validateHistoryPageParamsV2,
  validateHistoryPageResultV2,
  validateHistoryDetailParamsV2,
  validateHistoryDetailResultV2,
  validatePolicyReadCurrentParamsV2,
  validatePolicyReadCurrentResultV2,
  validateEvaluationsListParamsV2,
  validateEvaluationsListResultV2,
  validateEvaluationsReadParamsV2,
  validateEvaluationsReadResultV2,
  validateEvaluationsCompareParamsV2,
  validateEvaluationsCompareResultV2,
} from '../../dist/protocol/advisor-plugin-data-api.js';
import { buildDataApiSchema, buildDataApiSchemaV1, buildDataApiSchemaV2, buildManifest } from '../../scripts/generate-advisor-plugin-data-schema.mjs';

const positiveFixtures = JSON.parse(
  readFileSync(new URL('../fixtures/advisor-plugin/domain-v1/positive-wire-fixtures.json', import.meta.url), 'utf8')
);

const negativeFixtures = JSON.parse(
  readFileSync(new URL('../fixtures/advisor-plugin/domain-v1/negative-wire-fixtures.json', import.meta.url), 'utf8')
);

const positiveFixturesV2 = JSON.parse(
  readFileSync(new URL('../fixtures/advisor-plugin/domain-v2/positive-wire-fixtures.json', import.meta.url), 'utf8')
);

const negativeFixturesV2 = JSON.parse(
  readFileSync(new URL('../fixtures/advisor-plugin/domain-v2/negative-wire-fixtures.json', import.meta.url), 'utf8')
);

const sidecarFixtures = JSON.parse(
  readFileSync(new URL('../fixtures/advisor-plugin/domain-v2/project-sidecar-fixtures.json', import.meta.url), 'utf8')
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
  const schemaV1OnDisk = readFileSync(
    new URL('../../plugin/contracts/evcrate-advisor-data-v1.schema.json', import.meta.url),
    'utf8'
  );
  const schemaV2OnDisk = readFileSync(
    new URL('../../plugin/contracts/evcrate-advisor-data-v2.schema.json', import.meta.url),
    'utf8'
  );
  const manifestOnDisk = readFileSync(
    new URL('../../plugin/contracts/contract-manifest.json', import.meta.url),
    'utf8'
  );

  const builtSchemaV1 = JSON.stringify(buildDataApiSchemaV1(), null, 2) + '\n';
  const builtSchemaV2 = JSON.stringify(buildDataApiSchemaV2(), null, 2) + '\n';
  const builtManifest = JSON.stringify(buildManifest(builtSchemaV2, builtSchemaV1), null, 2) + '\n';

  assert.equal(schemaV1OnDisk, builtSchemaV1, 'evcrate-advisor-data-v1.schema.json must match built schema v1');
  assert.equal(schemaV2OnDisk, builtSchemaV2, 'evcrate-advisor-data-v2.schema.json must match built schema v2');
  assert.equal(manifestOnDisk, builtManifest, 'contract-manifest.json must match built manifest');
});

test('Domain protocol v2 constants, limits, and defaults', () => {
  assert.equal(DATA_API_PROTOCOL_V2, 'evcrate-advisor-data');
  assert.equal(DATA_API_VERSION_V2, 2);
  assert.equal(MAX_PROJECT_NAME_CHARS, 64);
  assert.equal(MAX_PROJECT_INVENTORY_ENTRIES, 500);
  assert.equal(PROJECT_METADATA_SIDECAR_VERSION_V1, 1);
});

test('Positive wire fixtures v2 pass validation for all 8 operations', () => {
  const ops = positiveFixturesV2.operations;

  // 1. history.refresh v2
  const refParams = validateHistoryRefreshParamsV2(ops['history.refresh'].params);
  assert.deepEqual(refParams, {});
  const refRes = validateHistoryRefreshResultV2(ops['history.refresh'].result);
  assert.equal(refRes.state, 'fresh');
  assert.ok(refRes.inventory);
  assert.equal(refRes.inventory.total_projects, 2);
  assert.equal(refRes.inventory.entries[0].label, 'evcrate');

  // 2. history.summary v2
  const sumParams = validateHistorySummaryParamsV2(ops['history.summary'].params);
  assert.equal(sumParams.query.project_id, '78be05fd4e2291fb9eb0b5f9e1cf560bc8e14f7d78406d29a5d86f878ceb69f8');
  const sumRes = validateHistorySummaryResultV2(ops['history.summary'].result);
  assert.equal(sumRes.state, 'fresh');
  assert.equal(sumRes.inventory.total_projects, 2);

  // 3. history.page v2
  const pageParams = validateHistoryPageParamsV2(ops['history.page'].params);
  assert.equal(pageParams.query.project_id, null, 'project_id null selects All Projects in root context');
  const pageRes = validateHistoryPageResultV2(ops['history.page'].result);
  assert.equal(pageRes.entries.length, 1);

  // 4. history.detail v2
  const detParams = validateHistoryDetailParamsV2(ops['history.detail'].params);
  assert.equal(detParams.record_ref, 'rec-001');
  const detRes = validateHistoryDetailResultV2(ops['history.detail'].result);
  assert.equal(detRes.status, 'ready');

  // 5. policy.readCurrent v2
  const polParams = validatePolicyReadCurrentParamsV2(ops['policy.readCurrent'].params);
  assert.deepEqual(polParams, {});
  const polRes = validatePolicyReadCurrentResultV2(ops['policy.readCurrent'].result);
  assert.equal(polRes.status, 'ready');

  // 6. evaluations.list v2
  const evlParams = validateEvaluationsListParamsV2(ops['evaluations.list'].params);
  assert.equal(evlParams.limit, 50);
  const evlRes = validateEvaluationsListResultV2(ops['evaluations.list'].result);
  assert.equal(evlRes.items.length, 1);

  // 7. evaluations.read v2
  const evrParams = validateEvaluationsReadParamsV2(ops['evaluations.read'].params);
  assert.equal(evrParams.evaluation_ref, 'eval-ref-001');
  const evrRes = validateEvaluationsReadResultV2(ops['evaluations.read'].result);
  assert.equal(evrRes.status, 'ready');

  // 8. evaluations.compare v2
  const evcParams = validateEvaluationsCompareParamsV2(ops['evaluations.compare'].params);
  assert.equal(evcParams.items.length, 1);
  const evcRes = validateEvaluationsCompareResultV2(ops['evaluations.compare'].result);
  assert.equal(evcRes.status, 'ready');
});

test('Negative wire fixtures v2 reject invalid query and inventory parameters', () => {
  for (const c of negativeFixturesV2.cases) {
    assert.throws(
      () => {
        if (c.method === 'history.summary' && c.target === 'params') {
          validateHistorySummaryParamsV2(c.payload);
        } else if (c.method === 'history.summary' && c.target === 'result') {
          validateHistorySummaryResultV2(c.payload);
        } else if (c.method === 'history.page' && c.target === 'params') {
          validateHistoryPageParamsV2(c.payload);
        }
      },
      (err) => {
        assert.ok(err instanceof PluginDataApiError, `Case "${c.name}" should throw PluginDataApiError`);
        assert.equal(err.code, c.expected_error, `Case "${c.name}" should have code ${c.expected_error}`);
        return true;
      },
      `Expected case "${c.name}" to fail validation`
    );
  }
});

test('Project metadata sidecar fixtures and display name sanitization', () => {
  // Positive sidecar cases
  for (const pos of sidecarFixtures.positive) {
    const validated = validateProjectMetadataSidecarV1(pos.sidecar);
    assert.equal(validated.version, 1, `Case "${pos.name}" should have version 1`);
    assert.ok(typeof validated.projects === 'object');
  }

  // Negative sidecar cases
  for (const neg of sidecarFixtures.negative) {
    assert.throws(
      () => validateProjectMetadataSidecarV1(neg.sidecar),
      (err) => {
        assert.ok(err instanceof PluginDataApiError, `Case "${neg.name}" should throw PluginDataApiError`);
        assert.equal(err.code, neg.expected_error);
        return true;
      },
      `Expected sidecar case "${neg.name}" to fail validation`
    );
  }

  // Direct display name sanitization checks
  assert.equal(validateProjectDisplayName('my-project'), 'my-project');
  assert.equal(validateProjectDisplayName('Evcrate (Core)'), 'Evcrate (Core)');
  assert.throws(() => validateProjectDisplayName(' leading'), { name: 'PluginDataApiError' });
  assert.throws(() => validateProjectDisplayName('trailing '), { name: 'PluginDataApiError' });
  assert.throws(() => validateProjectDisplayName('has/slash'), { name: 'PluginDataApiError' });
  assert.throws(() => validateProjectDisplayName('has\\backslash'), { name: 'PluginDataApiError' });
  assert.throws(() => validateProjectDisplayName('~/home'), { name: 'PluginDataApiError' });
  assert.throws(() => validateProjectDisplayName('a'.repeat(65)), { name: 'PluginDataApiError' });
  assert.throws(() => validateProjectDisplayName(''), { name: 'PluginDataApiError' });
});

test('All Projects root query vs specific project query in summary and page', () => {
  // All projects query (project_id: null)
  const allProjectsQuery = validateHistorySummaryQueryV2({
    project_id: null,
    task_run_id: null,
    filters: {}
  });
  assert.equal(allProjectsQuery.project_id, null);

  // Specific project query
  const singleProjectQuery = validateHistorySummaryQueryV2({
    project_id: '78be05fd4e2291fb9eb0b5f9e1cf560bc8e14f7d78406d29a5d86f878ceb69f8',
    task_run_id: null,
    filters: {}
  });
  assert.equal(singleProjectQuery.project_id, '78be05fd4e2291fb9eb0b5f9e1cf560bc8e14f7d78406d29a5d86f878ceb69f8');
});
