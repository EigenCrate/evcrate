# Phase 04: Apply Web Testing Release Gate

## Context Links

- Parent plan: [plan.md](./plan.md)
- Previous phase: [phase-03-add-core-test-tooling.md](./phase-03-add-core-test-tooling.md)
- Skill entrypoint: `.claude/skills/web-testing/SKILL.md`
- References: `.claude/skills/web-testing/references/accessibility-performance-visual-load.md`, `.claude/skills/web-testing/references/ci-artifacts.md`

## Overview

- Date: 2026-07-10
- Priority: P2
- Implementation status: Complete
- Review status: Approved (9.2/10)
- Description: Applied web-testing skill to add release gates: accessibility scanning, visual regression, direct Lighthouse budget checks, mandatory k6 smoke checks with explicit install guidance.

## Key Insights

- This phase dogfoods the skill directly.
- Each gate should map to a real risk from the demo surface.
- Skipped gates need explicit reason, not silence.

## Requirements

- Add axe/WCAG accessibility gate for page and modal-open states.
- Add visual regression screenshot for page/modal layout.
- Add Lighthouse budget against built preview.
- Add k6 smoke test against local preview and fail with install guidance when k6 is unavailable.
- Add a combined `test:web-gate` script or documented command sequence.

## Architecture

- Playwright drives page and modal states.
- Axe runs through Playwright context.
- Direct Lighthouse runner serves the built `dist` directory locally.
- k6 checks HTTP availability of local preview.

## Related Code Files

- Modify: `examples/simple-web-testing-demo/package.json`
- Modify: `examples/simple-web-testing-demo/playwright.config.ts`
- Create: `examples/simple-web-testing-demo/tests/accessibility.spec.ts`
- Create: `examples/simple-web-testing-demo/tests/visual.spec.ts`
- Create: `examples/simple-web-testing-demo/lighthouserc.json`
- Create: `examples/simple-web-testing-demo/scripts/run-lighthouse-gate.mjs`
- Create: `examples/simple-web-testing-demo/k6/smoke.js`
- Modify: `examples/simple-web-testing-demo/README.md`

## Implementation Steps

1. Read `web-testing` entrypoint and relevant references.
2. Add axe dependency and accessibility tests.
3. Add screenshot tests with deterministic data and viewport.
4. Configure Lighthouse budget with realistic thresholds for tiny Vite app.
5. Add k6 smoke script and npm wrapper that verifies k6 exists, documents install options, and starts local preview automatically.
6. Add `test:web-gate` script or release-gate command checklist.

## Todo List

- [x] Add accessibility gate.
- [x] Add visual regression gate.
- [x] Add Lighthouse budget.
- [x] Add k6 smoke check with explicit binary prerequisite and install guidance.
- [x] Add release-gate script/docs.

## Success Criteria

- [x] Accessibility gate passes with no serious/critical issues.
- [x] Visual baseline is deterministic.
- [x] Lighthouse budget passes or threshold rationale is documented.
- [x] k6 smoke fails clearly if the binary is absent and runs as part of `test:web-gate` when installed.
- [x] Release gate script integrated: `npm run test:web-gate` runs all gates.

### Validation Results

- npm audit --audit-level=high: **0 vulnerabilities**
- npm run test:web-gate: **Passed** (Playwright 5/5 tests, Lighthouse budget gate, k6 smoke)
- npm run test:k6: **Passed** (local preview, 1 VU / 10s smoke, 100% checks)
- Visual regression: **Baseline committed** (deterministic snapshots)
- Accessibility: **No critical/serious issues**

## Risk Assessment

- Risk: Lighthouse/k6 adds brittle environment assumptions.
- Mitigation: Keep them lightweight and document prerequisites.
- Risk: Visual tests fail due to fonts/animations.
- Mitigation: Disable animations and use fixed viewport/data.

## Security Considerations

- k6 must target local preview only.
- Lighthouse reports should stay local unless upload is configured intentionally.

## Next Steps

- Phase 05 captures evidence and identifies gaps in the skill.