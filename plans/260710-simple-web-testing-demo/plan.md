---
title: "Simple Web Testing Demo Plan"
description: "Build a tiny browser-facing demo app, then dogfood the web-testing skill to prove release gates with evidence."
status: completed
priority: P2
effort: 7h
branch: main
tags: [feature, frontend, testing, skill]
created: 2026-07-10
---

# Simple Web Testing Demo Plan

## Overview

Create a minimal Vite + TypeScript demo project, then use the new `web-testing` skill to define and run browser release gates. The demo should be intentionally small: one page, one accessible modal/form flow, enough behavior to test clickability, focus, validation, visual drift, performance, accessibility, and a lightweight load smoke.

## Phases

| # | Phase | Status | Effort | Link |
|---|-------|--------|--------|------|
| 1 | Scaffold Demo Project | DONE - 2026-07-10 | 1h | [phase-01-scaffold-demo-project.md](./phase-01-scaffold-demo-project.md) |
| 2 | Build Accessible Browser Flow | DONE - 2026-07-10 | 1h | [phase-02-build-accessible-browser-flow.md](./phase-02-build-accessible-browser-flow.md) |
| 3 | Add Core Test Tooling | DONE - 2026-07-10 | 2h | [phase-03-add-core-test-tooling.md](./phase-03-add-core-test-tooling.md) |
| 4 | Apply Web Testing Release Gate | DONE - 2026-07-10 | 2h | [phase-04-apply-web-testing-release-gate.md](./phase-04-apply-web-testing-release-gate.md) |
| 5 | Capture Evidence And Improve Skill | DONE - 2026-07-11 | 1h | [phase-05-capture-evidence-and-improve-skill.md](./phase-05-capture-evidence-and-improve-skill.md) |

## Dependencies

- Existing skill: `.claude/skills/web-testing/SKILL.md`
- Node.js and npm available in repo environment
- Playwright browser install during implementation
- k6 availability, or documented skip if not installed

## Notes

- Do not edit `.agents` derivatives manually; distribute script owns generated copies.
- Keep demo under `examples/simple-web-testing-demo/` unless implementor chooses a better repo convention.
- No active-plan script exists at `.codex/scripts/set-active-plan.cjs`; active state update is skipped for this repo.
- Phase 01 completed with isolated Vite + TypeScript scaffold, lockfile exception, and passing install, build, placeholder test, and audit validation.
- Phase 02 completed with accessible modal/form flow and user-approved review on 2026-07-10.
- Phase 03 completed on 2026-07-10 with Vitest and Playwright core tooling; artifact hygiene warning fixed, review score 10/10, user approved.
- Phase 04 completed on 2026-07-10: Added axe WCAG accessibility tests, visual snapshot tests, direct Lighthouse budget runner, optional k6 smoke test, README documentation; npm audit --audit-level=high: 0 vulnerabilities; npm run test:web-gate passed 5/5 Playwright + Lighthouse gate; code review score 9.2/10, user approved.
- Phase 05 completed on 2026-07-11: Evidence report generated at `plans/260710-simple-web-testing-demo/reports/260710-from-tester-to-main-web-gate-report.md`; README updated with latest evidence notes; CSP meta tag added; k6 Windows install docs provided. Test results: npm test 4/4✓, npm test:e2e 5/5✓, npm test:lighthouse✓, npm test:web-gate 5/5 Playwright+Lighthouse✓, npm test:k6 blocked (k6 binary missing—optional). Code review 10/10, no critical/warnings/suggestions, approved. Full release gate validation complete.

## Unresolved Questions

- Should the demo be checked into package distribution, or only used as an internal example?
- Should k6 be mandatory in CI, or optional local smoke because k6 may not be installed everywhere?
