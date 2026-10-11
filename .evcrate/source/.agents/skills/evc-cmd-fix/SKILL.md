---
name: "evc-cmd-fix"
description: "Analyze and fix issues [INTELLIGENT ROUTING]"
---

# evc-cmd-fix

Command Path: $evc-cmd-fix

Description: Analyze and fix issues [INTELLIGENT ROUTING]

Codex note: when this recipe says to run another `$evc-cmd-…` command, invoke the matching `evc-cmd-*` skill for that path.

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

## Scope and routing

Treat complete raw invocation arguments as ordinary task data. Apply neutral
`.codex/workflows/plan-progress.md` if present; otherwise read `~/.codex/workflows/plan-progress.md` (the published install) for selected scope and dependencies.
Preserve sealed history; completed requested scope is a no-op.
This router owns route selection, not duplicated specialist finalization.
## Execution Contract

After selecting a route, execute the selected command immediately; do not print a route for the user to run manually.

1. Build one enhanced issue description from the raw task data and preserve it
   exactly as the selected command's input, with known scope and evidence.
2. Route directly to the designated specialist by issue type.
3. When the host exposes `Codex slash command`, execute that route in the same session.
4. If recursive file-based invocation is unavailable, read the selected command
   definition and perform its workflow directly in the current session. Never
   ask the user to rerun it or stop after route selection.
5. Children receive exact ownership, writable/protected paths and output
   destinations; they return terminal artifacts and never stage/commit behind
   the parent. Risky/destructive actions retain explicit user approval.
6. Wait for the selected workflow's terminal result and its actual testing,
   review, approval and finalization gates before reporting completion.

## Decision Tree

**1. Check for existing plan:**
- If a markdown plan exists, select `$evc-cmd-code <path-to-plan>` and execute it under the contract above, after scope reconciliation.

**2. Route by issue type:**

**A) Type Errors** (keywords: type, typescript, tsc, type error)
→ `$evc-cmd-fix-x-types`

**B) UI/UX Issues** (keywords: ui, ux, design, layout, style, visual, button, component, css, responsive)
→ `$evc-cmd-fix-x-ui <detailed-description>`

**C) CI/CD Issues** (keywords: github actions, pipeline, ci/cd, workflow, deployment, build failed)
→ `$evc-cmd-fix-x-ci <github-actions-url-or-description>`

**D) Test Failures** (keywords: test, spec, jest, vitest, failing test, test suite)
→ `$evc-cmd-fix-x-test <detailed-description>`

**E) Log Analysis** (keywords: logs, error logs, log file, stack trace)
→ `$evc-cmd-fix-x-logs <detailed-description>`

**F) Multiple Independent Issues** (2+ unrelated issues in different areas)
→ `$evc-cmd-fix-x-parallel <detailed-description>`

**G) Complex Issues** (keywords: complex, architecture, refactor, major, system-wide, multiple components)
→ `$evc-cmd-fix-x-hard <detailed-description>`

**H) Simple/Quick Fixes** (default: small bug, single file, straightforward)
→ `$evc-cmd-fix-x-fast <detailed-description>`

Route directly by issue type and execute the selected command under the contract above; preserve task data and ordinary engineering gates.
## Notes
- `detailed-description` = enhanced prompt describing issue in detail
- If unclear, ask user for clarification before routing
- Can combine routes: e.g., multiple type errors + UI issue → `$evc-cmd-fix-x-parallel`
