/**
 * @file workspace-panel-fixtures.mjs
 * Sanitized test fixtures and deterministic expectations for Workspace-integrated Advisor panel (Phase 00).
 *
 * Implements A/B/U/Worktree project topologies, unmapped dirty-history shapes,
 * malformed JSON, and ID mismatch test cases.
 * Contract review: Phase 02 assertions verify unmapped U discovery, project-bound isolation, and v1/v2 compatibility.
 */

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { makeCheckpoint, computeDigest } from './history-fixtures.mjs';

export const PATH_PROJECT_A = '/workspace/projects/project-a';
export const ID_PROJECT_A = createHash('sha256').update(PATH_PROJECT_A, 'utf8').digest('hex');
export const LABEL_PROJECT_A = 'Project Alpha';

export const PATH_WORKTREE_A = '/workspace/projects/project-a/worktrees/wt-fix';
export const ID_WORKTREE_A = createHash('sha256').update(PATH_WORKTREE_A, 'utf8').digest('hex');
export const LABEL_WORKTREE_A = null; // Separate worktree without explicit sidecar label

export const PATH_PROJECT_B = '/workspace/projects/project-b';
export const ID_PROJECT_B = createHash('sha256').update(PATH_PROJECT_B, 'utf8').digest('hex');
export const LABEL_PROJECT_B = 'Project Beta';

export const PATH_PROJECT_U = '/workspace/unmapped-repo';
export const ID_PROJECT_U = createHash('sha256').update(PATH_PROJECT_U, 'utf8').digest('hex');
export const LABEL_PROJECT_U = null; // Unmapped dirty-history: no registration, no sidecar label

export const ID_PROJECT_MALFORMED = 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff0001';
export const ID_PROJECT_MISMATCH = 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff0002';

export const FIXTURE_TASK_A1 = 'a0000000-0000-4000-8000-000000000001';
export const FIXTURE_CONSULT_A1_1 = 'a0000000-0000-4000-8000-000000000002';

export const FIXTURE_TASK_A2 = 'a0000000-0000-4000-8000-000000000003';
export const FIXTURE_CONSULT_A2_1 = 'a0000000-0000-4000-8000-000000000004';
export const FIXTURE_CONSULT_A2_2 = 'a0000000-0000-4000-8000-000000000005';

export const FIXTURE_TASK_A_WT1 = 'a1000000-0000-4000-8000-000000000001';
export const FIXTURE_CONSULT_A_WT1_1 = 'a1000000-0000-4000-8000-000000000002';

export const FIXTURE_TASK_B1 = 'b0000000-0000-4000-8000-000000000001';
export const FIXTURE_CONSULT_B1_1 = 'b0000000-0000-4000-8000-000000000002';
export const FIXTURE_CONSULT_B1_2 = 'b0000000-0000-4000-8000-000000000003';

export const FIXTURE_TASK_U1 = 'c0000000-0000-4000-8000-000000000001';
export const FIXTURE_CONSULT_U1_1 = 'c0000000-0000-4000-8000-000000000002';

export const FIXTURE_TASK_MALFORMED = 'f0000000-0000-4000-8000-000000000001';
export const FIXTURE_CONSULT_MALFORMED = 'f0000000-0000-4000-8000-000000000002';

export const FIXTURE_TASK_MISMATCH = 'f0000000-0000-4000-8000-000000000003';
export const FIXTURE_CONSULT_MISMATCH = 'f0000000-0000-4000-8000-000000000004';

export const EXPECTED_METRICS = Object.freeze({
  total_projects_discovered: 6, // A, A_wt, B, U, MALFORMED, MISMATCH
  total_accepted_records: 7, // A (3) + A_wt (1) + B (2) + U (1)
  total_invalid_records: 2, // MALFORMED + MISMATCH
  counts_by_project: Object.freeze({
    [ID_PROJECT_A]: 3,
    [ID_WORKTREE_A]: 1,
    [ID_PROJECT_B]: 2,
    [ID_PROJECT_U]: 1,
    [ID_PROJECT_MALFORMED]: 0,
    [ID_PROJECT_MISMATCH]: 0
  }),
  labels: Object.freeze({
    [ID_PROJECT_A]: LABEL_PROJECT_A,
    [ID_WORKTREE_A]: null,
    [ID_PROJECT_B]: LABEL_PROJECT_B,
    [ID_PROJECT_U]: null
  })
});

export function createRecordFiles(baseDir, projectId, taskRunId, consultId, timestamp, resultKind = 'ACCEPT') {
  const consultDir = path.join(baseDir, projectId, taskRunId, consultId);
  fs.mkdirSync(consultDir, { recursive: true, mode: 0o700 });
  const cp = makeCheckpoint(taskRunId, `chk-${consultId.slice(0, 8)}`);
  const digest = computeDigest(cp);
  const execution = {
    schema_version: 1, consultation_id: consultId, task_run_id: taskRunId, project_id: projectId,
    checkpoint_digest: digest, checkpoint: cp,
    route: { backend: 'codex', model: 'operator-selected', effort: 'high' },
    receipt: {
      backend: 'codex', model: 'operator-selected', effort: 'high',
      controller_version: 2, adapter_version: '1.0.0', build_identity: 'build-v2', elapsed_ms: 1000
    },
    prompt_identity: 'prompt-v2', build_identity: 'build-v2', attempts: [], status: 'ADVICE_READY',
    result: {
      protocol: 'evcrate-advisor-result', version: 2, checkpoint: cp.checkpoint, status: 'ADVICE_READY',
      recommendation: resultKind === 'ACCEPT' ? 'accept' : 'caution', rationale: 'Verified safe direction',
      must_fix: [], cautions: [], assumptions: [], success_checks: [], unresolved_questions: []
    },
    error: null, started_at: timestamp, completed_at: timestamp + 500
  };
  const outcome = {
    schema_version: 1, consultation_id: consultId, task_run_id: taskRunId, project_id: projectId,
    disposition: { action: 'accept', rationale: 'Counsel verified safe' },
    evidence_revision: 0, actual_changed_paths: [],
    validation: { suite: 'smoke', command: 'npm test', status: 'passed', passed: 1, failed: 0, details: null },
    outcome: 'resolved', correction_number: 1, recorded_at: timestamp + 1000
  };
  fs.writeFileSync(path.join(consultDir, 'execution.json'), JSON.stringify(execution, null, 2), 'utf8');
  fs.writeFileSync(path.join(consultDir, 'outcome.json'), JSON.stringify(outcome, null, 2), 'utf8');
}

/**
 * Populates a complete history root with sanitized A/B/U/Worktree, malformed, and mismatch fixtures.
 *
 * @param {string} rootPath Absolute directory path for the history root
 */
export function populateWorkspacePanelFixtureRoot(rootPath, overrides = {}) {
  const idA = overrides.idProjectA || ID_PROJECT_A;
  const idWtA = overrides.idWorktreeA || ID_WORKTREE_A;
  const idB = overrides.idProjectB || ID_PROJECT_B;
  const idU = overrides.idProjectU || ID_PROJECT_U;
  const labelA = overrides.labelProjectA !== undefined ? overrides.labelProjectA : LABEL_PROJECT_A;
  const labelB = overrides.labelProjectB !== undefined ? overrides.labelProjectB : LABEL_PROJECT_B;

  // 1. Root metadata sidecar registering Project A and Project B only (NOT U and NOT worktree)
  const rootMetadata = {
    version: 1,
    projects: {
      [idA]: { name: labelA },
      [idB]: { name: labelB }
    }
  };
  fs.writeFileSync(path.join(rootPath, 'project-metadata.json'), JSON.stringify(rootMetadata, null, 2), 'utf8');

  // 2. Project A records (3 consultations across 2 tasks)
  createRecordFiles(rootPath, idA, FIXTURE_TASK_A1, FIXTURE_CONSULT_A1_1, 1000);
  createRecordFiles(rootPath, idA, FIXTURE_TASK_A2, FIXTURE_CONSULT_A2_1, 2000);
  createRecordFiles(rootPath, idA, FIXTURE_TASK_A2, FIXTURE_CONSULT_A2_2, 3000);

  // 3. Worktree under Project A (1 consultation, 1 task; distinct SHA256)
  createRecordFiles(rootPath, idWtA, FIXTURE_TASK_A_WT1, FIXTURE_CONSULT_A_WT1_1, 4000);

  // 4. Project B records (2 consultations across 1 task)
  createRecordFiles(rootPath, idB, FIXTURE_TASK_B1, FIXTURE_CONSULT_B1_1, 5000);
  createRecordFiles(rootPath, idB, FIXTURE_TASK_B1, FIXTURE_CONSULT_B1_2, 6000);

  // 5. Unmapped Project U (1 consultation, 1 task; valid ID, NO sidecar label, not registered)
  createRecordFiles(rootPath, idU, FIXTURE_TASK_U1, FIXTURE_CONSULT_U1_1, 7000);

  // 6. Malformed JSON fixture (corrupted execution.json)
  const malformedDir = path.join(rootPath, ID_PROJECT_MALFORMED, FIXTURE_TASK_MALFORMED, FIXTURE_CONSULT_MALFORMED);
  fs.mkdirSync(malformedDir, { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(malformedDir, 'execution.json'), '{"schema_version": 1, "unclosed_json": ...', 'utf8');

  // 7. ID mismatch fixture (execution.json claims idA, but folder is ID_PROJECT_MISMATCH)
  const mismatchDir = path.join(rootPath, ID_PROJECT_MISMATCH, FIXTURE_TASK_MISMATCH, FIXTURE_CONSULT_MISMATCH);
  fs.mkdirSync(mismatchDir, { recursive: true, mode: 0o700 });
  const mismatchCp = makeCheckpoint(FIXTURE_TASK_MISMATCH, 'chk-mis');
  const mismatchExec = {
    schema_version: 1,
    consultation_id: FIXTURE_CONSULT_MISMATCH,
    task_run_id: FIXTURE_TASK_MISMATCH,
    project_id: idA, // Mismatch with enclosing directory ID_PROJECT_MISMATCH!
    checkpoint_digest: computeDigest(mismatchCp),
    checkpoint: mismatchCp,
    route: { backend: 'codex', model: 'operator-selected', effort: 'high' },
    receipt: {
      backend: 'codex', model: 'operator-selected', effort: 'high',
      controller_version: 2, adapter_version: '1.0.0', build_identity: 'build-v2', elapsed_ms: 1000
    },
    prompt_identity: 'prompt-v2',
    build_identity: 'build-v2',
    attempts: [],
    status: 'ADVICE_READY',
    result: {
      protocol: 'evcrate-advisor-result', version: 2, checkpoint: mismatchCp.checkpoint, status: 'ADVICE_READY',
      recommendation: 'accept', rationale: 'Mismatch test',
      must_fix: [], cautions: [], assumptions: [], success_checks: [], unresolved_questions: []
    },
    error: null,
    started_at: 8000,
    completed_at: 8500
  };
  fs.writeFileSync(path.join(mismatchDir, 'execution.json'), JSON.stringify(mismatchExec, null, 2), 'utf8');
}
