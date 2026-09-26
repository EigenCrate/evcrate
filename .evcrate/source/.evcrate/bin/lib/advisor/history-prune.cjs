'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createRoutingError } = require('./errors.cjs');
const { inspect, removeOwned, owner, same } = require('./state-io.cjs');
const {
  validateHistoryExecutionV1,
  MAX_EXECUTION_HISTORY_BYTES
} = require('./history-contract.cjs');

const DEFAULT_RETENTION_DAYS = 30;
const DEFAULT_MAX_BYTES = 104857600; // 100 MiB

function fail(code = 'AUDIT_DEGRADED') {
  throw createRoutingError(code);
}

function parseJson(bytes, code = 'AUDIT_DEGRADED') {
  try {
    return JSON.parse(bytes.toString('utf8'));
  } catch {
    fail(code);
  }
}

/**
 * Prune oldest terminal records until bytesToFree is satisfied.
 * Protects any record with status === 'started'.
 * Operates descriptor-relatively for each consultation directory.
 */
function pruneOldestTerminalRecords(ctx, records, bytesToFree, retentionCutoffMs, readFileFn, openConsultationDirFn) {
  const eligible = [];

  for (const record of records) {
    let execData;
    try {
      const file = readFileFn(record.execPath, MAX_EXECUTION_HISTORY_BYTES);
      if (!file) continue;
      execData = validateHistoryExecutionV1(parseJson(file.bytes));
    } catch {
      continue;
    }
    if (execData.status === 'started') continue; // PROTECT ACTIVE

    const recordTime = execData.completed_at ?? execData.started_at;
    const isExpired = recordTime < retentionCutoffMs;
    eligible.push({
      ...record,
      recordTime,
      isExpired,
      totalSize: record.totalDiskBytes || (record.execSize + record.outSize)
    });
  }

  eligible.sort((a, b) => a.recordTime - b.recordTime);

  let freed = 0;
  for (const item of eligible) {
    if (freed >= bytesToFree && !item.isExpired) break;
    if (!openConsultationDirFn) fail('AUDIT_DEGRADED');
    const cDir = openConsultationDirFn(ctx, {
      projectId: item.projectId,
      taskRunId: item.taskRunId,
      consultationId: item.consultationId
    }, false);
    if (cDir) {
      let itemFreed = 0;
      try {
        const outFile = `${cDir.base}/outcome.json`;
        const outStat = inspect(outFile);
        if (outStat) {
          removeOwned(outFile, outStat);
          itemFreed += Number(outStat.size);
        }

        const execFile = `${cDir.base}/execution.json`;
        const execStat = inspect(execFile);
        if (execStat) {
          removeOwned(execFile, execStat);
          itemFreed += Number(execStat.size);
        }

        if (cDir.fd !== undefined) fs.fsyncSync(cDir.fd);
        freed += itemFreed;
        if (cDir.taskBase) {
          try {
            if (cDir.fd !== undefined) fs.closeSync(cDir.fd);
            const consultDir = path.join(cDir.taskBase, item.consultationId);
            try { fs.rmdirSync(consultDir); } catch {}
            if (cDir.taskFd !== undefined) fs.fsyncSync(cDir.taskFd);
            if (fs.readdirSync(cDir.taskBase).length === 0) {
              if (cDir.taskFd !== undefined) fs.closeSync(cDir.taskFd);
              const taskDir = path.join(cDir.projectBase, item.taskRunId);
              try { fs.rmdirSync(taskDir); } catch {}
              if (cDir.projectFd !== undefined) fs.fsyncSync(cDir.projectFd);
            }
          } catch {}
        }
      } catch {}
      finally {
        try { cDir.close(); } catch {}
      }
    }
  }
  return freed;
}

/**
 * Enforce history quota before writing additional bytes.
 * Scoped strictly to target project.
 */
function ensureHistoryQuota(ctx, additionalBytes, policy, scanRecordsFn, readFileFn, openConsultationDirFn) {
  const maxBytes = policy.history?.max_bytes ?? DEFAULT_MAX_BYTES;
  const retentionDays = policy.history?.retention_days ?? DEFAULT_RETENTION_DAYS;
  const retentionCutoffMs = Date.now() - (retentionDays * 86400 * 1000);

  let records = scanRecordsFn(ctx, ctx.projectId);
  const currentTotal = records.reduce((sum, r) => sum + (r.totalDiskBytes || (r.execSize + r.outSize)), 0);

  if (currentTotal + additionalBytes > maxBytes) {
    const bytesToFree = (currentTotal + additionalBytes) - maxBytes;
    pruneOldestTerminalRecords(ctx, records, bytesToFree, retentionCutoffMs, readFileFn, openConsultationDirFn);
    records = scanRecordsFn(ctx, ctx.projectId);
    const afterTotal = records.reduce((sum, r) => sum + (r.totalDiskBytes || (r.execSize + r.outSize)), 0);
    if (afterTotal + additionalBytes > maxBytes) {
      fail('AUDIT_DEGRADED');
    }
  }
}

/**
 * Prune history command execution (preview or apply).
 * Scoped strictly to current project (ctx.projectId).
 */
function pruneHistory(dependencies, policy, options, { historyContextFn, openHistoryRootFn, openConsultationDirFn, scanRecordsFn, readFileFn }) {
  const ctx = historyContextFn(dependencies);
  const targetProject = ctx.projectId.toLowerCase();
  const dryRun = options.dry_run !== false;
  const retentionDays = options.retention_days ?? policy.history?.retention_days ?? DEFAULT_RETENTION_DAYS;
  const maxBytes = options.max_bytes ?? policy.history?.max_bytes ?? DEFAULT_MAX_BYTES;
  const retentionCutoffMs = Date.now() - (retentionDays * 86400 * 1000);

  const records = scanRecordsFn(ctx, targetProject);
  const initialTotalBytes = records.reduce((sum, r) => sum + (r.totalDiskBytes || (r.execSize + r.outSize)), 0);

  const terminalRecords = [];
  let activeCount = 0;

  for (const record of records) {
    let execData;
    try {
      const file = readFileFn(record.execPath, MAX_EXECUTION_HISTORY_BYTES);
      if (!file) continue;
      execData = validateHistoryExecutionV1(parseJson(file.bytes));
    } catch {
      continue;
    }

    if (execData.status === 'started') {
      activeCount++;
      continue; // Protected
    }

    const recordTime = execData.completed_at ?? execData.started_at;
    const isExpired = recordTime < retentionCutoffMs;
    terminalRecords.push({
      ...record,
      recordTime,
      isExpired,
      totalSize: record.totalDiskBytes || (record.execSize + record.outSize)
    });
  }

  terminalRecords.sort((a, b) => a.recordTime - b.recordTime);

  const eligibleToPrune = new Set();
  let projectedBytes = initialTotalBytes;

  // 1. Expired records
  for (const item of terminalRecords) {
    if (item.isExpired) {
      eligibleToPrune.add(item);
      projectedBytes -= item.totalSize;
    }
  }

  // 2. Over quota records (oldest remaining first)
  if (projectedBytes > maxBytes) {
    for (const item of terminalRecords) {
      if (!eligibleToPrune.has(item)) {
        eligibleToPrune.add(item);
        projectedBytes -= item.totalSize;
        if (projectedBytes <= maxBytes) break;
      }
    }
  }

  let freedBytes = 0;
  let prunedCount = 0;

  if (!dryRun) {
    for (const item of eligibleToPrune) {
      const cDir = openConsultationDirFn(ctx, {
        projectId: item.projectId,
        taskRunId: item.taskRunId,
        consultationId: item.consultationId
      }, false);

      if (cDir) {
        let itemFreed = 0;
        try {
          const outFile = `${cDir.base}/outcome.json`;
          const outStat = inspect(outFile);
          if (outStat) {
            removeOwned(outFile, outStat);
            itemFreed += Number(outStat.size);
          }

          const execFile = `${cDir.base}/execution.json`;
          const execStat = inspect(execFile);
          if (execStat) {
            removeOwned(execFile, execStat);
            itemFreed += Number(execStat.size);
          }
          if (cDir.fd !== undefined) fs.fsyncSync(cDir.fd);
          freedBytes += itemFreed;
          prunedCount++;

          if (cDir.taskBase) {
            try {
              if (cDir.fd !== undefined) fs.closeSync(cDir.fd);
              const consultDir = path.join(cDir.taskBase, item.consultationId);
              try { fs.rmdirSync(consultDir); } catch {}
              if (cDir.taskFd !== undefined) fs.fsyncSync(cDir.taskFd);
              if (fs.readdirSync(cDir.taskBase).length === 0) {
                if (cDir.taskFd !== undefined) fs.closeSync(cDir.taskFd);
                const taskDir = path.join(cDir.projectBase, item.taskRunId);
                try { fs.rmdirSync(taskDir); } catch {}
                if (cDir.projectFd !== undefined) fs.fsyncSync(cDir.projectFd);
              }
            } catch {}
          }
        } catch {}
        finally {
          try { cDir.close(); } catch {}
        }
      }
    }
  } else {
    for (const item of eligibleToPrune) {
      freedBytes += item.totalSize;
    }
  }

  return {
    protocol: 'evcrate-advisor-history',
    version: 1,
    operation: 'prune',
    status: 'HISTORY_READY',
    dry_run: dryRun,
    scope: targetProject,
    eligible_count: eligibleToPrune.size,
    pruned_count: dryRun ? 0 : prunedCount,
    freed_bytes: freedBytes,
    retained_count: records.length - (dryRun ? 0 : prunedCount),
    active_count: activeCount,
    total_bytes_before: initialTotalBytes,
    total_bytes_after: dryRun ? initialTotalBytes : (initialTotalBytes - freedBytes)
  };
}

module.exports = {
  pruneOldestTerminalRecords,
  ensureHistoryQuota,
  pruneHistory,
  DEFAULT_RETENTION_DAYS,
  DEFAULT_MAX_BYTES
};
