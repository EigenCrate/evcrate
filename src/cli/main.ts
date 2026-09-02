import { randomUUID } from 'node:crypto';
import { resolveInvocationContext } from '../context/invocation-context.js';
import { ControlPlaneError, exitCodeForError } from '../errors/control-plane-error.js';
import { dispatchInvocation } from './dispatch.js';
import { parseArguments } from './arguments.js';
import { readBoundedRequestFile } from './request-file.js';
import { createCliErrorResult, exitCodeForResult, writeResult } from './output.js';
import type { CliInvocation } from './arguments.js';
import type { CliOutput, CliRuntime } from './types.js';

function defaultOutput(): CliOutput {
  return { isTTY: Boolean(process.stdout.isTTY), write: (value) => process.stdout.write(value) };
}

function commandLabel(invocation: CliInvocation | undefined): string {
  if (!invocation) return 'cli';
  switch (invocation.command.kind) {
    case 'version': return 'version';
    case 'health': return 'health';
    case 'request-file': return 'request-file';
    case 'advisor-settings': return `advisor settings ${invocation.command.operation}`;
    case 'distribute': return `distribute ${invocation.command.action}`;
    case 'publish': return `publish ${invocation.command.action}`;
    case 'recover': return 'recover';
    case 'resources': return `resources ${invocation.command.action}`;
    case 'imports': return `imports ${invocation.command.action}`;
    case 'scopes': return `scopes ${invocation.command.action}`;
    case 'changes': return `changes ${invocation.command.action}`;
  }
}

function stableRequestId(runtime: CliRuntime): string {
  const value = runtime.requestId?.() ?? randomUUID();
  return /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(value) ? value : randomUUID();
}

export async function main(argv: readonly string[], runtime: CliRuntime = {}): Promise<number> {
  const requestId = stableRequestId(runtime);
  let invocation: CliInvocation | undefined;
  try {
    invocation = parseArguments(argv);
    const context = resolveInvocationContext({
      ...invocation.options,
      packageRoot: runtime.packageRoot,
      env: runtime.env,
      cwd: runtime.cwd,
      platformHome: runtime.platformHome
    });
    const request = invocation.options.requestFile === undefined ? undefined : readBoundedRequestFile(
      invocation.options.requestFile, { cwd: runtime.cwd }
    );
    const result = await dispatchInvocation(
      invocation, context, { ...runtime, requestId: () => requestId }, request, requestId
    );
    writeResult(result.result, runtime.output ?? defaultOutput(), { json: invocation.options.json });
    return runtime.signalCode ?? result.exitCode;
  } catch (error) {
    const safeError = error instanceof ControlPlaneError ? error : new ControlPlaneError('INTERNAL_ERROR');
    const result = createCliErrorResult(requestId, commandLabel(invocation), safeError);
    writeResult(result, runtime.output ?? defaultOutput(), { json: invocation?.options.json ?? false });
    return runtime.signalCode ?? exitCodeForError(safeError);
  }
}
