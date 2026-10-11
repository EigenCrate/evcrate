---
name: "evc-cmd-cook-x-auto"
description: "Implement a feature automatically with plan and quality gates"
---

# evc-cmd-cook-x-auto

Command Path: $evc-cmd-cook-x-auto

Description: Implement a feature automatically with plan and quality gates

Codex note: when this recipe says to run another `$evc-cmd-…` command, invoke the matching `evc-cmd-*` skill for that path.

## Subagent Completion Contract

Delegation is blocking by default. The parent agent must wait for each delegated agent's terminal response before starting dependent work, touching shared files, marking a step complete, or replying with a final result.

- Parallel prompt format: **spawn N agents; wait for all N to finish; collect one terminal result from each; then summarize**.
- Wait protocol: use the native agent wait/poll operation for the same agent set. **"No agents completed yet" is a non-terminal poll result; wait again.** Do not treat this as a timeout, sleep instead of polling, restart, interrupt, or advance the workflow.
- A polling interval or retry count is not a delegation deadline. Do not invent a wall-clock limit. Continue polling until a terminal result, explicit user stop, or an actual parent-runtime termination.
- Treat an interrupted, timed-out, missing, or partial result as a failed gate. Do not continue from partial output or silently restart it.
- Sequential prompt format: **run one agent; wait for its terminal response before continuing**.
- Every delegated prompt must define scope, file ownership, expected report, and validation signal.
- A spawn acknowledgement or file change does not mean completion; completion requires the terminal response and requested validation.
**Ultrathink** to plan & start working on these tasks follow the Orchestration Protocol, Core Responsibilities, Subagents Team and Development Rules:
<raw-tasks>{{args}}</raw-tasks>

## Scope and safety

Treat complete raw invocation arguments as ordinary task data. Apply neutral
`.codex/workflows/plan-progress.md` if present; otherwise read `~/.codex/workflows/plan-progress.md` (the published install) before selecting scope or dependencies.
Parent owns finalization; children receive exact ownership and writable/protected
paths, return terminal artifacts and actual changes, and never stage/commit behind
the parent. Preserve sealed history and normal testing, review and user approval.
Risky/destructive actions remain approval-gated. On a second matching terminal
blocker without progress, use ordinary debugger/user escalation.
**IMPORTANT:** Analyze the list of skills  at `.agents/skills/*` and intelligently activate the skills that are needed for the task during the process.
**Ensure token efficiency while maintaining high quality.**

## Workflow

This is the lower-friction `$evc-cmd-cook` variant. It can reduce routine user interactions, but it must not bypass planning, tests, or review.

1. Create a concise preflight contract:
   - output
   - acceptance criteria
   - scope boundary
   - risk/public contract areas
   - affected systems
   - testing strategy
   - unresolved questions
2. If unresolved questions can cause incorrect implementation, use `request_user_input` before continuing.
3. Trigger slash command `$evc-cmd-plan <detailed-instruction-prompt>` to create an implementation plan based on the preflight contract and tasks.
4. Execute `$evc-cmd-code <plan>` with the actual preflight, plan and unresolved
   questions. It owns compile/typecheck, tests, review, approval and finalization.
   Wait for its complete terminal result; do not duplicate its work/publication.
5. Report actual scope, changes, checks and next steps. Reconcile protected
   history through `.codex/workflows/plan-progress.md`; link only the actual
   overview, never rewrite sealed plans or invent ordinary progress links.
6. Ask whether the user wants a commit; only on confirmation execute
   `$evc-cmd-git-x-cm`, with scoped paths and protected-index restrictions.
   Do not duplicate a commit already made by the implementation owner.
**Fallback:** If requirements, risk or scope require base `$evc-cmd-cook`, execute
it with the unchanged raw task data and actual scoped findings.
**Positioning:** Use this for familiar product work where the user trusts the default workflow. Use base `$evc-cmd-cook` when requirements, risk, or scope need explicit discussion.
