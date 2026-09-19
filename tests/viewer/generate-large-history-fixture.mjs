// Seeded deterministic 10,000-consultation history generator.
// Generates records conforming to HistoryRecordV1 within count/byte budgets.

function makeRng(seed = 12345) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

const BACKENDS = ['codex', 'omp', 'claude', 'pi'];
const MODELS = ['gpt-5.6-sol', 'gpt-5.6-terra', 'claude-3-5-sonnet', 'deepseek-coder'];
const EFFORTS = ['high', 'medium', 'low'];
const CHECKPOINTS = ['review:step-4', 'direction:step-2', 'decision:step-1'];

export function generateSeedRecord(index, rng) {
  const pIdx = Math.floor(index / 1000); // 10 projects
  const tIdx = Math.floor((index % 1000) / 100); // 10 tasks per project
  const cIdx = index % 100; // 100 consultations per task

  const projectId = pIdx.toString(16).padStart(2, '0').repeat(32);
  const taskId = `00000000-0000-4000-8000-${pIdx.toString(16).padStart(2, '0')}${tIdx.toString(16).padStart(2, '0')}00000000`;
  const consultId = `00000000-0000-4000-9000-${pIdx.toString(16).padStart(2, '0')}${tIdx.toString(16).padStart(2, '0')}${cIdx.toString(16).padStart(8, '0')}`;

  const backend = BACKENDS[Math.floor(rng() * BACKENDS.length)];
  const model = MODELS[Math.floor(rng() * MODELS.length)];
  const effort = EFFORTS[Math.floor(rng() * EFFORTS.length)];
  const checkpoint = CHECKPOINTS[Math.floor(rng() * CHECKPOINTS.length)];
  const elapsed = 200 + Math.floor(rng() * 3000);
  const start = 1700000000000 + index * 1000;
  const isFailed = rng() < 0.05;

  const execution = {
    schema_version: 1,
    consultation_id: consultId,
    task_run_id: taskId,
    project_id: projectId,
    checkpoint_digest: 'e'.repeat(64),
    checkpoint: {
      protocol: 'evcrate-advisor-checkpoint',
      version: 2,
      task_run_id: taskId,
      checkpoint_id: `chk-${index}`,
      phase_id: 'phase-09',
      task_revision: 1,
      evidence_revision: 0,
      checkpoint,
      kind: 'review',
      question: `Benchmark evaluation consultation #${index}`,
      task: { goal: 'Benchmark', non_goals: [], authorized_paths: ['src/app.ts'] },
      proposal: { next_action: 'Proceed', rationale: 'Pass' },
      evidence: { summary: 'Pass', files: [], validation_results: [] }
    },
    route: { backend, model, effort },
    receipt: { backend, model, effort, controller_version: 2, adapter_version: '0.1.0', build_identity: 'b-09', elapsed_ms: elapsed },
    prompt_identity: 'p-09',
    build_identity: 'b-09',
    attempts: [{ attempt_id: `att-${index}`, slot: 'primary', route: { backend, model, effort }, phase: 'model', model_started: true, elapsed_ms: elapsed, terminal_classification: isFailed ? 'error' : 'success' }],
    status: isFailed ? 'FAILED' : 'ADVICE_READY',
    result: isFailed ? null : { protocol: 'evcrate-advisor-result', version: 2, checkpoint, status: 'ADVICE_READY', recommendation: 'Advice body', rationale: 'Reasoning', must_fix: [], cautions: [] },
    error: isFailed ? { code: 'MODEL_TIMEOUT', message: 'Simulated timeout' } : null,
    started_at: start,
    completed_at: start + elapsed
  };

  const hasOutcome = !isFailed && rng() < 0.8;
  const outcome = hasOutcome ? {
    schema_version: 1,
    consultation_id: consultId,
    task_run_id: taskId,
    project_id: projectId,
    disposition: { action: 'accept', rationale: 'Accepted' },
    evidence_revision: 0,
    actual_changed_paths: ['src/app.ts'],
    validation: { suite: 'perf', command: 'npm test', status: 'passed', passed: 1, failed: 0, details: null },
    outcome: { result: 'resolved' },
    correction_number: 1,
    recorded_at: start + elapsed + 500
  } : null;

  return { projectId, taskId, consultId, execution, outcome };
}

// Injects 10,000 consultations directly into in-browser mock file system.
export async function populateLargeHistoryInBrowser(page, totalCount = 10000, seed = 12345) {
  return page.evaluate(async ({ count, initialSeed }) => {
    let s = initialSeed % 2147483647;
    if (s <= 0) s += 2147483646;
    const rng = () => {
      s = (s * 16807) % 2147483647;
      return (s - 1) / 2147483646;
    };

    const backends = ['codex', 'omp', 'claude', 'pi'];
    const models = ['gpt-5.6-sol', 'gpt-5.6-terra', 'claude-3-5-sonnet', 'deepseek-coder'];
    const efforts = ['high', 'medium', 'low'];
    const checkpoints = ['review:step-4', 'direction:step-2', 'decision:step-1'];

    const root = new window.__MockDirectoryHandle__('large-history-root');

    const taskCheckpoints = new Map();
    for (let p = 0; p < 10; p++) {
      for (let t = 0; t < 10; t++) {
        const tId = `00000000-0000-4000-8000-${p.toString(16).padStart(2, '0')}${t.toString(16).padStart(2, '0')}00000000`;
        const cp = {
          protocol: 'evcrate-advisor-checkpoint',
          version: 2,
          task_run_id: tId,
          checkpoint_id: 'chk-bench',
          phase_id: 'phase-09',
          task_revision: 1,
          evidence_revision: 0,
          checkpoint: 'review:step-4',
          kind: 'review',
          question: 'Benchmark evaluation consultation',
          task: { goal: 'Benchmark', non_goals: [], authorized_paths: ['src/app.ts'], scope_rationale: 'Benchmark scope', invariants: ['Benchmark invariant'], success_criteria: ['All pass'] },
          proposal: { next_action: 'Proceed', rationale: 'Pass', intended_changed_paths: ['src/app.ts'] },
          evidence: { summary: 'Pass', files: [], validation_results: [], artifacts: [] },
          prior: { prior_consultation_id: null, prior_counsel: null, prior_disposition: null, observed_outcome: null }
        };
        const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(cp)));
        const digest = Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
        taskCheckpoints.set(tId, { cp, digest });
      }
    }
    for (let i = 0; i < count; i++) {
      const pIdx = Math.floor(i / 1000);
      const tIdx = Math.floor((i % 1000) / 100);
      const cIdx = i % 100;

      const pId = pIdx.toString(16).padStart(2, '0').repeat(32);
      const tId = `00000000-0000-4000-8000-${pIdx.toString(16).padStart(2, '0')}${tIdx.toString(16).padStart(2, '0')}00000000`;
      const cId = `00000000-0000-4000-9000-${pIdx.toString(16).padStart(2, '0')}${tIdx.toString(16).padStart(2, '0')}${cIdx.toString(16).padStart(8, '0')}`;

      let pDir = root.get(pId);
      if (!pDir) pDir = root.addDirectory(pId);
      let tDir = pDir.get(tId);
      if (!tDir) tDir = pDir.addDirectory(tId);
      const cDir = tDir.addDirectory(cId);

      const backend = backends[Math.floor(rng() * backends.length)];
      const model = models[Math.floor(rng() * models.length)];
      const effort = efforts[Math.floor(rng() * efforts.length)];
      const checkpoint = checkpoints[Math.floor(rng() * checkpoints.length)];
      const elapsed = 200 + Math.floor(rng() * 3000);
      const start = 1700000000000 + i * 1000;
      const isFailed = rng() < 0.05;

      const execution = {
        schema_version: 1,
        consultation_id: cId,
        task_run_id: tId,
        project_id: pId,
        checkpoint_digest: taskCheckpoints.get(tId).digest,
        checkpoint: taskCheckpoints.get(tId).cp,
        route: { backend, model, effort },
        receipt: { backend, model, effort, controller_version: 2, adapter_version: '0.1.0', build_identity: 'b-09', elapsed_ms: elapsed },
        prompt_identity: 'p-09',
        build_identity: 'b-09',
        attempts: [{ attempt_id: `att-${i}`, slot: 'primary', route: { backend, model, effort }, phase: 'model', model_started: true, elapsed_ms: elapsed, terminal_classification: isFailed ? 'transient' : 'success', retry_delay_ms: null, cleanup_outcome: 'confirmed' }],
        status: isFailed ? 'FAILED' : 'ADVICE_READY',
        result: isFailed ? null : { protocol: 'evcrate-advisor-result', version: 2, checkpoint, status: 'ADVICE_READY', recommendation: 'Advice body', rationale: 'Reasoning', must_fix: [], cautions: [], assumptions: [], success_checks: [], unresolved_questions: [] },
        error: isFailed ? { code: 'MODEL_TIMEOUT', message: 'Simulated timeout' } : null,
        started_at: start,
        completed_at: start + elapsed
      };

      cDir.addFile('execution.json', JSON.stringify(execution));

      if (!isFailed && rng() < 0.8) {
        const outcome = {
          schema_version: 1,
          consultation_id: cId,
          task_run_id: tId,
          project_id: pId,
          disposition: { action: 'accept', rationale: 'Accepted' },
          evidence_revision: 0,
          actual_changed_paths: ['src/app.ts'],
          validation: { suite: 'perf', command: 'npm test', status: 'passed', passed: 1, failed: 0, details: null },
          outcome: 'resolved',
          correction_number: 1,
          recorded_at: start + elapsed + 500
        };
        cDir.addFile('outcome.json', JSON.stringify(outcome));
      }
    }

    window.__MOCK_FS__.root = root;
    return { projectCount: 10, totalCount: count };
  }, { count: totalCount, initialSeed: seed });
}
