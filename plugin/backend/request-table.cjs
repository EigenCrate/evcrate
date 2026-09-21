'use strict';

/**
 * @file request-table.cjs
 * Admission controller, cancellation state machine, and exactly-once request settlement.
 *
 * Enforces:
 * - Max 16 active worker operations (RESOURCE_BUDGETS.maxOperationsPerWorker)
 * - Max 32 queued operations (RESOURCE_BUDGETS.maxQueueCapacity)
 * - Max 1 active scan (history.refresh) per worker (RESOURCE_BUDGETS.maxActiveScansPerWorker)
 * - Max 1 active evaluation parse per worker
 * - Cooperative AbortController wiring with deadline support
 * - Integration with D00 WorkerCancellationTracker
 * - Exactly-once terminal settlement per request
 */

const {
  RESOURCE_BUDGETS,
  PluginErrorCode,
  PluginError,
  WorkerCancellationTracker
} = require('@dam-hopper/plugin-sdk');
const { toSafePluginError } = require('./error-mapping.cjs');

class WorkerRequestTable {
  /**
   * @param {object} [options]
   * @param {number} [options.maxWorkerOps=16]
   * @param {number} [options.maxQueue=32]
   * @param {number} [options.maxActiveScans=1]
   */
  constructor(options = {}) {
    this.maxWorkerOps = options.maxWorkerOps || RESOURCE_BUDGETS.maxOperationsPerWorker || 16;
    this.maxQueue = options.maxQueue || RESOURCE_BUDGETS.maxQueueCapacity || 32;
    this.maxActiveScans = options.maxActiveScans || RESOURCE_BUDGETS.maxActiveScansPerWorker || 1;

    this.cancellationTracker = new WorkerCancellationTracker();
    /** @type {Map<string, object>} */
    this.activeRequests = new Map();
    /** @type {Array<object>} */
    this.queue = [];

    this.currentWorkerOps = 0;
    this.currentScans = 0;
    this.currentEvaluationParses = 0;
  }

  /**
   * Registers and admits an invocation.
   * If capacity is full, enqueues request up to maxQueue; otherwise starts execution.
   *
   * @param {object} spec
   * @param {string} spec.requestId
   * @param {string} spec.contextId
   * @param {string} spec.operation
   * @param {number} [spec.deadlineMs]
   * @param {Function} spec.execute Async function(signal, deadline): Promise<unknown>
   * @returns {Promise<unknown>} Resolves with result or rejects with PluginError
   */
  async admitAndExecute(spec) {
    const { requestId, contextId, operation, deadlineMs, execute } = spec;

    if (!requestId || typeof requestId !== 'string') {
      throw new PluginError(PluginErrorCode.INVALID_INPUT, 'Invalid requestId');
    }
    if (this.activeRequests.has(requestId)) {
      throw new PluginError(PluginErrorCode.INVALID_INPUT, `Request ID ${requestId} already active`);
    }

    const abortController = new AbortController();
    const cancellationToken = this.cancellationTracker.register(requestId, contextId);

    // Wire cancellation token to abort controller
    cancellationToken.onCancelled(() => {
      if (!abortController.signal.aborted) {
        abortController.abort(new PluginError(PluginErrorCode.CANCELLED, 'Request was cancelled'));
      }
    });

    // Wire optional deadline
    let deadlineTimer = null;
    let effectiveDeadline = null;
    if (typeof deadlineMs === 'number' && deadlineMs > 0) {
      effectiveDeadline = Date.now() + deadlineMs;
      deadlineTimer = setTimeout(() => {
        if (!abortController.signal.aborted) {
          abortController.abort(
            new PluginError(PluginErrorCode.DEADLINE_EXCEEDED, `Operation deadline exceeded (${deadlineMs}ms)`)
          );
        }
      }, deadlineMs);
      if (typeof deadlineTimer.unref === 'function') {
        deadlineTimer.unref();
      }
    }

    const entry = {
      requestId,
      contextId,
      operation,
      abortController,
      cancellationToken,
      deadlineTimer,
      effectiveDeadline,
      execute,
      isScan: operation === 'history.refresh',
      isEvaluationParse: operation === 'evaluations.read' || operation === 'evaluations.compare',
      started: false,
      settled: false,
      resolve: null,
      reject: null
    };

    this.activeRequests.set(requestId, entry);

    return new Promise((resolve, reject) => {
      entry.resolve = resolve;
      entry.reject = reject;

      if (this.canRunImmediately(entry)) {
        this.startRequest(entry);
      } else {
        if (this.queue.length >= this.maxQueue) {
          this.settleRequest(entry, null, new PluginError(
            PluginErrorCode.OVERLOADED,
            `Worker admission queue capacity (${this.maxQueue}) exceeded`,
            { retryable: true }
          ));
        } else {
          this.queue.push(entry);
        }
      }
    });
  }

  /**
   * Checks if an entry can run based on current worker concurrency limits.
   *
   * @param {object} entry
   * @returns {boolean}
   */
  canRunImmediately(entry) {
    if (this.currentWorkerOps >= this.maxWorkerOps) return false;
    if (entry.isScan && this.currentScans >= this.maxActiveScans) return false;
    if (entry.isEvaluationParse && this.currentEvaluationParses >= 1) return false;
    return true;
  }

  /**
   * Begins execution of an admitted request.
   *
   * @param {object} entry
   */
  async startRequest(entry) {
    entry.started = true;
    this.currentWorkerOps++;
    if (entry.isScan) this.currentScans++;
    if (entry.isEvaluationParse) this.currentEvaluationParses++;

    try {
      if (entry.abortController.signal.aborted) {
        throw entry.abortController.signal.reason || new PluginError(PluginErrorCode.CANCELLED, 'Request was cancelled');
      }

      const result = await entry.execute(entry.abortController.signal, entry.effectiveDeadline);
      this.settleRequest(entry, result, null);
    } catch (err) {
      const safeError = toSafePluginError(err);
      this.settleRequest(entry, null, safeError);
    }
  }

  /**
   * Exactly-once terminal settlement for a request.
   *
   * @param {object} entry
   * @param {unknown} result
   * @param {Error|null} error
   */
  settleRequest(entry, result, error) {
    if (entry.settled) return;
    entry.settled = true;

    if (entry.deadlineTimer) {
      clearTimeout(entry.deadlineTimer);
      entry.deadlineTimer = null;
    }

    this.activeRequests.delete(entry.requestId);
    this.cancellationTracker.settle(entry.requestId);

    // Decrement counters only if it had actually started running
    if (entry.started) {
      entry.started = false;
      this.currentWorkerOps = Math.max(0, this.currentWorkerOps - 1);
      if (entry.isScan) this.currentScans = Math.max(0, this.currentScans - 1);
      if (entry.isEvaluationParse) this.currentEvaluationParses = Math.max(0, this.currentEvaluationParses - 1);
    }

    // Deliver settlement exactly once
    if (error) {
      entry.reject(error);
    } else {
      entry.resolve(result);
    }

    // Drain queue for next runnable request
    this.drainQueue();
  }

  /**
   * Attempts to dequeue and start runnable requests from the queue.
   */
  drainQueue() {
    let progressed = true;
    while (progressed && this.queue.length > 0) {
      progressed = false;
      for (let i = 0; i < this.queue.length; i++) {
        const nextEntry = this.queue[i];
        if (this.canRunImmediately(nextEntry)) {
          this.queue.splice(i, 1);
          progressed = true;
          this.startRequest(nextEntry);
          break;
        }
      }
    }
  }

  /**
   * Cancels a specific request.
   *
   * @param {string} requestId
   * @param {string} contextId
   * @returns {import('@dam-hopper/plugin-sdk').CancelOutcome}
   */
  cancelRequest(requestId, contextId) {
    const outcome = this.cancellationTracker.cancel(requestId, contextId);

    const entry = this.activeRequests.get(requestId);
    if (entry && entry.contextId === contextId && !entry.settled) {
      if (!entry.abortController.signal.aborted) {
        entry.abortController.abort(new PluginError(PluginErrorCode.CANCELLED, 'Request was cancelled'));
      }
      // If queued (not yet started), settle immediately
      const queueIdx = this.queue.indexOf(entry);
      if (queueIdx !== -1) {
        this.queue.splice(queueIdx, 1);
        this.settleRequest(entry, null, new PluginError(PluginErrorCode.CANCELLED, 'Request was cancelled'));
      }
    }

    return outcome;
  }

  /**
   * Cancels all active and queued requests for a context.
   *
   * @param {string} contextId
   * @param {string} [reason='context_closed']
   * @returns {number} Count of cancelled requests
   */
  cancelContextRequests(contextId, reason = 'context_closed') {
    let count = 0;
    for (const [requestId, entry] of this.activeRequests.entries()) {
      if (entry.contextId === contextId && !entry.settled) {
        this.cancelRequest(requestId, contextId);
        count++;
      }
    }
    return count;
  }

  /**
   * Aborts all active and queued work (e.g. on worker shutdown or crash).
   *
   * @param {string} [reason='worker_shutdown']
   * @returns {number}
   */
  cancelAllRequests(reason = 'worker_shutdown') {
    const count = this.activeRequests.size;
    for (const [requestId, entry] of this.activeRequests.entries()) {
      if (!entry.settled) {
        this.cancelRequest(requestId, entry.contextId);
      }
    }
    return count;
  }

  get activeCount() {
    return this.activeRequests.size;
  }

  get queuedCount() {
    return this.queue.length;
  }
}

module.exports = {
  WorkerRequestTable
};
