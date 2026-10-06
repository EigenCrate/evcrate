---
name: cmd-fix-ui
description: Analyze and fix UI issues
user-invocable: true
disable-model-invocation: true
argument-hint: "[issue] [--advice]"
---

## Required Skills (Priority Order)
1. **`ui-ux-pro-max`** - Design intelligence database (ALWAYS ACTIVATE FIRST)
2. **`aesthetic`** - Design principles
3. **`frontend-design`** - Implementation patterns

Use `ui-ux-designer` subagent to read and analyze `./docs/design-guidelines.md` then fix the following issues:
<raw-issue>$ARGUMENTS</raw-issue>

## Canonical checkpoint routing

Named checkpoints use the canonical `evcrate-advisor-checkpoint/v2` dispatcher block in
`.evcrate-vscode/evcrate/workflows/advisor-mentoring.md` if present; otherwise read `~/.evcrate-vscode/evcrate/workflows/advisor-mentoring.md` (the published install) only under explicit or inherited advice mode.
This command supplies bounded evidence and does not duplicate route or adapter selection.

## Advice Mode

Before discovery or routing, resolve the HOME helper per `.evcrate-vscode/evcrate/workflows/advice-activation.md` if present; otherwise read `~/.evcrate-vscode/evcrate/workflows/advice-activation.md` (the published install) with original `$ARGUMENTS`, canonical `context.command: "fix/ui"`, the current root and any direct caller handoff.
Preserve known direct-caller selections; use `work_target: "fix/ui"` only when no caller target exists, and null plan/phase fields only when unknown.
Set `WORK_ARGUMENTS = result.work_arguments` and `ADVICE_MODE = result.mode`; use the returned work input everywhere below.
Apply neutral `.evcrate-vscode/evcrate/workflows/plan-progress.md` if present; otherwise read `~/.evcrate-vscode/evcrate/workflows/plan-progress.md` (the published install) in every mode. Only resolved `explicit` or `inherited` loads `.evcrate-vscode/evcrate/workflows/advisor-mentoring.md` if present; otherwise read `~/.evcrate-vscode/evcrate/workflows/advisor-mentoring.md` (the published install) and follows its `## Caller lifecycle binding`; `off` keeps ordinary gates and only identified historical get, never hard lifecycle or inference.
Activation failures and repeated blockers follow the shared activation contract; neither history nor a checkpoint activates advice.
## Workflow
**FIRST**: Run `ui-ux-pro-max` searches to understand context and common issues:
```bash
python3 $HOME/.evcrate-vscode/skills/ui-ux-pro-max/scripts/search.py "<product-type>" --domain product
python3 $HOME/.evcrate-vscode/skills/ui-ux-pro-max/scripts/search.py "<style-keywords>" --domain style
python3 $HOME/.evcrate-vscode/skills/ui-ux-pro-max/scripts/search.py "accessibility" --domain ux
python3 $HOME/.evcrate-vscode/skills/ui-ux-pro-max/scripts/search.py "z-index animation" --domain ux
```

If the user provides a screenshots or videos, use `ai-multimodal` skill to describe as detailed as possible the issue, make sure developers can predict the root causes easily based on the description.

1. Use `ui-ux-designer` subagent to implement the fix step by step.
2. Use screenshot capture tools along with `ai-multimodal` skill to take screenshots of the implemented fix (at the exact parent container, don't take screenshot of the whole page) and use the appropriate Gemini analysis skills (`ai-multimodal`, `video-analysis`, or `document-extraction`) to analyze those outputs so the result matches the design guideline and addresses all issues.
  - If the issues are not addressed, repeat the process until all issues are addressed.
3. Use `chrome-devtools` skill to analyze the implemented fix and make sure it matches the design guideline.
4. Use `tester` agent to test the fix and compile the code to make sure it works, then report back to main agent.
  - If there are issues or failed tests, ask main agent to fix all of them and repeat the process until all tests pass. In `off` mode, a second consecutive matching terminal blocker escalates through ordinary debugger/user handling before another attempt.
5. Project Management & Documentation:
  - **Under `off` advice mode**:
    * **If user approves the changes:** Use `project-manager` and `docs-manager` subagents in parallel to update the project progress and documentation:
      - Use `project-manager` subagent to update the project progress and task status in the given plan file.
      - Use `docs-manager` subagent to update the docs in `./docs` directory if needed. If executing in an advice-controlled plan with prior historical advice phases, save an uncaptured immutable phase receipt explicitly marked `default approval/validation; not durable advice completion` and update `progress.md` per `.evcrate-vscode/evcrate/workflows/plan-progress.md` if present; otherwise read `~/.evcrate-vscode/evcrate/workflows/plan-progress.md` (the published install); prior sealed paths remain immutable.
      - Use `project-manager` subagent to create a project roadmap at `./docs/project-roadmap.md` file.
      - **IMPORTANT:** Sacrifice grammar for the sake of concision when writing outputs.
    * **If user rejects the changes:** Ask user to explain the issues and ask main agent to fix all of them and repeat the process.
  - **Under `explicit` or `inherited` advice mode**:
    * Delegate to `code-reviewer` and wait for its terminal report. Enforce a writer barrier before checkpoint reservation.
    * Enter the canonical checkpoint dispatcher at `review:fix-ui` under `.evcrate-vscode/evcrate/workflows/advisor-mentoring.md` if present; otherwise read `~/.evcrate-vscode/evcrate/workflows/advisor-mentoring.md` (the published install).
    * Parent is sole durable-state owner (`init`, `checkpoint`, `disposition`, `outcome`, `complete`). Child agents (`ui-ux-designer`, `tester`, `code-reviewer`, `project-manager`, `docs-manager`) report terminal artifacts and actual changed paths within parent-authorized paths; they receive strict ownership, writable path, protected path, and delta destination constraints, and never operate controller state or stage files behind the parent.
    * Review/advisor cycle cap: at most three terminal reviewer/advisor cycles.
    * For accepted corrections, record `state disposition` with `action: "accept"` and registered action before writes, implement fix, validate, and record truthful `outcome`. For disputed counsel, record supported disposition without action, collect evidence, obtain fresh same-run counsel.
    * Settle all authorized substantive documentation and finalization writes under the registered parent action before the final truthful outcome; do not complete here. Step 6 is the sole durable completion exit.
6. Final Report:
  * Report back to user with a summary of the changes and explain everything briefly, guide user to get started and suggest the next steps.
  * In `off` mode, ask user if they want to commit and push to git repository, if yes, use `git-manager` subagent to commit and push to git repository (no controller state operations). For advice-controlled plans with prior historical advice phases, point output to `<plan-dir>/progress.md`.
  * In `explicit` or `inherited` mode, record the matching final truthful outcome after all substantive writes/selected Git transitions settle, then complete ONCE via `state complete`. After success, publish the immutable outside-baseline receipt and derived `progress.md` per neutral `.evcrate-vscode/evcrate/workflows/plan-progress.md` if present; otherwise read `~/.evcrate-vscode/evcrate/workflows/plan-progress.md` (the published install). Freeze captured baseline/index identities; output points to `<plan-dir>/progress.md`.
  * **IMPORTANT:** Sacrifice grammar for the sake of concision when writing reports.
  * **IMPORTANT:** In reports, list any unresolved questions at the end, if any.
**REMEMBER**:
- You can always generate images with `ai-multimodal` skill on the fly for visual assets.
- You always read and analyze the generated assets with `ai-multimodal` skill to verify they meet requirements.
- For image editing (removing background, adjusting, cropping), use `ImageMagick` skill or similar tools as needed.
- **IMPORTANT:** Analyze the skills catalog and activate the skills that are needed for the task during the process.
