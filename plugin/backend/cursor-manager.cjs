'use strict';

/**
 * @file cursor-manager.cjs
 * Opaque, integrity-protected cursor manager and deterministic paginator
 * for EVCrate Advisor Provider (Phase E01).
 *
 * Implements HMAC-signed cursor tokens scoped to snapshot_id and canonical query,
 * fixed tie-breaking sorting (started_at desc, task_run_id asc, consultation_id asc),
 * and dynamic response byte-shortening to enforce <= 1 MiB limit.
 */

const { createHmac, createHash, timingSafeEqual } = require('node:crypto');
const { invalidInput } = require('./provider-errors.cjs');

const MAX_PAGE_BYTES = 1024 * 1024; // 1 MiB

function computeQueryHash(query) {
  const serialized = JSON.stringify(query ?? {});
  return createHash('sha256').update(serialized, 'utf8').digest('hex').slice(0, 16);
}

function encodeCursor(secret, snapshotId, query, offset) {
  const queryHash = computeQueryHash(query);
  const payload = `${snapshotId}:${queryHash}:${offset}`;
  const sig = createHmac('sha256', secret).update(payload).digest('base64url');
  return Buffer.from(JSON.stringify({ s: snapshotId, q: queryHash, o: offset, sig })).toString('base64url');
}

function decodeCursor(secret, snapshotId, query, cursorStr) {
  if (typeof cursorStr !== 'string' || cursorStr.length === 0 || cursorStr.length > 256) {
    throw invalidInput('Cursor must be a non-empty string <= 256 characters');
  }
  let parsed;
  try {
    parsed = JSON.parse(Buffer.from(cursorStr, 'base64url').toString('utf8'));
  } catch {
    throw invalidInput('Malformed cursor token');
  }
  if (!parsed || typeof parsed !== 'object' || parsed.s !== snapshotId) {
    throw invalidInput('Cursor snapshot_id mismatch');
  }
  const expectedQueryHash = computeQueryHash(query);
  if (parsed.q !== expectedQueryHash) {
    throw invalidInput('Cursor query scope mismatch');
  }
  const payload = `${parsed.s}:${parsed.q}:${parsed.o}`;
  const expectedSig = createHmac('sha256', secret).update(payload).digest('base64url');
  const sigBuf = Buffer.from(String(parsed.sig), 'utf8');
  const expBuf = Buffer.from(expectedSig, 'utf8');
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
    throw invalidInput('Cursor signature verification failed');
  }
  const offset = Number(parsed.o);
  if (!Number.isSafeInteger(offset) || offset < 0) {
    throw invalidInput('Invalid offset in cursor');
  }
  return offset;
}

function paginateEntries(secret, snapshot, query, cursorStr, limit = 32) {
  const clampedLimit = Math.max(1, Math.min(500, Number(limit) || 32));

  let filtered = snapshot.rows;
  if (query?.project_id) {
    const pid = query.project_id.toLowerCase();
    filtered = filtered.filter((r) => r.project_id.toLowerCase() === pid);
  }
  if (query?.task_run_id) {
    const tid = query.task_run_id.toLowerCase();
    filtered = filtered.filter((r) => r.task_run_id.toLowerCase() === tid);
  }
  if (query?.filters) {
    const f = query.filters;
    if (f.statuses && Array.isArray(f.statuses)) {
      filtered = filtered.filter((r) => f.statuses.includes(r.status));
    } else if (f.status) {
      filtered = filtered.filter((r) => r.status === f.status);
    }

    if (f.outcome_states && Array.isArray(f.outcome_states)) {
      filtered = filtered.filter((r) => f.outcome_states.includes(r.outcome_state));
    } else if (f.has_outcome !== undefined && f.has_outcome !== null) {
      filtered = filtered.filter((r) => (r.outcome_state !== 'missing') === f.has_outcome);
    }

    if (f.outcome_results && Array.isArray(f.outcome_results)) {
      filtered = filtered.filter((r) => r.outcome_result && f.outcome_results.includes(r.outcome_result));
    } else if (f.outcome_result) {
      filtered = filtered.filter((r) => r.outcome_result === f.outcome_result);
    }

    if (f.backends && Array.isArray(f.backends)) {
      filtered = filtered.filter((r) => r.route && f.backends.includes(r.route.backend));
    }
    if (f.models && Array.isArray(f.models)) {
      filtered = filtered.filter((r) => r.route && f.models.includes(r.route.model));
    }
    if (f.efforts && Array.isArray(f.efforts)) {
      filtered = filtered.filter((r) => r.route && f.efforts.includes(r.route.effort));
    }
    if (f.prompt_identities && Array.isArray(f.prompt_identities)) {
      filtered = filtered.filter((r) => f.prompt_identities.includes(r.prompt_identity));
    }
    if (f.build_identities && Array.isArray(f.build_identities)) {
      filtered = filtered.filter((r) => f.build_identities.includes(r.build_identity));
    }
    if (typeof f.started_at_from === 'number') {
      filtered = filtered.filter((r) => r.started_at >= f.started_at_from);
    }
    if (typeof f.started_at_to === 'number') {
      filtered = filtered.filter((r) => r.started_at <= f.started_at_to);
    }
  }

  const cmpStr = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  // Sort tie-breaker: started_at desc, project_id asc, task_run_id asc, consultation_id asc
  const sorted = [...filtered].sort((a, b) => {
    if (b.started_at !== a.started_at) return b.started_at - a.started_at;
    const pcmp = cmpStr(a.project_id, b.project_id);
    if (pcmp !== 0) return pcmp;
    const tcmp = cmpStr(a.task_run_id, b.task_run_id);
    if (tcmp !== 0) return tcmp;
    return cmpStr(a.consultation_id, b.consultation_id);
  });
  let offset = 0;
  if (cursorStr) {
    offset = decodeCursor(secret, snapshot.snapshotId, query, cursorStr);
  }

  let paged = sorted.slice(offset, offset + clampedLimit);

  // Byte shortening if encoded exceeds 1 MiB
  while (paged.length > 0 && Buffer.byteLength(JSON.stringify(paged), 'utf8') > MAX_PAGE_BYTES) {
    paged = paged.slice(0, paged.length - 1);
  }

  const nextOffset = offset + paged.length;
  const nextCursor = nextOffset < sorted.length
    ? encodeCursor(secret, snapshot.snapshotId, query, nextOffset)
    : null;

  const returnedBytes = Buffer.byteLength(JSON.stringify(paged), 'utf8');

  return {
    state: snapshot.state,
    snapshot_id: snapshot.snapshotId,
    entries: Object.freeze(paged),
    next_cursor: nextCursor,
    returned_bytes: returnedBytes
  };
}

module.exports = {
  computeQueryHash,
  encodeCursor,
  decodeCursor,
  paginateEntries,
  MAX_PAGE_BYTES
};
