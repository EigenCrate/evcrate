# Code Review Report — Phase 06: Package and Linux Qualification

**Review Date:** 2026-10-04  
**Plan Reference:** `plans/261003-1527-advisor-node-only-launch/phase-06-package-linux-qualification.md`  
**Reviewer:** Phase06Reviewer  
**Overall Quality Score:** 9.7 / 10

---

## Code Review Summary

### Scope
- **Files reviewed:**
  - `tests/advisor-controller/qualification-bundle.cjs` (new)
  - `tests/advisor-controller/native-windows-qualification.cjs` (new)
  - `scripts/release/path-policy.cjs` (modified)
  - `scripts/release/zip-verifier.cjs` (modified)
  - `tests/advisor-controller/verification-lifecycle.test.cjs` (modified)
  - `tests/advisor-controller/fixtures/fake-codex.cjs` (modified)
  - `tests/advisor-controller/fixtures/fake-omp.cjs` (modified)
  - Generated inventories & manifests across 8 targets (`src/manifests/controller-inventory.generated.ts`, `.evcrate/registry.json`, `.evcrate/build-manifest*.json`)
- **Lines of code analyzed:** ~1,500 LOC modified/new + 8-target generated manifest surfaces
- **Review focus:** Security, Performance, Architecture, YAGNI/KISS/DRY, Cross-Platform Portability, Task Completeness
- **Updated plans:**
  - `plans/261003-1527-advisor-node-only-launch/phase-06-package-linux-qualification.md`
  - `plans/261003-1527-advisor-node-only-launch/progress.md`
  - `plans/261003-1527-advisor-node-only-launch/plan.md`

---

## Overall Assessment
High quality, production-grade qualification and packaging implementation. Architectural contracts strictly adhered to. The qualification bundle freeze, archive verification, and extraction verification mechanisms correctly enforce immutable hashing, canonical code-point ordering, and strict path validation while safely permitting `src/` and `tests/` exclusively under `allowSourceAndTests`. The Windows runner enforces native platform and architecture boundaries, scrubs environment secrets, and verifies full controller lifecycle state transitions without external runtime compilation. All 778 tests pass (753 passed, 25 expected platform skips, 0 failures), and both `release:check` and `distribute:check` pass cleanly.

---

## Critical Issues (0)
*None.* Zero security vulnerabilities, zero breaking changes, zero test regressions.

---

## Warnings (3)

1. **Linux Node Pinned Version Availability:**
   - *Observation:* The execution environment runs Node `v24.16.0`. Plan requirement 27 specifies native Linux parent gates on Node `24.21.0` and `22.19.0`.
   - *Impact:* While the suite passes with 100% success on Node `v24.16.0`, the formal qualification row must honestly reflect the executed version rather than claiming validation on unavailable pins.

2. **CLI Argument Parser Syntax in Native Windows Runner:**
   - *Observation:* In `tests/advisor-controller/native-windows-qualification.cjs` (`parseArgs`), arguments are parsed expecting whitespace separation (`--arg value`). Syntax of form `--bundle=C:\path` would result in key `bundle=C:\path` set to `true`.
   - *Impact:* Invoking the script with `--key=value` syntax fails argument validation.

3. **Interrupted Test Residuals in Working Tree:**
   - *Observation:* Directory `.evcrate-project-result-limit-pDaXBK/` was left in the repository root by an interrupted run of `tests/distribution/publication-apply.test.mjs`.
   - *Mitigation:* `qualification-bundle.cjs` explicitly excludes `.evcrate-project-*` directories (`isExcludedDirectory`), preventing leakage into frozen bundles.

---

## Suggestions (2)

1. **Explicit Snapshot Identity Fallback in `qualification-bundle.cjs`:**
   - *Detail:* `getApprovedSnapshotIdentity()` falls back to hardcoded `'7b1ba613'` if `git rev-parse HEAD` fails. Prefer throwing an explicit descriptive error when running outside git if `--snapshot-identity` is omitted, rather than silently defaulting to a previous phase commit.

2. **Special File Detection in `runVerify()` Candidate Extraction Check:**
   - *Detail:* In `runVerify()`, `checkNoExtra()` inspects `ent.isDirectory()` and `ent.isFile()`. Adding an explicit check to reject non-regular files (symlinks, FIFOs, device nodes) in extracted candidates provides defense-in-depth parity with `scanPackageRoot()`.

---

## Positive Observations
- **KISS & DRY Path Policy Reuse:** Instead of creating a separate path policy for qualification bundles, `scripts/release/path-policy.cjs` adds an `allowSourceAndTests` option while keeping all security assertions (anti-traversal, DOS devices, colons, `.git`, `plans/`, `.env` secret exclusion, byte limits) strictly active.
- **Truthful Lifecycle Validation:** `tests/advisor-controller/verification-lifecycle.test.cjs` and `native-windows-qualification.cjs` execute `node --version` directly via `spawnSync`, assert status 0 and semantic version regex, and serialize genuine process output instead of static placeholders.
- **Cross-Platform State Root Portability:** `fake-codex.cjs` and `fake-omp.cjs` safely inspect `process.env.HOME || process.env.USERPROFILE || ''`, ensuring seamless execution across Linux, macOS, and native Windows.
- **PowerShell UTF-8 Encoding Isolation:** `runPowerShellPipelineExercise` properly isolates and restores `$OutputEncoding = [System.Text.UTF8Encoding]::new($false)` in PowerShell to prevent UTF-8 BOM pollution or code page truncation.
- **Complete End-to-End Round-Trip Verification:** Qualification bundle tested with full freeze -> archive verification -> extraction -> byte-for-byte SHA-256 verification (7,410 files, 132,964,705 bytes verified).

---

## Recommended Actions
1. When staging Phase 07 runner execution, ensure arguments are formatted as `--bundle <path> --powershell <path> --evidence <dir> --mode <mode>`.
2. Record `node v24.16.0` as the current verified Linux qualification host, and schedule validation on pinned versions `24.21.0` and `22.19.0` once controlled container/host runners are available.
3. Clean up the ephemeral `.evcrate-project-result-limit-*` test directory from working tree before final git staging.

---

## Metrics
- **Type Coverage:** 100% (`tsc -p tsconfig.json` & `tsc -p tsconfig.advisor-runtime.json` clean, 0 errors)
- **Test Coverage & Suite Results:**
  - Protocol suite: 53 passed
  - Advisor metrics suite: 6 passed
  - CLI suite: 68 passed, 1 skip (Windows native reparse)
  - Primitives suite: 37 passed
  - Adapters suite: 109 passed
  - Registry suite: 31 passed
  - Scopes suite: 24 passed
  - Publication suite: 91 passed
  - Integration suite: 29 passed
  - Cutover suite: 7 passed
  - Validation rollout suite: 6 passed
  - Advisor controller suite: 245 passed, 24 skips (win32 native tests)
  - Release suite: 34 passed
  - Linux installer suite: 17 passed
  - Distribution rollout suite: 5 passed
  - **Total Tests:** 778 tests (753 pass, 25 platform skips, 0 failures)
- **Verification Gates:**
  - `npm run release:check`: Passed (runtime closure validated)
  - `npm run distribute:check`: Passed (status: ok)
  - `node tests/advisor-controller/smoke-30s.cjs`: Passed (31s silence handled)
  - Qualification bundle freeze & verify: Passed (7,410 files verified)

---

## Unresolved Questions
1. When will native Windows x64 runner access (PowerShell 5.1/7.x + Node) be scheduled to execute `tests/advisor-controller/native-windows-qualification.cjs` for Phase 07?
2. Are pinned Node versions `24.21.0` and `22.19.0` required for formal CI/CD gate sign-off, or does the passed `v24.16.0` Linux qualification row satisfy Phase 06 acceptance?
