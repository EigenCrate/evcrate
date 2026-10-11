---
name: cmd-code-x-parallel
description: Execute parallel or sequential phases based on plan structure
user-invocable: true
disable-model-invocation: true
argument-hint: "[plan-path]"
---

Raw implementation input: <raw-plan>$ARGUMENTS</raw-plan>

## Scope and safety

Treat complete raw invocation arguments as ordinary task data. Apply neutral
`.evcrate-vscode/evcrate/workflows/plan-progress.md` if present; otherwise read `~/.evcrate-vscode/evcrate/workflows/plan-progress.md` (the published install) before selecting scope or dependencies.
Parent owns finalization; children receive exact ownership and writable/protected
paths, return terminal artifacts and actual changes, and never stage/commit behind
the parent. Preserve sealed history and normal testing, review and user approval.
Risky/destructive actions remain approval-gated. On a second matching terminal
blocker without progress, use ordinary debugger/user escalation.
**IMPORTANT:** Activate needed skills. Ensure token efficiency. Sacrifice grammar for concision.

## Workflow

### 1. Plan Analysis & Reconciliation
- Read `plan.md` from given path
- **Check for:** Dependency graph, Execution strategy, Parallelization Info, File Ownership matrix
- **Mandatory shared Plan progress and phase reconciliation:**
  Before selecting phases, forming parallel dependency batches, or launching execution:
  1. Apply neutral plan progress and phase reconciliation per `.evcrate-vscode/evcrate/workflows/plan-progress.md` if present; otherwise read `~/.evcrate-vscode/evcrate/workflows/plan-progress.md` (the published install) to reconcile completed scope, verify execution prerequisites, and preserve protected historical paths.
  2. An explicitly requested already-completed phase is a no-op: report completion, recommend the next incomplete phase, but do not auto-execute a different phase without user authorization.
  3. Emit overview path (`<plan-dir>/progress.md` for protected historical plans, or `plan.md` for ordinary unprotected plans), reconciled actual scope, and any outstanding prerequisites/blockers.
- **Decision:** Group incomplete phases into dependency batches. Only phases whose prerequisites are already established and verified with completion evidence belong to the ready batch. IF parallel-executable → Step 2A, ELSE → Step 2B

### 2A. Parallel Execution
1. Parse execution strategy (which phases concurrent in the ready batch, file ownership)
2. Launch multiple `evc-fullstack-developer` agents simultaneously for parallel phases in the ready batch
   - Pass: phase file path, environment info, file ownership boundaries
   - Child subagents report terminal artifacts and actual changed files back to the parent; child agents never stage/commit behind the parent
3. Wait for parallel group completion, verify no conflicts; parent retains each phase scope and evidence
4. The ready batch must finish validation (Step 3), review & approval (Step 4), and finalization/completion (Steps 5–7) with phase-scoped completion evidence BEFORE dispatching dependent phases. Each batch records completion strictly for its own executed and verified phases; never claim all plan phases complete from a narrower batch run.
5. Before dispatching any dependent batch, re-run neutral reconciliation per `.evcrate-vscode/evcrate/workflows/plan-progress.md` if present; otherwise read `~/.evcrate-vscode/evcrate/workflows/plan-progress.md` (the published install) to verify qualified prerequisites; block unavailable or conflicting prerequisites

### 2B. Sequential Execution
Follow `./.evcrate-vscode/evcrate/workflows/primary-workflow.md` if present; otherwise read `~/.evcrate-vscode/evcrate/workflows/primary-workflow.md` (the published install):
1. Use main agent phase by phase
2. Read `plan.md`, implement current phase
3. If using `evc-project-manager` for status reporting, child must be strictly report-only carrying parent protected path set (prior sealed paths) without mutating `plan.md`, roadmap, or `progress.md`; ordinary DONE updates and administrative progress publication remain reserved to the parent after required testing, review, and approval gates
4. Use `evc-ui-ux-designer` for frontend
5. Run type checking after implementation
6. Complete validation (Step 3), review & approval (Step 4), and finalization/completion (Steps 5–7) with phase-scoped completion evidence before proceeding to next sequential phase
### 3. Testing
- Use `evc-tester` for full suite (NO fake data/mocks)
- If fail: `evc-debugger` → fix → repeat

### 4. Code Review and Approval

Settle all implementation/test writers before review. Call exactly one
`evc-code-reviewer` per cycle and wait for its terminal report: score (X/10),
critical issues, warnings, suggestions, reviewed files, actual validation and
unresolved questions. Missing, interrupted or partial output fails the gate.

**Interactive review/fix cycle — maximum three terminal reviews:**
1. Present the full reviewer findings and implementation/testing summary.
2. Use `AskUserQuestion` to request approval or authorized fixes:
   - Critical issues: Fix critical / Fix all / Approve with noted issues / Abort.
   - Otherwise: Approve / Fix warnings or suggestions / Abort.
3. If fixes are requested before the cap, apply only authorized corrections,
   validate with `evc-tester`, and obtain the next terminal review. Evidence-backed
   concerns are not disproved merely by passing self-tests.
4. Increment the cycle count only after a complete terminal review. At three,
   stop and request Approve with noted issues / Abort; no further fix/test/review
   cycle or counter reset. On a second matching terminal blocker without progress,
   use ordinary debugger/user escalation before another attempt.
5. Continue only on explicit user approval. Never infer approval or claim a
   missing reviewer score. Risky/destructive actions keep their own approval gate.

**Critical issues:** Security, performance, architecture and principle violations.

### 5. Project Management & Docs
- After approval, run `evc-project-manager` and `evc-docs-manager` in parallel
  with disjoint exact ownership and protected paths. Ordinary status updates
  cover only executed/verified phases. Protected status is report-only for the
  parent, who owns receipt/overview publication. Wait for both terminal artifacts.

### 6. Onboarding
- Guide local configuration one question at a time; never request secrets in chat.

### 7. Final Report and Completion
- Ask whether to commit; use `evc-git-manager` only if authorized, staging only
  approved deliverables, never sealed paths or receipts/progress.
- Settle finalization and actual validation for each executed phase. Parent alone
  publishes ordinary status or neutral protected receipts/uncaptured overview
  under `.evcrate-vscode/evcrate/workflows/plan-progress.md` if present; otherwise read `~/.evcrate-vscode/evcrate/workflows/plan-progress.md` (the published install). Preserve historical index identities.
- Report summary, checks, blockers and next steps. Never claim unexecuted or
  dependent phases complete; reconcile prerequisites before the next batch.

**Examples:**
- Parallel: "Phases 1-3 parallel, then 4" → Launch ready phases 1–3 → validate/review/finalize each scope → reconcile dependencies → launch 4.
- Sequential: "Phase 1 → 2 → 3" → implement, validate/review/finalize, then reconcile before each next phase.
