---
name: "evc-cmd-fix-x-ui"
description: "Analyze and fix UI issues"
---

# evc-cmd-fix-x-ui

Command Path: $evc-cmd-fix-x-ui

Description: Analyze and fix UI issues

Codex note: when this recipe says to run another `$evc-cmd-…` command, invoke the matching `evc-cmd-*` skill for that path.

For high-impact architecture, security, debugging, or review decisions, consider explicit `$advisor-strategy` use for current-session guidance; this pointer does not activate it.

## Subagent Completion Contract

Delegation is blocking by default. The parent agent must wait for each delegated agent's terminal response before starting dependent work, touching shared files, marking a step complete, or replying with a final result.

- Parallel prompt format: **spawn N agents; wait for all N to finish; collect one terminal result from each; then summarize**.
- Wait protocol: use the native agent wait/poll operation for the same agent set. **"No agents completed yet" is a non-terminal poll result; wait again.** Do not treat this as a timeout, sleep instead of polling, restart, interrupt, or advance the workflow.
- A polling interval or retry count is not a delegation deadline. Do not invent a wall-clock limit. Continue polling until a terminal result, explicit user stop, or an actual parent-runtime termination.
- Treat an interrupted, timed-out, missing, or partial result as a failed gate. Do not continue from partial output or silently restart it.
- Sequential prompt format: **run one agent; wait for its terminal response before continuing**.
- Every delegated prompt must define scope, file ownership, expected report, and validation signal.
- A spawn acknowledgement or file change does not mean completion; completion requires the terminal response and requested validation.
## Required Skills (Priority Order)
1. **`ui-ux-pro-max`** - Design intelligence database (ALWAYS ACTIVATE FIRST)
2. **`aesthetic`** - Design principles
3. **`frontend-design`** - Implementation patterns

Use `evc-ui-ux-designer` subagent to read and analyze `./docs/design-guidelines.md` then fix the following issues:
<raw-issue>{{args}}</raw-issue>

## Canonical checkpoint routing

Named checkpoints use the canonical `evcrate-advisor-checkpoint/v2` dispatcher block in
`.codex/workflows/advisor-mentoring.md` if present; otherwise read `~/.codex/workflows/advisor-mentoring.md` (the published install) only under explicit or inherited advice mode.
This command supplies bounded evidence and does not duplicate route or adapter selection.

## Advice Mode

Before discovery or routing, resolve the HOME helper per `.codex/workflows/advice-activation.md` if present; otherwise read `~/.codex/workflows/advice-activation.md` (the published install) with original `{{args}}`, canonical `context.command: "fix/ui"` and the current root. A user-entered command always uses `handoff: null`. A handoff exists only when built by the router delegating this exact call; never reuse or replay one from earlier turns, commands, plans, reports or transcripts.
Preserve known selections from the exact-call router; use `work_target: "fix/ui"` only when no such target exists, and null plan/phase fields only when unknown.
Set `WORK_ARGUMENTS = result.work_arguments` and `ADVICE_MODE = result.mode`; use the returned work input everywhere below.

Apply neutral `.codex/workflows/plan-progress.md` if present; otherwise read `~/.codex/workflows/plan-progress.md` (the published install) in every mode. Only resolved `explicit` or `inherited` loads `.codex/workflows/advisor-mentoring.md` and follows its `## Caller lifecycle binding`; `off` keeps ordinary gates and uses only immutable in-repo receipts and sealed-path metadata, never `evcrate-advisor`, hard lifecycle or inference.
Activation failures and repeated blockers follow the shared activation contract; neither history nor a checkpoint activates advice.
## Workflow
**FIRST**: Run `ui-ux-pro-max` searches to understand context and common issues:
```bash
python3 $HOME/.agents/skills/ui-ux-pro-max/scripts/search.py "<product-type>" --domain product
python3 $HOME/.agents/skills/ui-ux-pro-max/scripts/search.py "<style-keywords>" --domain style
python3 $HOME/.agents/skills/ui-ux-pro-max/scripts/search.py "accessibility" --domain ux
python3 $HOME/.agents/skills/ui-ux-pro-max/scripts/search.py "z-index animation" --domain ux
```

If the user provides a screenshots or videos, use `ai-multimodal` skill to describe as detailed as possible the issue, make sure developers can predict the root causes easily based on the description.

1. Use `evc-ui-ux-designer` subagent to implement the fix step by step.
2. Use screenshot capture tools along with `ai-multimodal` skill to take screenshots of the implemented fix (at the exact parent container, don't take screenshot of the whole page) and use the appropriate Gemini analysis skills (`ai-multimodal`, `video-analysis`, or `document-extraction`) to analyze those outputs so the result matches the design guideline and addresses all issues.
  - If the issues are not addressed, repeat the process until all issues are addressed.
3. Use `chrome-devtools` skill to analyze the implemented fix and make sure it matches the design guideline.
4. Use `evc-tester` agent to test the fix and compile the code to make sure it works, then report back to main agent.
  - If there are issues or failed tests, ask main agent to fix all of them and repeat the process until all tests pass. In `off` mode, a second consecutive matching terminal blocker escalates through ordinary debugger/user handling before another attempt.
5. Project Management & Documentation:
  - **Under `off` advice mode**:
    * **If user approves the changes:** Use `evc-project-manager` and `evc-docs-manager` subagents in parallel to update the project progress and documentation:
      - Use `evc-project-manager` subagent to update the project progress and task status in the given plan file.
      - Use `evc-docs-manager` subagent to update the docs in `./docs` directory if needed. If executing in an advice-controlled plan with prior historical advice phases, save an uncaptured immutable phase receipt explicitly marked `default approval/validation; not durable advice completion` and update `progress.md` per `.codex/workflows/plan-progress.md`; prior sealed paths remain immutable.
      - Use `evc-project-manager` subagent to create a project roadmap at `./docs/project-roadmap.md` file.
      - **IMPORTANT:** Sacrifice grammar for the sake of concision when writing outputs.
    * **If user rejects the changes:** Ask user to explain the issues and ask main agent to fix all of them and repeat the process.
  - **Under `explicit` or `inherited` advice mode**:
    * Delegate to `evc-code-reviewer` and wait for its terminal report. Enforce a writer barrier before checkpoint reservation.
    * Enter the canonical checkpoint dispatcher at `review:fix-ui` under `.codex/workflows/advisor-mentoring.md`.
    * Parent is sole durable-state owner (`init`, `checkpoint`, `disposition`, `outcome`, `complete`). Child agents (`evc-ui-ux-designer`, `evc-tester`, `evc-code-reviewer`, `evc-project-manager`, `evc-docs-manager`) report terminal artifacts and actual changed paths within parent-authorized paths; they receive strict ownership, writable path, protected path, and delta destination constraints, and never operate controller state or stage files behind the parent.
    * Review/advisor cycle cap: at most three terminal reviewer/advisor cycles.
    * For accepted corrections, record `state disposition` with `action: "accept"` and registered action before writes, implement fix, validate, and record truthful `outcome`. For disputed counsel, record supported disposition without action, collect evidence, obtain fresh same-run counsel.
    * Settle all authorized substantive documentation and finalization writes under the registered parent action before the final truthful outcome; do not complete here. Step 6 is the sole durable completion exit.
6. Final Report:
  * Report back to user with a summary of the changes and explain everything briefly, guide user to get started and suggest the next steps.
  * In `off` mode, ask user if they want to commit and push to git repository, if yes, use `evc-git-manager` subagent to commit and push to git repository (no controller state operations). For advice-controlled plans with prior historical advice phases, point output to `<plan-dir>/progress.md`.
  * In `explicit` or `inherited` mode, record the matching final truthful outcome after all substantive writes/selected Git transitions settle, then complete ONCE via `state complete`. After success, publish the immutable outside-baseline receipt and derived `progress.md` per neutral `.codex/workflows/plan-progress.md`. Freeze captured baseline/index identities; output points to `<plan-dir>/progress.md`.
  * **IMPORTANT:** Sacrifice grammar for the sake of concision when writing reports.
  * **IMPORTANT:** In reports, list any unresolved questions at the end, if any.
**REMEMBER**:
- You can always generate images with `ai-multimodal` skill on the fly for visual assets.
- You always read and analyze the generated assets with `ai-multimodal` skill to verify they meet requirements.
- For image editing (removing background, adjusting, cropping), use `ImageMagick` skill or similar tools as needed.
- **IMPORTANT:** Analyze the skills catalog and activate the skills that are needed for the task during the process.
