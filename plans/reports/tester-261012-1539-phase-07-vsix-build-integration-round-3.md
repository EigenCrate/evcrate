# Test Execution Report: Phase 07 VSIX/Build Integration (Cycle 3)

- Date: 2026-10-12
- Target Phase: Phase 07 VSIX / build integration
- Runner: Node.js test runner (`node:test`), npm scripts

## Sequential Thinking Steps

1. Parse requested verification commands: `tests/distribution/vscode-companion-vsix.test.mjs`, `tests/distribution/single-projection-manifest-reuse.test.mjs`, `tests/distribution/bounded-worker-staging.test.mjs`, `tests/distribution/input-snapshot-safety.test.mjs`, `tests/vscode-companion/*.test.mjs`, and `npm run distribute:check`.
2. Ensure clean compilation via `npm run build`.
3. Sequentially execute each requested test suite to avoid runner contention and record test metrics (counts, suites, durations, pass/fail).
4. Run `npm run distribute:check` and supplemental release verifiers (`check:vscode-companion`, `release:check`).
5. Consult advisor on test outcomes and remaining scope uncertainties.
6. Synthesize concise QA summary report with unverified boundaries noted.

## Test Results Overview

| Test Target / File | Files | Suites | Total Tests | Passed | Failed | Skipped | Duration |
|--------------------|-------|--------|-------------|--------|--------|---------|----------|
| `tests/distribution/vscode-companion-vsix.test.mjs` | 1 | 0 | 12 | 12 | 0 | 0 | 570.32 ms |
| `tests/distribution/single-projection-manifest-reuse.test.mjs` | 1 | 4 | 6 | 6 | 0 | 0 | 47,479.42 ms |
| `tests/distribution/bounded-worker-staging.test.mjs` | 1 | 5 | 16 | 16 | 0 | 0 | 47,390.39 ms |
| `tests/distribution/input-snapshot-safety.test.mjs` | 1 | 0 | 7 | 7 | 0 | 0 | 7,214.86 ms |
| `tests/vscode-companion/*.test.mjs` | 11 | 0 | 41 | 41 | 0 | 0 | 478.49 ms |
| **Total Requested Tests** | **15** | **9** | **82** | **82** | **0** | **0** | **103,133.48 ms** |

Validation status: **100% PASS** (82 passed, 0 failed, 0 skipped, 0 cancelled, 0 todo).
Suite delta vs Round 2: +3 tests in `vscode-companion-vsix.test.mjs` (version parity verification, hermetic staging overlay checks, ZIP traversal/unexpected-entry checks, closure fail-closed corrupt/missing validation).

## Distribution & Build Validation Status

| Check Command | Status | Result / Output Summary | Duration |
|---------------|--------|-------------------------|----------|
| `npm run distribute:check` | PASSED | `protocol: evcrate-resource-control`, `status: ok`, `action: check`, `engine: typescript` | 12.91 s |
| `npm run check:vscode-companion` | PASSED | Verified development-checkout (`VSIX SHA-256: dc407810...`, `buildIdentity: 7f809ba8...`) | 0.40 s |
| `node scripts/verify-vscode-companion.mjs --mode packed-package` | PASSED | Verified packed-package checkout (`VSIX SHA-256: dc407810...`, `buildIdentity: 7f809ba8...`) | 0.25 s |
| `npm run release:check` | PASSED | Runtime closure validated (`validateRuntimeClosure`) | 0.36 s |
| `npm run build` | PASSED | TypeScript build clean, 0 errors, 0 warnings | 1.45 s |

## Coverage Metrics

- Whole-suite test coverage: Unchanged; `.evcrateignore` suppresses test coverage instrumentation output in production distributions.
- Regression test additions covered in Cycle 3:
  - Version parity between `package.json`, extension package, and `.evcrate/targets/vscode/manifest.json`.
  - Hermetic overlay merge edge cases: happy path, collidable path, undeclared files, tampered hashes.
  - ZIP parser rejection for traversal paths and unexpected top-level filenames (duplicate entries remain unexercised).
  - Runtime closure fail-closed validation on missing descriptor and corrupt VSIX EOCD.

## Failed Tests

- None. 0 failures across all 82 tests and checks.

## Performance Metrics

- Total test duration across all 5 test runner invocations: ~103.13 s.
- `distribute:check` wall time: 12.91 s.
- Slowest tests:
  - `single-projection-manifest-reuse.test.mjs` -> `runAllManifestsBuild produces 100% byte-for-byte identical manifests compared to sequential runLocalBuild`: 33,309.35 ms
  - `bounded-worker-staging.test.mjs` -> `runAllManifestsBuild produces identical 9 manifests with jobs=1 (serial) vs jobs=2 (parallel)`: 21,376.75 ms
  - `single-projection-manifest-reuse.test.mjs` -> `runLocalBuild with emitAllManifests option populates allStagedManifests and produces verified build`: 9,557.30 ms
  - `bounded-worker-staging.test.mjs` -> `rebuilds twice without promoting over canonical AGENTS with jobs=1`: 6,713.99 ms
  - `bounded-worker-staging.test.mjs` -> `runLocalBuild with jobs=4 matches jobs=1 byte-for-byte for target subset`: 6,714.07 ms
  - `bounded-worker-staging.test.mjs` -> `rebuilds twice without promoting over canonical AGENTS with jobs=2`: 6,506.17 ms

## Build Status

- Success. `npm run build` completed cleanly without errors or warnings.

## Critical Issues

- None blocking test execution. All requested tests pass 100%.

## Recommendations

- Keep staging/manifest tests serialized (`--test-concurrency=1` or separate runner runs) in CI to avoid worker pool saturation.
- Add test assertion explicitly covering duplicate ZIP entry rejection in `parseZipEntries`.

## Next Steps

- Finalize phase status documentation with Phase 07 test counts.
- Retain verification gates in pre-publish CI pipeline.

## Unresolved Questions

1. Is real VS Code install/activation (`code --install-extension`) required before Phase 07 signoff, or deferred to release qualification?
