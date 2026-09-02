import { join } from 'node:path';
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
import { defaultProcessRunner } from './process-runner.js';
import { assertScript, runAuthorityPublication } from './python-authority-bridge.js';
import type { CliRuntime } from './types.js';

const ACTIONS = Object.freeze({
  build: ['--build'], check: ['--check'], publish: ['--publish'], all: ['--all'], recover: ['--recover']
} as const);

function operationFor(action: keyof typeof ACTIONS): ResourceOperation {
  return `distribute.${action}` as ResourceOperation;
}

function statusFor(action: keyof typeof ACTIONS): ResourceSuccessStatus {
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

  if (engine === 'typescript' && runtime.processRunner === undefined) {
    if (operation === 'publish.dry-run') {
      return publishDryRun(context);
    }
    if (operation === 'publish.apply') {
      return publishApply(context, runtime.publicationOptions ?? {});
    }
    return recoverPublication(context, expectedReleaseId);
  }

  return runAuthorityPublication(operation, context, runtime, expectedReleaseId);
}

export async function runCompatibilityDistribution(
  invocation: CliInvocation,
  context: InvocationContext,
  runtime: CliRuntime = {}
): Promise<ResourceResult> {
  if (invocation.command.kind !== 'distribute') throw new ControlPlaneError('USAGE_INVALID');
  const requestId = runtime.requestId?.() ?? `distribution-${invocation.command.action}`;

  const engine = assertUniformAuthoritativeEngine(context.selectedTargetIds, runtime.engineSelectionOptions);

  if (engine === 'typescript' && runtime.processRunner === undefined) {
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

  if (context.selectedTargetIds.length > 1 && invocation.options.targets.length > 1) {
    return errorResult(requestId, operationFor(invocation.command.action), new ControlPlaneError('CAPABILITY_UNSUPPORTED'));
  }
  const scriptPath = join(context.packageRoot, 'distribute.py');
  try { assertScript(scriptPath); } catch (error) {
    return errorResult(requestId, operationFor(invocation.command.action), error);
  }
  const args = [...ACTIONS[invocation.command.action], ...(invocation.options.targets.length
    ? ['--target', invocation.options.targets[0]] : [])];
  const runner = runtime.processRunner ?? defaultProcessRunner;
  const processResult = await runner.run({
    executable: runtime.pythonExecutable ?? 'python3', args: [scriptPath, ...args],
    cwd: context.packageRoot, env: {
      ...runtime.env,
      EVCRATE_HOME: context.homeRoot,
      EVCRATE_STATE_DIR: context.stateRoot
    },
    timeoutMs: invocation.options.timeoutMs, signal: runtime.abortSignal,
    maxInputBytes: 1, maxStdoutBytes: 16 * 1024, maxStderrBytes: 8 * 1024, maxLines: 256
  });
  if (processResult.termination !== 'completed' || processResult.exitCode !== 0) {
    const code = invocation.command.action === 'recover' ? 'RECOVERY_FAILED'
      : invocation.command.action === 'publish' || invocation.command.action === 'all'
        ? 'PUBLICATION_FAILED' : 'INTERNAL_ERROR';
    return errorResult(requestId, operationFor(invocation.command.action), new ControlPlaneError(code));
  }
  return {
    protocol: 'evcrate-resource-control', protocolVersion: PROTOCOL_VERSION,
    requestId, operation: operationFor(invocation.command.action),
    status: statusFor(invocation.command.action),
    payload: { engine: 'python-compatibility', action: invocation.command.action } as JsonValue
  };
}
