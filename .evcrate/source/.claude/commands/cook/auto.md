---
description: ⚡⚡ Implement a feature automatically with plan and quality gates
argument-hint: [tasks] [--advice]
---

**Ultrathink** to plan & start working on these tasks follow the Orchestration Protocol, Core Responsibilities, Subagents Team and Development Rules:
<raw-tasks>$ARGUMENTS</raw-tasks>

## Canonical checkpoint routing

Named checkpoints use the `evcrate-advisor-checkpoint/v1` dispatcher block in
`.claude/workflows/advisor-mentoring.md`; this command supplies bounded evidence
and does not duplicate route or adapter selection.

## Advice Mode

A final standalone `--advice` activates explicit review mentoring in `/code`.
Before planning, read `.claude/workflows/advisor-mentoring.md` and derive
`WORK_ARGUMENTS` plus explicit/default advice mode. Use `WORK_ARGUMENTS` as the
tasks input. Apply the shared default stuck-escalation contract.
For every fallback handoff, pass `WORK_ARGUMENTS`; append exactly one trailing
`--advice` in explicit mode and otherwise pass no `--advice` token.

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
4. Trigger slash command `/code <plan>` to implement the plan with compile/typecheck, tests, code review, and approval gates. In explicit advice mode append exactly one trailing `--advice`; otherwise append none.
5. Finally use `AskUserQuestion` tool to ask user if he wants to commit to git repository, if yes trigger `/git:cm` slash command to create a commit.

**Fallback handoff:** If requirements, risk, or scope require base `/cook`, invoke
it with `WORK_ARGUMENTS` and preserve the same explicit advice mode exactly once.

**Positioning:** Use this for familiar product work where the user trusts the default workflow. Use base `/cook` when requirements, risk, or scope need explicit discussion.
