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
- Wait protocol: use the native agent wait/poll operation for the same agent set. **"No agents completed yet" is a non-terminal poll result; wait again.** Do not treat it as a timeout, sleep instead of polling, restart, interrupt, or advance the workflow.
- A polling interval or retry count is not a delegation deadline. Do not invent a wall-clock limit (including 180 seconds) for a blocking gate. Continue polling until a terminal result, explicit user stop, or an actual parent-runtime termination.
- Treat an interrupted, timed-out, missing, or partial result as a failed gate. Do not continue from partial work or silently skip/restart the agent.
- Sequential prompt format: **run one agent; wait for its terminal result; verify the report/artifacts; then run the next agent**.
- Every delegated prompt must define scope, file ownership, expected report/artifact, and validation signal.
- A spawn acknowledgement, progress event, or file change does not mean the agent completed. Completion requires the terminal response and requested validation.
- If the parent runtime ends before completion, preserve the agent identity and report the gate as incomplete; never fabricate a result or launch a replacement.

**Analyze the issue, select the narrowest fix workflow, and execute it in this session:**
<issues>{{args}}</issues>

## Advice Mode

Parse the raw arguments for one exact, case-sensitive, whitespace-delimited
`--advice` token. It is explicit only when it is the final token after trailing
whitespace; reject duplicates and leave quoted, embedded, suffixed, non-final,
or differently cased text unchanged. Strip the final token into
`WORK_ARGUMENTS` before routing. Preserve explicit mode by appending exactly one
trailing `--advice` to the delegated command. If the selected specialist does
not declare `--advice`, route to `/fix:hard` with the same `WORK_ARGUMENTS` so
the requested advice gate is not silently dropped. Otherwise pass no mode token.
Read `.codex/workflows/advisor-mentoring.md` if present; otherwise read `~/.codex/workflows/advisor-mentoring.md` (the published install) before routing. Its checkpoint
request goes directly to `~/.evcrate/bin/evcrate-advisor`.

## Execution Contract

After selecting a route, execute the selected command immediately; do not print
a route for the user to run manually.

1. Build one enhanced description from `WORK_ARGUMENTS` and preserve it exactly
   as the delegated command's input.
2. When the host exposes `Codex slash command`, execute the selected route with that
   mechanism in the same session. For example, `/fix:hard` is defined by
   `.codex/commands/fix/hard.md`.
3. If this command environment cannot recursively invoke a file-based slash
   command, read the selected command definition and perform that workflow
   directly in the current session. Never emit a bare specialist-command
   handoff, ask the user to rerun it, or stop after route selection.
4. Wait for the delegated workflow to reach its terminal result before reporting
   the route. The router must not duplicate advisor calls or summarize a
   partial delegation.


## Decision Tree

**1. Check for existing plan:**
- If a markdown plan exists, select `/code <path-to-plan>` and append one trailing
  `--advice` only when explicit mode is active. Execute it under the contract
  above.

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

When explicit advice mode is active, apply the Advice Mode routing rule above
before selecting a route, then execute the selected command under the contract
above. Never report an advisor result before the delegated command returns a
terminal `ADVICE_READY` result from `~/.evcrate/bin/evcrate-advisor`.

## Notes
- `detailed-description` = enhanced prompt describing issue in detail
- If unclear, ask user for clarification before routing
- Can combine routes: e.g., multiple type errors + UI issue → Use the matching `cmd_*` skill to run `/fix:parallel`
