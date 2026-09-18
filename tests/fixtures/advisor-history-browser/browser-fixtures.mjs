import { FakeDirectoryHandle } from '../../viewer/fake-file-system.mjs';
import {
  createRawExecution,
  createRawOutcome
} from '../advisor-history/history-fixtures.mjs';

export const VALID_PROJECT_ID = 'a'.repeat(64);
export const VALID_PROJECT_ID_2 = 'b'.repeat(64);
export const VALID_TASK_ID = '01234567-89ab-4cde-8f01-23456789abcd';
export const VALID_CONSULTATION_ID = '01234567-89ab-4cde-8f01-23456789ef01';

export function makeSampleExecution(opts = {}) {
  const pId = opts.project_id ?? VALID_PROJECT_ID;
  const tId = opts.task_run_id ?? VALID_TASK_ID;
  const cId = opts.consultation_id ?? VALID_CONSULTATION_ID;

  return createRawExecution({
    project_id: pId,
    task_run_id: tId,
    consultation_id: cId,
    status: opts.status ?? 'ADVICE_READY',
    started_at: opts.started_at ?? 1000,
    completed_at: opts.completed_at ?? 2500,
    receipt: {
      backend: 'codex',
      model: 'gpt-5.6-sol',
      effort: 'high',
      controller_version: 2,
      adapter_version: '0.1.0',
      build_identity: 'build-v2',
      elapsed_ms: 1500
    },
    route: { backend: 'codex', model: 'gpt-5.6-sol', effort: 'high' },
    attempts: [
      {
        attempt_id: '01234567-89ab-4cde-8f01-234567890001',
        slot: 'primary',
        route: { backend: 'codex', model: 'gpt-5.6-sol', effort: 'high' },
        phase: 'model',
        model_started: true,
        elapsed_ms: 1500,
        terminal_classification: 'success',
        retry_delay_ms: null,
        cleanup_outcome: 'confirmed'
      }
    ],
    result: {
      protocol: 'evcrate-advisor-result',
      version: 2,
      checkpoint: 'review:step-4',
      status: 'ADVICE_READY',
      recommendation: 'Valid advice body',
      rationale: 'Reason for advice',
      must_fix: [],
      cautions: [],
      assumptions: [],
      success_checks: [],
      unresolved_questions: []
    },
    error: null,
    ...opts
  });
}

export function makeSampleOutcome(opts = {}) {
  const pId = opts.project_id ?? VALID_PROJECT_ID;
  const tId = opts.task_run_id ?? VALID_TASK_ID;
  const cId = opts.consultation_id ?? VALID_CONSULTATION_ID;

  return createRawOutcome({
    project_id: pId,
    task_run_id: tId,
    consultation_id: cId,
    action: 'accept',
    rationale: 'Accepted counsel',
    outcome: 'resolved',
    correction_number: 1,
    recorded_at: 3000,
    ...opts
  });
}

export function createValidSingleProjectTree(opts = {}) {
  const pId = opts.project_id ?? VALID_PROJECT_ID;
  const tId = opts.task_run_id ?? VALID_TASK_ID;
  const cId = opts.consultation_id ?? VALID_CONSULTATION_ID;

  const root = new FakeDirectoryHandle(pId);
  const taskDir = root.addDirectory(tId);
  const consultDir = taskDir.addDirectory(cId);

  const execData = makeSampleExecution({ project_id: pId, task_run_id: tId, consultation_id: cId, ...opts.execution });
  consultDir.addFile('execution.json', JSON.stringify(execData));

  if (opts.includeOutcome !== false) {
    const outcomeData = makeSampleOutcome({ project_id: pId, task_run_id: tId, consultation_id: cId, ...opts.outcome });
    consultDir.addFile('outcome.json', JSON.stringify(outcomeData));
  }

  return { root, taskDir, consultDir, execData };
}

export function createValidHistoryRootTree() {
  const root = new FakeDirectoryHandle('evcrate-history');
  
  const proj1 = root.addDirectory(VALID_PROJECT_ID);
  const task1 = proj1.addDirectory(VALID_TASK_ID);
  const consult1 = task1.addDirectory(VALID_CONSULTATION_ID);
  consult1.addFile('execution.json', JSON.stringify(makeSampleExecution({ project_id: VALID_PROJECT_ID, task_run_id: VALID_TASK_ID, consultation_id: VALID_CONSULTATION_ID })));
  consult1.addFile('outcome.json', JSON.stringify(makeSampleOutcome({ project_id: VALID_PROJECT_ID, task_run_id: VALID_TASK_ID, consultation_id: VALID_CONSULTATION_ID })));

  const proj2 = root.addDirectory(VALID_PROJECT_ID_2);
  const task2 = proj2.addDirectory(VALID_TASK_ID);
  const consult2 = task2.addDirectory(VALID_CONSULTATION_ID);
  consult2.addFile('execution.json', JSON.stringify(makeSampleExecution({ project_id: VALID_PROJECT_ID_2, task_run_id: VALID_TASK_ID, consultation_id: VALID_CONSULTATION_ID })));

  return root;
}
