import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';

export const SAFE_ENVIRONMENT_KEYS = Object.freeze([
  'PATH', 'HOME', 'USERPROFILE', 'TMPDIR', 'TMP', 'TEMP', 'LANG', 'LC_ALL', 'TERM',
  'SystemRoot', 'WINDIR', 'ComSpec', 'PATHEXT', 'EVCRATE_HOME', 'EVCRATE_STATE_HOME',
  'EVCRATE_STATE_DIR', 'XDG_STATE_HOME'
] as const);

export type ProcessTermination = 'completed' | 'timeout' | 'aborted' | 'output-limit' | 'spawn-error';

export interface RunBoundedProcessOptions {
  readonly executable: string;
  readonly args?: readonly string[];
  readonly cwd?: string;
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly input?: string | Uint8Array;
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
  readonly maxInputBytes?: number;
  readonly maxStdoutBytes?: number;
  readonly maxStderrBytes?: number;
  readonly maxLines?: number;
}

export interface ProcessResult {
  readonly exitCode: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly stdoutBytes: Uint8Array;
  readonly stderrBytes: Uint8Array;
  readonly termination: ProcessTermination;
  readonly timedOut: boolean;
  readonly aborted: boolean;
  readonly errorCode?: string;
}

function safeEnvironment(
  source: Readonly<Record<string, string | undefined>> | undefined
): Record<string, string> {
  const input = source ?? process.env;
  const allowed = new Set<string>(SAFE_ENVIRONMENT_KEYS);
  return Object.fromEntries(Object.entries(input)
    .filter(([key, value]) => allowed.has(key) && typeof value === 'string' && !value.includes('\0'))
    .map(([key, value]) => [key, value as string]));
}

function assertArgument(value: string): void {
  if (!value || value.includes('\0')) throw new TypeError('Process argument is invalid');
}

function signalProcess(child: ChildProcess, signal: NodeJS.Signals): void {
  if (process.platform !== 'win32' && child.pid !== undefined) {
    try {
      process.kill(-child.pid, signal);
      return;
    } catch { /* fall back to the direct child */ }
  }
  try { child.kill(signal); } catch { /* closed child */ }
}

function killChild(child: ChildProcess): void {
  signalProcess(child, 'SIGTERM');
  setTimeout(() => {
    if (child.exitCode === null && child.signalCode === null) signalProcess(child, 'SIGKILL');
  }, 250).unref();
}

function createResult(
  stdoutChunks: readonly Buffer[],
  stderrChunks: readonly Buffer[],
  termination: ProcessTermination,
  exitCode: number | null,
  signal: NodeJS.Signals | null,
  errorCode?: string
): ProcessResult {
  const stdoutBytes = Buffer.concat(stdoutChunks);
  const stderrBytes = Buffer.concat(stderrChunks);
  return {
    exitCode, signal, stdout: stdoutBytes.toString('utf8'), stderr: stderrBytes.toString('utf8'),
    stdoutBytes, stderrBytes, termination,
    timedOut: termination === 'timeout', aborted: termination === 'aborted',
    ...(errorCode === undefined ? {} : { errorCode })
  };
}

export function sanitizeEnvironment(
  source?: Readonly<Record<string, string | undefined>>
): Readonly<Record<string, string>> {
  return Object.freeze(safeEnvironment(source));
}

export async function runBoundedProcess(options: RunBoundedProcessOptions): Promise<ProcessResult> {
  assertArgument(options.executable);
  for (const argument of options.args ?? []) assertArgument(argument);
  const maxInputBytes = options.maxInputBytes ?? 64 * 1024;
  const maxStdoutBytes = options.maxStdoutBytes ?? 64 * 1024;
  const maxStderrBytes = options.maxStderrBytes ?? 8 * 1024;
  const maxLines = options.maxLines ?? 256;
  const timeoutMs = options.timeoutMs ?? 30_000;
  if (![maxInputBytes, maxStdoutBytes, maxStderrBytes, maxLines, timeoutMs]
    .every((value) => Number.isSafeInteger(value) && value > 0) || timeoutMs > 900_000) {
    throw new TypeError('Process bounds are invalid');
  }
  const input = options.input === undefined
    ? Buffer.alloc(0)
    : typeof options.input === 'string' ? Buffer.from(options.input, 'utf8') : Buffer.from(options.input);
  if (input.byteLength > maxInputBytes) throw new RangeError('Process input is oversized');
  if (options.signal?.aborted) {
    return {
      exitCode: null, signal: null, stdout: '', stderr: '',
      stdoutBytes: new Uint8Array(0), stderrBytes: new Uint8Array(0),
      termination: 'aborted', timedOut: false, aborted: true
    };
  }
  return new Promise<ProcessResult>((resolve) => {
    let child: ChildProcess;
    try {
      child = spawn(options.executable, [...(options.args ?? [])], {
        cwd: options.cwd,
        env: safeEnvironment(options.env),
        shell: false,
        detached: process.platform !== 'win32',
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe']
      });
    } catch (error) {
      resolve({
        exitCode: null, signal: null, stdout: '', stderr: '',
        stdoutBytes: new Uint8Array(0), stderrBytes: new Uint8Array(0),
        termination: 'spawn-error', timedOut: false, aborted: false,
        errorCode: error instanceof Error ? error.name : 'spawn-error'
      });
      return;
    }
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let lineCount = 0;
    let lineOpen = false;
    let termination: ProcessTermination = 'completed';
    let settled = false;
    let timer: NodeJS.Timeout | undefined;
    let abortHandler: (() => void) | undefined;
    let errorCode: string | undefined;
    const stop = (reason: Exclude<ProcessTermination, 'completed' | 'spawn-error'>) => {
      if (settled || termination !== 'completed') return;
      termination = reason;
      killChild(child);
    };
    const onStdout = (chunk: Buffer): void => {
      stdoutBytes += chunk.byteLength;
      for (const byte of chunk) {
        if (byte === 0x0a) lineOpen = false;
        else if (!lineOpen) { lineCount += 1; lineOpen = true; }
      }
      if (stdoutBytes > maxStdoutBytes || lineCount > maxLines) { stop('output-limit'); return; }
      stdout.push(chunk);
    };
    const onStderr = (chunk: Buffer): void => {
      stderrBytes += chunk.byteLength;
      if (stderrBytes > maxStderrBytes) { stop('output-limit'); return; }
      stderr.push(chunk);
    };
    child.stdout?.on('data', onStdout);
    child.stderr?.on('data', onStderr);
    child.once('error', (error: NodeJS.ErrnoException) => {
      if (termination === 'completed') termination = 'spawn-error';
      errorCode = error.code ?? 'spawn-error';
      child.stdin?.destroy();
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        if (abortHandler) options.signal?.removeEventListener('abort', abortHandler);
        resolve(createResult(stdout, stderr, termination, null, null, errorCode));
      }
    });
    child.stdin?.once('error', (error: NodeJS.ErrnoException) => {
      if (termination !== 'completed') return;
      termination = 'spawn-error';
      errorCode = error.code ?? 'stdin-error';
      killChild(child);
    });
    child.once('close', (exitCode, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (abortHandler) options.signal?.removeEventListener('abort', abortHandler);
      resolve(createResult(stdout, stderr, termination, exitCode, signal, errorCode));
    });
    timer = setTimeout(() => stop('timeout'), timeoutMs);
    abortHandler = () => stop('aborted');
    if (options.signal) {
      options.signal.addEventListener('abort', abortHandler, { once: true });
      if (options.signal.aborted) abortHandler();
    }
    try {
      if (termination === 'completed') child.stdin?.end(input);
      else child.stdin?.destroy();
    } catch (error) {
      if (termination === 'completed') {
        termination = 'spawn-error';
        errorCode = error instanceof Error ? error.name : 'stdin-error';
        killChild(child);
      }
    }
  });
}

export const defaultProcessRunner = Object.freeze({ run: runBoundedProcess });
