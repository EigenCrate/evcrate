'use strict';

/**
 * @file history-detail.cjs
 * Fingerprinted detail rereader for EVCrate Advisor Provider (Phase E01).
 *
 * Enforces descriptor-safe reread, inode/fingerprint identity matching,
 * outcome presence transition tracking, and sanitized execution/outcome display.
 */

const { createHash } = require('node:crypto');
const { inspectStat } = require('./binding.cjs');
const { readBoundedFile } = require('./history-scanner.cjs');
const { invalidInput } = require('./provider-errors.cjs');
const {
  validateHistoryExecutionV1,
  validateHistoryOutcomeV1,
  sanitizeObjectForDisplay,
  MAX_EXECUTION_HISTORY_BYTES,
  MAX_OUTCOME_HISTORY_BYTES
} = require('../../.evcrate/source/.evcrate/bin/lib/advisor/history-contract.cjs');

function getHistoryDetail(snapshot, recordRef) {
  if (!recordRef || typeof recordRef !== 'string') {
    throw invalidInput('record_ref must be a non-empty string');
  }

  const captured = snapshot.rawRecords.get(recordRef);
  if (!captured) {
    throw invalidInput(`Record ref not found in snapshot: ${recordRef}`);
  }

  const snapshotId = snapshot.snapshotId;

  // 1. Reread execution.json
  const execRead = readBoundedFile(captured.execPath, MAX_EXECUTION_HISTORY_BYTES);
  if (!execRead) {
    const stat = inspectStat(captured.execPath);
    if (!stat) {
      return Object.freeze({
        status: 'missing',
        snapshot_id: snapshotId,
        record_ref: recordRef,
        observed_revision: null
      });
    }
    return Object.freeze({
      status: 'changed',
      snapshot_id: snapshotId,
      record_ref: recordRef,
      observed_revision: 'unreadable'
    });
  }

  if (
    String(execRead.stat.dev) !== captured.execDev ||
    String(execRead.stat.ino) !== captured.execIno ||
    execRead.size !== captured.execSize ||
    execRead.hash !== captured.execFingerprint
  ) {
    return Object.freeze({
      status: 'changed',
      snapshot_id: snapshotId,
      record_ref: recordRef,
      observed_revision: execRead.hash
    });
  }

  // 2. Reread outcome.json
  const outRead = readBoundedFile(captured.outPath, MAX_OUTCOME_HISTORY_BYTES);
  if (captured.hasOutcome) {
    if (!outRead) {
      return Object.freeze({
        status: 'changed',
        snapshot_id: snapshotId,
        record_ref: recordRef,
        observed_revision: 'outcome_missing'
      });
    }
    if (
      String(outRead.stat.dev) !== captured.outDev ||
      String(outRead.stat.ino) !== captured.outIno ||
      outRead.size !== captured.outSize ||
      outRead.hash !== captured.outFingerprint
    ) {
      return Object.freeze({
        status: 'changed',
        snapshot_id: snapshotId,
        record_ref: recordRef,
        observed_revision: outRead.hash
      });
    }
  } else {
    // In snapshot, outcome was missing. If now present (even unreadable) -> changed!
    const outStat = inspectStat(captured.outPath);
    if (outStat || outRead) {
      return Object.freeze({
        status: 'changed',
        snapshot_id: snapshotId,
        record_ref: recordRef,
        observed_revision: outRead ? outRead.hash : 'unreadable'
      });
    }
  }

  // 3. Perfect match: parse, validate, and sanitize
  let execData;
  try {
    execData = validateHistoryExecutionV1(JSON.parse(execRead.bytes.toString('utf8')));
  } catch {
    return Object.freeze({
      status: 'changed',
      snapshot_id: snapshotId,
      record_ref: recordRef,
      observed_revision: 'invalid_json'
    });
  }

  let outData = null;
  if (outRead) {
    try {
      outData = validateHistoryOutcomeV1(JSON.parse(outRead.bytes.toString('utf8')));
    } catch {
      return Object.freeze({
        status: 'changed',
        snapshot_id: snapshotId,
        record_ref: recordRef,
        observed_revision: 'invalid_outcome_json'
      });
    }
  }

  const detailRevision = createHash('sha256').update(`${captured.execFingerprint}:${captured.outFingerprint || 'no-outcome'}`).digest('hex');

  return Object.freeze({
    status: 'ready',
    snapshot_id: snapshotId,
    record_ref: recordRef,
    detail_revision: detailRevision,
    execution: sanitizeObjectForDisplay(execData),
    outcome: outData ? sanitizeObjectForDisplay(outData) : null
  });
}

module.exports = {
  getHistoryDetail
};
