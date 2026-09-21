'use strict';

/**
 * @file history-provider.cjs
 * Cooperative history operations provider for EVCrate Advisor Provider (Phase E01).
 *
 * Implements bounded Fair FIFO refresh scheduling across worker contexts,
 * summary metrics calculation, tie-breaking pagination, and fingerprinted detail reread.
 */

const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { scanHistoryRecords } = require('./history-scanner.cjs');
const { getHistoryDetail } = require('./history-detail.cjs');
const { invalidInput, overloaded } = require('./provider-errors.cjs');
const { resolveAdvisorModule } = require('./authorized-backend.cjs');
const { calculateHistoryMetrics } = require(resolveAdvisorModule('generated/advisor-metrics.js'));

class RefreshQueue {
  constructor(maxQueueSize = 32) {
    this.maxQueueSize = maxQueueSize;
    this.queue = [];
    this.active = false;
  }

  async enqueue(taskFn) {
    if (this.queue.length >= this.maxQueueSize) {
      throw overloaded('Refresh queue capacity exceeded');
    }
    return new Promise((resolve, reject) => {
      this.queue.push({ taskFn, resolve, reject });
      this._drain();
    });
  }

  async _drain() {
    if (this.active || this.queue.length === 0) return;
    this.active = true;
    const { taskFn, resolve, reject } = this.queue.shift();
    try {
      const result = await taskFn();
      resolve(result);
    } catch (err) {
      reject(err);
    } finally {
      this.active = false;
      this._drain();
    }
  }
}

class HistoryProvider {
  constructor(snapshotStore, historyRootPath = undefined) {
    this.store = snapshotStore;
    this.historyRoot = historyRootPath || path.join(process.env.HOME || '', '.evcrate', 'advisor-history');
    this.refreshQueue = new RefreshQueue(32);
  }

  async refresh(context, options = {}) {
    const { signal, deadline } = options;

    return this.refreshQueue.enqueue(async () => {
      try {
        const scanRes = await scanHistoryRecords(this.historyRoot, context.historyIdentity, { signal, deadline });

        const snapshotId = randomUUID();
        const entry = this.store.commitSnapshot(context.contextId, {
          snapshot_id: snapshotId,
          history_identity: context.historyIdentity,
          state: 'fresh',
          stale_reason: null,
          observed_at: Date.now(),
          scan: scanRes.scan,
          rows: scanRes.rows,
          raw_records: scanRes.rawRecords,
          normalized_records: scanRes.normalizedRecords
        });

        return {
          state: entry.state,
          snapshot_id: entry.snapshotId,
          observed_at: entry.observedAt,
          scan: entry.scan,
          stale_reason: null
        };
      } catch (err) {
        if (err.name === 'ProviderError' && (err.code === 'CANCELLED' || err.code === 'DEADLINE_EXCEEDED')) {
          const reason = err.code === 'CANCELLED' ? 'cancelled' : 'deadline';
          const prior = this.store.getLatestSnapshot(context.contextId);
          if (prior) {
            this.store.markStale(context.contextId, reason);
            return {
              state: 'stale',
              snapshot_id: prior.snapshotId,
              observed_at: prior.observedAt,
              scan: prior.scan,
              stale_reason: reason
            };
          }
          return {
            state: 'unavailable',
            snapshot_id: null,
            observed_at: Date.now(),
            scan: {
              status: 'incomplete', projects_discovered: 0, tasks_discovered: 0,
              consultations_discovered: 0, accepted_records: 0, invalid_records: 0,
              bytes_discovered: 0, bytes_read: 0, diagnostics: [],
              suppressed_diagnostics: 0, limit_hit: false
            },
            stale_reason: null
          };
        }
        throw err;
      }
    });
  }

  summary(context, params) {
    if (!params || typeof params !== 'object') throw invalidInput('params required');
    const snapshot = this.store.getSnapshot(context.contextId, params.snapshot_id);

    let candidateRecords = snapshot.normalizedRecords || [];
    if (params.query?.task_run_id) {
      const tid = params.query.task_run_id.toLowerCase();
      candidateRecords = candidateRecords.filter((r) => r.task_run_id.toLowerCase() === tid);
    }

    const metrics = calculateHistoryMetrics({
      records: candidateRecords,
      scan: snapshot.scan,
      filters: params.query?.filters,
      generated_at: Date.now()
    });

    return {
      state: snapshot.state,
      snapshot_id: snapshot.snapshotId,
      metrics
    };
  }

  page(context, params) {
    if (!params || typeof params !== 'object') throw invalidInput('params required');
    if (params.sort && params.sort !== 'started_at_desc') {
      throw invalidInput("sort must be 'started_at_desc'");
    }
    const snapshot = this.store.getSnapshot(context.contextId, params.snapshot_id);
    return this.store.paginate(snapshot, params.query, params.cursor, params.limit);
  }

  detail(context, params) {
    if (!params || typeof params !== 'object') throw invalidInput('params required');
    const snapshot = this.store.getSnapshot(context.contextId, params.snapshot_id);
    return getHistoryDetail(snapshot, params.record_ref);
  }
}

module.exports = {
  HistoryProvider,
  RefreshQueue
};
