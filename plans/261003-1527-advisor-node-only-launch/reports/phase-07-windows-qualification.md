# Phase 07 — Native Windows Qualification Report

**Report Date:** 2026-10-05  
**Plan:** `plans/261003-1527-advisor-node-only-launch/plan.md`  
**Phase:** `phase-07-native-windows-qualification.md`  
**Author:** Antigravity / Senior Software Engineer  
**Status:** Audit & Native Execution Recorded; Formal Qualification Invalidated (Candidate Defect); Handed back to Phase 06

---

## 1. Executive Summary

Phase 07 executes the native Windows qualification of the candidate package on Windows x64.
- **Host Platform:** Windows 11 Build 26100 (win32, x64).
- **Candidate Archive Verification:** Frozen bundle `evcrate-candidate-win32-x64` (7,433 files, 149,783,540 bytes) verified byte-for-byte against manifest with zero mismatches.
- **Native Test Suites (Test Evidence):** **111 passed, 0 failed** across all 3 portable/native advisor suites on Windows:
  - Provider Launch Identity & Retry Orchestration: **48 / 48 passed** (100%)
  - Supervision Console & Verification Lifecycle: **19 / 19 passed** (100%)
  - Controller, State CLI, History CLI & History Controller Integration: **44 / 44 passed** (100%)
- **Installed CLI Lifecycle:** Complete V2 lifecycle (`state init` → `state checkpoint` → central consultation → `state disposition` → `state outcome` → `state complete`) passed cleanly in isolated sandbox (`task_revision: 7`, `gate_status: completed`).
- **PowerShell UTF-8 Transport:** `$jsonPayload | & node "$controller" history list` executed cleanly under Windows PowerShell 5.1 with BOM-free UTF-8 encoding (`HISTORY_READY`, exit 0).
- **Headless Security Rejection:** Unattended `state human-decision` correctly fails closed with `HUMAN_EVENT_REQUIRED`. Piped stdin challenge cannot satisfy `CONIN$` interactive challenge.
- **Formal Qualification Status:** **INVALIDATED (Candidate Defect)**. While 111/111 native test assertions passed, the candidate runner suite `node-launch-behavior` failed (exit 1) with `PUBLICATION_FAILED` due to a stale output hash in candidate `.evcrate/build-manifest-omp.json`. Under Plan Rule 94, this candidate defect invalidates qualification completion and prohibits local patching on Windows. Handed back to Phase 06 for candidate regeneration.
---

## 2. Four-Row Matrix Status & Host Audit

Plan requirement specifies a 4-row matrix (**Windows PowerShell 5.1 / PowerShell 7** × **Node 22.19.0 / Node 24.21.0**) plus authentic attached console evidence.

| Row | Shell | Node | Mode | Status | Details |
|---|---|---|---|---|---|
| **1** | Windows PowerShell 5.1 | Node 22.19.0 | Automated | **Blocked (Prerequisite)** | Pinned Node `v22.19.0` not installed on host (only v22.23.2 present). |
| **2** | Windows PowerShell 5.1 | Node 24.21.0 | Automated | **INVALIDATED (Candidate Defect)** | Host Windows PowerShell 5.1.26100.9444 + Node `v24.21.0` (C:\Program Files\nodejs\node.exe). 111 native tests pass. Full lifecycle verified. Formal qualification invalidated by `PUBLICATION_FAILED` in `node-launch-behavior` due to stale `.omp` build manifest hash in candidate. |
| **3** | PowerShell 7 (`pwsh`) | Node 22.19.0 | Automated | **Blocked (Prerequisite)** | PowerShell 7 (`pwsh.exe`) and pinned Node `v22.19.0` not installed on host. |
| **4** | PowerShell 7 (`pwsh`) | Node 24.21.0 | Automated | **Blocked (Prerequisite)** | PowerShell 7 (`pwsh.exe`) not installed on host. |
| **Console** | Any | Any | Interactive | **Blocked (Prerequisite)** | Running in automated headless harness. Positive human console challenge (`authorize <run> <rev> <nonce>`) requires authentic attached TTY. Automated negative (`HUMAN_EVENT_REQUIRED`) verified. |

---

## 3. Candidate Bundle Verification

The candidate package was frozen and verified using `tests/advisor-controller/qualification-bundle.cjs`:
- **Candidate Bundle ID:** `evcrate-candidate-win32-x64`
- **Archive Path:** `artifacts/qualification-bundle/candidate.zip`
- **Archive SHA-256:** `f0b007c6c5e5047e7f61e01799ae534758bb5aee8cbd0fafd1c2631cae486c8f`
- **Manifest Path:** `artifacts/qualification-bundle/manifest.json`
- **Manifest SHA-256:** `b1f05499c2aaa1257292995601ab9c236f11cbb87babb83643be16d6d1b37b5a`
- **Total Files:** 7,433 regular files
- **Total Expanded Bytes:** 149,783,540 bytes
- **Archive Inventory Verification:** `verify-archive` confirmed 7,433 entries matching CRC32 and SHA-256.
- **Candidate Extraction Verification:** `verify --root artifacts/extracted-candidate/package` confirmed all 7,433 files matching byte-for-byte with 0 extra or missing files.

---

## 4. Test Suite Execution Results

Executed under native Windows `node.exe` (`v24.21.0`) against the verified candidate root:

### Suite 1: Provider Launch Identity & Retry Orchestration
- **Command:** `node --test tests/advisor-controller/provider-launch-identity.test.cjs tests/advisor-controller/retry-orchestration.test.cjs`
- **Pass Count:** 48 / 48
- **Duration:** 102.1 seconds
- **Key Scenarios Verified:**
  - CMD-only scoped npm layout resolves JS entrypoint
  - Native standalone executable precedence in PATH
  - Space and non-ASCII path handling on Windows
  - Duplicate / conflicting PATH environment variable canonicalization
  - Same-path replacement drift detection and launch record invalidation
  - Tool guard under physical node-script prefix
  - Exponential backoff and Retry-After cooldown
  - Primary to backup backend transition without backup retry on transient failure

### Suite 2: Supervision Console & Verification Lifecycle
- **Command:** `node --test tests/advisor-controller/supervision-console.test.cjs tests/advisor-controller/verification-lifecycle.test.cjs`
- **Pass Count:** 19 / 19
- **Duration:** 43.8 seconds
- **Key Scenarios Verified:**
  - Leader exit with detached worker reaps descendant and confirms empty Windows Job Object
  - Probe timeout terminates Job Object and reaps long-running provider
  - AbortSignal cancellation terminates Job Object and reports `CANCELLED`
  - Output flood limit terminates Job Object and reports `OUTPUT_LIMIT`
  - Windows Job supervision emits spawn-time PID and creation token
  - Pinned file operations on Windows handle CAS conflicts and CAS integrity
  - Truthful `node --version` execution via `spawnSync` before recording passed validation

### Suite 3: Controller, State CLI, and History CLI
- **Command:** `node --test tests/advisor-controller/controller.test.cjs tests/advisor-controller/state-cli.test.cjs tests/advisor-controller/history-cli.test.cjs tests/advisor-controller/history-controller-integration.test.cjs`
- **Pass Count:** 44 / 44
- **Duration:** 168.7 seconds
- **Key Scenarios Verified:**
  - Direct checkpoint accepts policy and completes through Codex backend
  - Strict request validation rejects credentials and malformed UTF-8
  - Oversized open stdin fails closed without waiting for EOF
  - SIGINT and SIGTERM during generation emit cancellation envelope
  - History list, show, metrics, export dry-run/apply, prune dry-run/apply
  - State CLI reserves once, links outcome to history, and completes lifecycle
  - Piped challenge text cannot authorize state (`HUMAN_EVENT_REQUIRED`)

### Suite 4: Node Launch Behavior (Identified Flaw in Frozen Candidate)
- **Files:** `tests/advisor-controller/node-launch.test.cjs`
- **Result:** Failed with `PUBLICATION_FAILED` (exit 1)
- **Root Cause Analysis:** `node-launch.test.cjs` (authored in Phase 03) exercises `publishDryRun` and `publishApply` against target `.omp`. The frozen candidate's `.evcrate/build-manifest-omp.json` contains a stale output hash for `.omp` (`b886...` vs actual tree hash `c5b6...`). This failure reproduces identically on Linux (WSL).
- **Plan Rule 94 Application:** Per Phase 07 contract, candidate files cannot be patched locally on Windows. This repair must be returned to source integration and Phase 06 to produce a refreshed candidate bundle.

---

## 5. Installed Controller Lifecycle Verification

Tested in an isolated private sandbox (`%TEMP%\win-qual-sandbox-*`):
1. Copied manifested controller closure to `<HOME>/.evcrate/bin/`.
2. Seeded `advisor-routing.json` (V2 routing policy) and fake provider state.
3. `state init`: Returned `STATE_READY` (`task_revision: 1`).
4. `state checkpoint`: Returned `STATE_READY` (`task_revision: 2`).
5. Central consultation: Returned `ADVICE_READY` with matching correlation ID.
6. `state disposition`: Recorded `accept` without changes (`task_revision: 5`).
7. `state outcome`: Executed truthful `node --version` validation, returned `STATE_READY` (`task_revision: 6`).
8. `state complete`: Sealed task run, returned `STATE_READY` with `gate_status: "completed"` (`task_revision: 7`).

---

## 6. PowerShell Pipeline Transport Verification

- **Command:** `$payload | & "C:\Program Files\nodejs\node.exe" "<controllerScript>" history list`
- **Shell:** Windows PowerShell 5.1 (`5.1.26100.9444`)
- **Encoding Safety:** Tested with `$OutputEncoding = [System.Text.UTF8Encoding]::new($false)` in `try/finally`.
- **Exit Code:** 0
- **Framing:** Output framed as valid UTF-8 JSON document.

---

## 7. Audit & Handoff

1. **Test Evidence Recorded:** Windows PowerShell 5.1 × Node 24.21.0 native gates verified 111/111 passing tests across provider launch, supervision console, and controller CLI suites, plus complete installed lifecycle in sandbox.
2. **Formal Qualification Invalidated:** Per Plan Rule 94, candidate defect in `build-manifest-omp.json` invalidates formal qualification completion. The candidate bundle cannot be patched locally on Windows.
3. **Prerequisite Blocks:** Node 22.19.0, PowerShell 7, and interactive console remain prerequisite blocks on this host.
4. **Phase 06 Handoff:** Return to Phase 06 to regenerate candidate distribution projections/manifests (`build-manifest-omp.json`) on Linux, freeze a new candidate archive, and re-run Windows qualification against the refreshed candidate.

## 8. Re-verification of Updated Runner

Run date: 2026-10-05. Native host remained Windows x64, Node `v24.21.0`, Windows PowerShell 5.1.26100.9444 (`os_release: 10.0.26200`).

- Reverified the frozen archive and extraction before execution: **7,433 / 7,433** entries and files verified.
- Executed the updated repository runner `tests/advisor-controller/native-windows-qualification.cjs` against the verified candidate root. Its SHA-256 (`767059991e3ee2bbed89ce4796436b16a4491cb2449cacceeb1fb3fb2cdfadc2`) differs from the runner embedded in the frozen candidate (`6baef1954f6607c6fd9ec8e72b626862bca67e1a0799101f73e0d3212a5af570`); the package itself was not modified.
- Three portable/native suites: **111 passed, 0 failed, 0 skipped** (48 + 19 + 44); runner durations 103.475s + 44.056s + 167.914s.
- Additional `node-launch-behavior`: **1 passed, 8 failed** in 8.383s. Each failure reports `PUBLICATION_FAILED` in output-hash verification of the frozen candidate. Aggregate run: **120 tests, 112 passed, 8 failed, 0 skipped**.
- Installed lifecycle: passed; `final_revision: 7`, `gate_status: completed`.
- PowerShell pipeline: passed; Windows PowerShell 5.1 returned `HISTORY_READY`, exit 0.
- Terminal status: **FAILED**, runner exit 1 due to `node-launch-behavior`. Wall duration: **352.33s**.
- Receipt was generated at `artifacts/evidence-phase07-native-win-recheck-20261005/automated-receipt.json`, with accurate `status: "failed"` and suite/lifecycle/PowerShell results; raw logs are alongside it.
- Cleanup: the rerun's sandbox was removed on exit. All three remaining `win-qual-sandbox-*` directories had birth times 17:08:36Z, 17:16:51Z, and 17:22:18Z, before this run; they were left untouched.
- Qualification remains **INVALIDATED**. The required 111-test subset, lifecycle, PowerShell transport, receipt writing, and current-run cleanup passed; the additional required launch suite did not. Phase 06 must regenerate the candidate (including the updated runner and repaired `.omp` build manifest) before qualification can pass.

This rerun did not collect code coverage or run a build; neither was part of the native qualification acceptance check.
