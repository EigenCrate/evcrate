---
description: ⚡⚡⚡ Plan parallel phases & execute with fullstack-developer agents
argument-hint: [tasks] [@advisor]
---

**Ultrathink parallel** raw input: <raw-tasks>$ARGUMENTS</raw-tasks>

## Advisor Mode

A final standalone `@advisor` activates explicit review mentoring.
Before planning, read `{{evcrate:workflows/advisor-mentoring.md}}` and derive
`WORK_ARGUMENTS` plus explicit/default advisor mode. Use `WORK_ARGUMENTS` as the
tasks input and apply the shared default stuck-escalation contract.
For every fallback handoff, pass `WORK_ARGUMENTS`; append exactly one trailing
`@advisor` in explicit mode and otherwise pass no advisor token.

**IMPORTANT:** Activate needed skills. Ensure token efficiency. Sacrifice grammar for concision.

## Positioning

Use this only when work can be split into independent phases with clear dependencies and file ownership. If ownership, acceptance criteria, or side effects are unclear, run base {{evcrate:commands/cook}} first with `WORK_ARGUMENTS` and preserve the same explicit mode exactly once.

## Workflow

### 1. Preflight & Research
- Scout codebase with `/scout:ext` before planning
- Define output, acceptance criteria, scope boundary, side-effect risks, and testing strategy
- Use max 2 `researcher` agents in parallel if tasks complex
- Keep reports ≤150 lines

### 2. Parallel Planning
- Trigger {{evcrate:commands/plan:parallel}} <detailed-instruction>
- Wait for plan with:
  - dependency graph
  - execution strategy
  - file ownership matrix
  - side-effect review checklist
  - per-phase success criteria
- Do not proceed if any parallel phase has overlapping file ownership

### 3. Parallel Implementation
- Read `plan.md` for dependency graph
- Launch multiple `fullstack-developer` agents in PARALLEL for concurrent phases
  - Example: "Phases 1-3 parallel" → launch 3 agents simultaneously
  - Pass phase file path: `{plan-dir}/phase-XX-*.md`
  - Include environment info
- Wait for all parallel phases complete before dependent phases
- Sequential phases: launch one agent at a time

### 4. Testing
- Use `tester` subagent for full test suite
- NO fake data/mocks/cheats
- If fail: use `debugger`, fix, repeat

### 5. Code Review
- Use `code-reviewer` for all changes
- In explicit advisor mode, after every terminal reviewer result and before any
  fix or approval, synchronously call exactly one `advisor` with the bounded
  evidence required by the shared mentoring contract. Advisor failure fails the
  review gate.
- Limit this review/advisor loop to three cycles; if issues remain, stop and ask
  the user.
- If critical issues: fix, retest, rerun review

### 6. Project Management & Docs
- If approved: use `project-manager` + `docs-manager` in parallel
- Update plan files, docs, roadmap
- If rejected: fix and repeat

### 7. Final Report
- Summary of all parallel phases
- Guide to get started
- Ask to commit (use `git-manager` if yes)

**Example:** Phases 1-3 parallel → Launch 3 fullstack-developer agents → Wait → Phase 4 sequential
