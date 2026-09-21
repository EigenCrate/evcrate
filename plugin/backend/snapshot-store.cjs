'use strict';

/**
 * @file snapshot-store.cjs
 * Bounded per-context immutable snapshot store for EVCrate Advisor Provider (Phase E01).
 * Enforces max 2 snapshots/context, 128 MiB aggregate worker cache cap,
 * 5-minute idle TTL, and LRU eviction.
 */

const { randomBytes } = require('node:crypto');
const { snapshotExpired, overloaded } = require('./provider-errors.cjs');
const { encodeCursor, decodeCursor, paginateEntries, MAX_PAGE_BYTES } = require('./cursor-manager.cjs');

const DEFAULT_MAX_SNAPSHOTS_PER_CONTEXT = 2;
const DEFAULT_MAX_AGGREGATE_BYTES = 128 * 1024 * 1024; // 128 MiB
const DEFAULT_IDLE_TTL_MS = 5 * 60 * 1000; // 5 minutes

class SnapshotStore {
  constructor(options = {}) {
    this.maxSnapshotsPerContext = options.maxSnapshotsPerContext ?? DEFAULT_MAX_SNAPSHOTS_PER_CONTEXT;
    this.maxAggregateBytes = options.maxAggregateBytes ?? DEFAULT_MAX_AGGREGATE_BYTES;
    this.idleTtlMs = options.idleTtlMs ?? DEFAULT_IDLE_TTL_MS;
    this.cursorSecret = randomBytes(32);
    /** @type {Map<string, Array<object>>} contextId -> Array<SnapshotEntry> */
    this.contextSnapshots = new Map();
    this.totalEstimatedBytes = 0;
  }

  estimateSnapshotBytes(data) {
    let bytes = 512;
    if (Array.isArray(data.rows)) bytes += data.rows.length * 256;
    if (data.raw_records) {
      const count = data.raw_records instanceof Map ? data.raw_records.size : Object.keys(data.raw_records).length;
      bytes += count * 384;
    }
    return bytes;
  }

  evictExpired(now = Date.now()) {
    for (const [contextId, list] of this.contextSnapshots.entries()) {
      const valid = list.filter((item) => {
        const isLive = (now - item.lastAccessedAt) <= this.idleTtlMs;
        if (!isLive) this.totalEstimatedBytes -= item.estimatedBytes;
        return isLive;
      });
      if (valid.length === 0) this.contextSnapshots.delete(contextId);
      else this.contextSnapshots.set(contextId, valid);
    }
  }

  evictLruUntilUnderCap(targetBytes) {
    while (this.totalEstimatedBytes > targetBytes) {
      let oldest = null;
      let oldestContextId = null;
      for (const [contextId, list] of this.contextSnapshots.entries()) {
        for (const item of list) {
          if (!item.pinned && (!oldest || item.lastAccessedAt < oldest.lastAccessedAt)) {
            oldest = item;
            oldestContextId = contextId;
          }
        }
      }
      if (!oldest || !oldestContextId) break;
      const list = this.contextSnapshots.get(oldestContextId);
      const nextList = list.filter((i) => i !== oldest);
      this.totalEstimatedBytes -= oldest.estimatedBytes;
      if (nextList.length === 0) this.contextSnapshots.delete(oldestContextId);
      else this.contextSnapshots.set(oldestContextId, nextList);
    }
  }

  commitSnapshot(contextId, data) {
    const now = Date.now();
    this.evictExpired(now);
    const estimatedBytes = this.estimateSnapshotBytes(data);
    if (estimatedBytes > this.maxAggregateBytes) {
      throw overloaded(`Snapshot size (${estimatedBytes}B) exceeds store capacity (${this.maxAggregateBytes}B)`);
    }
    this.evictLruUntilUnderCap(this.maxAggregateBytes - estimatedBytes);
    let list = this.contextSnapshots.get(contextId);
    if (!list) {
      list = [];
      this.contextSnapshots.set(contextId, list);
    }
    const entry = {
      snapshotId: data.snapshot_id,
      contextId,
      historyIdentity: data.history_identity,
      state: data.state,
      staleReason: data.stale_reason,
      observedAt: data.observed_at ?? now,
      lastAccessedAt: now,
      scan: data.scan,
      rows: Object.freeze([...(data.rows || [])]),
      rawRecords: data.raw_records instanceof Map ? data.raw_records : new Map(Object.entries(data.raw_records || {})),
      normalizedRecords: Object.freeze([...(data.normalized_records || [])]),
      estimatedBytes,
      pinned: Boolean(data.pinned)
    };
    list.unshift(entry);
    this.totalEstimatedBytes += estimatedBytes;
    while (list.length > this.maxSnapshotsPerContext) {
      const removed = list.pop();
      if (removed) this.totalEstimatedBytes -= removed.estimatedBytes;
    }
    return entry;
  }

  getSnapshot(contextId, snapshotId) {
    const now = Date.now();
    const list = this.contextSnapshots.get(contextId);
    if (!list) throw snapshotExpired(`No snapshots found for context: ${contextId}`);
    const item = list.find((s) => s.snapshotId === snapshotId);
    if (!item) throw snapshotExpired(`Snapshot not found or expired: ${snapshotId}`);
    if ((now - item.lastAccessedAt) > this.idleTtlMs) {
      this.evictExpired(now);
      throw snapshotExpired(`Snapshot has expired: ${snapshotId}`);
    }
    item.lastAccessedAt = now;
    return item;
  }

  getLatestSnapshot(contextId) {
    const now = Date.now();
    const list = this.contextSnapshots.get(contextId);
    if (!list || list.length === 0) return null;
    const newest = list[0];
    if ((now - newest.lastAccessedAt) > this.idleTtlMs) {
      this.evictExpired(now);
      return null;
    }
    newest.lastAccessedAt = now;
    return newest;
  }

  markStale(contextId, staleReason) {
    const latest = this.getLatestSnapshot(contextId);
    if (latest) {
      latest.state = 'stale';
      latest.staleReason = staleReason;
      return latest;
    }
    return null;
  }

  clearContext(contextId) {
    const list = this.contextSnapshots.get(contextId);
    if (list) {
      for (const item of list) this.totalEstimatedBytes -= item.estimatedBytes;
      this.contextSnapshots.delete(contextId);
    }
  }

  encodeCursor(snapshotId, query, offset) {
    return encodeCursor(this.cursorSecret, snapshotId, query, offset);
  }

  decodeCursor(snapshotId, query, cursorStr) {
    return decodeCursor(this.cursorSecret, snapshotId, query, cursorStr);
  }

  paginate(snapshot, query, cursorStr, limit = 32) {
    return paginateEntries(this.cursorSecret, snapshot, query, cursorStr, limit);
  }
}

module.exports = {
  SnapshotStore,
  DEFAULT_MAX_SNAPSHOTS_PER_CONTEXT,
  DEFAULT_MAX_AGGREGATE_BYTES,
  DEFAULT_IDLE_TTL_MS,
  MAX_PAGE_BYTES
};
