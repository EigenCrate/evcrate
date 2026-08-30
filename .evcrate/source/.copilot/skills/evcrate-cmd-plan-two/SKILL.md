---
name: "evcrate-cmd-plan-two"
description: "⚡⚡⚡⚡ Research & create an implementation plan with 2 approaches"
argument-hint: "[task]"
user-invocable: true
disable-model-invocation: true
---

## Invocation contract

The literal `$ARGUMENTS` is the exact raw text following `/evcrate-cmd-plan-two`. Do not split, normalize, or discard it before the canonical command parses it.

Before executing this command, read these EVCrate workflow assets:
- `@evcrate/workflows/advisor-mentoring.md`
- `@evcrate/workflows/advisory-interview.md`
- `@evcrate/workflows/development-rules.md`
- `@evcrate/workflows/documentation-management.md`
- `@evcrate/workflows/orchestration-protocol.md`
- `@evcrate/workflows/primary-workflow.md`

Think harder.
Activate `evcrate-planning` skill.

## Your mission
Use the `evcrate-planner` subagent to create 2 detailed implementation plans for this following task:
<task>
 $ARGUMENTS
</task>

## Workflow
1. First: Create a directory using naming pattern from `## Naming` section in injected context.
   Make sure you pass the directory path to every subagent during the process.
2. Follow strictly to the "Plan Creation & Organization" rules of `evcrate-planning` skill.
3. Use multiple `evcrate-researcher` agents in parallel to research for this task, each agent research for a different aspect of the task and perform max 5 researches (max 5 tool calls).
4. Use `evcrate-scout` agent to search the codebase for files needed to complete the task.
5. Main agent gathers all research and scout report filepaths, and pass them to `evcrate-planner` subagent with the detailed instructions prompt to create an implementation plan of this task.
  **Output:** Provide at least 2 implementation approaches with clear trade-offs, and explain the pros and cons of each approach, and provide a recommended approach.
1. Main agent receives the implementation plan from `evcrate-planner` subagent, and ask user to review the plan

## Plan File Specification
- Every `plan.md` MUST start with YAML frontmatter:
  ```yaml
  ---
  title: "{Brief title}"
  description: "{One sentence for card preview}"
  status: pending
  priority: P2
  effort: {sum of phases, e.g., 4h}
  branch: {current git branch}
  tags: [relevant, tags]
  created: {YYYY-MM-DD}
  ---
  ```

## Important Notes
**IMPORTANT:** Analyze the skills catalog and activate the skills that are needed for the task during the process.
**IMPORTANT:** Sacrifice grammar for the sake of concision when writing reports.
**IMPORTANT:** Ensure token efficiency while maintaining high quality.
**IMPORTANT:** In reports, list any unresolved questions at the end, if any.
**IMPORTANT**: **Do not** start implementing.
