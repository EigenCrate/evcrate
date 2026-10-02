---
name: cmd_cook_auto_parallel
description: Plan parallel phases & execute with fullstack-developer agents
---
# cmd_cook_auto_parallel

Command Path: /cook/auto/parallel

Description: Plan parallel phases & execute with fullstack-developer agents

---
description: "Plan parallel phases & execute with fullstack-developer agents"
argument-hint: "[tasks] [--advice]"
---
**Ultrathink parallel** raw input: <raw-tasks>$ARGUMENTS</raw-tasks>

## Canonical checkpoint routing

Named checkpoints use the canonical `evcrate-advisor-checkpoint/v2` dispatcher block in
`.antigravity/workflows/advisor-mentoring.md` if present; otherwise read `~/.gemini/config/workflows/advisor-mentoring.md` (the published install); this command supplies bounded evidence
and does not duplicate route or adapter selection.

## Advice Mode

A final standalone `--advice` activates explicit review mentoring.
Before planning, read `.antigravity/workflows/advisor-mentoring.md` if present; otherwise read `~/.gemini/config/workflows/advisor-mentoring.md` (the published install) (specifically
`## Argument mode` and `## Caller lifecycle binding`) and derive `WORK_ARGUMENTS`
plus explicit/default advice mode. Use `WORK_ARGUMENTS` as the tasks input.
Apply the shared default stuck-escalation contract.

**Effective advice lifecycle**: The advice lifecycle is active if explicit `--advice` was provided, OR an applicable active advisor run context is present, OR a named checkpoint is invoked. When active, all operational branches follow the advice lifecycle (durable task-state machine, registered work, review gate, phase reconciliation per `## Caller lifecycle binding` in `.antigravity/workflows/advisor-mentoring.md` if present; otherwise read `~/.gemini/config/workflows/advisor-mentoring.md` (the published install)); default branches apply ONLY when no advice lifecycle is active. The argument routing token (`--advice`) passed to sub-commands or handoffs remains explicit-only (forwarded only when explicit `--advice` was provided).
If an active advisor run context is already present from an earlier named
checkpoint (such as a direction, decision, or stuck checkpoint in this session),
retain its identity and context: `task_run_id`, active phase, project root,
current state revision, prior consultation, counsel, disposition, and outcome.
Never initialize a new UUID or create redundant consultations. If entering with an
active run, inspect active counsel and action before first mutating instructions:
resume an already-registered action without duplicating it; otherwise require
current `accept` with registered correction (`action_id`, `episode_id`,
`validation_command`) within `task.authorized_paths` before writers touch files.
For disputed guidance without an active action (`reject-with-evidence`,
`need-evidence`, `reconcile`), collect read-only evidence or an explicit
resolution while keeping the baseline unchanged, and obtain fresh same-run
counsel before corrective mutation or a resolved correction outcome (never force
an invented action or outcome prerequisite). Finish registered work and declared
validation/truthful outcome before the next reservation. If no prior advice
checkpoint exists, this command remains stateless until implementation,
validation, and reviewer evidence settle: never initialize state at command start
just to track planning or early implementation.
For every fallback handoff, pass `WORK_ARGUMENTS`, preserve any active run
context, append exactly one trailing `--advice` in explicit mode, and otherwise
pass no `--advice` token.
**IMPORTANT:** Activate needed skills. Ensure token efficiency. Sacrifice grammar for concision.

## Positioning

Use this only when work can be split into independent phases with clear dependencies and file ownership. If ownership, acceptance criteria, or side effects are unclear, run base `/cook` first with `WORK_ARGUMENTS` and preserve the same explicit advice mode exactly once.

## Workflow

### 1. Preflight & Research
- Scout codebase with `/scout:ext` before planning
- Define output, acceptance criteria, scope boundary, side-effect risks, and testing strategy
- Use max 2 `researcher` agents in parallel if tasks complex
- Keep reports ≤150 lines

### 2. Parallel Planning
- Trigger `/plan:parallel <detailed-instruction>`
- Wait for plan with:
  - dependency graph
  - execution strategy
  - file ownership matrix
  - side-effect review checklist
  - per-phase success criteria
- For advice-controlled plans, link navigation to `<plan-dir>/progress.md` before capture; old sealed plans remain untouched
- Do not proceed if any parallel phase has overlapping file ownership

### 3. Parallel Implementation
- Parent orchestrator is the sole durable-state owner. Child agents never operate
  controller state or stage files behind the parent; they return terminal
  artifacts and actual changed paths.
- Read `plan.md` for dependency graph
- Launch multiple `fullstack-developer` agents in PARALLEL for concurrent phases
  - Example: "Phases 1-3 parallel" → launch 3 agents simultaneously
  - Pass phase file path: `{plan-dir}/phase-XX-*.md`
  - Include environment info
- Wait for all parallel phases complete before dependent phases
- Sequential phases: launch one agent at a time
- Writer barrier: wait for all parallel agents to complete and settle their file
  edits and terminal artifacts before validation and review capture.

### 4. Testing
- Use `tester` subagent for full test suite
- NO fake data/mocks/cheats
- Must pass actual declared validation. If fail: use `debugger`, fix, repeat
  until 100% passing.

### 5. Code Review & Advice Gate ⏸ BLOCKING GATE
- Use `code-reviewer` for all changes; wait for terminal reviewer report.
- Settle reviewer report and terminal artifacts before checkpoint reservation.
- Under advice lifecycle (explicit `--advice`, active run, or named checkpoint), after reviewer terminal result and before fixing
  issues or requesting approval, enter the canonical checkpoint dispatcher
  following `## Caller lifecycle binding` in `.antigravity/workflows/advisor-mentoring.md` if present; otherwise read `~/.gemini/config/workflows/advisor-mentoring.md` (the published install):
  - **Fresh first review with no active run**:
    - Implementation, actual validation, reviewer report, and selected artifacts
      settle first.
    - Enforce the writer barrier: all file writes and terminal artifacts must
      settle before initialization.
    - Set `baseline_paths = authorized writable paths UNION selected evidence.files/artifacts`
      (read-only references are captured for freshness verification without
      granting write authority).
    - Call `init` immediately before reservation, with no intervening captured
      path or git index mutations.
    - Reserve checkpoint at `review:parallel-implementation` with bounded evidence.
  - **Existing active direction/decision/stuck run (repeat review cycle)**:
    - Retain `task_run_id`, active phase, project root, current state revision,
      and prior consultation/counsel/disposition/outcome.
    - Inspect active counsel and action:
      * If prior counsel was accepted with registered work (or resuming an existing active action): execute authorized bounded work within authorized scope, run actual declared validation (`tester`), and record a truthful matching `state outcome` (with `actual_changed_paths` and validation status) advancing the baseline BEFORE the review reservation.
      * If prior counsel was disputed (`reject-with-evidence`, `need-evidence`, `reconcile`) without an active action: collect read-only evidence or an explicit resolution while keeping captured baseline paths unchanged; do NOT fabricate an action, corrective writes, or baseline-advancing outcome. Reserve the review checkpoint under the same run with fresh evidence/resolution to obtain fresh counsel before any corrective mutations or resolved outcome.
      * Do not duplicate an existing active action or consultation if already registered; finish authorized work once.
    - Never initialize a new UUID to bypass stale evidence or counters.
    - Reserve review checkpoint under the same run using actual returned revisions and pass the exact reserved checkpoint JSON to inference.
- Wait for terminal `ADVICE_READY`. Any `FAILED` envelope, nonzero exit, timeout,
  or malformed JSON leaves the review gate incomplete.
- Review/advisor cycle cap: at most three terminal reviewer/advisor cycles. At
  the cap, stop without another reviewer/advisor call or cycle reset and ask the
  user if issues remain.
- Fix cycles:
  - For bounded corrections (critical review issues or accepted counsel): record
    canonical owner disposition `accept`, perform bounded fixes within authorized scope,
    re-run `tester`, record truthful outcome with actual changed paths advancing baseline,
    and re-enter review checkpoint under same run.
  - For disputed guidance: record supported canonical disposition `reject-with-evidence`
    (record causal rationale and evidence), `need-evidence` (missing facts identified; collect
    evidence and re-consult), or `reconcile` (resolve contradictory findings or boundary
    mismatches), following the existing followup lifecycle (fresh consultation before a
    resolved outcome can complete the gate). Never use unsupported dispositions (such as
    `modify`) or schema extensions.
  - No-change outcome: requires no actual changed paths, passed declared validation,
    `accept` disposition, and NO `must_fix` or `unresolved_questions`. Cautions and
    assumptions alone do not require invented edits.

### 6. Project Management, Documentation & Substantive Finalization
- Whole-phase substantive finalization: planned doc/report/status writes (e.g.
  plan files, docs, roadmap), phase-owned configuration/onboarding, and selected
  Git transitions are part of the substantive phase deliverable.
- Approval/rejection gate: User approval or rejection must occur before finalization outcome and sealing:
  - If rejected or critical issues remain: fix and repeat under the active run before recording final outcome or sealing.
  - If approved: proceed with whole-phase substantive finalization.
- Parent is the implementation owner and owns all durable state operations per `## Caller lifecycle binding` and `Plan progress and phase reconciliation` in `.antigravity/workflows/advisor-mentoring.md` if present; otherwise read `~/.gemini/config/workflows/advisor-mentoring.md` (the published install):
  - Under advice lifecycle: parent records `state disposition` for finalization
    (`action: "accept"` with canonical `correction: { action_id, episode_id, validation_command }`)
    before executing finalization writes or Git transitions.
  - Child agents (`project-manager`, `docs-manager`) are advisory children and do not invoke controller operations.
  - Use `project-manager` + `docs-manager` in parallel to update plan files, docs, and roadmap for authorized scope.
  - Settle all planned updates, phase-owned configuration/onboarding, and terminal
    artifacts before recording the final outcome.
  - Parallel commit (under advice lifecycle): clarify commit preference and execute
    selected Git decisions/transitions via `git-manager` BEFORE final validation,
    outcome, and completion. Staging and commit transitions must settle before
    recording the outcome.
  - Run declared validation (`tester`) after all finalization changes and Git transitions.
  - Parent records the final truthful `state outcome` reporting actual changed paths
    (including any git index/status updates) and passed validation, advancing the baseline.
  - Call `complete` to seal the durable run. The durable controller completion
    receipt is authoritative; only then is the phase durably DONE (controller abandonment sets `gate_status: completed` but is never successful completion; completion requires a matching resolved outcome).
  - Do not mark durable phase DONE prematurely or mutate captured evidence after
    complete. Do NOT prescribe copying DONE into captured files after sealing.
  - After `complete` seals the run, parent writes mandatory immutable completion receipts
    outside the captured snapshot and updates the live overview `<plan-dir>/progress.md`
    (uncaptured, outside baseline; never captured or cited as evidence/authorized substantive paths;
    if already captured, cannot overwrite progress, surface blocker) per `Plan progress and phase reconciliation`
    in `.antigravity/workflows/advisor-mentoring.md` if present; otherwise read `~/.gemini/config/workflows/advisor-mentoring.md` (the published install).
  - Preserved historical snapshot protection applies across runs even without `--advice`; prior sealed paths remain immutable, while current-run registered pre-seal writes within parent-authorized paths remain permitted. Never direct edits to sealed plans or metadata/roadmap after seal.
  - In default mode on mixed plans with prior advice phases: save an uncaptured immutable phase receipt explicitly marked `default approval/validation; not durable advice completion` and update `progress.md` per `Plan progress and phase reconciliation` in `.antigravity/workflows/advisor-mentoring.md` if present; otherwise read `~/.gemini/config/workflows/advisor-mentoring.md` (the published install); normal unprotected default plans keep normal `plan.md` status updates.
  - After sealing, there is NO rejected-fix path: approval/rejection occurred before seal; afterwards emit readonly guidance and output pointing to `progress.md`.
### 7. Final Report
- Summary of all parallel phases; for advice-controlled plans or preserved snapshots, point output to `<plan-dir>/progress.md`. Normal default plans with no history do not require, read, or output nonexistent progress links.
- Guide to get started
- Postimplementation and commit handling:
  - Under advice lifecycle: selected Git transitions and commits were executed
    during pre-outcome finalization in Step 6 prior to sealing. After `complete`
    seals the run, provide readonly guidance only; do not execute git commit/push
    commands or captured-file/selected-index mutations after seal; only bounded
    administrative receipt and progress publication outside baseline is permitted
    per `Plan progress and phase reconciliation` in `.antigravity/workflows/advisor-mentoring.md` if present; otherwise read `~/.gemini/config/workflows/advisor-mentoring.md` (the published install).
  - In default mode (no active advice lifecycle): explicitly preserve existing default-mode postimplementation
    behavior: ask user if they want to commit to git repository (use `git-manager`
    subagent if yes). Preserve scoped approval and commit behavior; do not execute
    an automatic commit without explicit user confirmation.
**Example:** Phases 1-3 parallel → Launch 3 fullstack-developer agents → Wait → Phase 4 sequential
