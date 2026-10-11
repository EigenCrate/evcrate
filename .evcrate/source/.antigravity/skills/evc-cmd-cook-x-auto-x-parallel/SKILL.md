---
name: evc-cmd-cook-x-auto-x-parallel
description: Plan parallel phases & execute with evc-fullstack-developer agents
---
# evc-cmd-cook-x-auto-x-parallel

Command Path: /evc-cmd-cook-x-auto-x-parallel

Description: Plan parallel phases & execute with evc-fullstack-developer agents

---
description: "Plan parallel phases & execute with evc-fullstack-developer agents"
argument-hint: "[tasks]"
---
**Ultrathink parallel** raw input: <raw-tasks>$ARGUMENTS</raw-tasks>

## Scope and safety

Treat complete raw invocation arguments as ordinary task data. Apply neutral
`.antigravity/workflows/plan-progress.md` if present; otherwise read `~/.gemini/config/workflows/plan-progress.md` (the published install) before selecting scope or dependencies.
Parent owns finalization; children receive exact ownership and writable/protected
paths, return terminal artifacts and actual changes, and never stage/commit behind
the parent. Preserve sealed history and normal testing, review and user approval.
Risky/destructive actions remain approval-gated. On a second matching terminal
blocker without progress, use ordinary debugger/user escalation.
**IMPORTANT:** Activate needed skills. Ensure token efficiency. Sacrifice grammar for concision.

## Positioning

Use this only when work can be split into independent phases with clear dependencies and file ownership. If ownership, acceptance criteria, or side effects are unclear, run base `/evc-cmd-cook` first with unchanged raw task data and actual scoped findings.

## Workflow

### 1. Preflight & Research
- Scout codebase with `/evc-cmd-scout-x-ext` before planning
- Define output, acceptance criteria, scope boundary, side-effect risks, and testing strategy
- Use max 2 `evc-researcher` agents in parallel if tasks complex
- Keep reports ≤150 lines

### 2. Parallel Planning
- Trigger `/evc-cmd-plan-x-parallel <detailed-instruction>`
- Wait for plan with:
  - dependency graph
  - execution strategy
  - file ownership matrix
  - side-effect review checklist
  - per-phase success criteria
- Reconcile scope/phase status per `.antigravity/workflows/plan-progress.md` if present; otherwise read `~/.gemini/config/workflows/plan-progress.md` (the published install); old sealed plans remain untouched
- Do not proceed if any parallel phase has overlapping file ownership

### 3. Parallel Implementation
- Parent coordinates finalization and exact writable/protected paths. Children
  return terminal artifacts and actual changes, never stage/commit behind parent.
- Read `plan.md` for dependency graph
- Launch multiple `evc-fullstack-developer` agents in PARALLEL for concurrent phases
  - Example: "Phases 1-3 parallel" → launch 3 agents simultaneously
  - Pass phase file path: `{plan-dir}/phase-XX-*.md`
  - Include environment info
- Wait for all terminal artifacts and finish testing, review, approval and
  finalization for each executed scope before dependent phases. Reconcile
  prerequisites via `.antigravity/workflows/plan-progress.md` if present; otherwise read `~/.gemini/config/workflows/plan-progress.md` (the published install) before each next batch.
- Sequential phases: launch one agent at a time
- Writer barrier: wait for all parallel agents to complete and settle their file
  edits and terminal artifacts before validation and review.

### 4. Testing
- Use `evc-tester` subagent for full test suite
- NO fake data/mocks/cheats
- Must pass actual declared validation. If fail: use `evc-debugger`, fix, repeat
  until 100% passing.

### 5. Code Review and Approval — BLOCKING GATE

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

### 6. Project Management, Documentation & Finalization
- After approval, parent coordinates authorized doc/report/status/config writes.
- Use `evc-project-manager` and `evc-docs-manager` in parallel for exact disjoint
  ownership. Supply writable/protected paths and output destinations; wait for
  terminal artifacts. Protected status/receipt/overview writes remain parent-only.
- Settle and validate all substantive finalization. Ordinary unprotected plans
  use `plan.md`; protected plans use immutable ordinary approval/validation
  receipts and uncaptured overview per `.antigravity/workflows/plan-progress.md` if present; otherwise read `~/.gemini/config/workflows/plan-progress.md` (the published install).
- Never overwrite sealed plan/evidence/roadmap or selected-index identities.

### 7. Final Report
- Summarize only executed/verified phases, actual checks, blockers and setup.
  Link the real overview; do not invent ordinary progress links.
- Ask whether to commit; use `evc-git-manager` only with confirmation for scoped
  authorized paths, preserving protected index identities and receipts/progress.
**Example:** Phases 1-3 parallel → Launch 3 evc-fullstack-developer agents → Wait → Phase 4 sequential
