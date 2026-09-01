import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ControlPlaneError, serializeControlPlaneError } from '../errors/control-plane-error.js';
import { parseJsonDocument, isPlainObject } from '../protocol/json.js';
import {
  createAdvisorSettingsRequest, createSettingsErrorResult, validateAdvisorSettingsRequest,
  validateAdvisorSettingsResult
} from '../protocol/advisor-settings.js';
import type { AdvisorSettingsRequest, AdvisorSettingsResult } from '../protocol/advisor-settings.js';
import { createDiagnosticRequest, validateDiagnosticRequest } from '../protocol/diagnostic.js';
import { createResourceRequest, validateResourceRequest, validateResourceResult } from '../protocol/resource-control.js';
import { PROTOCOL_VERSION } from '../protocol/validation.js';
import type { ResourceContext, ResourceRequest, ResourceResult } from '../protocol/resource-control.js';
import type { JsonValue } from '../protocol/json.js';
import type { InvocationContext } from '../context/invocation-context.js';
import type { CliInvocation } from './arguments.js';
import { runCompatibilityDistribution } from './compatibility-distribution.js';
import { runHealth } from './health.js';
import { exitCodeForResult } from './output.js';
import type { CliResult } from './output.js';
import { createResourceHandler, defaultResourceHandler } from '../imports/handler.js';
import type { ResourceHandler } from '../imports/handler.js';
import type { CliRuntime, AdvisorSettingsHandler } from './types.js';

export interface DispatchOutcome {
  readonly result: CliResult;
  readonly exitCode: number;
}

const unsupportedSettings: AdvisorSettingsHandler = {
  handle(request) {
    return createSettingsErrorResult(request, new ControlPlaneError('CAPABILITY_UNSUPPORTED'));
  }
};

function version(context: InvocationContext, runtime: CliRuntime): string {
  if (runtime.packageVersion) return runtime.packageVersion;
  try {
    const parsed = parseJsonDocument(readFileSync(join(context.packageRoot, 'package.json')));
    if (isPlainObject(parsed) && typeof parsed.version === 'string' && parsed.version) return parsed.version;
  } catch { /* use a safe internal failure below */ }
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
  const handler = runtime.settingsHandler ?? unsupportedSettings;
  const result = await handler.handle(request, context);
  const normalized = validateAdvisorSettingsResult(result);
  if (normalized.requestId !== request.requestId || normalized.operation !== request.operation) {
    throw new ControlPlaneError('PROTOCOL_INVALID');
  }
  return normalized;
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
    case 'resources':
    case 'imports': {
      const requestValue = cliResourceRequest(requestId, invocation, context);
      return dispatchRequest(requestValue as unknown as JsonValue, invocation, context, runtime);
    }
  }
}
