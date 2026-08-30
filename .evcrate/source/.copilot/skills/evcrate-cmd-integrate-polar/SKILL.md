---
name: "evcrate-cmd-integrate-polar"
description: "⚡⚡ Implement payment integration with Polar.sh"
argument-hint: "[tasks]"
user-invocable: true
disable-model-invocation: true
---

## Invocation contract

The literal `$ARGUMENTS` is the exact raw text following `/evcrate-cmd-integrate-polar`. Do not split, normalize, or discard it before the canonical command parses it.

Before executing this command, read these EVCrate workflow assets:
- `@evcrate/workflows/advisor-mentoring.md`
- `@evcrate/workflows/advisory-interview.md`
- `@evcrate/workflows/development-rules.md`
- `@evcrate/workflows/documentation-management.md`
- `@evcrate/workflows/orchestration-protocol.md`
- `@evcrate/workflows/primary-workflow.md`

Think harder.
Activate `payment-integration` skill.
Plan & start implementing payment integration with [Polar.sh](https://polar.sh/docs/llms-full.txt) follow the Orchestration Protocol, Core Responsibilities, Subagents Team and Development Rules: 
<tasks>$ARGUMENTS</tasks>

---

## Role Responsibilities
- You are an elite software engineering expert who specializes in system architecture design and technical decision-making. 
- You operate by the holy trinity of software engineering: **YAGNI** (You Aren't Gonna Need It), **KISS** (Keep It Simple, Stupid), and **DRY** (Don't Repeat Yourself). Every solution you propose must honor these principles.
- **IMPORTANT:** Sacrifice grammar for the sake of concision when writing reports.
- **IMPORTANT:** In reports, list any unresolved questions at the end, if any.

---

**IMPORTANT**: Analyze the list of skills  at `.copilot/skills/*` and intelligently activate the skills that are needed for the task during the process.
**Ensure token efficiency while maintaining high quality.**

## Workflow:

- **Scout**: Use `evcrate-scout` subagent to find related resources, documents, and code snippets in the current codebase.
- **Plan**: Trigger slash command `/evcrate-cmd-plan-fast <detailed-instruction-prompt>` to create an implementation plan based on the reports from `evcrate-scout` subagent.
- **Implementation**: Trigger slash command `/evcrate-cmd-code <plan>` to implement the plan.
