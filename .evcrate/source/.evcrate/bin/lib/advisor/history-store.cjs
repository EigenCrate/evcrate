'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { randomBytes, createHash } = require('node:crypto');
const { createRoutingError } = require('./errors.cjs');
const {
  inspect, same, unchanged, owner, directory, regular, absolute, chain, stable,
  readFile, writeExclusive, removeOwned, NOFOLLOW, UUID, processIdentity, processStatus
} = require('./state-io.cjs');
const {
  validateHistoryExecutionV1,
  validateHistoryOutcomeV1,
  MAX_EXECUTION_HISTORY_BYTES,
  MAX_OUTCOME_HISTORY_BYTES
} = require('./history-contract.cjs');
const {
  ensureHistoryQuota,
  pruneHistory: pruneHistoryImpl
} = require('./history-prune.cjs');
const {
  listHistory: listHistoryImpl,
  getHistoryEntry: getHistoryEntryImpl,
  exportHistory: exportHistoryImpl,
  getHistoryMetrics: getHistoryMetricsImpl
} = require('./history-query.cjs');

const SHA256 = /^[0-9a-f]{64}$/u;
const MAX_TASKS_PER_PROJECT = 256;
const MAX_CONSULTATIONS_PER_TASK = 256;

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

function historyContext({ cwd = process.cwd(), environment = process.env } = {}) {
  if (typeof NOFOLLOW !== 'number' || process.platform !== 'linux') fail();
  const projectRoot = absolute(cwd);
  const home = absolute(environment.HOME);
  if (home === path.parse(home).root) fail();
  const entries = [...chain(projectRoot), ...chain(home)];
  const projectId = createHash('sha256').update(projectRoot).digest('hex');
  return { projectRoot, home, projectId, entries };
}

function openHistoryRoot(ctx, create = false) {
  stable(ctx.entries);
  const descriptors = [];
  const entries = [...ctx.entries];
  let logical = ctx.home;
  try {
    let fd = fs.openSync(logical, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | NOFOLLOW);
    descriptors.push(fd);
    if (!same(fs.fstatSync(fd, { bigint: true }), inspect(logical))) fail();

    for (const part of ['.evcrate', 'advisor-history']) {
      const child = `/proc/self/fd/${fd}/${part}`;
      let stat = inspect(child);
      if (!stat && create) {
        stable(entries);
        try { fs.mkdirSync(child, { mode: 0o700 }); }
        catch (error) { if (error.code !== 'EEXIST') throw error; }
        fs.fsyncSync(fd);
        stat = inspect(child);
      }
      if (!stat) {
        for (const item of descriptors.reverse()) fs.closeSync(item);
        return null;
      }
      directory(stat, true);
      const next = fs.openSync(child, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | NOFOLLOW);
      descriptors.push(next);
      if (!same(stat, fs.fstatSync(next, { bigint: true }))) fail();
      logical = path.join(logical, part);
      entries.push({ path: logical, stat, privateMode: true });
      fd = next;
    }
    stable(entries);
    return {
      fd,
      entries,
      path: logical,
      base: `/proc/self/fd/${fd}`,
      close() { for (const item of descriptors.reverse()) fs.closeSync(item); }
    };
  } catch (error) {
    for (const fd of descriptors.reverse()) fs.closeSync(fd);
    throw error;
  }
}

function acquireHistoryLock(ctx, root) {
  const file = `${root.base}/history.lock`;
  const recovery = `${root.base}/history-recovery.lock`;
  const value = { token: randomBytes(16).toString('hex'), process: processIdentity() };
  const bytes = Buffer.from(JSON.stringify(value));
  let stat;
  stable(root.entries);
  const recInitial = inspect(recovery);
  if (recInitial) {
    try {
      const recRecord = readFile(recovery, 1024);
      if (!recRecord) fail('AUDIT_DEGRADED');
      const recVal = JSON.parse(recRecord.bytes.toString('utf8'));
      if (recVal?.process && processStatus(recVal.process) === 'dead') {
        removeOwned(recovery, recRecord.stat);
        fs.fsyncSync(root.fd);
      } else {
        fail('AUDIT_DEGRADED');
      }
    } catch {
      fail('AUDIT_DEGRADED');
    }
  }
  try { stat = writeExclusive(file, bytes); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    let old;
    try {
      const record = readFile(file, 1024);
      if (!record) fail('AUDIT_DEGRADED');
      const val = JSON.parse(record.bytes.toString('utf8'));
      if (!val || !val.process || !val.token) fail('AUDIT_DEGRADED');
      old = { ...record, value: val };
    } catch { fail('AUDIT_DEGRADED'); }
    if (processStatus(old.value.process) !== 'dead') fail('AUDIT_DEGRADED');
    let guard;
    try { guard = writeExclusive(recovery, bytes); }
    catch { fail('AUDIT_DEGRADED'); }
    try {
      stable(root.entries);
      const current = readFile(file, 1024);
      if (!current || !unchanged(current.stat, old.stat)) fail('AUDIT_DEGRADED');
      removeOwned(file, current.stat);
      try { stat = writeExclusive(file, bytes); }
      catch { fail('AUDIT_DEGRADED'); }
    } finally {
      removeOwned(recovery, guard);
      fs.fsyncSync(root.fd);
    }
  }
  fs.fsyncSync(root.fd);
  return () => {
    stable(root.entries);
    const current = readFile(file, 1024);
    if (current && unchanged(current.stat, stat)) {
      removeOwned(file, stat);
      fs.fsyncSync(root.fd);
    }
  };
}

function withHistoryLock(contextOrDeps, callback) {
  const ctx = contextOrDeps.entries ? contextOrDeps : historyContext(contextOrDeps);
  const root = openHistoryRoot(ctx, true);
  if (!root) fail('AUDIT_DEGRADED');
  let release;
  try {
    release = acquireHistoryLock(ctx, root);
    return callback(root);
  } finally {
    try { if (release) release(); } catch {}
    root.close();
  }
}

function openConsultationDir(ctx, { projectId, taskRunId, consultationId }, create = false) {
  if (!SHA256.test(projectId) || !UUID.test(taskRunId) || !UUID.test(consultationId)) {
    fail('REQUEST_INVALID');
  }
  const root = openHistoryRoot(ctx, create);
  if (!root) return null;
  const descriptors = [];
  const entries = [...root.entries];
  let fd = root.fd;
  let logical = root.path;

  try {
    const parts = [projectId.toLowerCase(), taskRunId.toLowerCase(), consultationId.toLowerCase()];
    for (const part of parts) {
      const child = `/proc/self/fd/${fd}/${part}`;
      let stat = inspect(child);
      if (!stat && create) {
        stable(entries);
        try { fs.mkdirSync(child, { mode: 0o700 }); }
        catch (error) { if (error.code !== 'EEXIST') throw error; }
        fs.fsyncSync(fd);
        stat = inspect(child);
      }
      if (!stat) {
        for (const item of descriptors.reverse()) fs.closeSync(item);
        root.close();
        return null;
      }
      directory(stat, true);
      const next = fs.openSync(child, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | NOFOLLOW);
      descriptors.push(next);
      if (!same(stat, fs.fstatSync(next, { bigint: true }))) fail();
      logical = path.join(logical, part);
      entries.push({ path: logical, stat, privateMode: true });
      fd = next;
    }
    const projectFd = descriptors[0];
    const taskFd = descriptors[1];
    const consultationFd = descriptors[2];
    stable(entries);
    return {
      fd: consultationFd,
      entries,
      path: logical,
      base: `/proc/self/fd/${consultationFd}`,
      taskBase: `/proc/self/fd/${taskFd}`,
      projectBase: `/proc/self/fd/${projectFd}`,
      rootBase: root.base,
      taskFd,
      projectFd,
      rootFd: root.fd,
      close() {
        for (const item of descriptors.reverse()) {
          try { fs.closeSync(item); } catch {}
        }
        root.close();
      }
    };
  } catch (error) {
    for (const item of descriptors.reverse()) fs.closeSync(item);
    root.close();
    throw error;
  }
}

/**
 * Scans records scoped strictly to targetProjectId (defaults to ctx.projectId).
 * Enforces count bounds and accounts for actual file disk usage.
 */
function scanProjectRecords(ctx, targetProjectId) {
  const projId = (targetProjectId || ctx.projectId).toLowerCase();
  if (!SHA256.test(projId)) return [];

  const root = openHistoryRoot(ctx, false);
  if (!root) return [];
  const records = [];

  try {
    const pPath = `${root.base}/${projId}`;
    const pStat = inspect(pPath);
    if (!pStat || !pStat.isDirectory() || pStat.isSymbolicLink() || !owner(pStat)) {
      return [];
    }

    let tasks = [];
    try { tasks = fs.readdirSync(pPath); } catch { return []; }
    if (tasks.length > MAX_TASKS_PER_PROJECT) fail('AUDIT_DEGRADED');

    for (const tName of tasks) {
      if (!UUID.test(tName)) continue;
      const tPath = `${pPath}/${tName}`;
      const tStat = inspect(tPath);
      if (!tStat || !tStat.isDirectory() || tStat.isSymbolicLink() || !owner(tStat)) {
        continue;
      }

      let consultations = [];
      try { consultations = fs.readdirSync(tPath); } catch { continue; }
      if (consultations.length > MAX_CONSULTATIONS_PER_TASK) fail('AUDIT_DEGRADED');

      for (const cName of consultations) {
        if (!UUID.test(cName)) continue;
        const cPath = `${tPath}/${cName}`;
        const cStat = inspect(cPath);
        if (!cStat || !cStat.isDirectory() || cStat.isSymbolicLink() || !owner(cStat)) {
          continue;
        }

        const execUnderBase = `${cPath}/execution.json`;
        const execStat = inspect(execUnderBase);
        if (!execStat || !execStat.isFile() || execStat.isSymbolicLink() || !owner(execStat) || execStat.nlink !== 1n) {
          continue;
        }

        const outUnderBase = `${cPath}/outcome.json`;
        const outStat = inspect(outUnderBase);
        const hasValidOutcome = outStat && outStat.isFile() && !outStat.isSymbolicLink() && owner(outStat) && outStat.nlink === 1n;

        // Account for all files in directory to ensure quota captures temp/stray files
        let totalDiskBytes = Number(execStat.size) + (hasValidOutcome ? Number(outStat.size) : 0);
        try {
          const allEntries = fs.readdirSync(cPath);
          for (const ent of allEntries) {
            if (ent !== 'execution.json' && ent !== 'outcome.json') {
              const entStat = inspect(`${cPath}/${ent}`);
              if (entStat && entStat.isFile()) totalDiskBytes += Number(entStat.size);
            }
          }
        } catch {}

        const dirPath = path.join(root.path, projId, tName, cName);
        const execLogical = path.join(dirPath, 'execution.json');
        const outLogical = path.join(dirPath, 'outcome.json');

        records.push({
          projectId: projId,
          taskRunId: tName,
          consultationId: cName,
          dirPath,
          execPath: execLogical,
          execSize: Number(execStat.size),
          outPath: hasValidOutcome ? outLogical : null,
          outSize: hasValidOutcome ? Number(outStat.size) : 0,
          totalDiskBytes
        });
      }
    }
    return records;
  } finally {
    root.close();
  }
}

function calculateTotalHistoryBytes(ctx) {
  const records = scanProjectRecords(ctx);
  return records.reduce((sum, r) => sum + r.totalDiskBytes, 0);
}

function recordStartedExecution(dependencies, execution, policy = {}) {
  validateHistoryExecutionV1(execution);
  if (execution.status !== 'started') fail('AUDIT_DEGRADED');
  const ctx = historyContext(dependencies);
  if (execution.project_id !== ctx.projectId) fail('AUDIT_DEGRADED');

  const execBytes = Buffer.from(JSON.stringify(execution), 'utf8');
  if (execBytes.length > MAX_EXECUTION_HISTORY_BYTES) fail('AUDIT_DEGRADED');

  return withHistoryLock(ctx, () => {
    ensureHistoryQuota(ctx, execBytes.length, policy, scanProjectRecords, readFile, openConsultationDir);

    const cDir = openConsultationDir(ctx, {
      projectId: execution.project_id,
      taskRunId: execution.task_run_id,
      consultationId: execution.consultation_id
    }, true);

    if (!cDir) fail('AUDIT_DEGRADED');
    try {
      const execFile = `${cDir.base}/execution.json`;
      if (inspect(execFile)) fail('AUDIT_DEGRADED');
      writeExclusive(execFile, execBytes);
      fs.fsyncSync(cDir.fd);
      return { status: 'recorded' };
    } finally {
      cDir.close();
    }
  });
}

function updateStartedAttempts(dependencies, { projectId, taskRunId, consultationId }, attempts, policy = {}) {
  const ctx = historyContext(dependencies);
  if (projectId !== ctx.projectId) fail('AUDIT_DEGRADED');

  return withHistoryLock(ctx, () => {
    const cDir = openConsultationDir(ctx, { projectId, taskRunId, consultationId }, false);
    if (!cDir) fail('AUDIT_DEGRADED');
    try {
      const execFile = `${cDir.base}/execution.json`;
      const existing = readFile(execFile, MAX_EXECUTION_HISTORY_BYTES);
      if (!existing) fail('AUDIT_DEGRADED');

      const parsed = validateHistoryExecutionV1(parseJson(existing.bytes));
      if (parsed.status !== 'started') fail('AUDIT_DEGRADED');

      const updated = {
        ...parsed,
        attempts: attempts.slice(0, 16)
      };
      const updatedBytes = Buffer.from(JSON.stringify(validateHistoryExecutionV1(updated)), 'utf8');
      if (updatedBytes.length > MAX_EXECUTION_HISTORY_BYTES) fail('AUDIT_DEGRADED');

      const growth = updatedBytes.length - existing.bytes.length;
      if (growth > 0) {
        ensureHistoryQuota(ctx, growth, policy, scanProjectRecords, readFile, openConsultationDir);
      }

      const tmpFile = `${cDir.base}/.exec-att-${randomBytes(8).toString('hex')}.tmp`;
      let tmpStat;
      try {
        tmpStat = writeExclusive(tmpFile, updatedBytes);
        stable(cDir.entries);
        const now = readFile(execFile, MAX_EXECUTION_HISTORY_BYTES);
        if (!now || !unchanged(now.stat, existing.stat)) fail('AUDIT_DEGRADED');
        fs.renameSync(tmpFile, execFile);
        tmpStat = undefined;
        fs.fsyncSync(cDir.fd);
        return { status: 'recorded' };
      } finally {
        if (tmpStat) removeOwned(tmpFile, tmpStat);
      }
    } finally {
      cDir.close();
    }
  });
}

function recordTerminalExecution(dependencies, execution, policy = {}) {
  validateHistoryExecutionV1(execution);
  if (execution.status !== 'ADVICE_READY' && execution.status !== 'FAILED') {
    fail('AUDIT_DEGRADED');
  }
  const ctx = historyContext(dependencies);
  if (execution.project_id !== ctx.projectId) fail('AUDIT_DEGRADED');

  const execBytes = Buffer.from(JSON.stringify(execution), 'utf8');
  if (execBytes.length > MAX_EXECUTION_HISTORY_BYTES) fail('AUDIT_DEGRADED');

  return withHistoryLock(ctx, () => {
    const cDir = openConsultationDir(ctx, {
      projectId: execution.project_id,
      taskRunId: execution.task_run_id,
      consultationId: execution.consultation_id
    }, false);

    if (!cDir) fail('AUDIT_DEGRADED');
    try {
      const execFile = `${cDir.base}/execution.json`;
      const existing = readFile(execFile, MAX_EXECUTION_HISTORY_BYTES);
      if (!existing) fail('AUDIT_DEGRADED');

      const parsed = validateHistoryExecutionV1(parseJson(existing.bytes));
      if (parsed.status !== 'started') {
        fail('AUDIT_DEGRADED');
      }
      if (parsed.consultation_id !== execution.consultation_id
        || parsed.task_run_id !== execution.task_run_id
        || parsed.project_id !== execution.project_id
        || parsed.checkpoint_digest !== execution.checkpoint_digest
        || parsed.started_at !== execution.started_at) {
        fail('AUDIT_DEGRADED');
      }

      const growth = execBytes.length - existing.bytes.length;
      if (growth > 0) {
        ensureHistoryQuota(ctx, growth, policy, scanProjectRecords, readFile, openConsultationDir);
      }

      const tmpFile = `${cDir.base}/.exec-term-${randomBytes(8).toString('hex')}.tmp`;
      let tmpStat;
      try {
        tmpStat = writeExclusive(tmpFile, execBytes);
        stable(cDir.entries);
        const now = readFile(execFile, MAX_EXECUTION_HISTORY_BYTES);
        if (!now || !unchanged(now.stat, existing.stat) || !now.bytes.equals(existing.bytes)) {
          fail('AUDIT_DEGRADED');
        }
        fs.renameSync(tmpFile, execFile);
        tmpStat = undefined;
        fs.fsyncSync(cDir.fd);
        return { status: 'recorded' };
      } finally {
        if (tmpStat) removeOwned(tmpFile, tmpStat);
      }
    } finally {
      cDir.close();
    }
  });
}

function recordOutcome(dependencies, outcome, policy = {}) {
  validateHistoryOutcomeV1(outcome);
  const ctx = historyContext(dependencies);
  if (outcome.project_id !== ctx.projectId) fail('AUDIT_DEGRADED');

  const outBytes = Buffer.from(JSON.stringify(outcome), 'utf8');
  if (outBytes.length > MAX_OUTCOME_HISTORY_BYTES) fail('AUDIT_DEGRADED');

  return withHistoryLock(ctx, () => {
    const cDir = openConsultationDir(ctx, {
      projectId: outcome.project_id,
      taskRunId: outcome.task_run_id,
      consultationId: outcome.consultation_id
    }, false);

    if (!cDir) fail('AUDIT_DEGRADED');
    try {
      const execFile = `${cDir.base}/execution.json`;
      const execRecord = readFile(execFile, MAX_EXECUTION_HISTORY_BYTES);
      if (!execRecord) fail('AUDIT_DEGRADED');

      const parsedExec = validateHistoryExecutionV1(parseJson(execRecord.bytes));
      if (parsedExec.status !== 'ADVICE_READY') fail('AUDIT_DEGRADED');
      if (parsedExec.consultation_id !== outcome.consultation_id
        || parsedExec.task_run_id !== outcome.task_run_id
        || parsedExec.project_id !== outcome.project_id) {
        fail('AUDIT_DEGRADED');
      }

      const outFile = `${cDir.base}/outcome.json`;
      const existing = readFile(outFile, MAX_OUTCOME_HISTORY_BYTES);
      if (existing) {
        if (existing.bytes.equals(outBytes)) {
          return { status: 'recorded' };
        }
        try {
          const existingData = validateHistoryOutcomeV1(parseJson(existing.bytes));
          if (existingData.consultation_id === outcome.consultation_id
            && existingData.task_run_id === outcome.task_run_id
            && existingData.project_id === outcome.project_id
            && existingData.outcome === outcome.outcome
            && existingData.validation.command === outcome.validation.command
            && existingData.disposition.action === outcome.disposition.action) {
            return { status: 'recorded' };
          }
        } catch {}
        fail('AUDIT_DEGRADED');
      }

      ensureHistoryQuota(ctx, outBytes.length, policy, scanProjectRecords, readFile, openConsultationDir);

      const tmpFile = `${cDir.base}/.outcome-${randomBytes(8).toString('hex')}.tmp`;
      let tmpStat;
      try {
        tmpStat = writeExclusive(tmpFile, outBytes);
        stable(cDir.entries);
        const now = readFile(outFile, MAX_OUTCOME_HISTORY_BYTES);
        if (now !== null) fail('AUDIT_DEGRADED');
        fs.linkSync(tmpFile, outFile);
        fs.unlinkSync(tmpFile);
        tmpStat = undefined;
        fs.fsyncSync(cDir.fd);
        return { status: 'recorded' };
      } finally {
        if (tmpStat) removeOwned(tmpFile, tmpStat);
      }
    } finally {
      cDir.close();
    }
  });
}

const queryContextFns = {
  historyContextFn: historyContext,
  scanRecordsFn: scanProjectRecords,
  openConsultationDirFn: openConsultationDir,
  readFileFn: readFile
};

function listHistory(dependencies, filter = {}) {
  return listHistoryImpl(dependencies, filter, queryContextFns);
}

function getHistoryEntry(dependencies, params) {
  return getHistoryEntryImpl(dependencies, params, queryContextFns);
}

function exportHistory(dependencies, options) {
  return exportHistoryImpl(dependencies, options, queryContextFns);
}
function getHistoryMetrics(dependencies, request = {}) {
  return getHistoryMetricsImpl(dependencies, request, queryContextFns);
}


function pruneHistory(dependencies, policy = {}, options = {}) {
  return withHistoryLock(historyContext(dependencies), () => {
    return pruneHistoryImpl(dependencies, policy, options, {
      historyContextFn: historyContext,
      openHistoryRootFn: openHistoryRoot,
      openConsultationDirFn: openConsultationDir,
      scanRecordsFn: scanProjectRecords,
      readFileFn: readFile
    });
  });
}

module.exports = {
  recordStartedExecution,
  updateStartedAttempts,
  recordTerminalExecution,
  recordOutcome,
  listHistory,
  getHistoryEntry,
  exportHistory,
  getHistoryMetrics,
  pruneHistory,
  calculateTotalHistoryBytes,
  historyContext,
  withHistoryLock
};
