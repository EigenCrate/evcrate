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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_SCAN_BYTES = 256 * 1024 * 1024;
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

async function scanHistoryRecords(historyRootPath, projectId, options = {}) {
  const { signal, deadline } = options;
  checkAbortAndDeadline(signal, deadline);
  const targetProjDir = path.join(historyRootPath, projectId.toLowerCase());
  const pStat = inspectStat(targetProjDir);

  const scan = {
    status: 'complete', projects_discovered: pStat && pStat.isDirectory() ? 1 : 0,
    tasks_discovered: 0, consultations_discovered: 0, accepted_records: 0,
    invalid_records: 0, bytes_discovered: 0, bytes_read: 0,
    diagnostics: [], suppressed_diagnostics: 0, limit_hit: false
  };

  const rows = [];
  const rawRecords = new Map();
  const normalizedRecords = [];
  if (!pStat || !pStat.isDirectory() || pStat.isSymbolicLink() || !isOwner(pStat)) return { scan, rows, rawRecords, normalizedRecords };

  let taskEntries = [];
  try { taskEntries = fs.readdirSync(targetProjDir); } catch { return { scan, rows, rawRecords, normalizedRecords }; }
  taskEntries.sort();

  for (const tName of taskEntries) {
    checkAbortAndDeadline(signal, deadline);
    await yieldEventLoop();
    if (!UUID_RE.test(tName)) continue;
    const tPath = path.join(targetProjDir, tName);
    const tStat = inspectStat(tPath);
    if (!tStat || !tStat.isDirectory() || tStat.isSymbolicLink() || !isOwner(tStat)) continue;

    scan.tasks_discovered += 1;
    let consultEntries = [];
    try { consultEntries = fs.readdirSync(tPath); } catch { continue; }
    consultEntries.sort();

    for (const cName of consultEntries) {
      checkAbortAndDeadline(signal, deadline);
      await yieldEventLoop();
      if (!UUID_RE.test(cName)) continue;
      const cPath = path.join(tPath, cName);
      const cStat = inspectStat(cPath);
      if (!cStat || !cStat.isDirectory() || cStat.isSymbolicLink() || !isOwner(cStat)) continue;

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
      try { execData = validateHistoryExecutionV1(JSON.parse(execRead.bytes.toString('utf8'))); }
      catch { recordDiag(scan, 'EXECUTION_INVALID_JSON', tName, cName); continue; }

      let outRead = null, outData = null;
      const outStat = inspectStat(outPath);
      if (outStat) {
        scan.bytes_discovered += Number(outStat.size);
        outRead = readBoundedFile(outPath, MAX_OUTCOME_HISTORY_BYTES);
        if (outRead) {
          scan.bytes_read += outRead.size;
          try { outData = validateHistoryOutcomeV1(JSON.parse(outRead.bytes.toString('utf8'))); }
          catch { outData = null; }
        }
      }

      if (scan.bytes_read > MAX_SCAN_BYTES) {
        scan.limit_hit = true;
        scan.status = 'limit_exceeded';
        break;
      }

      const computedDigest = execData.checkpoint ? computeCheckpointDigestV2(execData.checkpoint) : execData.checkpoint_digest;
      const recordRef = createHash('sha256').update(`${tName}:${cName}`, 'utf8').digest('hex').slice(0, 32);
      const normalized = normalizeHistoryRecord(execData, outData, { kind: 'project', relative_path: `${tName}/${cName}` });

      rows.push(Object.freeze({
        record_ref: recordRef, project_id: projectId.toLowerCase(),
        task_run_id: tName.toLowerCase(), consultation_id: cName.toLowerCase(),
        status: execData.status, route: Object.freeze({ ...execData.route }),
        checkpoint_digest: computedDigest, prompt_identity: execData.prompt_identity,
        build_identity: execData.build_identity, started_at: execData.started_at,
        completed_at: execData.completed_at ?? null, receipt_elapsed_ms: execData.receipt_elapsed_ms ?? null,
        outcome_state: normalized.outcome_state, outcome_result: normalized.outcome_result ?? null
      }));
      normalizedRecords.push(normalized);

      rawRecords.set(recordRef, Object.freeze({
        recordRef, taskRunId: tName.toLowerCase(), consultationId: cName.toLowerCase(),
        execPath, outPath, hasOutcome: Boolean(outRead && outData),
        execFingerprint: execRead.hash, outFingerprint: outRead ? outRead.hash : null,
        execDev: String(execRead.stat.dev), execIno: String(execRead.stat.ino), execSize: execRead.size,
        outDev: outRead ? String(outRead.stat.dev) : null, outIno: outRead ? String(outRead.stat.ino) : null, outSize: outRead ? outRead.size : 0
      }));
      scan.accepted_records += 1;
    }
    if (scan.limit_hit) break;
  }
  return { scan, rows, rawRecords, normalizedRecords };
}

module.exports = {
  scanHistoryRecords,
  checkAbortAndDeadline,
  readBoundedFile,
  MAX_SCAN_BYTES,
  MAX_DIAGNOSTICS
};
