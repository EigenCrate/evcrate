---
description: ⚡⚡ Analyze and fix issues [INTELLIGENT ROUTING]
argument-hint: [issues] [--advice]
---

**Analyze issues and route to specialized fix command:**
<issues>$ARGUMENTS</issues>

## Advice Mode

Parse the raw arguments for one exact, case-sensitive, whitespace-delimited
`--advice` token. It is explicit only when it is the final token after trailing
whitespace; reject duplicates and leave quoted, embedded, suffixed, non-final,
or differently cased text unchanged. Strip the final token into
`WORK_ARGUMENTS` before routing. Preserve explicit mode by appending exactly one
trailing `--advice` to the delegated command. If the selected specialist does
not declare `--advice`, route to `/fix:hard` with the same `WORK_ARGUMENTS` so
the requested advice gate is not silently dropped. Otherwise pass no mode token.
Read `{{evcrate:workflows/advisor-mentoring.md}}` before routing and require its
executable local bridge for the eventual named checkpoint.

## Decision Tree

**1. Check for existing plan:**
- If markdown plan exists → `/code <path-to-plan>` plus one trailing `--advice`
  when explicit mode is active

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

When explicit advice mode is active, apply the Advice Mode routing rule above
before emitting any of these handoffs; never report an advisor result before
the delegated command returns a terminal `ADVICE_READY` result from the local
bridge.

## Notes
- `detailed-description` = enhanced prompt describing issue in detail
- If unclear, ask user for clarification before routing
- Can combine routes: e.g., multiple type errors + UI issue → `/fix:parallel`
