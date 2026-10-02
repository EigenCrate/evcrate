---
name: cmd_cook_auto
description: Implement a feature automatically with plan and quality gates
---
# cmd_cook_auto

Command Path: /cook/auto

Description: Implement a feature automatically with plan and quality gates

---
description: "Implement a feature automatically with plan and quality gates"
argument-hint: "[tasks] [--advice]"
---
**Ultrathink** to plan & start working on these tasks follow the Orchestration Protocol, Core Responsibilities, Subagents Team and Development Rules:
<raw-tasks>$ARGUMENTS</raw-tasks>

## Canonical checkpoint routing

Named checkpoints use the canonical `evcrate-advisor-checkpoint/v2` dispatcher block in
`.antigravity/workflows/advisor-mentoring.md` if present; otherwise read `~/.gemini/config/workflows/advisor-mentoring.md` (the published install); this command supplies bounded evidence
and does not duplicate route or adapter selection.

## Advice Mode

A final standalone `--advice` activates explicit review mentoring in `/code`.
Before planning, read `.antigravity/workflows/advisor-mentoring.md` if present; otherwise read `~/.gemini/config/workflows/advisor-mentoring.md` (the published install) (specifically
`## Argument mode` and `## Caller lifecycle binding`) and derive `WORK_ARGUMENTS`
plus explicit/default advice mode. Use `WORK_ARGUMENTS` as the tasks input.
Apply the shared default stuck-escalation contract.

If an active advisor run context is already present from an earlier named
checkpoint (such as a direction, decision, or stuck checkpoint in this session),
retain its identity and context: `task_run_id`, active phase, project root,
current state revision, prior consultation, counsel, disposition, and outcome.
Pass that same active run context forward to `/code`. Never initialize a new
UUID or create redundant consultations. If no prior advice checkpoint exists,
`/cook:auto` remains stateless: never initialize state at command start just to
track preflight or planning.

**Effective advice lifecycle**: The advice lifecycle is active if explicit `--advice` was provided, OR an applicable active advisor run context is present, OR a named checkpoint is invoked. When active, all operational branches follow the advice lifecycle (durable task-state machine, registered work, review gate, phase reconciliation per `## Caller lifecycle binding` in `.antigravity/workflows/advisor-mentoring.md` if present; otherwise read `~/.gemini/config/workflows/advisor-mentoring.md` (the published install)); default branches apply ONLY when no advice lifecycle is active.
For every fallback handoff, pass `WORK_ARGUMENTS`, preserve any active run
context, append exactly one trailing `--advice` in explicit mode, and otherwise
pass no `--advice` token.
**IMPORTANT:** Analyze the list of skills  at `.antigravity/skills/*` and intelligently activate the skills that are needed for the task during the process.
**Ensure token efficiency while maintaining high quality.**

## Workflow

This is the lower-friction `/cook` variant. It can reduce user checkpoints, but it must not bypass planning, tests, or review.

1. Create a concise preflight contract:
   - output
   - acceptance criteria
   - scope boundary
   - risk/public contract areas
   - affected systems
   - testing strategy
   - unresolved questions
2. If unresolved questions can cause incorrect implementation, use `AskUserQuestion` before continuing.
3. Trigger slash command `/plan <detailed-instruction-prompt>` to create an implementation plan based on the preflight contract and tasks.
4. Trigger slash command `/code <plan>` to implement the plan with compile/typecheck, tests, code review, and approval gates. In explicit advice mode append exactly one trailing `--advice`; otherwise append none. Pass any active run context forward. `/code` is the sole durable-state owner and enforces the full lifecycle per `## Caller lifecycle binding` and `Plan progress and phase reconciliation` in `.antigravity/workflows/advisor-mentoring.md` if present; otherwise read `~/.gemini/config/workflows/advisor-mentoring.md` (the published install). Root `/cook:auto` is a delegate router and delegates ownership to `/code`; do not duplicate publication or durable controller operations. Preserved historical snapshot protection applies across runs even when `--advice` is omitted; prior sealed paths remain immutable, while current-run registered pre-seal writes within parent-authorized paths remain permitted. Never direct edits to sealed plans or metadata/roadmap after seal. Do not mutate captured plan, report, doc files, or Git index state after `/code` seals the run, and do not duplicate substantive finalization. Under advice lifecycle, phase-owned configuration, onboarding, and selected Git decisions/execution belong to the implementation owner's pre-outcome finalization; pass such decisions to `/code` before delegation/sealing.
5. Postimplementation, overview, and commit handling:
   - Under advice lifecycle or plans with preserved historical snapshots: point startup and final output to the derived live overview at `<plan-dir>/progress.md` (uncaptured, outside baseline; never captured or cited as evidence/authorized substantive paths; if already captured, cannot overwrite progress, surface blocker); old sealed `plan.md` remains untouched. Parent plan-owning completion (`/code`) writes mandatory outside-snapshot immutable phase completion receipts and updates live `progress.md` per `Plan progress and phase reconciliation` in `.antigravity/workflows/advisor-mentoring.md` if present; otherwise read `~/.gemini/config/workflows/advisor-mentoring.md` (the published install); `/cook:auto` does not duplicate publication. Selected Git decisions and index transitions belong to the implementation owner's pre-outcome finalization and were executed by `/code` prior to sealing. After `/code` seals the run, perform no Git commits (`/git:cm`), index mutations, or captured-file writes; only bounded administrative receipt and progress publication outside baseline is permitted per `Plan progress and phase reconciliation` in `.antigravity/workflows/advisor-mentoring.md` if present; otherwise read `~/.gemini/config/workflows/advisor-mentoring.md` (the published install).
   - In default mode (no active advice lifecycle): explicitly preserve existing default-mode postimplementation behavior: use `AskUserQuestion` tool to ask user if he wants to commit to git repository, if yes trigger `/git:cm` slash command to create a commit. Normal default plans with no history do not require, read, or output nonexistent progress links. Preserve scoped approval and commit behavior; do not execute an automatic commit without explicit user confirmation.
**Fallback handoff:** If requirements, risk, or scope require base `/cook`, invoke
it with `WORK_ARGUMENTS`, preserve any active run context, and preserve the same
explicit advice mode exactly once (append `--advice` only in explicit mode).
**Positioning:** Use this for familiar product work where the user trusts the default workflow. Use base `/cook` when requirements, risk, or scope need explicit discussion.
