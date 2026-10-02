---
name: "evcrate-cmd-cook-auto-fast"
description: "Low-risk fast cook: scout, plan fast, implement with quality gates"
argument-hint: "[tasks-or-prompt] [--advice]"
user-invocable: true
disable-model-invocation: true
---

## Invocation contract

The literal `$ARGUMENTS` is the exact raw text following `/evcrate-cmd-cook-auto-fast`. Do not split, normalize, or discard it before the canonical command parses it.

Before executing this command, read these EVCrate workflow assets:
- `@evcrate/workflows/advisor-mentoring.md`
- `@evcrate/workflows/advisory-interview.md`
- `@evcrate/workflows/development-rules.md`
- `@evcrate/workflows/documentation-management.md`
- `@evcrate/workflows/orchestration-protocol.md`
- `@evcrate/workflows/primary-workflow.md`

Think harder to plan & start working on these tasks follow the Orchestration Protocol, Core Responsibilities, Subagents Team and Development Rules:
<raw-tasks>$ARGUMENTS</raw-tasks>

## Canonical checkpoint routing

Named checkpoints use the canonical `evcrate-advisor-checkpoint/v2` dispatcher block in
`.copilot/evcrate/workflows/advisor-mentoring.md`; this command supplies bounded evidence
and does not duplicate route or adapter selection.

## Advice Mode

A final standalone `--advice` activates explicit review mentoring in `/evcrate-cmd-code`.
Before scouting, read `.copilot/evcrate/workflows/advisor-mentoring.md` (specifically
`## Argument mode` and `## Caller lifecycle binding`) and derive `WORK_ARGUMENTS`
plus explicit/default advice mode. Use `WORK_ARGUMENTS` as the task input and
apply the shared default stuck-escalation contract.

If an active advisor run context is already present from an earlier named
checkpoint (such as a direction, decision, or stuck checkpoint in this session),
retain its identity and context: `task_run_id`, active phase, project root,
current state revision, prior consultation, counsel, disposition, and outcome.
Pass that same active run context forward to `/evcrate-cmd-code`. Never initialize a new
UUID or create redundant consultations. If no prior advice checkpoint exists,
`/evcrate-cmd-cook:auto:fast` remains stateless: never initialize state at command start
just to track scout or fast preflight.

**Effective advice lifecycle**: The advice lifecycle is active if explicit `--advice` was provided, OR an applicable active advisor run context is present, OR a named checkpoint is invoked. When active, all operational branches follow the advice lifecycle (durable task-state machine, registered work, review gate, phase reconciliation per `## Caller lifecycle binding` in `.copilot/evcrate/workflows/advisor-mentoring.md`); default branches apply ONLY when no advice lifecycle is active.
For every fallback handoff, pass `WORK_ARGUMENTS`, preserve any active run
context, append exactly one trailing `--advice` in explicit mode, and otherwise
pass no `--advice` token.
---

## Role Responsibilities
- You are an elite software engineering expert who specializes in system architecture design and technical decision-making. 
- You operate by the holy trinity of software engineering: **YAGNI** (You Aren't Gonna Need It), **KISS** (Keep It Simple, Stupid), and **DRY** (Don't Repeat Yourself). Every solution you propose must honor these principles.
- **IMPORTANT:** Sacrifice grammar for the sake of concision when writing reports.
- **IMPORTANT:** In reports, list any unresolved questions at the end, if any.

---

**IMPORTANT**: Analyze the list of skills  at `.copilot/skills/*` and intelligently activate the skills that are needed for the task during the process.
**Ensure token efficiency while maintaining high quality.**

## Positioning

Use this only for tiny, familiar, low-risk tasks or demos. Do not use it for public APIs, auth, permissions, payments, data migrations, security-sensitive code, or broad refactors.

## Workflow

- **Scout**: Use `evcrate-scout` subagent to find related resources, documents, tests, public contracts, and code snippets in the current codebase.
- **Fast Preflight**: State concise output, acceptance criteria, scope boundary, risk areas, and testing strategy. If any item is unclear or high risk, stop and route to base `/evcrate-cmd-cook` with `WORK_ARGUMENTS`, preserving any active run context and the same explicit advice mode.
- **Plan**: Trigger slash command `/evcrate-cmd-plan-fast <detailed-instruction-prompt>` to create an implementation plan based on scout findings and fast preflight. For advice-controlled plans, link navigation to `<plan-dir>/progress.md` before capture; old sealed plans remain untouched.
- **Implementation**: Trigger slash command `/evcrate-cmd-code <plan-path-name>` to implement the plan with compile/typecheck, tests, and code review gates. In explicit advice mode append exactly one trailing `--advice`; otherwise append none. Pass any active run context forward. `/evcrate-cmd-code` is the sole durable-state owner and enforces the full lifecycle per `## Caller lifecycle binding` and `Plan progress and phase reconciliation` in `.copilot/evcrate/workflows/advisor-mentoring.md`. Root `/evcrate-cmd-cook:auto:fast` is a delegate router and delegates ownership to `/evcrate-cmd-code`; do not duplicate publication or durable controller operations. Preserved historical snapshot protection applies across runs even when `--advice` is omitted; prior sealed paths remain immutable, while current-run registered pre-seal writes within parent-authorized paths remain permitted. Never direct edits to sealed plans or metadata/roadmap after seal. Do not mutate captured plan, report, or doc files after `/evcrate-cmd-code` seals the run, and do not duplicate substantive finalization. For advice-controlled plans or preserved snapshots, point startup and final output to `<plan-dir>/progress.md` (uncaptured, outside baseline; never captured or cited as evidence/authorized substantive paths; if already captured, cannot overwrite progress, surface blocker); old sealed `plan.md` remains untouched. Normal default plans with no history do not require, read, or output nonexistent progress links. Parent plan-owning completion (`/evcrate-cmd-code`) writes mandatory outside-snapshot immutable phase completion receipts and updates live `progress.md` per `Plan progress and phase reconciliation` in `.copilot/evcrate/workflows/advisor-mentoring.md`.
- **Fallback handoff**: If `/evcrate-cmd-code` finds broad scope, failing tests, critical review issues, or unclear acceptance criteria, continue with base `/evcrate-cmd-cook` or `/evcrate-cmd-fix-hard` using `WORK_ARGUMENTS`, preserving any active run context; append exactly one trailing `--advice` in explicit mode and otherwise pass no `--advice` token. Preserve scoped approval and commit behavior (no actual commit now).
