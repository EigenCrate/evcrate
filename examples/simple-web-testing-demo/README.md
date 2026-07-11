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

`npm run test:web-gate` runs the mandatory browser release gate for this demo: Playwright flow tests, axe accessibility scans for the page and modal-open state, visual regression screenshots, and the Lighthouse budget. Lighthouse serves the built `dist` directory, writes local reports under `test-results/lighthouse`, and does not upload externally.

Visual baselines are intentionally committed from Playwright's deterministic Chromium viewport. Refresh them only after reviewing the rendered layout:

```bash
npm run build
npx playwright test tests/visual.spec.ts --update-snapshots
```

The optional k6 smoke check requires the `k6` binary and a running preview server. It targets the local app only and is separate from `test:web-gate` because k6 may not be installed on every workstation:

```bash
npm run build
npm run preview
BASE_URL=http://127.0.0.1:4173 npm run test:k6
```
