---
name: cmd-cook-auto-fast
description: "Low-risk fast cook: scout, plan fast, implement with quality gates"
user-invocable: true
disable-model-invocation: true
argument-hint: "[tasks-or-prompt] [--advice]"
---

Think harder to plan & start working on these tasks follow the Orchestration Protocol, Core Responsibilities, Subagents Team and Development Rules:
<raw-tasks>$ARGUMENTS</raw-tasks>

## Canonical checkpoint routing

When advice mode is active (`explicit` or `inherited`), named checkpoints use the canonical `evcrate-advisor-checkpoint/v2` dispatcher block in `.evcrate-vscode/evcrate/workflows/advisor-mentoring.md` if present; otherwise read `~/.evcrate-vscode/evcrate/workflows/advisor-mentoring.md` (the published install); this command supplies bounded evidence and does not duplicate route or adapter selection. In `off` mode, named checkpoints and mentoring lifecycle are never invoked.

## Advice Mode

Before discovery or routing, resolve the HOME helper per `.evcrate-vscode/evcrate/workflows/advice-activation.md` if present; otherwise read `~/.evcrate-vscode/evcrate/workflows/advice-activation.md` (the published install) with original `$ARGUMENTS`, canonical `context.command: "cook/auto/fast"` and the current root. A user-entered command always uses `handoff: null`. A handoff exists only when built by the router delegating this exact call; never reuse or replay one from earlier turns, commands, plans, reports or transcripts.
Preserve known selections from the exact-call router; use `work_target: "cook/auto/fast"` only when no such target exists, and null plan/phase fields only when unknown.
Set `WORK_ARGUMENTS = result.work_arguments` and `ADVICE_MODE = result.mode`; use the returned work input everywhere below.

Apply neutral `.evcrate-vscode/evcrate/workflows/plan-progress.md` if present; otherwise read `~/.evcrate-vscode/evcrate/workflows/plan-progress.md` (the published install) in every mode. Only resolved `explicit` or `inherited` loads `.evcrate-vscode/evcrate/workflows/advisor-mentoring.md` if present; otherwise read `~/.evcrate-vscode/evcrate/workflows/advisor-mentoring.md` (the published install) and follows its `## Caller lifecycle binding`; `off` keeps ordinary gates and uses only immutable in-repo receipts and sealed-path metadata, never `evcrate-advisor`, hard lifecycle or inference.
Activation failures and repeated blockers follow the shared activation contract; neither history nor a checkpoint activates advice.
This command is a stateless router; `/cmd-code` owns implementation and finalization. Delegate structured pre-run/same-run context per the activation contract, never initialize merely to route or append a synthetic flag.
---

## Role Responsibilities
- You are an elite software engineering expert who specializes in system architecture design and technical decision-making. 
- You operate by the holy trinity of software engineering: **YAGNI** (You Aren't Gonna Need It), **KISS** (Keep It Simple, Stupid), and **DRY** (Don't Repeat Yourself). Every solution you propose must honor these principles.
- **IMPORTANT:** Sacrifice grammar for the sake of concision when writing reports.
- **IMPORTANT:** In reports, list any unresolved questions at the end, if any.

---

**IMPORTANT**: Analyze the list of skills  at `.evcrate-vscode/skills/*` and intelligently activate the skills that are needed for the task during the process.
**Ensure token efficiency while maintaining high quality.**

## Positioning

Use this only for tiny, familiar, low-risk tasks or demos. Do not use it for public APIs, auth, permissions, payments, data migrations, security-sensitive code, or broad refactors.

## Workflow

- **Scout**: Use `scout` subagent to find related resources, documents, tests, public contracts, and code snippets in the current codebase.
- **Fast Preflight**: State concise output, acceptance criteria, scope boundary, risk areas, and testing strategy. If any item is unclear or high risk, stop and route to base `/cmd-cook` with `WORK_ARGUMENTS` and structured caller context per `.evcrate-vscode/evcrate/workflows/advice-activation.md` if present; otherwise read `~/.evcrate-vscode/evcrate/workflows/advice-activation.md` (the published install) (no synthetic flag).
- **Plan**: Trigger slash command `/cmd-plan-fast <detailed-instruction-prompt>` to create an implementation plan based on scout findings and fast preflight. For advice-controlled plans, link navigation to `<plan-dir>/progress.md` per `.evcrate-vscode/evcrate/workflows/plan-progress.md` if present; otherwise read `~/.evcrate-vscode/evcrate/workflows/plan-progress.md` (the published install) before capture; old sealed plans remain untouched.
- **Implementation**: Trigger slash command `/cmd-code <plan-path-name>` to implement the plan with compile/typecheck, tests, and code review gates without appending a synthetic `--advice` flag. Pass structured pre-run or same-run context per `.evcrate-vscode/evcrate/workflows/advice-activation.md` if present; otherwise read `~/.evcrate-vscode/evcrate/workflows/advice-activation.md` (the published install) when advice mode is active (`explicit` or `inherited`); pass no activation handoff when `off`. `/cmd-code` is the sole durable-state owner and enforces the full lifecycle per `## Caller lifecycle binding` in `.evcrate-vscode/evcrate/workflows/advisor-mentoring.md` if present; otherwise read `~/.evcrate-vscode/evcrate/workflows/advisor-mentoring.md` (the published install) and neutral reconciliation per `.evcrate-vscode/evcrate/workflows/plan-progress.md` if present; otherwise read `~/.evcrate-vscode/evcrate/workflows/plan-progress.md` (the published install). Root `/cmd-cook:auto:fast` is a delegate router and delegates ownership to `/cmd-code`; do not duplicate publication or durable controller operations. Preserved historical snapshot protection applies across runs even in `off` mode; prior sealed paths remain immutable, while current-run registered pre-seal writes within parent-authorized paths remain permitted. Never direct edits to sealed plans or metadata/roadmap after seal.
- **Fallback handoff**: If `/cmd-code` finds broad scope, failing tests, critical review issues, or unclear acceptance criteria, continue with base `/cmd-cook` or `/cmd-fix-hard` using `WORK_ARGUMENTS` and structured caller context per `.evcrate-vscode/evcrate/workflows/advice-activation.md` if present; otherwise read `~/.evcrate-vscode/evcrate/workflows/advice-activation.md` (the published install) (no synthetic flag). Preserve scoped approval and commit behavior (no actual commit now).
