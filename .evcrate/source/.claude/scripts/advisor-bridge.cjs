#!/usr/bin/env node
'use strict';

const path = require('node:path');
const { readRequest } = require('./advisor-dispatch.cjs');
const {
  dispatchCoordinator,
  writeOutput
} = require('./advisor-coordinator.cjs');
const {
  createRoutingError,
  serializeRoutingError
} = require('./advisor-routing/errors.cjs');

const HOST_BY_DIRECTORY = Object.freeze({
  '.antigravity': 'antigravity',
  '.claude': 'claude',
  '.codex': 'codex',
  '.gemini': 'gemini',
  '.pi': 'pi'
});
const DEBUG_SCHEMA = 'evcrate-advisor-debug/v1';
const DEBUG_PHASES = new Set([
  'probe-version',
  'probe-auth',
  'probe-capabilities',
  'build-invocation',
  'final-run',
  'parse-result'
]);
const DEBUG_STATUSES = new Set([
  'completed',
  'cancelled',
  'failed',
  'line-limit',
  'output-invalid',
  'output-limit',
  'process-failed',
  'spawn-failed',
  'timeout'
]);

function safeDebugInteger(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function createDebugCollector(enabled = false) {
  if (!enabled) return null;
  const phases = [];
  let external = false;
  const record = (event) => {
    const phase = event?.phase;
    const status = event?.status;
    if (!DEBUG_PHASES.has(phase) || !DEBUG_STATUSES.has(status)) return;
    const entry = Object.freeze({
      phase,
      status,
      pid: Number.isSafeInteger(event.pid) && event.pid > 0 ? event.pid : null,
      elapsed_ms: safeDebugInteger(event.elapsed_ms),
      termination_wait_ms: safeDebugInteger(event.termination_wait_ms)
    });
    const index = phases.findIndex((candidate) => candidate.phase === phase);
    if (index >= 0) phases[index] = entry;
    else if (phases.length < DEBUG_PHASES.size) phases.push(entry);
  };
  const snapshot = () => Object.freeze({
    schema: DEBUG_SCHEMA,
    version: 1,
    phases: Object.freeze(phases.slice())
  });
  return Object.freeze({
    markExternal: () => { external = true; },
    record,
    shouldAttach: () => external,
    snapshot
  });
}

function attachDebug(output, collector) {
  if (!collector || !collector.shouldAttach() || !output || typeof output !== 'object') return output;
  return Object.freeze({ ...output, debug: collector.snapshot() });
}

function harnessFromPath(directory) {
  const parts = path.resolve(directory).split(path.sep);
  for (let index = parts.length - 1; index >= 0; index -= 1) {
    if (parts[index] === '.gemini') {
      return parts[index + 1] === 'config' ? 'antigravity' : 'gemini';
    }
    const host = HOST_BY_DIRECTORY[parts[index]];
    if (host) return host;
  }
  throw createRoutingError('HOST_INVALID');
}

function bindHarness(request, activeHost) {
  if (request?.active_host !== undefined && request.active_host !== activeHost) {
    throw createRoutingError('HOST_INVALID');
  }
  if (request?.operation === 'dispatch' && request.checkpoint
    && request.checkpoint.active_host !== undefined
    && request.checkpoint.active_host !== activeHost) {
    throw createRoutingError('HOST_INVALID');
  }
  const bound = { ...request, active_host: activeHost };
  if (request?.operation === 'dispatch' && request.checkpoint?.active_host === undefined) {
    bound.checkpoint = { ...request.checkpoint, active_host: activeHost };
  }
  return bound;
}

async function main(input, dependencies = {}) {
  let collector;
  try {
    const request = readRequest(input);
    const bound = bindHarness(request, harnessFromPath(__dirname));
    collector = createDebugCollector(bound.debug === true);
    const coordinatorDependencies = collector
      ? {
        ...dependencies,
        debugSink: collector.record,
        markDebugExternal: collector.markExternal
      }
      : dependencies;
    return attachDebug(await dispatchCoordinator(bound, coordinatorDependencies), collector);
  } catch (error) {
    return attachDebug({ ok: false, error: serializeRoutingError(error) }, collector);
  }
}

async function resumeNative(token, nativeAdvisor) {
  if (typeof nativeAdvisor !== 'function') throw createRoutingError('NATIVE_DISPATCH_UNSUPPORTED');
  return dispatchCoordinator({
    operation: 'resume-native',
    active_host: harnessFromPath(__dirname),
    token
  }, { nativeAdvisor });
}

if (require.main === module) {
  // The CLI cannot carry a host-native JavaScript callback over stdin. Keep
  // native handoffs available to in-process consumers, but fail closed here.
  main(undefined, { allowNativeHandoff: false }).then(writeOutput).catch((error) => {
    writeOutput({ ok: false, error: serializeRoutingError(error) });
  });
}

module.exports = {
  bindHarness,
  createDebugCollector,
  harnessFromPath,
  main,
  resumeNative
};
