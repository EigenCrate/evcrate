---
name: evc-cmd-fix
description: "Analyze and fix issues [INTELLIGENT ROUTING]"
user-invocable: true
disable-model-invocation: true
argument-hint: "[issues]"
---

**Analyze the issue, select the narrowest fix workflow, and execute it in this session:**
<raw-issues>$ARGUMENTS</raw-issues>

## Scope and routing

Treat complete raw invocation arguments as ordinary task data. Apply neutral
`.evcrate-vscode/evcrate/workflows/plan-progress.md` if present; otherwise read `~/.evcrate-vscode/evcrate/workflows/plan-progress.md` (the published install) for selected scope and dependencies.
Preserve sealed history; completed requested scope is a no-op.
This router owns route selection, not duplicated specialist finalization.
## Execution Contract

After selecting a route, execute the selected command immediately; do not print a route for the user to run manually.

1. Build one enhanced issue description from the raw task data and preserve it
   exactly as the selected command's input, with known scope and evidence.
2. Route directly to the designated specialist by issue type.
3. When the host exposes `SlashCommand`, execute that route in the same session.
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
- If a markdown plan exists, select `/evc-cmd-code <path-to-plan>` and execute it under the contract above, after scope reconciliation.

**2. Route by issue type:**

**A) Type Errors** (keywords: type, typescript, tsc, type error)
→ `/evc-cmd-fix-x-types`

**B) UI/UX Issues** (keywords: ui, ux, design, layout, style, visual, button, component, css, responsive)
→ `/evc-cmd-fix-x-ui <detailed-description>`

**C) CI/CD Issues** (keywords: github actions, pipeline, ci/cd, workflow, deployment, build failed)
→ `/evc-cmd-fix-x-ci <github-actions-url-or-description>`

**D) Test Failures** (keywords: test, spec, jest, vitest, failing test, test suite)
→ `/evc-cmd-fix-x-test <detailed-description>`

**E) Log Analysis** (keywords: logs, error logs, log file, stack trace)
→ `/evc-cmd-fix-x-logs <detailed-description>`

**F) Multiple Independent Issues** (2+ unrelated issues in different areas)
→ `/evc-cmd-fix-x-parallel <detailed-description>`

**G) Complex Issues** (keywords: complex, architecture, refactor, major, system-wide, multiple components)
→ `/evc-cmd-fix-x-hard <detailed-description>`

**H) Simple/Quick Fixes** (default: small bug, single file, straightforward)
→ `/evc-cmd-fix-x-fast <detailed-description>`

Route directly by issue type and execute the selected command under the contract above; preserve task data and ordinary engineering gates.
## Notes
- `detailed-description` = enhanced prompt describing issue in detail
- If unclear, ask user for clarification before routing
- Can combine routes: e.g., multiple type errors + UI issue → `/evc-cmd-fix-x-parallel`
