---
name: "evc-cmd-fix-x-ui"
description: "Analyze and fix UI issues"
argument-hint: "[issue]"
user-invocable: true
disable-model-invocation: true
---

## Invocation contract

The literal `$ARGUMENTS` is the exact raw text following `/evc-cmd-fix-x-ui`. Do not split, normalize, or discard it; arguments are ordinary task data.

Read the mandatory documentation ownership policy at `@evcrate/workflows/documentation-management.md`. The workflow list below is navigation, not a preload instruction. Follow the canonical command's read conditions.

## Available workflow assets

- `@evcrate/workflows/development-rules.md`
- `@evcrate/workflows/documentation-management.md`
- `@evcrate/workflows/orchestration-protocol.md`
- `@evcrate/workflows/primary-workflow.md`

## Required Skills (Priority Order)
1. **`evc-ui-ux-pro-max`** - Design intelligence database (ALWAYS ACTIVATE FIRST)
2. **`evc-aesthetic`** - Design principles
3. **`evc-frontend-design`** - Implementation patterns

Use `evc-ui-ux-designer` subagent to read and analyze `./docs/design-guidelines.md` then fix the following issues:
<issue>$ARGUMENTS</issue>

## Workflow
**FIRST**: Run `evc-ui-ux-pro-max` searches to understand context and common issues:
```bash
python3 $HOME/.copilot/skills/evc-ui-ux-pro-max/scripts/search.py "<product-type>" --domain product
python3 $HOME/.copilot/skills/evc-ui-ux-pro-max/scripts/search.py "<style-keywords>" --domain style
python3 $HOME/.copilot/skills/evc-ui-ux-pro-max/scripts/search.py "accessibility" --domain ux
python3 $HOME/.copilot/skills/evc-ui-ux-pro-max/scripts/search.py "z-index animation" --domain ux
```

If the user provides a screenshots or videos, use `evc-ai-multimodal` skill to describe as detailed as possible the issue, make sure developers can predict the root causes easily based on the description.

1. Use `evc-ui-ux-designer` subagent to implement the fix step by step.
2. Use screenshot capture tools along with `evc-ai-multimodal` skill to take screenshots of the implemented fix (at the exact parent container, don't take screenshot of the whole page) and use the appropriate Gemini analysis skills (`evc-ai-multimodal`, `video-analysis`, or `document-extraction`) to analyze those outputs so the result matches the design guideline and addresses all issues.
  - If the issues are not addressed, repeat the process until all issues are addressed.
3. Use `evc-chrome-devtools` skill to analyze the implemented fix and make sure it matches the design guideline.
4. Use `evc-tester` agent to test the fix and compile the code to make sure it works, then report back to main agent.
  - If there are issues or failed tests, ask main agent to fix all of them and repeat the process until all tests pass.
5. Project Management & Documentation:
  **If user approves the changes:** Use `evc-project-manager` and `evc-docs-manager` subagents in parallel to update the project progress and documentation:
    * Use `evc-project-manager` subagent to update the project progress and task status in the given plan file.
    * Use `evc-docs-manager` subagent to update the docs in `./docs` directory if needed.
    * Use `evc-project-manager` subagent to create a project roadmap at `./docs/project-roadmap.md` file.
    * **IMPORTANT:** Sacrifice grammar for the sake of concision when writing outputs.
  **If user rejects the changes:** Ask user to explain the issues and ask main agent to fix all of them and repeat the process.
6. Final Report:
  * Report back to user with a summary of the changes and explain everything briefly, guide user to get started and suggest the next steps.
  * Ask the user if they want to commit and push to git repository, if yes, use `evc-git-manager` subagent to commit and push to git repository.
  * **IMPORTANT:** Sacrifice grammar for the sake of concision when writing reports.
  * **IMPORTANT:** In reports, list any unresolved questions at the end, if any.

**REMEMBER**:
- You can always generate images with `evc-ai-multimodal` skill on the fly for visual assets.
- You always read and analyze the generated assets with `evc-ai-multimodal` skill to verify they meet requirements.
- For image editing (removing background, adjusting, cropping), use `ImageMagick` skill or similar tools as needed.
- **IMPORTANT:** Analyze the skills catalog and activate the skills that are needed for the task during the process.
