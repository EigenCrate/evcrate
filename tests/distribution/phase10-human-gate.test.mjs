import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { setupTestEnvironment, defaultPolicyV2 } from './phase10-test-helpers.mjs';

test('SCENARIO 2.4: Three failed corrections trigger human gate and block fourth remediation', (t) => {
  const env = setupTestEnvironment('evcrate-p10-gate-');
  t.after(env.cleanup);
  env.writePolicy(defaultPolicyV2());
  env.setFakeCodexState({
    finalCount: 0, calls: [],
    returnJson: JSON.stringify({
      recommendation: 'Try next remediation', rationale: 'Subtle defect',
      must_fix: [], cautions: [], assumptions: [], success_checks: ['npm test'], unresolved_questions: []
    })
  });
  const taskRunId = randomUUID();
  const task = {
    goal: 'Test 3 failed cycles', non_goals: [], authorized_paths: ['source.txt'],
    scope_rationale: 'Fix defect', invariants: ['Preserve user baseline'], success_criteria: ['npm test passes']
  };

  let state = env.invoke(['state', 'init'], {
    protocol: 'evcrate-advisor-state', version: 1, operation: 'init',
    task_run_id: taskRunId, operation_id: randomUUID(), expected_revision: 0,
    payload: { phase_id: 'phase-10', task, baseline_paths: ['source.txt'] }
  }).json.state;

  const episodeId = 'episode-remediation-1';
  for (let cycle = 1; cycle <= 3; cycle++) {
    const checkpoint = {
      protocol: 'evcrate-advisor-checkpoint', version: 2,
      task_run_id: taskRunId, checkpoint_id: `chk-cycle-${cycle}`, phase_id: 'phase-10',
      task_revision: state.task_revision, evidence_revision: state.evidence_revision,
      checkpoint: `stuck:step-fail-${cycle}`, kind: 'stuck', question: `Fix attempt ${cycle}`,
      task, proposal: { next_action: `Attempt ${cycle}`, rationale: 'Retry fix', intended_changed_paths: ['source.txt'] },
      evidence: {
        summary: `Cycle ${cycle} failure`, files: [],
        validation_results: [{ suite: 'test', command: 'npm test', status: 'failed', passed: 0, failed: 1, details: 'fail' }],
        artifacts: []
      },
      prior: { prior_consultation_id: state.last_consultation_id, prior_counsel: null, prior_disposition: null, observed_outcome: null }
    };

    const reserveRes = env.invoke(['state', 'checkpoint'], {
      protocol: 'evcrate-advisor-state', version: 1, operation: 'checkpoint',
      task_run_id: taskRunId, operation_id: randomUUID(), expected_revision: state.task_revision,
      payload: { checkpoint }
    });
    const consultationId = reserveRes.json.consultation_id;
    const ctrlRes = env.invoke([], checkpoint);
    assert.equal(ctrlRes.status, 0);

    state = env.invoke(['state', 'get'], {
      protocol: 'evcrate-advisor-state', version: 1, operation: 'get',
      task_run_id: taskRunId, operation_id: null, expected_revision: null, payload: {}
    }).json.state;

    const actionId = randomUUID();
    const dispRes = env.invoke(['state', 'disposition'], {
      protocol: 'evcrate-advisor-state', version: 1, operation: 'disposition',
      task_run_id: taskRunId, operation_id: randomUUID(), expected_revision: state.task_revision,
      payload: {
        consultation_id: consultationId, evidence_revision: state.evidence_revision, action: 'accept',
        rationale: `Accepted fix attempt ${cycle}`,
        correction: { action_id: actionId, episode_id: episodeId, validation_command: 'npm test' }
      }
    });
    state = dispRes.json.state;

    writeFileSync(join(env.cwd, 'source.txt'), `content after attempt ${cycle}\n`);

    const outcomeRes = env.invoke(['state', 'outcome'], {
      protocol: 'evcrate-advisor-state', version: 1, operation: 'outcome',
      task_run_id: taskRunId, operation_id: randomUUID(), expected_revision: state.task_revision,
      payload: {
        consultation_id: consultationId, action_id: actionId, episode_id: episodeId, result: 'unresolved',
        validation: { suite: 'test', command: 'npm test', status: 'failed', passed: 0, failed: 1, details: 'test failed' },
        actual_changed_paths: ['source.txt']
      }
    });
    state = outcomeRes.json.state;
  }

  assert.equal(state.correction_count, 3);
  assert.equal(state.gate_status, 'needs_human');

  // Fourth consultation is allowed per design-contracts.md:176 (consultation != remediation)
  const checkpoint4 = {
    protocol: 'evcrate-advisor-checkpoint', version: 2,
    task_run_id: taskRunId, checkpoint_id: 'chk-cycle-4', phase_id: 'phase-10',
    task_revision: state.task_revision, evidence_revision: state.evidence_revision,
    checkpoint: 'stuck:step-fail-4', kind: 'stuck', question: 'Attempt 4 direction check',
    task, proposal: { next_action: 'Check direction', rationale: 'Check counsel', intended_changed_paths: ['source.txt'] },
    evidence: { summary: 'Cycle 4', files: [], validation_results: [{ suite: 'test', command: 'npm test', status: 'failed', passed: 0, failed: 1, details: 'f' }], artifacts: [] },
    prior: { prior_consultation_id: state.last_consultation_id, prior_counsel: null, prior_disposition: null, observed_outcome: null }
  };
  const reserve4 = env.invoke(['state', 'checkpoint'], {
    protocol: 'evcrate-advisor-state', version: 1, operation: 'checkpoint',
    task_run_id: taskRunId, operation_id: randomUUID(), expected_revision: state.task_revision,
    payload: { checkpoint: checkpoint4 }
  });
  assert.equal(reserve4.status, 0);
  const consult4 = reserve4.json.consultation_id;

  const ctrl4 = env.invoke([], checkpoint4);
  assert.equal(ctrl4.status, 0);

  state = env.invoke(['state', 'get'], {
    protocol: 'evcrate-advisor-state', version: 1, operation: 'get',
    task_run_id: taskRunId, operation_id: null, expected_revision: null, payload: {}
  }).json.state;

  // But attempting fourth correction disposition without human decision is blocked!
  const blockedDisp = env.invoke(['state', 'disposition'], {
    protocol: 'evcrate-advisor-state', version: 1, operation: 'disposition',
    task_run_id: taskRunId, operation_id: randomUUID(), expected_revision: state.task_revision,
    payload: {
      consultation_id: consult4, evidence_revision: state.evidence_revision, action: 'accept',
      rationale: 'Fourth attempt fix',
      correction: { action_id: randomUUID(), episode_id: episodeId, validation_command: 'npm test' }
    }
  });
  assert.notEqual(blockedDisp.status, 0);
  assert.equal(blockedDisp.json?.error?.code, 'STATE_GATE_BLOCKED');
});
