---
description: "Low-risk fast cook: scout, plan fast, implement with quality gates"
argument-hint: "[tasks-or-prompt] [--advice]"
---
Think harder to plan & start working on these tasks follow the Orchestration Protocol, Core Responsibilities, Subagents Team and Development Rules:
<raw-tasks>$ARGUMENTS</raw-tasks>

## Canonical checkpoint routing

Named checkpoints use the canonical `evcrate-advisor-checkpoint/v2` dispatcher block in
`.claude/workflows/advisor-mentoring.md`; this command supplies bounded evidence
and does not duplicate route or adapter selection.

## Advice Mode

A final standalone `--advice` activates explicit review mentoring in `/code`.
Before scouting, read `.claude/workflows/advisor-mentoring.md` (specifically
`## Argument mode` and `## Caller lifecycle binding`) and derive `WORK_ARGUMENTS`
plus explicit/default advice mode. Use `WORK_ARGUMENTS` as the task input and
apply the shared default stuck-escalation contract.

If an active advisor run context is already present from an earlier named
checkpoint (such as a direction, decision, or stuck checkpoint in this session),
retain its identity and context: `task_run_id`, active phase, project root,
current state revision, prior consultation, counsel, disposition, and outcome.
Pass that same active run context forward to `/code`. Never initialize a new
UUID or create redundant consultations. If no prior advice checkpoint exists,
`/cook:auto:fast` remains stateless: never initialize state at command start
just to track scout or fast preflight.

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

**IMPORTANT**: Analyze the list of skills  at `.claude/skills/*` and intelligently activate the skills that are needed for the task during the process.
**Ensure token efficiency while maintaining high quality.**

## Positioning

Use this only for tiny, familiar, low-risk tasks or demos. Do not use it for public APIs, auth, permissions, payments, data migrations, security-sensitive code, or broad refactors.

## Workflow

- **Scout**: Use `scout` subagent to find related resources, documents, tests, public contracts, and code snippets in the current codebase.
- **Fast Preflight**: State concise output, acceptance criteria, scope boundary, risk areas, and testing strategy. If any item is unclear or high risk, stop and route to base `/cook` with `WORK_ARGUMENTS`, preserving any active run context and the same explicit advice mode.
- **Plan**: Trigger slash command `/plan:fast <detailed-instruction-prompt>` to create an implementation plan based on scout findings and fast preflight.
- **Implementation**: Trigger slash command `/code <plan-path-name>` to implement the plan with compile/typecheck, tests, and code review gates. In explicit advice mode append exactly one trailing `--advice`; otherwise append none. Pass any active run context forward. `/code` is the sole durable-state owner and enforces the full lifecycle per `## Caller lifecycle binding`. Root `/cook:auto:fast` delegates ownership to `/code`; do not mutate captured plan, report, or doc files after `/code` seals the run, and do not duplicate substantive finalization.
- **Fallback handoff**: If `/code` finds broad scope, failing tests, critical review issues, or unclear acceptance criteria, continue with base `/cook` or `/fix:hard` using `WORK_ARGUMENTS`, preserving any active run context; append exactly one trailing `--advice` in explicit mode and otherwise pass no `--advice` token. Preserve scoped approval and commit behavior (no actual commit now).
