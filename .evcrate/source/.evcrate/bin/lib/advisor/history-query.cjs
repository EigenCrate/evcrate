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
const { normalizeHistoryRecord, calculateHistoryMetrics } = require('./generated/advisor-metrics.js');

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

/**
 * Collect validated current-project history into the shared metrics kernel.
 * Unlocked and non-atomic read collector with diagnostics.
 */
function getHistoryMetrics(dependencies, request = {}, fns) {
  const ctx = fns.historyContextFn(dependencies);
  if (request.project_id && request.project_id.toLowerCase() !== ctx.projectId) {
    fail('REQUEST_INVALID');
  }
  const targetProject = ctx.projectId;
  const targetTask = request.task_run_id ? request.task_run_id.toLowerCase() : null;
  const records = fns.scanRecordsFn(ctx, targetProject);
  const scopedRecords = [];

  for (const r of records) {
    if (r.projectId !== targetProject) continue;
    if (targetTask && r.taskRunId !== targetTask) continue;
    scopedRecords.push(r);
  }

  const normalizedRecords = [];
  const diags = [];
  let invalidRecordsCount = 0;
  let bytesRead = 0;
  let bytesDiscovered = 0;

  for (const record of scopedRecords) {
    bytesDiscovered += record.totalDiskBytes;
    const relPath = `${record.projectId}/${record.taskRunId}/${record.consultationId}`;

    if (record.execSize > MAX_EXECUTION_HISTORY_BYTES) {
      diags.push({
        code: 'EXECUTION_OVERSIZED',
        relative_path: `${relPath}/execution.json`,
        project_id: record.projectId,
        task_run_id: record.taskRunId,
        consultation_id: record.consultationId,
        bytes: record.execSize,
        observed_schema_version: null
      });
      invalidRecordsCount++;
      continue;
    }

    let execFile = null;
    try {
      execFile = fns.readFileFn(record.execPath, MAX_EXECUTION_HISTORY_BYTES);
    } catch {}

    if (!execFile) {
      diags.push({
        code: 'EXECUTION_MISSING',
        relative_path: `${relPath}/execution.json`,
        project_id: record.projectId,
        task_run_id: record.taskRunId,
        consultation_id: record.consultationId,
        bytes: null,
        observed_schema_version: null
      });
      invalidRecordsCount++;
      continue;
    }

    bytesRead += execFile.bytes.length;

    let rawExec;
    try {
      rawExec = JSON.parse(execFile.bytes.toString('utf8'));
    } catch {
      diags.push({
        code: 'EXECUTION_INVALID_JSON',
        relative_path: `${relPath}/execution.json`,
        project_id: record.projectId,
        task_run_id: record.taskRunId,
        consultation_id: record.consultationId,
        bytes: execFile.bytes.length,
        observed_schema_version: null
      });
      invalidRecordsCount++;
      continue;
    }

    if (!rawExec || typeof rawExec !== 'object' || Array.isArray(rawExec)) {
      diags.push({
        code: 'EXECUTION_INVALID',
        relative_path: `${relPath}/execution.json`,
        project_id: record.projectId,
        task_run_id: record.taskRunId,
        consultation_id: record.consultationId,
        bytes: execFile.bytes.length,
        observed_schema_version: null
      });
      invalidRecordsCount++;
      continue;
    }

    const observedExecVersion = rawExec.schema_version;
    if (observedExecVersion !== 1) {
      diags.push({
        code: 'EXECUTION_UNSUPPORTED_VERSION',
        relative_path: `${relPath}/execution.json`,
        project_id: record.projectId,
        task_run_id: record.taskRunId,
        consultation_id: record.consultationId,
        bytes: execFile.bytes.length,
        observed_schema_version: typeof observedExecVersion === 'number' ? observedExecVersion : null
      });
      invalidRecordsCount++;
      continue;
    }

    if (
      (rawExec.project_id && rawExec.project_id.toLowerCase() !== record.projectId) ||
      (rawExec.task_run_id && rawExec.task_run_id.toLowerCase() !== record.taskRunId) ||
      (rawExec.consultation_id && rawExec.consultation_id.toLowerCase() !== record.consultationId)
    ) {
      diags.push({
        code: 'EXECUTION_IDENTITY_MISMATCH',
        relative_path: `${relPath}/execution.json`,
        project_id: record.projectId,
        task_run_id: record.taskRunId,
        consultation_id: record.consultationId,
        bytes: execFile.bytes.length,
        observed_schema_version: 1
      });
      invalidRecordsCount++;
      continue;
    }

    let validExec;
    try {
      validExec = validateHistoryExecutionV1(rawExec);
    } catch {
      diags.push({
        code: 'EXECUTION_INVALID',
        relative_path: `${relPath}/execution.json`,
        project_id: record.projectId,
        task_run_id: record.taskRunId,
        consultation_id: record.consultationId,
        bytes: execFile.bytes.length,
        observed_schema_version: 1
      });
      invalidRecordsCount++;
      continue;
    }

    let rawOutcome = null;
    if (record.outPath) {
      if (record.outSize > MAX_OUTCOME_HISTORY_BYTES) {
        diags.push({
          code: 'OUTCOME_OVERSIZED',
          relative_path: `${relPath}/outcome.json`,
          project_id: record.projectId,
          task_run_id: record.taskRunId,
          consultation_id: record.consultationId,
          bytes: record.outSize,
          observed_schema_version: null
        });
        rawOutcome = { invalid: true };
      } else {
        let outFile = null;
        try {
          outFile = fns.readFileFn(record.outPath, MAX_OUTCOME_HISTORY_BYTES);
        } catch {}
        if (outFile) {
          bytesRead += outFile.bytes.length;
          let parsedOut;
          let parseSuccess = false;
          try {
            parsedOut = JSON.parse(outFile.bytes.toString('utf8'));
            parseSuccess = true;
          } catch {
            diags.push({
              code: 'OUTCOME_INVALID_JSON',
              relative_path: `${relPath}/outcome.json`,
              project_id: record.projectId,
              task_run_id: record.taskRunId,
              consultation_id: record.consultationId,
              bytes: outFile.bytes.length,
              observed_schema_version: null
            });
            rawOutcome = { invalid: true };
          }
          if (parseSuccess) {
            if (!parsedOut || typeof parsedOut !== 'object' || Array.isArray(parsedOut)) {
              diags.push({
                code: 'OUTCOME_INVALID',
                relative_path: `${relPath}/outcome.json`,
                project_id: record.projectId,
                task_run_id: record.taskRunId,
                consultation_id: record.consultationId,
                bytes: outFile.bytes.length,
                observed_schema_version: null
              });
              rawOutcome = { invalid: true };
            } else if (parsedOut.schema_version !== 1) {
              diags.push({
                code: 'OUTCOME_UNSUPPORTED_VERSION',
                relative_path: `${relPath}/outcome.json`,
                project_id: record.projectId,
                task_run_id: record.taskRunId,
                consultation_id: record.consultationId,
                bytes: outFile.bytes.length,
                observed_schema_version: typeof parsedOut.schema_version === 'number' ? parsedOut.schema_version : null
              });
              rawOutcome = { invalid: true };
            } else if (
              (parsedOut.project_id && parsedOut.project_id.toLowerCase() !== record.projectId) ||
              (parsedOut.task_run_id && parsedOut.task_run_id.toLowerCase() !== record.taskRunId) ||
              (parsedOut.consultation_id && parsedOut.consultation_id.toLowerCase() !== record.consultationId)
            ) {
              diags.push({
                code: 'OUTCOME_IDENTITY_MISMATCH',
                relative_path: `${relPath}/outcome.json`,
                project_id: record.projectId,
                task_run_id: record.taskRunId,
                consultation_id: record.consultationId,
                bytes: outFile.bytes.length,
                observed_schema_version: 1
              });
              rawOutcome = { invalid: true };
            } else {
              try {
                validateHistoryOutcomeV1(parsedOut);
                rawOutcome = parsedOut;
              } catch {
                diags.push({
                  code: 'OUTCOME_INVALID',
                  relative_path: `${relPath}/outcome.json`,
                  project_id: record.projectId,
                  task_run_id: record.taskRunId,
                  consultation_id: record.consultationId,
                  bytes: outFile.bytes.length,
                  observed_schema_version: 1
                });
                rawOutcome = { invalid: true };
              }
            }
          }
        }
      }
    }

    const normRecord = normalizeHistoryRecord(validExec, rawOutcome, {
      kind: 'controller',
      relative_path: relPath
    });
    normalizedRecords.push(normRecord);
  }

  const genAt = (dependencies && typeof dependencies.now === 'function')
    ? dependencies.now()
    : (dependencies && typeof dependencies.now === 'number' ? dependencies.now : Date.now());

  const metricsResult = calculateHistoryMetrics({
    scope: {
      kind: 'project',
      project_ids: [targetProject],
      selected_project_id: targetProject
    },
    filters: request.filters,
    completeness: { is_complete: true, omitted_records: 0, omitted_bytes: 0 },
    scan: {
      status: diags.length > 0 ? 'complete_with_errors' : 'complete',
      projects_discovered: 1,
      tasks_discovered: new Set(scopedRecords.map((r) => r.taskRunId)).size,
      consultations_discovered: scopedRecords.length,
      accepted_records: normalizedRecords.length,
      invalid_records: invalidRecordsCount,
      bytes_discovered: bytesDiscovered,
      bytes_read: bytesRead,
      diagnostics: diags,
      suppressed_diagnostics: 0,
      limit_hit: false
    },
    records: normalizedRecords,
    generated_at: genAt
  });

  return {
    protocol: 'evcrate-advisor-history',
    version: 1,
    operation: 'metrics',
    status: 'HISTORY_READY',
    ...metricsResult
  };
}

module.exports = {
  listHistory,
  getHistoryEntry,
  exportHistory,
  getHistoryMetrics
};
