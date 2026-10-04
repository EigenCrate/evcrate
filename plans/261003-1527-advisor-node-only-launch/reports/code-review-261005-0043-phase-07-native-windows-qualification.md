# Code Review Report — Phase 07: Native Windows Qualification

**Review Date:** 2026-10-05  
**Plan Reference:** `plans/261003-1527-advisor-node-only-launch/phase-07-native-windows-qualification.md`  
**Reviewer:** Phase07Reviewer  
**Overall Quality Score:** 6.8 / 10  
**Disposition:** Hand back to Phase 06 for candidate regeneration per Rule 94  

---

## 1. Executive Summary

Phase 07 audited host environment, verified candidate bundle integrity, and executed automated qualification runner on native Windows x64.
- **Reviewed Files:**
  - `tests/advisor-controller/native-windows-qualification.cjs`
  - `plans/261003-1527-advisor-node-only-launch/reports/phase-07-windows-qualification.md`
  - `artifacts/evidence-automated/automated-receipt.json`
  - `artifacts/evidence-automated/node-launch-behavior.log`
  - `tests/advisor-controller/node-launch.test.cjs`

---

## 2. Validation Commands and Results

1. **Candidate Archive Inventory Verification:**
   - Command: `node tests/advisor-controller/qualification-bundle.cjs verify-archive --archive artifacts/qualification-bundle/candidate.zip --manifest artifacts/qualification-bundle/manifest.json`
   - Result: `status: ok`, 7,433 verified entries matching CRC32 and SHA-256.
2. **Candidate Extraction Verification:**
   - Command: `node tests/advisor-controller/qualification-bundle.cjs verify --root artifacts/extracted-candidate/package --manifest artifacts/qualification-bundle/manifest.json`
   - Result: `status: ok`, 7,433 files matching byte-for-byte.
3. **Native Advisor Test Suites:**
   - Suite 1 (Provider Launch & Retry): 48 / 48 passed (100%).
   - Suite 2 (Supervision Console & Lifecycle): 19 / 19 passed (100%).
   - Suite 3 (Controller, State CLI & History CLI): 44 / 44 passed (100%).
   - Total native Windows advisor assertions: **111 / 111 passed (100%)**.
4. **Installed Controller Lifecycle:**
   - Real CLI process sequence: `state init` → `state checkpoint` → central consultation → `state disposition` → `state outcome` → `state complete`.
   - Result: `task_revision: 7`, `gate_status: completed`.
5. **PowerShell UTF-8 Transport:**
   - Windows PowerShell 5.1 pipeline: `$payload | & node "$controller" history list`.
   - Result: Valid `HISTORY_READY` JSON envelope, exit 0.
6. **Headless Human Decision Rejection:**
   - Unattended console challenge correctly fails closed with `HUMAN_EVENT_REQUIRED`.
7. **Suite 4 Defect (PUBLICATION_FAILED):**
   - `node-launch.test.cjs` failed (1 passed, 8 failed, exit 1).
   - Root cause: Stale `.omp` output hash in candidate `.evcrate/build-manifest-omp.json` (`b886...` vs actual `c5b6...`).

---

## 3. Critical Issues & Resolutions

1. **Qualification Status Mismatch & Rule 94 Violation:**
   - *Issue:* Report initially marked Row 2 as QUALIFIED despite `automated-receipt.json` showing `status: failed`.
   - *Resolution:* Per Rule 94 and Advisor counsel, Row 2 and formal Phase 07 qualification reclassified as **INVALIDATED (Candidate Defect)**. Candidate cannot be patched locally on Windows; must return to Phase 06 for candidate regeneration.
2. **Console Exercise Interactive Flow:**
   - *Issue:* `--mode console` lacked authentic operator challenge handling.
   - *Resolution:* Implemented interactive challenge flow when `process.stdin.isTTY` and clean `skipped` status when non-interactive.

---

## 4. Warnings Addressed

1. **Sandbox Directory Cleanup:** Moved `fs.rmSync(sandboxRoot)` to a `finally` block to prevent leaks on test failure.
2. **Receipt Metadata:** Recorded Windows OS build (`os.release()`) and candidate manifest metadata in receipt.
3. **PowerShell Argument Quoting:** Verified safe path quoting and UTF-8 encoding across scripts.

---

## 5. Unresolved Questions

1. When Phase 06 regenerates the candidate archive with the repaired `.omp` build manifest hash on Linux, will the native Windows runner be scheduled immediately to re-execute Row 2?
2. Will interactive console rows remain documented prerequisite blocks across automated CI pipelines, or will a dedicated attached-console runner be provisioned?
