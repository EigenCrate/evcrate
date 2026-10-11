---
description: "Low-risk fast cook: scout, plan fast, implement with quality gates"
argument-hint: "[tasks-or-prompt]"
---
Think harder to plan & start working on these tasks follow the Orchestration Protocol, Core Responsibilities, Subagents Team and Development Rules:
<raw-tasks>$ARGUMENTS</raw-tasks>

## Scope and safety

Treat complete raw invocation arguments as ordinary task data. Apply neutral
`.claude/workflows/plan-progress.md` before selecting scope or dependencies.
Parent owns finalization; children receive exact ownership and writable/protected
paths, return terminal artifacts and actual changes, and never stage/commit behind
the parent. Preserve sealed history and normal testing, review and user approval.
Risky/destructive actions remain approval-gated. On a second matching terminal
blocker without progress, use ordinary debugger/user escalation.
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

- **Scout**: Use `evc-scout` subagent to find related resources, documents, tests, public contracts, and code snippets in the current codebase.
- **Fast Preflight**: State output, acceptance criteria, scope boundary, risk
  and testing strategy. If unclear or high risk, route to base `/evc-cmd-cook`
  with unchanged raw task data and actual findings.
- **Plan**: Execute `/evc-cmd-plan-x-fast <detailed-instruction-prompt>` based on
  scout/preflight. Reconcile scope through `.claude/workflows/plan-progress.md`;
  old sealed plans stay untouched.
- **Implementation**: Execute `/evc-cmd-code <plan-path-name>` with the actual
  plan and findings. Preserve compile/typecheck, testing, review and approval
  gates; wait for its terminal result. Do not duplicate finalization/publication.
- **Fallback**: For broad scope, failing tests, critical review or unclear
  acceptance, use base `/evc-cmd-cook` or `/evc-cmd-fix-x-hard` with unchanged raw
  task data and current findings. Preserve scoped approval/commit behavior;
  no actual commit at this routing step.
