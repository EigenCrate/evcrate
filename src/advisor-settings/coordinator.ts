import { randomBytes } from 'node:crypto';
import { join, resolve } from 'node:path';
import { ControlPlaneError } from '../errors/control-plane-error.js';
import type { InvocationContext } from '../context/invocation-context.js';
import {
  canonicalAdvisorPolicyDigest, createSettingsApplyResult, createSettingsConflictResult,
  createSettingsErrorResult, createSettingsGetResult, createSettingsPreviewResult,
  type AdvisorPolicy, type AdvisorSettingsRequest,
  type AdvisorSettingsResult, type SettingsRevision
} from '../protocol/advisor-settings.js';
import { withSettingsLock } from '../filesystem/locking.js';
import { applyAdvisorPolicyUnlocked, type AdvisorPolicyHooks } from './transactions.js';
import { recoverAdvisorPolicyUnlocked } from './recovery.js';
import { readAdvisorPolicy, revisionsEqual } from './policy-files.js';
import {
  consumeAdvisorSettingsPreview, loadAdvisorSettingsPreview, saveAdvisorSettingsPreview,
  type AdvisorSettingsPreviewToken
} from './preview-store.js';

const PREVIEW_LIFETIME_MS = 900_000;
export interface AdvisorSettingsCoordinatorOptions {
  readonly now?: () => number;
  readonly applyHooks?: AdvisorPolicyHooks;
}
function destination(context: InvocationContext): string { return resolve(join(context.homeRoot, '.evcrate', 'advisor-routing.json')); }
function requestedDestination(context: InvocationContext, value: string): boolean { return resolve(value) === destination(context); }
function nowValue(now: () => number): number {
  const value = now();
  if (!Number.isSafeInteger(value) || value < 0) throw new ControlPlaneError('VALIDATION_INVALID');
  return value;
}
function current(context: InvocationContext) {
  recoverAdvisorPolicyUnlocked(context.stateRoot);
  return readAdvisorPolicy(destination(context));
}
function preview(request: AdvisorSettingsRequest, context: InvocationContext, now: () => number): AdvisorSettingsResult {
  const payload = request.payload as unknown as {
    policy: AdvisorPolicy; currentRevision: SettingsRevision; destination: string;
  };
  if (!requestedDestination(context, payload.destination)) throw new ControlPlaneError('PATH_UNSAFE');
  const snapshot = current(context);
  if (!revisionsEqual(snapshot.revision, payload.currentRevision)) throw new ControlPlaneError('CAS_CONFLICT');
  const issuedAt = nowValue(now);
  const expiresAt = issuedAt + PREVIEW_LIFETIME_MS;
  const token = randomBytes(32).toString('hex');
  const record: AdvisorSettingsPreviewToken = {
    schema_version: 1, operation: 'advisor-settings.preview', token, destination: destination(context),
    policy: payload.policy, currentRevision: payload.currentRevision, expiresAt,
    intendedDigest: canonicalAdvisorPolicyDigest(payload.policy)
  };
  saveAdvisorSettingsPreview(context.stateRoot, record);
  return createSettingsPreviewResult(request, token, expiresAt, snapshot.revision, record.intendedDigest, record.destination, issuedAt);
}
function apply(
  request: AdvisorSettingsRequest, context: InvocationContext, now: () => number, hooks?: AdvisorPolicyHooks
): AdvisorSettingsResult {
  const payload = request.payload as unknown as { token: string; currentRevision: SettingsRevision };
  const snapshot = current(context);
  if (!revisionsEqual(snapshot.revision, payload.currentRevision)) return createSettingsConflictResult(request, payload.currentRevision, snapshot.revision);
  const record = loadAdvisorSettingsPreview(context.stateRoot, payload.token);
  if (!requestedDestination(context, record.destination) || !revisionsEqual(record.currentRevision, payload.currentRevision)) {
    return createSettingsConflictResult(request, record.currentRevision, snapshot.revision);
  }
  if (nowValue(now) >= record.expiresAt) return createSettingsConflictResult(request, record.currentRevision, snapshot.revision);
  const applied = applyAdvisorPolicyUnlocked(destination(context), record.policy, record.currentRevision, {
    stateRoot: context.stateRoot, hooks
  });
  // The committed revision is the durable replay barrier if cleanup fails.
  consumeAdvisorSettingsPreview(context.stateRoot, payload.token);
  return createSettingsApplyResult(request, applied.revision, { kind: 'none', identity: 'none' });
}
export function createAdvisorSettingsCoordinator(options: AdvisorSettingsCoordinatorOptions = {}): { handle: (request: AdvisorSettingsRequest, context: InvocationContext) => AdvisorSettingsResult } {
  const now = options.now ?? Date.now;
  return {
    handle(request, context): AdvisorSettingsResult {
      try {
        if (request.operation === 'get') {
          return withSettingsLock(context.stateRoot, () => {
            const snapshot = current(context);
            return createSettingsGetResult(request, snapshot.policy, snapshot.revision);
          });
        }
        if (request.operation === 'preview') return withSettingsLock(context.stateRoot, () => preview(request, context, now));
        return withSettingsLock(context.stateRoot, () => apply(request, context, now, options.applyHooks));
      } catch (error) { return createSettingsErrorResult(request, error); }
    }
  };
}
export const defaultAdvisorSettingsCoordinator = createAdvisorSettingsCoordinator();
