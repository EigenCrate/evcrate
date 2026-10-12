# Test Execution Report: Phase 07 VSIX/Build Integration (Round 2)

- Date: 2026-10-12
- Target Phase: Phase 07 VSIX / build integration
- Runner: Node.js test runner (`node:test`), npm scripts

## Sequential Thinking Steps

1. Identify requested test scope: `tests/distribution/vscode-companion-vsix.test.mjs`, `tests/distribution/single-projection-manifest-reuse.test.mjs`, `tests/distribution/bounded-worker-staging.test.mjs`, `tests/distribution/input-snapshot-safety.test.mjs`, `tests/vscode-companion/*.test.mjs`, and `npm run distribute:check`.
2. Verify TypeScript compile clean via `npm run build`.
3. Execute all requested test targets individually; record test counts, suites, pass/fail, and durations.
4. Execute distribution check (`npm run distribute:check`) and supplemental release verifiers (`check:vscode-companion`, `release:check`).
5. Run experimental coverage audit on target overlay test scope.
6. Consult advisor on test outcomes and remaining scope uncertainties.
7. Synthesize findings into concise QA report.

## Test Results Overview

| Test Target / File | Files | Suites | Total Tests | Passed | Failed | Skipped | Duration |
|--------------------|-------|--------|-------------|--------|--------|---------|----------|
| `tests/distribution/vscode-companion-vsix.test.mjs` | 1 | 0 | 9 | 9 | 0 | 0 | 267.69 ms |
| `tests/distribution/single-projection-manifest-reuse.test.mjs` | 1 | 4 | 6 | 6 | 0 | 0 | 47,752.06 ms |
| `tests/distribution/bounded-worker-staging.test.mjs` | 1 | 5 | 16 | 16 | 0 | 0 | 47,730.70 ms |
| `tests/distribution/input-snapshot-safety.test.mjs` | 1 | 0 | 7 | 7 | 0 | 0 | 7,205.20 ms |
| `tests/vscode-companion/*.test.mjs` | 11 | 0 | 41 | 41 | 0 | 0 | 483.34 ms |
| **Total Requested Tests** | **15** | **9** | **79** | **79** | **0** | **0** | **103,438.99 ms** |

Validation status: **100% PASS** (79 passed, 0 failed, 0 skipped, 0 cancelled, 0 todo).
Note: Suite expanded by +2 regression tests vs Round 1 (`verifyPackCompanionArtifacts fails when vscode target overlay declared but descriptor missing` and `mergeTargetOverlayArtifacts rejects tampered VSIX hash`).

## Distribution & Build Validation Status

| Check Command | Status | Result / Output Summary | Duration |
|---------------|--------|-------------------------|----------|
| `npm run distribute:check` | PASSED | `protocol: evcrate-resource-control`, `status: ok`, `action: check`, `engine: typescript` | 14.13 s |
| `npm run check:vscode-companion` | PASSED | Verified development-checkout (`VSIX SHA-256: 0a1b1ef5...`, `buildIdentity: cecdd168...`) | 0.32 s |
| `npm run release:check` | PASSED | Runtime closure validated (`validateRuntimeClosure`) | 0.43 s |
| `npm run build` | PASSED | TypeScript build clean, 0 errors, 0 warnings | 1.43 s |

## Coverage Metrics

- Whole-suite test coverage: N/A (standard build runner uses strict schema/contract validation assertions; `.evcrateignore` blocks default coverage output artifacts).
- Experimental targeted coverage (`vscode-companion-vsix.test.mjs` execution):
  - Aggregate loaded files: Line 34.02%, Branch 50.40%, Functions 22.47%.
  - `dist/distribution/overlay-staging.js`: Line 55.86%, Branch 63.64%, Functions 100.00%.
  - `dist/adapters/vscode/companion-package-contracts.js`: Line 77.03%, Branch 28.21%, Functions 100.00%.
  - `scripts/verify-vscode-companion.mjs`: Line 72.88%, Branch 29.41%, Functions 50.00%.
  - Note: Low aggregate figure stems from unexercised generic shared utilities loaded transitively, not untested companion contract code.

## Failed Tests

- None. 0 failures across all 79 tests and checks.

## Performance Metrics

- Total test duration across all 5 Node test invocations: ~103.44 s.
- `distribute:check` wall time: 14.13 s.
- Slowest individual tests:
  - `single-projection-manifest-reuse.test.mjs` -> `runAllManifestsBuild produces 100% byte-for-byte identical manifests compared to sequential runLocalBuild`: 33,531.45 ms
  - `bounded-worker-staging.test.mjs` -> `runAllManifestsBuild produces identical 9 manifests with jobs=1 (serial) vs jobs=2 (parallel)`: 21,591.79 ms
  - `single-projection-manifest-reuse.test.mjs` -> `runLocalBuild with emitAllManifests option populates allStagedManifests and produces verified build`: 9,632.91 ms
  - `bounded-worker-staging.test.mjs` -> `rebuilds twice without promoting over canonical AGENTS with jobs=1`: 6,782.34 ms
  - `bounded-worker-staging.test.mjs` -> `runLocalBuild with jobs=4 matches jobs=1 byte-for-byte for target subset`: 6,754.87 ms
  - `bounded-worker-staging.test.mjs` -> `rebuilds twice without promoting over canonical AGENTS with jobs=2`: 6,485.58 ms

## Build Status

- Success. TypeScript compile (`npm run build`) clean without warnings.

## Critical Issues

- None blocking test execution. All requested tests pass 100%.

## Recommendations

1. Enforce serialization (`--test-concurrency=1` or separate runner invocations) when executing manifest/staging tests (`single-projection-manifest-reuse`, `bounded-worker-staging`) to prevent worker pool contention and file locks during full CI runs.
2. In future iterations, add end-to-end qualification test verifying actual extension installation (`code --install-extension`) in a virtual environment.

## Next Steps

1. Incorporate 9 VSIX distribution tests into default CI pre-merge matrix.
2. Address reviewer notes on live input snapshot freshness vs receipt hashes and packed archive cross-platform qualification.

## Unresolved Questions

1. Which earlier review findings remain open for Phase 07 (specifically: live-input freshness vs receipt hashes, packed-artifact archive proof, and Node patch version in buildIdentity)?
2. Is end-to-end `code --install-extension` installation smoke test planned for a later release qualification phase or required before Phase 07 signoff?
