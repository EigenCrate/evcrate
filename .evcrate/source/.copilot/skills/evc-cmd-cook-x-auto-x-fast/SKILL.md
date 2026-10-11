---
name: "evc-cmd-cook-x-auto-x-fast"
description: "Low-risk fast cook: scout, plan fast, implement with quality gates"
argument-hint: "[tasks-or-prompt]"
user-invocable: true
disable-model-invocation: true
---

## Invocation contract

The literal `$ARGUMENTS` is the exact raw text following `/evc-cmd-cook-x-auto-x-fast`. Do not split, normalize, or discard it; arguments are ordinary task data.

Read the mandatory documentation ownership policy at `@evcrate/workflows/documentation-management.md`. The workflow list below is navigation, not a preload instruction. Follow the canonical command's read conditions.

## Available workflow assets

- `@evcrate/workflows/development-rules.md`
- `@evcrate/workflows/documentation-management.md`
- `@evcrate/workflows/orchestration-protocol.md`
- `@evcrate/workflows/primary-workflow.md`

Think harder to plan & start working on these tasks follow the Orchestration Protocol, Core Responsibilities, Subagents Team and Development Rules:
<tasks>$ARGUMENTS</tasks>

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

- **Scout**: Use `evc-scout` subagent to find related resources, documents, tests, public contracts, and code snippets in the current codebase.
- **Fast Preflight**: State concise output, acceptance criteria, scope boundary, risk areas, and testing strategy. If any item is unclear or high risk, stop and route to base `/evc-cmd-cook`.
- **Plan**: Trigger slash command `/evc-cmd-plan-x-fast <detailed-instruction-prompt>` to create an implementation plan based on scout findings and fast preflight.
- **Implementation**: Trigger slash command `/evc-cmd-code <plan-path-name>` to implement the plan with compile/typecheck, tests, and code review gates.
- **Escalation**: If `/evc-cmd-code` finds broad scope, failing tests, critical review issues, or unclear acceptance criteria, stop fast mode and continue with base `/evc-cmd-cook` or `/evc-cmd-fix-x-hard`.
