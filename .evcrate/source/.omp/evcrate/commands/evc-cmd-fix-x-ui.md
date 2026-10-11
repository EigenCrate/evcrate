---
argument-hint: "[issue]"
description: "Analyze and fix UI issues"
---

## Required Skills (Priority Order)
1. **`ui-ux-pro-max`** - Design intelligence database (ALWAYS ACTIVATE FIRST)
2. **`aesthetic`** - Design principles
3. **`frontend-design`** - Implementation patterns

Use `evc-ui-ux-designer` subagent to read and analyze `./docs/design-guidelines.md` then fix the following issues:
<raw-issue>$ARGUMENTS</raw-issue>

## Scope and safety

Treat complete raw invocation arguments as ordinary task data. Apply
`.omp/evcrate/workflows/plan-progress.md` if present; otherwise read `~/.omp/agent/evcrate/workflows/plan-progress.md` before selecting scope or dependencies.
Preserve sealed history; completed requested scope is a no-op. Children receive
exact ownership and writable/protected paths, return terminal artifacts, and
never stage/commit behind the parent. Risky/destructive actions require approval.
## Workflow
**FIRST**: Run `ui-ux-pro-max` searches to understand context and common issues:
```bash
python3 $HOME/.omp/agent/skills/ui-ux-pro-max/scripts/search.py "<product-type>" --domain product
python3 $HOME/.omp/agent/skills/ui-ux-pro-max/scripts/search.py "<style-keywords>" --domain style
python3 $HOME/.omp/agent/skills/ui-ux-pro-max/scripts/search.py "accessibility" --domain ux
python3 $HOME/.omp/agent/skills/ui-ux-pro-max/scripts/search.py "z-index animation" --domain ux
```

If the user provides a screenshots or videos, use `ai-multimodal` skill to describe as detailed as possible the issue, make sure developers can predict the root causes easily based on the description.

1. Use `evc-ui-ux-designer` subagent to implement the fix step by step.
2. Use screenshot capture tools along with `ai-multimodal` skill to take screenshots of the implemented fix (at the exact parent container, don't take screenshot of the whole page) and use the appropriate Gemini analysis skills (`ai-multimodal`, `video-analysis`, or `document-extraction`) to analyze those outputs so the result matches the design guideline and addresses all issues.
  - If the issues are not addressed, repeat the process until all issues are addressed.
3. Use `chrome-devtools` skill to analyze the implemented fix and make sure it matches the design guideline.
4. Use `evc-tester` agent to test the fix and compile the code to make sure it works, then report back to main agent.
  - If there are issues or failed tests, ask main agent to fix all of them and repeat until all tests pass. On a second consecutive matching terminal blocker without progress, use ordinary debugger/user escalation before another attempt.
5. Code Review, Approval, Project Management & Documentation:
  - Settle implementation/test writers, use `evc-code-reviewer` and wait for its
    terminal report. Missing or partial results leave the gate incomplete.
  - Present findings and actual validation; ask the user to approve or explain
    rejected changes. Apply authorized fixes and revalidate, with at most three
    terminal review cycles. At the cap stop and ask for direction.
  - If approved, use `evc-project-manager` and `evc-docs-manager` in parallel for
    disjoint authorized project/docs/roadmap updates; wait for both results.
    Parent retains protected status/receipt/overview ownership under
    `.omp/evcrate/workflows/plan-progress.md` if present; otherwise read `~/.omp/agent/evcrate/workflows/plan-progress.md`. Sealed paths stay immutable.
6. Final Report:
  * Summarize actual changes, validation, blockers, setup and next steps.
  * Ask whether the user wants to commit and push; only if authorized use
    `evc-git-manager`. Preserve scoped approval and protected index identities.
    Link the actual overview, never invent a progress link for an ordinary plan.
  * **IMPORTANT:** Sacrifice grammar for the sake of concision when writing reports.
  * **IMPORTANT:** In reports, list any unresolved questions at the end, if any.
**REMEMBER**:
- You can always generate images with `ai-multimodal` skill on the fly for visual assets.
- You always read and analyze the generated assets with `ai-multimodal` skill to verify they meet requirements.
- For image editing (removing background, adjusting, cropping), use `ImageMagick` skill or similar tools as needed.
- **IMPORTANT:** Analyze the skills catalog and activate the skills that are needed for the task during the process.

**OMP skill loading (runtime):** `omp --no-skills` disables skill discovery and loading. When that flag is active, do not claim automatic skill activation: read each required migrated `SKILL.md` directly with the read tool from `./.omp/skills/<skill-name>/SKILL.md`, falling back to `~/.omp/agent/skills/<skill-name>/SKILL.md`. If the native file is absent, consult `./.omp/evcrate/skill-map.json` or `~/.omp/agent/evcrate/skill-map.json`, then read the archived package under `./.omp/evcrate/skills/` (or the published `~/.omp/agent/evcrate/skills/` path), then follow the instructions. Without `--no-skills`, use OMP's normal skill discovery.
