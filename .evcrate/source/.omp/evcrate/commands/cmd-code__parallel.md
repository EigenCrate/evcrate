---
argument-hint: "[plan-path] [--advice]"
description: "Execute parallel or sequential phases based on plan structure"
---

Raw implementation input: <raw-plan>$ARGUMENTS</raw-plan>

## Canonical checkpoint routing

When advice mode is active (`explicit` or `inherited`), named checkpoints use the canonical `evcrate-advisor-checkpoint/v2` dispatcher block in `.omp/evcrate/workflows/advisor-mentoring.md` if present; otherwise read `~/.omp/agent/evcrate/workflows/advisor-mentoring.md`; this command supplies bounded evidence and does not duplicate route or adapter selection. In `off` mode, named checkpoints and mentoring lifecycle are never invoked.

## Advice Mode

Native command execution validates and resolves advice activation prior to prompt admission, prepending the compact `evcrate_omp_command_context` header (version 2, source "native-user").
For a valid version-2 header from this command's admission, consume its validated `ADVICE_MODE = evcrate_omp_command_context.mode`, exact `context`, and `run`; `WORK_ARGUMENTS` is the work input already admitted once in this command body. Do not re-invoke the HOME helper. A header for another command is parent context, never this command's result.
When delegating directly to this command within a session or reading its definition:
- If admitted with a delegated header (source "delegated"), consume its validated mode, context, and run.
- Otherwise, resolve activation by invoking the HOME helper per `./.omp/evcrate/workflows/advice-activation.md` if present; otherwise read `~/.omp/agent/evcrate/workflows/advice-activation.md` with the exact child arguments, canonical `context.command: "code/parallel"`, exact child `work_target`, and the direct caller's exact handoff (including null handoff when off). Never reuse a parent command's activation result or synthesize a native header. Set `WORK_ARGUMENTS = result.work_arguments` and `ADVICE_MODE = result.mode`.
If `evcrate_omp_command_context` is missing or invalid on native entry, or if helper evaluation fails, treat activation as failed and fail closed per the shared activation contract.
Apply neutral `.omp/evcrate/workflows/plan-progress.md` if present; otherwise read `~/.omp/agent/evcrate/workflows/plan-progress.md` in every mode. Only resolved `explicit` or `inherited` loads `.omp/evcrate/workflows/advisor-mentoring.md` if present; otherwise read `~/.omp/agent/evcrate/workflows/advisor-mentoring.md` and follows its `## Caller lifecycle binding`; `off` keeps ordinary gates and only identified historical get, never hard lifecycle or inference.
Activation failures and repeated blockers follow the shared activation contract; neither history nor a checkpoint activates advice.
The implementation parent owns controller state and finalization; child writers receive exact writable/protected paths and documentation ownership, report terminal artifacts, and never operate state or stage/commit behind the parent.
**IMPORTANT:** Activate needed skills. Ensure token efficiency. Sacrifice grammar for concision.

## Workflow

### 1. Plan Analysis & Reconciliation
- Read `plan.md` from given path
- **Check for:** Dependency graph, Execution strategy, Parallelization Info, File Ownership matrix
- **Mandatory shared Plan progress and phase reconciliation:**
  Before selecting phases, forming parallel dependency batches, or launching execution:
  1. Apply neutral plan progress and phase reconciliation per `.omp/evcrate/workflows/plan-progress.md` if present; otherwise read `~/.omp/agent/evcrate/workflows/plan-progress.md` to reconcile completed scope, verify execution prerequisites, and preserve any active advice run/action context.
  2. An explicitly requested already-completed phase is a no-op: report completion, recommend the next incomplete phase, but do not auto-execute a different phase without user authorization.
  3. Emit overview path (`<plan-dir>/progress.md` for advice/protected plans, or `plan.md` for ordinary default plans), reconciled actual scope, and any outstanding prerequisites/blockers.
- **Decision:** Group incomplete phases into dependency batches. Only phases whose prerequisites are already established and verified with completion evidence belong to the ready batch. IF parallel-executable → Step 2A, ELSE → Step 2B

### 2A. Parallel Execution
1. Parse execution strategy (which phases concurrent in the ready batch, file ownership)
2. Launch multiple `fullstack-developer` agents simultaneously for parallel phases in the ready batch
   - Pass: phase file path, environment info, file ownership boundaries
   - Child subagents report terminal artifacts and actual changed files back to the parent; child agents must never execute controller commands or stage Git changes
3. Wait for parallel group completion, verify no conflicts; parent retains each phase/run context
4. The ready batch must finish validation (Step 3), review & approval (Step 4), and finalization/completion (Steps 5–7) with phase-scoped completion evidence BEFORE dispatching dependent phases. Each batch records completion strictly for its own executed and verified phases; never claim all plan phases complete from a narrower batch run.
5. Before dispatching any dependent batch, re-run neutral reconciliation per `.omp/evcrate/workflows/plan-progress.md` if present; otherwise read `~/.omp/agent/evcrate/workflows/plan-progress.md` to verify qualified prerequisites; block unavailable or conflicting prerequisites

### 2B. Sequential Execution
Follow `./.omp/evcrate/workflows/primary-workflow.md` if present; otherwise read `~/.omp/agent/evcrate/workflows/primary-workflow.md`:
1. Use main agent phase by phase
2. Read `plan.md`, implement current phase
3. If using `project-manager` for status reporting, child must be strictly report-only carrying parent protected path set (prior sealed paths) without mutating `plan.md`, roadmap, or `progress.md`; ordinary DONE updates and administrative progress publication remain reserved to the parent after required testing, review, and approval gates
4. Use `ui-ux-designer` for frontend
5. Run type checking after implementation
6. Complete validation (Step 3), review & approval (Step 4), and finalization/completion (Steps 5–7) with phase-scoped completion evidence before proceeding to next sequential phase
### 3. Testing
- Use `tester` for full suite (NO fake data/mocks)
- If fail: `debugger` → fix → repeat

### 4. Code Review (Interactive Cycle)

Call `code-reviewer` subagent: "Review all changes from parallel/sequential execution. Check security, performance, architecture, YAGNI/KISS/DRY. Return score (X/10), critical issues list, warnings list, suggestions list."

**Advice gate & lifecycle placement:** When advice mode is active (`explicit` or `inherited`):
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
     → ask the user: "Approve with noted issues" / "Abort workflow"
     → STOP; do not start another review or advisor call
  2. Run code-reviewer → wait for its terminal result; get score, critical_count, warnings, suggestions
  3. IF the reviewer result is missing, partial, interrupted, cancelled,
     timed-out, or failed: STOP the gate; do not increment review_cycles.

  4. IF advice mode is active: enter the canonical dispatcher → wait for its terminal result

  5. IF advice mode is active and the advisor result is missing, partial,
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

  8. Use ask the user (header: "Review"):
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
       → ask the user: "Approve with noted issues" / "Abort workflow"
       → STOP; do not run another fix/test/reviewer/advisor sequence
    ELSE IF advice mode is active AND counsel is disputed:
      → Record reject-with-evidence, need-evidence, or reconcile without correction metadata
      → Collect read-only evidence or an explicit resolution, preserving captured baseline
      → Obtain fresh same-run counsel before any corrective mutation or resolved correction outcome
      → GOTO LOOP within the review cap; do not register invented work or record a corrective outcome for this evidence-only branch
    ELSE (accepted corrections, or default operational branch in off mode):
      → When advice mode is active, record accept with one bounded action and declared validation command before writes; resume an already-active action rather than registering it twice
      → Implement requested fixes across designated file ownership boundaries
      → Re-run tester to verify no regressions
      → When advice mode is active, parent records matching truthful state outcome with actual changed paths and declared test results, advancing baseline
      → GOTO LOOP (re-run code-reviewer)
  10. ON APPROVE: PROCEED to Step 5
```

### 5. Project Management & Docs
- When advice mode is active (`explicit` or `inherited`): follow the substantive finalization lifecycle in `## Caller lifecycle binding` of `.omp/evcrate/workflows/advisor-mentoring.md` if present; otherwise read `~/.omp/agent/evcrate/workflows/advisor-mentoring.md`. Planned docs, status, and onboarding paths are authorized writable paths. Parent records `state disposition` for finalization (registering the bounded action and declared validation command) BEFORE executing any finalization writes or Git index transitions.
- When advice mode is `off` (default operational branch): preserve ordinary approved/validated completed status without durable controller dependencies or controller state operations.
- If approved: `project-manager` + `docs-manager` in parallel (update plans, docs, roadmap)
  - `project-manager`:
    - Advice finalization must NOT assign sealed plan writes to child status writer.
    - When advice mode is active: "Do NOT write to sealed plan.md or roadmap. Report terminal project status and documentation updates to parent without claiming durable completion."
    - In default operational branch (`off` mode) on an untouched ordinary plan: "Update plan status in [plan-path]. Mark plan phase [phase-name] as DONE with timestamp. Update roadmap."
    - In default operational branch (`off` mode) on a protected historical advice plan: "Do NOT mutate captured plan.md, roadmap, or prior sealed paths. Report phase completion and validation evidence to parent for progress.md and default completion receipt update."
  - `docs-manager`: Supply parent protected path set (prior sealed paths) and authorized destinations: "Update docs for completed phases. Authorized doc paths: [authorized destinations]. Do not touch prior sealed paths: [protected path set]. Changed files: [list]."
- If rejected: fix → repeat

### 6. Onboarding
- Guide user step by step (1 question at a time)

### 7. Final Report & Completion
- Summary, guide, next steps
- In default operational branch (`off` mode):
  - Ask to commit (use `git-manager` if yes). Pass parent protected paths and authorized destinations: stage only authorized current-run deliverables; never stage prior sealed paths, alter their selected index identities, or stage receipts/progress. No durable controller operations.
  - On untouched ordinary plans: only the executed and verified phases in the ready batch are marked DONE with timestamp in `plan.md` after approval and validation; never mark all plan phases complete from a narrower batch run. Output identifies `plan.md`.
  - On protected historical advice plans: phase completion is strictly phase-scoped and explicitly non-durable; never modify captured `plan.md`, status, roadmap, or prior sealed paths. Parent records uncaptured default completion receipt for each verified phase (with approval/validation evidence) and updates `<plan-dir>/progress.md` per `.omp/evcrate/workflows/plan-progress.md` if present; otherwise read `~/.omp/agent/evcrate/workflows/plan-progress.md`. Output identifies `<plan-dir>/progress.md`.
- When advice mode is active:
  - Ask to commit (use `git-manager` if yes); authorized staging/commit settles before final outcome. Pass parent protected paths and authorized destinations: never stage prior sealed paths, alter their selected index identities, or stage receipts/progress.
  - Enforce writer barrier: all documentation/roadmap writes, onboarding configuration, and selected Git staging/commit settle before recording final outcome.
  - Run declared validation across all finalized deliverables.
  - Parent records ONE truthful `state outcome` matching the registered finalization action, reporting actual changed paths and declared validation status. (A no-change outcome is valid ONLY if zero actual files were changed, declared validation passed, disposition was accept, and no must-fix/unresolved-question items remain).
  - Parent executes `state complete` to seal the task run. The durable completion receipt is authoritative; only then is the phase durably DONE.
  - At complete, parent publishes mandatory immutable phase completion receipt for each completed phase (outside baseline) AND updates mutable overview `<plan-dir>/progress.md` per `.omp/evcrate/workflows/plan-progress.md` if present; otherwise read `~/.omp/agent/evcrate/workflows/plan-progress.md`. Publication failure does not reopen successful phase. Never claim unexecuted or dependent phases complete.
  - Preserve all sealed file/index identities; only the bounded receipt/overview publication above is allowed after sealing. Summary and archive branches cannot modify sealed paths. Output identifies `<plan-dir>/progress.md`.
**Examples:**
- Parallel: "Phases 1-3 parallel, then 4" → Launch ready phases 1–3 → validate/review/finalize each scope → reconcile dependencies → launch 4.
- Sequential: "Phase 1 → 2 → 3" → implement, validate/review/finalize, then reconcile before each next phase.

**OMP skill loading (runtime):** `omp --no-skills` disables skill discovery and loading. When that flag is active, do not claim automatic skill activation: read each required migrated `SKILL.md` directly with the read tool from `./.omp/skills/<skill-name>/SKILL.md`, falling back to `~/.omp/agent/skills/<skill-name>/SKILL.md`. If the native file is absent, consult `./.omp/evcrate/skill-map.json` or `~/.omp/agent/evcrate/skill-map.json`, then read the archived package under `./.omp/evcrate/skills/` (or the published `~/.omp/agent/evcrate/skills/` path), then follow the instructions. Without `--no-skills`, use OMP's normal skill discovery.
