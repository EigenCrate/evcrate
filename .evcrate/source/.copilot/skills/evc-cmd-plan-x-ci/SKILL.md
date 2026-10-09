---
name: "evc-cmd-plan-x-ci"
description: "Analyze Github Actions logs and provide a plan to fix the issues"
argument-hint: "[github-actions-url]"
user-invocable: true
disable-model-invocation: true
---

## Invocation contract

The literal `$ARGUMENTS` is the exact raw text following `/evc-cmd-plan-x-ci`. Do not split, normalize, or discard it before the canonical command parses it.

Read the mandatory documentation ownership policy at `@evcrate/workflows/documentation-management.md`. The workflow list below is navigation, not a preload instruction. Follow the canonical command's read conditions and activation-first ordering; load full mentoring only after resolved explicit or inherited mode.

## Available workflow assets

- `@evcrate/workflows/advice-activation.md`
- `@evcrate/workflows/advisor-mentoring.md`
- `@evcrate/workflows/advisory-interview.md`
- `@evcrate/workflows/development-rules.md`
- `@evcrate/workflows/documentation-management.md`
- `@evcrate/workflows/orchestration-protocol.md`
- `@evcrate/workflows/plan-progress.md`
- `@evcrate/workflows/primary-workflow.md`

Activate `evc-planning` skill.

## Github Actions URL
 $ARGUMENTS

Use the `evc-planner` subagent to read the github actions logs, analyze and find the root causes of the issues, then provide a detailed plan for implementing the fixes.

**Plan File Specification:**
- Every `plan.md` MUST start with YAML frontmatter:
  ```yaml
  ---
  title: "{Brief title}"
  description: "{One sentence for card preview}"
  status: pending
  priority: P1
  effort: {estimated fix time}
  branch: {current git branch}
  tags: [ci, bugfix]
  created: {YYYY-MM-DD}
  ---
  ```

**Output:**
Provide at least 2 implementation approaches with clear trade-offs, and explain the pros and cons of each approach, and provide a recommended approach.

**IMPORTANT:** Ask the user for confirmation before implementing.
**IMPORTANT:** Analyze the skills catalog and activate the skills that are needed for the task during the process.
**IMPORTANT:** Sacrifice grammar for the sake of concision when writing outputs.
