---
argument-hint: "[issues]"
description: "Analyze and fix issues [INTELLIGENT ROUTING]"
---


**Analyze issues and route to specialized fix command:**
<issues>$ARGUMENTS</issues>

## Decision Tree

**1. Check for existing plan:**
- If markdown plan exists → `/evc-cmd-code <path-to-plan>`

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

## Notes
- `detailed-description` = enhanced prompt describing issue in detail
- If unclear, ask user for clarification before routing
- Can combine routes: e.g., multiple type errors + UI issue → `/evc-cmd-fix-x-parallel`
