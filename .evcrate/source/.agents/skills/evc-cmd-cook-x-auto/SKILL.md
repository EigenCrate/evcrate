---
name: "evc-cmd-cook-x-auto"
description: "Implement a feature automatically (\\\"trust me bro\\\")"
---

# evc-cmd-cook-x-auto

Command Path: $evc-cmd-cook-x-auto

Description: Implement a feature automatically (\"trust me bro\")

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
<tasks>{{args}}</tasks>

**IMPORTANT:** Analyze the list of skills  at `.agents/skills/*` and intelligently activate the skills that are needed for the task during the process.
**Ensure token efficiency while maintaining high quality.**

## Workflow

This is the lower-friction `$evc-cmd-cook` variant. It can reduce user checkpoints, but it must not bypass planning, tests, or review.

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
4. Trigger slash command `$evc-cmd-code <plan>` to implement the plan with compile/typecheck, tests, code review, and approval gates.
5. Finally use `request_user_input` tool to ask user if he wants to commit to git repository, if yes trigger `$evc-cmd-git-x-cm` slash command to create a commit.

**Positioning:** Use this for familiar product work where the user trusts the default workflow. Use base `$evc-cmd-cook` when requirements, risk, or scope need explicit discussion.
