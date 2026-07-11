# Task Report: Simple Web Testing Demo Plan

**From**: planner
**To**: main
**Date**: 2026-07-10
**Status**: Complete

## Summary

Created a plan to build a small Vite + TypeScript browser demo and use `.claude/skills/web-testing` to test it with real release gates.

## Details

The plan is scoped to documentation only. It does not implement the demo. It keeps `.claude/skills/` as source of truth and leaves generated `.agents`, `.codex`, and `.gemini` folders untouched.

Plan directory: `plans/260710-simple-web-testing-demo/`

## Recommendations

- Keep demo under `examples/simple-web-testing-demo/`.
- Use one modal/form flow as the behavior surface.
- Gate with Vitest, Playwright, axe, visual screenshot, Lighthouse/LHCI, and k6 smoke where available.
- Capture final evidence in the `web-testing` report shape.

## Concerns

- `.codex/scripts/set-active-plan.cjs` is missing, so active plan state could not be set automatically.
- k6 may not exist in all contributor environments; plan allows documented skip.

## Unresolved Questions

- Should this demo be part of published package assets?
- Should k6 be required in CI or kept as optional smoke documentation?