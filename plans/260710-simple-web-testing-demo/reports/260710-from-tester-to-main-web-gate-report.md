# Task Report: Web Testing Gate Evidence

**From**: tester
**To**: main
**Date**: 2026-07-11
**Status**: Complete

## Summary

Dogfooded `.claude/skills/web-testing` against `examples/simple-web-testing-demo`. The documented web gate passed for unit, browser, accessibility, visual, and Lighthouse coverage. Optional k6 smoke was blocked because the `k6` binary is not installed in this Windows environment.

## Web Testing Gate

- Changed surface: `examples/simple-web-testing-demo` landing page and accessible release-check modal form.
- Risk covered: validation helper logic, browser click/type/submit flow, modal focus movement, Escape dismissal, WCAG axe scans, visual layout drift, Lighthouse budget.
- Commands run:
  - `npm run test` -> pass, 1 test file, 4 tests.
  - `npm run test:e2e` -> pass, build passed, 5 Playwright tests.
  - `npm run test:lighthouse` -> pass, build passed, Lighthouse reports written.
  - `npm run test:k6` -> blocked, `k6` command not found.
  - `npm run test:web-gate` -> pass, 5 Playwright tests plus Lighthouse gate.
- Result: pass for required web gate; optional k6 blocked by missing local dependency.
- Browser evidence:
  - Playwright list output: 5/5 passed in Chromium project.
  - Visual baselines checked by `tests/visual.spec.ts` snapshots.
  - Failure artifacts: none, because no Playwright failures or retries occurred; config retains trace/video/screenshot on failure or first retry only.
  - Lighthouse artifacts: `examples/simple-web-testing-demo/test-results/lighthouse/lighthouse-report.html` and `examples/simple-web-testing-demo/test-results/lighthouse/lighthouse-report.json`.
- Release decision: ready for the demo gate, excluding optional k6 smoke.
- Remaining risk: k6 smoke not executed locally. Next cheapest check is installing k6, starting `npm run preview`, then running `BASE_URL=http://127.0.0.1:4173 npm run test:k6`.

## Eval Comparison

- Eval 1 expected modal clickability, Escape/focus behavior, axe/WCAG check, commands, and evidence. Covered by `tests/demo-flow.spec.ts`, `tests/accessibility.spec.ts`, and this report.
- Eval 2 expected flake-safe Playwright patterns: no hard waits, role/name selectors, web-first assertions, and failure-focused artifacts. Existing specs and config align; no skill gap found during this run.
- Eval 3 expected a CI-style composition of Vitest, Playwright, axe, Lighthouse/Core Web Vitals budget, visual regression, k6 smoke thresholds, artifacts, and a clear pass/fail report. Required gates are implemented; k6 remains optional because the binary is environment-dependent and documented.

## Skill Assessment

No `.claude/skills/web-testing` patch needed. The current skill guided the dogfood run toward exact commands, artifact paths, skipped-gate rationale, and a release decision without overfitting to this demo.

## Unresolved Questions

- Should k6 stay optional for local contributors, or become mandatory in CI with an installation step?
- Should this demo be packaged as public example material or kept internal?