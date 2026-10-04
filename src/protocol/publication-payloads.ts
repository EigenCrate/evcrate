import type { JsonValue } from './json.js';
import {
  assertExactKeys, assertSafeBoundedJson, boundedText, normalizeTarget,
  validateOpaque, type PersistedTarget
} from './validation.js';
import { normalizeRelativePath } from '../filesystem/paths.js';
import {
  asPayloadObject, invalidResourcePayload, validateHash, validateTargetList
} from './resource-payload-validation.js';

export const PUBLICATION_SCOPES = Object.freeze(['home', 'project'] as const);
export type PublicationScope = typeof PUBLICATION_SCOPES[number];
export const PUBLICATION_PHASES = Object.freeze(['shared', 'harness'] as const);
export type PublicationPhase = typeof PUBLICATION_PHASES[number];
export const PUBLICATION_APPLY_STATUSES = Object.freeze(['committed', 'failed', 'not-started'] as const);
export type PublicationApplyStatus = typeof PUBLICATION_APPLY_STATUSES[number];

export const PUBLICATION_CHANGE_ACTIONS = Object.freeze([
  'create', 'update', 'delete', 'preserve', 'merge-create', 'merge-update', 'noop', 'conflict'
] as const);
export type PublicationChangeAction = typeof PUBLICATION_CHANGE_ACTIONS[number];
export type PublicationTarget = PersistedTarget | 'advisor-controller';

export const PUBLICATION_BINDING_ORDER = Object.freeze([
  '.evcrate/bin', '.gemini', '.agents', '.codex', '.pi', '.gemini/config', '.omp', '.claude', '.copilot', '.evcrate-vscode'
] as const);
export const PUBLICATION_TARGET_BINDINGS = Object.freeze({
  gemini: Object.freeze(['.gemini']),
  codex: Object.freeze(['.agents', '.codex']),
  pi: Object.freeze(['.pi']),
  antigravity: Object.freeze(['.gemini/config']),
  omp: Object.freeze(['.omp']),
  claude: Object.freeze(['.claude']),
  copilot: Object.freeze(['.copilot']),
  vscode: Object.freeze(['.evcrate-vscode'])
});
export const PUBLICATION_PROJECT_TARGET_BINDINGS = Object.freeze({
  claude: Object.freeze(['.claude']),
  codex: Object.freeze(['.codex', '.agents', 'AGENTS.md']),
  gemini: Object.freeze(['.gemini', 'GEMINI.md']),
  antigravity: Object.freeze(['.antigravity']),
  pi: Object.freeze(['.pi']),
  omp: Object.freeze(['.omp']),
  copilot: Object.freeze(['.copilot']),
  vscode: Object.freeze(['.evcrate-vscode'])
});
export const PUBLICATION_LOCAL_ROOTS = Object.freeze([
  '.evcrate/bin', '.gemini', '.agents', '.codex', '.antigravity', '.pi', '.omp', '.claude', '.copilot', '.evcrate-vscode'
] as const);
export const MAX_PUBLICATION_RESULT_BYTES = 2 * 1024 * 1024;
export const MAX_PUBLICATION_STATE_BYTES = 16 * 1024 * 1024;
export const PUBLICATION_TARGET_LOCAL_ROOTS = Object.freeze({
  gemini: Object.freeze(['.gemini']),
  codex: Object.freeze(['.codex', '.agents']),
  pi: Object.freeze(['.pi']),
  antigravity: Object.freeze(['.antigravity']),
  omp: Object.freeze(['.omp']),
  claude: Object.freeze(['.claude']),
  copilot: Object.freeze(['.copilot']),
  vscode: Object.freeze(['.evcrate-vscode'])
});
export const MAX_PUBLICATION_CHANGES = 10_000;
export const MAX_PUBLICATION_BINDINGS = 16;
export const MAX_PUBLICATION_RELEASE_ID_BYTES = 256;

export interface PublishRequestPayload {
  readonly scope: PublicationScope;
  readonly selectedTargets: readonly PersistedTarget[];
}
export interface RecoverRequestPayload {
  readonly scope: PublicationScope;
  readonly projectIdentity: string | null;
  readonly releaseId: string | null;
}
export type PublicationRequestPayload = PublishRequestPayload | RecoverRequestPayload;

export interface PublicationChange {
  readonly target: PublicationTarget;
  readonly path: string;
  readonly action: PublicationChangeAction;
  readonly beforeHash: string | null;
  readonly intendedHash: string | null;
}
export interface DryRunPhaseRecord {
  readonly phase: PublicationPhase;
  readonly scope: PublicationScope;
  readonly selectedTargets: readonly PersistedTarget[];
  readonly bindingOrder: readonly string[];
  readonly changes: readonly PublicationChange[];
}
export interface ApplyPhaseRecord extends DryRunPhaseRecord {
  readonly status: PublicationApplyStatus;
  readonly releaseId: string | null;
  readonly retainedReleaseId: string | null;
}
export interface PublishDryRunResultPayload {
  readonly scope: PublicationScope;
  readonly projectIdentity: string | null;
  readonly buildManifestPath: string;
  readonly buildManifestDigest: string;
  readonly phases: readonly [DryRunPhaseRecord, DryRunPhaseRecord];
}
export interface PublishApplyResultPayload {
  readonly scope: PublicationScope;
  readonly projectIdentity: string | null;
  readonly buildManifestPath: string;
  readonly buildManifestDigest: string;
  readonly phases: readonly [ApplyPhaseRecord, ApplyPhaseRecord];
}
export interface RecoveryPhaseRecord {
  readonly phase: PublicationPhase;
  readonly scope: PublicationScope;
  readonly releaseId: string;
  readonly action: 'rolled-back' | 'finalized';
  readonly selectedTargets: readonly PersistedTarget[];
  readonly bindingOrder: readonly string[];
}
export interface RecoverResultPayload {
  readonly scope: PublicationScope;
  readonly projectIdentity: string | null;
  readonly action: 'none' | 'recovered';
  readonly phases: readonly RecoveryPhaseRecord[];
}

const FORBIDDEN_METADATA_SEGMENTS = new Set(['.git', '.gitmodules', '.gitattributes', '.github', '.gitlab', '.hg', '.svn']);
const PROJECT_IDENTITY = /^[a-f0-9]{64}$/u;
const PHASE_KEYS = ['phase', 'scope', 'selectedTargets', 'bindingOrder', 'changes'] as const;
function relativeMetadataPath(value: unknown): string {
  const path = normalizeRelativePath(boundedText(value, 4096, 'metadata path'));
  if (path.split('/').some((segment) => FORBIDDEN_METADATA_SEGMENTS.has(segment)
    || segment === '.env' || (segment.startsWith('.env.') && segment !== '.env.example'))) invalidResourcePayload();
  return path;
}
function nullableHash(value: unknown): string | null {
  return value === null ? null : validateHash(value);
}
export function validatePublicationScope(value: unknown): PublicationScope {
  if (typeof value !== 'string' || !PUBLICATION_SCOPES.includes(value as PublicationScope)) invalidResourcePayload();
  return value as PublicationScope;
}
export function validatePublicationProjectIdentity(value: unknown): string {
  if (typeof value !== 'string' || !PROJECT_IDENTITY.test(value)) invalidResourcePayload();
  return value;
}
function projectIdentity(scope: PublicationScope, value: unknown): string | null {
  return scope === 'home'
    ? value === null ? null : invalidResourcePayload()
    : validatePublicationProjectIdentity(value);
}
function targetList(value: unknown, allowEmpty = false): readonly PersistedTarget[] {
  if (allowEmpty && Array.isArray(value) && value.length === 0) return Object.freeze([]);
  return validateTargetList(value);
}
function target(value: unknown): PublicationTarget {
  return value === 'advisor-controller' ? value : normalizeTarget(value);
}
function targetBindings(scope: PublicationScope, targetId: PersistedTarget): readonly string[] {
  return scope === 'home' ? PUBLICATION_TARGET_BINDINGS[targetId] : PUBLICATION_PROJECT_TARGET_BINDINGS[targetId];
}
function expectedHarnessBindings(scope: PublicationScope, selectedTargets: readonly PersistedTarget[]): readonly string[] {
  if (scope === 'home') {
    const wanted = new Set(selectedTargets.flatMap((targetId) => targetBindings(scope, targetId)));
    return PUBLICATION_BINDING_ORDER.filter((binding) => binding !== '.evcrate/bin' && wanted.has(binding));
  }
  return selectedTargets.flatMap((targetId) => targetBindings(scope, targetId));
}
function bindingOrder(
  value: unknown, phase: PublicationPhase, scope: PublicationScope, selectedTargets: readonly PersistedTarget[]
): readonly string[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_PUBLICATION_BINDINGS) invalidResourcePayload();
  const result = value.map(relativeMetadataPath);
  if (new Set(result).size !== result.length) invalidResourcePayload();
  if (phase === 'shared') {
    if (result.length !== 1 || result[0] !== '.evcrate/bin') invalidResourcePayload();
    return Object.freeze(result);
  }
  const expected = expectedHarnessBindings(scope, selectedTargets);
  if (result.length !== expected.length || result.some((binding, index) => binding !== expected[index])) invalidResourcePayload();
  return Object.freeze(result);
}
function changes(
  value: unknown, phase: PublicationPhase, scope: PublicationScope,
  selectedTargets: readonly PersistedTarget[], bindings: readonly string[]
): readonly PublicationChange[] {
  if (!Array.isArray(value) || value.length > MAX_PUBLICATION_CHANGES) invalidResourcePayload();
  const result = value.map((entry): PublicationChange => {
    const raw = asPayloadObject(entry);
    assertExactKeys(raw, ['target', 'path', 'action', 'beforeHash', 'intendedHash']);
    if (typeof raw.action !== 'string' || !PUBLICATION_CHANGE_ACTIONS.includes(raw.action as PublicationChangeAction)) invalidResourcePayload();
    const changeTarget = target(raw.target);
    const path = relativeMetadataPath(raw.path);
    if (phase === 'shared') {
      if (changeTarget !== 'advisor-controller' || path !== '.evcrate/bin') invalidResourcePayload();
    } else {
      if (changeTarget === 'advisor-controller' || !selectedTargets.includes(changeTarget)) invalidResourcePayload();
      const matches = targetBindings(scope, changeTarget).filter((binding) =>
        bindings.includes(binding) && (path === binding || path.startsWith(`${binding}/`)));
      if (matches.length !== 1) invalidResourcePayload();
    }
    return Object.freeze({
      target: changeTarget, path, action: raw.action as PublicationChangeAction,
      beforeHash: nullableHash(raw.beforeHash), intendedHash: nullableHash(raw.intendedHash)
    });
  });
  return Object.freeze(result);
}
function validatePhase(
  value: unknown, phase: PublicationPhase, scope: PublicationScope,
  kind: 'dry-run' | 'apply'
): DryRunPhaseRecord | ApplyPhaseRecord {
  const raw = asPayloadObject(value);
  const keys = kind === 'apply'
    ? [...PHASE_KEYS, 'status', 'releaseId', 'retainedReleaseId'] : [...PHASE_KEYS];
  assertExactKeys(raw, keys);
  if (raw.phase !== phase) invalidResourcePayload();
  const phaseScope = phase === 'shared' ? 'home' : scope;
  if (raw.scope !== phaseScope) invalidResourcePayload();
  if (phase === 'shared' && (!Array.isArray(raw.selectedTargets) || raw.selectedTargets.length !== 0)) invalidResourcePayload();
  const selectedTargets = targetList(raw.selectedTargets, phase === 'shared');
  const bindingOrderValue = bindingOrder(raw.bindingOrder, phase, scope, selectedTargets);
  const base = {
    phase, scope: phaseScope, selectedTargets,
    bindingOrder: bindingOrderValue,
    changes: changes(raw.changes, phase, scope, selectedTargets, bindingOrderValue)
  } as const;
  if (kind === 'dry-run') return Object.freeze(base);
  if (typeof raw.status !== 'string' || !PUBLICATION_APPLY_STATUSES.includes(raw.status as PublicationApplyStatus)) invalidResourcePayload();
  const status = raw.status as PublicationApplyStatus;
  const releaseId = raw.releaseId === null ? null : validateOpaque(raw.releaseId, MAX_PUBLICATION_RELEASE_ID_BYTES, 'release id');
  const retainedReleaseId = raw.retainedReleaseId === null
    ? null : validateOpaque(raw.retainedReleaseId, MAX_PUBLICATION_RELEASE_ID_BYTES, 'retained release id');
  if (status === 'committed' && releaseId === null) invalidResourcePayload();
  if (status !== 'committed' && (releaseId !== null || retainedReleaseId !== null)) invalidResourcePayload();
  return Object.freeze({ ...base, status, releaseId, retainedReleaseId });
}
function phasePair(
  value: unknown, scope: PublicationScope, kind: 'dry-run' | 'apply', allowPartial = false
): readonly [DryRunPhaseRecord, DryRunPhaseRecord] | readonly [ApplyPhaseRecord, ApplyPhaseRecord] {
  if (!Array.isArray(value) || value.length !== 2) invalidResourcePayload();
  const shared = validatePhase(value[0], 'shared', scope, kind);
  const harness = validatePhase(value[1], 'harness', scope, kind);
  if (kind === 'dry-run') return Object.freeze([shared, harness]) as readonly [DryRunPhaseRecord, DryRunPhaseRecord];
  const applyShared = shared as ApplyPhaseRecord;
  const applyHarness = harness as ApplyPhaseRecord;
  const complete = applyShared.status === 'committed' && applyHarness.status === 'committed';
  const partial = allowPartial && scope === 'project'
    && applyShared.status === 'committed' && applyHarness.status === 'failed';
  if (!complete && !partial) invalidResourcePayload();
  if (complete) {
    if (scope === 'home') {
      if (applyShared.releaseId !== applyHarness.releaseId
        || applyShared.retainedReleaseId !== applyHarness.retainedReleaseId) invalidResourcePayload();
    } else if (applyShared.releaseId === applyHarness.releaseId || applyHarness.retainedReleaseId !== null) {
      invalidResourcePayload();
    }
  }
  return Object.freeze([applyShared, applyHarness]) as readonly [ApplyPhaseRecord, ApplyPhaseRecord];
}
function publishEnvelope(value: unknown, kind: 'dry-run' | 'apply', allowPartial = false): {
  scope: PublicationScope; projectIdentity: string | null; buildManifestPath: string;
  buildManifestDigest: string; phases: readonly [DryRunPhaseRecord, DryRunPhaseRecord] | readonly [ApplyPhaseRecord, ApplyPhaseRecord];
} {
  const raw = asPayloadObject(value);
  assertExactKeys(raw, ['scope', 'projectIdentity', 'buildManifestPath', 'buildManifestDigest', 'phases']);
  const scope = validatePublicationScope(raw.scope);
  return {
    scope, projectIdentity: projectIdentity(scope, raw.projectIdentity),
    buildManifestDigest: validateHash(raw.buildManifestDigest),
    buildManifestPath: relativeMetadataPath(raw.buildManifestPath),
    phases: phasePair(raw.phases, scope, kind, allowPartial)
  };
}
export function validatePublishRequestPayload(value: unknown): PublishRequestPayload {
  assertSafeBoundedJson(value);
  const raw = asPayloadObject(value);
  assertExactKeys(raw, ['scope', 'selectedTargets']);
  return Object.freeze({ scope: validatePublicationScope(raw.scope), selectedTargets: validateTargetList(raw.selectedTargets) });
}
export function validateRecoverRequestPayload(value: unknown): RecoverRequestPayload {
  assertSafeBoundedJson(value);
  const raw = asPayloadObject(value);
  assertExactKeys(raw, ['scope', 'projectIdentity', 'releaseId']);
  const scope = validatePublicationScope(raw.scope);
  return Object.freeze({
    scope, projectIdentity: projectIdentity(scope, raw.projectIdentity),
    releaseId: raw.releaseId === null ? null : validateOpaque(raw.releaseId, MAX_PUBLICATION_RELEASE_ID_BYTES, 'release id')
  });
}
export function validatePublishDryRunResultPayload(value: unknown): PublishDryRunResultPayload {
  assertSafeBoundedJson(value, MAX_PUBLICATION_RESULT_BYTES);
  const result = publishEnvelope(value, 'dry-run');
  return Object.freeze({ ...result, phases: result.phases as readonly [DryRunPhaseRecord, DryRunPhaseRecord] });
}
export function validatePublishApplyResultPayload(
  value: unknown, allowPartial = false
): PublishApplyResultPayload {
  assertSafeBoundedJson(value, MAX_PUBLICATION_RESULT_BYTES);
  const result = publishEnvelope(value, 'apply', allowPartial);
  return Object.freeze({ ...result, phases: result.phases as readonly [ApplyPhaseRecord, ApplyPhaseRecord] });
}
function validateRecoveryPhase(
  value: unknown, phase: PublicationPhase, scope: PublicationScope
): RecoveryPhaseRecord {
  const raw = asPayloadObject(value);
  assertExactKeys(raw, ['phase', 'scope', 'releaseId', 'action', 'selectedTargets', 'bindingOrder']);
  if (raw.phase !== phase || raw.scope !== (phase === 'shared' ? 'home' : scope)) invalidResourcePayload();
  if (phase === 'shared' && (!Array.isArray(raw.selectedTargets) || raw.selectedTargets.length !== 0)) invalidResourcePayload();
  const selectedTargets = targetList(raw.selectedTargets, phase === 'shared');
  const bindingOrderValue = bindingOrder(raw.bindingOrder, phase, scope, selectedTargets);
  if (raw.action !== 'rolled-back' && raw.action !== 'finalized') invalidResourcePayload();
  return Object.freeze({
    phase, scope: phase === 'shared' ? 'home' : scope,
    releaseId: validateOpaque(raw.releaseId, MAX_PUBLICATION_RELEASE_ID_BYTES, 'release id'),
    action: raw.action, selectedTargets, bindingOrder: bindingOrderValue
  });
}
export function validateRecoverResultPayload(value: unknown): RecoverResultPayload {
  assertSafeBoundedJson(value);
  const raw = asPayloadObject(value);
  assertExactKeys(raw, ['scope', 'projectIdentity', 'action', 'phases']);
  const scope = validatePublicationScope(raw.scope);
  const identity = projectIdentity(scope, raw.projectIdentity);
  if (raw.action !== 'none' && raw.action !== 'recovered') invalidResourcePayload();
  if (!Array.isArray(raw.phases) || raw.phases.length > 2) invalidResourcePayload();
  if (raw.action === 'none') {
    if (raw.phases.length !== 0) invalidResourcePayload();
    return Object.freeze({ scope, projectIdentity: identity, action: 'none', phases: Object.freeze([]) });
  }
  if (scope === 'project') {
    if (raw.phases.length !== 1) invalidResourcePayload();
    const phase = validateRecoveryPhase(raw.phases[0], 'harness', scope);
    return Object.freeze({ scope, projectIdentity: identity, action: 'recovered', phases: Object.freeze([phase]) });
  }
  const shared = validateRecoveryPhase(raw.phases[0], 'shared', scope);
  if (raw.phases.length === 1) return Object.freeze({ scope, projectIdentity: identity, action: 'recovered', phases: Object.freeze([shared]) });
  const harness = validateRecoveryPhase(raw.phases[1], 'harness', scope);
  if (shared.releaseId !== harness.releaseId || shared.action !== harness.action) invalidResourcePayload();
  return Object.freeze({ scope, projectIdentity: identity, action: 'recovered', phases: Object.freeze([shared, harness]) });
}
export function validatePublicationRequestPayload(operation: string, value: unknown): JsonValue {
  if (operation === 'publish.dry-run' || operation === 'publish.apply'
    || operation === 'distribute.publish' || operation === 'distribute.all') {
    return validatePublishRequestPayload(value) as unknown as JsonValue;
  }
  if (operation === 'recover' || operation === 'distribute.recover') {
    return validateRecoverRequestPayload(value) as unknown as JsonValue;
  }
  invalidResourcePayload();
}
export function validatePublicationResultPayload(operation: string, value: unknown): JsonValue {
  if (operation === 'publish.dry-run') return validatePublishDryRunResultPayload(value) as unknown as JsonValue;
  if (operation === 'publish.apply' || operation === 'distribute.publish' || operation === 'distribute.all') {
    return validatePublishApplyResultPayload(value) as unknown as JsonValue;
  }
  if (operation === 'recover' || operation === 'distribute.recover') return validateRecoverResultPayload(value) as unknown as JsonValue;
  invalidResourcePayload();
}
