---
name: "evcrate-cmd-design-fast"
description: "Create a quick design"
argument-hint: "[tasks]"
user-invocable: true
disable-model-invocation: true
---

## Invocation contract

The literal `$ARGUMENTS` is the exact raw text following `/evcrate-cmd-design-fast`. Do not split, normalize, or discard it before the canonical command parses it.

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

Think hard to plan & start working on these tasks follow the Orchestration Protocol, Core Responsibilities, Subagents Team and Development Rules: 
<tasks>$ARGUMENTS</tasks>

## Required Skills (Priority Order)
1. **`evcrate-ui-ux-pro-max`** - Design intelligence database (ALWAYS ACTIVATE FIRST)
2. **`evcrate-frontend-design`** - Quick implementation

**Ensure token efficiency while maintaining high quality.**

## Workflow:
1. **FIRST**: Run `evcrate-ui-ux-pro-max` searches to gather design intelligence:
   ```bash
   python3 $HOME/.copilot/skills/evcrate-ui-ux-pro-max/scripts/search.py "<product-type>" --domain product
   python3 $HOME/.copilot/skills/evcrate-ui-ux-pro-max/scripts/search.py "<style-keywords>" --domain style
   python3 $HOME/.copilot/skills/evcrate-ui-ux-pro-max/scripts/search.py "<mood>" --domain typography
   python3 $HOME/.copilot/skills/evcrate-ui-ux-pro-max/scripts/search.py "<industry>" --domain color
   ```
2. Use `evcrate-ui-ux-designer` subagent to start the design process.
3. If user doesn't specify, create the design in pure HTML/CSS/JS.
4. Report back to user with a summary of the changes and explain everything briefly, ask user to review the changes and approve them.
5. If user approves the changes, update the `./docs/design-guidelines.md` docs if needed.

## Notes:
- Remember that you have the capability to generate images, videos, edit images, etc. with `evcrate-ai-multimodal` skills. Use them to create the design and real assets.
- Always review, analyze and double check generated assets with `evcrate-ai-multimodal` skills to verify quality.
- Maintain and update `./docs/design-guidelines.md` docs if needed.
