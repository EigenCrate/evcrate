# Simple Web Testing Demo

A tiny Vite + TypeScript app for dogfooding browser release gates.

Requires Node.js `>=20.19` or `>=22.12`.

## Browser Flow

The demo renders a semantic release-gate page with a modal form used to check clickability, focus movement, keyboard dismissal, validation messaging, and live status updates.

## Local Commands

```bash
npm install
npm run dev
npm run build
npm run test
npm run test:e2e
npm run test:lighthouse
npm run test:k6
npm run test:web-gate
npm run preview
```

`npm run test` runs Vitest validation helper checks. `npm run test:e2e` builds the app and runs the Playwright browser flow. Local E2E runs use the installed Chrome channel; CI uses Playwright-managed Chromium.

## Web Testing Gate

`npm run test:web-gate` runs the mandatory browser release gate for this demo: Playwright flow tests, axe accessibility scans for the page and modal-open state, visual regression screenshots, the Lighthouse budget, and the k6 smoke check. Lighthouse serves the built `dist` directory, writes local reports under `test-results/lighthouse`, and does not upload externally.

Visual baselines are intentionally committed from Playwright's deterministic Chromium viewport. Refresh them only after reviewing the rendered layout:

```bash
npm run build
npx playwright test tests/visual.spec.ts --update-snapshots
```

k6 requires the `k6` runtime, but this demo's runner also detects the default Windows install path at `C:\Program Files\k6\k6.exe`. If `k6 version` fails in the current terminal while `npm run test:k6` still passes, the most likely cause is that the current shell session has not picked up the installed PATH yet. The script only shows install guidance when it cannot find any usable k6 binary. It builds the app, starts the local preview server automatically, and targets the local app only.

After installing k6, reopen the terminal if `k6 version` is still not found. On Windows, the runner also checks the default `C:\Program Files\k6\k6.exe` install path used by winget and continues with it when available.

Windows install option:

```powershell
winget install k6.k6
```

```bash
npm run build
npm run test:k6

# Optional: target an already running server instead of starting preview.
BASE_URL=http://127.0.0.1:4173 npm run test:k6
```

## Latest Gate Evidence

2026-07-12 rerun, confirming the earlier Windows k6 alert was a PATH refresh issue rather than a failed install:

- `npm run test`: passed, 1 file and 4 tests.
- `npm run test:e2e`: passed, 5 Playwright tests after build.
- `npm run test:lighthouse`: passed, reports written to `test-results/lighthouse`.
- `k6 version`: failed in the current PowerShell terminal because PATH has not refreshed yet.
- `npm run test:k6`: passed by using the installed binary at `C:\Program Files\k6\k6.exe`; local preview plus 1 VU / 10s smoke, 100% checks, p95 HTTP duration 1.83ms.
- `npm run test:web-gate`: passed, Playwright plus Lighthouse plus k6.

Full evidence report: `../../plans/260710-simple-web-testing-demo/reports/260710-from-tester-to-main-web-gate-report.md`.
