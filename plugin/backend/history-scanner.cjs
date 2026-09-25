'use strict';

/**
 * @file history-scanner.cjs
 * Cooperative history scanner and record normalizer for EVCrate Advisor Provider (Phase E01).
 */

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { inspectStat, isOwner } = require('./binding.cjs');
const { cancelled, deadlineExceeded } = require('./provider-errors.cjs');
const {
  validateHistoryExecutionV1, validateHistoryOutcomeV1,
  MAX_EXECUTION_HISTORY_BYTES, MAX_OUTCOME_HISTORY_BYTES
} = require('./advisor-lib/history-contract.cjs');
const { computeCheckpointDigestV2 } = require('./advisor-lib/contracts-v2.cjs');
const { normalizeHistoryRecord } = require('./advisor-lib/generated/advisor-metrics.js');
const { validateProjectDisplayName } = require('./data-api.cjs');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_HEX_RE = /^[0-9a-f]{64}$/i;
const MAX_SCAN_BYTES = 256 * 1024 * 1024;
const MAX_SCAN_RECORDS = 50000;
const MAX_SCAN_PROJECTS = 500;
const MAX_TASKS_PER_PROJECT = 256;
const MAX_CONSULTATIONS_PER_TASK = 256;
const MAX_METADATA_BYTES = 64 * 1024;
const MAX_DIAGNOSTICS = 4096;
const yieldEventLoop = () => new Promise((resolve) => setImmediate(resolve));
function checkAbortAndDeadline(signal, deadline) {
  if (signal?.aborted) throw cancelled('Scan cancelled by abort signal');
  if (deadline && Date.now() > deadline) throw deadlineExceeded('Scan deadline exceeded');
}

function recordDiag(scan, code, task_run_id, consultation_id) {
  scan.invalid_records += 1;
  if (scan.diagnostics.length < MAX_DIAGNOSTICS) scan.diagnostics.push({ code, task_run_id, consultation_id });
  else scan.suppressed_diagnostics += 1;
}

function readSafeProjectLabel(metadataPath, projectId) {
  const metaRead = readBoundedFile(metadataPath, MAX_METADATA_BYTES);
  if (!metaRead) return null;
  try {
    const parsed = JSON.parse(metaRead.bytes.toString('utf8'));
    if (!parsed || typeof parsed !== 'object' || parsed.version !== 1) return null;
    if (!parsed.projects || typeof parsed.projects !== 'object') return null;
    const entry = parsed.projects[projectId.toLowerCase()];
    if (!entry || typeof entry !== 'object' || typeof entry.name !== 'string') return null;
    return validateProjectDisplayName(entry.name);
  } catch {
    return null;
  }
}
function readBoundedFile(filePath, maxBytes) {
  const stat = inspectStat(filePath);
  if (!stat || !stat.isFile() || stat.isSymbolicLink() || !isOwner(stat) || stat.nlink !== 1n || stat.size > BigInt(maxBytes)) {
    return null;
  }
  let fd;
  try {
    fd = fs.openSync(filePath, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    const openedStat = fs.fstatSync(fd, { bigint: true });
    if (!openedStat.isFile() || openedStat.isSymbolicLink() || !isOwner(openedStat) || openedStat.nlink !== 1n || openedStat.size > BigInt(maxBytes)) return null;
    const buf = Buffer.alloc(Number(openedStat.size));
    fs.readSync(fd, buf, 0, buf.length, 0);
    return { bytes: buf, stat: openedStat, hash: createHash('sha256').update(buf).digest('hex'), size: Number(openedStat.size) };
  } catch {
    return null;
  } finally {
    if (fd !== undefined) try { fs.closeSync(fd); } catch {}
  }
}

async function scanHistoryRecords(historyRootPath, targetOrContext, options = {}) {
  const { signal, deadline } = options;
  checkAbortAndDeadline(signal, deadline);

  let scopeKind = 'project';
  let targetProjectId = null;

  if (typeof targetOrContext === 'string') {
    targetProjectId = targetOrContext.toLowerCase();
    scopeKind = options.scopeKind || 'project';
  } else if (targetOrContext && typeof targetOrContext === 'object') {
    scopeKind = targetOrContext.scopeKind || targetOrContext.scope_kind || options.scopeKind || 'project';
    if (targetOrContext.historyIdentity) {
      targetProjectId = String(targetOrContext.historyIdentity).toLowerCase();
    } else if (targetOrContext.projectId) {
      targetProjectId = String(targetOrContext.projectId).toLowerCase();
    }
  }

  const scan = {
    status: 'complete',
    projects_discovered: 0,
    tasks_discovered: 0,
    consultations_discovered: 0,
    accepted_records: 0,
    invalid_records: 0,
    bytes_discovered: 0,
    bytes_read: 0,
    diagnostics: [],
    suppressed_diagnostics: 0,
    limit_hit: false
  };

  const rows = [];
  const rawRecords = new Map();
  const normalizedRecords = [];
  const projectCounts = new Map();
  const projectLabels = new Map();

  const emptyInventory = Object.freeze({ entries: Object.freeze([]), total_projects: 0, unfiltered_total_records: 0 });

  const rootStat = inspectStat(historyRootPath);
  if (!rootStat || !rootStat.isDirectory() || rootStat.isSymbolicLink() || !isOwner(rootStat)) {
    return { scan, rows, rawRecords, normalizedRecords, inventory: emptyInventory };
  }
  try {
    if (fs.realpathSync.native(historyRootPath) !== path.normalize(historyRootPath)) {
      return { scan, rows, rawRecords, normalizedRecords, inventory: emptyInventory };
    }
  } catch {
    return { scan, rows, rawRecords, normalizedRecords, inventory: emptyInventory };
  }

  let eligibleProjectIds = [];
  if (scopeKind === 'project') {
    if (!targetProjectId || !SHA256_HEX_RE.test(targetProjectId)) {
      return { scan, rows, rawRecords, normalizedRecords, inventory: emptyInventory };
    }
    eligibleProjectIds = [targetProjectId];
  } else {
    let dirEntries = [];
    try {
      dirEntries = fs.readdirSync(historyRootPath);
    } catch {
      return { scan, rows, rawRecords, normalizedRecords, inventory: emptyInventory };
    }
    eligibleProjectIds = dirEntries
      .filter((e) => SHA256_HEX_RE.test(e))
      .map((e) => e.toLowerCase())
      .sort();

    if (eligibleProjectIds.length > MAX_SCAN_PROJECTS) {
      scan.limit_hit = true;
      scan.status = 'incomplete';
      eligibleProjectIds = eligibleProjectIds.slice(0, MAX_SCAN_PROJECTS);
    }
  }

  const rootMetaPath = path.join(historyRootPath, 'project-metadata.json');

  for (const projId of eligibleProjectIds) {
    checkAbortAndDeadline(signal, deadline);
    await yieldEventLoop();

    const projDir = path.join(historyRootPath, projId);
    const pStat = inspectStat(projDir);
    if (!pStat || !pStat.isDirectory() || pStat.isSymbolicLink() || !isOwner(pStat)) {
      continue;
    }
    try {
      if (fs.realpathSync.native(projDir) !== projDir) {
        continue;
      }
    } catch {
      continue;
    }

    scan.projects_discovered += 1;
    projectCounts.set(projId, 0);

    const projMetaPath = path.join(projDir, 'project-metadata.json');
    let label = readSafeProjectLabel(projMetaPath, projId);
    if (!label) {
      label = readSafeProjectLabel(rootMetaPath, projId);
    }
    projectLabels.set(projId, label || null);

    let taskEntries = [];
    try {
      taskEntries = fs.readdirSync(projDir);
    } catch {
      continue;
    }
    let eligibleTasks = taskEntries.filter((t) => UUID_RE.test(t)).sort();
    if (eligibleTasks.length > MAX_TASKS_PER_PROJECT) {
      scan.limit_hit = true;
      scan.status = 'incomplete';
      eligibleTasks = eligibleTasks.slice(0, MAX_TASKS_PER_PROJECT);
    }

    for (const tName of eligibleTasks) {
      checkAbortAndDeadline(signal, deadline);
      await yieldEventLoop();

      const tPath = path.join(projDir, tName);
      const tStat = inspectStat(tPath);
      if (!tStat || !tStat.isDirectory() || tStat.isSymbolicLink() || !isOwner(tStat)) continue;
      try {
        if (fs.realpathSync.native(tPath) !== tPath) continue;
      } catch { continue; }

      scan.tasks_discovered += 1;
      let consultEntries = [];
      try {
        consultEntries = fs.readdirSync(tPath);
      } catch {
        continue;
      }
      let eligibleConsultations = consultEntries.filter((c) => UUID_RE.test(c)).sort();
      if (eligibleConsultations.length > MAX_CONSULTATIONS_PER_TASK) {
        scan.limit_hit = true;
        scan.status = 'incomplete';
        eligibleConsultations = eligibleConsultations.slice(0, MAX_CONSULTATIONS_PER_TASK);
      }

      for (const cName of eligibleConsultations) {
        checkAbortAndDeadline(signal, deadline);
        await yieldEventLoop();

        const cPath = path.join(tPath, cName);
        const cStat = inspectStat(cPath);
        if (!cStat || !cStat.isDirectory() || cStat.isSymbolicLink() || !isOwner(cStat)) continue;
        try {
          if (fs.realpathSync.native(cPath) !== cPath) continue;
        } catch { continue; }

        scan.consultations_discovered += 1;
        const execPath = path.join(cPath, 'execution.json');
        const outPath = path.join(cPath, 'outcome.json');
        const execRead = readBoundedFile(execPath, MAX_EXECUTION_HISTORY_BYTES);
        if (!execRead) {
          recordDiag(scan, 'EXECUTION_UNREADABLE', tName, cName);
          continue;
        }
        scan.bytes_read += execRead.size;
        scan.bytes_discovered += execRead.size;

        let execData;
        try {
          execData = validateHistoryExecutionV1(JSON.parse(execRead.bytes.toString('utf8')));
        } catch {
          recordDiag(scan, 'EXECUTION_INVALID_JSON', tName, cName);
          continue;
        }

        if (
          execData.project_id.toLowerCase() !== projId ||
          execData.task_run_id.toLowerCase() !== tName.toLowerCase() ||
          execData.consultation_id.toLowerCase() !== cName.toLowerCase()
        ) {
          recordDiag(scan, 'EXECUTION_ID_MISMATCH', tName, cName);
          continue;
        }

        let outRead = null, outData = null;
        const outStat = inspectStat(outPath);
        if (outStat) {
          scan.bytes_discovered += Number(outStat.size);
          outRead = readBoundedFile(outPath, MAX_OUTCOME_HISTORY_BYTES);
          if (outRead) {
            scan.bytes_read += outRead.size;
            try {
              outData = validateHistoryOutcomeV1(JSON.parse(outRead.bytes.toString('utf8')));
              if (
                outData.project_id.toLowerCase() !== projId ||
                outData.task_run_id.toLowerCase() !== tName.toLowerCase() ||
                outData.consultation_id.toLowerCase() !== cName.toLowerCase()
              ) {
                recordDiag(scan, 'OUTCOME_ID_MISMATCH', tName, cName);
              }
            } catch {
              recordDiag(scan, 'OUTCOME_INVALID_JSON', tName, cName);
              outData = { invalid: true };
            }
          }
        }

        if (scan.bytes_read > MAX_SCAN_BYTES) {
          scan.limit_hit = true;
          scan.status = 'incomplete';
          break;
        }

        if (scan.accepted_records >= MAX_SCAN_RECORDS) {
          scan.limit_hit = true;
          scan.status = 'incomplete';
          break;
        }

        const computedDigest = execData.checkpoint ? computeCheckpointDigestV2(execData.checkpoint) : execData.checkpoint_digest;
        const recordRef = createHash('sha256').update(`${projId}:${tName.toLowerCase()}:${cName.toLowerCase()}`, 'utf8').digest('hex').slice(0, 32);
        const normalized = normalizeHistoryRecord(execData, outData, { kind: scopeKind, relative_path: `${projId}/${tName}/${cName}` });

        rows.push(Object.freeze({
          record_ref: recordRef,
          project_id: projId,
          task_run_id: tName.toLowerCase(),
          consultation_id: cName.toLowerCase(),
          status: execData.status,
          route: Object.freeze({ ...execData.route }),
          checkpoint_digest: computedDigest,
          prompt_identity: execData.prompt_identity,
          build_identity: execData.build_identity,
          started_at: execData.started_at,
          completed_at: execData.completed_at ?? null,
          receipt_elapsed_ms: execData.receipt_elapsed_ms ?? null,
          outcome_state: normalized.outcome_state,
          outcome_result: normalized.outcome_result ?? null
        }));
        normalizedRecords.push(normalized);

        rawRecords.set(recordRef, Object.freeze({
          recordRef,
          projectId: projId,
          taskRunId: tName.toLowerCase(),
          consultationId: cName.toLowerCase(),
          execPath,
          outPath,
          hasOutcome: Boolean(outRead && outData),
          execFingerprint: execRead.hash,
          outFingerprint: outRead ? outRead.hash : null,
          execDev: String(execRead.stat.dev),
          execIno: String(execRead.stat.ino),
          execSize: execRead.size,
          outDev: outRead ? String(outRead.stat.dev) : null,
          outIno: outRead ? String(outRead.stat.ino) : null,
          outSize: outRead ? outRead.size : 0
        }));

        scan.accepted_records += 1;
        projectCounts.set(projId, (projectCounts.get(projId) || 0) + 1);
      }
      if (scan.limit_hit) break;
    }
    if (scan.limit_hit) break;
  }

  if (!scan.limit_hit) {
    scan.status = scan.invalid_records > 0 ? 'complete_with_errors' : 'complete';
  }

  const inventoryEntries = [];
  for (const pid of eligibleProjectIds) {
    if (projectCounts.has(pid)) {
      inventoryEntries.push(Object.freeze({
        project_id: pid,
        label: projectLabels.get(pid) || null,
        count: projectCounts.get(pid) || 0
      }));
    }
  }

  const inventory = Object.freeze({
    entries: Object.freeze(inventoryEntries),
    total_projects: inventoryEntries.length,
    unfiltered_total_records: scan.accepted_records
  });

  return { scan, rows, rawRecords, normalizedRecords, inventory };
}

module.exports = {
  scanHistoryRecords,
  checkAbortAndDeadline,
  readBoundedFile,
  readSafeProjectLabel,
  MAX_SCAN_BYTES,
  MAX_DIAGNOSTICS
};
