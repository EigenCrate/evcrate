---
name: cmd_cook_auto
description: ⚡⚡ Implement a feature automatically with plan and quality gates
---
# cmd_cook_auto

Command Path: /cook/auto

Description: ⚡⚡ Implement a feature automatically with plan and quality gates

Codex note: when this recipe says to run another `/...` command, invoke the matching `cmd_*` skill for that path.

For high-impact architecture, security, debugging, or review decisions, consider explicit `$advisor-strategy` use for current-session guidance; this pointer does not activate it.

**Ultrathink** to plan & start working on these tasks follow the Orchestration Protocol, Core Responsibilities, Subagents Team and Development Rules:
<tasks>{{args}}</tasks>

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
4. Use the matching `cmd_*` skill to run `/code <plan>` to implement the plan with compile/typecheck, tests, code review, and approval gates.
5. Finally use `request_user_input` tool to ask user if he wants to commit to git repository, if yes use the matching `cmd_*` skill to run `/git/cm` to create a commit.

**Positioning:** Use this for familiar product work where the user trusts the default workflow. Use base `/cook` when requirements, risk, or scope need explicit discussion.
