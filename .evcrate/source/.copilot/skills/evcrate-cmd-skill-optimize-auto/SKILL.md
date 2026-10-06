---
name: "evcrate-cmd-skill-optimize-auto"
description: "Optimize an existing agent skill [auto]"
argument-hint: "[skill-name] [prompt]"
user-invocable: true
disable-model-invocation: true
---

## Invocation contract

The literal `$ARGUMENTS` is the exact raw text following `/evcrate-cmd-skill-optimize-auto`. Do not split, normalize, or discard it before the canonical command parses it.

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

Think harder.
Use `skill-creator` and `evcrate-copilot-cli` skills.
Use `evcrate-docs-seeker` skills to search for documentation if needed.

## Arguments
SKILL: $1 (default: `*`)
PROMPT: $2 (default: empty)

## Your mission
Optimize an existing skill in `.copilot/skills/${SKILL}` directory. 
Always keep in mind that `SKILL.md` and reference files should be token consumption efficient, so that **progressive disclosure** can be leveraged at best.
`SKILL.md` is always short and concise, straight to the point, treat it as a quick reference guide.

**IMPORTANT:**
- Skills are not documentation, they are practical instructions for GitHub Copilot CLI to use the tools, packages, plugins or APIs to achieve the tasks.
- Each skill teaches Copilot how to perform a specific development task, not what a tool does.
- GitHub Copilot CLI can activate multiple skills automatically to achieve the user's request.

## Additional instructions
<additional-instructions>$PROMPT</additional-instructions>
