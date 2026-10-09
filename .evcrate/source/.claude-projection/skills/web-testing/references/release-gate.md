# Release Gate

The point of this skill is not to maximize test count. The point is to catch the browser failures that escape attractive diffs: unclickable controls, broken focus, unstable layouts, wrong async waits, inaccessible UI, slow pages, and CI-only flake.

## Discovery Pass

Before writing tests, inspect the project for existing conventions:

- `package.json` scripts and package manager lockfile
- `playwright.config.*`, `tests/`, `e2e/`, `*.spec.ts`, `*.e2e.ts`
- `vitest.config.*`, `vite.config.*`, `*.test.ts`, testing-library setup
- CI workflows under `.github/workflows/` or equivalent
- `lighthouserc.*`, Lighthouse scripts, `web-vitals` instrumentation
- `k6/`, `load-tests/`, `*.k6.js`, API performance scripts
- accessibility helpers, axe setup, custom test fixtures

Prefer existing scripts and fixtures. If a project already has a test wrapper, use it instead of inventing a parallel command.

## Risk-Based Gate

Use this gate ladder:

1. Unit and integration tests for pure logic. Vitest is usually the right first check for utilities, hooks, data transforms, validators, and API client behavior.
2. Browser component tests for interactive components when the project already has a component test harness.
3. Playwright E2E for real flows across routing, forms, network, auth, storage, payments, and multi-step user tasks.
4. Accessibility checks for changed UI surfaces, especially modals, menus, forms, custom controls, and public pages.
5. Visual regression for layout-sensitive or responsive changes where DOM assertions cannot catch drift.
6. Lighthouse/Core Web Vitals budget for public, SEO, conversion, or performance-sensitive pages.
7. k6 for critical API-backed flows, high-traffic routes, checkout/payment APIs, and load-sensitive dashboards.

Do not force every gate on every change. Explain why a gate is selected or skipped.

## Definition Of Done

A web-facing change is release-ready only when the evidence matches the risk:

- The changed flow is covered by the narrowest useful automated checks.
- Critical click, type, submit, navigation, and async states are asserted in a browser when relevant.
- Keyboard and focus behavior is checked for dialogs, menus, popovers, drawers, tabs, and forms.
- Accessibility checks cover the changed page or component when the DOM is user-facing.
- Layout or screenshot coverage exists for visual drift risk.
- Vitals or Lighthouse budgets are checked for performance-sensitive pages.
- Load thresholds exist for traffic-sensitive API paths.
- CI artifacts make failures inspectable without rerunning locally.
- Remaining risk is named plainly.

## Good Release Report

Prefer evidence over confidence:

```text
Web testing gate
- Changed surface: checkout dialog and order submit flow
- Risk covered: role selector clickability, focus trap, Escape close, axe scan
- Commands run: pnpm test checkout-modal.spec.ts; pnpm playwright test checkout.spec.ts --project=chromium
- Result: pass
- Browser evidence: Playwright HTML report generated; trace/video retained only on failure
- Release decision: ready for this flow
- Remaining risk: no load test; API endpoint unchanged
```