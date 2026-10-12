# Phase 08 Context Receipt: Linux x64 Project Install

- **Context ID:** `linux-x64-project`
- **Date:** 2026-10-12
- **Harness:** VS Code Local
- **OS / Arch:** Linux x64 (7.1.10-200.fc44.x86_64)
- **VS Code Version:** 1.140.0 (commit `07f806f999227108933c2e30515b26eecc1fda74`)
- **Copilot Chat Version:** 0.68.0
- **Copilot Runtime:** `@github/copilot-sdk-linux-x64/prebuilds/linux-x64/copilot-runtime`
- **Scope:** Project Install (`.evcrate-vscode/`)
- **Active Workspace Root:** `<fixture-root>/project`
- **Candidate Digests:**
  - targets-manifest: `5ab0ec1105cb652a58a438969f528608a36f587c2e5d1f90500a561a844dcb80`
  - registry-json: `932068eccc9b94b941ca2804ee4713e43e57f669351140451275abc19142574f`
  - plugin-json: `9d9ad4c0072c657ca491f972a33955065de2d55a9f4cf3546f29976f45074685`
  - hooks-json: `adf6fae5f9ad661eafce76c6d81e853b1c33662e29eb245b344ddda26109b946`
  - bridge-script: `4f90d9391fa17a9d7e27c0752c5d7b89dc1919a417c73f58ad3fb6171f741f05`
  - bootstrap-rules: `90235ee934a058bbdcb3c2fffbda37395674e90c662ab716807ff1e4720a9553`
  - bundle-tree: `ad541bfdd377caa79843dce80cf2e981538d4f9d4cb7199a9ad3e5fe92105ee3` (756 files)
- **Status:** **QUALIFIED (PASSED)**

---

## 1. Scenario Execution Ledger

| Scenario | Stimulus | Expected Contract | Observed Outcome | Status |
|---|---|---|---|---|
| **SessionStart** | `source: new`, session ID, project CWD | Returns `continue: true`, event metadata | Exit code 0, event context delivered | **PASS** |
| **Active Plan** | CLI `set-active-plan.cjs` | CAS atomic session record updated | Exit code 0, plan persisted in session | **PASS** |
| **UserPromptSubmit** | Subsequent user prompt | Common envelope processing, clean context | Exit code 0, prompt processed | **PASS** |
| **PreToolUse: Benign Read** | `read_file` on `src/index.ts` | Allow access, continue execution | Exit code 0, permitted | **PASS** |
| **PreToolUse: Scout Policy** | `read_file` on `node_modules/heavy-dep/large.js` | Deny access to heavy directory | Access denied per scout policy | **PASS** |
| **PreToolUse: Privacy Policy** | `read_file` on `.env` marker | Request explicit human confirmation (`ask`) | `permissionDecision: ask` returned | **PASS** |
| **PostToolUse: Read** | Normal read tool completion | No extraneous modularization context | Exit code 0, no additional context | **PASS** |
| **PostToolUse: Over-threshold Edit** | Edit file with >200 lines | Emits string modularization reminder in `systemMessage` | Modularization reminder emitted | **PASS** |
| **PreCompact** | Compaction event | Bounded compact marker preserved, plan intact | Exit code 0, compact marker recorded | **PASS** |
| **SubagentStart** | Worker agent delegation | Nested event context with current plan | Exit code 0, subagent context passed | **PASS** |
| **SubagentStop** | Worker agent completion | Production no-action `{}`, state intact | Exit code 0, no destructive teardown | **PASS** |
| **Stop** | Normal turn completion | Production no-action `{}`, multi-turn plan persists | Exit code 0, no-action returned | **PASS** |
| **Security Child Error** | Child process exit 127 simulation | Fail-closed deny (exit code 2), bounded error diagnostic | Exit code 2, operation denied | **PASS** |

## 2. Capability Verification Evidence

1. **Bootstrap Instructions (`applyTo: "**"`):** Always-on rule verified at `com.github.copilot/rules/bootstrap.instructions.md` (digest `90235ee934a058bbdcb3c2fffbda37395674e90c662ab716807ff1e4720a9553`).
2. **Explicit No-Tools Agent:** Verified `com.github.copilot/agents/advisor.agent.md` defines `tools: []` and `agents: []`. Tool-less isolation prevents read/write/shell execution.
3. **Foreign CWD Invariant:** Bridge successfully executed from `<fixture-root>/foreign-cwd` using explicit `VSCODE_PROJECT_DIR` without falling back to process working directory.
