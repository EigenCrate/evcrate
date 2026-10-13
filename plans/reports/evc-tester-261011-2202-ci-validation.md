# CI Validation Report — Run 38148347852 Fix Verification

- **Date**: 2026-10-11
- **Target**: EigenCrate/evcrate (`main` branch)
- **Environment**: Linux x64, Node.js v24.21.0
- **Scope**: Verification of CI failure fix for run 38148347852 (`npm run build`, `npm run distribute:check`, `npm run test:build-generation`, `npm run test:protocol`, `npm run test:cli`, `npm run test:adapters`)
- **Overall Verdict**: **PASS**

---

## 1. Build and Distribution Verification

| Command | Underlying Command | Result | Notes |
|---|---|---|---|
| `npm run build` | `node scripts/build-typescript.mjs -p tsconfig.json` | **PASS** | TypeScript compile clean; 0 errors (wall: 1.45s) |
| `npm run distribute:check` | `node dist/cli/evcrate.js distribute check` | **PASS** | Projections verified; status: `ok` (wall: 12.62s) |

---

## 2. Test Suites Execution Summary

| Suite | Command | Total | Pass | Fail | Skip | Duration | Status |
|---|---|---|---|---|---|---|---|
| `test:build-generation` | `node --test --test-concurrency=1 tests/distribution/typescript-*.test.mjs tests/distribution/input-snapshot-safety.test.mjs tests/distribution/single-projection-manifest-reuse.test.mjs tests/distribution/bounded-worker-staging.test.mjs tests/distribution/platform-and-lifecycle-contracts.test.mjs tests/distribution/parity-verification-and-benchmarks.test.mjs tests/manifests/adapter-runtime-identity.test.mjs tests/distribution/phase09-golden-and-contract-regressions.test.mjs` | 75 | 75 | 0 | 0 | 193.78s | **PASS** |
| `test:protocol` | `node --test tests/protocol/*.test.mjs` | 17 | 17 | 0 | 0 | 0.07s | **PASS** |
| `test:cli` | `node --test tests/cli/*.test.mjs tests/context/*.test.mjs` | 62 | 61 | 0 | 1 | 25.65s | **PASS** |
| `test:adapters` | `node --test tests/adapters/*.test.mjs` | 231 | 231 | 0 | 0 | 31.48s | **PASS** |
| **Total** | | **385** | **384** | **0** | **1** | **250.98s** | **PASS** |

*Note on skipped test in `test:cli`: 1 test skipped (`Windows native context and reparse contract suite`), platform conditional on Linux host.*

---

## 3. Status of 5 Previously Failing Tests (CI Run 38148347852)

All 5 tests previously failing in CI run 38148347852 verified passing:

| # | Test Name | Suite / File | Previous Failure Reason | Current Status | Duration |
|---|---|---|---|---|---|
| 1 | `rebuilds twice without promoting over canonical AGENTS with jobs=1` | `tests/distribution/bounded-worker-staging.test.mjs` | Stale manifest closure caused `hasAuthoringSources` false -> consumer verification -> missed source hash rejection | **PASS** | 6881.81ms |
| 2 | `rebuilds twice without promoting over canonical AGENTS with jobs=2` | `tests/distribution/bounded-worker-staging.test.mjs` | Stale manifest closure caused `hasAuthoringSources` false -> consumer verification -> missed source hash rejection | **PASS** | 6596.15ms |
| 3 | `Phase 09: all canonical command files round-trip through -x- reversibility` | `tests/distribution/phase09-golden-and-contract-regressions.test.mjs` | Assertion checked `length >= 70`, but retired `evc-cmd-advise.md` lowered command inventory to 69 | **PASS** | 1.02ms |
| 4 | `a shared adapter helper change invalidates every translated adapter and rejects the recorded build` | `tests/manifests/adapter-runtime-identity.test.mjs` | `ENOENT` copying deleted `dist/adapters/advisory.js` referenced in test fixture and stale manifests | **PASS** | 81.85ms |
| 5 | `a VS Code helper change invalidates only its adapter and rejects the recorded build` | `tests/manifests/adapter-runtime-identity.test.mjs` | `ENOENT` copying deleted advisory adapters listed in VS Code manifest | **PASS** | 73.91ms |

---

## 4. Key Observations

1. Manifest closure clean: Stale references to `dist/adapters/advisory.js` and VS Code advisory files successfully eliminated from all 6 target manifests.
2. Adapter identity fixture updated: Points to active live helper `dist/adapters/uri-restoration.js`.
3. Inventory count aligned: Contract assert matches exact 69 canonical commands with explicit assertion that `evc-cmd-advise.md` retired.
4. Authoring build detection restored: Bounded worker rebuild assertions properly catch canonical drift and raise `PUBLICATION_FAILED` as expected.
5. All downstream protocol, CLI, and adapter suites pass without regression.

---

## 5. Overall Verdict

**PASS** — All targeted build, check, and test suites pass cleanly. CI failure root causes fully resolved.

---

## 6. Unresolved Questions

None.
