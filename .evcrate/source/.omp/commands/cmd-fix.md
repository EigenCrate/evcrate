---
argument-hint: "[issues] [--advice]"
description: "⚡⚡ Analyze and fix issues [INTELLIGENT ROUTING]"
---


**Analyze the issue, select the narrowest fix workflow, and execute it in this session:**
<issues>$ARGUMENTS</issues>

## Advice Mode

Parse the raw arguments for one exact, case-sensitive, whitespace-delimited
`--advice` token. It is explicit only when it is the final token after trailing
whitespace; reject duplicates and leave quoted, embedded, suffixed, non-final,
or differently cased text unchanged. Strip the final token into
`WORK_ARGUMENTS` before routing. Preserve explicit mode by appending exactly one
trailing `--advice` to the delegated command. If the selected specialist does
not declare `--advice`, route to `/cmd-fix__hard` with the same `WORK_ARGUMENTS` so
the requested advice gate is not silently dropped. Otherwise pass no mode token.
Read `.omp/evcrate/workflows/advisor-mentoring.md` if present; otherwise read `~/.omp/agent/evcrate/workflows/advisor-mentoring.md` before routing. Its checkpoint
request goes directly to `~/.evcrate/bin/evcrate-advisor`.

## Execution Contract

After selecting a route, execute the selected command immediately; do not print
a route for the user to run manually.

1. Build one enhanced description from `WORK_ARGUMENTS` and preserve it exactly
   as the delegated command's input.
2. When the host exposes `OMP command`, execute the selected route with that
   mechanism in the same session. For example, `/cmd-fix__hard` is defined by
   `.omp/commands/cmd-fix__hard.md`.
3. If this command environment cannot recursively invoke a file-based slash
   command, read the selected command definition and perform that workflow
   directly in the current session. Never emit a bare specialist-command
   handoff, ask the user to rerun it, or stop after route selection.
4. Wait for the delegated workflow to reach its terminal result before reporting
   the route. The router must not duplicate advisor calls or summarize a
   partial delegation.


## Decision Tree

**1. Check for existing plan:**
- If a markdown plan exists, select `/cmd-code <path-to-plan>` and append one trailing
  `--advice` only when explicit mode is active. Execute it under the contract
  above.

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

When explicit advice mode is active, apply the Advice Mode routing rule above
before selecting a route, then execute the selected command under the contract
above. Never report an advisor result before the delegated command returns a
terminal `ADVICE_READY` result from `~/.evcrate/bin/evcrate-advisor`.

## Notes
- `detailed-description` = enhanced prompt describing issue in detail
- If unclear, ask user for clarification before routing
- Can combine routes: e.g., multiple type errors + UI issue → `/cmd-fix__parallel`
