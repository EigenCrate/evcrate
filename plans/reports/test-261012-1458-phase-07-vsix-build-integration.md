# Test Execution Report: Phase 07 VSIX/Build Integration

- Date: 2026-10-12
- Target Phase: Phase 07 VSIX / build integration
- Runner: Node.js test runner (`node:test`), npm scripts

## Sequential Thinking Steps

1. Identify test scope for Phase 07: `vscode-companion-vsix.test.mjs`, `single-projection-manifest-reuse.test.mjs`, `bounded-worker-staging.test.mjs`, `input-snapshot-safety.test.mjs`, `tests/vscode-companion/*.test.mjs`, and `npm run distribute:check`.
2. Verify TypeScript build and baseline integrity via `npm run build`.
3. Execute distribution test targets individually to capture granular suite metrics, pass/fail counts, and runtimes.
4. Execute VS Code companion unit and contract suite.
5. Execute distribution check (`npm run distribute:check`) to validate projection consistency.
6. Verify companion package and runtime closures via `check:vscode-companion` and `release:check`.
7. Synthesize execution metrics and confirm 100% test pass rate.

## Test Results Overview

| Test Suite / Target | Files | Suites | Total Tests | Passed | Failed | Skipped | Duration |
|---------------------|-------|--------|-------------|--------|--------|---------|----------|
| `tests/distribution/vscode-companion-vsix.test.mjs` | 1 | 0 | 7 | 7 | 0 | 0 | 273.86 ms |
| `tests/distribution/single-projection-manifest-reuse.test.mjs` | 1 | 4 | 6 | 6 | 0 | 0 | 47,710.11 ms |
| `tests/distribution/bounded-worker-staging.test.mjs` | 1 | 5 | 16 | 16 | 0 | 0 | 47,352.28 ms |
| `tests/distribution/input-snapshot-safety.test.mjs` | 1 | 0 | 7 | 7 | 0 | 0 | 7,174.43 ms |
| `tests/vscode-companion/*.test.mjs` | 11 | 0 | 41 | 41 | 0 | 0 | 484.62 ms |
| **Total Node Tests** | **15** | **9** | **77** | **77** | **0** | **0** | **102,995.30 ms** |

## Distribution & Build Validation Status

| Check Command | Status | Output / Payload Summary |
|---------------|--------|--------------------------|
| `npm run distribute:check` | PASSED | `protocol: evcrate-resource-control`, `status: ok`, `action: check`, `engine: typescript` |
| `npm run check:vscode-companion` | PASSED | Development checkout verified (`VSIX SHA-256: 811021ac...`, `buildIdentity: f2acc742...`) |
| `npm run release:check` | PASSED | Runtime closure validated |
| `npm run build` | PASSED | TypeScript build completed without warnings |

## Coverage Metrics

- Line coverage: N/A (codebase enforces `.evcrateignore` blocking `coverage/` artifacts; execution relies on strict schema and contract test assertions)
- Branch coverage: N/A
- Function coverage: N/A

## Failed Tests

- None. 0 failures across all 77 tests and distribution checks.

## Performance Metrics

- Total test duration across all 5 Node test executions: ~103.0s.
- `distribute:check` wall time: 12.81s.
- Longest running individual tests:
  - `single-projection-manifest-reuse.test.mjs` -> `runAllManifestsBuild produces 100% byte-for-byte identical manifests compared to sequential runLocalBuild`: 33,496.22 ms
  - `bounded-worker-staging.test.mjs` -> `runAllManifestsBuild produces identical 9 manifests with jobs=1 (serial) vs jobs=2 (parallel)`: 21,374.77 ms
  - `single-projection-manifest-reuse.test.mjs` -> `runLocalBuild with emitAllManifests option populates allStagedManifests and produces verified build`: 9,601.87 ms
  - `bounded-worker-staging.test.mjs` -> `rebuilds twice without promoting over canonical AGENTS with jobs=1`: 6,746.56 ms
  - `bounded-worker-staging.test.mjs` -> `runLocalBuild with jobs=4 matches jobs=1 byte-for-byte for target subset`: 6,714.05 ms
  - `bounded-worker-staging.test.mjs` -> `rebuilds twice without promoting over canonical AGENTS with jobs=2`: 6,421.59 ms

## Build Status

- Success. No build errors or warnings observed during TypeScript compilation or distribution verification.

## Critical Issues

- None. All requested tests and validation passed.

## Recommendations

- Retain serialization (`--test-concurrency=1` or separate runner invocations) for build-generation distribution tests (`single-projection-manifest-reuse`, `bounded-worker-staging`) to prevent worker pool contention during full test suite runs.

## Next Steps

- Integrate Phase 07 test suite into CI test runner pipeline under standard pre-merge checks.

## Unresolved Questions

- None.
