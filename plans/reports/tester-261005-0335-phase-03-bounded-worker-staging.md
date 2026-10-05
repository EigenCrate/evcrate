# Phase 03: Bounded Worker Staging — QA Test Report

## Executive Summary

- Verification status: PASS (100% pass rate, 0 failures, 0 regressions, byte-for-byte parity verified across concurrency levels).
- Total tests executed: 31
- Passed: 31
- Failed: 0
- Skipped: 0
- Total execution wall time: 280.71 s

## Test Results Overview

| Test Suite / File | Total Tests | Passed | Failed | Skipped | Duration (ms) | Status |
|---|---|---|---|---|---|---|
| `tests/distribution/bounded-worker-staging.test.mjs` | 12 | 12 | 0 | 0 | 52,953.94 | PASS |
| `tests/distribution/release-and-cutover.test.mjs` | 7 | 7 | 0 | 0 | 280,643.31 (parallel runner) | PASS |
| `tests/distribution/single-projection-manifest-reuse.test.mjs` | 6 | 6 | 0 | 0 | 71,391.77 | PASS |
| `tests/distribution/validation-rollout.test.mjs` | 6 | 6 | 0 | 0 | 39,482.57 | PASS |
| **Total** | **31** | **31** | **0** | **0** | **280,643.31 ms** | **PASS** |

## Build Status

- Command: `npm run build`
- Status: SUCCESS
- Build warnings: None
- Details: Clean compilation across all prebuild scripts (`generate-runtime-brief.mjs`, `generate:advisor-runtime`, `generate-controller-inventory.mjs`) and main TypeScript compilation (`tsc -p tsconfig.json`).

## Verification Details by Suite

### 1. Phase 03: Bounded Worker Staging (`bounded-worker-staging.test.mjs`)
- **Jobs parsing and resolution (7 tests / 2.95 ms)**:
  - `parseJobsValue` accepts valid integers 1..8 as numbers and strings (PASS).
  - `parseJobsValue` rejects values < 1 or > 8 (PASS).
  - `parseJobsValue` rejects non-integers, NaN, and non-numeric strings (PASS).
  - `resolveBuildJobs` prioritizes explicit options over env vars (PASS).
  - `resolveBuildJobs` uses env var when explicit option omitted (PASS).
  - `resolveBuildJobs` caps jobs by targetCount (PASS).
  - `resolveBuildJobs` defaults to bounded concurrency (<= 2) when unspecified (PASS).
- **Input snapshot lifecycle & freshness verification (2 tests / 1,487.70 ms)**:
  - `prepareInputSnapshot` produces verified snapshot and hashes (PASS).
  - `assertLiveInputsUnchanged` aborts with `PUBLICATION_FAILED` on live input mutation (PASS).
- **Parity and concurrency execution (2 tests / 47,798.10 ms)**:
  - `runAllManifestsBuild` produces identical 9 manifests with jobs=1 (serial) vs jobs=2 (parallel) (PASS: 38,310.17 ms).
  - `runLocalBuild` with jobs=4 matches jobs=1 byte-for-byte for target subset (PASS: 9,487.28 ms).
- **Error handling and cancellation in worker pool (1 test / 3,664.41 ms)**:
  - Worker failure halts execution cleanly without corrupting or modifying baseline outputs (PASS).

### 2. Release & Cutover Suite (`release-and-cutover.test.mjs`)
- All 7 persisted targets cutover gate receipts verified (PASS: 0.92 ms).
- Engine selection normalizes aliases, rejects retired python overrides (PASS: 0.40 ms).
- Mixed-stage atomic transactions spanning python/typescript rejected (PASS: 0.23 ms).
- Local distribution build produces verified build manifest (PASS: 37,213.35 ms).
- Distribution artifact check validates tree without drift (PASS: 11,627.09 ms).
- Packaged artifact allowlist is Python-free and contains required runtime assets (PASS: 231,354.37 ms).
- Pure TypeScript CLI routes health, settings, version, and publication without Python (PASS: 317.42 ms).

### 3. Single-Projection Manifest Reuse Suite (`single-projection-manifest-reuse.test.mjs`)
- Metadata derivation: `buildTargetPolicies` generates mandatory policies; `deriveManifestView` correctly scopes `.evcrate/targets` (PASS: 222.98 ms).
- Parity & projection reuse: `runAllManifestsBuild` 100% byte-for-byte identical to sequential `runLocalBuild` (PASS: 53,216.98 ms); `emitAllManifests` populates verified build (PASS: 12,558.99 ms).
- Isolation & promotion: Single-target run leaves other targets untouched; staging failure leaves workspace clean (PASS: 5,391.32 ms).

### 4. Validation & Rollout Suite (`validation-and-rollout.test.mjs`)
- Consumer mode build resolution verifies outputs and controller closure without authoring adapter sources (PASS: 1,180.47 ms).
- Consumer mode fails closed on tampered projections (PASS: 184.31 ms).
- Installed registry-free unpacked snapshot runs publish dry-run and apply with zero package-root mutation (PASS: 36,608.97 ms).
- All target manifests and receipts validate schema 2 with TypeScript authority (PASS: 0.66 ms).
- Unmanaged user home content preserved across publication apply (PASS: 1,498.53 ms).
- Advisor settings and target publication maintain isolated journals and locks (PASS: 10.29 ms).

## Coverage Metrics

- Line coverage: N/A (Node test runner native execution without coverage instrumentation flag).
- Branch coverage: N/A.
- Function coverage: N/A.
- Note: Test suites exhaustively assert boundary conditions (jobs values 0..9, NaN, negative, string floats), concurrency equivalence (jobs=1 vs jobs=2 vs jobs=4), worker failure abort cleanup, and fail-closed security invariants.

## Failed Tests

- None. 0 failures detected across all suites.

## Performance Metrics

- Total test suite duration: 280.64 s
- Slow tests identified:
  1. `packaged artifact allowlist is Python-free and contains required runtime assets`: 231.35 s (executes full prepack/npm pack simulation).
  2. `runAllManifestsBuild produces 100% byte-for-byte identical manifests compared to sequential runLocalBuild`: 53.22 s (runs two full multi-target distribution builds).
  3. `runAllManifestsBuild produces identical 9 manifests with jobs=1 (serial) vs jobs=2 (parallel)`: 38.31 s (runs full 9-target build twice under serial and parallel configurations).
  4. `local distribution build executes and generates verified build manifest`: 37.21 s.
  5. `installed registry-free unpacked snapshot runs publish dry-run and apply with zero package-root mutation`: 36.61 s.
- Analysis: Execution time is dominated by comprehensive end-to-end multi-target asset distribution and artifact packing simulations. Test isolation and deterministic comparisons are working as designed.

## Critical Issues

- None. All concurrency, worker pool cancellation, snapshot validation, and parity gates operate nominal.

## Recommendations

1. **Selective Integration Test Splitting**: In CI environments, separate the lengthy `packaged artifact allowlist` packing test from quick unit/primitives tests to accelerate PR feedback loop.
2. **Snapshot Caching for Local Test Runs**: Investigate caching prepack artifacts when running local iterations to reduce repeat 230s execution overhead.

## Next Steps

1. Conclude Phase 03: Bounded Worker Staging verification handoff to Main agent.
2. Maintain bounded concurrency caps (<= 2 default, max 8) across future CI pipeline runners.

## Unresolved Questions

- None.
