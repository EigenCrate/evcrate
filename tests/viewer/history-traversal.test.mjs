import test from 'node:test';
import assert from 'node:assert/strict';
import { HistoryScanBudget } from '../../viewer/src/io/history-scan-budget.js';
import { traverseHistoryDirectory } from '../../viewer/src/io/history-traversal.js';
import { FakeDirectoryHandle } from './fake-file-system.mjs';
import {
  VALID_PROJECT_ID,
  VALID_TASK_ID,
  VALID_CONSULTATION_ID,
  makeSampleExecution,
  makeSampleOutcome,
  createValidSingleProjectTree,
  createValidHistoryRootTree
} from '../fixtures/advisor-history-browser/browser-fixtures.mjs';

test('history-scan-budget: tracks entries, bytes, and enforces limits', () => {
  const budget = new HistoryScanBudget();
  assert.equal(budget.recordEntry('entry-1'), true);
  assert.equal(budget.enumeratedEntries, 1);
  assert.equal(budget.recordDiscoveredBytes(1024, 'file-1'), true);
  assert.equal(budget.discoveredBytes, 1024);
  budget.recordBytesRead(512);
  assert.equal(budget.bytesRead, 512);

  for (let i = 0; i < 4100; i++) {
    budget.addDiagnostic({
      code: 'UNEXPECTED_ENTRY',
      relative_path: `path-${String(i).padStart(4, '0')}`,
      project_id: null, task_run_id: null, consultation_id: null, bytes: null, observed_schema_version: null
    });
  }
  assert.equal(budget.diagnostics.length, 4096);
  assert.equal(budget.suppressedDiagnostics, 4);
  assert.equal(budget.diagnostics[0].relative_path, 'path-0000');
  assert.equal(budget.diagnostics[4095].relative_path, 'path-4095');
});

test('history-scan-budget: triggers COUNT_LIMIT and SELECTION_BYTE_LIMIT', () => {
  const budget = new HistoryScanBudget();
  budget.enumeratedEntries = 200000;
  assert.equal(budget.recordEntry('overflow'), false);
  assert.equal(budget.limitHit, true);
  assert.equal(budget.diagnostics.some((d) => d.code === 'COUNT_LIMIT'), true);

  const budget2 = new HistoryScanBudget();
  budget2.discoveredBytes = 256 * 1024 * 1024;
  assert.equal(budget2.recordDiscoveredBytes(1, 'overflow-bytes'), false);
  assert.equal(budget2.limitHit, true);
  assert.equal(budget2.diagnostics.some((d) => d.code === 'SELECTION_BYTE_LIMIT'), true);
});

test('history-traversal: single project directory traversal', async () => {
  const { root } = createValidSingleProjectTree();
  const budget = new HistoryScanBudget();
  const result = await traverseHistoryDirectory(root, budget);

  assert.equal(result.limit_hit, false);
  assert.equal(result.scope.kind, 'project');
  assert.equal(result.scope.selected_project_id, VALID_PROJECT_ID);
  assert.deepEqual(result.scope.project_ids, [VALID_PROJECT_ID]);
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].project_id, VALID_PROJECT_ID);
  assert.equal(result.candidates[0].task_run_id, VALID_TASK_ID);
  assert.equal(result.candidates[0].consultation_id, VALID_CONSULTATION_ID);
  assert.equal(result.candidates[0].execution_file_handle !== null, true);
  assert.equal(result.candidates[0].outcome_file_handle !== null, true);
  assert.equal(budget.diagnostics.length, 0);
});

test('history-traversal: history root directory traversal with 2 projects', async () => {
  const root = createValidHistoryRootTree();
  const budget = new HistoryScanBudget();
  const result = await traverseHistoryDirectory(root, budget);

  assert.equal(result.limit_hit, false);
  assert.equal(result.scope.kind, 'history-root');
  assert.equal(result.scope.project_ids.length, 2);
  assert.equal(result.candidates.length, 2);
  assert.equal(budget.projectsDiscovered, 2);
  assert.equal(budget.tasksDiscovered, 2);
  assert.equal(budget.consultationsDiscovered, 2);
  assert.equal(budget.diagnostics.length, 0);
});

test('history-traversal: unexpected entries at root, project, task, and consultation levels', async () => {
  const root = new FakeDirectoryHandle('evcrate-history');
  root.addFile('unexpected-root-file.txt', 'junk');
  root.addDirectory('not-a-hex-project-name');

  const validProj = root.addDirectory(VALID_PROJECT_ID);
  validProj.addFile('project-file.txt', 'junk');
  validProj.addDirectory('not-a-uuid-task');

  const validTask = validProj.addDirectory(VALID_TASK_ID);
  validTask.addFile('task-file.txt', 'junk');
  validTask.addDirectory('not-a-uuid-consult');

  const validConsult = validTask.addDirectory(VALID_CONSULTATION_ID);
  validConsult.addFile('execution.json', JSON.stringify(makeSampleExecution()));
  validConsult.addFile('unexpected.log', 'extra file');
  validConsult.addDirectory('nested-dir');

  const budget = new HistoryScanBudget();
  const result = await traverseHistoryDirectory(root, budget);

  assert.equal(result.candidates.length, 1);
  const diagCodes = budget.diagnostics.map((d) => `${d.code}:${d.relative_path}`);
  assert.equal(diagCodes.includes('UNEXPECTED_ENTRY:unexpected-root-file.txt'), true);
  assert.equal(diagCodes.includes('UNEXPECTED_ENTRY:not-a-hex-project-name'), true);
  assert.equal(diagCodes.some((d) => d.startsWith('UNEXPECTED_ENTRY:') && d.includes('project-file.txt')), true);
  assert.equal(diagCodes.some((d) => d.startsWith('UNEXPECTED_ENTRY:') && d.includes('not-a-uuid-task')), true);
  assert.equal(diagCodes.some((d) => d.startsWith('UNEXPECTED_ENTRY:') && d.includes('task-file.txt')), true);
  assert.equal(diagCodes.some((d) => d.startsWith('UNEXPECTED_ENTRY:') && d.includes('not-a-uuid-consult')), true);
  assert.equal(diagCodes.some((d) => d.startsWith('UNEXPECTED_ENTRY:') && d.includes('unexpected.log')), true);
  assert.equal(diagCodes.some((d) => d.startsWith('UNEXPECTED_ENTRY:') && d.includes('nested-dir')), true);
});

test('history-traversal: EXECUTION_MISSING and unreadable directories', async () => {
  const root = new FakeDirectoryHandle(VALID_PROJECT_ID);
  const task = root.addDirectory(VALID_TASK_ID);
  const consult = task.addDirectory(VALID_CONSULTATION_ID);
  consult.addFile('outcome.json', JSON.stringify(makeSampleOutcome()));

  const budget = new HistoryScanBudget();
  const result = await traverseHistoryDirectory(root, budget);
  assert.equal(result.candidates.length, 0);
  assert.equal(budget.diagnostics.some((d) => d.code === 'EXECUTION_MISSING'), true);

  const unreadableRoot = new FakeDirectoryHandle(VALID_PROJECT_ID);
  unreadableRoot._throwOnEntries = true;
  const budget2 = new HistoryScanBudget();
  const result2 = await traverseHistoryDirectory(unreadableRoot, budget2);
  assert.equal(result2.candidates.length, 0);
  assert.equal(budget2.diagnostics.some((d) => d.code === 'PROJECT_UNREADABLE'), true);
});
