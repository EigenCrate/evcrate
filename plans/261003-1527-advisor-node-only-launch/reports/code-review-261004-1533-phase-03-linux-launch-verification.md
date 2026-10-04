# Code Review: Phase 03 — Linux Launch Verification

**Date:** 2026-10-04  
**Reviewer:** CodeReviewerPhase03  
**Target:** Phase 03 — Linux real-launch verification and portable fixtures  
**Plan:** `plans/261003-1527-advisor-node-only-launch/phase-03-linux-launch-verification.md`  
**Score:** 9.9/10  

---

## Code Review Summary

### Scope
- **Files reviewed:**
  - `tests/advisor-controller/fixtures/provider-fixture.cjs` (200 lines)
  - `tests/advisor-controller/fixtures/node-launch-helpers.cjs` (124 lines)
  - `tests/advisor-controller/node-launch.test.cjs` (764 lines)
  - `tests/advisor-controller/interactive-console-verification.py` (261 lines)
  - `tests/cli/health.test.mjs` (54 lines added, 149 lines total)
- **Lines of code analyzed:** ~1,403 lines across reviewed files.
- **Review focus:** Linux real-launch qualification, package-shaped fake provider portability, security (path isolation, env sanitization, secret scrubbing, TTY/headless boundary), performance (spawnSync timeouts, clean disposal), YAGNI/KISS/DRY adherence, and acceptance criteria N02–N13, N15.
- **Updated plans:**
  - `plans/261003-1527-advisor-node-only-launch/phase-03-linux-launch-verification.md` (Todos marked complete; status marked complete)
  - `plans/261003-1527-advisor-node-only-launch/plan.md` (Phase 03 status updated to Complete / 100%)

---

## Overall Assessment
Phase 03 deliverables demonstrate exceptional engineering rigor, defensive isolation, and comprehensive coverage of acceptance criteria:
1. **Installed Lifecycle via Explicit Node (N02, N10):** Real publication through `publishDryRun`/`publishApply` into private HOME with spaces and Unicode (`evcrate-lnx-sp ace-🚀-`). Full v2 lifecycle verified: `init` (rev 0→1) → `checkpoint` (rev 1→2) → inference (rev 2→4) → `get` (rev 4) → `disposition` (rev 4→5) → `outcome` (rev 5→6) → `complete` (rev 6→7, gate `completed`). SHA-256 digests, run/checkpoint UUIDs, and durable history records match contract.
2. **Path & Environment Isolation (N03, N04, N07):** Spaces and non-ASCII Unicode paths handled transparently. Dual-project verification (`proj ect-alpha-α` vs `proj ect-beta-β`) proves SHA-256 project scope hashing isolates state and history without cross-project leakage. Bad HOME (empty, relative, absent) fails closed with zero writes to project or profile fallbacks.
3. **Fail-Closed Execution & Decoy Resistance (N05, N06):** Unlaunchable Node fails with spawn error; missing installed controller fails without executing decoy script placed in project directory.
4. **Executable-Bit Independence (N08):** Script `0o644` (execute bits stripped) executes identically through Node under both controller suite and health CLI suite, maintaining metadata-only shebang semantics.
5. **History CLI Verification (N11):** List, show, metrics, export (`dry_run: true` vs `dry_run: false`), and prune (`dry_run: true`) execute accurately against durable records.
6. **Error & Malformed Input Handling (N12, N13):** Malformed JSON and oversized stdin (>32 KiB) fail closed immediately with `status: 'FAILED'`, preserving gate state.
7. **Interactive Console & No-TTY Enforcement (N15):** Headless automated execution fails closed with `HUMAN_EVENT_REQUIRED`. Python PTY verification (`interactive-console-verification.py`) using real `/dev/tty` proves wrong nonce fails, current exact challenge accepts with recorded source `local-terminal-confirmation`, and abort cancels cleanly.
8. **Portable Fixtures:** Package-shaped provider fixtures (`@openai/codex` and `omp`) generate both `.cmd` and POSIX launchers with `path.delimiter` support, ready for Phase 07 native Windows qualification without symlink dependencies.

---

## Critical Issues (MUST FIX)
None.

---

## Warnings (SHOULD FIX)
None.

---

## Suggestions (NICE TO HAVE)
1. **Prune Dry-Run Assertion Comment Consistency:**
   - In `tests/advisor-controller/node-launch.test.cjs:416`, assertion message references `1000 days retention` while test option sets `retention_days: 365`. Assertion logic is valid; message should align to `365 days` for clarity.
2. **Python Node Detection Idiom:**
   - In `tests/advisor-controller/interactive-console-verification.py:18`, `NODE_PATH = sys.executable if "node" in sys.executable else shutil.which("node")` evaluates `shutil.which("node")` when invoked via python3. Consider `shutil.which("node") or "node"` for cleaner idiomatic Python.

---

## Positive Observations
- **Defensive Environment Scrubbing:** `buildSanitizedEnvironment` actively strips secrets/PATs matching regex, clears recursion markers (`EVCRATE_ADVISOR_*`), and deduplicates case-insensitive `PATH`/`Path`.
- **Zero Platform Hacks:** Uses real OS pseudo-terminal (`pty.openpty()`, `setsid()`, `TIOCSCTTY`) for console proof, avoiding mocked TTY echoes.
- **Strict YAGNI/KISS/DRY:** Reuses existing test fakes (`fake-codex.cjs`, `fake-omp.cjs`) and publication APIs without inventing separate runtime layers.
- **Complete Cleanup Lifecycle:** Fixtures employ `mkdtempSync` and robust multi-retry `rmSync` tear-downs, leaving no orphaned directories.

---

## Metrics
- **TypeScript Compilation:** Clean (`npm run build` exit 0, prebuild/inventory/runtime-brief generated).
- **Distribution Check:** Clean (`npm run distribute:check` -> `status: ok`).
- **Test Pass Rate:** 100% across all suites (339 executed, 25 skipped):
  - `npm run test:cli`: 68/68 passed (1 skipped)
  - `npm run test:advisor-controller`: 243/243 passed (24 skipped)
  - `tests/adapters/phase08-mentoring-integration.test.mjs`: 8/8 passed
  - `tests/distribution/phase10-controller-scenarios.test.mjs` + `phase10-human-gate.test.mjs`: 8/8 passed
  - `tests/advisor-controller/smoke-30s.cjs`: 1/1 passed (31s)
  - `tests/advisor-controller/interactive-console-verification.py`: 3/3 passed

---

## Validation Commands and Results
- `npm run test:cli`: Exit 0 (68 passed, 0 failed, 1 skipped)
- `npm run test:advisor-controller`: Exit 0 (243 passed, 0 failed, 24 skipped)
- `node --test tests/adapters/phase08-mentoring-integration.test.mjs`: Exit 0 (8 passed, 0 failed)
- `node --test tests/distribution/phase10-controller-scenarios.test.mjs tests/distribution/phase10-human-gate.test.mjs`: Exit 0 (8 passed, 0 failed)
- `node tests/advisor-controller/smoke-30s.cjs`: Exit 0 (1 passed, 0 failed)
- `python3 tests/advisor-controller/interactive-console-verification.py`: Exit 0 (3 scenarios passed: wrong nonce rejected, exact challenge accepted, abort cancelled)
- `npm run build`: Exit 0
- `npm run distribute:check`: Exit 0 (`status: "ok"`)

---

## Recommended Actions
1. Approve Phase 03 Linux launch verification deliverables.
2. Proceed to [Phase 04 — Darwin native build](./phase-04-darwin-native-build.md) for arm64/x64 build-only native asset packaging.

---

## Unresolved Questions
1. None. All Linux launch scenarios and console verification gates resolved and passing.
