# Phase 08 Context Receipt: Diagnostic Protocol Probes

- **Context ID:** `diagnostic-protocol-probes`
- **Date:** 2026-10-12
- **Fixture:** `tests/fixtures/vscode-local/native-plugin/evcrate/capture-hook.cjs`
- **Classification:** **Diagnostic Protocol Probes (Non-Production Fixture)**
- **Status:** **QUALIFIED (HOST ENVELOPE VERIFIED)**

---

## 1. Protocol Edge Matrix

| Probe | Stimulus | Expected Host Contract | Observed Outcome | Status |
|---|---|---|---|---|
| **Stop Blocking** | `stop_hook_active: false`, block flag | Emits `hookSpecificOutput.decision: "block"` | Stop blocking decision emitted | **PASS** |
| **Stop Loop Guard** | `stop_hook_active: true`, block flag | Suppresses block decision to break infinite loop | `continue: true`, block suppressed | **PASS** |
| **PreToolUse Deny** | Malicious/disallowed operand | Emits `permissionDecision: "deny"` | Explicit deny envelope emitted | **PASS** |

## 2. Production Boundary Disclosure
- Production `local-hook-bridge.cjs` returns no-action `{}` for Stop and SubagentStop.
- These diagnostic probes verify the extension-host protocol envelope capability in isolation.
- Probes do NOT advertise blocking stop or input rewrite as production features.
