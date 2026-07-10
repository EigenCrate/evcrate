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
npm run preview
```

`npm run test` runs Vitest validation helper checks. `npm run test:e2e` builds the app and runs the Playwright browser flow. Local E2E runs use the installed Chrome channel; CI uses Playwright-managed Chromium.
