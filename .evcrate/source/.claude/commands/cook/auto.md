---
description: "Implement a feature automatically with plan and quality gates"
argument-hint: "[tasks] [--advice]"
---
**Ultrathink** to plan & start working on these tasks follow the Orchestration Protocol, Core Responsibilities, Subagents Team and Development Rules:
<raw-tasks>$ARGUMENTS</raw-tasks>

## Canonical checkpoint routing

Named checkpoints use the canonical `evcrate-advisor-checkpoint/v2` dispatcher block in
`.claude/workflows/advisor-mentoring.md`; this command supplies bounded evidence
and does not duplicate route or adapter selection.

## Advice Mode

A final standalone `--advice` activates explicit review mentoring in `/code`.
Before planning, read `.claude/workflows/advisor-mentoring.md` (specifically
`## Argument mode` and `## Caller lifecycle binding`) and derive `WORK_ARGUMENTS`
plus explicit/default advice mode. Use `WORK_ARGUMENTS` as the tasks input.
Apply the shared default stuck-escalation contract.

If an active advisor run context is already present from an earlier named
checkpoint (such as a direction, decision, or stuck checkpoint in this session),
retain its identity and context: `task_run_id`, active phase, project root,
current state revision, prior consultation, counsel, disposition, and outcome.
Pass that same active run context forward to `/code`. Never initialize a new
UUID or create redundant consultations. If no prior advice checkpoint exists,
`/cook:auto` remains stateless: never initialize state at command start just to
track preflight or planning.

For every fallback handoff, pass `WORK_ARGUMENTS`, preserve any active run
context, append exactly one trailing `--advice` in explicit mode, and otherwise
pass no `--advice` token.
**IMPORTANT:** Analyze the list of skills  at `.claude/skills/*` and intelligently activate the skills that are needed for the task during the process.
**Ensure token efficiency while maintaining high quality.**

## Workflow

This is the lower-friction `/cook` variant. It can reduce user checkpoints, but it must not bypass planning, tests, or review.

1. Create a concise preflight contract:
   - output
   - acceptance criteria
   - scope boundary
   - risk/public contract areas
   - affected systems
   - testing strategy
   - unresolved questions
2. If unresolved questions can cause incorrect implementation, use `AskUserQuestion` before continuing.
3. Trigger slash command `/plan <detailed-instruction-prompt>` to create an implementation plan based on the preflight contract and tasks.
4. Trigger slash command `/code <plan>` to implement the plan with compile/typecheck, tests, code review, and approval gates. In explicit advice mode append exactly one trailing `--advice`; otherwise append none. Pass any active run context forward. `/code` is the sole durable-state owner and enforces the full lifecycle per `## Caller lifecycle binding`. Root `/cook:auto` delegates ownership to `/code`; do not mutate captured plan, report, doc files, or Git index state after `/code` seals the run, and do not duplicate substantive finalization. In explicit advice mode, phase-owned configuration, onboarding, and selected Git decisions/execution belong to the implementation owner's pre-outcome finalization; pass such decisions to `/code` before delegation/sealing.
5. Postimplementation and commit handling:
   - In explicit advice mode: selected Git decisions and index transitions belong to the implementation owner's pre-outcome finalization and were executed by `/code` prior to sealing. After `/code` seals the run, perform no Git commits (`/git:cm`), index mutations, or captured file writes; emit readonly guidance or an uncaptured administrative receipt strictly outside the captured baseline snapshot only.
   - In default mode: explicitly preserve existing default-mode postimplementation behavior: use `AskUserQuestion` tool to ask user if he wants to commit to git repository, if yes trigger `/git:cm` slash command to create a commit. Preserve scoped approval and commit behavior; do not execute an automatic commit without explicit user confirmation.

**Fallback handoff:** If requirements, risk, or scope require base `/cook`, invoke
it with `WORK_ARGUMENTS`, preserve any active run context, and preserve the same
explicit advice mode exactly once (append `--advice` only in explicit mode).
**Positioning:** Use this for familiar product work where the user trusts the default workflow. Use base `/cook` when requirements, risk, or scope need explicit discussion.
