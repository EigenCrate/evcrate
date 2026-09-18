import test from 'node:test';
import assert from 'node:assert/strict';
import { HistoryScanBudget, MAX_EXECUTION_BYTES, MAX_OUTCOME_BYTES } from '../../viewer/src/io/history-scan-budget.js';
import { traverseHistoryDirectory } from '../../viewer/src/io/history-traversal.js';
import { readConsultationRecord, readConsultationRecordsBounded } from '../../viewer/src/io/history-record-reader.js';
import { FakeDirectoryHandle } from './fake-file-system.mjs';
import {
  VALID_PROJECT_ID,
  VALID_TASK_ID,
  VALID_CONSULTATION_ID,
  makeSampleExecution,
  makeSampleOutcome,
  createValidSingleProjectTree
} from '../fixtures/advisor-history-browser/browser-fixtures.mjs';

test('history-record-reader: reads valid execution and outcome records', async () => {
  const { root } = createValidSingleProjectTree();
  const budget = new HistoryScanBudget();
  const { candidates } = await traverseHistoryDirectory(root, budget);

  const record = await readConsultationRecord(candidates[0], budget);
  assert.notEqual(record, null);
  assert.equal(record.project_id, VALID_PROJECT_ID);
  assert.equal(record.task_run_id, VALID_TASK_ID);
  assert.equal(record.consultation_id, VALID_CONSULTATION_ID);
  assert.equal(record.outcome_state, 'valid');
  assert.equal(record.outcome_result, 'resolved');
  assert.equal(record.status, 'ADVICE_READY');
  assert.equal(budget.diagnostics.length, 0);
});

test('history-record-reader: handles missing outcome as outcome_state missing', async () => {
  const { root } = createValidSingleProjectTree({ includeOutcome: false });
  const budget = new HistoryScanBudget();
  const { candidates } = await traverseHistoryDirectory(root, budget);

  const record = await readConsultationRecord(candidates[0], budget);
  assert.notEqual(record, null);
  assert.equal(record.outcome_state, 'missing');
  assert.equal(record.outcome_result, null);
  assert.equal(budget.diagnostics.length, 0);
});

test('history-record-reader: detects oversized execution and outcome files', async () => {
  const root = new FakeDirectoryHandle(VALID_PROJECT_ID);
  const task = root.addDirectory(VALID_TASK_ID);
  const consult = task.addDirectory(VALID_CONSULTATION_ID);
  consult.addFile('execution.json', 'x'.repeat(MAX_EXECUTION_BYTES + 10));

  const budget = new HistoryScanBudget();
  const { candidates } = await traverseHistoryDirectory(root, budget);
  const record = await readConsultationRecord(candidates[0], budget);
  assert.equal(record, null);
  assert.equal(budget.diagnostics.some((d) => d.code === 'EXECUTION_OVERSIZED'), true);

  const root2 = new FakeDirectoryHandle(VALID_PROJECT_ID);
  const task2 = root2.addDirectory(VALID_TASK_ID);
  const consult2 = task2.addDirectory(VALID_CONSULTATION_ID);
  consult2.addFile('execution.json', JSON.stringify(makeSampleExecution()));
  consult2.addFile('outcome.json', 'x'.repeat(MAX_OUTCOME_BYTES + 10));

  const budget2 = new HistoryScanBudget();
  const { candidates: cands2 } = await traverseHistoryDirectory(root2, budget2);
  const record2 = await readConsultationRecord(cands2[0], budget2);
  assert.notEqual(record2, null);
  assert.equal(record2.outcome_state, 'invalid');
  assert.equal(budget2.diagnostics.some((d) => d.code === 'OUTCOME_OVERSIZED'), true);
});

test('history-record-reader: detects invalid JSON and unsupported versions', async () => {
  const root = new FakeDirectoryHandle(VALID_PROJECT_ID);
  const task = root.addDirectory(VALID_TASK_ID);
  const consult = task.addDirectory(VALID_CONSULTATION_ID);
  consult.addFile('execution.json', '{ bad json');

  const budget = new HistoryScanBudget();
  const { candidates } = await traverseHistoryDirectory(root, budget);
  const record = await readConsultationRecord(candidates[0], budget);
  assert.equal(record, null);
  assert.equal(budget.diagnostics.some((d) => d.code === 'EXECUTION_INVALID_JSON'), true);

  const root2 = new FakeDirectoryHandle(VALID_PROJECT_ID);
  const task2 = root2.addDirectory(VALID_TASK_ID);
  const consult2 = task2.addDirectory(VALID_CONSULTATION_ID);
  const badExec = makeSampleExecution();
  badExec.schema_version = 99;
  consult2.addFile('execution.json', JSON.stringify(badExec));

  const budget2 = new HistoryScanBudget();
  const { candidates: cands2 } = await traverseHistoryDirectory(root2, budget2);
  const record2 = await readConsultationRecord(cands2[0], budget2);
  assert.equal(record2, null);
  const diag = budget2.diagnostics.find((d) => d.code === 'EXECUTION_UNSUPPORTED_VERSION');
  assert.notEqual(diag, undefined);
  assert.equal(diag.observed_schema_version, 99);
});

test('history-record-reader: detects digest mismatch and identity mismatch', async () => {
  const root = new FakeDirectoryHandle(VALID_PROJECT_ID);
  const task = root.addDirectory(VALID_TASK_ID);
  const consult = task.addDirectory(VALID_CONSULTATION_ID);
  const badExec = makeSampleExecution();
  badExec.checkpoint_digest = 'f'.repeat(64);
  consult.addFile('execution.json', JSON.stringify(badExec));

  const budget = new HistoryScanBudget();
  const { candidates } = await traverseHistoryDirectory(root, budget);
  const record = await readConsultationRecord(candidates[0], budget);
  assert.equal(record, null);
  assert.equal(budget.diagnostics.some((d) => d.code === 'EXECUTION_INVALID'), true);

  const root2 = new FakeDirectoryHandle(VALID_PROJECT_ID);
  const task2 = root2.addDirectory(VALID_TASK_ID);
  const consult2 = task2.addDirectory(VALID_CONSULTATION_ID);
  const badExec2 = makeSampleExecution({ task_run_id: '11111111-2222-4000-8000-333333333333' });
  consult2.addFile('execution.json', JSON.stringify(badExec2));

  const budget2 = new HistoryScanBudget();
  const { candidates: cands2 } = await traverseHistoryDirectory(root2, budget2);
  const record2 = await readConsultationRecord(cands2[0], budget2);
  assert.equal(record2, null);
  assert.equal(budget2.diagnostics.some((d) => d.code === 'EXECUTION_IDENTITY_MISMATCH'), true);
});

test('history-record-reader: concurrent reads and yielding', async () => {
  const root = new FakeDirectoryHandle(VALID_PROJECT_ID);
  const task = root.addDirectory(VALID_TASK_ID);
  for (let i = 0; i < 5; i++) {
    const cId = `01234567-89ab-4cde-8f01-${String(i).padStart(12, '0')}`;
    const consult = task.addDirectory(cId);
    consult.addFile('execution.json', JSON.stringify(makeSampleExecution({ consultation_id: cId })));
  }

  const budget = new HistoryScanBudget();
  const { candidates } = await traverseHistoryDirectory(root, budget);
  const records = await readConsultationRecordsBounded(candidates, budget);
  assert.equal(records.length, 5);
});
