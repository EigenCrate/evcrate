---
argument-hint: "[tasks] [--advice]"
description: "Implement a feature automatically with plan and quality gates"
---

**Ultrathink** to plan & start working on these tasks follow the Orchestration Protocol, Core Responsibilities, Subagents Team and Development Rules:
<raw-tasks>$ARGUMENTS</raw-tasks>

## Canonical checkpoint routing

Named checkpoints use the canonical `evcrate-advisor-checkpoint/v2` dispatcher block in
`.omp/evcrate/workflows/advisor-mentoring.md` if present; otherwise read `~/.omp/agent/evcrate/workflows/advisor-mentoring.md`; this command supplies bounded evidence
and does not duplicate route or adapter selection.

## Advice Mode

A final standalone `--advice` activates explicit review mentoring in `/cmd-code`.
Before planning, read `.omp/evcrate/workflows/advisor-mentoring.md` if present; otherwise read `~/.omp/agent/evcrate/workflows/advisor-mentoring.md` (specifically
`## Argument mode` and `## Caller lifecycle binding`) and derive `WORK_ARGUMENTS`
plus explicit/default advice mode. Use `WORK_ARGUMENTS` as the tasks input.
Apply the shared default stuck-escalation contract.

If an active advisor run context is already present from an earlier named
checkpoint (such as a direction, decision, or stuck checkpoint in this session),
retain its identity and context: `task_run_id`, active phase, project root,
current state revision, prior consultation, counsel, disposition, and outcome.
Pass that same active run context forward to `/cmd-code`. Never initialize a new
UUID or create redundant consultations. If no prior advice checkpoint exists,
`/cmd-cook__auto` remains stateless: never initialize state at command start just to
track preflight or planning.

**Effective advice lifecycle**: The advice lifecycle is active if explicit `--advice` was provided, OR an applicable active advisor run context is present, OR a named checkpoint is invoked. When active, all operational branches follow the advice lifecycle (durable task-state machine, registered work, review gate, phase reconciliation per `## Caller lifecycle binding` in `.omp/evcrate/workflows/advisor-mentoring.md` if present; otherwise read `~/.omp/agent/evcrate/workflows/advisor-mentoring.md`); default branches apply ONLY when no advice lifecycle is active.
For every fallback handoff, pass `WORK_ARGUMENTS`, preserve any active run
context, append exactly one trailing `--advice` in explicit mode, and otherwise
pass no `--advice` token.
**IMPORTANT:** Analyze the list of skills  at `.omp/skills/*` and intelligently activate the skills that are needed for the task during the process.
**Ensure token efficiency while maintaining high quality.**

## Workflow

This is the lower-friction `/cmd-cook` variant. It can reduce user checkpoints, but it must not bypass planning, tests, or review.

1. Create a concise preflight contract:
   - output
   - acceptance criteria
   - scope boundary
   - risk/public contract areas
   - affected systems
   - testing strategy
   - unresolved questions
2. If unresolved questions can cause incorrect implementation, use `ask the user` before continuing.
3. Trigger slash command `/cmd-plan <detailed-instruction-prompt>` to create an implementation plan based on the preflight contract and tasks.
4. Trigger slash command `/cmd-code <plan>` to implement the plan with compile/typecheck, tests, code review, and approval gates. In explicit advice mode append exactly one trailing `--advice`; otherwise append none. Pass any active run context forward. `/cmd-code` is the sole durable-state owner and enforces the full lifecycle per `## Caller lifecycle binding` and `Plan progress and phase reconciliation` in `.omp/evcrate/workflows/advisor-mentoring.md` if present; otherwise read `~/.omp/agent/evcrate/workflows/advisor-mentoring.md`. Root `/cmd-cook__auto` is a delegate router and delegates ownership to `/cmd-code`; do not duplicate publication or durable controller operations. Preserved historical snapshot protection applies across runs even when `--advice` is omitted; prior sealed paths remain immutable, while current-run registered pre-seal writes within parent-authorized paths remain permitted. Never direct edits to sealed plans or metadata/roadmap after seal. Do not mutate captured plan, report, doc files, or Git index state after `/cmd-code` seals the run, and do not duplicate substantive finalization. Under advice lifecycle, phase-owned configuration, onboarding, and selected Git decisions/execution belong to the implementation owner's pre-outcome finalization; pass such decisions to `/cmd-code` before delegation/sealing.
5. Postimplementation, overview, and commit handling:
   - Under advice lifecycle or plans with preserved historical snapshots: point startup and final output to the derived live overview at `<plan-dir>/progress.md` (uncaptured, outside baseline; never captured or cited as evidence/authorized substantive paths; if already captured, cannot overwrite progress, surface blocker); old sealed `plan.md` remains untouched. Parent plan-owning completion (`/cmd-code`) writes mandatory outside-snapshot immutable phase completion receipts and updates live `progress.md` per `Plan progress and phase reconciliation` in `.omp/evcrate/workflows/advisor-mentoring.md` if present; otherwise read `~/.omp/agent/evcrate/workflows/advisor-mentoring.md`; `/cmd-cook__auto` does not duplicate publication. Selected Git decisions and index transitions belong to the implementation owner's pre-outcome finalization and were executed by `/cmd-code` prior to sealing. After `/cmd-code` seals the run, perform no Git commits (`/cmd-git__cm`), index mutations, or captured-file writes; only bounded administrative receipt and progress publication outside baseline is permitted per `Plan progress and phase reconciliation` in `.omp/evcrate/workflows/advisor-mentoring.md` if present; otherwise read `~/.omp/agent/evcrate/workflows/advisor-mentoring.md`.
   - In default mode (no active advice lifecycle): explicitly preserve existing default-mode postimplementation behavior: use `ask the user` tool to ask user if he wants to commit to git repository, if yes trigger `/cmd-git__cm` slash command to create a commit. Normal default plans with no history do not require, read, or output nonexistent progress links. Preserve scoped approval and commit behavior; do not execute an automatic commit without explicit user confirmation.
**Fallback handoff:** If requirements, risk, or scope require base `/cmd-cook`, invoke
it with `WORK_ARGUMENTS`, preserve any active run context, and preserve the same
explicit advice mode exactly once (append `--advice` only in explicit mode).
**Positioning:** Use this for familiar product work where the user trusts the default workflow. Use base `/cmd-cook` when requirements, risk, or scope need explicit discussion.

**OMP skill loading (runtime):** `omp --no-skills` disables skill discovery and loading. When that flag is active, do not claim automatic skill activation: read each required migrated `SKILL.md` directly with the read tool from `./.omp/skills/<skill-name>/SKILL.md`, falling back to `~/.omp/agent/skills/<skill-name>/SKILL.md`. If the native file is absent, consult `./.omp/evcrate/skill-map.json` or `~/.omp/agent/evcrate/skill-map.json`, then read the archived package under `./.omp/evcrate/skills/` (or the published `~/.omp/agent/evcrate/skills/` path), then follow the instructions. Without `--no-skills`, use OMP's normal skill discovery.
