'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createRoutingError } = require('./errors.cjs');
const { inspect, directory, absolute, writeExclusive, same, NOFOLLOW } = require('./state-io.cjs');
const {
  validateHistoryExecutionV1,
  validateHistoryOutcomeV1,
  sanitizeObjectForDisplay,
  scanRedactions,
  MAX_EXECUTION_HISTORY_BYTES,
  MAX_OUTCOME_HISTORY_BYTES
} = require('./history-contract.cjs');

function fail(code = 'REQUEST_INVALID') {
  throw createRoutingError(code);
}

function parseJson(bytes, code = 'REQUEST_INVALID') {
  try {
    return JSON.parse(bytes.toString('utf8'));
  } catch {
    fail(code);
  }
}

/**
 * List history records with pagination and filters. Metadata only.
 * Defaults strictly to current project (ctx.projectId).
 */
function listHistory(dependencies, filter = {}, { historyContextFn, scanRecordsFn, readFileFn }) {
  const ctx = historyContextFn(dependencies);
  if (filter.project_id && filter.project_id.toLowerCase() !== ctx.projectId) {
    fail('REQUEST_INVALID');
  }
  const targetProject = ctx.projectId;
  const records = scanRecordsFn(ctx, targetProject);
  const limit = filter.limit ?? 32;
  const entries = [];

  for (const record of records) {
    if (record.projectId !== targetProject) continue;
    if (filter.task_run_id && record.taskRunId !== filter.task_run_id.toLowerCase()) continue;

    let execData;
    try {
      const file = readFileFn(record.execPath, MAX_EXECUTION_HISTORY_BYTES);
      if (!file) continue;
      execData = validateHistoryExecutionV1(parseJson(file.bytes));
    } catch {
      continue; // Skip malformed entry
    }

    if (filter.status && execData.status !== filter.status) continue;

    let hasOutcome = false;
    let outcomeResult = null;
    if (record.outPath) {
      try {
        const oFile = readFileFn(record.outPath, MAX_OUTCOME_HISTORY_BYTES);
        if (oFile) {
          const oData = validateHistoryOutcomeV1(parseJson(oFile.bytes));
          hasOutcome = true;
          outcomeResult = oData.outcome;
        }
      } catch {}
    }

    entries.push({
      project_id: record.projectId,
      task_run_id: record.taskRunId,
      consultation_id: record.consultationId,
      status: execData.status,
      route: execData.route,
      checkpoint_digest: execData.checkpoint_digest,
      started_at: execData.started_at,
      completed_at: execData.completed_at,
      has_outcome: hasOutcome,
      outcome_result: outcomeResult
    });
  }

  entries.sort((a, b) => {
    if (b.started_at !== a.started_at) return b.started_at - a.started_at;
    return a.consultation_id.localeCompare(b.consultation_id);
  });

  let startIndex = 0;
  if (filter.cursor) {
    const idx = entries.findIndex((e) => e.consultation_id === filter.cursor);
    if (idx >= 0) startIndex = idx + 1;
  }

  const paged = entries.slice(startIndex, startIndex + limit);
  const nextCursor = (startIndex + limit < entries.length) ? paged[paged.length - 1].consultation_id : null;

  return {
    protocol: 'evcrate-advisor-history',
    version: 1,
    operation: 'list',
    status: 'HISTORY_READY',
    scope: targetProject,
    entries: paged,
    next_cursor: nextCursor
  };
}

/**
 * Get one consultation record (execution and optional outcome). Text is sanitized.
 */
function getHistoryEntry(dependencies, { projectId, taskRunId, consultationId }, { historyContextFn, openConsultationDirFn, readFileFn }) {
  const ctx = historyContextFn(dependencies);
  if (projectId && projectId.toLowerCase() !== ctx.projectId) {
    fail('REQUEST_INVALID');
  }
  const effProjectId = ctx.projectId;

  const cDir = openConsultationDirFn(ctx, {
    projectId: effProjectId,
    taskRunId,
    consultationId
  }, false);

  if (!cDir) fail('REQUEST_INVALID');
  try {
    const execFile = `${cDir.base}/execution.json`;
    const execRecord = readFileFn(execFile, MAX_EXECUTION_HISTORY_BYTES);
    if (!execRecord) fail('REQUEST_INVALID');

    const execution = validateHistoryExecutionV1(parseJson(execRecord.bytes));
    if (execution.project_id !== effProjectId
      || execution.task_run_id !== taskRunId.toLowerCase()
      || execution.consultation_id !== consultationId.toLowerCase()) {
      fail('REQUEST_INVALID');
    }

    let outcome = null;
    const outFile = `${cDir.base}/outcome.json`;
    const outRecord = readFileFn(outFile, MAX_OUTCOME_HISTORY_BYTES);
    if (outRecord) {
      outcome = validateHistoryOutcomeV1(parseJson(outRecord.bytes));
      if (outcome.project_id !== effProjectId
        || outcome.task_run_id !== taskRunId.toLowerCase()
        || outcome.consultation_id !== consultationId.toLowerCase()) {
        outcome = null;
      }
    }

    return {
      protocol: 'evcrate-advisor-history',
      version: 1,
      operation: 'show',
      status: 'HISTORY_READY',
      execution: sanitizeObjectForDisplay(execution),
      outcome: outcome ? sanitizeObjectForDisplay(outcome) : null
    };
  } finally {
    cDir.close();
  }
}

/**
 * Export matching history entries to a non-existing safe file or preview redaction.
 * Defaults strictly to current project and gathers all matching records without truncation.
 */
function exportHistory(dependencies, options, fns) {
  const { destination, project_id: filterProj, task_run_id: filterTask, consultation_id: filterCons, dry_run: isDryRun = false } = options;
  const ctx = fns.historyContextFn(dependencies);
  if (filterProj && filterProj.toLowerCase() !== ctx.projectId) {
    fail('REQUEST_INVALID');
  }
  const targetProject = ctx.projectId;

  const destAbs = absolute(destination);
  if (inspect(destAbs) !== null) fail('REQUEST_INVALID');

  const destParent = path.dirname(destAbs);
  const destBase = path.basename(destAbs);
  const pStat = inspect(destParent);
  directory(pStat, false);

  // Pin parent directory to prevent TOCTOU ancestor swaps
  let parentFd;
  try {
    parentFd = fs.openSync(destParent, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | NOFOLLOW);
    if (!same(fs.fstatSync(parentFd, { bigint: true }), pStat)) fail('REQUEST_INVALID');
  } catch {
    if (parentFd !== undefined) fs.closeSync(parentFd);
    fail('REQUEST_INVALID');
  }

  try {
    // Gather ALL matching records by scanning project directly without 100 limit truncation
    const records = fns.scanRecordsFn(ctx, targetProject);
    const matching = [];
    const skipped = [];

    for (const record of records) {
      if (record.projectId !== targetProject) continue;
      if (filterTask && record.taskRunId !== filterTask.toLowerCase()) continue;
      if (filterCons && record.consultationId !== filterCons.toLowerCase()) continue;

      try {
        const entry = getHistoryEntry(dependencies, {
          projectId: record.projectId,
          taskRunId: record.taskRunId,
          consultationId: record.consultationId
        }, fns);
        matching.push({
          execution: entry.execution,
          outcome: entry.outcome
        });
      } catch (err) {
        skipped.push({
          consultation_id: record.consultationId,
          task_run_id: record.taskRunId,
          reason: err.code || 'READ_FAILED'
        });
      }
    }

    const jsonText = JSON.stringify(matching, null, 2);
    const totalBytes = Buffer.byteLength(jsonText, 'utf8');
    const redactionFindings = scanRedactions(jsonText);

    if (isDryRun) {
      return {
        protocol: 'evcrate-advisor-history',
        version: 1,
        operation: 'export',
        status: 'HISTORY_READY',
        dry_run: true,
        scope: targetProject,
        exported_count: matching.length,
        skipped_count: skipped.length,
        skipped,
        byte_count: totalBytes,
        destination: destAbs,
        redactions: redactionFindings
      };
    }

    // Write descriptor-relatively to pinned parent
    const targetDescriptorPath = `/proc/self/fd/${parentFd}/${destBase}`;
    writeExclusive(targetDescriptorPath, Buffer.from(jsonText, 'utf8'));
    fs.fsyncSync(parentFd);

    return {
      protocol: 'evcrate-advisor-history',
      version: 1,
      operation: 'export',
      status: 'HISTORY_READY',
      dry_run: false,
      scope: targetProject,
      exported_count: matching.length,
      skipped_count: skipped.length,
      skipped,
      byte_count: totalBytes,
      destination: destAbs,
      redactions: redactionFindings
    };
  } finally {
    fs.closeSync(parentFd);
  }
}

module.exports = {
  listHistory,
  getHistoryEntry,
  exportHistory
};
