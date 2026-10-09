---
description: "Analyze & fix issues with parallel evc-fullstack-developer agents"
argument-hint: "[issues] [--advice]"
---
**Ultrathink parallel** raw input: <raw-issues>$ARGUMENTS</raw-issues>

## Canonical checkpoint routing

Named checkpoints use the canonical `evcrate-advisor-checkpoint/v2` dispatcher block in
`{{evcrate:workflows/advisor-mentoring.md}}` only under explicit or inherited advice mode.
This command supplies bounded evidence and does not duplicate route or adapter selection.

## Advice Mode

Before discovery or routing, resolve the HOME helper per `{{evcrate:workflows/advice-activation.md}}` with original `$ARGUMENTS`, canonical `context.command: "fix/parallel"` and the current root. A user-entered command always uses `handoff: null`. A handoff exists only when built by the router delegating this exact call; never reuse or replay one from earlier turns, commands, plans, reports or transcripts.
Preserve known selections from the exact-call router; use `work_target: "fix/parallel"` only when no such target exists, and null plan/phase fields only when unknown.
Set `WORK_ARGUMENTS = result.work_arguments` and `ADVICE_MODE = result.mode`; use the returned work input everywhere below.

Apply neutral `{{evcrate:workflows/plan-progress.md}}` in every mode. Only resolved `explicit` or `inherited` loads `{{evcrate:workflows/advisor-mentoring.md}}` and follows its `## Caller lifecycle binding`; `off` keeps ordinary gates and uses only immutable in-repo receipts and sealed-path metadata, never `evcrate-advisor`, hard lifecycle or inference.
Activation failures and repeated blockers follow the shared activation contract; neither history nor a checkpoint activates advice.

Under `explicit` or `inherited` advice mode, this command directly coordinates parallel fixes and binds its durable lifecycle to `{{evcrate:workflows/advisor-mentoring.md}}` and `{{evcrate:workflows/plan-progress.md}}`:
1. **Single durable-state owner**: The parent agent owns all state controller
   operations (`init`, `checkpoint`, `disposition`, `outcome`, `complete`).
   Parallel child agents (`evc-fullstack-developer`, `evc-debugger`, `evc-tester`,
   `evc-code-reviewer`, `evc-project-manager`, `evc-docs-manager`) report terminal
   artifacts and actual changed paths within parent-authorized paths; they
   receive strict ownership, writable path, protected path, and delta destination constraints,
   and never operate controller state or stage files behind the parent.
2. **Active run retention & pre-mutation disposition**: If invoked with an active advice run (`task_run_id`,
   phase, state revision, prior counsel/disposition/outcome), retain that run
   identity across parallel fix and review cycles without initializing a new UUID
   or using scope revision as implicit refresh to bypass stale evidence or counters.
   Before first mutating instructions (planning writes or parallel worker implementation),
   inspect active counsel/action. Resume an already-registered action without
   duplicating it; otherwise require current `accept` with registered correction
   (`action_id`, `episode_id`, `validation_command`) within `task.authorized_paths`
   before writers touch files. For disputed guidance without an active action
   (`reject-with-evidence`, `need-evidence`, `reconcile`), collect read-only evidence
   or an explicit resolution while keeping the baseline unchanged, and obtain fresh
   same-run counsel before corrective mutation or a resolved correction outcome
   (never force an invented action or outcome prerequisite). Finish registered work
   and declared validation/truthful outcome before the next reservation.
3. **Baseline freeze & readonly evidence union**: Freeze all baseline paths
   (`authorized_paths` UNION selected `evidence.files` UNION selected `evidence.artifacts`)
   during reservation, inference, disposition, and final outcome -> complete.
   Read-only reference files and artifacts are captured in baseline for verification and
   integrity, never write authority; only `task.authorized_paths` authorize mutations.
4. **Dynamic revision binding**: Never use deterministic hardcoded revision numbers
   or overrides (such as assuming `task_revision: 2` or `expected_revision: 2`). Always
   use actual revisions returned by `state init` or `state get`/`outcome`, and pass
   the exact reserved checkpoint JSON to inference.

**IMPORTANT:** Activate needed skills. Ensure token efficiency. Sacrifice grammar for concision.

## Workflow

### 0. Active-Run Branch & Writer Pre-flight
- Under `off` advice mode, apply neutral progress/protection from immutable in-repo receipts and sealed-path metadata only; never call `evcrate-advisor`, initialize state, adopt a discovered run as continuation, or register actions.
- Under `explicit` or `inherited` advice mode with an active run (`task_run_id`, active phase, state revision, prior counsel/action/disposition):
  - Inspect active counsel and action via `state get`.
  - **Resume existing action**: If an action is already registered (`action_id`, `episode_id`), resume that action without duplicating it; complete its authorized bounded parallel work, run its declared validation (`evc-tester`), and record a truthful matching `state outcome` (with `actual_changed_paths`) before reserving the next checkpoint.
  - **Accepted action registration**: If counsel requires disposition and changes are accepted, record `state disposition` with `action: "accept"`, causal rationale, and canonical `correction: { action_id, episode_id, validation_command }` (note: canonical state disposition payload contains only `consultation_id`, `evidence_revision`, `action`, `rationale`, and `correction`; intended paths belong in checkpoint `proposal.intended_changed_paths` and write authority is bounded by `task.authorized_paths`, not direct disposition fields) BEFORE any writer touches files (such as parallel plan generation or worker code modifications). Then complete authorized work, run declared validation (`evc-tester`), and record a truthful matching `state outcome` before reserving the next checkpoint.
  - **Disputed counsel without active action**: If counsel is disputed (`reject-with-evidence`, `need-evidence`, or `reconcile`), record `state disposition` with that action, causal rationale, and `correction: null`. Do NOT perform corrective writes and do NOT force an invented action or outcome prerequisite. Collect read-only evidence or an explicit resolution while keeping captured baseline paths unchanged, then obtain fresh same-run counsel via checkpoint reservation and controller inference BEFORE any corrective mutation or resolved correction outcome.
  - **Terminal inference failure or no active work**: Do not force an invented action or outcome; keep baseline unchanged and resolve the advice gate before mutation.
- If fresh first review under `explicit` or `inherited` mode (no active run yet): do NOT initialize state at command start just to track discovery, planning, or initial parallel execution.

### 1. Issue Analysis
- Use `evc-debugger` subagent to analyze root causes
- Use `/evc-cmd-scout-x-ext` to find related files
- Categorize issues by scope/area (frontend, backend, auth, payments, etc.)
- Identify dependencies between issues

### 2. Parallel Fix Planning
- In `explicit` or `inherited` advice mode with an active run, ensure plan generation and file ownership boundaries align with an accepted registered correction action within authorized scope (or resumed active action) before mutating plan files. Mutating plan files under disputed or unregistered counsel is forbidden.
- Trigger {{evcrate:commands/evc-cmd-plan-x-parallel}} <detailed-fix-instructions> for parallel-executable fix plan. In `explicit` or `inherited` mode, pass structured pre-run or same-run context without appending synthetic `--advice`.
- Reconcile plans and phase status via `{{evcrate:workflows/plan-progress.md}}` before planning and before each parallel batch. For advice-controlled plans, link navigation to `<plan-dir>/progress.md` before capture; old sealed plans remain untouched.
- Wait for plan with dependency graph, execution strategy, file ownership matrix
- Group independent fixes for parallel execution
- Sequential fixes for dependent issues

### 3. Parallel Fix Implementation
- Read `plan.md` for dependency graph
- Launch multiple `evc-fullstack-developer` agents in PARALLEL for independent fixes
  - Example: "Fix auth + Fix payments + Fix UI" → launch 3 agents simultaneously
  - Pass phase file path: `{plan-dir}/phase-XX-*.md`
  - Include environment info
- Wait for all parallel fixes complete before dependent fixes
- Sequential fixes: launch one agent at a time
- Parallel child tasks report changed file paths and terminal artifacts to
  parent; they must NOT invoke controller operations or mutate git index behind
  parent
### 4. Testing
- Use `evc-tester` subagent for full test suite
- NO fake data/mocks/cheats
- Verify all issues resolved
- If fail: use `evc-debugger`, fix, repeat

### 5. Code Review
- Use `evc-code-reviewer` for all changes
- **Under `off` advice mode**: Wait for reviewer report, verify fixes, revalidate with `evc-tester`, and ask user for approval. On a second consecutive matching terminal blocker without progress, escalate through ordinary debugger/user handling before another attempt; do not invoke a checkpoint.
- **Under `explicit` or `inherited` advice mode**, enter the canonical checkpoint dispatcher at `review:fix-parallel` under `{{evcrate:workflows/advisor-mentoring.md}}`:
  - **Fresh first review (no active run yet)**: Settle all parallel fix
    implementations, test validation, reviewer report, and selected evidence
    artifacts. Enforce a writer barrier (no intervening file edits or Git index
    mutations). `baseline_paths` = `authorized_paths` (writable fix files from
    all parallel phases) UNION selected read-only `evidence.files` (e.g. plan
    file, test reports, review report) UNION selected `evidence.artifacts`.
    Read-only reference files and artifacts are captured for verification but
    MUST NOT be included in `authorized_paths` (readonly evidence union, not
    write authority). Run `state init` immediately before reservation
    (`checkpoint`). Remove numeric overrides; use actual returned revision from
    `init` as `expected_revision` and `task_revision` for the reservation, and
    pass the exact reserved checkpoint JSON directly to inference via the
    central controller. Never initialize at command start just to track
    implementation. Obtain terminal `ADVICE_READY` counsel before fixing,
    approving, or reporting findings.
  - **Existing active run (repeat review cycle)**: Retain same `task_run_id`,
    phase, state revision, and prior counsel. Inspect active counsel and action:
    - If previous counsel was accepted with registered work (or resuming an existing active action): execute authorized bounded corrections across parallel workers within `task.authorized_paths`, run actual declared validation (`evc-tester`), and record a truthful matching `state outcome` (with `actual_changed_paths` and validation status) advancing the baseline. Only then reserve the next review checkpoint using actual returned revisions from `get`/`outcome` and pass the exact reserved checkpoint JSON to inference.
    - If previous counsel was disputed (`reject-with-evidence`, `need-evidence`, `reconcile`) without an active action: collect read-only evidence or an explicit resolution while keeping baseline paths unchanged; do NOT fabricate an action, corrective writes, or baseline-advancing outcome. Reserve the review checkpoint under the same run with fresh evidence/resolution to obtain fresh counsel before any corrective mutations or resolved outcome.
    - Do not duplicate an existing active action or consultation if already registered; finish authorized work once.
  - **Review/advisor cycle cap**: At most three terminal reviewer/advisor cycles.
    At the cap, stop without another reviewer/advisor call or cycle reset and
    ask the user if issues remain. If durable correction exhaustion occurs
    (`correction_count === 3`), the state transitions to `needs_human` and
    requires interactive terminal authorization; conversational approval cannot
    forge completion.
- Verify fixes don't introduce regressions
- If critical findings are accepted in `explicit` or `inherited` advice mode, record
  `state disposition` with `accept` and a registered bounded correction action
  before writes; apply fixes, run its actual declared validation, record the
  matching truthful `state outcome`, then repeat review in the same run within
  the review cap.
- If guidance is disputed in `explicit` or `inherited` advice mode, record
  `reject-with-evidence`, `need-evidence`, or `reconcile`; collect read-only
  evidence or an explicit resolution, then obtain fresh same-run counsel before
  mutating corrections or a resolved correction outcome. Follow the canonical
  disposition lifecycle and review cap; do not imply immediate resolution.
- In `off` mode, if critical issues remain or review is rejected, apply bounded fixes, revalidate with `evc-tester`, and repeat review without controller operations.
### 6. Project Management & Docs
- In `explicit` or `inherited` mode, register the bounded finalization action and declared validation before any Step 6 substantive writes or selected index transitions, or resume the existing registered action. In `off` mode, keep ordinary approval/validation and neutral protection without durable lifecycle.
- If approved: use `evc-project-manager` + `evc-docs-manager` in parallel
- Child agents (`evc-project-manager`, `evc-docs-manager`) are advisory children reporting terminal artifacts and actual changed paths within parent-supplied authorized paths; they never operate controller state or stage behind the parent. Prior sealed paths remain immutable, while current-run registered pre-seal writes within authorized paths remain permitted.
- Update plan files, docs, roadmap for authorized scope
- All substantive documentation, plan status, and report writes are substantive
  finalization mutations and must settle BEFORE final outcome and completion
### 7. Final Report and Completion
- In `off` mode, skip the registered-action/no-change/durable-completion branches below and retain ordinary approved/validated completion plus neutral administrative reporting.
- Those durable branches apply only in `explicit` or `inherited` mode under `## Caller lifecycle binding`.
- **Distinguish no-change closure from registered bounded finalization**:
  - **No-change outcome**: Requires 0 actual changed paths (`actual_changed_paths: []`),
    passed declared validation, `accept` disposition, and no `must_fix` or
    `unresolved_questions` in counsel; cautions/assumptions alone do not require
    invented edits or index mutations.
  - **Registered bounded finalization action**: All substantive doc/report/plan
    writes (Step 6) OR selected Git index transitions (staging or committing
    selected captured paths) change baseline content or index identities and
    MUST settle BEFORE final outcome and completion as part of a registered
    bounded action with matching validation and a truthful `state outcome`
    advancing the baseline.
- **Durable completion**: Call `state complete` (with `expected_revision`) only
  after the final truthful outcome settles the baseline. Do NOT mark durable
  phase complete or claim DONE prematurely in captured files before `state
  complete` succeeds (controller abandonment sets `gate_status: completed` but
  is never successful completion; completion requires a matching resolved outcome).
  After successful completion, parent writes mandatory immutable completion receipts
  outside the captured baseline snapshot and updates the derived live overview `<plan-dir>/progress.md`
  (uncaptured, outside baseline; never captured or cited as evidence/authorized
  substantive paths; if already captured, cannot overwrite progress, surface blocker)
  per shared receipt rules in `{{evcrate:workflows/plan-progress.md}}`.
  Preserved historical snapshot protection applies across runs even without `--advice`; prior sealed paths remain immutable, while current-run registered pre-seal writes within parent-authorized paths remain permitted. Never direct edits to sealed plans or metadata/roadmap after seal.
- **Sealed baseline**: Do NOT stage, commit, or mutate captured baseline files
  or their Git index state after `state complete` seals the run; only bounded administrative receipt and progress publication outside baseline is permitted per `{{evcrate:workflows/plan-progress.md}}`.
- **Administrative reporting**: Report summary of all fixes from parallel phases and verification status per issue. In `off` mode, if executing in an advice-controlled plan with prior historical advice phases, save an uncaptured immutable phase receipt explicitly marked `default approval/validation; not durable advice completion` and update `progress.md` per `{{evcrate:workflows/plan-progress.md}}`. For advice-controlled plans or preserved snapshots, point output to `<plan-dir>/progress.md`; old sealed `plan.md` remains untouched. Normal default plans with no advice history do not require, read, or output nonexistent progress links. Any optional post-completion administrative receipt must be strictly OUTSIDE the captured baseline snapshot, identify the approved snapshot, and cannot claim unreviewed edits.
**Example:** Fix 1 (auth) + Fix 2 (payments) + Fix 3 (UI) → Launch 3 evc-fullstack-developer agents → Wait → Fix 4 (integration) sequential
