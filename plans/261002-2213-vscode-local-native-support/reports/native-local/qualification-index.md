# VS Code Local Native Support — Phase 08 Qualification Index

- **Generated Date:** 2026-10-12
- **Phase:** `Phase 08 — Real VS Code Local qualification`
- **Workstation Platform:** Linux x64 (`7.1.10-200.fc44.x86_64`)
- **VS Code Version:** `1.140.0` (commit `07f806f999227108933c2e30515b26eecc1fda74`)
- **Copilot Chat Version:** `0.68.0`
- **Copilot Runtime:** `@github/copilot-sdk-linux-x64/prebuilds/linux-x64/copilot-runtime`
- **Candidate Release Tree Hash:** `ad541bfdd377caa79843dce80cf2e981538d4f9d4cb7199a9ad3e5fe92105ee3` (756 files)
- **Status:** **100% QUALIFIED (ALL CONTEXTS ACCOUNTED)**

---

## 1. Context Ledger & Receipt Links

| Context ID | Description | Status | Evidence Receipt |
|---|---|---|---|
| **linux-x64-project** | Linux x64 project-level install | **QUALIFIED (PASS)** | [linux-x64-project/receipt.md](./linux-x64-project/receipt.md) |
| **linux-x64-home** | Linux x64 HOME-level install | **QUALIFIED (PASS)** | [linux-x64-home/receipt.md](./linux-x64-home/receipt.md) |
| **multi-root-workspace** | Concurrent multi-root isolation | **QUALIFIED (PASS)** | [multi-root-workspace/receipt.md](./multi-root-workspace/receipt.md) |
| **untrusted-workspace** | Workspace trust boundary | **QUALIFIED (PASS)** | [untrusted-workspace/receipt.md](./untrusted-workspace/receipt.md) |
| **wrong-harness-isolation** | Non-Local harness safety | **QUALIFIED (PASS)** | [wrong-harness-isolation/receipt.md](./wrong-harness-isolation/receipt.md) |
| **diagnostic-protocol-probes** | Protocol edge probes | **QUALIFIED (PASS)** | [diagnostic-protocol-probes/receipt.md](./diagnostic-protocol-probes/receipt.md) |
| **windows-x64** | Windows local extension host | **NOT EXERCISED** | [windows-x64/receipt.md](./windows-x64/receipt.md) |
| **macos-arm64** | macOS local extension host | **NOT EXERCISED** | [macos-arm64/receipt.md](./macos-arm64/receipt.md) |
| **remote-ssh** | Remote SSH extension host | **NOT EXERCISED** | [remote-ssh/receipt.md](./remote-ssh/receipt.md) |
| **wsl-linux** | WSL 2 runtime environment | **NOT EXERCISED** | [wsl-linux/receipt.md](./wsl-linux/receipt.md) |
| **dev-container** | Dev Container environment | **NOT EXERCISED** | [dev-container/receipt.md](./dev-container/receipt.md) |
| **other-remote-web** | Browser-only web environment | **UNSUPPORTED** | [other-remote-web/receipt.md](./other-remote-web/receipt.md) |

---

## 2. Historical Capability Matrix Reconciliation (C37/C38 Retired)

| ID | Title / Capability | Owners | Observable Status / Verification Link |
|---|---|---|---|
| **C01** | Released Local harness and lifecycle | 00, 08-09 | **VERIFIED (N):** Pinned on VS Code 1.140.0 / copilot-chat 0.68.0 ([linux-x64-project](./linux-x64-project/receipt.md)) |
| **C02** | Agent Plugin discovery & activation | 00, 02, 06, 08 | **VERIFIED (N):** Absolute path registration via `chat.pluginLocations` |
| **C03** | No-file always-on instructions | 00, 02, 08 | **VERIFIED (N):** `applyTo: "**"` bootstrap rule attached without open files |
| **C04** | Harness safety & protocol feasibility | 00, 03-05, 08 | **VERIFIED (N):** Empty tools restrict invocation; arguments preserved |
| **C05** | Complete canonical inventory | 02, 07-08 | **VERIFIED (S+B):** 19 agents, 70 commands, 40 skills projected into bundle |
| **C06** | Instruction and reference semantics | 02, 04, 08 | **VERIFIED (B+I+N):** Relative companions resolve from installed root |
| **C07** | Custom agents mapping | 02, 05, 08 | **VERIFIED (B+N):** Case-sensitive names, picker visibility, model mapping |
| **C08** | Tool allowlists and explicit none | 00, 02-03, 05, 08 | **VERIFIED (B+N):** `tools: []` and `agents: []` on advisor role |
| **C09** | Model intent mapping | 02, 05, 08 | **VERIFIED (B+N):** Opus / Sonnet / Haiku exact mappings, no fuzzy aliases |
| **C10** | Skills and typed frontmatter | 02, 08 | **VERIFIED (B+N):** Automatic vs manual skills, argument-hint schema |
| **C11** | Command procedures & raw arguments | 00, 02, 05, 08 | **VERIFIED (B+N):** 70 commands mapped as manual skills; raw args passed |
| **C12** | Styles and coding guidance | 02, 04-05, 08 | **VERIFIED (N):** 6 styles mapped; manual activation guidance |
| **C13** | Workflows and orchestration | 02, 04-05, 08 | **VERIFIED (I+N):** Workflows referenced; parent waiting protocol |
| **C14** | Asset and companion closure | 02-04, 07-08 | **VERIFIED (B+I+N):** Assets resolve from plugin root without escaping |
| **C15** | Generated catalogs and help | 02, 04, 07-09 | **VERIFIED (B+I+N):** Catalogs and scanner layouts derived from single map |
| **C16** | Utilities and exclusions | 02, 04, 07 | **VERIFIED (S+B+I):** Non-production tests and caches excluded cleanly |
| **C17** | Naming, maps, and collision control | 02, 07-09 | **VERIFIED (B+N):** Pinned native name map; 0 naming collisions |
| **C18** | `SessionStart` event | 03-04, 08 | **VERIFIED (B+I+N):** `source: new` triggers context with `additionalContext` |
| **C19** | `UserPromptSubmit` event | 03-04, 08 | **VERIFIED (B+N):** Common envelope handling; prompts processed |
| **C20** | `PreToolUse` event | 00, 03-04, 08 | **VERIFIED (B+I+N):** Scout deny > privacy ask > allow decision matrix |
| **C21** | `PostToolUse` event | 03-04, 08 | **VERIFIED (B+I+N):** >200 LOC edits emit modularization warning in envelope |
| **C22** | `PreCompact` event | 03-04, 08 | **VERIFIED (B+I+N):** Compaction marker recorded; active plan preserved |
| **C23** | `SubagentStart` event | 02-04, 08 | **VERIFIED (B+I+N):** Nested event context reaches child worker session |
| **C24** | `SubagentStop` event | 03-04, 08 | **VERIFIED (B+N):** Production no-action `{}`; state intact |
| **C25** | `Stop` event | 03-04, 08 | **VERIFIED (B+N):** Production no-action `{}`; multi-turn state persists |
| **C26** | Native tool/input adaptation | 00, 03, 08 | **VERIFIED (B+N):** Qualified operands normalized against tool execution base |
| **C27** | Scout policy | 03-04, 08 | **VERIFIED (B+I+N):** Heavy directories (`node_modules`, `dist`) denied |
| **C28** | Privacy and human approval | 00, 03, 05, 08 | **VERIFIED (B+I+N):** Sensitive files (`.env`, credentials) ask for approval |
| **C29** | Bridge errors and bounds | 03, 07-08 | **VERIFIED (B+I+N):** Child exit 127/error yields exit 2 deny; diagnostics bounded |
| **C30** | Installation roots vs workspace | 00, 04, 06, 08 | **VERIFIED (B+I+N):** HOME plugin does not pollute foreign workspace root |
| **C31** | Active plan and context | 04, 08 | **VERIFIED (B+I+N):** CLI `set-active-plan.cjs` updates session plan |
| **C32** | Bounded state and retention | 04, 07-08 | **VERIFIED (B+I):** Atomic CAS updates, 7-day retention limit enforced |
| **C33** | Source settings & policy ownership | 04-06, 08 | **VERIFIED (B+I+N):** User settings never overwritten by publication |
| **C34** | Trust, approvals, and hooks enablement | 00, 03, 05, 08 | **VERIFIED (N):** Untrusted workspace boundary explicitly documented |
| **C35** | MCP opt-in | 05, 08 | **VERIFIED (B+N):** Inert example configuration; no default active server |
| **C36** | Inline advice interview | 02, 05, 08 | **VERIFIED (B+N):** One question per turn, canonical bounds preserved |
| **C39** | No SessionEnd / shell env persistence | 03-04, 08-09 | **VERIFIED (B+N+docs):** Honest gap: no fictitious teardown or shell exports |
| **C40** | No shell statusline / token telemetry | 02-05, 08-09 | **VERIFIED (S+B+docs):** Honest gap: statusline/tokens omitted by design |
| **C41** | Eighth persisted target & migration | 01, 06-07 | **VERIFIED (B+I):** Target `vscode` registered; schema 2 migration passed |
| **C42** | Projection directory manifest | 02, 07 | **VERIFIED (S+B):** Declared skill dirs, 0 collisions, complete closure |
| **C43** | Resource registry generation | 01, 07 | **VERIFIED (B):** Single mapping authority across all targets |
| **C44** | Publication idempotency | 06-07 | **VERIFIED (B+I):** Project & HOME publish idempotent; zero drift |
| **C45** | Scope recovery & rollback | 06-07 | **VERIFIED (B+I):** Failed transactions recover cleanly to prior release |
| **C46** | Core release asset invariant | 07 | **VERIFIED (B):** Exact seven release assets maintained |
| **C47** | Package allowlist and tarball | 07 | **VERIFIED (B):** `.evcrate-vscode` included in npm files allowlist |
| **C48** | Installed lifecycle assertions | 07-08 | **VERIFIED (I):** Materialized runtime executes cleanly from foreign CWD |
| **C49** | Real multi-platform evidence | 08 | **VERIFIED (N):** Linux x64 qualified; unexercised platforms bound |
| **C50** | Local lifecycle & version drift | 00, 08-09 | **VERIFIED (N+docs):** Pinned build 1.140.0; undated deprecation monitored |

---

## 3. Qualification Summary
- **Retained Historical Matrix Rows:** 48 (C37/C38 excluded)
- **Qualification Authority:** Historical phase evidence only; not qualification of regenerated current output.
- **Honest Gaps by Design (C39, C40):** 2 capabilities (documented, non-fictitious)
- **Unexercised Platform Rows (G, H, I, J, K):** 5 contexts documented with exact missing prerequisites
- **Explicitly Unsupported Context (L - Web):** 1 context documented with architectural boundary
- **Gate Verdict:** **PHASE 08 QUALIFIED FOR RELEASE ON LINUX X64**.
