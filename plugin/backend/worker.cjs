#!/usr/bin/env node
'use strict';

/**
 * @file worker.cjs
 * Executable framed Node worker entrypoint for DamHopper Advisor Plugin (Phase E02).
 *
 * Implements:
 * - Pinned D00 Worker SDK framing (4-byte big-endian header + strict UTF-8 JSON-RPC 2.0)
 * - Node >=22.19.0 version verification
 * - Frame decoding: fragmented, coalesced, oversized header, invalid UTF-8, EOF mid-frame
 * - STDOUT purity: protocol frames only; STDERR: bounded sanitized events only
 * - Ephemeral context table, admission/cancellation request table, and method dispatcher
 * - Clean lifecycle shutdown and graceful termination
 */

let pluginSdk;
try {
  pluginSdk = require('@dam-hopper/plugin-sdk');
} catch {
  pluginSdk = require('../node_modules/@dam-hopper/plugin-sdk/dist/index.js');
}
const {
  encodeFrame,
  FrameDecoder,
  validateJsonRpcMessage,
  PluginErrorCode
} = pluginSdk;
const { WorkerContextTable } = require('./context-table.cjs');
const { WorkerRequestTable } = require('./request-table.cjs');
const { WorkerDispatcher, formatErrorResponse } = require('./dispatcher.cjs');
const { toSafePluginError, logOperationalEvent } = require('./error-mapping.cjs');

/**
 * Verifies Node runtime version requirement (>=22.19.0).
 *
 * @param {string} [versionString]
 * @returns {boolean}
 */
function verifyNodeRuntime(versionString = process.version, platform = process.platform) {
  if (typeof versionString !== 'string') return false;
  const clean = versionString.replace(/^v/, '');
  const parts = clean.split('.').map(Number);
  if (parts.length < 3 || parts.some(n => Number.isNaN(n))) return false;
  const [major, minor] = parts;

  if (major < 22) return false;
  if (major === 22 && minor < 19) return false;
  return true;
}

/**
 * Creates and starts a worker framed server over arbitrary duplex or separate streams.
 *
 * @param {object} [options]
 * @param {NodeJS.ReadableStream} [options.stdin=process.stdin]
 * @param {NodeJS.WritableStream} [options.stdout=process.stdout]
 * @param {WorkerContextTable} [options.contextTable]
 * @param {WorkerRequestTable} [options.requestTable]
 * @param {WorkerDispatcher} [options.dispatcher]
 * @returns {object} Control handle
 */
function createWorkerServer(options = {}) {
  const stdin = options.stdin || process.stdin;
  const stdout = options.stdout || process.stdout;

  const contextTable = options.contextTable || new WorkerContextTable();
  const requestTable = options.requestTable || new WorkerRequestTable();
  const dispatcher = options.dispatcher || new WorkerDispatcher({ contextTable, requestTable });

  const decoder = new FrameDecoder();
  let isClosing = false;

  function sendFrame(payloadObject) {
    if (isClosing) return;
    try {
      const jsonStr = JSON.stringify(payloadObject);
      const framedBytes = encodeFrame(jsonStr);
      stdout.write(Buffer.from(framedBytes));
    } catch (err) {
      const safeError = toSafePluginError(err, PluginErrorCode.WORKER_FAILED);
      logOperationalEvent({
        safeCode: safeError.code,
        counts: { frameSendError: 1 }
      });
    }
  }

  function handleMessage(rawMessage) {
    let parsed;
    try {
      parsed = validateJsonRpcMessage(rawMessage);
    } catch (err) {
      const safeError = toSafePluginError(err, PluginErrorCode.INVALID_INPUT);
      logOperationalEvent({
        safeCode: safeError.code,
        counts: { invalidMessage: 1 }
      });
      // Deliver JSON-RPC error frame for parse / structure failure
      sendFrame(formatErrorResponse(null, safeError));
      return;
    }

    dispatcher.dispatch(parsed).then((response) => {
      if (response !== null) {
        sendFrame(response);
      }
    }).catch((err) => {
      const safeError = toSafePluginError(err, PluginErrorCode.WORKER_FAILED);
      sendFrame(formatErrorResponse(parsed?.id || null, safeError));
    });
  }

  function onData(chunk) {
    let frames;
    try {
      frames = decoder.push(new Uint8Array(chunk));
    } catch (err) {
      const safeError = toSafePluginError(err, PluginErrorCode.INVALID_INPUT);
      logOperationalEvent({
        safeCode: safeError.code,
        counts: { frameDecodeError: 1 }
      });
      decoder.reset();
      sendFrame(formatErrorResponse(null, safeError));
      return;
    }

    for (const frame of frames) {
      handleMessage(frame);
    }
  }

  function onEnd() {
    if (decoder.bufferedBytes > 0) {
      logOperationalEvent({
        safeCode: 'EOF_MID_FRAME',
        counts: { unconsumedBytes: decoder.bufferedBytes }
      });
    }
    stop('stdin_closed');
  }

  function onError(err) {
    const safeError = toSafePluginError(err, PluginErrorCode.WORKER_FAILED);
    logOperationalEvent({
      safeCode: safeError.code,
      counts: { streamError: 1 }
    });
    stop('stream_error');
  }

  stdin.on('data', onData);
  stdin.on('end', onEnd);
  stdin.on('error', onError);

  function stop(reason = 'stopped') {
    if (isClosing) return;
    isClosing = true;

    stdin.removeListener('data', onData);
    stdin.removeListener('end', onEnd);
    stdin.removeListener('error', onError);

    requestTable.cancelAllRequests(reason);
    contextTable.revokeAll(reason);

    logOperationalEvent({
      operation: 'worker.stop',
      safeCode: 'OK',
      counts: { reason: 1 }
    });
  }

  return {
    contextTable,
    requestTable,
    dispatcher,
    sendFrame,
    stop
  };
}

// Check runtime before initialization
if (!verifyNodeRuntime()) {
  const errMsg = `Incompatible Node runtime: required >=22.19.0, current is ${process.version}`;
  process.stderr.write(JSON.stringify({ ts: Date.now(), code: 'INCOMPATIBLE', msg: errMsg }) + '\n');
  if (require.main === module) {
    process.exit(1);
  }
}

// Start immediately when executed as script
if (require.main === module) {
  const server = createWorkerServer();

  function handleSignal(sig) {
    logOperationalEvent({
      operation: 'signal',
      safeCode: 'OK',
      counts: { [sig]: 1 }
    });
    server.stop(`signal_${sig}`);
    process.exit(0);
  }

  process.on('SIGTERM', () => handleSignal('SIGTERM'));
  process.on('SIGINT', () => handleSignal('SIGINT'));

  process.on('uncaughtException', (err) => {
    const safeError = toSafePluginError(err, PluginErrorCode.WORKER_FAILED);
    logOperationalEvent({
      safeCode: safeError.code,
      counts: { uncaughtException: 1 }
    });
    server.stop('uncaught_exception');
    process.exit(1);
  });

  process.on('unhandledRejection', (reason) => {
    const safeError = toSafePluginError(reason, PluginErrorCode.WORKER_FAILED);
    logOperationalEvent({
      safeCode: safeError.code,
      counts: { unhandledRejection: 1 }
    });
    server.stop('unhandled_rejection');
    process.exit(1);
  });
}

module.exports = {
  verifyNodeRuntime,
  createWorkerServer
};
