---
name: "cmd-cook-auto"
description: "Implement a feature automatically with plan and quality gates"
---

# cmd_cook_auto

Command Path: /cook:auto

Description: Implement a feature automatically with plan and quality gates

Codex note: when this recipe says to run another `/...` command, invoke the matching `cmd_*` skill for that path.

For high-impact architecture, security, debugging, or review decisions, consider explicit `$advisor-strategy` use for current-session guidance; this pointer does not activate it.

## Subagent Completion Contract

Delegation is blocking by default. The parent agent must wait for each delegated agent's terminal response before starting dependent work, touching shared files, marking a step complete, or replying with a final result.

- Parallel prompt format: **spawn N agents; wait for all N to finish; collect one terminal result from each; then summarize**.
- Wait protocol: use the native agent wait/poll operation for the same agent set. **"No agents completed yet" is a non-terminal poll result; wait again.** Do not treat it as a timeout, sleep instead of polling, restart, interrupt, or advance the workflow.
- A polling interval or retry count is not a delegation deadline. Do not invent a wall-clock limit (including 180 seconds) for a blocking gate. Continue polling until a terminal result, explicit user stop, or an actual parent-runtime termination.
- Treat an interrupted, timed-out, missing, or partial result as a failed gate. Do not continue from partial work or silently skip/restart the agent.
- Sequential prompt format: **run one agent; wait for its terminal result; verify the report/artifacts; then run the next agent**.
- Every delegated prompt must define scope, file ownership, expected report/artifact, and validation signal.
- A spawn acknowledgement, progress event, or file change does not mean the agent completed. Completion requires the terminal response and requested validation.
- If the parent runtime ends before completion, preserve the agent identity and report the gate as incomplete; never fabricate a result or launch a replacement.

**Ultrathink** to plan & start working on these tasks follow the Orchestration Protocol, Core Responsibilities, Subagents Team and Development Rules:
<raw-tasks>{{args}}</raw-tasks>

## Canonical checkpoint routing

Named checkpoints use the `evcrate-advisor-checkpoint/v1` dispatcher block in
`.codex/workflows/advisor-mentoring.md` if present; otherwise read `~/.codex/workflows/advisor-mentoring.md` (the published install); this command supplies bounded evidence
and does not duplicate route or adapter selection.

## Advice Mode

A final standalone `--advice` activates explicit review mentoring in `/code`.
Before planning, read `.codex/workflows/advisor-mentoring.md` if present; otherwise read `~/.codex/workflows/advisor-mentoring.md` (the published install) and derive
`WORK_ARGUMENTS` plus explicit/default advice mode. Use `WORK_ARGUMENTS` as the
tasks input. Apply the shared default stuck-escalation contract.
For every fallback handoff, pass `WORK_ARGUMENTS`; append exactly one trailing
`--advice` in explicit mode and otherwise pass no `--advice` token.

**IMPORTANT:** Analyze the list of skills  at `.agents/skills/*` and intelligently activate the skills that are needed for the task during the process.
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
2. If unresolved questions can cause incorrect implementation, use `request_user_input` before continuing.
3. Use the matching `cmd_*` skill to run `/plan <detailed-instruction-prompt>` to create an implementation plan based on the preflight contract and tasks.
4. Use the matching `cmd_*` skill to run `/code <plan>` to implement the plan with compile/typecheck, tests, code review, and approval gates. In explicit advice mode append exactly one trailing `--advice`; otherwise append none.
5. Finally use `request_user_input` tool to ask user if he wants to commit to git repository, if yes use the matching `cmd_*` skill to run `/git:cm` to create a commit.

**Fallback handoff:** If requirements, risk, or scope require base `/cook`, invoke
it with `WORK_ARGUMENTS` and preserve the same explicit advice mode exactly once.

**Positioning:** Use this for familiar product work where the user trusts the default workflow. Use base `/cook` when requirements, risk, or scope need explicit discussion.
