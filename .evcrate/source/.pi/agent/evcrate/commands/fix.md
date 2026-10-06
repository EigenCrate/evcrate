---
description: "Analyze and fix issues [INTELLIGENT ROUTING]"
argument-hint: "[issues] [--advice]"
---
**Analyze the issue, select the narrowest fix workflow, and execute it in this session:**
<raw-issues>$ARGUMENTS</raw-issues>

## Advice Mode

Before discovery or routing, resolve the HOME helper per `{{evcrate:workflows/advice-activation.md}}` with original `$ARGUMENTS`, canonical `context.command: "fix"`, the current root and any direct caller handoff.
Preserve known direct-caller selections; use `work_target: "fix"` only when no caller target exists, and null plan/phase fields only when unknown.
Set `WORK_ARGUMENTS = result.work_arguments` and `ADVICE_MODE = result.mode`; use the returned work input everywhere below.
Apply neutral `{{evcrate:workflows/plan-progress.md}}` in every mode. Only resolved `explicit` or `inherited` loads `{{evcrate:workflows/advisor-mentoring.md}}` and follows its `## Caller lifecycle binding`; `off` keeps ordinary gates and only identified historical get, never hard lifecycle or inference.
Activation failures and repeated blockers follow the shared activation contract; neither history nor a checkpoint activates advice.
8. The root router is stateless and must not initialize state runs, record duplicate consultations, perform advisor calls, or publish receipts itself; all durable operations and checkpoint invocations belong to the delegated command.
## Execution Contract

After selecting a route, execute the selected command immediately; do not print a route for the user to run manually.

1. Build one enhanced description from `WORK_ARGUMENTS` and preserve it exactly as the delegated command's input.
2. In `off` mode, delegate to the specialist with no advice handoff and no appended token.
3. In `explicit` or `inherited` mode, pass structured direct-caller handoff context to the delegated specialist:
   - If entering without an active run: pass pre-run handoff (`kind: "pre-run"`, exact selected child `context: { project_root, command: <selected-command>, work_target: <target>, plan_path, phase_path, phase_id }`, `run: null`). Preserve known direct-caller or router-selected plan/phase values; use null only when genuinely unknown, per the shared activation contract.
   - If entering with an active run: pass same-run handoff (`kind: "same-run"`, `context: { project_root, command: <selected-command>, work_target: <target>, plan_path, phase_path, phase_id }`, `run: { task_run_id, project_id, task_revision, scope_revision, evidence_revision }}`). Forward prior counsel, disposition, and registered action in direct caller context.
   - NEVER append a synthetic `--advice` token.
4. All specialists support the shared activation contract. Route directly to the designated specialist by issue type. Use the existing `/fix:hard` route only if a custom execution environment cannot carry the structured handoff contract, not because a command hint lacks a flag.
5. When the host exposes `SlashCommand`, execute the selected route with that mechanism in the same session.
6. If this command environment cannot recursively invoke a file-based slash command, read the selected command definition and perform that workflow directly in the current session. Never emit a bare specialist-command handoff, ask the user to rerun it, or stop after route selection.
7. Child writers receive strict ownership, writable path, protected path, and delta destination constraints; they never operate controller state or stage behind the parent.
8. Wait for the delegated workflow to reach its terminal result before reporting the route. The router is stateless and must not duplicate advisor calls, initialize state runs, or summarize a partial delegation.

## Decision Tree

**1. Check for existing plan:**
- If a markdown plan exists, select {{evcrate:commands/code}} <path-to-plan>. Forward structured pre-run or same-run context when in `explicit` or `inherited` mode; never append synthetic `--advice`. Execute it under the contract above.

**2. Route by issue type:**

**A) Type Errors** (keywords: type, typescript, tsc, type error)
→ `/fix:types`

**B) UI/UX Issues** (keywords: ui, ux, design, layout, style, visual, button, component, css, responsive)
→ `/fix:ui <detailed-description>`

**C) CI/CD Issues** (keywords: github actions, pipeline, ci/cd, workflow, deployment, build failed)
→ `/fix:ci <github-actions-url-or-description>`

**D) Test Failures** (keywords: test, spec, jest, vitest, failing test, test suite)
→ `/fix:test <detailed-description>`

**E) Log Analysis** (keywords: logs, error logs, log file, stack trace)
→ `/fix:logs <detailed-description>`

**F) Multiple Independent Issues** (2+ unrelated issues in different areas)
→ `/fix:parallel <detailed-description>`

**G) Complex Issues** (keywords: complex, architecture, refactor, major, system-wide, multiple components)
→ `/fix:hard <detailed-description>`

**H) Simple/Quick Fixes** (default: small bug, single file, straightforward)
→ `/fix:fast <detailed-description>`

All specialists support the shared activation contract. Route directly to the designated specialist by issue type. In `off` mode, route directly without handoff. In `explicit` or `inherited` mode, supply the structured pre-run or same-run context without synthetic flags. Use the existing {{evcrate:commands/fix:hard}} route only if a custom execution environment cannot carry the structured handoff contract, not because a command hint lacks a flag. Execute the selected command under the contract above.
## Notes
- `detailed-description` = enhanced prompt describing issue in detail
- If unclear, ask user for clarification before routing
- Can combine routes: e.g., multiple type errors + UI issue → `/fix:parallel`
