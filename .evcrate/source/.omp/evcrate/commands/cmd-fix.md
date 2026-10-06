---
argument-hint: "[issues] [--advice]"
description: "Analyze and fix issues [INTELLIGENT ROUTING]"
---

**Analyze the issue, select the narrowest fix workflow, and execute it in this session:**
<raw-issues>$ARGUMENTS</raw-issues>

## Advice Mode

Native command execution validates and resolves advice activation prior to prompt admission, prepending the compact `evcrate_omp_command_context` header (version 2, source "native-user").
For a valid version-2 header from this command's admission, consume its validated `ADVICE_MODE = evcrate_omp_command_context.mode`, exact `context`, and `run`; `WORK_ARGUMENTS` is the work input already admitted once in this command body. Do not re-invoke the HOME helper. A header for another command is parent context, never this command's result.
When delegating directly to this command within a session or reading its definition, resolve activation by invoking the HOME helper per `./.omp/evcrate/workflows/advice-activation.md` if present; otherwise read `~/.omp/agent/evcrate/workflows/advice-activation.md` with the exact child arguments, canonical `context.command: "fix"`, exact child `work_target`, and the exact handoff of the current call. A user-entered command always uses `handoff: null`. A handoff exists only when built by the router delegating this exact call; never reuse or replay one from earlier turns, commands, plans, reports or transcripts. Never reuse a parent command's activation result or synthesize a native header. Set `WORK_ARGUMENTS = result.work_arguments` and `ADVICE_MODE = result.mode`.
If `evcrate_omp_command_context` is missing or invalid on native entry, or if helper evaluation fails, treat activation as failed and fail closed per the shared activation contract.

Apply neutral `.omp/evcrate/workflows/plan-progress.md` if present; otherwise read `~/.omp/agent/evcrate/workflows/plan-progress.md` in every mode. Only resolved `explicit` or `inherited` loads `.omp/evcrate/workflows/advisor-mentoring.md` if present; otherwise read `~/.omp/agent/evcrate/workflows/advisor-mentoring.md` and follows its `## Caller lifecycle binding`; `off` keeps ordinary gates and uses only immutable in-repo receipts and sealed-path metadata, never `evcrate-advisor`, hard lifecycle or inference.
Activation failures and repeated blockers follow the shared activation contract; neither history nor a checkpoint activates advice.
8. The root router is stateless and must not initialize state runs, record duplicate consultations, perform advisor calls, or publish receipts itself; all durable operations and checkpoint invocations belong to the delegated command.
## Execution Contract

After selecting a route, execute the selected command immediately; do not print a route for the user to run manually.

1. Build one enhanced description from `WORK_ARGUMENTS` and preserve it exactly as the delegated command's input.
2. In `off` mode, delegate to the specialist with no advice handoff and no appended token.
3. In `explicit` or `inherited` mode, pass structured exact-call handoff context, built for this delegation, to the delegated specialist:
   - If entering without an active run: pass pre-run handoff (`kind: "pre-run"`, exact selected child `context: { project_root, command: <selected-command>, work_target: <target>, plan_path, phase_path, phase_id }`, `run: null`). Preserve known router-selected plan/phase values; use null only when genuinely unknown, per the shared activation contract.
   - If entering with an active run: pass same-run handoff (`kind: "same-run"`, `context: { project_root, command: <selected-command>, work_target: <target>, plan_path, phase_path, phase_id }`, `run: { task_run_id, project_id, task_revision, scope_revision, evidence_revision }}`). Forward prior counsel, disposition, and registered action in direct caller context.
   - NEVER append a synthetic `--advice` token.
4. All specialists support the shared activation contract. Route directly to the designated specialist by issue type. Use the existing `/cmd-fix__hard` route only if a custom execution environment cannot carry the structured handoff contract, not because a command hint lacks a flag.
5. When the host exposes `OMP command`, execute the selected route with that mechanism in the same session.
6. If this command environment cannot recursively invoke a file-based slash command, read the selected command definition and perform that workflow directly in the current session. Never emit a bare specialist-command handoff, ask the user to rerun it, or stop after route selection.
7. Child writers receive strict ownership, writable path, protected path, and delta destination constraints; they never operate controller state or stage behind the parent.
8. Wait for the delegated workflow to reach its terminal result before reporting the route. The router is stateless and must not duplicate advisor calls, initialize state runs, or summarize a partial delegation.

## Decision Tree

**1. Check for existing plan:**
- If a markdown plan exists, select `/cmd-code <path-to-plan>`. Forward structured pre-run or same-run context when in `explicit` or `inherited` mode; never append synthetic `--advice`. Execute it under the contract above.

**2. Route by issue type:**

**A) Type Errors** (keywords: type, typescript, tsc, type error)
→ `/cmd-fix__types`

**B) UI/UX Issues** (keywords: ui, ux, design, layout, style, visual, button, component, css, responsive)
→ `/cmd-fix__ui <detailed-description>`

**C) CI/CD Issues** (keywords: github actions, pipeline, ci/cd, workflow, deployment, build failed)
→ `/cmd-fix__ci <github-actions-url-or-description>`

**D) Test Failures** (keywords: test, spec, jest, vitest, failing test, test suite)
→ `/cmd-fix__test <detailed-description>`

**E) Log Analysis** (keywords: logs, error logs, log file, stack trace)
→ `/cmd-fix__logs <detailed-description>`

**F) Multiple Independent Issues** (2+ unrelated issues in different areas)
→ `/cmd-fix__parallel <detailed-description>`

**G) Complex Issues** (keywords: complex, architecture, refactor, major, system-wide, multiple components)
→ `/cmd-fix__hard <detailed-description>`

**H) Simple/Quick Fixes** (default: small bug, single file, straightforward)
→ `/cmd-fix__fast <detailed-description>`

All specialists support the shared activation contract. Route directly to the designated specialist by issue type. In `off` mode, route directly without handoff. In `explicit` or `inherited` mode, supply the structured pre-run or same-run context without synthetic flags. Use the existing `/cmd-fix__hard` route only if a custom execution environment cannot carry the structured handoff contract, not because a command hint lacks a flag. Execute the selected command under the contract above.
## Notes
- `detailed-description` = enhanced prompt describing issue in detail
- If unclear, ask user for clarification before routing
- Can combine routes: e.g., multiple type errors + UI issue → `/cmd-fix__parallel`
