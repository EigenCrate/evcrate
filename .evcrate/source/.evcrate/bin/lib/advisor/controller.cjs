'use strict';

const {
  monotonicMilliseconds, createRunner, createDeadlineRunner, createProbeRunner,
  createGenerationRunner, buildProbeEnvironment
} = require('./runner.cjs');
const { parseJsonDocument, decodeUtf8 } = require('./json-document.cjs');
const {
  validateCheckpoint, serializeCheckpoint, formatMentorPrompt, checkpointDigest,
  normalizeResult, MAX_ENVELOPE_BYTES, ADVISOR_BUILD_IDENTITY
} = require('./checkpoint-contract.cjs');
const { loadGlobalPolicy } = require('./profile.cjs');
const { validatePolicy } = require('./policy-schema.cjs');
const { getAdapter } = require('./adapter-registry.cjs');
const { createWorkspace, cleanupWorkspace, verifyWorkspace } = require('./isolated-workspace.cjs');
const {
  createRoutingError, isRoutingError, serializeRoutingError, ERROR_CODES
} = require('./errors.cjs');
const { validateCapabilityAttestation, isPlainObject, classifyAttemptFailure } = require('./adapter-contract.cjs');
const { buildSuccessEnvelope, buildFailureEnvelope } = require('./controller-envelope.cjs');
const { recordStartedExecution, recordTerminalExecution, updateStartedAttempts } = require('./history-store.cjs');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');

const PRIMARY_RETRY_DELAYS_MS = Object.freeze([10_000, 20_000, 30_000]);
const MAX_PRIMARY_MODEL_ATTEMPTS = 4;
const ROUTE_LOCAL_PREFLIGHT_CODES = Object.freeze(new Set([
  'EXECUTABLE_UNAVAILABLE',
  'AUTH_UNAVAILABLE',
  'MODEL_UNSUPPORTED',
  'EFFORT_UNSUPPORTED',
  'CLI_VERSION_UNSUPPORTED',
  'CLI_CAPABILITY_UNSUPPORTED',
  'READ_ONLY_UNSUPPORTED',
  'SESSION_UNSUPPORTED',
  'OUTPUT_UNSUPPORTED',
  'ADAPTER_UNSUPPORTED',
  'ADAPTER_CONTRACT_INVALID'
]));

async function cancellableDelay(delayMs, signal, sleepFn) {
  if (signal?.aborted) fail('CANCELLED');
  if (!delayMs || delayMs <= 0) return;
  if (typeof sleepFn === 'function') {
    await sleepFn(delayMs, signal);
    if (signal?.aborted) fail('CANCELLED');
    return;
  }
  let timer;
  let onAbort;
  try {
    await new Promise((resolve, reject) => {
      onAbort = () => reject(createRoutingError('CANCELLED'));
      signal?.addEventListener('abort', onAbort, { once: true });
      timer = setTimeout(resolve, delayMs);
    });
  } finally {
    clearTimeout(timer);
    if (onAbort) signal?.removeEventListener('abort', onAbort);
  }
  if (signal?.aborted) fail('CANCELLED');
}

const DIAGNOSTIC_PROTOCOL = 'evcrate-advisor-diagnostic';
const DIAGNOSTIC_VERSION = 1;
const DIAGNOSTIC_OPERATION = 'qualify';
const REQUEST_ID_LIMIT = 128;
const CONTROLLER_VERSION = 1;
const VERSION_LIMIT = 128;
const CONTROL = /[\u0000-\u001f\u007f]/u;
const REQUEST_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
function fail(code) { throw createRoutingError(code); }
function codeOf(error) { return isRoutingError(error) ? error.code : error?.code || error?.error?.code; }
function dependency(deps, name, fallback) { return typeof deps[name] === 'function' ? deps[name] : fallback; }

function resolveExecutablePath(executable, envPath) {
  if (typeof executable !== 'string' || !executable) return null;
  const fsImpl = require('node:fs');
  const pathImpl = require('node:path');
  if (pathImpl.isAbsolute(executable)) {
    try { return fsImpl.realpathSync.native(executable); } catch { return null; }
  }
  const dirs = (envPath || '').split(pathImpl.delimiter);
  for (const dir of dirs) {
    if (!dir) continue;
    const candidate = pathImpl.join(dir, executable);
    try {
      const stat = fsImpl.statSync(candidate);
      if (stat.isFile() && (stat.mode & 0o111)) {
        return fsImpl.realpathSync.native(candidate);
      }
    } catch {}
  }
  return null;
}
function version(value) {
  if (typeof value !== 'string' || !value || CONTROL.test(value) || Buffer.byteLength(value, 'utf8') > VERSION_LIMIT) {
    fail('CLI_VERSION_UNSUPPORTED');
  }
  return value;
}
function parseInput(input) {
  let text;
  if (typeof input === 'string') {
    if (Buffer.byteLength(input, 'utf8') > MAX_ENVELOPE_BYTES) fail('REQUEST_INVALID');
    text = input;
  } else if (Buffer.isBuffer(input) || input instanceof Uint8Array) {
    if (input.byteLength > MAX_ENVELOPE_BYTES) fail('REQUEST_INVALID');
    text = decodeUtf8(input, 'REQUEST_INVALID');
  } else fail('REQUEST_INVALID');
  try { return validateCheckpoint(parseJsonDocument(text, 'REQUEST_INVALID', 'REQUEST_INVALID')); }
  catch (error) {
    if (isRoutingError(error)) {
      if (error.code === 'PROTOCOL_INVALID') fail('REQUEST_INVALID');
      throw error;
    }
    fail('REQUEST_INVALID');
  }
}
function targetFromPolicy(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('ROUTE_SCHEMA_INVALID');
  const policy = validatePolicy(value);
  const target = Object.freeze({ ...policy.advisor.primary });
  return { policy, target };
}
function version(value) {
  if (typeof value !== 'string' || !value || CONTROL.test(value) || Buffer.byteLength(value, 'utf8') > VERSION_LIMIT) {
    fail('CLI_VERSION_UNSUPPORTED');
  }
  return value;
}
function elapsed(now, started) {
  try { return Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, Math.round(now() - started))); }
  catch { return 0; }
}
function failureCode(error, adapter) {
  let code = codeOf(error);
  if (adapter && typeof adapter.classifyFailure === 'function') {
    try { code = adapter.classifyFailure(error) || code; } catch { /* use the original typed error */ }
  }
  return typeof code === 'string' ? code : 'PROCESS_FAILED';
}
function registryLookup(deps, name) {
  if (deps.registry && typeof deps.registry.getAdapter === 'function') return deps.registry.getAdapter(name);
  if (typeof deps.getAdapter === 'function') return deps.getAdapter(name);
  return getAdapter(name);
}
function normalizeWorkspace(value, verify) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || typeof value.path !== 'string' || typeof value.realpath !== 'string') fail('CWD_UNSAFE');
  return verify(value);
}
async function runController(input, dependencies = {}) {
  let target = null;
  let checkpoint = null;
  let digest = null;
  let selected = null;
  let projectId = null;
  let auditStartedAttempted = false;
  let auditRecorded = false;
  let auditDegraded = false;
  let attempts = [];
  const now = dependency(dependencies, 'monotonicMilliseconds', monotonicMilliseconds);
  const makeUuid = dependency(dependencies, 'randomUUID', randomUUID);
  const correlationId = dependencies.consultationId ?? makeUuid();
  const recordStarted = dependency(dependencies, 'recordStartedExecution', recordStartedExecution);
  const recordTerminal = dependency(dependencies, 'recordTerminalExecution', recordTerminalExecution);
  const updateAttempts = dependency(dependencies, 'updateStartedAttempts', updateStartedAttempts);
  let started;
  try { started = now(); } catch { started = monotonicMilliseconds(); }
  const startedAt = Date.now();
  let adapter = null;
  let adapterVersion = null;
  let workspace = null;
  let receipt = () => ({
    backend: target?.backend ?? null,
    model: target?.model ?? null,
    effort: target?.effort ?? null,
    controller_version: checkpoint?.version === 2 ? 2 : CONTROLLER_VERSION,
    adapter_version: adapterVersion,
    elapsed_ms: elapsed(now, started)
  });
  let envelope;
  let cleanupOutcome = 'confirmed';
  let lastRoutingError = null;
  let attemptChildSpawned = false;
  async function recordAttempt(attempt) {
    if (typeof dependencies.onAttempt === 'function') {
      try { dependencies.onAttempt(attempt); } catch {}
    }
    if (auditRecorded && !auditDegraded && checkpoint?.version === 2 && selected?.policy?.history) {
      try {
        await updateAttempts(dependencies, {
          projectId,
          taskRunId: checkpoint.task_run_id,
          consultationId: correlationId
        }, attempts, selected.policy);
      } catch {
        auditDegraded = true;
      }
    }
  }
  async function pushAttempt(attempt) {
    attempts.push(attempt);
    await recordAttempt(attempt);
  }
  try {
    const request = await input;
    if (dependencies.signal?.aborted) fail('CANCELLED');
    checkpoint = parseInput(request);
    if (checkpoint.version === 2) {
      digest = checkpointDigest(checkpoint);
    }
    const environment = dependencies.environment || process.env;
    const loaded = await dependency(dependencies, 'loadGlobalPolicy', loadGlobalPolicy)(environment?.HOME);
    selected = targetFromPolicy(loaded?.policy ?? loaded);
    const projectRoot = path.resolve(dependencies.cwd || process.cwd());
    projectId = createHash('sha256').update(projectRoot).digest('hex');

    async function maybeRecordStarted() {
      if (auditStartedAttempted || checkpoint?.version !== 2 || !selected?.policy?.history) return;
      auditStartedAttempted = true;
      try {
        const startedRecord = {
          schema_version: 1,
          consultation_id: correlationId,
          task_run_id: checkpoint.task_run_id,
          project_id: projectId,
          checkpoint_digest: digest,
          checkpoint,
          route: { backend: target.backend, model: target.model, effort: target.effort },
          receipt: null,
          prompt_identity: 'canonical-mentor-brief-v2',
          build_identity: ADVISOR_BUILD_IDENTITY,
          attempts: attempts.slice(0, 16),
          status: 'started',
          result: null,
          error: null,
          started_at: startedAt,
          completed_at: null
        };
        await recordStarted(dependencies, startedRecord, selected.policy);
        auditRecorded = true;
      } catch {
        auditDegraded = true;
      }
    }
    const primaryTarget = selected.target;
    const backupTarget = selected.policy?.advisor?.backup ? Object.freeze({ ...selected.policy.advisor.backup }) : null;
    target = primaryTarget;
    adapter = registryLookup(dependencies, primaryTarget.backend);
    await maybeRecordStarted();
    const workspaceFactory = dependency(dependencies, 'createWorkspace', createWorkspace);
    workspace = normalizeWorkspace(
      await workspaceFactory({ environment }),
      dependency(dependencies, 'verifyWorkspace', verifyWorkspace)
    );

    const baseRunner = dependencies.runner || createRunner();
    const probeTrackingRunner = {
      run: async (inv, opts) => {
        const res = await baseRunner.run(inv, opts);
        if (res?.cleanupOutcome === 'unconfirmed') {
          cleanupOutcome = 'unconfirmed';
        }
        return res;
      }
    };
    const generationTrackingRunner = {
      run: async (inv, opts) => {
        const res = await baseRunner.run(inv, opts);
        if (res?.cleanupOutcome === 'unconfirmed') {
          cleanupOutcome = 'unconfirmed';
        }
        if (res && (!res.error || (res.error.code !== 'EXECUTABLE_UNAVAILABLE' && res.error.code !== 'CWD_INVALID' && res.error.code !== 'CWD_UNSAFE' && res.error.code !== 'PROMPT_OVERSIZED'))) {
          attemptChildSpawned = true;
        }
        return res;
      }
    };

    const probeTimeoutMs = 30_000;
    const probeRunnerFactory = dependencies.createProbeRunner || createProbeRunner;
    const generationRunnerFactory = dependencies.createGenerationRunner || createGenerationRunner;

    async function qualifyRoute(targetRoute, probeDeadline) {
      const routeAdapter = registryLookup(dependencies, targetRoute.backend);
      if (!routeAdapter || typeof routeAdapter.probeVersion !== 'function'
        || typeof routeAdapter.probeAuth !== 'function'
        || typeof routeAdapter.probeCapabilities !== 'function') {
        fail('ADAPTER_CONTRACT_INVALID');
      }
      const probeRunner = probeRunnerFactory({
        runner: probeTrackingRunner,
        deadline: probeDeadline,
        now
      });
      const context = {
        checkpoint,
        prompt: checkpoint.version === 2 ? formatMentorPrompt(checkpoint) : serializeCheckpoint(checkpoint),
        target: targetRoute,
        runner: probeRunner,
        environment,
        signal: dependencies.signal,
        cwd: workspace.realpath,
        workspaceRoot: workspace.realpath,
        requestDepth: 0,
        createInvocation: dependencies.createInvocation
      };
      const adapterVer = version(await routeAdapter.probeVersion(context));
      await routeAdapter.probeAuth(context);
      const capabilitiesRaw = await routeAdapter.probeCapabilities(context);
      let capabilities;
      try { capabilities = validateCapabilityAttestation(capabilitiesRaw); }
      catch { fail('ADAPTER_CONTRACT_INVALID'); }
      if (capabilities.model !== targetRoute.model) fail('MODEL_UNSUPPORTED');
      if (capabilities.effort !== targetRoute.effort) fail('EFFORT_UNSUPPORTED');
      let qualifiedExecutable = null;
      let qualifiedExecutablePath = null;
      try {
        const testInv = await routeAdapter.buildInvocation(context);
        qualifiedExecutable = testInv.executable;
        const envPath = environment?.PATH || process.env.PATH;
        qualifiedExecutablePath = resolveExecutablePath(qualifiedExecutable, envPath);
      } catch {}
      return {
        adapter: routeAdapter,
        adapterVersion: adapterVer,
        capabilities,
        context,
        qualifiedExecutable,
        qualifiedExecutablePath
      };
    }

    let finalResult = null;
    let primaryPreflightSkipped = false;
    let primarySkipError = null;
    let primaryTransientExhausted = false;
    // 1. Qualify primary route
    let primaryQualified = null;
    let primaryProbeError = null;
    const primaryProbeStarted = now();
    const primaryProbeDeadline = started + probeTimeoutMs;

    try {
      primaryQualified = await qualifyRoute(primaryTarget, primaryProbeDeadline);
      adapter = primaryQualified.adapter;
      adapterVersion = primaryQualified.adapterVersion;
    } catch (err) {
      primaryProbeError = err;
      if (err?.cleanupOutcome) {
        cleanupOutcome = err.cleanupOutcome;
      }
    }
    if (dependencies.signal?.aborted) {
      await pushAttempt({
        attempt_id: makeUuid(),
        slot: 'primary',
        route: { backend: primaryTarget.backend, model: primaryTarget.model, effort: primaryTarget.effort },
        phase: 'preflight',
        model_started: false,
        elapsed_ms: elapsed(now, primaryProbeStarted),
        terminal_classification: 'cancelled',
        retry_delay_ms: null,
        cleanup_outcome: cleanupOutcome
      });
      lastRoutingError = createRoutingError('CANCELLED');
      fail('CANCELLED');
    }

    if (primaryProbeError) {
      const primaryProbeCode = failureCode(primaryProbeError, registryLookup(dependencies, primaryTarget.backend));
      if (cleanupOutcome === 'unconfirmed') {
        await pushAttempt({
          attempt_id: makeUuid(),
          slot: 'primary',
          route: { backend: primaryTarget.backend, model: primaryTarget.model, effort: primaryTarget.effort },
          phase: 'preflight',
          model_started: false,
          elapsed_ms: elapsed(now, primaryProbeStarted),
          terminal_classification: 'fatal',
          retry_delay_ms: null,
          cleanup_outcome: 'unconfirmed'
        });
        lastRoutingError = isRoutingError(primaryProbeError) ? primaryProbeError : createRoutingError(primaryProbeCode);
      } else if (ROUTE_LOCAL_PREFLIGHT_CODES.has(primaryProbeCode) && backupTarget) {
        await pushAttempt({
          attempt_id: makeUuid(),
          slot: 'primary',
          route: { backend: primaryTarget.backend, model: primaryTarget.model, effort: primaryTarget.effort },
          phase: 'preflight',
          model_started: false,
          elapsed_ms: elapsed(now, primaryProbeStarted),
          terminal_classification: 'skipped',
          retry_delay_ms: null,
          cleanup_outcome: cleanupOutcome
        });
        primaryPreflightSkipped = true;
        primarySkipError = primaryProbeError;
      } else {
        await pushAttempt({
          attempt_id: makeUuid(),
          slot: 'primary',
          route: { backend: primaryTarget.backend, model: primaryTarget.model, effort: primaryTarget.effort },
          phase: 'preflight',
          model_started: false,
          elapsed_ms: elapsed(now, primaryProbeStarted),
          terminal_classification: 'fatal',
          retry_delay_ms: null,
          cleanup_outcome: cleanupOutcome
        });
        lastRoutingError = isRoutingError(primaryProbeError) ? primaryProbeError : createRoutingError(primaryProbeCode);
      }
    }

    // 2. Primary model attempts
    if (primaryQualified && cleanupOutcome === 'confirmed' && !dependencies.signal?.aborted) {
      await maybeRecordStarted();
      let primaryModelLaunches = 0;
      while (primaryModelLaunches < MAX_PRIMARY_MODEL_ATTEMPTS) {
        primaryModelLaunches++;
        const attemptStarted = now();
        const attemptId = makeUuid();
        attemptChildSpawned = false;

        if (dependencies.signal?.aborted) fail('CANCELLED');

        const generationRunner = generationRunnerFactory({
          runner: generationTrackingRunner,
          wait: selected.policy?.wait || {},
          now
        });

        let execution;
        let executionError = null;
        try {
          primaryQualified.context.runner = generationRunner;
          primaryQualified.context.limits = { mode: 'generation' };
          const invocation = await primaryQualified.adapter.buildInvocation(primaryQualified.context);
          if (primaryQualified.qualifiedExecutable && invocation.executable !== primaryQualified.qualifiedExecutable) {
            fail('EXECUTABLE_UNAVAILABLE');
          }
          const envPath = environment?.PATH || process.env.PATH;
          const currentExecPath = resolveExecutablePath(invocation.executable, envPath);
          if (primaryQualified.qualifiedExecutablePath && currentExecPath !== primaryQualified.qualifiedExecutablePath) {
            fail('EXECUTABLE_UNAVAILABLE');
          }
          execution = await generationRunner.run(invocation, {
            environment, requestDepth: 0, signal: dependencies.signal
          });
          if (execution?.error) {
            if (execution.cleanupOutcome) cleanupOutcome = execution.cleanupOutcome;
            executionError = execution.failure || execution.error;
          }
        } catch (err) {
          if (err?.cleanupOutcome) cleanupOutcome = err.cleanupOutcome;
          executionError = err;
        }

        const modelStarted = Boolean(attemptChildSpawned);

        if (!executionError) {
          if (dependencies.signal?.aborted) {
            executionError = createRoutingError('CANCELLED');
          } else {
            try {
              const adapterResult = await primaryQualified.adapter.parseResult({
                ...primaryQualified.context,
                execution: execution?.result || execution
              });
              if (dependencies.signal?.aborted) {
                executionError = createRoutingError('CANCELLED');
              } else {
                const result = normalizeResult(adapterResult, { checkpoint, maxBytes: MAX_ENVELOPE_BYTES });
                if (dependencies.signal?.aborted) {
                  executionError = createRoutingError('CANCELLED');
                } else {
                  attempts.push({
                    attempt_id: attemptId,
                    slot: 'primary',
                    route: { backend: primaryTarget.backend, model: primaryTarget.model, effort: primaryTarget.effort },
                    phase: 'model',
                    model_started: true,
                    elapsed_ms: elapsed(now, attemptStarted),
                    terminal_classification: 'success',
                    retry_delay_ms: null,
                    cleanup_outcome: cleanupOutcome
                  });

                  finalResult = result;
                  await recordAttempt(attempts.at(-1));
                  break;
                }
              }
            } catch (parseErr) {
              executionError = parseErr;
            }
          }
        }

        if (cleanupOutcome === 'unconfirmed') {
          attempts.push({
            attempt_id: attemptId,
            slot: 'primary',
            route: { backend: primaryTarget.backend, model: primaryTarget.model, effort: primaryTarget.effort },
            phase: 'model',
            model_started: modelStarted,
            elapsed_ms: elapsed(now, attemptStarted),
            terminal_classification: 'fatal',
            retry_delay_ms: null,
            cleanup_outcome: 'unconfirmed'
          });
          lastRoutingError = isRoutingError(executionError) ? executionError : createRoutingError(failureCode(executionError, primaryQualified.adapter));
          await recordAttempt(attempts.at(-1));
          break;
        }

        if (dependencies.signal?.aborted || (isRoutingError(executionError) && executionError.code === 'CANCELLED')) {
          attempts.push({
            attempt_id: attemptId,
            slot: 'primary',
            route: { backend: primaryTarget.backend, model: primaryTarget.model, effort: primaryTarget.effort },
            phase: modelStarted ? 'model' : 'preflight',
            model_started: modelStarted,
            elapsed_ms: elapsed(now, attemptStarted),
            terminal_classification: 'cancelled',
            retry_delay_ms: null,
            cleanup_outcome: cleanupOutcome
          });
          lastRoutingError = createRoutingError('CANCELLED');
          await recordAttempt(attempts.at(-1));
          break;
        }

        const classified = classifyAttemptFailure(executionError, primaryQualified.adapter);
        lastRoutingError = isRoutingError(executionError) ? executionError : createRoutingError(classified.code);

        if (!modelStarted && ROUTE_LOCAL_PREFLIGHT_CODES.has(classified.code) && backupTarget) {
          attempts.push({
            attempt_id: attemptId,
            slot: 'primary',
            route: { backend: primaryTarget.backend, model: primaryTarget.model, effort: primaryTarget.effort },
            phase: 'preflight',
            model_started: false,
            elapsed_ms: elapsed(now, attemptStarted),
            terminal_classification: 'skipped',
            retry_delay_ms: null,
            cleanup_outcome: cleanupOutcome
          });
          await recordAttempt(attempts.at(-1));
          primaryPreflightSkipped = true;
          primarySkipError = executionError;
          break;
        }

        if (!modelStarted) {
          attempts.push({
            attempt_id: attemptId,
            slot: 'primary',
            route: { backend: primaryTarget.backend, model: primaryTarget.model, effort: primaryTarget.effort },
            phase: 'preflight',
            model_started: false,
            elapsed_ms: elapsed(now, attemptStarted),
            terminal_classification: 'fatal',
            retry_delay_ms: null,
            cleanup_outcome: cleanupOutcome
          });
          await recordAttempt(attempts.at(-1));
          break;
        }

        if (classified.classification !== 'transient' || !classified.retryable) {
          attempts.push({
            attempt_id: attemptId,
            slot: 'primary',
            route: { backend: primaryTarget.backend, model: primaryTarget.model, effort: primaryTarget.effort },
            phase: 'model',
            model_started: true,
            elapsed_ms: elapsed(now, attemptStarted),
            terminal_classification: 'fatal',
            retry_delay_ms: null,
            cleanup_outcome: cleanupOutcome
          });
          await recordAttempt(attempts.at(-1));
          break;
        }

        if (primaryModelLaunches < MAX_PRIMARY_MODEL_ATTEMPTS) {
          const backoffMs = PRIMARY_RETRY_DELAYS_MS[primaryModelLaunches - 1];
          const effectiveDelayMs = classified.cooldown_ms
            ? Math.max(backoffMs, classified.cooldown_ms)
            : backoffMs;

          attempts.push({
            attempt_id: attemptId,
            slot: 'primary',
            route: { backend: primaryTarget.backend, model: primaryTarget.model, effort: primaryTarget.effort },
            phase: 'model',
            model_started: true,
            elapsed_ms: elapsed(now, attemptStarted),
            terminal_classification: 'transient',
            retry_delay_ms: effectiveDelayMs,
            cleanup_outcome: cleanupOutcome
          });
          await recordAttempt(attempts.at(-1));

          await cancellableDelay(effectiveDelayMs, dependencies.signal, dependencies.sleep);
        } else {
          attempts.push({
            attempt_id: attemptId,
            slot: 'primary',
            route: { backend: primaryTarget.backend, model: primaryTarget.model, effort: primaryTarget.effort },
            phase: 'model',
            model_started: true,
            elapsed_ms: elapsed(now, attemptStarted),
            terminal_classification: 'transient',
            retry_delay_ms: null,
            cleanup_outcome: cleanupOutcome
          });
          await recordAttempt(attempts.at(-1));
          primaryTransientExhausted = true;
          break;
        }
      }
    }

    // 3. Backup route (if primary skipped or primary transient exhausted)
    const shouldRunBackup = (primaryPreflightSkipped || primaryTransientExhausted)
      && !finalResult
      && cleanupOutcome === 'confirmed'
      && !dependencies.signal?.aborted
      && Boolean(backupTarget);

    if (shouldRunBackup) {
      target = backupTarget;
      adapter = null;
      adapterVersion = null;

      let backupQualified = null;
      let backupProbeError = null;
      const backupProbeStarted = now();
      const backupProbeDeadline = now() + probeTimeoutMs;

      try {
        backupQualified = await qualifyRoute(backupTarget, backupProbeDeadline);
        adapter = backupQualified.adapter;
        adapterVersion = backupQualified.adapterVersion;
      } catch (err) {
        backupProbeError = err;
        if (err?.cleanupOutcome) cleanupOutcome = err.cleanupOutcome;
      }
      if (dependencies.signal?.aborted) {
        await pushAttempt({
          attempt_id: makeUuid(),
          slot: 'backup',
          route: { backend: backupTarget.backend, model: backupTarget.model, effort: backupTarget.effort },
          phase: 'preflight',
          model_started: false,
          elapsed_ms: elapsed(now, backupProbeStarted),
          terminal_classification: 'cancelled',
          retry_delay_ms: null,
          cleanup_outcome: cleanupOutcome
        });
        lastRoutingError = createRoutingError('CANCELLED');
        fail('CANCELLED');
      }

      if (backupProbeError) {
        const backupCode = dependencies.signal?.aborted
          ? 'CANCELLED'
          : failureCode(backupProbeError, registryLookup(dependencies, backupTarget.backend));

        attempts.push({
          attempt_id: makeUuid(),
          slot: 'backup',
          route: { backend: backupTarget.backend, model: backupTarget.model, effort: backupTarget.effort },
          phase: 'preflight',
          model_started: false,
          elapsed_ms: elapsed(now, backupProbeStarted),
          terminal_classification: dependencies.signal?.aborted ? 'cancelled' : 'fatal',
          retry_delay_ms: null,
          cleanup_outcome: cleanupOutcome
        });
        await recordAttempt(attempts.at(-1));

        if (dependencies.signal?.aborted) {
          lastRoutingError = createRoutingError('CANCELLED');
        } else if (cleanupOutcome === 'unconfirmed') {
          lastRoutingError = isRoutingError(backupProbeError) ? backupProbeError : createRoutingError(backupCode);
        } else if (primaryPreflightSkipped) {
          const skipError = primarySkipError || primaryProbeError;
          lastRoutingError = isRoutingError(skipError)
            ? skipError
            : createRoutingError(failureCode(skipError, registryLookup(dependencies, primaryTarget.backend)));
        } else {
          lastRoutingError = isRoutingError(backupProbeError) ? backupProbeError : createRoutingError(backupCode);
        }
      } else if (backupQualified && cleanupOutcome === 'confirmed' && !dependencies.signal?.aborted) {
        await maybeRecordStarted();
        const backupAttemptStarted = now();
        const backupAttemptId = makeUuid();
        attemptChildSpawned = false;

        const generationRunner = generationRunnerFactory({
          runner: generationTrackingRunner,
          wait: selected.policy?.wait || {},
          now
        });

        let backupExecution;
        let backupExecutionError = null;
        try {
          backupQualified.context.runner = generationRunner;
          backupQualified.context.limits = { mode: 'generation' };
          const invocation = await backupQualified.adapter.buildInvocation(backupQualified.context);
          if (backupQualified.qualifiedExecutable && invocation.executable !== backupQualified.qualifiedExecutable) {
            fail('EXECUTABLE_UNAVAILABLE');
          }
          const envPath = environment?.PATH || process.env.PATH;
          const currentExecPath = resolveExecutablePath(invocation.executable, envPath);
          if (backupQualified.qualifiedExecutablePath && currentExecPath !== backupQualified.qualifiedExecutablePath) {
            fail('EXECUTABLE_UNAVAILABLE');
          }
          backupExecution = await generationRunner.run(invocation, {
            environment, requestDepth: 0, signal: dependencies.signal
          });
          if (backupExecution?.error) {
            if (backupExecution.cleanupOutcome) cleanupOutcome = backupExecution.cleanupOutcome;
            backupExecutionError = backupExecution.failure || backupExecution.error;
          }
        } catch (err) {
          if (err?.cleanupOutcome) cleanupOutcome = err.cleanupOutcome;
          backupExecutionError = err;
        }

        const backupModelStarted = Boolean(attemptChildSpawned);

        if (!backupExecutionError) {
          if (dependencies.signal?.aborted) {
            backupExecutionError = createRoutingError('CANCELLED');
          } else {
            try {
              const adapterResult = await backupQualified.adapter.parseResult({
                ...backupQualified.context,
                execution: backupExecution?.result || backupExecution
              });
              if (dependencies.signal?.aborted) {
                backupExecutionError = createRoutingError('CANCELLED');
              } else {
                const result = normalizeResult(adapterResult, { checkpoint, maxBytes: MAX_ENVELOPE_BYTES });
                if (dependencies.signal?.aborted) {
                  backupExecutionError = createRoutingError('CANCELLED');
                } else {
                  attempts.push({
                    attempt_id: backupAttemptId,
                    slot: 'backup',
                    route: { backend: backupTarget.backend, model: backupTarget.model, effort: backupTarget.effort },
                    phase: 'model',
                    model_started: true,
                    elapsed_ms: elapsed(now, backupAttemptStarted),
                    terminal_classification: 'success',
                    retry_delay_ms: null,
                    cleanup_outcome: cleanupOutcome
                  });

                  finalResult = result;
                  await recordAttempt(attempts.at(-1));
                }
              }
            } catch (parseErr) {
              backupExecutionError = parseErr;
            }
          }
        }

        if (backupExecutionError) {
          if (dependencies.signal?.aborted || (isRoutingError(backupExecutionError) && backupExecutionError.code === 'CANCELLED')) {
            lastRoutingError = createRoutingError('CANCELLED');
            attempts.push({
              attempt_id: backupAttemptId,
              slot: 'backup',
              route: { backend: backupTarget.backend, model: backupTarget.model, effort: backupTarget.effort },
              phase: backupModelStarted ? 'model' : 'preflight',
              model_started: backupModelStarted,
              elapsed_ms: elapsed(now, backupAttemptStarted),
              terminal_classification: 'cancelled',
              retry_delay_ms: null,
              cleanup_outcome: cleanupOutcome
            });
          } else if (cleanupOutcome === 'unconfirmed') {
            lastRoutingError = isRoutingError(backupExecutionError)
              ? backupExecutionError
              : createRoutingError(failureCode(backupExecutionError, backupQualified.adapter));
            attempts.push({
              attempt_id: backupAttemptId,
              slot: 'backup',
              route: { backend: backupTarget.backend, model: backupTarget.model, effort: backupTarget.effort },
              phase: 'model',
              model_started: backupModelStarted,
              elapsed_ms: elapsed(now, backupAttemptStarted),
              terminal_classification: 'fatal',
              retry_delay_ms: null,
              cleanup_outcome: 'unconfirmed'
            });
          } else {
            const classified = classifyAttemptFailure(backupExecutionError, backupQualified.adapter);
            lastRoutingError = isRoutingError(backupExecutionError) ? backupExecutionError : createRoutingError(classified.code);
            attempts.push({
              attempt_id: backupAttemptId,
              slot: 'backup',
              route: { backend: backupTarget.backend, model: backupTarget.model, effort: backupTarget.effort },
              phase: 'model',
              model_started: backupModelStarted,
              elapsed_ms: elapsed(now, backupAttemptStarted),
              terminal_classification: classified.classification === 'transient' ? 'transient' : 'fatal',
              retry_delay_ms: null,
              cleanup_outcome: cleanupOutcome
            });
          }
          await recordAttempt(attempts.at(-1));
        }
      }
    }

    if (finalResult && cleanupOutcome === 'confirmed' && !dependencies.signal?.aborted) {
      envelope = buildSuccessEnvelope({
        correlation_id: correlationId,
        checkpoint,
        checkpoint_digest: digest,
        receipt: receipt(),
        attempts,
        result: finalResult,
        cleanup_outcome: cleanupOutcome
      });
    } else {
      if (dependencies.signal?.aborted) {
        lastRoutingError = createRoutingError('CANCELLED');
      } else if (!lastRoutingError) {
        lastRoutingError = cleanupOutcome === 'unconfirmed'
          ? createRoutingError('CLEANUP_UNCONFIRMED')
          : createRoutingError('PROCESS_FAILED');
      }
      envelope = buildFailureEnvelope({
        correlation_id: correlationId,
        checkpoint,
        checkpoint_digest: digest,
        receipt: receipt(),
        attempts,
        error: lastRoutingError,
        cleanup_outcome: cleanupOutcome
      });
    }
  } catch (error) {
    if (error?.cleanupOutcome) {
      cleanupOutcome = error.cleanupOutcome;
    }
    const code = dependencies.signal?.aborted ? 'CANCELLED' : failureCode(error, adapter);
    lastRoutingError = isRoutingError(error) ? error : createRoutingError(code);
    if (!envelope) {
      if (checkpoint?.version === 2 && target?.backend && target?.model && target?.effort && attempts.length === 0) {
        await pushAttempt({
          attempt_id: correlationId,
          slot: 'primary',
          route: { backend: target.backend, model: target.model, effort: target.effort },
          phase: 'preflight',
          model_started: false,
          elapsed_ms: elapsed(now, started),
          terminal_classification: dependencies.signal?.aborted ? 'cancelled' : 'fatal',
          retry_delay_ms: null,
          cleanup_outcome: cleanupOutcome
        });
      }
      envelope = buildFailureEnvelope({
        correlation_id: correlationId,
        checkpoint,
        checkpoint_digest: digest,
        receipt: receipt(),
        attempts,
        error: lastRoutingError,
        cleanup_outcome: cleanupOutcome
      });
    }
  } finally {
    if (workspace) {
      const cleanup = dependency(dependencies, 'cleanupWorkspace', cleanupWorkspace);
      try {
        const cleanupResult = await cleanup(workspace);
        if (cleanupResult?.outcome !== 'confirmed') {
          cleanupOutcome = 'unconfirmed';
          const lastAttempt = attempts.at(-1);
          if (lastAttempt) {
            attempts[attempts.length - 1] = {
              ...lastAttempt,
              cleanup_outcome: 'unconfirmed',
              terminal_classification: envelope?.status === 'ADVICE_READY' ? 'fatal' : lastAttempt.terminal_classification
            };
            await recordAttempt(attempts.at(-1));
          }
          if (envelope?.status === 'ADVICE_READY') {
            envelope = buildFailureEnvelope({
              correlation_id: correlationId,
              checkpoint,
              checkpoint_digest: digest,
              receipt: receipt(),
              attempts,
              error: createRoutingError('CLEANUP_UNCONFIRMED'),
              cleanup_outcome: 'unconfirmed'
            });
          }
        }
      } catch {
        cleanupOutcome = 'unconfirmed';
        const lastAttempt = attempts.at(-1);
        if (lastAttempt) {
          attempts[attempts.length - 1] = {
            ...lastAttempt,
            cleanup_outcome: 'unconfirmed',
            terminal_classification: envelope?.status === 'ADVICE_READY' ? 'fatal' : lastAttempt.terminal_classification
          };
          await recordAttempt(attempts.at(-1));
        }
        if (envelope?.status === 'ADVICE_READY') {
          envelope = buildFailureEnvelope({
            correlation_id: correlationId,
            checkpoint,
            checkpoint_digest: digest,
            receipt: receipt(),
            attempts,
            error: createRoutingError('CLEANUP_UNCONFIRMED'),
            cleanup_outcome: 'unconfirmed'
          });
        }
      }
    }
    if (dependencies.signal?.aborted) {
      const lastAttempt = attempts.at(-1);
      if (lastAttempt) {
        const isSettled = lastAttempt.terminal_classification === 'transient'
          || lastAttempt.terminal_classification === 'success'
          || lastAttempt.terminal_classification === 'skipped';
        attempts[attempts.length - 1] = {
          ...lastAttempt,
          cleanup_outcome: cleanupOutcome,
          terminal_classification: isSettled ? lastAttempt.terminal_classification : 'cancelled'
        };
        await recordAttempt(attempts.at(-1));
      }
      envelope = buildFailureEnvelope({
        correlation_id: correlationId,
        checkpoint,
        checkpoint_digest: digest,
        receipt: envelope?.receipt || receipt(),
        attempts,
        error: createRoutingError('CANCELLED'),
        cleanup_outcome: cleanupOutcome
      });
    }
    if (envelope && envelope.cleanup_outcome !== cleanupOutcome) {
      envelope = envelope.status === 'ADVICE_READY'
        ? buildSuccessEnvelope({
          correlation_id: correlationId,
          checkpoint,
          checkpoint_digest: digest,
          receipt: receipt(),
          attempts,
          result: envelope.result,
          cleanup_outcome: cleanupOutcome
        })
        : buildFailureEnvelope({
          correlation_id: correlationId,
          checkpoint,
          checkpoint_digest: digest,
          receipt: receipt(),
          attempts,
          error: lastRoutingError || envelope.error,
          cleanup_outcome: cleanupOutcome
        });
    }

    let finalAuditStatus = 'disabled';
    if (checkpoint?.version === 2 && selected?.policy?.history) {
      if (auditRecorded && !auditDegraded) {
        try {
          const terminalRecord = {
            schema_version: 1,
            consultation_id: correlationId,
            task_run_id: checkpoint.task_run_id,
            project_id: projectId,
            checkpoint_digest: digest,
            checkpoint,
            route: {
              backend: envelope?.receipt?.backend || target?.backend || 'unknown',
              model: envelope?.receipt?.model || target?.model || 'unknown',
              effort: envelope?.receipt?.effort || target?.effort || 'high'
            },
            receipt: envelope?.receipt || receipt(),
            prompt_identity: 'canonical-mentor-brief-v2',
            build_identity: ADVISOR_BUILD_IDENTITY,
            attempts: attempts.slice(0, 16),
            status: envelope?.status === 'ADVICE_READY' ? 'ADVICE_READY' : 'FAILED',
            result: envelope?.status === 'ADVICE_READY' ? envelope.result : null,
            error: envelope?.status === 'FAILED'
              ? (envelope?.error || serializeRoutingError(lastRoutingError || createRoutingError('PROCESS_FAILED')))
              : null,
            started_at: startedAt,
            completed_at: Date.now()
          };
          await recordTerminal(dependencies, terminalRecord, selected.policy);
          finalAuditStatus = 'recorded';
        } catch {
          finalAuditStatus = 'degraded';
        }
      } else if (auditStartedAttempted || auditDegraded) {
        finalAuditStatus = 'degraded';
      }
    }

    if (envelope && envelope.audit_status !== finalAuditStatus) {
      envelope = envelope.status === 'ADVICE_READY'
        ? buildSuccessEnvelope({
          correlation_id: correlationId,
          checkpoint,
          checkpoint_digest: digest,
          receipt: receipt(),
          attempts,
          result: envelope.result,
          audit_status: finalAuditStatus,
          cleanup_outcome: cleanupOutcome
        })
        : buildFailureEnvelope({
          correlation_id: correlationId,
          checkpoint,
          checkpoint_digest: digest,
          receipt: receipt(),
          attempts,
          error: lastRoutingError || envelope.error,
          audit_status: finalAuditStatus,
          cleanup_outcome: cleanupOutcome
        });
    }
    if (envelope && typeof dependencies.onAttempt === 'function') {
      try {
        const lastAttempt = attempts.at(-1);
        dependencies.onAttempt({
          attempt_id: lastAttempt?.attempt_id || correlationId,
          terminal_classification: envelope.status === 'ADVICE_READY'
            ? 'success'
            : (dependencies.signal?.aborted ? 'cancelled' : (lastAttempt?.terminal_classification || 'fatal')),
          cleanup_outcome: cleanupOutcome,
          error: envelope.status === 'ADVICE_READY' ? null : (lastRoutingError || envelope.error || null)
        });
      } catch {}
    }
  }
  return envelope;
}

function diagnosticRequestId(value) {
  if (typeof value !== 'string' || !REQUEST_ID.test(value) || CONTROL.test(value)
    || Buffer.byteLength(value, 'utf8') > REQUEST_ID_LIMIT) fail('REQUEST_INVALID');
  return value;
}
function validateDiagnosticRequest(value) {
  if (!isPlainObject(value)) fail('REQUEST_INVALID');
  const keys = Object.keys(value);
  if (keys.length !== 4 || keys.some((key) => !['protocol', 'protocolVersion', 'requestId', 'operation'].includes(key))) {
    fail('REQUEST_INVALID');
  }
  if (value.protocol !== DIAGNOSTIC_PROTOCOL || value.protocolVersion !== DIAGNOSTIC_VERSION
    || value.operation !== DIAGNOSTIC_OPERATION) fail('REQUEST_INVALID');
  diagnosticRequestId(value.requestId);
  return Object.freeze({
    protocol: DIAGNOSTIC_PROTOCOL,
    protocolVersion: DIAGNOSTIC_VERSION,
    requestId: value.requestId,
    operation: DIAGNOSTIC_OPERATION
  });
}
function parseDiagnosticRequest(input) {
  let text;
  if (typeof input === 'string') {
    if (Buffer.byteLength(input, 'utf8') > MAX_ENVELOPE_BYTES) fail('REQUEST_INVALID');
    text = input;
  } else if (Buffer.isBuffer(input) || input instanceof Uint8Array) {
    if (input.byteLength > MAX_ENVELOPE_BYTES) fail('REQUEST_INVALID');
    text = decodeUtf8(input, 'REQUEST_INVALID');
  } else fail('REQUEST_INVALID');
  try { return validateDiagnosticRequest(parseJsonDocument(text, 'REQUEST_INVALID', 'REQUEST_INVALID')); }
  catch (error) {
    if (isRoutingError(error)) throw error.code === 'PROTOCOL_INVALID'
      ? createRoutingError('REQUEST_INVALID') : error;
    fail('REQUEST_INVALID');
  }
}
function serializeDiagnosticRequest(value) {
  const request = validateDiagnosticRequest(value);
  const encoded = JSON.stringify(request);
  if (Buffer.byteLength(encoded, 'utf8') > MAX_ENVELOPE_BYTES) fail('REQUEST_INVALID');
  return encoded;
}
function isDiagnosticRequest(value) {
  return isPlainObject(value) && value.protocol === DIAGNOSTIC_PROTOCOL;
}
function diagnosticFailure(requestId, target, probes, error) {
  return {
    protocol: DIAGNOSTIC_PROTOCOL,
    protocolVersion: DIAGNOSTIC_VERSION,
    requestId,
    status: 'FAILED',
    target,
    probes,
    error: serializeRoutingError(error)
  };
}
function diagnosticText(value) {
  if (typeof value !== 'string' || !value || value.trim() !== value || CONTROL.test(value)
    || Buffer.byteLength(value, 'utf8') > VERSION_LIMIT) fail('ADAPTER_CONTRACT_INVALID');
  return value;
}
function diagnosticCapabilities(value, target) {
  let capabilities;
  try { capabilities = validateCapabilityAttestation(value); }
  catch { fail('ADAPTER_CONTRACT_INVALID'); }
  if (capabilities.model !== target.model) fail('MODEL_UNSUPPORTED');
  if (capabilities.effort !== target.effort) fail('EFFORT_UNSUPPORTED');
  return {
    status: 'passed',
    model: capabilities.model,
    effort: capabilities.effort,
    noninteractive: capabilities.noninteractive,
    session: diagnosticText(capabilities.session),
    tools: diagnosticText(capabilities.tools),
    output: diagnosticText(capabilities.output)
  };
}
async function boundedProbe(fn, context, deadline, now) {
  if (context.signal?.aborted) fail('CANCELLED');
  const remaining = Math.floor(deadline - now());
  if (remaining < 1) fail('TIMEOUT');
  let timer;
  let onAbort;
  const expiry = new Promise((resolve, reject) => {
    timer = setTimeout(() => reject(createRoutingError('TIMEOUT')), remaining);
    onAbort = () => reject(createRoutingError('CANCELLED'));
    context.signal?.addEventListener('abort', onAbort, { once: true });
  });
  try { return await Promise.race([Promise.resolve().then(() => fn(context)), expiry]); }
  finally {
    clearTimeout(timer);
    context.signal?.removeEventListener('abort', onAbort);
  }
}
function safeDiagnosticRequestId(input) {
  try {
    const raw = Buffer.isBuffer(input) || input instanceof Uint8Array
      ? decodeUtf8(input, 'REQUEST_INVALID') : input;
    const value = typeof raw === 'string' ? parseJsonDocument(raw) : raw;
    return isPlainObject(value) && typeof value.requestId === 'string'
      && REQUEST_ID.test(value.requestId)
      && Buffer.byteLength(value.requestId, 'utf8') <= REQUEST_ID_LIMIT
      ? value.requestId : null;
  } catch { return null; }
}
async function runQualificationDiagnostic(input, dependencies = {}) {
  const probes = {
    version: { status: 'not-run' },
    auth: { status: 'not-run' },
    capabilities: { status: 'not-run' }
  };
  let target = null;
  let requestId = safeDiagnosticRequestId(input);
  const now = dependency(dependencies, 'monotonicMilliseconds', monotonicMilliseconds);
  let started;
  try { started = now(); } catch { started = monotonicMilliseconds(); }
  let adapter = null;
  try {
    const rawRequest = await input;
    requestId = safeDiagnosticRequestId(rawRequest) ?? requestId;
    const request = parseDiagnosticRequest(rawRequest);
    if (dependencies.signal?.aborted) fail('CANCELLED');
    const sourceEnvironment = dependencies.environment || process.env;
    const loaded = await dependency(dependencies, 'loadGlobalPolicy', loadGlobalPolicy)(sourceEnvironment?.HOME);
    target = targetFromPolicy(loaded?.policy ?? loaded).target;
    adapter = registryLookup(dependencies, target.backend);
    if (!adapter || typeof adapter.probeVersion !== 'function' || typeof adapter.probeAuth !== 'function'
      || typeof adapter.probeCapabilities !== 'function') fail('ADAPTER_CONTRACT_INVALID');
    const environment = buildProbeEnvironment({
      source: sourceEnvironment,
      adapter: target.backend,
      authKeys: Array.isArray(adapter.authKeys) ? adapter.authKeys : [],
      requestDepth: 0
    });
    let cwd;
    try { cwd = dependencies.cwd || process.cwd(); } catch { fail('CWD_INVALID'); }
    const workspaceRoot = dependencies.workspaceRoot || cwd;
    const baseRunner = dependencies.runner || createRunner();
    const timeoutMs = Number.isFinite(target.timeout_ms) ? target.timeout_ms : 900_000;
    const deadline = started + timeoutMs;
    const deadlineRunner = createDeadlineRunner({ runner: baseRunner, deadline, now });
    const context = {
      request, target, runner: deadlineRunner, environment, signal: dependencies.signal,
      cwd, workspaceRoot, requestDepth: 0, createInvocation: dependencies.createInvocation
    };
    const adapterVersion = version(await boundedProbe(adapter.probeVersion, context, deadline, now));
    probes.version = { status: 'passed', value: adapterVersion };
    await boundedProbe(adapter.probeAuth, context, deadline, now);
    probes.auth = { status: 'passed' };
    const capabilities = await boundedProbe(adapter.probeCapabilities, context, deadline, now);
    probes.capabilities = diagnosticCapabilities(capabilities, target);
    const result = {
      protocol: DIAGNOSTIC_PROTOCOL,
      protocolVersion: DIAGNOSTIC_VERSION,
      requestId: request.requestId,
      status: 'QUALIFIED',
      target: { backend: target.backend, model: target.model, effort: target.effort },
      probes
    };
    if (Buffer.byteLength(JSON.stringify(result), 'utf8') > MAX_ENVELOPE_BYTES) fail('OUTPUT_LIMIT');
    return result;
  } catch (error) {
    const code = dependencies.signal?.aborted ? 'CANCELLED' : failureCode(error, adapter);
    const safeError = createRoutingError(ERROR_CODES[code] ? code : 'PROCESS_FAILED');
    return diagnosticFailure(requestId, target ? {
      backend: target.backend, model: target.model, effort: target.effort
    } : null, probes, safeError);
  }
}

module.exports = {
  CONTROLLER_VERSION,
  DIAGNOSTIC_PROTOCOL,
  DIAGNOSTIC_VERSION,
  DIAGNOSTIC_OPERATION,
  parseInput,
  parseDiagnosticRequest,
  validateDiagnosticRequest,
  serializeDiagnosticRequest,
  isDiagnosticRequest,
  runController,
  runQualificationDiagnostic,
  targetFromPolicy
};
