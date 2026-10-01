---
name: "evcrate-cmd-fix"
description: "Analyze and fix issues [INTELLIGENT ROUTING]"
argument-hint: "[issues] [--advice]"
user-invocable: true
disable-model-invocation: true
---

## Invocation contract

The literal `$ARGUMENTS` is the exact raw text following `/evcrate-cmd-fix`. Do not split, normalize, or discard it before the canonical command parses it.

Before executing this command, read these EVCrate workflow assets:
- `@evcrate/workflows/advisor-mentoring.md`
- `@evcrate/workflows/advisory-interview.md`
- `@evcrate/workflows/development-rules.md`
- `@evcrate/workflows/documentation-management.md`
- `@evcrate/workflows/orchestration-protocol.md`
- `@evcrate/workflows/primary-workflow.md`

**Analyze the issue, select the narrowest fix workflow, and execute it in this session:**
<issues>$ARGUMENTS</issues>

## Advice Mode

Parse the raw arguments for one exact, case-sensitive, whitespace-delimited
`--advice` token. It is explicit only when it is the final token after trailing
whitespace; reject duplicates and leave quoted, embedded, suffixed, non-final,
or differently cased text unchanged. Strip the final token into
`WORK_ARGUMENTS` before routing. Preserve explicit mode by appending exactly one
trailing `--advice` to the delegated command.

When the caller has an active advice run context (`task_run_id`, active phase,
project root, state revision, prior counsel/disposition/outcome), preserve that
active caller context across delegation. Never initialize a new UUID to bypass
stale evidence or counters. The root router is stateless and must not initialize
state runs, record duplicate consultations, or perform advisor calls itself; all
durable operations and checkpoint invocations belong to the delegated command.

If the selected specialist does not declare `--advice`, route to `/evcrate-cmd-fix-hard`
with the same `WORK_ARGUMENTS` and active caller context so the requested advice
gate is not silently dropped. Otherwise pass no mode token.
Read `.copilot/evcrate/workflows/advisor-mentoring.md` before routing. Checkpoint and state
requests use its authoritative host-aware invocation contract (POSIX direct path or
Windows PowerShell / Node argv-array).

## Execution Contract

After selecting a route, execute the selected command immediately; do not print
a route for the user to run manually.

1. Build one enhanced description from `WORK_ARGUMENTS` and preserve it exactly
   as the delegated command's input. Preserve active caller context (`task_run_id`,
   phase, state revision, prior counsel/disposition/outcome) and append trailing
   `--advice` only when explicit mode is active.
2. When the host exposes `Copilot slash command`, execute the selected route with that
   mechanism in the same session. For example, `/evcrate-cmd-fix-hard` is defined by
   `.copilot/skills/evcrate-cmd-fix-hard/SKILL.md`.
3. If this command environment cannot recursively invoke a file-based slash
   command, read the selected command definition and perform that workflow
   directly in the current session. Never emit a bare specialist-command
   handoff, ask the user to rerun it, or stop after route selection.
4. Wait for the delegated workflow to reach its terminal result before reporting
   the route. The router is stateless and must not duplicate advisor calls,
   initialize state runs, or summarize a partial delegation.


## Decision Tree

**1. Check for existing plan:**
- If a markdown plan exists, select `/evcrate-cmd-code <path-to-plan>`, append one trailing
  `--advice` only when explicit mode is active, and preserve any active caller
  context. Execute it under the contract above.

**2. Route by issue type:**

**A) Type Errors** (keywords: type, typescript, tsc, type error)
→ `/evcrate-cmd-fix-types`

**B) UI/UX Issues** (keywords: ui, ux, design, layout, style, visual, button, component, css, responsive)
→ `/evcrate-cmd-fix-ui <detailed-description>`

**C) CI/CD Issues** (keywords: github actions, pipeline, ci/cd, workflow, deployment, build failed)
→ `/evcrate-cmd-fix-ci <github-actions-url-or-description>`

**D) Test Failures** (keywords: test, spec, jest, vitest, failing test, test suite)
→ `/evcrate-cmd-fix-test <detailed-description>`

**E) Log Analysis** (keywords: logs, error logs, log file, stack trace)
→ `/evcrate-cmd-fix-logs <detailed-description>`

**F) Multiple Independent Issues** (2+ unrelated issues in different areas)
→ `/evcrate-cmd-fix-parallel <detailed-description>`

**G) Complex Issues** (keywords: complex, architecture, refactor, major, system-wide, multiple components)
→ `/evcrate-cmd-fix-hard <detailed-description>`

**H) Simple/Quick Fixes** (default: small bug, single file, straightforward)
→ `/evcrate-cmd-fix-fast <detailed-description>`

When explicit advice mode is active, apply the Advice Mode routing rule above:
specialists that declare `--advice` (`/evcrate-cmd-fix-test`, `/evcrate-cmd-fix-logs`, `/evcrate-cmd-fix-parallel`,
`/evcrate-cmd-fix-hard`) receive trailing `--advice` directly, while specialists without
advice support (`/evcrate-cmd-fix-types`, `/evcrate-cmd-fix-ui`, `/evcrate-cmd-fix-ci`, `/evcrate-cmd-fix-fast`) route to
`/evcrate-cmd-fix-hard <detailed-description>` with trailing `--advice` and active caller
context. When explicit advice mode is default (no `--advice`), route directly
to the designated specialist without an `--advice` token. Execute the selected
command under the contract above. Never report an advisor result before the
delegated command returns a terminal `ADVICE_READY` result from the central
controller according to the host-aware invocation contract in
`.copilot/evcrate/workflows/advisor-mentoring.md`.
## Notes
- `detailed-description` = enhanced prompt describing issue in detail
- If unclear, ask user for clarification before routing
- Can combine routes: e.g., multiple type errors + UI issue → `/evcrate-cmd-fix-parallel`
