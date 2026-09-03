import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { ControlPlaneError, serializeControlPlaneError } from '../errors/control-plane-error.js';
import { parseJsonDocument, isPlainObject } from '../protocol/json.js';
import {
  createAdvisorSettingsRequest, createSettingsErrorResult, validateAdvisorSettingsRequest,
  validateAdvisorSettingsResult
} from '../protocol/advisor-settings.js';
import type { AdvisorSettingsRequest, AdvisorSettingsResult } from '../protocol/advisor-settings.js';
import { createDiagnosticRequest, validateDiagnosticRequest } from '../protocol/diagnostic.js';
import { createResourceRequest, createResourceRecoveryResult, createResourceResult, validateResourceRequest, validateResourceResult } from '../protocol/resource-control.js';
import { PROTOCOL_VERSION } from '../protocol/validation.js';
import {
  PUBLICATION_BINDING_ORDER, validatePublishApplyResultPayload, validatePublishDryRunResultPayload,
  validateRecoverResultPayload
} from '../protocol/publication-payloads.js';
import type { ResourceContext, ResourceRequest, ResourceResult } from '../protocol/resource-control.js';
import type { JsonValue } from '../protocol/json.js';
import type {
  ScopeMutation, ScopeMutationPayload
} from '../protocol/scope-payloads.js';
import { validateScopeRevisionVector } from '../protocol/scope-payloads.js';
import type { InvocationContext } from '../context/invocation-context.js';
import type { CliInvocation } from './arguments.js';
import { runCompatibilityDistribution, runTypedPublication } from './compatibility-distribution.js';
import { runHealth } from './health.js';
import { exitCodeForResult } from './output.js';
import type { CliResult } from './output.js';
import { createResourceHandler, defaultResourceHandler } from '../imports/handler.js';
import type { ResourceHandler } from '../imports/handler.js';
import { createAdvisorSettingsCoordinator, defaultAdvisorSettingsCoordinator } from '../advisor-settings/coordinator.js';
import type { CliRuntime } from './types.js';

export interface DispatchOutcome {
  readonly result: CliResult;
  readonly exitCode: number;
}

function version(context: InvocationContext, runtime: CliRuntime): string {
  if (runtime.packageVersion) return runtime.packageVersion;
  for (const root of [context.packageRoot, join(__dirname, '..', '..')]) {
    try {
      const parsed = parseJsonDocument(readFileSync(join(root, 'package.json')));
      if (isPlainObject(parsed) && typeof parsed.version === 'string' && parsed.version) return parsed.version;
    } catch { /* try next root */ }
  }
  throw new ControlPlaneError('INTERNAL_ERROR');
}

function unsupportedSettingsResult(
  requestId: string,
  operation: AdvisorSettingsRequest['operation']
): AdvisorSettingsResult {
  return validateAdvisorSettingsResult({
    protocol: 'evcrate-advisor-settings',
    protocolVersion: PROTOCOL_VERSION,
    requestId,
    operation,
    status: 'FAILED',
    error: serializeControlPlaneError(new ControlPlaneError('CAPABILITY_UNSUPPORTED'))
  });
}


function versionResult(requestId: string, versionValue: string): ResourceResult {
  return {
    protocol: 'evcrate-resource-control', protocolVersion: PROTOCOL_VERSION, requestId,
    operation: 'version', status: 'ok', payload: { version: versionValue }
  };
}

function resourceError(request: ResourceRequest, error: unknown): ResourceResult {
  return {
    protocol: 'evcrate-resource-control', protocolVersion: PROTOCOL_VERSION,
    requestId: request.requestId, operation: request.operation, status: 'error',
    error: serializeControlPlaneError(error)
  };
}
function assertResourceContext(request: ResourceRequest, context: InvocationContext): void {
  const target = context.selectedTargets.find(({ id }) => id === request.context.target);
  if (!target || target.manifestPath !== request.context.targetManifestPath
    || target.generatedRoots[0] !== request.context.generatedRoot
    || target.homeBindings[0]?.homeRoot !== request.context.homeRoot
    || request.context.canonicalSourceRoot !== context.canonicalSourceRoot
    || request.context.stateRoot !== context.stateRoot
    || request.context.projectRoot !== context.projectRoot
    || (context.projectId === null ? request.context.projectId !== 'global' : request.context.projectId !== context.projectId)) {
    throw new ControlPlaneError('PROTOCOL_INVALID');
  }
}
function numericOption(value: string | undefined, fallback: number, maximum: number): number {
  if (value === undefined) return fallback;
  if (!/^\d+$/u.test(value)) throw new ControlPlaneError('VALIDATION_INVALID');
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0 || parsed > maximum) throw new ControlPlaneError('VALIDATION_INVALID');
  return parsed;
}
function expectedRevision(value: string | undefined): ReturnType<typeof validateScopeRevisionVector> {
  if (value === undefined) throw new ControlPlaneError('VALIDATION_INVALID');
  try { return validateScopeRevisionVector(parseJsonDocument(value)); }
  catch (error) {
    if (error instanceof ControlPlaneError) throw error;
    throw new ControlPlaneError('VALIDATION_INVALID');
  }
}
function resourceContext(context: InvocationContext): ResourceContext {
  const targetId = context.selectedTargetIds[0];
  const target = context.selectedTargets[0];
  if (!targetId || !target) throw new ControlPlaneError('CAPABILITY_UNSUPPORTED');
  return {
    canonicalSourceRoot: context.canonicalSourceRoot, targetManifestPath: target.manifestPath,
    generatedRoot: target.generatedRoots[0], homeRoot: target.homeBindings[0]?.homeRoot ?? context.homeRoot,
    stateRoot: context.stateRoot, projectId: context.projectId ?? 'global', projectRoot: context.projectRoot, target: targetId
  };
}
function scopeMutation(action: 'assign' | 'remove' | 'enable' | 'disable', invocation: CliInvocation, context: InvocationContext): { operation: ScopeMutation; payload: ScopeMutationPayload } {
  const expected = expectedRevision(invocation.options.expectedRevision);
  const resourceId = invocation.options.id ?? '';
  if (action === 'assign') {
    return { operation: 'scopes.assign', payload: {
      resourceId, targets: [...context.selectedTargetIds],
      capabilityApprovals: [...invocation.options.approveCapabilities], expectedRevision: expected
    } as ScopeMutationPayload };
  }
  return { operation: `scopes.${action}` as ScopeMutation, payload: { resourceId, expectedRevision: expected } };
}
function cliResourceRequest(requestId: string, invocation: CliInvocation, context: InvocationContext): ResourceRequest {
  const options = invocation.options;
  const envelope = resourceContext(context);
  if (invocation.command.kind === 'resources' && invocation.command.action === 'list') {
    return createResourceRequest(requestId, 'resources.list', envelope, {
      filters: options.kind === undefined ? {} : { kind: options.kind },
      cursor: options.cursor ?? null, limit: numericOption(options.limit, 50, 100)
    });
  }
  if (invocation.command.kind === 'resources') {
    return createResourceRequest(requestId, 'resources.get', envelope, { id: options.id ?? '' });
  }
  if (invocation.command.kind === 'scopes') {
    if (invocation.command.action === 'list') return createResourceRequest(requestId, 'scopes.list', envelope, {});
    if (invocation.command.action === 'get') return createResourceRequest(requestId, 'scopes.get', envelope, { id: options.id ?? '' });
    const mutation = scopeMutation(invocation.command.action, invocation, context);
    return createResourceRequest(requestId, mutation.operation, envelope, mutation.payload as unknown as JsonValue);
  }
  if (invocation.command.kind === 'changes' && invocation.command.action === 'apply') {
    return createResourceRequest(requestId, 'changes.apply', envelope, { previewToken: options.previewToken ?? '' });
  }
  if (invocation.command.kind === 'changes') {
    const mutation = options.mutation ?? '';
    const expected = expectedRevision(options.expectedRevision);
    const payload = mutation === 'scopes.assign'
      ? {
        resourceId: options.id ?? '', targets: [...context.selectedTargetIds],
        capabilityApprovals: [...options.approveCapabilities], expectedRevision: expected
      }
      : { resourceId: options.id ?? '', expectedRevision: expected };
    return createResourceRequest(requestId, 'changes.preview', envelope, {
      mutation, payload, expiresInSeconds: numericOption(options.expirySeconds, 300, 900)
    } as unknown as JsonValue);
  }
  if (invocation.command.kind === 'imports' && invocation.command.action === 'preview') {
    return createResourceRequest(requestId, 'imports.preview', envelope, {
      sourcePath: options.importSource ?? '', kind: options.kind ?? '', destination: options.destination ?? '',
      provenance: options.provenance ?? '', selectedTargets: [...context.selectedTargetIds],
      capabilityApprovals: [...options.approveCapabilities],
      expiresInSeconds: numericOption(options.expirySeconds, 300, 900)
    });
  }
  return createResourceRequest(requestId, 'imports.apply', envelope, { previewToken: options.previewToken ?? '' });
}

async function settingsResult(
  request: AdvisorSettingsRequest,
  context: InvocationContext,
  runtime: CliRuntime
): Promise<AdvisorSettingsResult> {
  const handler = runtime.settingsHandler
    ?? (runtime.now === undefined ? defaultAdvisorSettingsCoordinator : createAdvisorSettingsCoordinator({ now: runtime.now }));
  const result = await handler.handle(request, context);
  const normalized = validateAdvisorSettingsResult(result);
  if (normalized.requestId !== request.requestId || normalized.operation !== request.operation) {
    throw new ControlPlaneError('PROTOCOL_INVALID');
  }
  return normalized;
}
function homeBindingName(context: InvocationContext, homeRoot: string): string {
  const value = relative(context.homeRoot, homeRoot).replaceAll('\\', '/');
  if (!value || value === '..' || value.startsWith('../')) throw new ControlPlaneError('PROTOCOL_INVALID');
  return value;
}
function publicationBindingOrder(
  context: InvocationContext, selectedTargets: readonly string[] = context.selectedTargetIds
): readonly string[] {
  const bindings = new Set<string>(['.evcrate/bin']);
  for (const targetId of selectedTargets) {
    const target = context.selectedTargets.find(({ id }) => id === targetId);
    if (!target) throw new ControlPlaneError('PROTOCOL_INVALID');
    for (const binding of target.homeBindings) {
      const name = homeBindingName(context, binding.homeRoot);
      if (bindings.has(name)) throw new ControlPlaneError('PROTOCOL_INVALID');
      bindings.add(name);
    }
  }
  return PUBLICATION_BINDING_ORDER.filter((binding) => bindings.has(binding));
}
function assertExactValues(actual: readonly string[], expected: readonly string[]): void {
  if (actual.length !== expected.length || actual.some((value, index) => value !== expected[index])) {
    throw new ControlPlaneError('PROTOCOL_INVALID');
  }
}
function assertSameTargets(actual: readonly string[], expected: readonly string[]): void {
  const actualSorted = [...actual].sort();
  const expectedSorted = [...expected].sort();
  assertExactValues(actualSorted, expectedSorted);
}
function assertPublicationCorrelation(
  context: InvocationContext,
  selectedTargets: readonly string[],
  bindingOrder: readonly string[],
  changes: readonly { target: string; path: string }[]
): void {
  assertSameTargets(selectedTargets, context.selectedTargetIds);
  assertExactValues(bindingOrder, publicationBindingOrder(context, selectedTargets));
  const targetBindings = new Map<string, Set<string>>([['advisor-controller', new Set(['.evcrate/bin'])]]);
  for (const targetId of selectedTargets) {
    const target = context.selectedTargets.find(({ id }) => id === targetId);
    if (!target) throw new ControlPlaneError('PROTOCOL_INVALID');
    targetBindings.set(targetId, new Set(target.homeBindings.map(({ homeRoot }) => homeBindingName(context, homeRoot))));
  }
  for (const change of changes) {
    const bindings = targetBindings.get(change.target);
    if (!bindings) throw new ControlPlaneError('PROTOCOL_INVALID');
    const matches = [...bindings].filter((binding) => change.path === binding || change.path.startsWith(`${binding}/`));
    if (matches.length !== 1) throw new ControlPlaneError('PROTOCOL_INVALID');
  }
}
async function publicationResult(
  request: ResourceRequest, context: InvocationContext, runtime: CliRuntime
): Promise<ResourceResult> {
  const handler = runtime.publicationHandler;
  if (request.operation === 'publish.dry-run' || request.operation === 'publish.apply') {
    const requested = (request.payload as unknown as { selectedTargets: readonly string[] }).selectedTargets;
    assertSameTargets(requested, context.selectedTargetIds);
    if (request.operation === 'publish.dry-run') {
      const raw = handler
        ? await handler.publishDryRun(context)
        : await runTypedPublication('publish.dry-run', context, runtime);
      const payload = validatePublishDryRunResultPayload(raw);
      assertPublicationCorrelation(context, payload.selectedTargets, payload.bindingOrder, payload.changes);
      return createResourceResult(request, payload as unknown as JsonValue, 'preview');
    }
    const options = { ...(runtime.publicationOptions ?? {}), abortSignal: runtime.publicationOptions?.abortSignal ?? runtime.abortSignal };
    const raw = handler
      ? await handler.publishApply(context, options)
      : await runTypedPublication('publish.apply', context, runtime);
    const payload = validatePublishApplyResultPayload(raw);
    assertPublicationCorrelation(context, payload.selectedTargets, payload.bindingOrder, payload.changes);
    return createResourceResult(request, payload as unknown as JsonValue, 'published');
  }
  const requestedReleaseId = (request.payload as unknown as { releaseId: string | null }).releaseId;
  const raw = handler
    ? await handler.recover(context, requestedReleaseId)
    : await runTypedPublication('recover', context, runtime, requestedReleaseId);
  const payload = validateRecoverResultPayload(raw);
  if (requestedReleaseId !== null && payload.releaseId !== requestedReleaseId) {
    throw new ControlPlaneError('PROTOCOL_INVALID');
  }
  if (payload.action !== 'none') {
    if (payload.selectedTargets.some((target) => !context.selectedTargetIds.includes(target))) {
      throw new ControlPlaneError('PROTOCOL_INVALID');
    }
    assertExactValues(payload.bindingOrder, publicationBindingOrder(context, payload.selectedTargets));
  }
  if (payload.action === 'none') {
    return createResourceRecoveryResult(request, payload as unknown as JsonValue, { kind: 'none', identity: 'none' });
  }
  if (payload.releaseId === null) throw new ControlPlaneError('PROTOCOL_INVALID');
  return createResourceRecoveryResult(request, payload as unknown as JsonValue, {
    kind: 'required', identity: payload.releaseId
  });
}

async function dispatchRequest(
  request: JsonValue,
  invocation: CliInvocation,
  context: InvocationContext,
  runtime: CliRuntime
): Promise<DispatchOutcome> {
  if (!isPlainObject(request) || typeof request.protocol !== 'string') {
    throw new ControlPlaneError('PROTOCOL_INVALID');
  }
  if (request.protocol === 'evcrate-advisor-diagnostic') {
    const diagnosticRequest = validateDiagnosticRequest(request);
    const result = await runHealth(context, runtime, diagnosticRequest, invocation.options.timeoutMs);
    return { result, exitCode: exitCodeForResult(result) };
  }
  if (request.protocol === 'evcrate-advisor-settings') {
    const settingsRequest = validateAdvisorSettingsRequest(request);
    if (invocation.command.kind === 'advisor-settings'
      && invocation.command.operation !== settingsRequest.operation) throw new ControlPlaneError('PROTOCOL_INVALID');
    const result = await settingsResult(settingsRequest, context, runtime);
    return { result, exitCode: exitCodeForResult(result) };
  }
  if (request.protocol === 'evcrate-resource-control') {
    const resourceRequest = validateResourceRequest(request);
    assertResourceContext(resourceRequest, context);
    if (resourceRequest.operation === 'version') {
      const result = versionResult(resourceRequest.requestId, version(context, runtime));
      return { result, exitCode: 0 };
    }
    if (resourceRequest.operation === 'publish.dry-run' || resourceRequest.operation === 'publish.apply' || resourceRequest.operation === 'recover') {
      try {
        const result = await publicationResult(resourceRequest, context, runtime);
        return { result, exitCode: exitCodeForResult(result) };
      } catch (error) {
        const result = resourceError(resourceRequest, error);
        return { result, exitCode: exitCodeForResult(result) };
      }
    }
    const handler: ResourceHandler = runtime.resourceHandler
      ?? (runtime.now === undefined ? defaultResourceHandler : createResourceHandler({ now: runtime.now }));
    try {
      const handled = await handler.handle(resourceRequest, context);
      const result = validateResourceResult(handled);
      if (result.requestId !== resourceRequest.requestId || result.operation !== resourceRequest.operation) {
        throw new ControlPlaneError('PROTOCOL_INVALID');
      }
      return { result, exitCode: exitCodeForResult(result) };
    } catch (error) {
      const result = resourceError(resourceRequest, error);
      return { result, exitCode: exitCodeForResult(result) };
    }
  }
  throw new ControlPlaneError('PROTOCOL_INVALID');
}

export async function dispatchInvocation(
  invocation: CliInvocation,
  context: InvocationContext,
  runtime: CliRuntime = {},
  request?: JsonValue,
  requestId = runtime.requestId?.() ?? 'request-1'
): Promise<DispatchOutcome> {
  if (request !== undefined || invocation.command.kind === 'request-file') {
    if (request === undefined) throw new ControlPlaneError('PROTOCOL_INVALID');
    return dispatchRequest(request, invocation, context, runtime);
  }
  switch (invocation.command.kind) {
    case 'version': {
      const result = versionResult(requestId, version(context, runtime));
      return { result, exitCode: 0 };
    }
    case 'health': {
      const result = await runHealth(
        context, runtime, createDiagnosticRequest(requestId), invocation.options.timeoutMs
      );
      return { result, exitCode: exitCodeForResult(result) };
    }
    case 'advisor-settings': {
      if (invocation.command.operation !== 'get') {
        const result = unsupportedSettingsResult(requestId, invocation.command.operation);
        return { result, exitCode: exitCodeForResult(result) };
      }
      const requestValue = createAdvisorSettingsRequest(requestId, 'get');
      const result = await settingsResult(requestValue, context, runtime);
      return { result, exitCode: exitCodeForResult(result) };
    }
    case 'distribute': {
      const result = await runCompatibilityDistribution(invocation, context, {
        ...runtime, requestId: () => requestId
      });
      return { result, exitCode: exitCodeForResult(result) };
    }
    case 'publish': {
      const operation = invocation.command.action === 'dry-run' ? 'publish.dry-run' : 'publish.apply';
      const requestValue = createResourceRequest(requestId, operation, resourceContext(context), {
        selectedTargets: [...context.selectedTargetIds]
      });
      return dispatchRequest(requestValue as unknown as JsonValue, invocation, context, runtime);
    }
    case 'recover': {
      const requestValue = createResourceRequest(requestId, 'recover', resourceContext(context), { releaseId: null });
      return dispatchRequest(requestValue as unknown as JsonValue, invocation, context, runtime);
    }
    case 'resources':
    case 'imports':
    case 'scopes':
    case 'changes': {
      const requestValue = cliResourceRequest(requestId, invocation, context);
      return dispatchRequest(requestValue as unknown as JsonValue, invocation, context, runtime);
    }
  }
}
