---
name: "evcrate-cmd-cook-auto-parallel"
description: "Plan parallel phases & execute with fullstack-developer agents"
argument-hint: "[tasks] [--advice]"
user-invocable: true
disable-model-invocation: true
---

## Invocation contract

The literal `$ARGUMENTS` is the exact raw text following `/evcrate-cmd-cook-auto-parallel`. Do not split, normalize, or discard it before the canonical command parses it.

Before executing this command, read these EVCrate workflow assets:
- `@evcrate/workflows/advisor-mentoring.md`
- `@evcrate/workflows/advisory-interview.md`
- `@evcrate/workflows/development-rules.md`
- `@evcrate/workflows/documentation-management.md`
- `@evcrate/workflows/orchestration-protocol.md`
- `@evcrate/workflows/primary-workflow.md`

**Ultrathink parallel** raw input: <raw-tasks>$ARGUMENTS</raw-tasks>

## Canonical checkpoint routing

Named checkpoints use the canonical `evcrate-advisor-checkpoint/v2` dispatcher block in
`.copilot/evcrate/workflows/advisor-mentoring.md`; this command supplies bounded evidence
and does not duplicate route or adapter selection.

## Advice Mode

A final standalone `--advice` activates explicit review mentoring.
Before planning, read `.copilot/evcrate/workflows/advisor-mentoring.md` and derive
`WORK_ARGUMENTS` plus explicit/default advice mode. Use `WORK_ARGUMENTS` as the
tasks input and apply the shared default stuck-escalation contract.
For every fallback handoff, pass `WORK_ARGUMENTS`; append exactly one trailing
`--advice` in explicit mode and otherwise pass no `--advice` token.

**IMPORTANT:** Activate needed skills. Ensure token efficiency. Sacrifice grammar for concision.

## Positioning

Use this only when work can be split into independent phases with clear dependencies and file ownership. If ownership, acceptance criteria, or side effects are unclear, run base `/evcrate-cmd-cook` first with `WORK_ARGUMENTS` and preserve the same explicit advice mode exactly once.

## Workflow

### 1. Preflight & Research
- Scout codebase with `/evcrate-cmd-scout-ext` before planning
- Define output, acceptance criteria, scope boundary, side-effect risks, and testing strategy
- Use max 2 `evcrate-researcher` agents in parallel if tasks complex
- Keep reports ≤150 lines

### 2. Parallel Planning
- Trigger `/evcrate-cmd-plan-parallel <detailed-instruction>`
- Wait for plan with:
  - dependency graph
  - execution strategy
  - file ownership matrix
  - side-effect review checklist
  - per-phase success criteria
- Do not proceed if any parallel phase has overlapping file ownership

### 3. Parallel Implementation
- Read `plan.md` for dependency graph
- Launch multiple `evcrate-fullstack-developer` agents in PARALLEL for concurrent phases
  - Example: "Phases 1-3 parallel" → launch 3 agents simultaneously
  - Pass phase file path: `{plan-dir}/phase-XX-*.md`
  - Include environment info
- Wait for all parallel phases complete before dependent phases
- Sequential phases: launch one agent at a time

### 4. Testing
- Use `evcrate-tester` subagent for full test suite
- NO fake data/mocks/cheats
- If fail: use `evcrate-debugger`, fix, repeat

### 5. Code Review
- Use `evcrate-code-reviewer` for all changes
- In explicit advice mode, after every terminal reviewer result and before any
  fix or approval, enter the canonical checkpoint dispatcher exactly once at
  `review:<workflow-step>` with the bounded evidence required by the shared
  mentoring contract. Dispatcher failure leaves the review gate incomplete.
- Review/advisor cycle cap: at most three terminal reviewer/advisor cycles. At
  the cap, stop without another reviewer/advisor call or cycle reset and ask the
  user if issues remain.
- If critical issues: fix, retest, rerun review

### 6. Project Management & Docs
- If approved: use `evcrate-project-manager` + `evcrate-docs-manager` in parallel
- Update plan files, docs, roadmap
- If rejected: fix and repeat

### 7. Final Report
- Summary of all parallel phases
- Guide to get started
- Ask to commit (use `evcrate-git-manager` if yes)

**Example:** Phases 1-3 parallel → Launch 3 fullstack-developer agents → Wait → Phase 4 sequential
