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
npm run preview
```

`npm test` is still a placeholder gate. `npm run build` runs TypeScript and Vite production build validation.
