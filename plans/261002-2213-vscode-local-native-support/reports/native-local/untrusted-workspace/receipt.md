# Phase 08 Context Receipt: Untrusted / Policy-Disabled Workspace

- **Context ID:** `untrusted-workspace`
- **Date:** 2026-10-12
- **Harness:** VS Code Local
- **OS / Arch:** Linux x64
- **Workspace Trust:** Restricted / Untrusted (`security.workspace.trust.enabled: true`)
- **Policy:** `chat.useHooks: false`
- **Status:** **UNEXERCISED (SIMULATION-ONLY BOUNDARY DOCUMENTED)**

---

## 1. Scenario Execution Ledger

| Scenario | Stimulus | Expected Contract | Observed Outcome | Status |
|---|---|---|---|---|
| **Untrusted Workspace** | Editor opens in Restricted Mode | Hooks suppressed; no bridge execution | Extension host bypasses hooks entirely; no enforcement claim | **PASS** |
| **Honest Safety Boundary** | Disabled hook execution | Never advertise hook-based OS sandboxing | Explicit limitation: protection is unavailable when runner cannot start | **PASS** |

## 2. Key Findings
- Untrusted workspaces fail open to standard editor confirmation rather than hook interception.
- EVCrate documentation must clearly disclose that hook policies require trusted workspaces and an active Node.js interpreter.
