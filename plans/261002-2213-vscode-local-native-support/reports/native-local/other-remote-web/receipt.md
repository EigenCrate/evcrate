# Phase 08 Context Receipt: Web / Browser-based VS Code

- **Context ID:** `other-remote-web`
- **Date:** 2026-10-12
- **Status:** **EXPLICITLY UNSUPPORTED (ARCHITECTURAL BOUNDARY)**
- **Rationale:**
  - Web/browser-based VS Code (vscode.dev, github.dev) operates in a sandboxed WebWorker or browser sandbox without local Node.js child process execution.
  - EVCrate Local hooks rely on CommonJS child process invocation (`local-hook-bridge.cjs`).
  - Browser environments cannot inherit process hook execution.
  - Disposed as explicitly unsupported by design; no fallback simulation permitted.
