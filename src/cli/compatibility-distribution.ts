import { ControlPlaneError, serializeControlPlaneError } from '../errors/control-plane-error.js';
import {
  type PublishApplyResultPayload, type PublishDryRunResultPayload, type RecoverResultPayload
} from '../protocol/publication-payloads.js';
import { publishDryRun, publishApply, recoverPublication } from '../distribution/publication.js';
import { runLocalDistribution } from '../distribution/local-build.js';
import { assertUniformAuthoritativeEngine } from '../distribution/cutover.js';
import { PROTOCOL_VERSION } from '../protocol/validation.js';
import type { JsonValue } from '../protocol/json.js';
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

export async function runTypedPublication(
  operation: 'publish.dry-run' | 'publish.apply' | 'recover',
  context: InvocationContext,
  runtime: CliRuntime = {},
  expectedReleaseId: string | null = null
): Promise<PublishDryRunResultPayload | PublishApplyResultPayload | RecoverResultPayload> {
  const engine = assertUniformAuthoritativeEngine(context.selectedTargetIds, runtime.engineSelectionOptions);

  if (engine === 'typescript') {
    if (operation === 'publish.dry-run') {
      return publishDryRun(context);
    }
    if (operation === 'publish.apply') {
      return publishApply(context, runtime.publicationOptions ?? {});
    }
    return recoverPublication(context, expectedReleaseId);
  }

  throw new ControlPlaneError('CAPABILITY_UNSUPPORTED');
}

export async function runCompatibilityDistribution(
  invocation: CliInvocation,
  context: InvocationContext,
  runtime: CliRuntime = {}
): Promise<ResourceResult> {
  if (invocation.command.kind !== 'distribute') throw new ControlPlaneError('USAGE_INVALID');
  const requestId = runtime.requestId?.() ?? `distribution-${invocation.command.action}`;

  const engine = assertUniformAuthoritativeEngine(context.selectedTargetIds, runtime.engineSelectionOptions);

  if (engine === 'typescript') {
    try {
      const outcome = await runLocalDistribution(
        invocation.command.action,
        context,
        runtime.publicationOptions ?? {}
      );
      return {
        protocol: 'evcrate-resource-control',
        protocolVersion: PROTOCOL_VERSION,
        requestId,
        operation: operationFor(invocation.command.action),
        status: statusFor(invocation.command.action),
        payload: { engine: 'typescript', action: outcome.action } as JsonValue
      };
    } catch (error) {
      return errorResult(requestId, operationFor(invocation.command.action), error);
    }
  }

  return errorResult(requestId, operationFor(invocation.command.action), new ControlPlaneError('CAPABILITY_UNSUPPORTED'));
}
