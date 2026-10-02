---
name: "evcrate-cmd-code-parallel"
description: "Execute parallel or sequential phases based on plan structure"
argument-hint: "[plan-path] [--advice]"
user-invocable: true
disable-model-invocation: true
---

## Invocation contract

The literal `$ARGUMENTS` is the exact raw text following `/evcrate-cmd-code-parallel`. Do not split, normalize, or discard it before the canonical command parses it.

Before executing this command, read these EVCrate workflow assets:
- `@evcrate/workflows/advisor-mentoring.md`
- `@evcrate/workflows/advisory-interview.md`
- `@evcrate/workflows/development-rules.md`
- `@evcrate/workflows/documentation-management.md`
- `@evcrate/workflows/orchestration-protocol.md`
- `@evcrate/workflows/primary-workflow.md`

Raw implementation input: <raw-plan>$ARGUMENTS</raw-plan>

## Canonical checkpoint routing

Named checkpoints use the canonical `evcrate-advisor-checkpoint/v2` dispatcher block in
`.copilot/evcrate/workflows/advisor-mentoring.md`; this command supplies bounded evidence
and does not duplicate route or adapter selection.

## Advice Mode

A final standalone `--advice` activates explicit review mentoring.
Before interpreting the plan, read `.copilot/evcrate/workflows/advisor-mentoring.md` and
derive `WORK_ARGUMENTS` plus explicit/default advice mode. Execute the plan from
`WORK_ARGUMENTS`. Apply the shared default stuck-escalation contract in
`.copilot/evcrate/workflows/advisor-mentoring.md` unconditionally across all modes
(reaching a second matching blocker activates the named checkpoint / advice lifecycle).
The advice lifecycle is active when explicit `--advice` is present, an applicable
active run exists, or a named checkpoint is activated. When the advice lifecycle is
active, apply the canonical `## Caller lifecycle binding` in
`.copilot/evcrate/workflows/advisor-mentoring.md`:
- **Durable state ownership in parallel execution**: The parent command is the sole durable-state owner. Parallel child tasks (`evcrate-fullstack-developer`, etc.) execute phase implementation within strict file ownership boundaries, reporting terminal artifacts, evidence, and actual changed paths back to the parent. Child tasks NEVER own or execute durable controller operations (`state init`, `checkpoint`, `disposition`, `outcome`, `complete`) and never stage or commit Git changes behind the parent.
- **Phase identity & context retention**: Phase identity is retained and bounded per its own phase; there is no blind context reset or UUID churn across phases.
- **Run identity & handoff**: If entering with an existing active run (from prior direction/decision/stuck run or router handoff), retain `task_run_id`, phase, root, current state revision, and prior counsel/disposition/outcome. Resume an already-active action without duplicating it: complete its authorized bounded work across parallel workers, execute actual declared validation, and record a truthful matching outcome advancing the baseline before the next review reservation. Before new authorized bounded writes, require `accept` with a registered correction action. For disputed counsel (`reject-with-evidence`, `need-evidence`, `reconcile`) without an active action, collect read-only evidence or an explicit resolution while preserving the captured baseline unchanged, and obtain fresh same-run counsel before corrective mutation or a resolved correction outcome.
- **Fresh first review**: If no prior active advice run exists, do NOT initialize state at command start just to track implementation. Implementation (Step 2A/2B), actual validation (Step 3), reviewer output (Step 4), and planned finalization artifacts settle first (writer barrier). Build `baseline_paths` as the union of authorized writable paths and selected read-only `evidence.files`/artifacts (`authorized_paths` contains only writable paths). Call `state init` immediately before reservation in Step 4, with no intervening file edits or git status/index changes.
- **Baseline stability**: Freeze all baseline paths (not only current citations) during reservation, inference, disposition, and from final outcome to completion.
- **Advice lifecycle & plan protection**: A prior completed advice run alone protects historical paths (sealed `plan.md`, historical reports, roadmap, captured git index/status identity) from mutation, but does NOT force fresh advice for a new default phase. Existing sealed paths stay strictly immutable even if the next invocation omits `--advice`.
- **Derived overview & immutable receipts**: `<plan-dir>/progress.md` is the derived current overview and is NEVER captured or cited as evidence or authorized substantive paths. Mutable progress is never captured; no retroactively removing captured paths. If already captured in the baseline, callers cannot overwrite progress either (surface blocker). New plans link before capture; old sealed plans remain untouched. Immutable phase completion receipts live outside the baseline.
- **Default operational branch (no active advice lifecycle)**: An untouched ordinary plan without advice history keeps normal `plan.md` tracking without controller state operations. A protected historical plan with a new default phase uses normal validation and approval without durable controller operations, updating `<plan-dir>/progress.md` and an uncaptured default completion receipt outside baseline.
**IMPORTANT:** Activate needed skills. Ensure token efficiency. Sacrifice grammar for concision.

## Workflow

### 1. Plan Analysis & Reconciliation
- Read `plan.md` from given path
- **Check for:** Dependency graph, Execution strategy, Parallelization Info, File Ownership matrix
- **Mandatory shared Plan progress and phase reconciliation:**
  Before selecting phases, forming parallel dependency batches, or launching execution:
  1. Apply `### Plan progress and phase reconciliation` in `.copilot/evcrate/workflows/advisor-mentoring.md` to reconcile completed scope, verify execution prerequisites, and preserve any active advice run/action context.
  2. An explicitly requested already-completed phase is a no-op: report completion, recommend the next incomplete phase, but do not auto-execute a different phase without user authorization.
  3. Emit overview path (`<plan-dir>/progress.md` for advice/protected plans, or `plan.md` for ordinary default plans), reconciled actual scope, and any outstanding prerequisites/blockers.
- **Decision:** Group incomplete phases into dependency batches. Only phases whose prerequisites are already established and verified with completion evidence belong to the ready batch. IF parallel-executable → Step 2A, ELSE → Step 2B

### 2A. Parallel Execution
1. Parse execution strategy (which phases concurrent in the ready batch, file ownership)
2. Launch multiple `evcrate-fullstack-developer` agents simultaneously for parallel phases in the ready batch
   - Pass: phase file path, environment info, file ownership boundaries
   - Child subagents report terminal artifacts and actual changed files back to the parent; child agents must never execute controller commands or stage Git changes
3. Wait for parallel group completion, verify no conflicts; parent retains each phase/run context
4. The ready batch must finish validation (Step 3), review & approval (Step 4), and finalization/completion (Steps 5–7) with phase-scoped completion evidence BEFORE dispatching dependent phases. Each batch records completion strictly for its own executed and verified phases; never claim all plan phases complete from a narrower batch run.
5. Before dispatching any dependent batch, re-run `### Plan progress and phase reconciliation` in `.copilot/evcrate/workflows/advisor-mentoring.md` to verify qualified prerequisites; block unavailable or conflicting prerequisites

### 2B. Sequential Execution
Follow `./.copilot/evcrate/workflows/primary-workflow.md`:
1. Use main agent phase by phase
2. Read `plan.md`, implement current phase
3. If using `evcrate-project-manager` for status reporting, child must be strictly report-only carrying parent protected path set (prior sealed paths) without mutating `plan.md`, roadmap, or `progress.md`; ordinary DONE updates and administrative progress publication remain reserved to the parent after required testing, review, and approval gates
4. Use `evcrate-ui-ux-designer` for frontend
5. Run type checking after implementation
6. Complete validation (Step 3), review & approval (Step 4), and finalization/completion (Steps 5–7) with phase-scoped completion evidence before proceeding to next sequential phase
### 3. Testing
- Use `evcrate-tester` for full suite (NO fake data/mocks)
- If fail: `evcrate-debugger` → fix → repeat

### 4. Code Review (Interactive Cycle)

Call `evcrate-code-reviewer` subagent: "Review all changes from parallel/sequential execution. Check security, performance, architecture, YAGNI/KISS/DRY. Return score (X/10), critical issues list, warnings list, suggestions list."

**Advice gate & lifecycle placement:** When advice lifecycle is active (explicit `--advice` or applicable active/named-checkpoint run):
- **Cycle 1 reservation**: After reviewer terminal output arrives and before findings are displayed, fixed, or approved:
  - If a fresh review run: initialize task state immediately before reservation (`baseline_paths` = authorized writable paths UNION selected read-only `evidence.files`/artifacts, with read-only files omitted from `authorized_paths`).
  - If an active run has a registered action, finish its bounded work, actual validation, and matching truthful outcome before reservation without duplicating the action. Disputed counsel without an active action uses read-only evidence/resolution and fresh same-run consultation before writes or a resolved correction outcome; do not invent an outcome to reserve that consultation.
  - Enter the canonical checkpoint dispatcher exactly once at `review:step-4` for this review cycle. Supply bounded evidence, declared validation commands/output, relevant prior counsel, and owner disposition per `## Caller lifecycle binding`.
  - Freeze all baseline paths during reservation, inference, and disposition.
  - A dispatcher failure or non-`ADVICE_READY` result fails this gate. Include advisor must-fix guidance in the findings.
**Interactive Review-Fix Cycle (max 3 cycles):**

**Review/advisor cycle cap: at most three terminal reviewer/advisor cycles.**

```
review_cycles = 0
LOOP:
  1. IF review_cycles >= 3:
     → Output: "⚠ 3 review cycles completed. Final decision required."
     → user input: "Approve with noted issues" / "Abort workflow"
     → STOP; do not start another review or advisor call
  2. Run code-reviewer → wait for its terminal result; get score, critical_count, warnings, suggestions
  3. IF the reviewer result is missing, partial, interrupted, cancelled,
     timed-out, or failed: STOP the gate; do not increment review_cycles.

  4. IF advice lifecycle is active: enter the canonical dispatcher → wait for its terminal result

  5. IF advice lifecycle is active and the advisor result is missing, partial,
     interrupted, cancelled, timed-out, or failed: STOP the gate; do not
     increment review_cycles.

  6. review_cycles++ only after every required reviewer/advisor result is terminal

  7. DISPLAY FULL REVIEWER + ADVISOR FINDINGS TO USER:
     ┌─────────────────────────────────────────┐
     │ Code Review Results: [score]/10         │
     ├─────────────────────────────────────────┤
     │ Critical Issues ([N]): MUST FIX         │
     │  - [issue] at [file:line]               │
     │ Warnings ([N]): SHOULD FIX              │
     │  - [issue] at [file:line]               │
     │ Suggestions ([N]): NICE TO HAVE         │
     │  - [suggestion]                         │
     └─────────────────────────────────────────┘

  8. Use user input (header: "Review"):
     IF critical_count > 0 OR advisor has must-fix items:
       - "Fix critical issues" → implement critical fixes, re-run tester
       - "Fix all issues" → implement all fixes, re-run tester
       - "Dispute advisor findings with evidence" → collect read-only evidence/resolution, GOTO LOOP
       - "Approve anyway" → proceed with noted issues
       - "Abort" → stop workflow
     ELSE:
       - "Fix warnings/suggestions" → implement selected fixes
       - "Approve" → proceed
       - "Abort" → stop workflow

  9. IF user selects any fix or dispute option:
     IF review_cycles >= 3:
       → Output: "⚠ 3 review cycles completed. Final decision required."
       → user input: "Approve with noted issues" / "Abort workflow"
       → STOP; do not run another fix/test/reviewer/advisor sequence
     ELSE IF advice lifecycle is active AND counsel is disputed:
       → Record reject-with-evidence, need-evidence, or reconcile without correction metadata
       → Collect read-only evidence or an explicit resolution, preserving captured baseline
       → Obtain fresh same-run counsel before any corrective mutation or resolved correction outcome
       → GOTO LOOP within the review cap; do not register invented work or record a corrective outcome for this evidence-only branch
     ELSE (accepted corrections, or default operational branch without active advice lifecycle):
       → When advice lifecycle is active, record accept with one bounded action and declared validation command before writes; resume an already-active action rather than registering it twice
       → Implement requested fixes across designated file ownership boundaries
       → Re-run tester to verify no regressions
       → When advice lifecycle is active, parent records matching truthful state outcome with actual changed paths and declared test results, advancing baseline
       → GOTO LOOP (re-run code-reviewer)
  10. ON APPROVE: PROCEED to Step 5
```

### 5. Project Management & Docs
- When advice lifecycle is active (explicit `--advice` or applicable active/named-checkpoint run): follow the substantive finalization lifecycle in `## Caller lifecycle binding`. Planned docs, status, and onboarding paths are authorized writable paths. Parent records `state disposition` for finalization (registering the bounded action and declared validation command) BEFORE executing any finalization writes or Git index transitions.
- When advice lifecycle is not active (default operational branch): preserve ordinary approved/validated completed status without durable controller dependencies or controller state operations.
- If approved: `evcrate-project-manager` + `evcrate-docs-manager` in parallel (update plans, docs, roadmap)
  - `evcrate-project-manager`:
    - Advice finalization must NOT assign sealed plan writes to child status writer.
    - When advice lifecycle is active: "Do NOT write to sealed plan.md or roadmap. Report terminal project status and documentation updates to parent without claiming durable completion."
    - In default operational branch on an untouched ordinary plan: "Update plan status in [plan-path]. Mark plan phase [phase-name] as DONE with timestamp. Update roadmap."
    - In default operational branch on a protected historical advice plan: "Do NOT mutate captured plan.md, roadmap, or prior sealed paths. Report phase completion and validation evidence to parent for progress.md and default completion receipt update."
  - `evcrate-docs-manager`: Supply parent protected path set (prior sealed paths) and authorized destinations: "Update docs for completed phases. Authorized doc paths: [authorized destinations]. Do not touch prior sealed paths: [protected path set]. Changed files: [list]."
- If rejected: fix → repeat

### 6. Onboarding
- Guide user step by step (1 question at a time)

### 7. Final Report & Completion
- Summary, guide, next steps
- In default operational branch:
  - Ask to commit (use `evcrate-git-manager` if yes). Pass parent protected paths and authorized destinations: stage only authorized current-run deliverables; never stage prior sealed paths, alter their selected index identities, or stage receipts/progress. No durable controller operations.
  - On untouched ordinary plans: only the executed and verified phases in the ready batch are marked DONE with timestamp in `plan.md` after approval and validation; never mark all plan phases complete from a narrower batch run. Output identifies `plan.md`.
  - On protected historical advice plans: phase completion is strictly phase-scoped and explicitly non-durable; never modify captured `plan.md`, status, roadmap, or prior sealed paths. Parent records uncaptured default completion receipt for each verified phase (with approval/validation evidence) and updates `<plan-dir>/progress.md` per shared contract. Output identifies `<plan-dir>/progress.md`.
- When advice lifecycle is active:
  - Ask to commit (use `evcrate-git-manager` if yes); authorized staging/commit settles before final outcome. Pass parent protected paths and authorized destinations: never stage prior sealed paths, alter their selected index identities, or stage receipts/progress.
  - Enforce writer barrier: all documentation/roadmap writes, onboarding configuration, and selected Git staging/commit settle before recording final outcome.
  - Run declared validation across all finalized deliverables.
  - Parent records ONE truthful `state outcome` matching the registered finalization action, reporting actual changed paths and declared validation status. (A no-change outcome is valid ONLY if zero actual files were changed, declared validation passed, disposition was accept, and no must-fix/unresolved-question items remain).
  - Parent executes `state complete` to seal the task run. The durable completion receipt is authoritative; only then is the phase durably DONE.
  - At complete, parent publishes mandatory immutable phase completion receipt for each completed phase (outside baseline) AND updates mutable overview `<plan-dir>/progress.md` per `### Plan progress and phase reconciliation`. Publication failure does not reopen successful phase. Never claim unexecuted or dependent phases complete.
  - Preserve all sealed file/index identities; only the bounded receipt/overview publication above is allowed after sealing. Summary and archive branches cannot modify sealed paths. Output identifies `<plan-dir>/progress.md`.
**Examples:**
- Parallel: "Phases 1-3 parallel, then 4" → Launch ready phases 1–3 → validate/review/finalize each scope → reconcile dependencies → launch 4.
- Sequential: "Phase 1 → 2 → 3" → implement, validate/review/finalize, then reconcile before each next phase.
