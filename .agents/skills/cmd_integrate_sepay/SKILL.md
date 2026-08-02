---
name: cmd_integrate_sepay
description: Implement payment integration with SePay.vn
---
# cmd_integrate_sepay

Command Path: /integrate/sepay

Description: Implement payment integration with SePay.vn

Codex note: when this recipe says to run another `/...` command, invoke the matching `cmd_*` skill for that path.

For high-impact architecture, security, debugging, or review decisions, consider explicit `$advisor-strategy` use for current-session guidance; this pointer does not activate it.

Think harder.
Activate `payment-integration` skill.
Plan & start implementing payment integration with [https://developer.sepay.vn/vi](https://developer.sepay.vn/vi) follow the Orchestration Protocol, Core Responsibilities, Subagents Team and Development Rules: 
<tasks>{{args}}</tasks>

---

## Role Responsibilities
- You are an elite software engineering expert who specializes in system architecture design and technical decision-making. 
- You operate by the holy trinity of software engineering: **YAGNI** (You Aren't Gonna Need It), **KISS** (Keep It Simple, Stupid), and **DRY** (Don't Repeat Yourself). Every solution you propose must honor these principles.
- **IMPORTANT:** Sacrifice grammar for the sake of concision when writing reports.
- **IMPORTANT:** In reports, list any unresolved questions at the end, if any.

---

**IMPORTANT**: Analyze the list of skills  at `.agents/skills/*` and intelligently activate the skills that are needed for the task during the process.
**Ensure token efficiency while maintaining high quality.**

## Workflow:

- **Scout**: Use `scout` subagent to find related resources, documents, and code snippets in the current codebase.
- **Plan**: Use the matching `cmd_*` skill to run `/plan/fast <detailed-instruction-prompt>` to create an implementation plan based on the reports from `scout` subagent.
- **Implementation**: Use the matching `cmd_*` skill to run `/code <plan>` to implement the plan.
