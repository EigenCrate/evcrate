'use strict';

const childProcess = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { TextDecoder } = require('node:util');
const { createRoutingError, isRoutingError } = require('./errors.cjs');
const {
  assertAdapterAuthKeys,
  validateInvocationShape
} = require('./adapter-contract.cjs');

const INVOCATION_BRAND = Symbol('evcrate-advisor-invocation');
const RUNNER_FAILURE_BRAND = Symbol('evcrate-advisor-runner-failure');
const RECURSION_MARKER = 'EVCRATE_ADVISOR_ACTIVE';
const RECURSION_DEPTH = 'EVCRATE_ADVISOR_DEPTH';
const COMMON_ENV_KEYS = Object.freeze([
  'PATH', 'HOME', 'USERPROFILE', 'TMPDIR', 'TMP', 'TEMP', 'LANG', 'LC_ALL', 'TERM',
  'SystemRoot', 'WINDIR', 'ComSpec', 'PATHEXT'
]);
const LIMIT_KEYS = Object.freeze([
  'maxPromptBytes', 'maxStdoutBytes', 'maxStderrBytes', 'maxLines', 'maxResultBytes',
  'timeoutMs', 'killGraceMs'
]);
const DEFAULT_LIMITS = Object.freeze({
  maxPromptBytes: 32 * 1024,
  maxStdoutBytes: 64 * 1024,
  maxStderrBytes: 16 * 1024,
  maxLines: 2048,
  maxResultBytes: 48 * 1024,
  timeoutMs: 30_000,
  killGraceMs: 250
});
const LIFECYCLE_STATUS_BY_CODE = Object.freeze({
  CANCELLED: 'cancelled',
  EXECUTABLE_UNAVAILABLE: 'spawn-failed',
  LINE_LIMIT: 'line-limit',
  OUTPUT_INVALID: 'output-invalid',
  OUTPUT_LIMIT: 'output-limit',
  PROCESS_FAILED: 'process-failed',
  TIMEOUT: 'timeout'
});
const CODEX_DISALLOWED_ITEM_TYPES = new Set([
  'command_execution', 'file_change', 'mcp_tool_call', 'web_search', 'todo_list'
]);

function fail(code) {
  throw createRoutingError(code);
}

function monotonicMilliseconds() {
  return Number(process.hrtime.bigint()) / 1_000_000;
}

function lifecycleStatus(code, completed = false) {
  if (completed) return 'completed';
  return LIFECYCLE_STATUS_BY_CODE[code] || 'failed';
}

function lifecycleInteger(value) {
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.min(Number.MAX_SAFE_INTEGER, Math.round(value));
}

function deepFreeze(value, seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value)) deepFreeze(child, seen);
  return Object.freeze(value);
}

function normalizeLimits(input = {}) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) fail('INVOCATION_INVALID');
  if (Object.keys(input).some((key) => !LIMIT_KEYS.includes(key))) fail('INVOCATION_INVALID');
  const limits = { ...DEFAULT_LIMITS, ...input };
  for (const key of LIMIT_KEYS) {
    const minimum = key === 'killGraceMs' ? 0 : 1;
    if (!Number.isSafeInteger(limits[key]) || limits[key] < minimum) fail('INVOCATION_INVALID');
  }
  return deepFreeze(limits);
}

function validateContainedCwd(cwd, workspaceRoot) {
  if (typeof cwd !== 'string' || typeof workspaceRoot !== 'string'
    || !path.isAbsolute(cwd) || !path.isAbsolute(workspaceRoot)) fail('CWD_INVALID');
  let rootStat;
  let cwdStat;
  try {
    if (fs.lstatSync(workspaceRoot).isSymbolicLink() || fs.lstatSync(cwd).isSymbolicLink()) fail('CWD_UNSAFE');
    rootStat = fs.statSync(workspaceRoot);
    cwdStat = fs.statSync(cwd);
  } catch { fail('CWD_INVALID'); }
  if (!rootStat.isDirectory() || !cwdStat.isDirectory()) fail('CWD_INVALID');
  let rootReal;
  let cwdReal;
  try {
    rootReal = fs.realpathSync.native(workspaceRoot);
    cwdReal = fs.realpathSync.native(cwd);
  } catch { fail('CWD_UNSAFE'); }
  const relative = path.relative(rootReal, cwdReal);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    fail('CWD_UNSAFE');
  }
  return cwdReal;
}

function assertNoRecursion({ environment = process.env, requestDepth = 0 } = {}) {
  if (!environment || typeof environment !== 'object' || Array.isArray(environment)) {
    fail('INVOCATION_INVALID');
  }
  if (!Number.isSafeInteger(requestDepth) || requestDepth < 0) fail('REQUEST_DEPTH_INVALID');
  if (requestDepth > 0) fail('ADVISOR_RECURSION');
  if (Object.prototype.hasOwnProperty.call(environment, RECURSION_MARKER)) {
    fail('ADVISOR_RECURSION');
  }
  const inheritedDepth = environment[RECURSION_DEPTH];
  if (inheritedDepth !== undefined && inheritedDepth !== '' && inheritedDepth !== '0') {
    if (!/^\d+$/u.test(String(inheritedDepth))) fail('REQUEST_DEPTH_INVALID');
    fail('ADVISOR_RECURSION');
  }
  return true;
}

function buildAllowlistedEnvironment({
  source = process['env'],
  adapter,
  authKeys = [],
  requestDepth = 0,
  includeRecursionMarker = false
} = {}) {
  if (source === null || typeof source !== 'object' || Array.isArray(source)) fail('INVOCATION_INVALID');
  assertAdapterAuthKeys(adapter, authKeys);
  assertNoRecursion({ environment: source, requestDepth });
  const environment = {};
  for (const key of [...new Set([...COMMON_ENV_KEYS, ...authKeys])]) {
    if (key.startsWith('EVCRATE_')) continue;
    if (Object.prototype.hasOwnProperty.call(source, key) && source[key] !== undefined) {
      if (typeof source[key] !== 'string') fail('INVOCATION_INVALID');
      environment[key] = source[key];
    }
  }
  if (includeRecursionMarker) environment[RECURSION_MARKER] = '1';
  return Object.freeze(environment);
}

function buildChildEnvironment(options = {}) {
  return buildAllowlistedEnvironment({ ...options, includeRecursionMarker: true });
}

function buildProbeEnvironment(options = {}) {
  return buildAllowlistedEnvironment({ ...options, includeRecursionMarker: false });
}

function assertSafeArgv(argv, prompt, adapter) {
  for (const [index, argument] of argv.entries()) {
    const fixedCodexSubcommand = adapter === 'codex' && index === 0 && argument === 'exec';
    if (typeof argument !== 'string' || argument.includes('\0')
      || (!fixedCodexSubcommand && /(?:^|-)(?:c|e|command|exec)$/u.test(argument))
      || /(?:\$\(|\$\{|`|;|&&|\|\||\beval\b|[<>])/u.test(argument)) fail('INVOCATION_INVALID');
    if (prompt && argument.includes(prompt)) fail('INVOCATION_INVALID');
  }
}

function createInvocation(specification) {
  validateInvocationShape(specification);
  assertAdapterAuthKeys(specification.adapter, specification.authKeys);
  const limits = normalizeLimits(specification.limits);
  if (Buffer.byteLength(specification.prompt, 'utf8') > limits.maxPromptBytes) fail('PROMPT_OVERSIZED');
  assertSafeArgv(specification.argv, specification.prompt, specification.adapter);
  const cwd = validateContainedCwd(specification.cwd, specification.workspaceRoot);
  const invocation = {
    adapter: specification.adapter,
    executable: specification.executable,
    argv: Object.freeze([...specification.argv]),
    cwd,
    workspaceRoot: fs.realpathSync.native(specification.workspaceRoot),
    prompt: specification.prompt,
    authKeys: Object.freeze([...specification.authKeys]),
    limits
  };
  Object.defineProperty(invocation, INVOCATION_BRAND, { value: true });
  return deepFreeze(invocation);
}

function decodeOutput(buffer) {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buffer); }
  catch { fail('OUTPUT_INVALID'); }
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function truncateUtf8(value, maxBytes) {
  const bytes = Buffer.from(value, 'utf8');
  if (bytes.length <= maxBytes) return value;
  let end = maxBytes;
  while (end > 0 && (bytes[end] & 0xc0) === 0x80) end -= 1;
  return bytes.subarray(0, end).toString('utf8');
}

function redactDiagnostics(value, secrets = [], maxBytes = DEFAULT_LIMITS.maxStderrBytes) {
  const limit = Number.isSafeInteger(maxBytes) && maxBytes > 0
    ? maxBytes : DEFAULT_LIMITS.maxStderrBytes;
  let redacted = typeof value === 'string' ? value : '';
  for (const secret of secrets) {
    if (typeof secret !== 'string' || secret.length === 0) continue;
    redacted = redacted.replace(new RegExp(escapeRegex(secret), 'gu'), '[REDACTED]');
  }
  redacted = redacted
    .replace(/Bearer\s+\S+/giu, 'Bearer [REDACTED]')
    .replace(/Basic\s+[A-Za-z0-9+/]+={0,2}/giu, 'Basic [REDACTED]')
    .replace(/(["']?(?:access[_-]?token|refresh[_-]?token|id[_-]?token|client[_-]?secret|api[_-]?key|authorization|auth|token|secret|password|cookie|credential)["']?\s*[:=]\s*["']?)[^"'\s,;}]+(["']?)/giu, '$1[REDACTED]$2')
    .replace(/\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/gu, '[REDACTED]')
    .replace(/\b(?:sk|pk)_[A-Za-z0-9_-]{8,}\b/gu, '[REDACTED]')
    .replace(/\b(?:sk-(?:proj|ant)-|gh[pous]_|github_pat_|npm_|xox[baprs]-|AIza)[A-Za-z0-9_./+=-]{8,}\b/gu, '[REDACTED]');
  return truncateUtf8(redacted, limit);
}

function createRunnerFailure({ reason, stdout = '', stderr = '', exitCode = null, signal = null }) {
  const failure = {
    error: createRoutingError('PROCESS_FAILED'),
    diagnostics: Object.freeze({
      reason,
      stdout: typeof stdout === 'string' ? stdout : '',
      stderr: typeof stderr === 'string' ? stderr : '',
      exitCode: Number.isInteger(exitCode) ? exitCode : null,
      signal: typeof signal === 'string' && signal ? signal : null
    })
  };
  Object.defineProperty(failure, RUNNER_FAILURE_BRAND, { value: true });
  return Object.freeze(failure);
}

function isRunnerFailure(value) {
  return Boolean(value && typeof value === 'object' && value[RUNNER_FAILURE_BRAND] === true);
}

function createCodexToolGuard() {
  let pending = '';
  return (chunk) => {
    pending += Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
    for (;;) {
      const newline = pending.indexOf('\n');
      if (newline < 0) return null;
      const line = pending.slice(0, newline).replace(/\r$/u, '');
      pending = pending.slice(newline + 1);
      if (!line) continue;
      let event;
      try { event = JSON.parse(line); } catch { continue; }
      if (CODEX_DISALLOWED_ITEM_TYPES.has(event?.item?.type)) {
        return 'READ_ONLY_UNSUPPORTED';
      }
    }
  };
}

class BoundedOutput {
  constructor(byteLimit, lineLimit) {
    this.byteLimit = byteLimit;
    this.lineLimit = lineLimit;
    this.bytes = 0;
    this.lines = 0;
    this.lastByte = null;
    this.chunks = [];
  }

  append(value) {
    const chunk = Buffer.isBuffer(value) ? value : Buffer.from(String(value));
    this.bytes += chunk.length;
    for (const byte of chunk) {
      if (byte === 0x0a) this.lines += 1;
      this.lastByte = byte;
    }
    const completeLines = this.lines + (this.bytes > 0 && this.lastByte !== 0x0a ? 1 : 0);
    if (this.bytes > this.byteLimit) return 'OUTPUT_LIMIT';
    if (completeLines > this.lineLimit) return 'LINE_LIMIT';
    this.chunks.push(chunk);
    return null;
  }

  value() {
    return decodeOutput(Buffer.concat(this.chunks, this.bytes));
  }
}

function waitForClose(closePromise, milliseconds, setTimeoutImpl) {
  if (milliseconds === 0) return Promise.resolve();
  return Promise.race([
    closePromise,
    new Promise((resolve) => setTimeoutImpl(resolve, milliseconds))
  ]);
}

async function terminateChild(child, { kill, setTimeoutImpl, graceMs, closed, forceGroupOnClose = false }) {
  try { child.stdin?.destroy(); } catch { /* best effort */ }
  const send = (signal, force = false) => {
    if (!force && closed() && !forceGroupOnClose) return;
    try {
      if (process.platform !== 'win32' && Number.isInteger(child.pid) && child.pid > 0) {
        kill(-child.pid, signal);
      } else {
        child.kill?.(signal);
      }
    } catch {
      try { child.kill?.(signal); } catch { /* best effort */ }
    }
  };
  send('SIGTERM');
  await waitForClose(child.closePromise, graceMs, setTimeoutImpl);
  send('SIGKILL', true);
  await waitForClose(child.closePromise, graceMs, setTimeoutImpl);
}

function runInvocation(invocation, options = {}) {
  if (!invocation || invocation[INVOCATION_BRAND] !== true) {
    return Promise.reject(createRoutingError('INVOCATION_INVALID'));
  }
  const onLifecycle = typeof options.onLifecycle === 'function' ? options.onLifecycle : null;
  const now = typeof options.now === 'function' ? options.now : monotonicMilliseconds;
  let startedAt;
  let childPid = null;
  let lifecycleReported = false;
  const reportLifecycle = (status, terminationWaitMs = 0) => {
    if (!onLifecycle || lifecycleReported || startedAt === undefined) return;
    lifecycleReported = true;
    const elapsedAt = (() => {
      try { return now(); } catch { return startedAt; }
    })();
    const event = Object.freeze({
      status,
      pid: childPid,
      elapsed_ms: lifecycleInteger(elapsedAt - startedAt),
      termination_wait_ms: lifecycleInteger(terminationWaitMs)
    });
    try { onLifecycle(event); } catch { /* diagnostics must not affect the result */ }
  };
  try {
    const environment = options.environment || process.env;
    assertNoRecursion({
      environment,
      requestDepth: options.requestDepth === undefined ? 0 : options.requestDepth
    });
    const limits = normalizeLimits(invocation.limits);
    const cwd = validateContainedCwd(invocation.cwd, invocation.workspaceRoot);
    const env = buildChildEnvironment({
      source: environment,
      adapter: invocation.adapter,
      authKeys: invocation.authKeys
    });
    const authSecrets = invocation.authKeys
      .map((key) => env[key])
      .filter((value) => typeof value === 'string' && value.length > 0);
    const signal = options.signal;
    if (signal?.aborted) return Promise.reject(createRoutingError('CANCELLED'));
    const spawnImpl = options.spawn || childProcess.spawn;
    const setTimeoutImpl = options.setTimeout || setTimeout;
    const clearTimeoutImpl = options.clearTimeout || clearTimeout;
    const kill = options.kill || process.kill.bind(process);
    try { startedAt = now(); } catch { startedAt = monotonicMilliseconds(); }
    const child = spawnImpl(invocation.executable, [...invocation.argv], {
      cwd,
      env,
      shell: false,
      detached: process.platform !== 'win32',
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    childPid = Number.isInteger(child?.pid) && child.pid > 0 ? child.pid : null;
    if (!child || typeof child.on !== 'function') fail('PROCESS_FAILED');
    const stdoutGuard = invocation.adapter === 'codex'
      && invocation.argv[0] === 'exec' && invocation.argv.includes('--json')
      ? createCodexToolGuard() : null;
    return new Promise((resolve) => {
      let settled = false;
      let terminating = false;
      let closeSeen = false;
      let timeoutHandle;
      let abortHandler;
      const stdout = new BoundedOutput(limits.maxStdoutBytes, limits.maxLines);
      const stderr = new BoundedOutput(limits.maxStderrBytes, limits.maxLines);
      let closeResolve;
      const closePromise = new Promise((done) => { closeResolve = done; });
      child.closePromise = closePromise;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        if (timeoutHandle !== undefined) clearTimeoutImpl(timeoutHandle);
        if (signal && abortHandler) signal.removeEventListener('abort', abortHandler);
        resolve(value);
      };
      const failProcess = async (code, failure = null, forceGroupOnClose = false) => {
        if (settled || terminating) return;
        terminating = true;
        let terminationStartedAt;
        try { terminationStartedAt = now(); } catch { terminationStartedAt = startedAt; }
        try {
          await terminateChild(child, {
            kill,
            setTimeoutImpl,
            graceMs: limits.killGraceMs,
            closed: () => closeSeen,
            forceGroupOnClose
          });
        } catch { /* cleanup is best effort; the typed failure still returns */ }
        let terminationFinishedAt;
        try { terminationFinishedAt = now(); } catch { terminationFinishedAt = terminationStartedAt; }
        reportLifecycle(lifecycleStatus(code), terminationFinishedAt - terminationStartedAt);
        finish(failure ? { error: failure.error, failure } : { error: createRoutingError(code) });
      };
      child.stdout?.on('data', (chunk) => {
        const code = stdout.append(chunk);
        if (code) void failProcess(code);
        else if (stdoutGuard) {
          let guardCode;
          try { guardCode = stdoutGuard(chunk); }
          catch { guardCode = 'OUTPUT_INVALID'; }
          if (guardCode) void failProcess(guardCode);
        }
      });
      child.stderr?.on('data', (chunk) => {
        const code = stderr.append(chunk);
        if (code) void failProcess(code);
      });
      child.stdout?.on('error', () => void failProcess('PROCESS_FAILED'));
      child.stderr?.on('error', () => void failProcess('PROCESS_FAILED'));
      child.on('error', (error) => void failProcess(error?.code === 'ENOENT' ? 'EXECUTABLE_UNAVAILABLE' : 'PROCESS_FAILED'));
      child.on('close', (code, childSignal) => {
        closeSeen = true;
        closeResolve();
        if (terminating || settled) return;
        if (code !== 0 || childSignal) {
          let stdoutText = '';
          let stderrText = '';
          try { stdoutText = redactDiagnostics(stdout.value(), authSecrets, limits.maxStdoutBytes); }
          catch { stdoutText = '[unreadable output]'; }
          try { stderrText = redactDiagnostics(stderr.value(), authSecrets, limits.maxStderrBytes); }
          catch { stderrText = '[unreadable diagnostics]'; }
          const failure = createRunnerFailure({
            reason: childSignal ? 'signal' : 'nonzero-exit',
            stdout: stdoutText,
            stderr: stderrText,
            exitCode: code,
            signal: childSignal
          });
          void failProcess('PROCESS_FAILED', failure, true);
          return;
        }
        if (stdout.bytes > limits.maxResultBytes) {
          void failProcess('OUTPUT_LIMIT');
          return;
        }
        try {
          const result = {
            stdout: stdout.value(),
            stderr: redactDiagnostics(stderr.value(), authSecrets, limits.maxStderrBytes),
            exitCode: code,
            signal: childSignal || null
          };
          reportLifecycle(lifecycleStatus(null, true));
          finish({ result: Object.freeze(result) });
        } catch (error) {
          reportLifecycle(lifecycleStatus(error?.code || 'OUTPUT_INVALID'));
          finish({ error: error?.code ? error : createRoutingError('OUTPUT_INVALID') });
        }
      });
      timeoutHandle = setTimeoutImpl(() => void failProcess('TIMEOUT'), limits.timeoutMs);
      abortHandler = () => void failProcess('CANCELLED');
      signal?.addEventListener('abort', abortHandler, { once: true });
      if (signal?.aborted) {
        void failProcess('CANCELLED');
        return;
      }
      const stdin = child.stdin;
      if (!stdin || typeof stdin.on !== 'function' || typeof stdin.end !== 'function') {
        void failProcess('PROCESS_FAILED');
      } else {
        stdin.on('error', () => void failProcess('PROCESS_FAILED'));
        try { stdin.end(invocation.prompt, 'utf8'); }
        catch { void failProcess('PROCESS_FAILED'); }
      }
    });
  } catch (error) {
    if (isRoutingError(error)) {
      reportLifecycle(lifecycleStatus(error.code));
      return Promise.reject(error);
    }
    const normalized = createRoutingError(error?.code === 'ENOENT'
      ? 'EXECUTABLE_UNAVAILABLE'
      : 'PROCESS_FAILED');
    reportLifecycle(lifecycleStatus(normalized.code));
    return Promise.reject(normalized);
  }
}

function createRunner(dependencies = {}) {
  return Object.freeze({
    run(invocation, options = {}) {
      return runInvocation(invocation, { ...dependencies, ...options });
    }
  });
}

module.exports = {
  COMMON_ENV_KEYS,
  DEFAULT_LIMITS,
  RECURSION_DEPTH,
  RECURSION_MARKER,
  assertNoRecursion,
  buildProbeEnvironment,
  buildChildEnvironment,
  createInvocation,
  createRunner,
  createRunnerFailure,
  isRunnerFailure,
  normalizeLimits,
  redactDiagnostics,
  run: runInvocation,
  runInvocation,
  validateContainedCwd
};
