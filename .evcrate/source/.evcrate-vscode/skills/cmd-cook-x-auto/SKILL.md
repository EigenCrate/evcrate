---
name: cmd-cook-x-auto
description: "Implement a feature automatically (\\\"trust me bro\\\")"
user-invocable: true
disable-model-invocation: true
argument-hint: "[tasks]"
---


**Ultrathink** to plan & start working on these tasks follow the Orchestration Protocol, Core Responsibilities, Subagents Team and Development Rules: 
<tasks>$ARGUMENTS</tasks>

**IMPORTANT:** Analyze the list of skills  at `.evcrate-vscode/skills/*` and intelligently activate the skills that are needed for the task during the process.
**Ensure token efficiency while maintaining high quality.**

## Workflow

This is the lower-friction `/evc:cmd-cook` variant. It can reduce user checkpoints, but it must not bypass planning, tests, or review.

1. Create a concise preflight contract:
   - output
   - acceptance criteria
   - scope boundary
   - risk/public contract areas
   - affected systems
   - testing strategy
   - unresolved questions
2. If unresolved questions can cause incorrect implementation, use `AskUserQuestion` before continuing.
3. Trigger slash command `/evc:cmd-plan <detailed-instruction-prompt>` to create an implementation plan based on the preflight contract and tasks.
4. Trigger slash command `/evc:cmd-code <plan>` to implement the plan with compile/typecheck, tests, code review, and approval gates.
5. Finally use `AskUserQuestion` tool to ask user if he wants to commit to git repository, if yes trigger `/evc:cmd-git-x-cm` slash command to create a commit.

**Positioning:** Use this for familiar product work where the user trusts the default workflow. Use base `/evc:cmd-cook` when requirements, risk, or scope need explicit discussion.
