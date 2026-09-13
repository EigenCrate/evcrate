import { ControlPlaneError, serializeControlPlaneError } from '../errors/control-plane-error.js';
import {
  type PublishApplyResultPayload, type PublishDryRunResultPayload, type PublicationRequestPayload,
  type PublishRequestPayload, type RecoverRequestPayload, type RecoverResultPayload
} from '../protocol/publication-payloads.js';
import {
  publishDryRun, publishApply, recoverPublication, isPublicationPartialError,
  type PublicationPartialError
} from '../distribution/publication.js';
import { runLocalDistribution } from '../distribution/local-build.js';
import { assertUniformAuthoritativeEngine } from '../distribution/cutover.js';
import { projectIdentity } from '../scopes/identity.js';
import { PROTOCOL_VERSION } from '../protocol/validation.js';
import type { JsonValue } from '../protocol/json.js';
import { validateResourceResult } from '../protocol/resource-control.js';
import type { ResourceOperation, ResourceResult, ResourceSuccessStatus } from '../protocol/resource-control.js';
import type { InvocationContext } from '../context/invocation-context.js';
import type { CliInvocation } from './arguments.js';
import type { CliRuntime } from './types.js';

type DistributeAction = 'build' | 'check' | 'publish' | 'all' | 'recover';

function operationFor(action: DistributeAction): ResourceOperation {
  return `distribute.${action}` as ResourceOperation;
}

function statusFor(action: DistributeAction): ResourceSuccessStatus {
  return action === 'publish' || action === 'all' ? 'activated' : 'ok';
}

function errorResult(requestId: string, operation: ResourceOperation, error: unknown): ResourceResult {
  return {
    protocol: 'evcrate-resource-control', protocolVersion: PROTOCOL_VERSION, requestId,
    operation, status: 'error', error: serializeControlPlaneError(error)
  };
}
function partialResult(
  requestId: string, operation: ResourceOperation, error: PublicationPartialError
): ResourceResult {
  return validateResourceResult({
    protocol: 'evcrate-resource-control', protocolVersion: PROTOCOL_VERSION, requestId,
    operation, status: 'partial', payload: error.payload as unknown as JsonValue,
    error: serializeControlPlaneError(new ControlPlaneError(error.code))
  });
}

function defaultTypedRequest(
  operation: 'publish.dry-run' | 'publish.apply' | 'recover',
  context: InvocationContext
): PublicationRequestPayload {
  return operation === 'recover'
    ? { scope: 'home', projectIdentity: null, releaseId: null }
    : { scope: 'home', selectedTargets: context.selectedTargetIds };
}

export async function runTypedPublication(
  operation: 'publish.dry-run' | 'publish.apply' | 'recover',
  context: InvocationContext,
  runtime: CliRuntime = {},
  request: PublicationRequestPayload = defaultTypedRequest(operation, context)
): Promise<PublishDryRunResultPayload | PublishApplyResultPayload | RecoverResultPayload> {
  const engine = assertUniformAuthoritativeEngine(context.selectedTargetIds, runtime.engineSelectionOptions);

  if (engine === 'typescript') {
    if (operation === 'publish.dry-run') {
      if (!('selectedTargets' in request)) throw new ControlPlaneError('PROTOCOL_INVALID');
      return publishDryRun(context, request as PublishRequestPayload);
    }
    if (operation === 'publish.apply') {
      if (!('selectedTargets' in request)) throw new ControlPlaneError('PROTOCOL_INVALID');
      return publishApply(context, runtime.publicationOptions ?? {}, request as PublishRequestPayload);
    }
    if (!('releaseId' in request)) throw new ControlPlaneError('PROTOCOL_INVALID');
    return recoverPublication(context, request as RecoverRequestPayload);
  }

  throw new ControlPlaneError('CAPABILITY_UNSUPPORTED');
}

function compatibilityRequest(
  action: DistributeAction, invocation: CliInvocation, context: InvocationContext,
  request?: PublicationRequestPayload
): PublicationRequestPayload | undefined {
  if (request !== undefined) {
    const isPublish = action === 'publish' || action === 'all';
    const isRecover = action === 'recover';
    if (isPublish !== ('selectedTargets' in request) || isRecover !== ('releaseId' in request)) {
      throw new ControlPlaneError('PROTOCOL_INVALID');
    }
    return request;
  }
  if (action === 'publish' || action === 'all') {
    const publish: PublishRequestPayload = {
      scope: invocation.options.scope, selectedTargets: [...context.selectedTargetIds]
    };
    return publish;
  }
  if (action === 'recover') {
    const recover: RecoverRequestPayload = {
      scope: invocation.options.scope,
      projectIdentity: invocation.options.scope === 'project' ? projectIdentity(context.projectRoot) : null,
      releaseId: null
    };
    return recover;
  }
  return undefined;
}
function assertCompatibilityRequestIdentity(
  context: InvocationContext, request: PublicationRequestPayload | undefined
): void {
  if (request === undefined || !('releaseId' in request)) return;
  const expectedIdentity = request.scope === 'project' ? projectIdentity(context.projectRoot) : null;
  if (request.projectIdentity !== expectedIdentity) throw new ControlPlaneError('PROTOCOL_INVALID');
}

function compatibilityResult(
  requestId: string, action: DistributeAction,
  outcome: Awaited<ReturnType<typeof runLocalDistribution>>
): ResourceResult {
  const operation = operationFor(action);
  if (action === 'recover') {
    if (outcome.action !== 'recover') throw new ControlPlaneError('PROTOCOL_INVALID');
    const payload = outcome.payload;
    if (payload.action === 'none') {
      return validateResourceResult({
        protocol: 'evcrate-resource-control', protocolVersion: PROTOCOL_VERSION, requestId,
        operation, status: 'recovered', payload,
        recovery: { kind: 'none', identity: 'none' }
      });
    }
    const releaseId = payload.phases[0]?.releaseId;
    if (releaseId === undefined) throw new ControlPlaneError('PROTOCOL_INVALID');
    return validateResourceResult({
      protocol: 'evcrate-resource-control', protocolVersion: PROTOCOL_VERSION, requestId,
      operation, status: 'recovered', payload,
      recovery: { kind: 'required', identity: releaseId }
    });
  }
  if ((action === 'publish' || action === 'all') && (outcome.action === 'publish' || outcome.action === 'all')) {
    return validateResourceResult({
      protocol: 'evcrate-resource-control', protocolVersion: PROTOCOL_VERSION, requestId,
      operation, status: 'activated', payload: outcome.payload as unknown as JsonValue
    });
  }
  if (outcome.action !== 'build' && outcome.action !== 'check') throw new ControlPlaneError('PROTOCOL_INVALID');
  return validateResourceResult({
    protocol: 'evcrate-resource-control', protocolVersion: PROTOCOL_VERSION, requestId,
    operation, status: statusFor(action), payload: { engine: outcome.engine, action: outcome.action }
  });
}

export async function runCompatibilityDistribution(
  invocation: CliInvocation,
  context: InvocationContext,
  runtime: CliRuntime = {},
  request?: PublicationRequestPayload
): Promise<ResourceResult> {
  if (invocation.command.kind !== 'distribute') throw new ControlPlaneError('USAGE_INVALID');
  const requestId = runtime.requestId?.() ?? `distribution-${invocation.command.action}`;

  let publicationRequest: PublicationRequestPayload | undefined;
  try {
    publicationRequest = compatibilityRequest(invocation.command.action, invocation, context, request);
    assertCompatibilityRequestIdentity(context, publicationRequest);
  } catch (error) {
    return errorResult(requestId, operationFor(invocation.command.action), error);
  }

  const engine = assertUniformAuthoritativeEngine(context.selectedTargetIds, runtime.engineSelectionOptions);

  if (engine === 'typescript') {
    try {
      const outcome = await runLocalDistribution(
        invocation.command.action,
        context,
        runtime.publicationOptions ?? {},
        publicationRequest
      );
      return compatibilityResult(requestId, invocation.command.action, outcome);
    } catch (error) {
      if (isPublicationPartialError(error)) {
        return partialResult(requestId, operationFor(invocation.command.action), error);
      }
      return errorResult(requestId, operationFor(invocation.command.action), error);
    }
  }

  return errorResult(requestId, operationFor(invocation.command.action), new ControlPlaneError('CAPABILITY_UNSUPPORTED'));
}
