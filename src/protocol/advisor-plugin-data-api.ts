/**
 * @file advisor-plugin-data-api.ts
 * EVCrate Advisor Plugin Domain Data API (Version 1).
 *
 * Implements the domain contract, strict type definitions, constants, and validators
 * for the eight plugin data operations required by DamHopper Advisor Plugin Phase E00.
 */

import { isPlainObject } from './json.js';
import {
  AdvisorRouteTarget,
  ExecutionStatus,
  OutcomeResult,
  HistoryExecutionV1,
  HistoryOutcomeV1,
  AdvisorPolicyV2,
  EXECUTION_STATUSES,
  OUTCOME_RESULTS,
  validateHistoryExecutionV1,
  validateHistoryOutcomeV1,
  validatePolicyV2,
  validateRouteTarget,
} from './advisor-contract-runtime.js';
import {
  HistoryMetricScanV1,
  HistoryMetricResultV1,
  HistoryMetricFiltersV1,
  normalizeHistoryFilter,
} from './advisor-metrics.js';
import {
  EvaluationDocumentV1,
  validateEvaluationDocument,
} from './advisor-evaluation.js';
import {
  ComparableEvaluationGroup,
} from './advisor-evaluation-comparison.js';
export type {
  HistoryExecutionV1,
  HistoryOutcomeV1,
  EvaluationDocumentV1,
  AdvisorPolicyV2,
};

export const DATA_API_PROTOCOL_V1 = 'evcrate-advisor-data' as const;
export const DATA_API_VERSION_V1 = 1 as const;

export const DATA_API_PROTOCOL_V2 = 'evcrate-advisor-data' as const;
export const DATA_API_VERSION_V2 = 2 as const;
export const DATA_API_PROTOCOL = DATA_API_PROTOCOL_V2;
export const DATA_API_VERSION = DATA_API_VERSION_V2;
export const ADVISOR_DATA_METHODS = Object.freeze([
  'history.refresh',
  'history.summary',
  'history.page',
  'history.detail',
  'policy.readCurrent',
  'evaluations.list',
  'evaluations.read',
  'evaluations.compare',
] as const);

export type AdvisorDataMethod = (typeof ADVISOR_DATA_METHODS)[number];

export const MAX_OPAQUE_ID_BYTES = 128;
export const MAX_CURSOR_BYTES = 256;
export const MAX_PAGE_LIMIT = 500;
export const DEFAULT_PAGE_LIMIT = 100;
export const MAX_EVALUATION_PAGE_LIMIT = 100;
export const MAX_PAGE_RESULT_BYTES = 1024 * 1024; // 1 MiB
export const MAX_FRAME_PAYLOAD_BYTES = 16 * 1024 * 1024; // 16 MiB
export const MAX_CONTROL_PAYLOAD_BYTES = 64 * 1024; // 64 KiB
export const MAX_EVALUATION_DOCUMENT_BYTES = 8 * 1024 * 1024; // 8 MiB
export const MAX_COMPARE_ITEMS = 32;
export const MAX_PROJECT_NAME_CHARS = 64;
export const MAX_PROJECT_INVENTORY_ENTRIES = 500;
export const PROJECT_METADATA_SIDECAR_VERSION_V1 = 1 as const;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_RE = /^[0-9a-f]{64}$/;

export const PLUGIN_ERROR_CODES = Object.freeze([
  'UNAUTHORIZED',
  'FORBIDDEN',
  'INCOMPATIBLE',
  'RUNNER_UNAVAILABLE',
  'RUNTIME_UNAVAILABLE',
  'SOURCE_NOT_CONFIGURED',
  'SOURCE_MISSING',
  'PERMISSION_DENIED',
  'INVALID_INPUT',
  'OVERLOADED',
  'DEADLINE_EXCEEDED',
  'CANCELLED',
  'WORKER_FAILED',
  'CONTEXT_REVOKED',
  'SNAPSHOT_EXPIRED',
  'DETAIL_CHANGED',
  'DETAIL_MISSING',
] as const);

export type PluginErrorCode = (typeof PLUGIN_ERROR_CODES)[number];

export class PluginDataApiError extends Error {
  readonly code: PluginErrorCode;
  readonly path: string;

  constructor(code: PluginErrorCode, path = '', message?: string) {
    super(message ?? `Plugin Data API validation failed: ${code} at '${path}'`);
    this.name = 'PluginDataApiError';
    this.code = code;
    this.path = path;
  }
}

function fail(code: PluginErrorCode, path: string, msg?: string): never {
  throw new PluginDataApiError(code, path, msg);
}


function asObj(v: unknown, path: string): Record<string, unknown> {
  if (!isPlainObject(v)) {
    fail('INVALID_INPUT', path, `Expected object at ${path}`);
  }
  return v as Record<string, unknown>;
}

function checkNoUnknownKeys(
  obj: Record<string, unknown>,
  allowed: readonly string[],
  path: string
): void {
  const allowedMap: Record<string, true> = {};
  for (let i = 0; i < allowed.length; i++) allowedMap[allowed[i]] = true;
  for (const key of Object.keys(obj)) {
    if (!allowedMap[key]) {
      fail('INVALID_INPUT', `${path}/${key}`, `Unknown property '${key}' at ${path}`);
    }
  }
}

function checkOpaqueId(v: unknown, path: string, min = 1, max = MAX_OPAQUE_ID_BYTES): string {
  if (typeof v !== 'string') {
    fail('INVALID_INPUT', path, `Expected string for opaque ID at ${path}`);
  }
  const bytes = Buffer.byteLength(v, 'utf8');
  if (bytes < min || bytes > max) {
    fail('INVALID_INPUT', path, `Opaque ID byte length must be between ${min} and ${max} at ${path}`);
  }
  return v;
}

function checkCursor(v: unknown, path: string): string | null {
  if (v === null) return null;
  if (typeof v !== 'string') {
    fail('INVALID_INPUT', path, `Expected string or null for cursor at ${path}`);
  }
  const bytes = Buffer.byteLength(v, 'utf8');
  if (bytes < 1 || bytes > MAX_CURSOR_BYTES) {
    fail('INVALID_INPUT', path, `Cursor byte length must be between 1 and ${MAX_CURSOR_BYTES} at ${path}`);
  }
  return v;
}

function checkTimestamp(v: unknown, path: string): number {
  if (typeof v !== 'number' || !Number.isSafeInteger(v) || v <= 0) {
    fail('INVALID_INPUT', path, `Expected positive safe-integer epoch timestamp at ${path}`);
  }
  return v;
}

function checkSafeInteger(v: unknown, min: number, max: number, path: string): number {
  if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < min || v > max) {
    fail('INVALID_INPUT', path, `Expected safe integer between ${min} and ${max} at ${path}`);
  }
  return v;
}

function checkUuid(v: unknown, path: string): string {
  if (typeof v !== 'string' || !UUID_RE.test(v)) {
    fail('INVALID_INPUT', path, `Expected valid UUID at ${path}`);
  }
  return v;
}

function checkSha256(v: unknown, path: string): string {
  if (typeof v !== 'string' || !SHA256_RE.test(v)) {
    fail('INVALID_INPUT', path, `Expected valid lowercase 64-hex SHA-256 digest at ${path}`);
  }
  return v;
}

// ---------------------------------------------------------------------------
// Domain Types: History Rows & Descriptors
// ---------------------------------------------------------------------------

export interface HistoryRowV1 {
  readonly record_ref: string;
  readonly project_id: string;
  readonly task_run_id: string;
  readonly consultation_id: string;
  readonly status: ExecutionStatus;
  readonly route: AdvisorRouteTarget;
  readonly checkpoint_digest: string;
  readonly prompt_identity: string;
  readonly build_identity: string;
  readonly started_at: number;
  readonly completed_at: number | null;
  readonly receipt_elapsed_ms: number | null;
  readonly outcome_state: 'missing' | 'valid' | 'invalid';
  readonly outcome_result: OutcomeResult | null;
}

export interface EvaluationDescriptorV1 {
  readonly evaluation_ref: string;
  readonly source_revision: string;
  readonly source_digest: string;
  readonly evaluation_id: string;
  readonly run_id: string;
  readonly created_at: number;
  readonly candidate_count: number;
  readonly case_count: number;
  readonly observation_count: number;
}

// ---------------------------------------------------------------------------
// Domain Types: Project Metadata Sidecar & Project Inventory (v2)
// ---------------------------------------------------------------------------

export interface ProjectMetadataEntryV1 {
  readonly name: string;
  readonly updated_at: number;
}

export interface ProjectMetadataSidecarV1 {
  readonly version: 1;
  readonly projects: Readonly<Record<string, ProjectMetadataEntryV1>>;
}

export interface ProjectInventoryItemV2 {
  readonly project_id: string;
  readonly label: string | null;
  readonly count: number;
}

export interface ProjectInventoryV2 {
  readonly entries: readonly ProjectInventoryItemV2[];
  readonly total_projects: number;
  readonly unfiltered_total_records: number;
}

export function validateProjectDisplayName(raw: unknown, path = 'name'): string {
  if (typeof raw !== 'string') {
    fail('INVALID_INPUT', path, 'project display name must be a string');
  }
  if (raw.trim() !== raw) {
    fail('INVALID_INPUT', path, 'project display name must not have leading or trailing whitespace');
  }
  if (raw.length === 0 || raw.length > MAX_PROJECT_NAME_CHARS) {
    fail('INVALID_INPUT', path, `project display name length must be 1..${MAX_PROJECT_NAME_CHARS} characters`);
  }
  for (let i = 0; i < raw.length; i++) {
    const code = raw.charCodeAt(i);
    if (code < 32 || code === 127 || (code >= 128 && code <= 159)) {
      fail('INVALID_INPUT', path, 'project display name must not contain control characters');
    }
  }
  if (raw.includes('/') || raw.includes('\\')) {
    fail('INVALID_INPUT', path, 'project display name must not contain path separators');
  }
  if (raw.includes('~')) {
    fail('INVALID_INPUT', path, 'project display name must not contain tilde (HOME) references');
  }
  if (/(?:^|[/\\])(?:home|Users)(?:[/\\]|$)/i.test(raw) || /\b(?:HOME|USERPROFILE)\b/i.test(raw)) {
    fail('INVALID_INPUT', path, 'project display name must not contain home directory references');
  }
  if (raw.includes('\\') || /(?:\\u[0-9a-fA-F]{4}|\\x[0-9a-fA-F]{2})/.test(raw)) {
    fail('INVALID_INPUT', path, 'project display name must not contain escape sequences');
  }
  return raw;
}

export function validateProjectMetadataSidecarV1(raw: unknown, path = 'sidecar'): ProjectMetadataSidecarV1 {
  const obj = asObj(raw, path);
  checkNoUnknownKeys(obj, ['version', 'projects'], path);

  if (obj.version !== 1) {
    fail('INVALID_INPUT', `${path}/version`, `version must be 1: ${String(obj.version)}`);
  }

  const projectsObj = asObj(obj.projects, `${path}/projects`);
  const validatedProjects: Record<string, ProjectMetadataEntryV1> = {};

  for (const [projectId, entryRaw] of Object.entries(projectsObj)) {
    const entryPath = `${path}/projects/${projectId}`;
    if (!SHA256_RE.test(projectId.toLowerCase())) {
      fail('INVALID_INPUT', entryPath, `project ID key must be a 64-char hex SHA-256: ${projectId}`);
    }
    const entryObj = asObj(entryRaw, entryPath);
    checkNoUnknownKeys(entryObj, ['name', 'updated_at'], entryPath);
    const name = validateProjectDisplayName(entryObj.name, `${entryPath}/name`);
    const updatedAt = checkTimestamp(entryObj.updated_at, `${entryPath}/updated_at`);
    validatedProjects[projectId.toLowerCase()] = Object.freeze({
      name,
      updated_at: updatedAt,
    });
  }

  return Object.freeze({
    version: 1,
    projects: Object.freeze(validatedProjects),
  });
}

export function validateProjectInventoryItemV2(raw: unknown, path = 'item'): ProjectInventoryItemV2 {
  const obj = asObj(raw, path);
  checkNoUnknownKeys(obj, ['project_id', 'label', 'count'], path);

  const projectId = checkSha256(obj.project_id, `${path}/project_id`);
  let label: string | null = null;
  if (obj.label !== null && obj.label !== undefined) {
    label = validateProjectDisplayName(obj.label, `${path}/label`);
  }
  const count = checkSafeInteger(obj.count, 0, Number.MAX_SAFE_INTEGER, `${path}/count`);

  return Object.freeze({
    project_id: projectId.toLowerCase(),
    label,
    count,
  });
}

export function validateProjectInventoryV2(raw: unknown, path = 'inventory'): ProjectInventoryV2 {
  const obj = asObj(raw, path);
  checkNoUnknownKeys(obj, ['entries', 'total_projects', 'unfiltered_total_records'], path);

  if (!Array.isArray(obj.entries)) {
    fail('INVALID_INPUT', `${path}/entries`, 'entries must be an array');
  }
  if (obj.entries.length > MAX_PROJECT_INVENTORY_ENTRIES) {
    fail('INVALID_INPUT', `${path}/entries`, `entries length must not exceed ${MAX_PROJECT_INVENTORY_ENTRIES}`);
  }

  const entries: ProjectInventoryItemV2[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < obj.entries.length; i++) {
    const item = validateProjectInventoryItemV2(obj.entries[i], `${path}/entries/${i}`);
    if (seen.has(item.project_id)) {
      fail('INVALID_INPUT', `${path}/entries/${i}`, `duplicate project_id in inventory: ${item.project_id}`);
    }
    seen.add(item.project_id);
    entries.push(item);
  }

  const totalProjects = checkSafeInteger(obj.total_projects, 0, Number.MAX_SAFE_INTEGER, `${path}/total_projects`);
  const unfilteredTotal = checkSafeInteger(obj.unfiltered_total_records, 0, Number.MAX_SAFE_INTEGER, `${path}/unfiltered_total_records`);

  if (entries.length !== totalProjects) {
    fail('INVALID_INPUT', `${path}/total_projects`, `total_projects (${totalProjects}) must match entries length (${entries.length})`);
  }

  return Object.freeze({
    entries: Object.freeze(entries),
    total_projects: totalProjects,
    unfiltered_total_records: unfilteredTotal,
  });
}

// ---------------------------------------------------------------------------
// Method 1: history.refresh
// ---------------------------------------------------------------------------

export type HistoryRefreshParamsV1 = Record<string, never>;

export const HISTORY_REFRESH_STATES = Object.freeze(['fresh', 'stale', 'unavailable'] as const);
export type HistoryRefreshState = (typeof HISTORY_REFRESH_STATES)[number];

export const STALE_REASONS = Object.freeze(['incomplete', 'cancelled', 'deadline'] as const);
export type StaleReason = (typeof STALE_REASONS)[number];

export interface HistoryRefreshResultV1 {
  readonly state: HistoryRefreshState;
  readonly snapshot_id: string | null;
  readonly observed_at: number;
  readonly scan: HistoryMetricScanV1;
  readonly stale_reason: StaleReason | null;
}

export function validateHistoryRefreshParams(raw: unknown, path = 'params'): HistoryRefreshParamsV1 {
  const obj = asObj(raw, path);
  checkNoUnknownKeys(obj, [], path);
  return Object.freeze({});
}

export function validateHistoryRefreshResult(raw: unknown, path = 'result'): HistoryRefreshResultV1 {
  const obj = asObj(raw, path);
  checkNoUnknownKeys(obj, ['state', 'snapshot_id', 'observed_at', 'scan', 'stale_reason'], path);

  if (typeof obj.state !== 'string' || !HISTORY_REFRESH_STATES.includes(obj.state as HistoryRefreshState)) {
    fail('INVALID_INPUT', `${path}/state`, `Invalid state: ${String(obj.state)}`);
  }
  const state = obj.state as HistoryRefreshState;

  let snapshotId: string | null = null;
  if (state === 'unavailable') {
    if (obj.snapshot_id !== null) {
      fail('INVALID_INPUT', `${path}/snapshot_id`, 'snapshot_id must be null when state is unavailable');
    }
  } else {
    snapshotId = checkOpaqueId(obj.snapshot_id, `${path}/snapshot_id`);
  }

  const observedAt = checkTimestamp(obj.observed_at, `${path}/observed_at`);

  const scanObj = asObj(obj.scan, `${path}/scan`);
  checkNoUnknownKeys(scanObj, [
    'status', 'projects_discovered', 'tasks_discovered', 'consultations_discovered',
    'accepted_records', 'invalid_records', 'bytes_discovered', 'bytes_read',
    'diagnostics', 'suppressed_diagnostics', 'limit_hit',
  ], `${path}/scan`);

  let staleReason: StaleReason | null = null;
  if (state === 'stale') {
    if (typeof obj.stale_reason !== 'string' || !STALE_REASONS.includes(obj.stale_reason as StaleReason)) {
      fail('INVALID_INPUT', `${path}/stale_reason`, `stale_reason required when state is stale: ${String(obj.stale_reason)}`);
    }
    staleReason = obj.stale_reason as StaleReason;
  } else {
    if (obj.stale_reason !== null) {
      fail('INVALID_INPUT', `${path}/stale_reason`, 'stale_reason must be null when state is not stale');
    }
  }

  return Object.freeze({
    state,
    snapshot_id: snapshotId,
    observed_at: observedAt,
    scan: obj.scan as unknown as HistoryMetricScanV1,
    stale_reason: staleReason,
  });
}

export type HistoryRefreshParamsV2 = HistoryRefreshParamsV1;
export const validateHistoryRefreshParamsV2 = validateHistoryRefreshParams;

export interface HistoryRefreshResultV2 {
  readonly state: HistoryRefreshState;
  readonly snapshot_id: string | null;
  readonly observed_at: number;
  readonly scan: HistoryMetricScanV1;
  readonly stale_reason: StaleReason | null;
  readonly inventory: ProjectInventoryV2 | null;
}

export function validateHistoryRefreshResultV2(raw: unknown, path = 'result'): HistoryRefreshResultV2 {
  const obj = asObj(raw, path);
  checkNoUnknownKeys(obj, ['state', 'snapshot_id', 'observed_at', 'scan', 'stale_reason', 'inventory'], path);

  if (typeof obj.state !== 'string' || !HISTORY_REFRESH_STATES.includes(obj.state as HistoryRefreshState)) {
    fail('INVALID_INPUT', `${path}/state`, `Invalid state: ${String(obj.state)}`);
  }
  const state = obj.state as HistoryRefreshState;

  let snapshotId: string | null = null;
  if (state === 'unavailable') {
    if (obj.snapshot_id !== null) {
      fail('INVALID_INPUT', `${path}/snapshot_id`, 'snapshot_id must be null when state is unavailable');
    }
  } else {
    snapshotId = checkOpaqueId(obj.snapshot_id, `${path}/snapshot_id`);
  }

  const observedAt = checkTimestamp(obj.observed_at, `${path}/observed_at`);

  const scanObj = asObj(obj.scan, `${path}/scan`);
  checkNoUnknownKeys(scanObj, [
    'status', 'projects_discovered', 'tasks_discovered', 'consultations_discovered',
    'accepted_records', 'invalid_records', 'bytes_discovered', 'bytes_read',
    'diagnostics', 'suppressed_diagnostics', 'limit_hit',
  ], `${path}/scan`);

  let staleReason: StaleReason | null = null;
  if (state === 'stale') {
    if (typeof obj.stale_reason !== 'string' || !STALE_REASONS.includes(obj.stale_reason as StaleReason)) {
      fail('INVALID_INPUT', `${path}/stale_reason`, `stale_reason required when state is stale: ${String(obj.stale_reason)}`);
    }
    staleReason = obj.stale_reason as StaleReason;
  } else {
    if (obj.stale_reason !== null) {
      fail('INVALID_INPUT', `${path}/stale_reason`, 'stale_reason must be null when state is not stale');
    }
  }

  let inventory: ProjectInventoryV2 | null = null;
  if (obj.inventory !== null && obj.inventory !== undefined) {
    inventory = validateProjectInventoryV2(obj.inventory, `${path}/inventory`);
  }

  return Object.freeze({
    state,
    snapshot_id: snapshotId,
    observed_at: observedAt,
    scan: obj.scan as unknown as HistoryMetricScanV1,
    stale_reason: staleReason,
    inventory,
  });
}

// ---------------------------------------------------------------------------
// Method 2: history.summary
// ---------------------------------------------------------------------------

export interface HistorySummaryQueryV1 {
  readonly task_run_id: string | null;
  readonly filters: HistoryMetricFiltersV1;
}

export interface HistorySummaryParamsV1 {
  readonly snapshot_id: string;
  readonly query: HistorySummaryQueryV1;
}

export interface HistorySummaryResultV1 {
  readonly state: 'fresh' | 'stale';
  readonly snapshot_id: string;
  readonly metrics: HistoryMetricResultV1;
}

export function validateHistorySummaryParams(raw: unknown, path = 'params'): HistorySummaryParamsV1 {
  const obj = asObj(raw, path);
  checkNoUnknownKeys(obj, ['snapshot_id', 'query'], path);

  const snapshotId = checkOpaqueId(obj.snapshot_id, `${path}/snapshot_id`);
  const queryObj = asObj(obj.query, `${path}/query`);
  checkNoUnknownKeys(queryObj, ['task_run_id', 'filters'], `${path}/query`);

  let taskRunId: string | null = null;
  if (queryObj.task_run_id !== null) {
    taskRunId = checkUuid(queryObj.task_run_id, `${path}/query/task_run_id`);
  }

  const filters = normalizeHistoryFilter(queryObj.filters);

  return Object.freeze({
    snapshot_id: snapshotId,
    query: Object.freeze({
      task_run_id: taskRunId,
      filters,
    }),
  });
}

export function validateHistorySummaryResult(raw: unknown, path = 'result'): HistorySummaryResultV1 {
  const obj = asObj(raw, path);
  checkNoUnknownKeys(obj, ['state', 'snapshot_id', 'metrics'], path);

  if (obj.state !== 'fresh' && obj.state !== 'stale') {
    fail('INVALID_INPUT', `${path}/state`, `state must be fresh or stale: ${String(obj.state)}`);
  }

  const snapshotId = checkOpaqueId(obj.snapshot_id, `${path}/snapshot_id`);
  const metricsObj = asObj(obj.metrics, `${path}/metrics`);

  if (metricsObj.metric_definition_version !== 1) {
    fail('INVALID_INPUT', `${path}/metrics/metric_definition_version`, 'metric_definition_version must be 1');
  }

  return Object.freeze({
    state: obj.state,
    snapshot_id: snapshotId,
    metrics: obj.metrics as unknown as HistoryMetricResultV1,
  });
}

export interface HistorySummaryQueryV2 {
  readonly project_id: string | null;
  readonly task_run_id: string | null;
  readonly filters: HistoryMetricFiltersV1;
}

export interface HistorySummaryParamsV2 {
  readonly snapshot_id: string;
  readonly query: HistorySummaryQueryV2;
}

export interface HistorySummaryResultV2 {
  readonly state: 'fresh' | 'stale';
  readonly snapshot_id: string;
  readonly metrics: HistoryMetricResultV1;
  readonly inventory: ProjectInventoryV2;
}

export function validateHistorySummaryQueryV2(raw: unknown, path = 'query'): HistorySummaryQueryV2 {
  const queryObj = asObj(raw, path);
  checkNoUnknownKeys(queryObj, ['project_id', 'task_run_id', 'filters'], path);

  let projectId: string | null = null;
  if (queryObj.project_id !== null && queryObj.project_id !== undefined) {
    projectId = checkSha256(queryObj.project_id, `${path}/project_id`).toLowerCase();
  }

  let taskRunId: string | null = null;
  if (queryObj.task_run_id !== null && queryObj.task_run_id !== undefined) {
    taskRunId = checkUuid(queryObj.task_run_id, `${path}/task_run_id`);
  }

  const filters = normalizeHistoryFilter(queryObj.filters);

  return Object.freeze({
    project_id: projectId,
    task_run_id: taskRunId,
    filters,
  });
}

export function validateHistorySummaryParamsV2(raw: unknown, path = 'params'): HistorySummaryParamsV2 {
  const obj = asObj(raw, path);
  checkNoUnknownKeys(obj, ['snapshot_id', 'query'], path);

  const snapshotId = checkOpaqueId(obj.snapshot_id, `${path}/snapshot_id`);
  const query = validateHistorySummaryQueryV2(obj.query, `${path}/query`);

  return Object.freeze({
    snapshot_id: snapshotId,
    query,
  });
}

export function validateHistorySummaryResultV2(raw: unknown, path = 'result'): HistorySummaryResultV2 {
  const obj = asObj(raw, path);
  checkNoUnknownKeys(obj, ['state', 'snapshot_id', 'metrics', 'inventory'], path);

  if (obj.state !== 'fresh' && obj.state !== 'stale') {
    fail('INVALID_INPUT', `${path}/state`, `state must be fresh or stale: ${String(obj.state)}`);
  }

  const snapshotId = checkOpaqueId(obj.snapshot_id, `${path}/snapshot_id`);
  const metricsObj = asObj(obj.metrics, `${path}/metrics`);

  if (metricsObj.metric_definition_version !== 1) {
    fail('INVALID_INPUT', `${path}/metrics/metric_definition_version`, 'metric_definition_version must be 1');
  }

  const inventory = validateProjectInventoryV2(obj.inventory, `${path}/inventory`);

  return Object.freeze({
    state: obj.state,
    snapshot_id: snapshotId,
    metrics: obj.metrics as unknown as HistoryMetricResultV1,
    inventory,
  });
}

// ---------------------------------------------------------------------------
// Method 3: history.page
// ---------------------------------------------------------------------------

export interface HistoryPageParamsV1 {
  readonly snapshot_id: string;
  readonly query: HistorySummaryQueryV1;
  readonly sort: 'started_at_desc';
  readonly cursor: string | null;
  readonly limit: number;
}

export interface HistoryPageResultV1 {
  readonly state: 'fresh' | 'stale';
  readonly snapshot_id: string;
  readonly entries: readonly HistoryRowV1[];
  readonly next_cursor: string | null;
  readonly returned_bytes: number;
}

export function validateHistoryRowV1(raw: unknown, path = 'row'): HistoryRowV1 {
  const obj = asObj(raw, path);
  checkNoUnknownKeys(obj, [
    'record_ref', 'project_id', 'task_run_id', 'consultation_id',
    'status', 'route', 'checkpoint_digest', 'prompt_identity',
    'build_identity', 'started_at', 'completed_at', 'receipt_elapsed_ms',
    'outcome_state', 'outcome_result',
  ], path);

  const recordRef = checkOpaqueId(obj.record_ref, `${path}/record_ref`);
  const projectId = checkSha256(obj.project_id, `${path}/project_id`);
  const taskRunId = checkUuid(obj.task_run_id, `${path}/task_run_id`);
  const consultationId = checkUuid(obj.consultation_id, `${path}/consultation_id`);

  if (typeof obj.status !== 'string' || !EXECUTION_STATUSES.includes(obj.status as ExecutionStatus)) {
    fail('INVALID_INPUT', `${path}/status`, `Invalid execution status: ${String(obj.status)}`);
  }
  const status = obj.status as ExecutionStatus;

  const route = validateRouteTarget(obj.route, `${path}/route`);
  const checkpointDigest = checkSha256(obj.checkpoint_digest, `${path}/checkpoint_digest`);
  const promptIdentity = checkOpaqueId(obj.prompt_identity, `${path}/prompt_identity`);
  const buildIdentity = checkOpaqueId(obj.build_identity, `${path}/build_identity`);

  const startedAt = checkTimestamp(obj.started_at, `${path}/started_at`);
  let completedAt: number | null = null;
  if (obj.completed_at !== null) {
    completedAt = checkTimestamp(obj.completed_at, `${path}/completed_at`);
    if (completedAt < startedAt) {
      fail('INVALID_INPUT', `${path}/completed_at`, 'completed_at must be >= started_at');
    }
  }

  let receiptElapsedMs: number | null = null;
  if (obj.receipt_elapsed_ms !== null) {
    receiptElapsedMs = checkSafeInteger(obj.receipt_elapsed_ms, 0, 86400000, `${path}/receipt_elapsed_ms`);
  }

  if (typeof obj.outcome_state !== 'string' || !['missing', 'valid', 'invalid'].includes(obj.outcome_state)) {
    fail('INVALID_INPUT', `${path}/outcome_state`, `Invalid outcome_state: ${String(obj.outcome_state)}`);
  }
  const outcomeState = obj.outcome_state as 'missing' | 'valid' | 'invalid';

  let outcomeResult: OutcomeResult | null = null;
  if (obj.outcome_result !== null) {
    if (typeof obj.outcome_result !== 'string' || !OUTCOME_RESULTS.includes(obj.outcome_result as OutcomeResult)) {
      fail('INVALID_INPUT', `${path}/outcome_result`, `Invalid outcome_result: ${String(obj.outcome_result)}`);
    }
    outcomeResult = obj.outcome_result as OutcomeResult;
  }

  return Object.freeze({
    record_ref: recordRef,
    project_id: projectId,
    task_run_id: taskRunId,
    consultation_id: consultationId,
    status,
    route,
    checkpoint_digest: checkpointDigest,
    prompt_identity: promptIdentity,
    build_identity: buildIdentity,
    started_at: startedAt,
    completed_at: completedAt,
    receipt_elapsed_ms: receiptElapsedMs,
    outcome_state: outcomeState,
    outcome_result: outcomeResult,
  });
}

export function validateHistoryPageParams(raw: unknown, path = 'params'): HistoryPageParamsV1 {
  const obj = asObj(raw, path);
  checkNoUnknownKeys(obj, ['snapshot_id', 'query', 'sort', 'cursor', 'limit'], path);

  const snapshotId = checkOpaqueId(obj.snapshot_id, `${path}/snapshot_id`);
  const queryObj = asObj(obj.query, `${path}/query`);
  checkNoUnknownKeys(queryObj, ['task_run_id', 'filters'], `${path}/query`);

  let taskRunId: string | null = null;
  if (queryObj.task_run_id !== null) {
    taskRunId = checkUuid(queryObj.task_run_id, `${path}/query/task_run_id`);
  }
  const filters = normalizeHistoryFilter(queryObj.filters);

  if (obj.sort !== 'started_at_desc') {
    fail('INVALID_INPUT', `${path}/sort`, "Sort must be exact literal 'started_at_desc'");
  }

  const cursor = checkCursor(obj.cursor, `${path}/cursor`);
  const limit = checkSafeInteger(obj.limit, 1, MAX_PAGE_LIMIT, `${path}/limit`);

  return Object.freeze({
    snapshot_id: snapshotId,
    query: Object.freeze({
      task_run_id: taskRunId,
      filters,
    }),
    sort: 'started_at_desc',
    cursor,
    limit,
  });
}

export function validateHistoryPageResult(raw: unknown, path = 'result'): HistoryPageResultV1 {
  const obj = asObj(raw, path);
  checkNoUnknownKeys(obj, ['state', 'snapshot_id', 'entries', 'next_cursor', 'returned_bytes'], path);

  if (obj.state !== 'fresh' && obj.state !== 'stale') {
    fail('INVALID_INPUT', `${path}/state`, `state must be fresh or stale: ${String(obj.state)}`);
  }

  const snapshotId = checkOpaqueId(obj.snapshot_id, `${path}/snapshot_id`);

  if (!Array.isArray(obj.entries)) {
    fail('INVALID_INPUT', `${path}/entries`, 'entries must be an array');
  }
  if (obj.entries.length > MAX_PAGE_LIMIT) {
    fail('INVALID_INPUT', `${path}/entries`, `entries array length exceeds maximum ${MAX_PAGE_LIMIT}`);
  }

  const entries = Object.freeze(obj.entries.map((entry, idx) => validateHistoryRowV1(entry, `${path}/entries/${idx}`)));
  const nextCursor = checkCursor(obj.next_cursor, `${path}/next_cursor`);
  const returnedBytes = checkSafeInteger(obj.returned_bytes, 0, MAX_PAGE_RESULT_BYTES, `${path}/returned_bytes`);

  return Object.freeze({
    state: obj.state,
    snapshot_id: snapshotId,
    entries,
    next_cursor: nextCursor,
    returned_bytes: returnedBytes,
  });
}

export interface HistoryPageParamsV2 {
  readonly snapshot_id: string;
  readonly query: HistorySummaryQueryV2;
  readonly sort: 'started_at_desc';
  readonly cursor: string | null;
  readonly limit: number;
}

export type HistoryPageResultV2 = HistoryPageResultV1;

export function validateHistoryPageParamsV2(raw: unknown, path = 'params'): HistoryPageParamsV2 {
  const obj = asObj(raw, path);
  checkNoUnknownKeys(obj, ['snapshot_id', 'query', 'sort', 'cursor', 'limit'], path);

  const snapshotId = checkOpaqueId(obj.snapshot_id, `${path}/snapshot_id`);
  const query = validateHistorySummaryQueryV2(obj.query, `${path}/query`);

  if (obj.sort !== 'started_at_desc') {
    fail('INVALID_INPUT', `${path}/sort`, "Sort must be exact literal 'started_at_desc'");
  }

  const cursor = checkCursor(obj.cursor, `${path}/cursor`);
  const limit = checkSafeInteger(obj.limit, 1, MAX_PAGE_LIMIT, `${path}/limit`);

  return Object.freeze({
    snapshot_id: snapshotId,
    query,
    sort: 'started_at_desc',
    cursor,
    limit,
  });
}

export const validateHistoryPageResultV2 = validateHistoryPageResult;

// ---------------------------------------------------------------------------
// Method 4: history.detail
// ---------------------------------------------------------------------------

export interface HistoryDetailParamsV1 {
  readonly snapshot_id: string;
  readonly record_ref: string;
}

export interface HistoryDetailReadyResultV1 {
  readonly status: 'ready';
  readonly snapshot_id: string;
  readonly record_ref: string;
  readonly detail_revision: string;
  readonly execution: HistoryExecutionV1;
  readonly outcome: HistoryOutcomeV1 | null;
}

export interface HistoryDetailChangedOrMissingResultV1 {
  readonly status: 'changed' | 'missing';
  readonly snapshot_id: string;
  readonly record_ref: string;
  readonly observed_revision: string | null;
}

export type HistoryDetailResultV1 = HistoryDetailReadyResultV1 | HistoryDetailChangedOrMissingResultV1;

export function validateHistoryDetailParams(raw: unknown, path = 'params'): HistoryDetailParamsV1 {
  const obj = asObj(raw, path);
  checkNoUnknownKeys(obj, ['snapshot_id', 'record_ref'], path);

  const snapshotId = checkOpaqueId(obj.snapshot_id, `${path}/snapshot_id`);
  const recordRef = checkOpaqueId(obj.record_ref, `${path}/record_ref`);

  return Object.freeze({
    snapshot_id: snapshotId,
    record_ref: recordRef,
  });
}

export function validateHistoryDetailResult(raw: unknown, path = 'result'): HistoryDetailResultV1 {
  const obj = asObj(raw, path);

  if (typeof obj.status !== 'string' || !['ready', 'changed', 'missing'].includes(obj.status)) {
    fail('INVALID_INPUT', `${path}/status`, `Invalid detail status: ${String(obj.status)}`);
  }

  const snapshotId = checkOpaqueId(obj.snapshot_id, `${path}/snapshot_id`);
  const recordRef = checkOpaqueId(obj.record_ref, `${path}/record_ref`);

  if (obj.status === 'ready') {
    checkNoUnknownKeys(obj, ['status', 'snapshot_id', 'record_ref', 'detail_revision', 'execution', 'outcome'], path);
    const detailRevision = checkOpaqueId(obj.detail_revision, `${path}/detail_revision`);
    if (!obj.execution) {
      fail('INVALID_INPUT', `${path}/execution`, 'execution required when status is ready');
    }
    let execution: HistoryExecutionV1;
    try {
      execution = validateHistoryExecutionV1(obj.execution, undefined, `${path}/execution`);
    } catch (err) {
      fail('INVALID_INPUT', `${path}/execution`, String(err));
    }
    let outcome: HistoryOutcomeV1 | null = null;
    if (obj.outcome !== null && obj.outcome !== undefined) {
      try {
        outcome = validateHistoryOutcomeV1(obj.outcome, `${path}/outcome`);
      } catch (err) {
        fail('INVALID_INPUT', `${path}/outcome`, String(err));
      }
    } else if (obj.outcome === undefined) {
      fail('INVALID_INPUT', `${path}/outcome`, 'outcome property must be present (or null) when status is ready');
    }

    return Object.freeze({
      status: 'ready',
      snapshot_id: snapshotId,
      record_ref: recordRef,
      detail_revision: detailRevision,
      execution,
      outcome,
    });
  }

  // changed or missing
  checkNoUnknownKeys(obj, ['status', 'snapshot_id', 'record_ref', 'observed_revision'], path);
  let observedRevision: string | null = null;
  if (obj.observed_revision !== null) {
    observedRevision = checkOpaqueId(obj.observed_revision, `${path}/observed_revision`);
  }

  return Object.freeze({
    status: obj.status as 'changed' | 'missing',
    snapshot_id: snapshotId,
    record_ref: recordRef,
    observed_revision: observedRevision,
  });
}

// ---------------------------------------------------------------------------
// Method 5: policy.readCurrent
// ---------------------------------------------------------------------------

export type PolicyReadCurrentParamsV1 = Record<string, never>;

export const POLICY_STATUSES = Object.freeze([
  'ready',
  'migration_required',
  'unsupported',
  'invalid',
  'not_configured',
] as const);

export type PolicyStatus = (typeof POLICY_STATUSES)[number];

export interface PolicyReadCurrentResultV1 {
  readonly status: PolicyStatus;
  readonly scope: 'account';
  readonly temporal: 'current';
  readonly observed_at: number;
  readonly revision: string;
  readonly policy?: AdvisorPolicyV2 | null;
  readonly issue_code?: string | null;
}

export function validatePolicyReadCurrentParams(raw: unknown, path = 'params'): PolicyReadCurrentParamsV1 {
  const obj = asObj(raw, path);
  checkNoUnknownKeys(obj, [], path);
  return Object.freeze({});
}

export function validatePolicyReadCurrentResult(raw: unknown, path = 'result'): PolicyReadCurrentResultV1 {
  const obj = asObj(raw, path);
  checkNoUnknownKeys(obj, ['status', 'scope', 'temporal', 'observed_at', 'revision', 'policy', 'issue_code'], path);

  if (typeof obj.status !== 'string' || !POLICY_STATUSES.includes(obj.status as PolicyStatus)) {
    fail('INVALID_INPUT', `${path}/status`, `Invalid policy status: ${String(obj.status)}`);
  }
  const status = obj.status as PolicyStatus;

  if (obj.scope !== 'account') {
    fail('INVALID_INPUT', `${path}/scope`, "scope must be literal 'account'");
  }
  if (obj.temporal !== 'current') {
    fail('INVALID_INPUT', `${path}/temporal`, "temporal must be literal 'current'");
  }

  const observedAt = checkTimestamp(obj.observed_at, `${path}/observed_at`);
  const revision = checkOpaqueId(obj.revision, `${path}/revision`);

  let policy: AdvisorPolicyV2 | null = null;
  let issueCode: string | null = null;

  if (status === 'ready') {
    if (!obj.policy) {
      fail('INVALID_INPUT', `${path}/policy`, 'policy document required when status is ready');
    }
    try {
      policy = validatePolicyV2(obj.policy, `${path}/policy`);
    } catch (err) {
      fail('INVALID_INPUT', `${path}/policy`, String(err));
    }
    if (obj.issue_code !== undefined && obj.issue_code !== null) {
      issueCode = checkOpaqueId(obj.issue_code, `${path}/issue_code`);
    }
  }

  return Object.freeze({
    status,
    scope: 'account',
    temporal: 'current',
    observed_at: observedAt,
    revision,
    policy: policy ?? (obj.policy === null ? null : undefined),
    issue_code: issueCode,
  });
}

// ---------------------------------------------------------------------------
// Method 6: evaluations.list
// ---------------------------------------------------------------------------

export interface EvaluationsListParamsV1 {
  readonly cursor: string | null;
  readonly limit: number;
}

export interface EvaluationsListResultV1 {
  readonly status: 'ready' | 'not_configured';
  readonly observed_at: number;
  readonly binding_revision: string;
  readonly items: readonly EvaluationDescriptorV1[];
  readonly next_cursor: string | null;
}

export function validateEvaluationDescriptorV1(raw: unknown, path = 'descriptor'): EvaluationDescriptorV1 {
  const obj = asObj(raw, path);
  checkNoUnknownKeys(obj, [
    'evaluation_ref', 'source_revision', 'source_digest', 'evaluation_id',
    'run_id', 'created_at', 'candidate_count', 'case_count', 'observation_count',
  ], path);

  const evaluationRef = checkOpaqueId(obj.evaluation_ref, `${path}/evaluation_ref`);
  const sourceRevision = checkOpaqueId(obj.source_revision, `${path}/source_revision`);
  const sourceDigest = checkSha256(obj.source_digest, `${path}/source_digest`);
  const evaluationId = checkOpaqueId(obj.evaluation_id, `${path}/evaluation_id`);
  const runId = checkOpaqueId(obj.run_id, `${path}/run_id`);
  const createdAt = checkTimestamp(obj.created_at, `${path}/created_at`);
  const candidateCount = checkSafeInteger(obj.candidate_count, 0, 1000, `${path}/candidate_count`);
  const caseCount = checkSafeInteger(obj.case_count, 0, 10000, `${path}/case_count`);
  const observationCount = checkSafeInteger(obj.observation_count, 0, 100000, `${path}/observation_count`);

  return Object.freeze({
    evaluation_ref: evaluationRef,
    source_revision: sourceRevision,
    source_digest: sourceDigest,
    evaluation_id: evaluationId,
    run_id: runId,
    created_at: createdAt,
    candidate_count: candidateCount,
    case_count: caseCount,
    observation_count: observationCount,
  });
}

export function validateEvaluationsListParams(raw: unknown, path = 'params'): EvaluationsListParamsV1 {
  const obj = asObj(raw, path);
  checkNoUnknownKeys(obj, ['cursor', 'limit'], path);

  const cursor = checkCursor(obj.cursor, `${path}/cursor`);
  const limit = checkSafeInteger(obj.limit, 1, MAX_EVALUATION_PAGE_LIMIT, `${path}/limit`);

  return Object.freeze({
    cursor,
    limit,
  });
}

export function validateEvaluationsListResult(raw: unknown, path = 'result'): EvaluationsListResultV1 {
  const obj = asObj(raw, path);
  checkNoUnknownKeys(obj, ['status', 'observed_at', 'binding_revision', 'items', 'next_cursor'], path);

  if (obj.status !== 'ready' && obj.status !== 'not_configured') {
    fail('INVALID_INPUT', `${path}/status`, `status must be ready or not_configured: ${String(obj.status)}`);
  }

  const observedAt = checkTimestamp(obj.observed_at, `${path}/observed_at`);
  const bindingRevision = checkOpaqueId(obj.binding_revision, `${path}/binding_revision`);

  if (!Array.isArray(obj.items)) {
    fail('INVALID_INPUT', `${path}/items`, 'items must be an array');
  }
  if (obj.status === 'not_configured' && obj.items.length !== 0) {
    fail('INVALID_INPUT', `${path}/items`, 'items must be empty when status is not_configured');
  }

  const items = Object.freeze(obj.items.map((item, idx) => validateEvaluationDescriptorV1(item, `${path}/items/${idx}`)));
  const nextCursor = checkCursor(obj.next_cursor, `${path}/next_cursor`);

  return Object.freeze({
    status: obj.status,
    observed_at: observedAt,
    binding_revision: bindingRevision,
    items,
    next_cursor: nextCursor,
  });
}

// ---------------------------------------------------------------------------
// Method 7: evaluations.read
// ---------------------------------------------------------------------------

export interface EvaluationsReadParamsV1 {
  readonly evaluation_ref: string;
  readonly expected_revision: string;
}

export interface EvaluationsReadReadyResultV1 {
  readonly status: 'ready';
  readonly descriptor: EvaluationDescriptorV1;
  readonly document: EvaluationDocumentV1;
}

export interface EvaluationsReadChangedOrMissingResultV1 {
  readonly status: 'changed' | 'missing';
  readonly evaluation_ref: string;
  readonly observed_revision: string | null;
}

export type EvaluationsReadResultV1 = EvaluationsReadReadyResultV1 | EvaluationsReadChangedOrMissingResultV1;

export function validateEvaluationsReadParams(raw: unknown, path = 'params'): EvaluationsReadParamsV1 {
  const obj = asObj(raw, path);
  checkNoUnknownKeys(obj, ['evaluation_ref', 'expected_revision'], path);

  const evaluationRef = checkOpaqueId(obj.evaluation_ref, `${path}/evaluation_ref`);
  const expectedRevision = checkOpaqueId(obj.expected_revision, `${path}/expected_revision`);

  return Object.freeze({
    evaluation_ref: evaluationRef,
    expected_revision: expectedRevision,
  });
}

export function validateEvaluationsReadResult(raw: unknown, path = 'result'): EvaluationsReadResultV1 {
  const obj = asObj(raw, path);

  if (typeof obj.status !== 'string' || !['ready', 'changed', 'missing'].includes(obj.status)) {
    fail('INVALID_INPUT', `${path}/status`, `Invalid evaluations read status: ${String(obj.status)}`);
  }

  if (obj.status === 'ready') {
    checkNoUnknownKeys(obj, ['status', 'descriptor', 'document'], path);
    const descriptor = validateEvaluationDescriptorV1(obj.descriptor, `${path}/descriptor`);
    if (!obj.document) {
      fail('INVALID_INPUT', `${path}/document`, 'document required when status is ready');
    }
    let document: EvaluationDocumentV1;
    try {
      document = validateEvaluationDocument(obj.document);
    } catch (err) {
      fail('INVALID_INPUT', `${path}/document`, String(err));
    }

    return Object.freeze({
      status: 'ready',
      descriptor,
      document,
    });
  }

  checkNoUnknownKeys(obj, ['status', 'evaluation_ref', 'observed_revision'], path);
  const evaluationRef = checkOpaqueId(obj.evaluation_ref, `${path}/evaluation_ref`);
  let observedRevision: string | null = null;
  if (obj.observed_revision !== null) {
    observedRevision = checkOpaqueId(obj.observed_revision, `${path}/observed_revision`);
  }

  return Object.freeze({
    status: obj.status as 'changed' | 'missing',
    evaluation_ref: evaluationRef,
    observed_revision: observedRevision,
  });
}

// ---------------------------------------------------------------------------
// Method 8: evaluations.compare
// ---------------------------------------------------------------------------

export interface EvaluationCompareItemRefV1 {
  readonly evaluation_ref: string;
  readonly expected_revision: string;
}

export interface EvaluationsCompareParamsV1 {
  readonly items: readonly EvaluationCompareItemRefV1[];
  readonly cursor: string | null;
  readonly limit: number;
}

export interface EvaluationsCompareReadyResultV1 {
  readonly status: 'ready';
  readonly source_revisions: readonly {
    readonly evaluation_ref: string;
    readonly observed_revision: string;
  }[];
  readonly groups: readonly ComparableEvaluationGroup[];
  readonly next_cursor: string | null;
  readonly returned_bytes: number;
}

export interface EvaluationsCompareChangedOrMissingResultV1 {
  readonly status: 'changed' | 'missing';
  readonly evaluation_ref: string;
  readonly observed_revision: string | null;
}

export type EvaluationsCompareResultV1 = EvaluationsCompareReadyResultV1 | EvaluationsCompareChangedOrMissingResultV1;

export function validateEvaluationsCompareParams(raw: unknown, path = 'params'): EvaluationsCompareParamsV1 {
  const obj = asObj(raw, path);
  checkNoUnknownKeys(obj, ['items', 'cursor', 'limit'], path);

  if (!Array.isArray(obj.items)) {
    fail('INVALID_INPUT', `${path}/items`, 'items must be an array');
  }
  if (obj.items.length < 1 || obj.items.length > MAX_COMPARE_ITEMS) {
    fail('INVALID_INPUT', `${path}/items`, `items count must be between 1 and ${MAX_COMPARE_ITEMS}`);
  }

  const items = Object.freeze(obj.items.map((item, idx) => {
    const itemObj = asObj(item, `${path}/items/${idx}`);
    checkNoUnknownKeys(itemObj, ['evaluation_ref', 'expected_revision'], `${path}/items/${idx}`);
    return Object.freeze({
      evaluation_ref: checkOpaqueId(itemObj.evaluation_ref, `${path}/items/${idx}/evaluation_ref`),
      expected_revision: checkOpaqueId(itemObj.expected_revision, `${path}/items/${idx}/expected_revision`),
    });
  }));

  const cursor = checkCursor(obj.cursor, `${path}/cursor`);
  const limit = checkSafeInteger(obj.limit, 1, MAX_EVALUATION_PAGE_LIMIT, `${path}/limit`);

  return Object.freeze({
    items,
    cursor,
    limit,
  });
}

export function validateEvaluationsCompareResult(raw: unknown, path = 'result'): EvaluationsCompareResultV1 {
  const obj = asObj(raw, path);

  if (typeof obj.status !== 'string' || !['ready', 'changed', 'missing'].includes(obj.status)) {
    fail('INVALID_INPUT', `${path}/status`, `Invalid compare status: ${String(obj.status)}`);
  }

  if (obj.status === 'ready') {
    checkNoUnknownKeys(obj, ['status', 'source_revisions', 'groups', 'next_cursor', 'returned_bytes'], path);

    if (!Array.isArray(obj.source_revisions)) {
      fail('INVALID_INPUT', `${path}/source_revisions`, 'source_revisions must be an array');
    }
    const sourceRevisions = Object.freeze(obj.source_revisions.map((rev, idx) => {
      const revObj = asObj(rev, `${path}/source_revisions/${idx}`);
      checkNoUnknownKeys(revObj, ['evaluation_ref', 'observed_revision'], `${path}/source_revisions/${idx}`);
      return Object.freeze({
        evaluation_ref: checkOpaqueId(revObj.evaluation_ref, `${path}/source_revisions/${idx}/evaluation_ref`),
        observed_revision: checkOpaqueId(revObj.observed_revision, `${path}/source_revisions/${idx}/observed_revision`),
      });
    }));

    if (!Array.isArray(obj.groups)) {
      fail('INVALID_INPUT', `${path}/groups`, 'groups must be an array');
    }
    const groups = Object.freeze([...obj.groups as unknown as ComparableEvaluationGroup[]]);

    const nextCursor = checkCursor(obj.next_cursor, `${path}/next_cursor`);
    const returnedBytes = checkSafeInteger(obj.returned_bytes, 0, MAX_PAGE_RESULT_BYTES, `${path}/returned_bytes`);

    return Object.freeze({
      status: 'ready',
      source_revisions: sourceRevisions,
      groups,
      next_cursor: nextCursor,
      returned_bytes: returnedBytes,
    });
  }

  checkNoUnknownKeys(obj, ['status', 'evaluation_ref', 'observed_revision'], path);
  const evaluationRef = checkOpaqueId(obj.evaluation_ref, `${path}/evaluation_ref`);
  let observedRevision: string | null = null;
  if (obj.observed_revision !== null) {
    observedRevision = checkOpaqueId(obj.observed_revision, `${path}/observed_revision`);
  }

  return Object.freeze({
    status: obj.status as 'changed' | 'missing',
    evaluation_ref: evaluationRef,
    observed_revision: observedRevision,
  });
}

// ---------------------------------------------------------------------------
// V2 Type and Validator Aliases for Methods 4 through 8
// ---------------------------------------------------------------------------

// Method 4: history.detail (v2)
export type HistoryDetailParamsV2 = HistoryDetailParamsV1;
export type HistoryDetailReadyResultV2 = HistoryDetailReadyResultV1;
export type HistoryDetailChangedOrMissingResultV2 = HistoryDetailChangedOrMissingResultV1;
export type HistoryDetailResultV2 = HistoryDetailResultV1;
export const validateHistoryDetailParamsV2 = validateHistoryDetailParams;
export const validateHistoryDetailResultV2 = validateHistoryDetailResult;

// Method 5: policy.readCurrent (v2)
export type PolicyReadCurrentParamsV2 = PolicyReadCurrentParamsV1;
export type PolicyReadCurrentResultV2 = PolicyReadCurrentResultV1;
export const validatePolicyReadCurrentParamsV2 = validatePolicyReadCurrentParams;
export const validatePolicyReadCurrentResultV2 = validatePolicyReadCurrentResult;

// Method 6: evaluations.list (v2)
export type EvaluationsListParamsV2 = EvaluationsListParamsV1;
export type EvaluationsListResultV2 = EvaluationsListResultV1;
export const validateEvaluationsListParamsV2 = validateEvaluationsListParams;
export const validateEvaluationsListResultV2 = validateEvaluationsListResult;

// Method 7: evaluations.read (v2)
export type EvaluationsReadParamsV2 = EvaluationsReadParamsV1;
export type EvaluationsReadReadyResultV2 = EvaluationsReadReadyResultV1;
export type EvaluationsReadChangedOrMissingResultV2 = EvaluationsReadChangedOrMissingResultV1;
export type EvaluationsReadResultV2 = EvaluationsReadResultV1;
export const validateEvaluationsReadParamsV2 = validateEvaluationsReadParams;
export const validateEvaluationsReadResultV2 = validateEvaluationsReadResult;

// Method 8: evaluations.compare (v2)
export type EvaluationCompareItemRefV2 = EvaluationCompareItemRefV1;
export type EvaluationsCompareParamsV2 = EvaluationsCompareParamsV1;
export type EvaluationsCompareReadyResultV2 = EvaluationsCompareReadyResultV1;
export type EvaluationsCompareChangedOrMissingResultV2 = EvaluationsCompareChangedOrMissingResultV1;
export type EvaluationsCompareResultV2 = EvaluationsCompareResultV1;
export const validateEvaluationsCompareParamsV2 = validateEvaluationsCompareParams;
export const validateEvaluationsCompareResultV2 = validateEvaluationsCompareResult;
