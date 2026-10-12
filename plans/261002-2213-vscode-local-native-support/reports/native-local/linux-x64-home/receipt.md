# Phase 08 Context Receipt: Linux x64 HOME Install

- **Context ID:** `linux-x64-home`
- **Date:** 2026-10-12
- **Harness:** VS Code Local
- **OS / Arch:** Linux x64 (7.1.10-200.fc44.x86_64)
- **VS Code Version:** 1.140.0
- **Scope:** HOME Install (`~/.evcrate-vscode/`)
- **Plugin Path:** `<fixture-root>/user-home/.evcrate-vscode`
- **Active Workspace Root:** `<fixture-root>/separate-project`
- **Candidate Digests:** Pinned to Phase 07 Candidate (tree hash `ad541bfdd377caa79843dce80cf2e981538d4f9d4cb7199a9ad3e5fe92105ee3`)
- **Status:** **QUALIFIED (PASSED)**

---

## 1. Scenario Execution Ledger

| Scenario | Stimulus | Expected Contract | Observed Outcome | Status |
|---|---|---|---|---|
| **HOME Registration** | Plugin installed under `~/.evcrate-vscode` | Absolute registration in `chat.pluginLocations` | Plugin discovery and runtime functional | **PASS** |
| **Root Disambiguation** | Foreign workspace executing HOME plugin | Never inherit HOME as project identity | Explicit project root resolved | **PASS** |
| **Session Lifecycle** | SessionStart + PreToolUse + Stop from foreign CWD | Full hook protocol operational from HOME location | All 3 events executed cleanly | **PASS** |

## 2. Key Findings
- HOME plugin directory does not pollute active project identity.
- Project-relative tools resolve strictly against `VSCODE_PROJECT_DIR`, not the HOME plugin parent path.
