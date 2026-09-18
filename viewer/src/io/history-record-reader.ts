import type { DiscoveredConsultation } from './history-traversal.js';
import {
  HistoryScanBudget,
  MAX_EXECUTION_BYTES,
  MAX_OUTCOME_BYTES,
  CONCURRENT_READS,
  YIELD_CADENCE_RECORDS
} from './history-scan-budget.js';
import { computeBrowserCheckpointDigest } from './browser-digest.js';
import {
  validateHistoryExecutionV1,
  validateHistoryOutcomeV1,
  type HistoryExecutionV1,
  type HistoryOutcomeV1
} from '../../../src/protocol/advisor-contract-runtime.js';
import {
  normalizeHistoryRecord,
  type NormalizedHistoryRecordV1
} from '../../../src/protocol/advisor-metrics.js';

import { isPlainObject } from '../../../src/protocol/json.js';
const decoder = new TextDecoder('utf-8', { fatal: true });

async function readFileBytes(
  file: File,
  maxBytes: number,
  relPath: string,
  cand: DiscoveredConsultation,
  budget: HistoryScanBudget,
  oversizedCode: 'EXECUTION_OVERSIZED' | 'OUTCOME_OVERSIZED'
): Promise<ArrayBuffer | null> {
  if (file.size > maxBytes) {
    budget.addDiagnostic({ code: oversizedCode, relative_path: relPath, project_id: cand.project_id, task_run_id: cand.task_run_id, consultation_id: cand.consultation_id, bytes: file.size, observed_schema_version: null });
    return null;
  }
  const buf = await file.arrayBuffer();
  budget.recordBytesRead(buf.byteLength);
  if (buf.byteLength > maxBytes) {
    budget.addDiagnostic({ code: oversizedCode, relative_path: relPath, project_id: cand.project_id, task_run_id: cand.task_run_id, consultation_id: cand.consultation_id, bytes: buf.byteLength, observed_schema_version: null });
    return null;
  }
  return buf;
}

export async function readConsultationRecord(
  cand: DiscoveredConsultation,
  budget: HistoryScanBudget,
  signal?: AbortSignal
): Promise<NormalizedHistoryRecordV1 | null> {
  if (signal?.aborted || !cand.execution_file_handle) return null;
  const execRel = `${cand.relative_path}/execution.json`;

  let execFile: File;
  try {
    execFile = await cand.execution_file_handle.getFile();
  } catch (err: unknown) {
    const isNotFound = err instanceof Error && (err.name === 'NotFoundError' || err.message.includes('not found'));
    budget.addDiagnostic({ code: isNotFound ? 'MISSING_DURING_SCAN' : 'CONCURRENT_MODIFICATION', relative_path: execRel, project_id: cand.project_id, task_run_id: cand.task_run_id, consultation_id: cand.consultation_id, bytes: null, observed_schema_version: null });
    return null;
  }

  const execBuf = await readFileBytes(execFile, MAX_EXECUTION_BYTES, execRel, cand, budget, 'EXECUTION_OVERSIZED');
  if (!execBuf) return null;

  let execJson: unknown;
  try {
    execJson = JSON.parse(decoder.decode(execBuf));
  } catch {
    budget.addDiagnostic({ code: 'EXECUTION_INVALID_JSON', relative_path: execRel, project_id: cand.project_id, task_run_id: cand.task_run_id, consultation_id: cand.consultation_id, bytes: execBuf.byteLength, observed_schema_version: null });
    return null;
  }

  const execObj = isPlainObject(execJson) ? execJson : null;
  if (!execObj || execObj['schema_version'] !== 1) {
    const observed = typeof execObj?.['schema_version'] === 'number' ? (execObj['schema_version'] as number) : null;
    budget.addDiagnostic({ code: 'EXECUTION_UNSUPPORTED_VERSION', relative_path: execRel, project_id: cand.project_id, task_run_id: cand.task_run_id, consultation_id: cand.consultation_id, bytes: execBuf.byteLength, observed_schema_version: observed });
    return null;
  }

  let validatedExec: HistoryExecutionV1;
  try {
    validatedExec = validateHistoryExecutionV1(execJson);
  } catch {
    budget.addDiagnostic({ code: 'EXECUTION_INVALID', relative_path: execRel, project_id: cand.project_id, task_run_id: cand.task_run_id, consultation_id: cand.consultation_id, bytes: execBuf.byteLength, observed_schema_version: 1 });
    return null;
  }

  const computedDigest = await computeBrowserCheckpointDigest(validatedExec.checkpoint);
  if (computedDigest.toLowerCase() !== validatedExec.checkpoint_digest.toLowerCase()) {
    budget.addDiagnostic({ code: 'EXECUTION_INVALID', relative_path: execRel, project_id: cand.project_id, task_run_id: cand.task_run_id, consultation_id: cand.consultation_id, bytes: execBuf.byteLength, observed_schema_version: 1 });
    return null;
  }

  if (
    cand.project_id !== validatedExec.project_id.toLowerCase() ||
    cand.task_run_id !== validatedExec.task_run_id.toLowerCase() ||
    cand.consultation_id !== validatedExec.consultation_id.toLowerCase() ||
    validatedExec.checkpoint.task_run_id.toLowerCase() !== validatedExec.task_run_id.toLowerCase()
  ) {
    budget.addDiagnostic({ code: 'EXECUTION_IDENTITY_MISMATCH', relative_path: execRel, project_id: cand.project_id, task_run_id: cand.task_run_id, consultation_id: cand.consultation_id, bytes: execBuf.byteLength, observed_schema_version: 1 });
    return null;
  }

  let outcomePayload: HistoryOutcomeV1 | { readonly invalid: true } | null = null;
  if (cand.outcome_file_handle) {
    const outRel = `${cand.relative_path}/outcome.json`;
    try {
      const outFile = await cand.outcome_file_handle.getFile();
      const outBuf = await readFileBytes(outFile, MAX_OUTCOME_BYTES, outRel, cand, budget, 'OUTCOME_OVERSIZED');
      if (!outBuf) {
        outcomePayload = { invalid: true };
      } else {
        let outJson: unknown;
        try {
          outJson = JSON.parse(decoder.decode(outBuf));
        } catch {
          budget.addDiagnostic({ code: 'OUTCOME_INVALID_JSON', relative_path: outRel, project_id: cand.project_id, task_run_id: cand.task_run_id, consultation_id: cand.consultation_id, bytes: outBuf.byteLength, observed_schema_version: null });
          outcomePayload = { invalid: true };
        }
        if (outcomePayload === null) {
          const outObj = isPlainObject(outJson) ? outJson : null;
          if (!outObj || outObj['schema_version'] !== 1) {
            const observed = typeof outObj?.['schema_version'] === 'number' ? (outObj['schema_version'] as number) : null;
            budget.addDiagnostic({ code: 'OUTCOME_UNSUPPORTED_VERSION', relative_path: outRel, project_id: cand.project_id, task_run_id: cand.task_run_id, consultation_id: cand.consultation_id, bytes: outBuf.byteLength, observed_schema_version: observed });
            outcomePayload = { invalid: true };
          } else {
            try {
              const valOut = validateHistoryOutcomeV1(outJson);
              if (
                cand.project_id !== valOut.project_id.toLowerCase() ||
                cand.task_run_id !== valOut.task_run_id.toLowerCase() ||
                cand.consultation_id !== valOut.consultation_id.toLowerCase()
              ) {
                budget.addDiagnostic({ code: 'OUTCOME_IDENTITY_MISMATCH', relative_path: outRel, project_id: cand.project_id, task_run_id: cand.task_run_id, consultation_id: cand.consultation_id, bytes: outBuf.byteLength, observed_schema_version: 1 });
                outcomePayload = { invalid: true };
              } else {
                outcomePayload = valOut;
              }
            } catch {
              budget.addDiagnostic({ code: 'OUTCOME_INVALID', relative_path: outRel, project_id: cand.project_id, task_run_id: cand.task_run_id, consultation_id: cand.consultation_id, bytes: outBuf.byteLength, observed_schema_version: 1 });
              outcomePayload = { invalid: true };
            }
          }
        }
      }
    } catch {
      budget.addDiagnostic({ code: 'CONCURRENT_MODIFICATION', relative_path: outRel, project_id: cand.project_id, task_run_id: cand.task_run_id, consultation_id: cand.consultation_id, bytes: null, observed_schema_version: null });
      outcomePayload = { invalid: true };
    }
  }

  return normalizeHistoryRecord(validatedExec, outcomePayload, { kind: 'browser', relative_path: cand.relative_path });
}

export async function readConsultationRecordsBounded(
  candidates: readonly DiscoveredConsultation[],
  budget: HistoryScanBudget,
  signal?: AbortSignal
): Promise<NormalizedHistoryRecordV1[]> {
  const records: NormalizedHistoryRecordV1[] = [];
  let nextIdx = 0;
  let processed = 0;

  async function worker(): Promise<void> {
    while (nextIdx < candidates.length) {
      if (signal?.aborted || budget.limitHit) break;
      const idx = nextIdx++;
      const rec = await readConsultationRecord(candidates[idx], budget, signal);
      if (rec) records.push(rec);
      processed += 1;
      if (processed % YIELD_CADENCE_RECORDS === 0) {
        const { promise, resolve } = Promise.withResolvers<void>();
        setTimeout(resolve, 0);
        await promise;
      }
    }
  }

  const workers = Array.from({ length: Math.min(CONCURRENT_READS, candidates.length) }, () => worker());
  await Promise.all(workers);
  return records;
}
