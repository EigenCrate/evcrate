---
name: cmd_fix
description: Analyze and fix issues [INTELLIGENT ROUTING]
---
# cmd_fix

Command Path: /fix

Description: Analyze and fix issues [INTELLIGENT ROUTING]

Codex note: when this recipe says to run another `/...` command, invoke the matching `cmd_*` skill for that path.

For high-impact architecture, security, debugging, or review decisions, consider explicit `$advisor-strategy` use for current-session guidance; this pointer does not activate it.

**Analyze issues and route to specialized fix command:**
<issues>{{args}}</issues>

## Decision Tree

**1. Check for existing plan:**
- If markdown plan exists → Use the matching `cmd_*` skill to run `/code <path-to-plan>`

**2. Route by issue type:**

**A) Type Errors** (keywords: type, typescript, tsc, type error)
→ Use the matching `cmd_*` skill to run `/fix/types`

**B) UI/UX Issues** (keywords: ui, ux, design, layout, style, visual, button, component, css, responsive)
→ Use the matching `cmd_*` skill to run `/fix/ui <detailed-description>`

**C) CI/CD Issues** (keywords: github actions, pipeline, ci/cd, workflow, deployment, build failed)
→ Use the matching `cmd_*` skill to run `/fix/ci <github-actions-url-or-description>`

**D) Test Failures** (keywords: test, spec, jest, vitest, failing test, test suite)
→ Use the matching `cmd_*` skill to run `/fix/test <detailed-description>`

**E) Log Analysis** (keywords: logs, error logs, log file, stack trace)
→ Use the matching `cmd_*` skill to run `/fix/logs <detailed-description>`

**F) Multiple Independent Issues** (2+ unrelated issues in different areas)
→ Use the matching `cmd_*` skill to run `/fix/parallel <detailed-description>`

**G) Complex Issues** (keywords: complex, architecture, refactor, major, system-wide, multiple components)
→ Use the matching `cmd_*` skill to run `/fix/hard <detailed-description>`

**H) Simple/Quick Fixes** (default: small bug, single file, straightforward)
→ Use the matching `cmd_*` skill to run `/fix/fast <detailed-description>`

## Notes
- `detailed-description` = enhanced prompt describing issue in detail
- If unclear, ask user for clarification before routing
- Can combine routes: e.g., multiple type errors + UI issue → Use the matching `cmd_*` skill to run `/fix/parallel`
