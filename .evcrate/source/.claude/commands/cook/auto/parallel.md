---
description: "Plan parallel phases & execute with fullstack-developer agents"
argument-hint: "[tasks] [--advice]"
---
**Ultrathink parallel** raw input: <raw-tasks>$ARGUMENTS</raw-tasks>

## Canonical checkpoint routing

When advice mode is active (`explicit` or `inherited`), named checkpoints use the canonical `evcrate-advisor-checkpoint/v2` dispatcher block in `.claude/workflows/advisor-mentoring.md`; this command supplies bounded evidence and does not duplicate route or adapter selection. In `off` mode, named checkpoints and mentoring lifecycle are never invoked.

## Advice Mode

Before discovery or routing, resolve the HOME helper per `.claude/workflows/advice-activation.md` with original `$ARGUMENTS`, canonical `context.command: "cook/auto/parallel"` and the current root. A user-entered command always uses `handoff: null`. A handoff exists only when built by the router delegating this exact call; never reuse or replay one from earlier turns, commands, plans, reports or transcripts.
Preserve known selections from the exact-call router; use `work_target: "cook/auto/parallel"` only when no such target exists, and null plan/phase fields only when unknown.
Set `WORK_ARGUMENTS = result.work_arguments` and `ADVICE_MODE = result.mode`; use the returned work input everywhere below.

Apply neutral `.claude/workflows/plan-progress.md` in every mode. Only resolved `explicit` or `inherited` loads `.claude/workflows/advisor-mentoring.md` and follows its `## Caller lifecycle binding`; `off` keeps ordinary gates and uses only immutable in-repo receipts and sealed-path metadata, never `evcrate-advisor`, hard lifecycle or inference.
Activation failures and repeated blockers follow the shared activation contract; neither history nor a checkpoint activates advice.
The implementation parent owns controller state and finalization; child writers receive exact writable/protected paths and documentation ownership, report terminal artifacts, and never operate state or stage/commit behind the parent.
**IMPORTANT:** Activate needed skills. Ensure token efficiency. Sacrifice grammar for concision.

## Positioning

Use this only when work can be split into independent phases with clear dependencies and file ownership. If ownership, acceptance criteria, or side effects are unclear, run base `/cook` first with `WORK_ARGUMENTS` and structured caller context per `.claude/workflows/advice-activation.md` (no synthetic flag).

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
- For advice-controlled plans, link navigation to `<plan-dir>/progress.md` per `.claude/workflows/plan-progress.md` before capture; old sealed plans remain untouched
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
- Wait for all parallel phases complete before dependent phases. Re-run neutral reconciliation per `.claude/workflows/plan-progress.md` before dispatching dependent phases.
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
- When advice mode is active (`explicit` or `inherited`), after reviewer terminal result and before fixing
  issues or requesting approval, enter the canonical checkpoint dispatcher
  following `## Caller lifecycle binding` in `.claude/workflows/advisor-mentoring.md`:
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
- In `off` mode, use the terminal reviewer findings for ordinary bounded fixes,
  tester validation and user approval; never wait for advisor counsel or invoke
  disposition, outcome, re-consultation or completion. On a second matching
  terminal blocker, use ordinary debugger/user escalation before another attempt.
- Only in `explicit` or `inherited` mode:
  - Wait for terminal `ADVICE_READY`; failed/nonzero/timeout/malformed output leaves
    the review gate incomplete.
  - Follow `## Caller lifecycle binding` for accepted registered corrections,
    truthful validation/outcomes, evidence-only disputes and same-run review.
    A no-change outcome requires zero actual changes, passed declared validation,
    accepted counsel and no must-fix/unresolved items; never invent work.
- In every mode, cap terminal review cycles at three; stop and ask the user at
  the cap without another reviewer/advisor call or a counter reset. Durable
  human gates in activated mode cannot be bypassed by conversational approval.

### 6. Project Management, Documentation & Substantive Finalization
- Whole-phase substantive finalization: planned doc/report/status writes (e.g.
  plan files, docs, roadmap), phase-owned configuration/onboarding, and selected
  Git transitions are part of the substantive phase deliverable.
- User approval or rejection precedes substantive finalization:
  - If rejected or critical issues remain, return to Step 5's mode-specific fix
    route; never finalize or seal rejected work.
  - If approved, finalize only the authorized phase scope.
- In every mode, the parent owns finalization. Child `project-manager` and
  `docs-manager` agents receive exact writable/protected paths and delta
  destinations; they report terminal artifacts and never operate state or stage.
- Only in `explicit` or `inherited` mode, follow `## Caller lifecycle binding`:
  - Before substantive finalization writes or selected Git transitions, register
    one accepted bounded action with declared validation, or resume its existing
    registration. If truly no substantive work remains, use the valid no-change
    branch and skip invented documentation/configuration/index mutations.
  - Settle authorized project-manager/docs-manager work, onboarding and selected
    Git transitions before actual declared validation and the final truthful
    outcome. Preserve the same run and returned revisions.
  - Record the matching outcome, then complete once. Only successful controller
    completion permits durable DONE; abandonment is not successful completion.
  - Publish the immutable outside-baseline receipt and uncaptured overview per
    neutral `.claude/workflows/plan-progress.md`; captured paths/index remain
    immutable. No rejected-fix route or substantive mutations after sealing.
- In `off` mode, use ordinary approved/validated finalization without durable
  disposition, outcome or complete. Run authorized project-manager/docs-manager
  updates in parallel and settle their terminal results before closure. Ordinary
  unprotected plans retain `plan.md` status; protected plans use parent-only
  outside-snapshot receipts explicitly marked `default approval/validation; not
  durable advice completion` and derived progress per neutral `plan-progress.md`.
- Historical protection applies in every mode; never overwrite prior sealed
  plans, evidence, metadata/roadmap or selected index identities.
### 7. Final Report
- Summary of all parallel phases; for advice-controlled plans or preserved snapshots, point output to `<plan-dir>/progress.md`. Normal default plans with no history do not require, read, or output nonexistent progress links.
- Guide to get started
- Postimplementation and commit handling:
  - In `explicit` or `inherited` mode: selected Git transitions and commits were executed
    during pre-outcome finalization in Step 6 prior to sealing. After `complete`
    seals the run, provide readonly guidance only; do not execute git commit/push
    commands or captured-file/selected-index mutations after seal; only bounded
    administrative receipt and progress publication outside baseline is permitted
    per `.claude/workflows/plan-progress.md`.
  - In `off` mode (no active advice mode): explicitly preserve existing default-mode postimplementation
    behavior: ask user if they want to commit to git repository (use `git-manager`
    subagent if yes). Preserve scoped approval and commit behavior; do not execute
    an automatic commit without explicit user confirmation.
**Example:** Phases 1-3 parallel → Launch 3 fullstack-developer agents → Wait → Phase 4 sequential
