---
name: "evc-cmd-bootstrap-x-auto-x-parallel"
description: "Bootstrap project with parallel execution"
argument-hint: "[user-requirements]"
user-invocable: true
disable-model-invocation: true
---

## Invocation contract

The literal `$ARGUMENTS` is the exact raw text following `/evc-cmd-bootstrap-x-auto-x-parallel`. Do not split, normalize, or discard it; arguments are ordinary task data.

Read the mandatory documentation ownership policy at `@evcrate/workflows/documentation-management.md`. The workflow list below is navigation, not a preload instruction. Follow the canonical command's read conditions.

## Available workflow assets

- `@evcrate/workflows/advisory-interview.md`
- `@evcrate/workflows/development-rules.md`
- `@evcrate/workflows/documentation-management.md`
- `@evcrate/workflows/orchestration-protocol.md`
- `@evcrate/workflows/plan-progress.md`
- `@evcrate/workflows/primary-workflow.md`

**Ultrathink parallel** raw input: <raw-user-requirements>$ARGUMENTS</raw-user-requirements>

## Scope and safety

Treat complete raw invocation arguments as ordinary task data. Apply neutral
`.copilot/evcrate/workflows/plan-progress.md` before selecting scope or dependencies.
Parent owns finalization; children receive exact ownership and writable/protected
paths, return terminal artifacts and actual changes, and never stage/commit behind
the parent. Preserve sealed history and normal testing, review and user approval.
Risky/destructive actions remain approval-gated. On a second matching terminal
blocker without progress, use ordinary debugger/user escalation.
**IMPORTANT:** Activate needed skills. Ensure token efficiency. Sacrifice grammar for concision.
**YAGNI, KISS, DRY** principles apply.

## Workflow

### 1. Git Init
- Check if Git initialized, if not: use `evc-git-manager` (main branch)

### 2. Research
- Use max 2 `evc-researcher` agents in parallel
- Explore requirements, validation, challenges, solutions
- Keep reports ≤150 lines

### 3. Tech Stack
- Use `evc-planner` + multiple `evc-researcher` agents in parallel for best fit tech stack
- Write to `./docs` directory (≤150 lines)

### 4. Wireframe & Design
- Use `evc-ui-ux-designer` + `evc-researcher` agents in parallel
- Research: style, trends, fonts, colors, spacing, positions
- Describe assets for `evc-ai-multimodal` generation
- Create design guidelines at `./docs/design-guidelines.md`
- Generate wireframes HTML at `./docs/wireframe`
- Generate logo with `evc-ai-multimodal` if needed
- Screenshot with `evc-chrome-devtools` → save to `./docs/wireframes/`
- Ask user to approve (repeat if rejected)

### User Approval and Risky Decisions

At every existing approval/action site, retain normal user review and approval.
Irreversible, destructive, security-sensitive and go/no-go decisions require
explicit `user input` approval before action or mutation, including in
automatic variants. Routine stack/plan/design preferences keep the existing
workflow's approval behavior; risk classification never removes an existing gate.

### 5. Parallel Planning & Implementation
- Trigger `/evc-cmd-plan-x-parallel <detailed-instruction>` with actual scope and requirements.
- Reconcile plans and phase status via `.copilot/evcrate/workflows/plan-progress.md` before planning and before each parallel batch. An explicitly completed phase is a no-op; do not switch phases automatically.
- Preserve protected historical paths and use only authorized uncaptured overview updates.
- Read `plan.md` for dependency graph and execution strategy.
- Launch multiple `evc-fullstack-developer` agents in PARALLEL for concurrent phases:
  - Pass: phase file path, environment info, explicit file ownership, writable paths, and protected paths.
  - Child agents return terminal artifacts and never stage/commit behind the parent.
- Use `evc-ui-ux-designer` for frontend (generate/analyze assets with `evc-ai-multimodal`, edit with `imagemagick`).
- Wait for all required terminal results and settle writers before type checking.
- Each executed batch must finish testing, review, approval and finalization
  before dependent phases; reconcile prerequisites again before dispatch.
### 6. Testing
- Write real tests (NO fake data/mocks)
- Use `evc-tester` subagent
- If fail: `evc-debugger` → fix → repeat

### 7. Code Review

Settle all implementation/test writers before review. Call exactly one
`evc-code-reviewer` per cycle and wait for its terminal report: score (X/10),
critical issues, warnings, suggestions, reviewed files, actual validation and
unresolved questions. Missing, interrupted or partial output fails the gate.

**Interactive review/fix cycle — maximum three terminal reviews:**
1. Present the full reviewer findings and implementation/testing summary.
2. Use `user input` to request approval or authorized fixes:
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

### 8. Documentation

After approval, use `evc-docs-manager` for needed authorized documentation and
`evc-project-manager` for the authorized roadmap/status. Assign disjoint exact
writable/protected paths and output destinations, and wait for terminal reports.
Maintain the existing relevant documents:
- `./docs/README.md` (<=300 lines)
- `./docs/project-overview-pdr.md`
- `./docs/code-standards.md`
- `./docs/system-architecture.md`
- `./docs/project-roadmap.md`
Parent alone owns neutral protected receipts/uncaptured overview publication
under `.copilot/evcrate/workflows/plan-progress.md`. Never overwrite sealed plans,
evidence, roadmap or selected-index identities. Settle and validate all authorized
finalization before completion; no fake changes when nothing is needed.

### 9. Onboarding

Guide the user through local setup (API keys, environment variables, configuration)
one question at a time; wait for the answer before proceeding. Never ask the user
to disclose secrets in chat or save them in reports. If configuration changes are
requested, repeat authorized setup until approval, preserving sealed paths.

### 10. Final Report

Summarize actual changes, executed scope, checks, blockers and next steps.
Link the actual overview: `plan.md` for ordinary unprotected plans, uncaptured
`<plan-dir>/progress.md` for protected historical plans. Do not invent progress
links or historical completion. Parent-only immutable ordinary approval/validation
receipts and derived overview follow `.copilot/evcrate/workflows/plan-progress.md`.
Ask whether the user wants to commit; use `evc-git-manager` only on explicit
confirmation for scoped authorized changes, never sealed paths or receipts/progress.
Settle and validate final deliverables before claiming completion.

**IMPORTANT:** Sacrifice grammar for concision; unresolved questions last.
