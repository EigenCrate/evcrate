---
name: "evcrate-cmd-cook-auto"
description: "Implement a feature automatically with plan and quality gates"
argument-hint: "[tasks] [--advice]"
user-invocable: true
disable-model-invocation: true
---

## Invocation contract

The literal `$ARGUMENTS` is the exact raw text following `/evcrate-cmd-cook-auto`. Do not split, normalize, or discard it before the canonical command parses it.

Before executing this command, read these EVCrate workflow assets:
- `@evcrate/workflows/advisor-mentoring.md`
- `@evcrate/workflows/advisory-interview.md`
- `@evcrate/workflows/development-rules.md`
- `@evcrate/workflows/documentation-management.md`
- `@evcrate/workflows/orchestration-protocol.md`
- `@evcrate/workflows/primary-workflow.md`

**Ultrathink** to plan & start working on these tasks follow the Orchestration Protocol, Core Responsibilities, Subagents Team and Development Rules:
<raw-tasks>$ARGUMENTS</raw-tasks>

## Canonical checkpoint routing

Named checkpoints use the canonical `evcrate-advisor-checkpoint/v2` dispatcher block in
`.copilot/evcrate/workflows/advisor-mentoring.md`; this command supplies bounded evidence
and does not duplicate route or adapter selection.

## Advice Mode

A final standalone `--advice` activates explicit review mentoring in `/evcrate-cmd-code`.
Before planning, read `.copilot/evcrate/workflows/advisor-mentoring.md` (specifically
`## Argument mode` and `## Caller lifecycle binding`) and derive `WORK_ARGUMENTS`
plus explicit/default advice mode. Use `WORK_ARGUMENTS` as the tasks input.
Apply the shared default stuck-escalation contract.

If an active advisor run context is already present from an earlier named
checkpoint (such as a direction, decision, or stuck checkpoint in this session),
retain its identity and context: `task_run_id`, active phase, project root,
current state revision, prior consultation, counsel, disposition, and outcome.
Pass that same active run context forward to `/evcrate-cmd-code`. Never initialize a new
UUID or create redundant consultations. If no prior advice checkpoint exists,
`/evcrate-cmd-cook-auto` remains stateless: never initialize state at command start just to
track preflight or planning.

For every fallback handoff, pass `WORK_ARGUMENTS`, preserve any active run
context, append exactly one trailing `--advice` in explicit mode, and otherwise
pass no `--advice` token.
**IMPORTANT:** Analyze the list of skills  at `.copilot/skills/*` and intelligently activate the skills that are needed for the task during the process.
**Ensure token efficiency while maintaining high quality.**

## Workflow

This is the lower-friction `/evcrate-cmd-cook` variant. It can reduce user checkpoints, but it must not bypass planning, tests, or review.

1. Create a concise preflight contract:
   - output
   - acceptance criteria
   - scope boundary
   - risk/public contract areas
   - affected systems
   - testing strategy
   - unresolved questions
2. If unresolved questions can cause incorrect implementation, use `user input` before continuing.
3. Trigger slash command `/evcrate-cmd-plan <detailed-instruction-prompt>` to create an implementation plan based on the preflight contract and tasks.
4. Trigger slash command `/evcrate-cmd-code <plan>` to implement the plan with compile/typecheck, tests, code review, and approval gates. In explicit advice mode append exactly one trailing `--advice`; otherwise append none. Pass any active run context forward. `/evcrate-cmd-code` is the sole durable-state owner and enforces the full lifecycle per `## Caller lifecycle binding`. Root `/evcrate-cmd-cook-auto` delegates ownership to `/evcrate-cmd-code`; do not mutate captured plan, report, doc files, or Git index state after `/evcrate-cmd-code` seals the run, and do not duplicate substantive finalization. In explicit advice mode, phase-owned configuration, onboarding, and selected Git decisions/execution belong to the implementation owner's pre-outcome finalization; pass such decisions to `/evcrate-cmd-code` before delegation/sealing.
5. Postimplementation and commit handling:
   - In explicit advice mode: selected Git decisions and index transitions belong to the implementation owner's pre-outcome finalization and were executed by `/evcrate-cmd-code` prior to sealing. After `/evcrate-cmd-code` seals the run, perform no Git commits (`/evcrate-cmd-git-cm`), index mutations, or captured file writes; emit readonly guidance or an uncaptured administrative receipt strictly outside the captured baseline snapshot only.
   - In default mode: explicitly preserve existing default-mode postimplementation behavior: use `user input` tool to ask user if he wants to commit to git repository, if yes trigger `/evcrate-cmd-git-cm` slash command to create a commit. Preserve scoped approval and commit behavior; do not execute an automatic commit without explicit user confirmation.

**Fallback handoff:** If requirements, risk, or scope require base `/evcrate-cmd-cook`, invoke
it with `WORK_ARGUMENTS`, preserve any active run context, and preserve the same
explicit advice mode exactly once (append `--advice` only in explicit mode).
**Positioning:** Use this for familiar product work where the user trusts the default workflow. Use base `/evcrate-cmd-cook` when requirements, risk, or scope need explicit discussion.
