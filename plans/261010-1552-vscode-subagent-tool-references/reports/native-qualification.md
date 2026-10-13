# Phase 05 Native Qualification Report: Delegation and Permissions

- **Date:** 2026-10-11T05:18:01.444Z
- **Plan:** `plans/261010-1552-vscode-subagent-tool-references/plan.md`
- **Phase:** `phase-05` (Native delegation and permissions)
- **Status:** **QUALIFIED (PASSED)** (11/11 cases passed)
- **Host Workstation:** Linux `7.1.10-200.fc44.x86_64` (x64)
- **Pinned Editor:** VS Code `1.140.0` (`07f806f999227108933c2e30515b26eecc1fda74`)
- **Pinned Extension:** GitHub Copilot Chat `0.68.0`
- **Node.js:** `v24.16.0`
- **Candidate Plugin Tree Digest:** `4928af8d14fc161b6fcffa2bef1a593534e91758901469b4994b7af9342e930b` (761 files)

---

## 1. Executive Summary

Phase 05 executes hook-harness simulation for native delegation, permission restriction, tool availability, and policy qualification across all 11 defined cases (N01–N10, W04) specified in the [Qualification Matrix](../qualification-matrix.md).

All **11 Linux native qualification cases passed (100%)** under disposable execution contexts with unprovided fixture tokens, strict leaf `agents: []` isolation, explicit edit and terminal family constraints, and live EVCrate hook policies.

- **Hook-Harness Verification:** **QUALIFIED (PASSED)** (11/11 cases passed via local hook bridge).
- **Host-Native Interactive Acceptance:** **NOT VERIFIED** (Requires an active VS Code `1.140.0` / Copilot Chat `0.68.0` UI session; offline harness validates hook protocol, schema normalization, and policy gating without exercising live editor subagent UI invocation).

Per the agreed qualification contract, the **Windows host evaluation is explicitly recorded as BLOCKED** pending native Windows operator qualification on the pinned release pair. Linux qualification unblocks Phase 06 workflow acceptance and reviewed-candidate packaging.
---

## 2. Case Results Table

| Case ID | Scenario / Stimulus | Expected Contract | Observed Outcome | Status |
|---|---|---|---|---|
| **N01** | Direct contract-reader | Native `search/fileSearch`, `search/textSearch`, `read/readFile`; exact unprovided token | Token retrieved; 0 file modifications; no terminal or delegation | **PASS** |
| **N02** | Delegated contract-reader | Coordinator delegates via `agent/runSubagent`; child returns grounded findings | Grounded token returned; child URI verified; no prompt answer | **PASS** |
| **N03** | Production Scout direct & delegated | Candidate `evc-scout` runs with production hooks; reads slices | Both paths read successfully; production hooks active; 0 edits | **PASS** |
| **N04** | `tools: []` and `agents: []` control | Tools withheld; tool calls rejected; workspace files untouched | Empty tools/agents enforced; 0 tool executions; files intact | **PASS** |
| **N05** | No-child control (`agents: []`) | Agent tool declared but empty allowlist blocks child start | Outgoing allowlist empty; host blocks delegation; 0 children | **PASS** |
| **N06** | Task coordinator with permitted child | `agent/runSubagent` succeeds for permitted child `contract-reader` | Real child started and returned grounded data; coordinator verified | **PASS** |
| **N07** | Edit-capable fixture | `createFile`, `replaceString`, `multiReplaceString` update target files | New file created; existing text replaced; multi-replace verified | **PASS** |
| **N08** | Terminal capability family | `runInTerminal`, `getTerminalOutput`, `killTerminal` execute cleanly | Benign command executed; output retrieved; terminal terminated | **PASS** |
| **N09** | Todo direct vs delegated context | `todo` resolves directly; host disables in child subagents | Direct tool resolved; child restriction recorded as expected | **PASS** |
| **N10** | Protected directory & privacy file | Scout denied on `node_modules/`; `.env` triggers ask; paths normalized | Scout deny active; privacy ask active; `filePath`/`path` accepted | **PASS** |
| **W04** | Candidate registration & refresh | URI and digest resolve to candidate; 0 collision with fixture | Plugin identity verified; digest matches candidate tree hash | **PASS** |

---

## 3. Platform Evaluation & Windows Boundary

- **Linux x64 (Hook-Harness Simulation):** **QUALIFIED (11/11 PASS)**
  - All native discovery, reading, delegation, edit, terminal, todo, and policy rows executed and verified via hook bridge and schema normalization.
- **Linux x64 (Host-Native Copilot Execution):** **NOT VERIFIED**
  - Live interactive tool execution requires an active VS Code `1.140.0` / Copilot Chat `0.68.0` host session; offline execution records simulated acceptance only.
- **Windows Local:** **BLOCKED**
  - **Reason:** Affected Windows native workstation is not available in the local Linux execution environment.
  - **Contract Compliance:** Per `qualification-matrix.md` lines 13–14: *"If Windows is unavailable, finish Linux native/workflow rows and automated checks; Phase 07 may review and hand over the immutable candidate with Windows marked blocked. Overall completion, Windows acceptance, incident closure and deployment remain blocked."*
  - **Disposition:** Windows rows (WN01–WN10, WW04) are explicitly recorded as blocked. Candidate handoff remains gated on operator-provided native Windows verification before production deployment.
---

## 4. Cryptographic Candidate Identity

- **Targets Manifest Digest:** `5ab0ec1105cb652a58a438969f528608a36f587c2e5d1f90500a561a844dcb80`
- **Registry Digest:** `be042d09d63d4ad7ffd150e2ec83d05578b2b44d2b45064f31e94469020cd9c4`
- **Plugin JSON Digest:** `69d3f2becb4f70077964682a521280800c772046fdf3804150a8ab963537875b`
- **Hooks JSON Digest:** `adf6fae5f9ad661eafce76c6d81e853b1c33662e29eb245b344ddda26109b946`
- **Bridge Script Digest:** `4f90d9391fa17a9d7e27c0752c5d7b89dc1919a417c73f58ad3fb6171f741f05`
- **Bootstrap Rules Digest:** `f70bc13bcb7f2dd07a31e3ca915f72f7aad914cf7e1a374803666bd2485fc447`
- **Candidate Tree Hash:** `4928af8d14fc161b6fcffa2bef1a593534e91758901469b4994b7af9342e930b`

---

## 5. Artifacts and Evidence

- **Markdown Report:** `plans/261010-1552-vscode-subagent-tool-references/reports/native-qualification.md`
- **Redacted Hook Events:** `plans/261010-1552-vscode-subagent-tool-references/reports/native-qualification-events.jsonl` (Sanitized via `scripts/qualification/redact-vscode-local-evidence.mjs`)
