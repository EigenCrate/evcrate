'use strict';

/**
 * @file dispatcher.cjs
 * Protocol dispatcher bridging D00 runner protocol to E01 EVCrateAdvisorProvider.
 *
 * Implements:
 * - runner.hello version handshake and capability advertisement
 * - context.open / context.close lifecycle dispatch
 * - plugin.invoke admission, authorization and E01 provider delegation
 * - request.cancel routing to WorkerRequestTable
 * - worker.health and worker.shutdown lifecycle control
 * - Strict rejection of unknown capabilities or methods
 * - Exactly-one JSON-RPC response per request
 */

const {
  RUNNER_PROTOCOL_VERSION,
  WORKER_SDK_VERSION,
  PluginErrorCode,
  PluginError
} = require('@dam-hopper/plugin-sdk');
const { toSafePluginError, logOperationalEvent } = require('./error-mapping.cjs');

const ADVISOR_DATA_VERSION = '1.0.0';

/**
 * Exactly authorized domain capabilities.
 * Does NOT advertise or permit export, prune, policy write, model execution,
 * arbitrary file access, exec, or filesystem discovery outside bindings.
 */
const SUPPORTED_CAPABILITIES = Object.freeze([
  'history.refresh',
  'history.summary',
  'history.page',
  'history.detail',
  'policy.readCurrent',
  'evaluations.list',
  'evaluations.read',
  'evaluations.compare'
]);

function formatSuccessResponse(id, result) {
  return {
    jsonrpc: '2.0',
    id,
    result
  };
}

function formatErrorResponse(id, pluginError) {
  const payload = pluginError.toPayload ? pluginError.toPayload() : {
    code: pluginError.code || PluginErrorCode.WORKER_FAILED,
    message: pluginError.message || 'Worker operation failed'
  };

  return {
    jsonrpc: '2.0',
    id: id || null,
    error: {
      code: payload.code,
      message: payload.message,
      data: {
        ...(payload.details || {}),
        ...(payload.retryable ? { retryable: true } : {})
      }
    }
  };
}

class WorkerDispatcher {
  /**
   * @param {object} dependencies
   * @param {import('./context-table.cjs').WorkerContextTable} dependencies.contextTable
   * @param {import('./request-table.cjs').WorkerRequestTable} dependencies.requestTable
   */
  constructor(dependencies) {
    if (!dependencies || !dependencies.contextTable || !dependencies.requestTable) {
      throw new Error('WorkerDispatcher requires contextTable and requestTable');
    }
    this.contextTable = dependencies.contextTable;
    this.requestTable = dependencies.requestTable;
    this.handshakeCompleted = false;
  }

  /**
   * Dispatches an incoming JSON-RPC request and produces a response.
   *
   * @param {object} message Validated JSON-RPC request object
   * @returns {Promise<object|null>} JSON-RPC response object, or null for notifications
   */
  async dispatch(message) {
    const { id, method, params = {} } = message;
    const isNotification = !('id' in message) || id === undefined;
    const startTime = Date.now();

    try {
      // Before handshake, only runner.hello is allowed
      if (!this.handshakeCompleted && method !== 'runner.hello') {
        throw new PluginError(
          PluginErrorCode.INCOMPATIBLE,
          'Handshake required: runner.hello must be performed before any other operation'
        );
      }

      let result;
      switch (method) {
        case 'runner.hello':
          result = this.handleHello(params);
          break;

        case 'context.open':
          result = this.handleContextOpen(params);
          break;

        case 'context.close':
          result = this.handleContextClose(params);
          break;

        case 'plugin.invoke':
          result = await this.handleInvoke(id, params);
          break;

        case 'request.cancel':
          result = this.handleCancel(params);
          break;

        case 'worker.health':
          result = this.handleHealth();
          break;

        case 'worker.shutdown':
          result = this.handleShutdown();
          break;

        default:
          throw new PluginError(
            PluginErrorCode.INVALID_INPUT,
            `Unknown or unsupported method: ${method}`
          );
      }

      const durationMs = Date.now() - startTime;
      logOperationalEvent({
        requestId: id,
        operation: method,
        safeCode: 'OK',
        durationMs
      });

      if (isNotification) return null;
      return formatSuccessResponse(id, result);
    } catch (err) {
      const safeError = toSafePluginError(err);
      const durationMs = Date.now() - startTime;

      logOperationalEvent({
        requestId: id,
        operation: method,
        safeCode: safeError.code,
        durationMs
      });

      if (isNotification) return null;
      return formatErrorResponse(id, safeError);
    }
  }

  /**
   * Handles runner.hello handshake.
   */
  handleHello(params) {
    const { clientProtocolVersion } = params || {};
    if (typeof clientProtocolVersion !== 'string') {
      throw new PluginError(
        PluginErrorCode.INCOMPATIBLE,
        'Missing clientProtocolVersion in runner.hello'
      );
    }

    const [clientMajor] = clientProtocolVersion.split('.');
    const [supportedMajor] = RUNNER_PROTOCOL_VERSION.split('.');
    if (clientMajor !== supportedMajor) {
      throw new PluginError(
        PluginErrorCode.INCOMPATIBLE,
        `Incompatible protocol major version: expected ${supportedMajor}, received ${clientMajor}`
      );
    }
    if (this.handshakeCompleted) {
      // Reconnect teardown: cancel all active requests and revoke all previous contexts
      this.requestTable.cancelAllRequests('runner_reconnect');
      this.contextTable.revokeAll('runner_reconnect');
    }

    this.handshakeCompleted = true;

    return {
      runnerVersion: '0.1.0',
      negotiatedProtocolVersion: RUNNER_PROTOCOL_VERSION,
      workerSdkVersion: WORKER_SDK_VERSION,
      manifestVersion: 1,
      advisorDataVersion: ADVISOR_DATA_VERSION,
      supportedCapabilities: [...SUPPORTED_CAPABILITIES]
    };
  }

  /**
   * Handles context.open.
   */
  handleContextOpen(params) {
    return this.contextTable.openContext(params);
  }

  /**
   * Handles context.close.
   */
  handleContextClose(params) {
    const { contextId, reason } = params || {};
    if (!contextId || typeof contextId !== 'string') {
      throw new PluginError(PluginErrorCode.INVALID_INPUT, 'Missing contextId in context.close');
    }

    this.requestTable.cancelContextRequests(contextId, reason || 'context_closed');
    const closed = this.contextTable.closeContext(contextId, reason);
    return { closed };
  }

  /**
   * Handles plugin.invoke.
   */
  async handleInvoke(requestId, params) {
    const {
      contextId,
      operation,
      payload = {},
      deadlineMs,
      activationGeneration,
      bindingRevision,
      grantRevision
    } = params || {};
    if (!contextId || typeof contextId !== 'string') {
      throw new PluginError(PluginErrorCode.INVALID_INPUT, 'Missing or invalid contextId');
    }
    if (!operation || typeof operation !== 'string') {
      throw new PluginError(PluginErrorCode.INVALID_INPUT, 'Missing or invalid operation');
    }
    if (!SUPPORTED_CAPABILITIES.includes(operation)) {
      throw new PluginError(
        PluginErrorCode.INVALID_INPUT,
        `Operation '${operation}' is not a supported capability`
      );
    }

    // Verify context authorization and capacity before queue admission
    const contextEntry = this.contextTable.getAuthorizedContext(contextId, operation);

    // Check revision matches if provided by runner
    if (activationGeneration !== undefined && activationGeneration !== contextEntry.activationGeneration) {
      this.requestTable.cancelContextRequests(contextId, 'activation_generation_mismatch');
      this.contextTable.revokeContext(contextId, 'activation_generation_mismatch');
      throw new PluginError(
        PluginErrorCode.CONTEXT_REVOKED,
        `Activation generation mismatch: context=${contextEntry.activationGeneration}, invoke=${activationGeneration}`
      );
    }
    if (bindingRevision !== undefined && bindingRevision !== contextEntry.bindingRevision) {
      this.requestTable.cancelContextRequests(contextId, 'binding_revision_mismatch');
      this.contextTable.revokeContext(contextId, 'binding_revision_mismatch');
      throw new PluginError(
        PluginErrorCode.CONTEXT_REVOKED,
        `Binding revision mismatch: context=${contextEntry.bindingRevision}, invoke=${bindingRevision}`
      );
    }
    if (grantRevision !== undefined && grantRevision !== contextEntry.grantRevision) {
      this.requestTable.cancelContextRequests(contextId, 'grant_revision_mismatch');
      this.contextTable.revokeContext(contextId, 'grant_revision_mismatch');
      throw new PluginError(
        PluginErrorCode.CONTEXT_REVOKED,
        `Grant revision mismatch: context=${contextEntry.grantRevision}, invoke=${grantRevision}`
      );
    }
    this.contextTable.acquireOperation(contextId);
    try {
      const invokeResult = await this.requestTable.admitAndExecute({
        requestId,
        contextId,
        operation,
        deadlineMs,
        execute: async (signal, deadline) => {
          return contextEntry.provider.invoke(operation, payload, { signal, deadline });
        }
      });

      return { result: invokeResult };
    } finally {
      this.contextTable.releaseOperation(contextId);
    }
  }

  /**
   * Handles request.cancel.
   */
  handleCancel(params) {
    const { contextId, requestId } = params || {};
    if (!contextId || typeof contextId !== 'string') {
      throw new PluginError(PluginErrorCode.INVALID_INPUT, 'Missing contextId in request.cancel');
    }
    if (!requestId || typeof requestId !== 'string') {
      throw new PluginError(PluginErrorCode.INVALID_INPUT, 'Missing requestId in request.cancel');
    }

    const outcome = this.requestTable.cancelRequest(requestId, contextId);
    return { outcome };
  }

  /**
   * Handles worker.health.
   */
  handleHealth() {
    return {
      status: 'healthy',
      workerSdkVersion: WORKER_SDK_VERSION,
      runnerProtocolVersion: RUNNER_PROTOCOL_VERSION,
      advisorDataVersion: ADVISOR_DATA_VERSION,
      activeContexts: this.contextTable.size,
      activeRequests: this.requestTable.activeCount,
      queuedRequests: this.requestTable.queuedCount,
      uptimeSec: Math.floor(process.uptime())
    };
  }

  /**
   * Handles worker.shutdown.
   */
  handleShutdown() {
    this.requestTable.cancelAllRequests('worker_shutdown');
    this.contextTable.revokeAll('worker_shutdown');
    return { status: 'shutting_down' };
  }
}

module.exports = {
  SUPPORTED_CAPABILITIES,
  formatSuccessResponse,
  formatErrorResponse,
  WorkerDispatcher
};
