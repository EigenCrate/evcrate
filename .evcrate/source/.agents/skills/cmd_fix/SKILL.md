---
name: "cmd-fix"
description: "Analyze and fix issues [INTELLIGENT ROUTING]"
---

# cmd_fix

Command Path: /fix

Description: Analyze and fix issues [INTELLIGENT ROUTING]

Codex note: when this recipe says to run another `/...` command, invoke the matching `cmd_*` skill for that path.

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
**Analyze the issue, select the narrowest fix workflow, and execute it in this session:**
<raw-issues>{{args}}</raw-issues>

## Advice Mode

Before discovery or routing, resolve the HOME helper per `.codex/workflows/advice-activation.md` if present; otherwise read `~/.codex/workflows/advice-activation.md` (the published install) with original `{{args}}`, canonical `context.command: "fix"`, the current root and any direct caller handoff.
Preserve known direct-caller selections; use `work_target: "fix"` only when no caller target exists, and null plan/phase fields only when unknown.
Set `WORK_ARGUMENTS = result.work_arguments` and `ADVICE_MODE = result.mode`; use the returned work input everywhere below.
Apply neutral `.codex/workflows/plan-progress.md` if present; otherwise read `~/.codex/workflows/plan-progress.md` (the published install) in every mode. Only resolved `explicit` or `inherited` loads `.codex/workflows/advisor-mentoring.md` if present; otherwise read `~/.codex/workflows/advisor-mentoring.md` (the published install) and follows its `## Caller lifecycle binding`; `off` keeps ordinary gates and only identified historical get, never hard lifecycle or inference.
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
5. When the host exposes `Codex slash command`, execute the selected route with that mechanism in the same session.
6. If this command environment cannot recursively invoke a file-based slash command, read the selected command definition and perform that workflow directly in the current session. Never emit a bare specialist-command handoff, ask the user to rerun it, or stop after route selection.
7. Child writers receive strict ownership, writable path, protected path, and delta destination constraints; they never operate controller state or stage behind the parent.
8. Wait for the delegated workflow to reach its terminal result before reporting the route. The router is stateless and must not duplicate advisor calls, initialize state runs, or summarize a partial delegation.

## Decision Tree

**1. Check for existing plan:**
- If a markdown plan exists, select `/code <path-to-plan>`. Forward structured pre-run or same-run context when in `explicit` or `inherited` mode; never append synthetic `--advice`. Execute it under the contract above.

**2. Route by issue type:**

**A) Type Errors** (keywords: type, typescript, tsc, type error)
→ Use the matching `cmd_*` skill to run `/fix:types`

**B) UI/UX Issues** (keywords: ui, ux, design, layout, style, visual, button, component, css, responsive)
→ Use the matching `cmd_*` skill to run `/fix:ui <detailed-description>`

**C) CI/CD Issues** (keywords: github actions, pipeline, ci/cd, workflow, deployment, build failed)
→ Use the matching `cmd_*` skill to run `/fix:ci <github-actions-url-or-description>`

**D) Test Failures** (keywords: test, spec, jest, vitest, failing test, test suite)
→ Use the matching `cmd_*` skill to run `/fix:test <detailed-description>`

**E) Log Analysis** (keywords: logs, error logs, log file, stack trace)
→ Use the matching `cmd_*` skill to run `/fix:logs <detailed-description>`

**F) Multiple Independent Issues** (2+ unrelated issues in different areas)
→ Use the matching `cmd_*` skill to run `/fix:parallel <detailed-description>`

**G) Complex Issues** (keywords: complex, architecture, refactor, major, system-wide, multiple components)
→ Use the matching `cmd_*` skill to run `/fix:hard <detailed-description>`

**H) Simple/Quick Fixes** (default: small bug, single file, straightforward)
→ Use the matching `cmd_*` skill to run `/fix:fast <detailed-description>`

All specialists support the shared activation contract. Route directly to the designated specialist by issue type. In `off` mode, route directly without handoff. In `explicit` or `inherited` mode, supply the structured pre-run or same-run context without synthetic flags. Use the existing `/fix:hard` route only if a custom execution environment cannot carry the structured handoff contract, not because a command hint lacks a flag. Execute the selected command under the contract above.
## Notes
- `detailed-description` = enhanced prompt describing issue in detail
- If unclear, ask user for clarification before routing
- Can combine routes: e.g., multiple type errors + UI issue → Use the matching `cmd_*` skill to run `/fix:parallel`
