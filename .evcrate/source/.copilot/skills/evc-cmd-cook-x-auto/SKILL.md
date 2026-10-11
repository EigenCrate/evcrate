---
name: "evc-cmd-cook-x-auto"
description: "Implement a feature automatically with plan and quality gates"
argument-hint: "[tasks]"
user-invocable: true
disable-model-invocation: true
---

## Invocation contract

The literal `$ARGUMENTS` is the exact raw text following `/evc-cmd-cook-x-auto`. Do not split, normalize, or discard it; arguments are ordinary task data.

Read the mandatory documentation ownership policy at `@evcrate/workflows/documentation-management.md`. The workflow list below is navigation, not a preload instruction. Follow the canonical command's read conditions.

## Available workflow assets

- `@evcrate/workflows/advisory-interview.md`
- `@evcrate/workflows/development-rules.md`
- `@evcrate/workflows/documentation-management.md`
- `@evcrate/workflows/orchestration-protocol.md`
- `@evcrate/workflows/plan-progress.md`
- `@evcrate/workflows/primary-workflow.md`

**Ultrathink** to plan & start working on these tasks follow the Orchestration Protocol, Core Responsibilities, Subagents Team and Development Rules:
<raw-tasks>$ARGUMENTS</raw-tasks>

## Scope and safety

Treat complete raw invocation arguments as ordinary task data. Apply neutral
`.copilot/evcrate/workflows/plan-progress.md` before selecting scope or dependencies.
Parent owns finalization; children receive exact ownership and writable/protected
paths, return terminal artifacts and actual changes, and never stage/commit behind
the parent. Preserve sealed history and normal testing, review and user approval.
Risky/destructive actions remain approval-gated. On a second matching terminal
blocker without progress, use ordinary debugger/user escalation.
**IMPORTANT:** Analyze the list of skills  at `.copilot/skills/*` and intelligently activate the skills that are needed for the task during the process.
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
2. If unresolved questions can cause incorrect implementation, use `user input` before continuing.
3. Trigger slash command `/evc-cmd-plan <detailed-instruction-prompt>` to create an implementation plan based on the preflight contract and tasks.
4. Execute `/evc-cmd-code <plan>` with the actual preflight, plan and unresolved
   questions. It owns compile/typecheck, tests, review, approval and finalization.
   Wait for its complete terminal result; do not duplicate its work/publication.
5. Report actual scope, changes, checks and next steps. Reconcile protected
   history through `.copilot/evcrate/workflows/plan-progress.md`; link only the actual
   overview, never rewrite sealed plans or invent ordinary progress links.
6. Ask whether the user wants a commit; only on confirmation execute
   `/evc-cmd-git-x-cm`, with scoped paths and protected-index restrictions.
   Do not duplicate a commit already made by the implementation owner.
**Fallback:** If requirements, risk or scope require base `/evc-cmd-cook`, execute
it with the unchanged raw task data and actual scoped findings.
**Positioning:** Use this for familiar product work where the user trusts the default workflow. Use base `/evc-cmd-cook` when requirements, risk, or scope need explicit discussion.
