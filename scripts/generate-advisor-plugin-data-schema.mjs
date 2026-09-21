#!/usr/bin/env node
/**
 * @file generate-advisor-plugin-data-schema.mjs
 * Deterministic generator and verification script for EVCrate Advisor Plugin Domain Data API schemas.
 *
 * Produces:
 * - plugin/contracts/evcrate-advisor-data-v1.schema.json
 * - plugin/contracts/contract-manifest.json
 *
 * Usage:
 *   node scripts/generate-advisor-plugin-data-schema.mjs [--check]
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const CONTRACTS_DIR = join(ROOT, 'plugin', 'contracts');
const SCHEMA_FILE = join(CONTRACTS_DIR, 'evcrate-advisor-data-v1.schema.json');
const MANIFEST_FILE = join(CONTRACTS_DIR, 'contract-manifest.json');

const UUID_PATTERN = '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
const SHA256_PATTERN = '^[0-9a-f]{64}$';

export function buildDataApiSchema() {
  return {
    $schema: 'http://json-schema.org/draft-07/schema#',
    $id: 'https://evcrate.org/schemas/advisor/plugin/evcrate-advisor-data-v1.schema.json',
    title: 'EVCrate Advisor Plugin Domain Data API',
    description: 'Machine-readable schema for EVCrate Advisor Plugin Domain Data API v1 operations, parameters, and results.',
    type: 'object',
    required: ['protocol', 'version', 'methods'],
    additionalProperties: false,
    properties: {
      protocol: { type: 'string', const: 'evcrate-advisor-data' },
      version: { type: 'integer', const: 1 },
      methods: {
        type: 'object',
        required: [
          'history.refresh',
          'history.summary',
          'history.page',
          'history.detail',
          'policy.readCurrent',
          'evaluations.list',
          'evaluations.read',
          'evaluations.compare'
        ],
        additionalProperties: false,
        properties: {
          'history.refresh': {
            type: 'object',
            required: ['params', 'result'],
            additionalProperties: false,
            properties: {
              params: { $ref: '#/definitions/HistoryRefreshParams' },
              result: { $ref: '#/definitions/HistoryRefreshResult' }
            }
          },
          'history.summary': {
            type: 'object',
            required: ['params', 'result'],
            additionalProperties: false,
            properties: {
              params: { $ref: '#/definitions/HistorySummaryParams' },
              result: { $ref: '#/definitions/HistorySummaryResult' }
            }
          },
          'history.page': {
            type: 'object',
            required: ['params', 'result'],
            additionalProperties: false,
            properties: {
              params: { $ref: '#/definitions/HistoryPageParams' },
              result: { $ref: '#/definitions/HistoryPageResult' }
            }
          },
          'history.detail': {
            type: 'object',
            required: ['params', 'result'],
            additionalProperties: false,
            properties: {
              params: { $ref: '#/definitions/HistoryDetailParams' },
              result: { $ref: '#/definitions/HistoryDetailResult' }
            }
          },
          'policy.readCurrent': {
            type: 'object',
            required: ['params', 'result'],
            additionalProperties: false,
            properties: {
              params: { $ref: '#/definitions/PolicyReadCurrentParams' },
              result: { $ref: '#/definitions/PolicyReadCurrentResult' }
            }
          },
          'evaluations.list': {
            type: 'object',
            required: ['params', 'result'],
            additionalProperties: false,
            properties: {
              params: { $ref: '#/definitions/EvaluationsListParams' },
              result: { $ref: '#/definitions/EvaluationsListResult' }
            }
          },
          'evaluations.read': {
            type: 'object',
            required: ['params', 'result'],
            additionalProperties: false,
            properties: {
              params: { $ref: '#/definitions/EvaluationsReadParams' },
              result: { $ref: '#/definitions/EvaluationsReadResult' }
            }
          },
          'evaluations.compare': {
            type: 'object',
            required: ['params', 'result'],
            additionalProperties: false,
            properties: {
              params: { $ref: '#/definitions/EvaluationsCompareParams' },
              result: { $ref: '#/definitions/EvaluationsCompareResult' }
            }
          }
        }
      }
    },
    definitions: {
      OpaqueId: {
        type: 'string',
        minLength: 1,
        maxLength: 128
      },
      Cursor: {
        type: ['string', 'null'],
        minLength: 1,
        maxLength: 256
      },
      Uuid: {
        type: 'string',
        pattern: UUID_PATTERN
      },
      Sha256: {
        type: 'string',
        pattern: SHA256_PATTERN
      },
      TimestampMs: {
        type: 'integer',
        minimum: 1
      },
      SafeNonNegativeInt: {
        type: 'integer',
        minimum: 0
      },
      HistoryRefreshParams: {
        type: 'object',
        additionalProperties: false
      },
      HistoryRefreshResult: {
        type: 'object',
        required: ['state', 'snapshot_id', 'observed_at', 'scan', 'stale_reason'],
        additionalProperties: false,
        properties: {
          state: { type: 'string', enum: ['fresh', 'stale', 'unavailable'] },
          snapshot_id: {
            oneOf: [
              { $ref: '#/definitions/OpaqueId' },
              { type: 'null' }
            ]
          },
          observed_at: { $ref: '#/definitions/TimestampMs' },
          scan: { $ref: '#/definitions/HistoryMetricScanV1' },
          stale_reason: {
            type: ['string', 'null'],
            enum: ['incomplete', 'cancelled', 'deadline', null]
          }
        }
      },
      HistorySummaryParams: {
        type: 'object',
        required: ['snapshot_id', 'query'],
        additionalProperties: false,
        properties: {
          snapshot_id: { $ref: '#/definitions/OpaqueId' },
          query: {
            type: 'object',
            required: ['task_run_id', 'filters'],
            additionalProperties: false,
            properties: {
              task_run_id: {
                oneOf: [
                  { $ref: '#/definitions/Uuid' },
                  { type: 'null' }
                ]
              },
              filters: { $ref: '#/definitions/HistoryMetricFiltersV1' }
            }
          }
        }
      },
      HistorySummaryResult: {
        type: 'object',
        required: ['state', 'snapshot_id', 'metrics'],
        additionalProperties: false,
        properties: {
          state: { type: 'string', enum: ['fresh', 'stale'] },
          snapshot_id: { $ref: '#/definitions/OpaqueId' },
          metrics: { $ref: '#/definitions/HistoryMetricResultV1' }
        }
      },
      HistoryPageParams: {
        type: 'object',
        required: ['snapshot_id', 'query', 'sort', 'cursor', 'limit'],
        additionalProperties: false,
        properties: {
          snapshot_id: { $ref: '#/definitions/OpaqueId' },
          query: {
            type: 'object',
            required: ['task_run_id', 'filters'],
            additionalProperties: false,
            properties: {
              task_run_id: {
                oneOf: [
                  { $ref: '#/definitions/Uuid' },
                  { type: 'null' }
                ]
              },
              filters: { $ref: '#/definitions/HistoryMetricFiltersV1' }
            }
          },
          sort: { type: 'string', const: 'started_at_desc' },
          cursor: { $ref: '#/definitions/Cursor' },
          limit: { type: 'integer', minimum: 1, maximum: 500 }
        }
      },
      HistoryPageResult: {
        type: 'object',
        required: ['state', 'snapshot_id', 'entries', 'next_cursor', 'returned_bytes'],
        additionalProperties: false,
        properties: {
          state: { type: 'string', enum: ['fresh', 'stale'] },
          snapshot_id: { $ref: '#/definitions/OpaqueId' },
          entries: {
            type: 'array',
            items: { $ref: '#/definitions/HistoryRowV1' },
            maxItems: 500
          },
          next_cursor: { $ref: '#/definitions/Cursor' },
          returned_bytes: { type: 'integer', minimum: 0, maximum: 1048576 }
        }
      },
      HistoryRowV1: {
        type: 'object',
        required: [
          'record_ref', 'project_id', 'task_run_id', 'consultation_id',
          'status', 'route', 'checkpoint_digest', 'prompt_identity',
          'build_identity', 'started_at', 'completed_at', 'receipt_elapsed_ms',
          'outcome_state', 'outcome_result'
        ],
        additionalProperties: false,
        properties: {
          record_ref: { $ref: '#/definitions/OpaqueId' },
          project_id: { $ref: '#/definitions/Sha256' },
          task_run_id: { $ref: '#/definitions/Uuid' },
          consultation_id: { $ref: '#/definitions/Uuid' },
          status: { type: 'string', enum: ['started', 'ADVICE_READY', 'FAILED'] },
          route: { $ref: '#/definitions/AdvisorRouteTarget' },
          checkpoint_digest: { $ref: '#/definitions/Sha256' },
          prompt_identity: { $ref: '#/definitions/OpaqueId' },
          build_identity: { $ref: '#/definitions/OpaqueId' },
          started_at: { $ref: '#/definitions/TimestampMs' },
          completed_at: {
            oneOf: [
              { $ref: '#/definitions/TimestampMs' },
              { type: 'null' }
            ]
          },
          receipt_elapsed_ms: {
            oneOf: [
              { $ref: '#/definitions/SafeNonNegativeInt' },
              { type: 'null' }
            ]
          },
          outcome_state: { type: 'string', enum: ['missing', 'valid', 'invalid'] },
          outcome_result: {
            type: ['string', 'null'],
            enum: ['resolved', 'unresolved', 'regressed', 'unknown', null]
          }
        }
      },
      HistoryDetailParams: {
        type: 'object',
        required: ['snapshot_id', 'record_ref'],
        additionalProperties: false,
        properties: {
          snapshot_id: { $ref: '#/definitions/OpaqueId' },
          record_ref: { $ref: '#/definitions/OpaqueId' }
        }
      },
      HistoryDetailResult: {
        oneOf: [
          {
            type: 'object',
            required: ['status', 'snapshot_id', 'record_ref', 'detail_revision', 'execution', 'outcome'],
            additionalProperties: false,
            properties: {
              status: { type: 'string', const: 'ready' },
              snapshot_id: { $ref: '#/definitions/OpaqueId' },
              record_ref: { $ref: '#/definitions/OpaqueId' },
              detail_revision: { $ref: '#/definitions/OpaqueId' },
              execution: { type: 'object' },
              outcome: {
                oneOf: [
                  { type: 'object' },
                  { type: 'null' }
                ]
              }
            }
          },
          {
            type: 'object',
            required: ['status', 'snapshot_id', 'record_ref', 'observed_revision'],
            additionalProperties: false,
            properties: {
              status: { type: 'string', enum: ['changed', 'missing'] },
              snapshot_id: { $ref: '#/definitions/OpaqueId' },
              record_ref: { $ref: '#/definitions/OpaqueId' },
              observed_revision: {
                oneOf: [
                  { $ref: '#/definitions/OpaqueId' },
                  { type: 'null' }
                ]
              }
            }
          }
        ]
      },
      PolicyReadCurrentParams: {
        type: 'object',
        additionalProperties: false
      },
      PolicyReadCurrentResult: {
        type: 'object',
        required: ['status', 'scope', 'temporal', 'observed_at', 'revision'],
        additionalProperties: false,
        properties: {
          status: { type: 'string', enum: ['ready', 'migration_required', 'unsupported', 'invalid', 'not_configured'] },
          scope: { type: 'string', const: 'account' },
          temporal: { type: 'string', const: 'current' },
          observed_at: { $ref: '#/definitions/TimestampMs' },
          revision: { $ref: '#/definitions/OpaqueId' },
          policy: {
            oneOf: [
              { type: 'object' },
              { type: 'null' }
            ]
          },
          issue_code: {
            oneOf: [
              { $ref: '#/definitions/OpaqueId' },
              { type: 'null' }
            ]
          }
        }
      },
      EvaluationsListParams: {
        type: 'object',
        required: ['cursor', 'limit'],
        additionalProperties: false,
        properties: {
          cursor: { $ref: '#/definitions/Cursor' },
          limit: { type: 'integer', minimum: 1, maximum: 100 }
        }
      },
      EvaluationsListResult: {
        type: 'object',
        required: ['status', 'observed_at', 'binding_revision', 'items', 'next_cursor'],
        additionalProperties: false,
        properties: {
          status: { type: 'string', enum: ['ready', 'not_configured'] },
          observed_at: { $ref: '#/definitions/TimestampMs' },
          binding_revision: { $ref: '#/definitions/OpaqueId' },
          items: {
            type: 'array',
            items: { $ref: '#/definitions/EvaluationDescriptorV1' }
          },
          next_cursor: { $ref: '#/definitions/Cursor' }
        }
      },
      EvaluationDescriptorV1: {
        type: 'object',
        required: [
          'evaluation_ref', 'source_revision', 'source_digest', 'evaluation_id',
          'run_id', 'created_at', 'candidate_count', 'case_count', 'observation_count'
        ],
        additionalProperties: false,
        properties: {
          evaluation_ref: { $ref: '#/definitions/OpaqueId' },
          source_revision: { $ref: '#/definitions/OpaqueId' },
          source_digest: { $ref: '#/definitions/Sha256' },
          evaluation_id: { $ref: '#/definitions/OpaqueId' },
          run_id: { $ref: '#/definitions/OpaqueId' },
          created_at: { $ref: '#/definitions/TimestampMs' },
          candidate_count: { $ref: '#/definitions/SafeNonNegativeInt' },
          case_count: { $ref: '#/definitions/SafeNonNegativeInt' },
          observation_count: { $ref: '#/definitions/SafeNonNegativeInt' }
        }
      },
      EvaluationsReadParams: {
        type: 'object',
        required: ['evaluation_ref', 'expected_revision'],
        additionalProperties: false,
        properties: {
          evaluation_ref: { $ref: '#/definitions/OpaqueId' },
          expected_revision: { $ref: '#/definitions/OpaqueId' }
        }
      },
      EvaluationsReadResult: {
        oneOf: [
          {
            type: 'object',
            required: ['status', 'descriptor', 'document'],
            additionalProperties: false,
            properties: {
              status: { type: 'string', const: 'ready' },
              descriptor: { $ref: '#/definitions/EvaluationDescriptorV1' },
              document: { type: 'object' }
            }
          },
          {
            type: 'object',
            required: ['status', 'evaluation_ref', 'observed_revision'],
            additionalProperties: false,
            properties: {
              status: { type: 'string', enum: ['changed', 'missing'] },
              evaluation_ref: { $ref: '#/definitions/OpaqueId' },
              observed_revision: {
                oneOf: [
                  { $ref: '#/definitions/OpaqueId' },
                  { type: 'null' }
                ]
              }
            }
          }
        ]
      },
      EvaluationsCompareParams: {
        type: 'object',
        required: ['items', 'cursor', 'limit'],
        additionalProperties: false,
        properties: {
          items: {
            type: 'array',
            minItems: 1,
            maxItems: 32,
            items: {
              type: 'object',
              required: ['evaluation_ref', 'expected_revision'],
              additionalProperties: false,
              properties: {
                evaluation_ref: { $ref: '#/definitions/OpaqueId' },
                expected_revision: { $ref: '#/definitions/OpaqueId' }
              }
            }
          },
          cursor: { $ref: '#/definitions/Cursor' },
          limit: { type: 'integer', minimum: 1, maximum: 100 }
        }
      },
      EvaluationsCompareResult: {
        oneOf: [
          {
            type: 'object',
            required: ['status', 'source_revisions', 'groups', 'next_cursor', 'returned_bytes'],
            additionalProperties: false,
            properties: {
              status: { type: 'string', const: 'ready' },
              source_revisions: {
                type: 'array',
                items: {
                  type: 'object',
                  required: ['evaluation_ref', 'observed_revision'],
                  additionalProperties: false,
                  properties: {
                    evaluation_ref: { $ref: '#/definitions/OpaqueId' },
                    observed_revision: { $ref: '#/definitions/OpaqueId' }
                  }
                }
              },
              groups: {
                type: 'array',
                items: { type: 'object' }
              },
              next_cursor: { $ref: '#/definitions/Cursor' },
              returned_bytes: { type: 'integer', minimum: 0, maximum: 1048576 }
            }
          },
          {
            type: 'object',
            required: ['status', 'evaluation_ref', 'observed_revision'],
            additionalProperties: false,
            properties: {
              status: { type: 'string', enum: ['changed', 'missing'] },
              evaluation_ref: { $ref: '#/definitions/OpaqueId' },
              observed_revision: {
                oneOf: [
                  { $ref: '#/definitions/OpaqueId' },
                  { type: 'null' }
                ]
              }
            }
          }
        ]
      },
      AdvisorRouteTarget: {
        type: 'object',
        required: ['backend', 'model', 'effort'],
        additionalProperties: false,
        properties: {
          backend: { type: 'string', enum: ['claude', 'codex', 'antigravity', 'pi', 'omp'] },
          model: { type: 'string' },
          effort: {
            type: ['string', 'null'],
            enum: ['low', 'medium', 'high', 'xhigh', null]
          }
        }
      },
      HistoryMetricFiltersV1: {
        type: 'object',
        required: [
          'statuses', 'outcome_states', 'outcome_results', 'backends',
          'models', 'efforts', 'prompt_identities', 'build_identities',
          'started_at_from', 'started_at_to'
        ],
        additionalProperties: false,
        properties: {
          statuses: {
            type: ['array', 'null'],
            items: { type: 'string', enum: ['started', 'ADVICE_READY', 'FAILED'] }
          },
          outcome_states: {
            type: ['array', 'null'],
            items: { type: 'string', enum: ['missing', 'valid', 'invalid'] }
          },
          outcome_results: {
            type: ['array', 'null'],
            items: { type: 'string', enum: ['resolved', 'unresolved', 'regressed', 'unknown'] }
          },
          backends: {
            type: ['array', 'null'],
            items: { type: 'string' }
          },
          models: {
            type: ['array', 'null'],
            items: { type: 'string' }
          },
          efforts: {
            type: ['array', 'null'],
            items: { type: 'string' }
          },
          prompt_identities: {
            type: ['array', 'null'],
            items: { type: 'string' }
          },
          build_identities: {
            type: ['array', 'null'],
            items: { type: 'string' }
          },
          started_at_from: {
            type: ['integer', 'null']
          },
          started_at_to: {
            type: ['integer', 'null']
          }
        }
      },
      HistoryMetricScanV1: {
        type: 'object',
        required: [
          'status', 'projects_discovered', 'tasks_discovered', 'consultations_discovered',
          'accepted_records', 'invalid_records', 'bytes_discovered', 'bytes_read',
          'diagnostics', 'suppressed_diagnostics', 'limit_hit'
        ],
        additionalProperties: false,
        properties: {
          status: { type: 'string', enum: ['complete', 'complete_with_errors', 'incomplete'] },
          projects_discovered: { $ref: '#/definitions/SafeNonNegativeInt' },
          tasks_discovered: { $ref: '#/definitions/SafeNonNegativeInt' },
          consultations_discovered: { $ref: '#/definitions/SafeNonNegativeInt' },
          accepted_records: { $ref: '#/definitions/SafeNonNegativeInt' },
          invalid_records: { $ref: '#/definitions/SafeNonNegativeInt' },
          bytes_discovered: { $ref: '#/definitions/SafeNonNegativeInt' },
          bytes_read: { $ref: '#/definitions/SafeNonNegativeInt' },
          diagnostics: {
            type: 'array',
            items: { type: 'object' }
          },
          suppressed_diagnostics: { $ref: '#/definitions/SafeNonNegativeInt' },
          limit_hit: { type: 'boolean' }
        }
      },
      HistoryMetricResultV1: {
        type: 'object',
        required: [
          'metric_definition_version', 'scope', 'filters', 'generated_at',
          'scan', 'counts', 'missingness', 'metrics', 'completeness', 'limitations'
        ],
        additionalProperties: false,
        properties: {
          metric_definition_version: { type: 'integer', const: 1 },
          scope: { type: 'object' },
          filters: { $ref: '#/definitions/HistoryMetricFiltersV1' },
          generated_at: { $ref: '#/definitions/TimestampMs' },
          scan: { $ref: '#/definitions/HistoryMetricScanV1' },
          counts: { type: 'object' },
          missingness: { type: 'object' },
          metrics: { type: 'object' },
          completeness: { type: 'object' },
          limitations: {
            type: 'array',
            items: { type: 'string' }
          }
        }
      }
    }
  };
}

export function buildManifest(schemaContent) {
  const schemaHash = createHash('sha256').update(schemaContent).digest('hex');

  return {
    domain_package: 'evcrate-advisor-data',
    domain_version: 1,
    schema_file: 'evcrate-advisor-data-v1.schema.json',
    schema_sha256: schemaHash,
    methods: [
      'history.refresh',
      'history.summary',
      'history.page',
      'history.detail',
      'policy.readCurrent',
      'evaluations.list',
      'evaluations.read',
      'evaluations.compare'
    ],
    limits: {
      max_opaque_id_bytes: 128,
      max_cursor_bytes: 256,
      max_page_limit: 500,
      default_page_limit: 100,
      max_evaluation_page_limit: 100,
      max_page_result_bytes: 1048576,
      max_frame_payload_bytes: 16777216,
      max_control_payload_bytes: 65536,
      max_evaluation_document_bytes: 8388608,
      max_compare_items: 32
    },
    companion_host_candidate: {
      package: '@dam-hopper/plugin-sdk',
      status: 'pending_joint_g0',
      version: null,
      sha256: null
    }
  };
}

function main() {
  const isCheck = process.argv.includes('--check');

  const schema = buildDataApiSchema();
  const schemaText = JSON.stringify(schema, null, 2) + '\n';
  const manifest = buildManifest(schemaText);
  const manifestText = JSON.stringify(manifest, null, 2) + '\n';

  if (isCheck) {
    if (!existsSync(SCHEMA_FILE) || !existsSync(MANIFEST_FILE)) {
      console.error('Error: Generated schema or manifest files do not exist.');
      process.exit(1);
    }
    const currentSchema = readFileSync(SCHEMA_FILE, 'utf8');
    const currentManifest = readFileSync(MANIFEST_FILE, 'utf8');

    if (currentSchema !== schemaText) {
      console.error('Error: evcrate-advisor-data-v1.schema.json is stale.');
      process.exit(1);
    }
    if (currentManifest !== manifestText) {
      console.error('Error: contract-manifest.json is stale.');
      process.exit(1);
    }

    console.log('✓ Schema and manifest files match generated output.');
    process.exit(0);
  }

  if (!existsSync(CONTRACTS_DIR)) {
    mkdirSync(CONTRACTS_DIR, { recursive: true });
  }

  writeFileSync(SCHEMA_FILE, schemaText, 'utf8');
  writeFileSync(MANIFEST_FILE, manifestText, 'utf8');
  console.log(`✓ Wrote schema to ${SCHEMA_FILE}`);
  console.log(`✓ Wrote manifest to ${MANIFEST_FILE}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
