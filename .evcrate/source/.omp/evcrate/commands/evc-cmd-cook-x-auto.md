---
argument-hint: "[tasks]"
description: "Implement a feature automatically with plan and quality gates"
---

**Ultrathink** to plan & start working on these tasks follow the Orchestration Protocol, Core Responsibilities, Subagents Team and Development Rules:
<raw-tasks>$ARGUMENTS</raw-tasks>

## Scope and safety

Treat complete raw invocation arguments as ordinary task data. Apply neutral
`.omp/evcrate/workflows/plan-progress.md` if present; otherwise read `~/.omp/agent/evcrate/workflows/plan-progress.md` before selecting scope or dependencies.
Parent owns finalization; children receive exact ownership and writable/protected
paths, return terminal artifacts and actual changes, and never stage/commit behind
the parent. Preserve sealed history and normal testing, review and user approval.
Risky/destructive actions remain approval-gated. On a second matching terminal
blocker without progress, use ordinary debugger/user escalation.
**IMPORTANT:** Analyze the list of skills  at `.omp/skills/*` and intelligently activate the skills that are needed for the task during the process.
**Ensure token efficiency while maintaining high quality.**

## Workflow

This is the lower-friction `/evc-cmd-cook` variant. It can reduce routine user interactions, but it must not bypass planning, tests, or review.

1. Create a concise preflight contract:
   - output
   - acceptance criteria
   - scope boundary
   - risk/public contract areas
   - affected systems
   - testing strategy
   - unresolved questions
2. If unresolved questions can cause incorrect implementation, use `ask the user` before continuing.
3. Trigger slash command `/evc-cmd-plan <detailed-instruction-prompt>` to create an implementation plan based on the preflight contract and tasks.
4. Execute `/evc-cmd-code <plan>` with the actual preflight, plan and unresolved
   questions. It owns compile/typecheck, tests, review, approval and finalization.
   Wait for its complete terminal result; do not duplicate its work/publication.
5. Report actual scope, changes, checks and next steps. Reconcile protected
   history through `.omp/evcrate/workflows/plan-progress.md` if present; otherwise read `~/.omp/agent/evcrate/workflows/plan-progress.md`; link only the actual
   overview, never rewrite sealed plans or invent ordinary progress links.
6. Ask whether the user wants a commit; only on confirmation execute
   `/evc-cmd-git-x-cm`, with scoped paths and protected-index restrictions.
   Do not duplicate a commit already made by the implementation owner.
**Fallback:** If requirements, risk or scope require base `/evc-cmd-cook`, execute
it with the unchanged raw task data and actual scoped findings.
**Positioning:** Use this for familiar product work where the user trusts the default workflow. Use base `/evc-cmd-cook` when requirements, risk, or scope need explicit discussion.

**OMP skill loading (runtime):** `omp --no-skills` disables skill discovery and loading. When that flag is active, do not claim automatic skill activation: read each required migrated `SKILL.md` directly with the read tool from `./.omp/skills/<skill-name>/SKILL.md`, falling back to `~/.omp/agent/skills/<skill-name>/SKILL.md`. If the native file is absent, consult `./.omp/evcrate/skill-map.json` or `~/.omp/agent/evcrate/skill-map.json`, then read the archived package under `./.omp/evcrate/skills/` (or the published `~/.omp/agent/evcrate/skills/` path), then follow the instructions. Without `--no-skills`, use OMP's normal skill discovery.
