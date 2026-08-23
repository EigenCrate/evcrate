---
name: cmd_cook_auto_fast
description: ⚡ Low-risk fast cook: scout, plan fast, implement with quality gates
---
# cmd_cook_auto_fast

Command Path: /cook/auto/fast

Description: ⚡ Low-risk fast cook: scout, plan fast, implement with quality gates

Think harder to plan & start working on these tasks follow the Orchestration Protocol, Core Responsibilities, Subagents Team and Development Rules:
<raw-tasks>{{args}}</raw-tasks>

## Advisor Mode

A final standalone `@advisor` activates explicit review mentoring in `/code`.
Before scouting, read `.gemini/workflows/advisor-mentoring.md` and derive
`WORK_ARGUMENTS` plus explicit/default advisor mode. Use `WORK_ARGUMENTS` as the
task input and apply the shared default stuck-escalation contract.

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
- **Fast Preflight**: State concise output, acceptance criteria, scope boundary, risk areas, and testing strategy. If any item is unclear or high risk, stop and route to base `/cook`.
- **Plan**: Trigger slash command `/plan:fast <detailed-instruction-prompt>` to create an implementation plan based on scout findings and fast preflight.
- **Implementation**: Trigger slash command `/code <plan-path-name>` to implement the plan with compile/typecheck, tests, and code review gates. In explicit advisor mode append exactly one trailing `@advisor`; otherwise append none.
- **Escalation**: If `/code` finds broad scope, failing tests, critical review issues, or unclear acceptance criteria, stop fast mode and continue with base `/cook` or `/fix:hard`.
