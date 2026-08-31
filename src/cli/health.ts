import { lstatSync } from 'node:fs';
import { TextDecoder } from 'node:util';
import { join } from 'node:path';
import { ControlPlaneError } from '../errors/control-plane-error.js';
import { canonicalJson, parseJsonDocument } from '../protocol/json.js';
import {
  createDiagnosticRequest, validateDiagnosticRequest, validateDiagnosticResult
} from '../protocol/diagnostic.js';
import type { DiagnosticRequest, DiagnosticSuccess, DiagnosticFailure } from '../protocol/diagnostic.js';
import type { InvocationContext } from '../context/invocation-context.js';
import { defaultProcessRunner } from './process-runner.js';
import type { CliRuntime } from './types.js';

export type HealthResult = DiagnosticSuccess | DiagnosticFailure;

function controllerPath(context: InvocationContext): string {
  const path = join(context.controllerRoot, 'evcrate-advisor');
  try {
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new ControlPlaneError('PATH_UNSAFE');
  } catch (error) {
    if (error instanceof ControlPlaneError) throw error;
    throw new ControlPlaneError('PATH_UNSAFE');
  }
  return path;
}

function oneJsonLine(stdout: string): unknown {
  const lines = stdout.split(/\r?\n/u);
  if (lines.at(-1) === '') lines.pop();
  if (lines.length !== 1 || !lines[0]) throw new ControlPlaneError('DIAGNOSTIC_INVALID');
  try { return parseJsonDocument(lines[0]); } catch { throw new ControlPlaneError('DIAGNOSTIC_INVALID'); }
}

function strictUtf8(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new ControlPlaneError('DIAGNOSTIC_INVALID');
  }
}

function requestId(runtime: CliRuntime): string {
  return runtime.requestId?.() ?? `health-${(runtime.now?.() ?? Date.now()).toString(36)}`;
}

export async function runHealth(
  context: InvocationContext,
  runtime: CliRuntime = {},
  request: DiagnosticRequest = createDiagnosticRequest(requestId(runtime)),
  timeoutMs = 30_000
): Promise<HealthResult> {
  const normalizedRequest = validateDiagnosticRequest(request);
  const runner = runtime.processRunner ?? defaultProcessRunner;
  const processResult = await runner.run({
    executable: runtime.execPath ?? process.execPath,
    args: [controllerPath(context)],
    cwd: context.packageRoot,
    env: {
      ...runtime.env,
      HOME: context.homeRoot,
      EVCRATE_HOME: context.homeRoot,
      EVCRATE_STATE_HOME: context.stateRoot
    },
    input: `${canonicalJson(normalizedRequest)}\n`,
    timeoutMs,
    signal: runtime.abortSignal,
    maxInputBytes: 32 * 1024,
    maxStdoutBytes: 64 * 1024,
    maxStderrBytes: 8 * 1024,
    maxLines: 2
  });
  if (processResult.termination !== 'completed' || processResult.signal !== null
    || processResult.exitCode === null
    || !(processResult.stdoutBytes instanceof Uint8Array)
    || !(processResult.stderrBytes instanceof Uint8Array)) {
    throw new ControlPlaneError('DIAGNOSTIC_INVALID');
  }
  const stdout = strictUtf8(processResult.stdoutBytes);
  const stderr = strictUtf8(processResult.stderrBytes);
  if (stderr !== '') throw new ControlPlaneError('DIAGNOSTIC_INVALID');
  const result = validateDiagnosticResult(oneJsonLine(stdout));
  if (result.requestId !== normalizedRequest.requestId) throw new ControlPlaneError('DIAGNOSTIC_INVALID');
  const expectedExitCode = result.status === 'QUALIFIED' ? 0 : 1;
  if (processResult.exitCode !== expectedExitCode) throw new ControlPlaneError('DIAGNOSTIC_INVALID');
  return result;
}





