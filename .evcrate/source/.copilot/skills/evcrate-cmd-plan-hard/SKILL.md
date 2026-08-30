---
name: "evcrate-cmd-plan-hard"
description: "⚡⚡⚡ Research, analyze, and create an implementation plan"
argument-hint: "[task]"
user-invocable: true
disable-model-invocation: true
---

## Invocation contract

The literal `$ARGUMENTS` is the exact raw text following `/evcrate-cmd-plan-hard`. Do not split, normalize, or discard it before the canonical command parses it.

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
<task>
$ARGUMENTS
</task>

## Pre-Creation Check (Active vs Suggested Plan)

Check the `## Plan Context` section in the injected context:
- If "Plan:" shows a path → Active plan exists. Ask user: "Continue with this? [Y/n]"
- If "Suggested:" shows a path → Branch-matched hint only. Ask if they want to activate or create new.
- If "Plan: none" → Create new plan using naming from `## Naming` section.

## Workflow
1. If creating new: Create directory using `Plan dir:` from `## Naming` section, then run `node .copilot/evcrate/scripts/set-active-plan.cjs {plan-dir}`
   If reusing: Use the active plan path from Plan Context.
   Make sure you pass the directory path to every subagent during the process.
2. Follow strictly to the "Plan Creation & Organization" rules of `evcrate-planning` skill.
3. Use multiple `evcrate-researcher` agents (max 2 agents) in parallel to research for this task:
   Each agent research for a different aspect of the task and are allowed to perform max 5 tool calls.
4. Analyze the codebase by reading `codebase-summary.md`, `code-standards.md`, `system-architecture.md` and `project-overview-pdr.md` file.
   **ONLY PERFORM THIS FOLLOWING STEP IF `codebase-summary.md` is not available or older than 3 days**: Use `/evcrate-cmd-scout <instructions>` slash command to search the codebase for files needed to complete the task.
5. Main agent gathers all research and scout report filepaths, and pass them to `evcrate-planner` subagent with the prompt to create an implementation plan of this task.
6. Main agent receives the implementation plan from `evcrate-planner` subagent, and ask user to review the plan

## Post-Plan Validation (Optional)

After plan creation, offer validation interview to confirm decisions before implementation.

**Check `## Plan Context` → `Validation: mode=X, questions=MIN-MAX`:**

| Mode | Behavior |
|------|----------|
| `prompt` | Ask user: "Validate this plan with a brief interview?" → Yes (Recommended) / No |
| `auto` | Automatically execute `/evcrate-cmd-plan-validate {plan-path}` |
| `off` | Skip validation step entirely |

**If mode is `prompt`:** Use `user input` tool with options above.
**If user chooses validation or mode is `auto`:** Execute `/evcrate-cmd-plan-validate {plan-path}` Copilot slash command.

## Output Requirements

**Plan Directory Structure** (use `Plan dir:` from `## Naming` section)
```
{plan-dir}/
├── research/
│   ├── researcher-XX-report.md
│   └── ...
├── reports/
│   ├── XX-report.md
│   └── ...
├── scout/
│   ├── scout-XX-report.md
│   └── ...
├── plan.md
├── phase-XX-phase-name-here.md
└── ...
```

**Research Output Requirements**
- Ensure every research markdown report remains concise (≤150 lines) while covering all requested topics and citations.

**Plan File Specification**
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
- Save the overview access point at `{plan-dir}/evcrate-cmd-plan.md`. Keep it generic, under 80 lines, and list each implementation phase with status and progress plus links to phase files.
- For each phase, create `{plan-dir}/phase-XX-phase-name-here.md` containing the following sections in order: Context links (reference parent plan, dependencies, docs), Overview (date, description, priority, implementation status, review status), Key Insights, Requirements, Architecture, Related code files, Implementation Steps, Todo list, Success Criteria, Risk Assessment, Security Considerations, Next steps.

## Important Notes
**IMPORTANT:** Analyze the skills catalog and activate the skills that are needed for the task during the process.
**IMPORTANT:** Ensure token efficiency while maintaining high quality.
**IMPORTANT:** Sacrifice grammar for the sake of concision when writing reports.
**IMPORTANT:** In reports, list any unresolved questions at the end, if any.
**IMPORTANT**: **Do not** start implementing.
