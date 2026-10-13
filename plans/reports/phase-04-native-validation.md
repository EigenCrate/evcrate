# Phase 04 — Native Qualification & Behavioral Validation Report

- **Date:** 2026-10-06
- **Status:** **PASS (Mandatory Six Classes Qualified with Explicit Host & Platform Limitations)**
- **Role:** `PhaseFourNativeProof`
- **Ownership:** `plans/261004-2012-deterministic-advice-activation/reports/phase-04-native-*` and `phase-04-host-*`
- **Workstation:** Linux x64 (`7.1.10-200.fc44.x86_64`, Fedora 44)
- **Node / npm:** Node v24.16.0, npm 12.0.2
- **Harness:** OMP 18.6.1 (`/home/loidinh/.bun/bin/omp`)
- **Active Model Route:** `openai-codex/gpt-6.1-sol` (canonical prior-phase qualified route), `google-antigravity/gemini-3.8-flash:high`
- **Provider Access:** Read-only auth cache (`PI_CODING_AGENT_DIR=/home/loidinh/.omp/agent`); zero live user HOME writes, zero policy mutations.

---

## 1. Executive Summary

This report establishes authentic empirical evidence for deterministic advice activation on Linux x64. Following parent review of initial runs, all misleading prompts, model stalls, and assertion defects were comprehensively addressed.

### Key Acceptance Outcomes:
1. **Mandatory Six Actual Native Model Classes Executed & Qualified with Real OMP 18.6.1:**
   - **`s01` (Clean default off, A01):** PASS. Real OMP execution with `/cmd-code plans/test/plan.md phase-01`. Helper evaluated `status: MODE_READY`, `mode: off`, `reason: NO_FINAL_FLAG`. 0 mentoring reads. `L=0` (zero state files created), immutable manifest 100% matched, exit 0.
   - **`s02` (Explicit final flag, A06):** PASS. Real OMP execution with `/cmd-code plans/test/plan.md phase-01 --advice`. Helper evaluated `status: MODE_READY`, `mode: explicit`, `reason: EXPLICIT_FINAL_FLAG`. Flag stripped verbatim (`work_arguments: "plans/test/plan.md phase-01"`). Mentoring read strictly after helper. `L=0`, manifest 100% matched, exit 0. (Executed in 44.9s with `openai-codex/gpt-6.1-sol`).
   - **`s03` (Cook router -> child delegation, A07):** PASS. Real OMP router executed `/cmd-cook plans/test/plan.md --advice`. Router helper evaluated `explicit` (`EXPLICIT_FINAL_FLAG`), router called extension tool `delegate_code` with pre-run handoff (`{ kind: "pre-run", ... }`), zero synthetic `--advice` flag passed. Child `/code` executed synchronously, completed Step 0, and stopped before writers. Exit 0. (Executed in 60.9s).
   - **`s05` (Stale revision handoff rejection, A09):** PASS. Real installed helper evaluated stale revision 99, returning `status: "FAILED"`, `mode: null`, `error: { code: "ADVICE_HANDOFF_STALE" }`. Child prompt rendered with direct context; model halted immediately before plan discovery or reconciliation. State hash 100% invariant (`L=0`), zero writers, exit 0. (Executed in 24.6s).
   - **`s07` (Completed historical phase no-op with auto command, A02, A22):** PASS. Real OMP execution with `/cmd-code__auto plans/test/plan.md phase-01`. Helper evaluated `off` (`NO_FINAL_FLAG`), model identified completed receipt and verified no-op, did not execute subsequent phases. State hash 100% invariant (`L=0`), manifest matched, exit 0.
   - **`s11` (Second matching default blocker escalation, A12):** PASS. Real OMP execution with `/cmd-code plans/test/plan.md phase-01`. Helper evaluated `off` (`NO_FINAL_FLAG`), model reconciled repeated compiler error (`missing glibc header`), escalated via ordinary debugger/user escalation, zero hard advisor checkpoints created, zero advice activation. Exit 0.
2. **Fail-Closed Admission Gate Verified:**
   - **`s10` (Missing HOME helper fail-closed, A20):** PASS. Native command pre-prompt admission gate halted execution before prompt admission in ~1.2s with **0 LLM turns**, **0 tool calls**, and exact stderr diagnostic: `EVCrate command stopped before prompt admission: the HOME activation helper is missing`. Exit 0.
3. **Target Probes (All 8 Targets):** `node phase-04-host-probes.mjs` executed cleanly, completing **17/17 probes with 0 failures**.
4. **Historical & Failed Trace Preservation:** Prior failed attempts (`s02.fail-timeout180s.json`, `s05.fail-timeout180s.json`) are preserved with distinct revision names.

---

## 2. Root Cause Analysis & Empirical Repairs

Following parent review, five specific behavioral defects were diagnosed and permanently repaired:

### 2.1 Misleading System Prompt & Harness Investigation
- **Defect:** Initial runner passed `--system-prompt "You are an isolated qualification harness..."`. The word "qualification harness" prompted the LLM to investigate the test runner and read `phase-04-native-scenarios.mjs` instead of executing the command workflow.
- **Root Cause:** Overriding the default system prompt removed OMP's default operational boundaries.
- **Repair:** Switched to OMP's first-class `--append-system-prompt` flag with neutral execution constraints:
  ```text
  Execute the submitted command according to its instructions. Stay strictly within the current workspace project directory and current HOME directory. Never read test runner scripts, plans/reports, or other execution traces outside this project. For code and same-run commands, stop after completing Step 0 plan reconciliation before implementation writers or advisor inference. For cook router commands, execute the cook workflow through delegation to /code.
  ```
- **Verification:** Verified in `s01`, `s02`, `s03`, `s05`, `s07`, `s11`. Model stayed strictly within project/HOME; zero reads of `phase-04-native-scenarios.mjs` or `plans/reports`.

### 2.2 Model Route Stalling & Timeout Resolution
- **Defect:** `google-antigravity/gemini-3.8-flash:high` stalled on multi-turn reasoning, taking 137–183s and exceeding the 180s timeout in `s02`.
- **Repair:** Cut over to the authorized prior-phase model `openai-codex/gpt-6.1-sol` per parent guidance.
- **Verification:**
  - `s01` completed in 35.6s (PASS).
  - `s02` completed in 44.9s (PASS).
  - `s03` completed in 60.9s (PASS).
  - `s05` completed in 24.6s (PASS).
  Zero timeouts observed under `openai-codex/gpt-6.1-sol`.

### 2.3 OMP `@promptfile` Shorthand Loop in `s05`
- **Defect:** Passing `-- @callerPromptFile` caused OMP to treat `@` as a file attachment / task note to analyze, rather than the primary prompt to execute, leading to analysis loops.
- **Repair:** Replaced `-- @callerPromptFile` with passing the rendered prompt string directly as a positional CLI argument: `ompArgs.push('--', readFileSync(ws.callerPromptFile, 'utf8'))`.
- **Verification:** In `s05`, model directly received the prompt with `evcrate_omp_command_context` header, parsed `ADVICE_HANDOFF_STALE`, and halted immediately at Step 0 in 24.6s.

### 2.4 Helper Logging Wrapper & Strict Assertion Enforcement
- **Defect:** Native slash commands resolve advice mode before prompt admission inside `createCommand.execute()`, which does not appear as a tool call in the model's turn. Previous runner conditionally asserted `if (scenario.expectMode && trace.helper_result)`, letting null results pass silently.
- **Repair:**
  1. Implemented `installHelperLoggingWrapper()` in `materializePublishedWorkspace()`, placing a transparent Node.js wrapper at `$HOME/.evcrate/bin/evcrate-advice-mode` that executes `evcrate-advice-mode.real`, captures exact stdin/stdout/exit code, and writes `$HOME/.evcrate/advice-helper-execution.json`.
  2. Ingested helper execution logs into `trace.helper_result`, `trace.helper_input`, and `trace.helper_exit_code`.
  3. Made helper assertions strict and unconditional: `assert.ok(trace.helper_result)` is strictly required whenever mode, reason, or status is expected.
  4. In error cases (`s05`), strictly asserted `trace.helper_result.status === 'FAILED'`, `trace.helper_result.mode === null`, and `trace.helper_result.error.code === 'ADVICE_HANDOFF_STALE'`.

### 2.5 Real Extension API for Router Child Delegation
- **Defect:** Earlier delegation extension used fallback parameters.
- **Repair:** Used authentic OMP host API `const { Type } = pi.typebox` and `pi.registerTool()` matching Phase 02 (`f01`). Router autonomously constructed pre-run handoff; child executed synchronously without synthetic `--advice` flag.

---

## 3. Host Probes Results (All 8 Targets)

Executed via:
```bash
node plans/261004-2012-deterministic-advice-activation/reports/phase-04-host-probes.mjs
```

### Probed Target Summary:
- **Registry Schema 2:** Verified 8 targets (`antigravity`, `claude`, `codex`, `copilot`, `gemini`, `omp`, `pi`, `vscode`). PASS.
- **Publication Materialization:** Verified authentic `publishApply` in disposable roots for HOME and project scopes. PASS.
- **Installed Helper (3 Modes):**
  - Clean default -> `mode: off`, `reason: NO_FINAL_FLAG`. PASS.
  - Explicit flag -> `mode: explicit`, `reason: EXPLICIT_FINAL_FLAG`, stripped work args. PASS.
  - Pre-run handoff -> `mode: inherited`, `reason: INHERITED_PRE_RUN`. PASS.
  - Authentic Stale Revision Handoff Rejection -> Exit 1, `status: FAILED`, `error.code: ADVICE_HANDOFF_STALE`. PASS.
- **Claude:** Projection roots, workflows (`advice-activation.md`, `plan-progress.md`, `advisor-mentoring.md`) present. PASS.
- **Codex (+.agents):** Companion `.agents` and `AGENTS.md` verified. PASS.
- **Gemini & Antigravity:** Output roots and `$HOME/.gemini/config` binding verified. PASS.
- **OMP Native Command Runtime:**
  - Clean off execution & raw input byte preservation (quotes, tabs, CRLF, Unicode `tiếng Việt 日本`). PASS.
  - Missing HOME helper fail-closed gate halts before prompt admission in ~1.2s. PASS.
  - Missing neutral workflow fail-closed gate halts before prompt admission in ~1.2s. PASS.
- **Pi User Command & Model Command Tool:**
  - `findManagedCommand` & `expandManagedCommand` resolve installed root. PASS.
  - `dispatchManagedCommand` preserves `evcrate-pi-command-context` header. PASS.
  - Invalid handoff schema rejected at tool boundary. PASS.
- **Copilot CLI:** Managed settings closure in `settings.json` verified. PASS.
- **VS Code Local:** Configuration byte preservation verified (`{"userOwned":"keep exact bytes 日本"}`). PASS.

**Result: 17/17 Probes PASSED, 0 FAILED.**

---

## 4. Authentic Native Model Executions

### 4.1 Scenario `s01`: Clean Default Command (Requirement A01)
- **Command:** `/cmd-code plans/test/plan.md phase-01`
- **Model:** `openai-codex/gpt-6.1-sol`
- **Elapsed:** 35.6s
- **Observed Helper Output:** `status: "MODE_READY"`, `mode: "off"`, `reason: "NO_FINAL_FLAG"`, `work_arguments: "plans/test/plan.md phase-01"`
- **Observed Tool Calls:** `read` (CLAUDE.md, plan-progress.md, plan.md, phase-01.md, feature.js)
- **Mentoring Read:** `false` (0 reads of `advisor-mentoring.md`)
- **State Lifecycle:** `L=0` (zero state files created before or after)
- **Manifest Invariance:** `plan.md` (`09d9e5...`), `phase-01.md` (`a5b247...`), `feature.js` (`ab7608...`) 100% matched before/after
- **Exit Code:** 0. **Status: PASS.**

### 4.2 Scenario `s02`: Explicit Final Standalone Flag (Requirement A06)
- **Command:** `/cmd-code plans/test/plan.md phase-01 --advice`
- **Model:** `openai-codex/gpt-6.1-sol`
- **Elapsed:** 44.9s
- **Observed Helper Output:** `status: "MODE_READY"`, `mode: "explicit"`, `reason: "EXPLICIT_FINAL_FLAG"`, `work_arguments: "plans/test/plan.md phase-01"` (flag stripped verbatim)
- **Observed Mentoring Read:** `true` (loaded strictly after helper resolution)
- **State Lifecycle:** `L=0` (zero state created before lifecycle barrier)
- **Exit Code:** 0. **Status: PASS.**

### 4.3 Scenario `s03`: Pre-Run Router to Child Delegation (Requirement A07)
- **Command:** `/cmd-cook plans/test/plan.md --advice`
- **Model:** `openai-codex/gpt-6.1-sol`
- **Elapsed:** 60.9s
- **Router Helper Output:** `status: "MODE_READY"`, `mode: "explicit"`, `reason: "EXPLICIT_FINAL_FLAG"`
- **Router Delegation Tool Call:** `delegate_code` called with `plan_path: "plans/test/plan.md"`, `handoff: { kind: "pre-run", context: { command: "code", ... }, run: null }`
- **Child Execution:** Real child `/code` executed synchronously, zero synthetic `--advice` flag passed, child resolved Step 0 and stopped before writers.
- **Exit Code:** 0. **Status: PASS.**

### 4.4 Scenario `s05`: Stale Revision Handoff Rejection (Requirement A09)
- **Transport:** Direct caller handoff child prompt with stale revision 99
- **Model:** `openai-codex/gpt-6.1-sol`
- **Elapsed:** 24.6s
- **Observed Helper Output:** `status: "FAILED"`, `mode: null`, `reason: null`, `error: { code: "ADVICE_HANDOFF_STALE", message: "Advice caller handoff revisions are stale" }`
- **Observed Behavior:** Model parsed failure header, halted immediately at Step 0: *"Step 0 blocked: ADVICE_HANDOFF_STALE — supplied same-run handoff revisions are stale. Resolve continuation with the owner of run... No helper retry, controller mutation, advisor inference, delegation, or implementation performed."*
- **State Lifecycle:** `L=0` (state hash `144b3da6...` 100% invariant, zero writers)
- **Exit Code:** 0. **Status: PASS.**

### 4.5 Scenario `s07`: Completed Historical Phase No-Op (Requirements A02, A22)
- **Command:** `/cmd-code__auto plans/test/plan.md phase-01`
- **Model:** `openai-codex/gpt-6.1-sol`
- **Elapsed:** 118.4s
- **Observed Helper Output:** `status: "MODE_READY"`, `mode: "off"`, `reason: "NO_FINAL_FLAG"`
- **Observed Behavior:** Model reconciled completed receipt, identified phase-01 was already resolved, treated requested scope as NO-OP, did not execute subsequent phases.
- **State Invariance:** State hash 100% identical before and after (`L=0`).
- **Exit Code:** 0. **Status: PASS.**

### 4.6 Scenario `s11`: Second Matching Default Blocker Escalation (Requirement A12)
- **Command:** `/cmd-code plans/test/plan.md phase-01`
- **Model:** `openai-codex/gpt-6.1-sol`
- **Elapsed:** 177.2s
- **Observed Helper Output:** `status: "MODE_READY"`, `mode: "off"`, `reason: "NO_FINAL_FLAG"`
- **Observed Behavior:** Model detected repeated compiler error (`missing glibc header`), escalated via ordinary debugger/user escalation, created zero hard advisor checkpoints, zero advice activation.
- **State Lifecycle:** `L=0` (zero state created).
- **Exit Code:** 0. **Status: PASS.**

### 4.7 Scenario `s10`: Missing HOME Helper Fail-Closed Gate (Requirement A20)
- **Command:** `/cmd-code plans/test/plan.md phase-01` (with helper removed)
- **Observed Exit Code:** 0
- **Observed LLM Turns:** **0**
- **Observed Tool Calls:** **0**
- **Observed Stderr:** `EVCrate command stopped before prompt admission: the HOME activation helper is missing`
- **Execution Elapsed:** ~1.2s. **Status: PASS.**

---

## 5. Explicit Host & Platform Limitations

1. **Host PATH Availability vs Model Qualification:**
   - Linux workstation PATH has: `omp 18.6.1`, `claude 2.1.288`, `codex 0.160.0`, `gemini 0.47.0`, `pi 0.85.1`, `copilot 1.0.83`, `code 1.140.0`.
   - **Only OMP is model-qualified** via the existing approved ordinary authorization route (`PI_CODING_AGENT_DIR=/home/loidinh/.omp/agent`).
   - All other external vendor CLI loops are ledgered as **AVAILABLE ON PATH, NOT MODEL-QUALIFIED**. No unapproved external provider setup or cost was incurred.
2. **Excluded Operating Systems:**
   - **Windows (PowerShell / cmd.exe):** Explicitly excluded from acceptance scope per user contract.
   - **macOS (Darwin arm64/x64):** Explicitly excluded / unsupported.
3. **Requirement A13 (Same Blockers in Authorized Advice Run) Limitation:**
   - Task-state three failed corrections in `task-state.test.cjs` is an advisor human-gate threshold, NOT equivalent to the workflow second-matching-terminal-blocker threshold before attempt three.
   - Two-matching-terminal-blocker escalation in authorized advice mode is **UNEXERCISED natively and unproven in Tier 2**. Requires live provider consultation which is unapproved mid-flight. No false claim is made from A12 off-blocker.
4. **Requirement A16 (Missing Receipt Sufficient vs Insufficient) Limitation:**
   - Missing receipt with sufficient evidence has historical Phase 02 proof (`c02-drift-missing-original-proof.json`), but **no current phase model reconstruction proof**. Prerequisite pause is verified in Tier 2.
5. **Other Workflow Rows (A05, A08, A14, A15, A17, A18, A19, A23):**
   - Verified via deterministic test suites and dry-run workspace setup; marked truthfully as `DETERMINISTIC_FIXTURE_ONLY` / `HISTORICAL_AND_FIXTURE_ONLY` in `phase-04-native-qualification.json`. No invented live model outputs claimed.

---

## 6. Retained Artifacts & Digest Inventory

| Artifact Path | Size (Bytes) | SHA-256 Digest | Description |
|---|---|---|---|
| `plans/261004-2012-deterministic-advice-activation/reports/phase-04-host-probes.mjs` | 18,175 | `f59990b790d9385bf56b541bb8ee2ecfae667634f59e9f6bf67dd779bbfe8b41` | Host target closure and installed helper probe runner |
| `plans/261004-2012-deterministic-advice-activation/reports/phase-04-native-scenarios.mjs` | 36,412 | `d120fb35467e4ba3be5cfa979ba1ccaa2b3113a30c51d9ad2f82ba1caeb3d69f` | Native OMP qualification runner with all 11 defect repairs |
| `plans/261004-2012-deterministic-advice-activation/reports/phase-04-native-qualification.json` | 18,287 | `004c107e3a985558e658a0ebc85744cb89a5840d5718dfd09f7a93c9d78e7bb0` | Complete A01–A23 matrix evidence mapping with truthful classifications |
| `plans/261004-2012-deterministic-advice-activation/reports/phase-04-host-ledger.md` | 13,850 | `b493dfaa0381045a198c76aa081ce4e2221b61917f8b91572df6655c65f29d27` | Workstation binary versions and truthful qualification ledger |
| `plans/261004-2012-deterministic-advice-activation/reports/phase-04-native-traces/s01-clean-default-command-no-policy-history.json` | 13,058 | `d6945a6c0c283023e3cb884260d5b78b7e28b8cf92ee34351b65e90eb0ef14df` | Authentic OMP 18.6.1 trace for clean off mode |
| `plans/261004-2012-deterministic-advice-activation/reports/phase-04-native-traces/s02-explicit-final-standalone-flag.json` | 14,092 | `7486807f6e07c3f8789ee96b0ca71fbe61faeb85bca3ef8c02c61d5635f284b8` | Authentic OMP 18.6.1 trace for explicit final flag |
| `plans/261004-2012-deterministic-advice-activation/reports/phase-04-native-traces/s03-pre-run-router-to-child-delegation.json` | 17,864 | `3b75c879d7494fb9df17a22e8ec56114eb374be2162590209489b1d7d0a5e848` | Authentic OMP 18.6.1 trace for router-to-child delegation |
| `plans/261004-2012-deterministic-advice-activation/reports/phase-04-native-traces/s05-stale-revision-handoff-rejection.json` | 8,351 | `e405e6bfa416d86db40f3531b9d146ee7440026e6ef3b77209930fef688b577d` | Authentic OMP 18.6.1 trace for stale revision handoff rejection |
| `plans/261004-2012-deterministic-advice-activation/reports/phase-04-native-traces/s07-completed-historical-phase-no-op.json` | 18,107 | `45b376aaae89d1b7d58f5c9e29a8a7a8d9a46abec2819cefb68ee876ec4e06aa` | Authentic OMP 18.6.1 trace for auto completed phase no-op |
| `plans/261004-2012-deterministic-advice-activation/reports/phase-04-native-traces/s11-second-matching-default-blocker-escalation.json` | 19,217 | `9e3ebf4a6439129d2b27137f848411b4398bc8592cbe3c09f3c78e3ec8400a43` | Authentic OMP 18.6.1 trace for repeat blocker escalation |
| `plans/261004-2012-deterministic-advice-activation/reports/phase-04-native-traces/s10-missing-home-helper-fail-closed-0-llm-turns-.json` | 802 | `00155a535bfd755c91ffc1e95f6c8d76dbd0e0fb8f6733ec60ca831969671d10` | Authentic OMP 18.6.1 trace for fail-closed gate (0 LLM turns) |
| `plans/261004-2012-deterministic-advice-activation/reports/phase-04-native-traces/s02-explicit-final-standalone-flag.fail-timeout180s.json` | 1,071 | `fa2642e88a0e3f055620aaae0676b9e7be944c9b32cb5e93df0f65314777d191` | Retained historical failed attempt (timeout before codex cutover) |
| `plans/261004-2012-deterministic-advice-activation/reports/phase-04-native-traces/s05-stale-revision-handoff-rejection.fail-timeout180s.json` | 24,511 | `fdcf15cbf34a7428c50ebc36199f7d45f099c1598971fce3f7365611bf7be15` | Retained historical failed attempt (timeout on @promptfile loop) |

---

## 7. Unresolved Questions

1. **Vendor Model Loops:** Will external vendor CLI loops (Claude Code, codex-cli, gemini, Copilot CLI) be model-qualified in a subsequent dedicated provider phase under explicit budget allocation?
2. **Native Pi Model Command Tool:** Does the team plan to qualify live Pi model-tool invocations with live provider authorization in an upcoming phase?
