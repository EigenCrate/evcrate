---
name: web-testing
description: "Web testing release-gate workflow for browser-facing changes. Use this skill whenever the user works on frontend UI, browser flows, Playwright, Vitest, k6, axe/WCAG, Lighthouse/Core Web Vitals, visual regression, flaky tests, hard waits, CI browser tests, or asks if a web change is ready to release. It guides Claude to prove behavior in a real browser with evidence instead of relying only on diffs, unit tests, or confident summaries."
compatibility: "JavaScript and TypeScript web projects using Playwright, Vitest, k6, axe-core, Lighthouse/Lighthouse CI, visual regression tooling, or equivalent project-native test tools."
---

# Web Testing

Use this skill when browser behavior is part of the risk. A clean diff and green unit tests are not enough for user-facing web changes; the release gate needs evidence from the real browser surface.

## Load The Right Reference

- For release readiness, test selection, or Definition of Done: read `references/release-gate.md`.
- For Playwright E2E/component tests, selectors, waits, or flake repair: read `references/playwright-patterns.md`.
- For accessibility, Lighthouse/Core Web Vitals, visual regression, or k6 load tests: read `references/accessibility-performance-visual-load.md`.
- For CI sharding, retries, trace/video/screenshot policy, or artifacts: read `references/ci-artifacts.md`.

## Core Workflow

1. Identify the changed browser surface: page, component, modal, form, navigation, data flow, auth/session path, checkout/payment path, or public landing page.
2. Inspect existing project tooling before adding anything: package manager, scripts, Playwright config, Vitest config, CI workflow, Lighthouse/LHCI, k6, axe, and visual snapshot setup.
3. Choose the smallest gate that can catch the actual release risk. Add new tools only when existing project-native checks cannot cover the risk.
4. Prefer real user behavior over implementation details. Browser tests should prove what users can see, click, type, tab through, wait for, and recover from.
5. Write or repair tests with stable selectors, auto-waiting, isolated state, and observable assertions.
6. Run the narrowest useful validation first, then broaden only when the change affects shared flows or release-critical pages.
7. Report the evidence: commands run, pass/fail result, artifacts, uncovered risks, and any follow-up needed.

## Gate Selection

| Risk | Default gate |
| --- | --- |
| Pure logic, formatter, parser, hook, utility | Vitest unit/integration |
| Component behavior visible in browser | Playwright component test or project-native browser component test |
| Page navigation, forms, auth, checkout, search, admin workflows | Playwright E2E |
| Modal, menu, drawer, popover, command palette | Playwright keyboard/focus checks plus accessibility scan |
| Layout, responsive UI, charts, visual polish, generated pages | Playwright screenshot or existing visual regression gate |
| Public page or performance-sensitive flow | Lighthouse/LHCI and Core Web Vitals budget |
| API-backed critical path or traffic-sensitive endpoint | k6 smoke/load test with explicit thresholds |
| Flaky browser suite | Playwright flake audit before adding retries |

## Test Quality Rules

- Prefer selectors in this order: `getByRole` with accessible name, `getByLabel`, visible text, stable `getByTestId`, then CSS only when no user-facing contract exists.
- Use Playwright web-first assertions such as `await expect(locator).toBeVisible()` instead of manual one-shot checks.
- Avoid arbitrary sleeps. Replace `waitForTimeout` with auto-waiting actions, locator assertions, response waits, `expect.poll`, or `expect.toPass`.
- Keep tests isolated. Do not let one test depend on another test's local storage, cookies, database rows, network state, or prior navigation.
- Treat retries as signal, not a hiding place. A retry can gather artifacts or reduce known CI noise, but it should not mask a bug.
- Capture trace, video, and screenshots on failure or first retry by default. Always-on artifacts slow suites and create noise.

## Release Evidence Report

When finishing web-facing work, respond with this shape:

```text
Web testing gate
- Changed surface: <pages/components/flows>
- Risk covered: <clickability, keyboard, a11y, layout, vitals, load, flake, etc.>
- Commands run: <exact commands>
- Result: <pass/fail/blocked>
- Browser evidence: <Playwright report, trace, screenshots, videos, axe, Lighthouse, k6, or none with reason>
- Release decision: <ready / not ready / partial>
- Remaining risk: <what was not tested and why>
```

If no executable browser validation is possible, say why and provide the next cheapest concrete check instead of claiming release readiness.