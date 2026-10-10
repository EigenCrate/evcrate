# QA Regression Report: Phase 12 Final Regressions & Boundary Retest

**Date**: 2026-10-09  
**Execution Environment**: Linux x64, Node v24.16.0, unshared private user/mount namespace with `.phase12-verification-6CkJ4o/disk-tmp` mounted at `/tmp`, `TMPDIR=/tmp`.  
**Status**: ✔ PASS (159/159 tests passed across both commanded suites).  
**Validation boundary**: Both bounded commands passed. Not a full-suite, frozen-release, unavailable-native-surface, approval, or durable-completion claim.

---

## Post-Review Execution Summary (2026-10-09, Verification Attempt 2)

### Command 1: Distribution, Protocol & CLI Caller Suites (82 Cases)
- **Command**:
  ```bash
  npm run build:clean && npm run typecheck:omp-runtime && unshare --user --map-root-user --mount sh -c 'mount --bind /home/loidinh/WS/evcrate-ws/evc-unified-naming/.phase12-verification-6CkJ4o/disk-tmp /tmp && TMPDIR=/tmp node --test --test-concurrency=1 tests/distribution/publication-recovery.test.mjs tests/distribution/publication-plan.test.mjs tests/distribution/publication-apply.test.mjs tests/distribution/publication-native-document-ownership.test.mjs tests/protocol/contracts.test.mjs tests/cli/publication.test.mjs'
  ```
- **Build / Typecheck**:
  - `prebuild:clean`: PASS
  - `build:clean`: PASS
  - `typecheck:omp-runtime`: PASS
- **Test Metrics**:
  - Total Tests: 82
  - Passed: 82
  - Failed: 0
  - Cancelled / Skipped / Todo: 0
  - Duration: 201529.65ms (~201.53s)
  - Exit Code: 0
  - Status: **✔ PASS (82/82)**
- **Resolved Regressions**:
  - `tests/cli/publication.test.mjs:93:1` (`real authority apply matches the typed plan on repeat`): PASS (2296.64ms). Isolates current package via fixture workspace pattern; repeat dry-run returns exit code 0.
  - `tests/cli/publication.test.mjs:146:1` (`typed publication rejects handler output with mismatched binding order`): PASS (7.08ms). Migrated correlation fixture `.agents` -> `.agents/skills`; preserves exit code 2 `PROTOCOL_INVALID`.

---

### Command 2: Targets, Adapters & Manifest Runtime Suites (77 Cases)
- **Command**:
  ```bash
  npm run build:clean && npm run typecheck:omp-runtime && unshare --user --map-root-user --mount sh -c 'mount --bind /home/loidinh/WS/evcrate-ws/evc-unified-naming/.phase12-verification-6CkJ4o/disk-tmp /tmp && TMPDIR=/tmp node --test --test-concurrency=1 .evcrate/targets/pi/tests/hooks.test.mjs .evcrate/targets/pi/tests/extension-smoke.test.mjs .evcrate/targets/pi/tests/runtime-integration.test.mjs .evcrate/targets/pi/tests/command-files.test.mjs tests/adapters/antigravity-context.test.mjs tests/adapters/omp-native-activation.test.mjs tests/adapters/help-consumer.test.mjs tests/manifests/adapter-runtime-identity.test.mjs'
  ```
- **Build / Typecheck**:
  - `prebuild:clean`: PASS
  - `build:clean`: PASS
  - `typecheck:omp-runtime`: PASS
- **Test Metrics**:
  - Total Tests: 77
  - Passed: 77
  - Failed: 0
  - Cancelled / Skipped / Todo: 0
  - Duration: 253949.91ms (~253.95s)
  - Exit Code: 0
  - Status: **✔ PASS (77/77)**
- **Verified Coverage Highlights**:
  - Pi command files, foreign CWD instructions, frontmatter substitutions, prompt resource markers (8 cases): PASS
  - Pi extension smoke, tools, lifecycle, isolated entrypoint, TypeBox loading (13 cases): PASS
  - Antigravity context, real invocation bridge, lifecycle boundaries, hung hook termination (31 cases): PASS
  - Seven help identities foreign CWD authority & prompt translation (8 cases): PASS
  - OMP native activation, admission gate, diagnostic isolation, compact prompt projection (15 cases): PASS
  - Adapter runtime identity build invalidation on shared/vscode helper change (2 cases): PASS

---

## Cumulative Verification Totals

| Execution Stage | Tests Run | Passed | Failed | Status | Duration |
|---|---|---|---|---|---|
| Command 1 (Distribution + Protocol + CLI) | 82 | 82 | 0 | ✔ PASS | 201.53s |
| Command 2 (Pi + AGY + OMP + Help + Manifests) | 77 | 77 | 0 | ✔ PASS | 253.95s |
| **Total Cumulative Post-Correction** | **159** | **159** | **0** | **✔ PASS (100%)** | **455.48s** |

---

## Historical Evidence & Defect Resolution Trail

### Historical Failure (Cycle 1 Post-Review, 2026-10-09)
*Prior run executed before parent fixture updates:*
- **Command 1**: 82 tests run, 80 passed, 2 failed (Exit code 1).
  - Failure 1: `tests/cli/publication.test.mjs:93:1` (`real authority apply matches the typed plan on repeat`) failed with `5 !== 0` on repeat dry-run due to unisolated package root in test authority check.
  - Failure 2: `tests/cli/publication.test.mjs:146:1` (`typed publication rejects handler output with mismatched binding order`) failed with `3 !== 2` due to legacy `.agents` binding order without current `.agents/skills`.
- **Command 2**: Skipped per stop-on-failure contract.
- **Resolution**: Parent applied workspace isolation to real authority test fixture and migrated correlation fixture binding paths to current `.agents/skills`, preserving `PROTOCOL_INVALID` exit code 2 contract without modifying source error classification.

### Historical Baseline (Initial Targeted Regression Retest, 2026-10-09)
*Prior targeted boundary run for help consumer and manifest identity:*
- **Target**: `tests/adapters/help-consumer.test.mjs`, `tests/manifests/adapter-runtime-identity.test.mjs`
- **Results**: 10 tests run, 10 passed, 0 failed (11.17s).
- **Manifest Checksums**:
  - `.evcrate/build-manifest.json`: `878393fe186d4fe51a58793592f0059031989c56cbaae1f27de1391d027777ae`
  - `.evcrate/build-manifest-pi.json`: `26aa399d217954641d6b6daae5951778ac95e3a6c28c8a5d5ce9f0d8e732ab25`
- **10 Test Cases**:
  1. `claude: installed help uses its own catalog and relay identity from foreign CWD`: PASS
  2. `codex: installed help uses its own catalog and relay identity from foreign CWD`: PASS
  3. `antigravity: installed help uses its own catalog and relay identity from foreign CWD`: PASS
  4. `pi: installed help uses its own catalog and relay identity from foreign CWD`: PASS
  5. `omp: installed help uses its own catalog and relay identity from foreign CWD`: PASS
  6. `copilot: installed help uses its own catalog and relay identity from foreign CWD`: PASS
  7. `vscode: installed help uses its own catalog and relay identity from foreign CWD`: PASS
  8. `prompt translation preserves persisted target IDs and proper names, while mapping operational references`: PASS
  9. `a shared adapter helper change invalidates every translated adapter and rejects the recorded build`: PASS
  10. `a VS Code helper change invalidates only its adapter and rejects the recorded build`: PASS

---

## Critical Issues

None. All 159 tests across both commanded suites executed cleanly with zero failures.

---

## Recommendations

1. Maintain isolated fixture workspaces (`prepareFixtureWorkspace`) for any CLI authority integration tests that run dry-run / apply cycles against the current package.
2. Ensure future publication correlation fixtures reflect the canonical binding tree (`.agents/skills`) when testing handler order validations.

---

## Next Steps

1. Deliver terminal bounded validation evidence to parent.
2. Obtain whole-phase reviewer/advisor findings and explicit user approval before finalization or durable completion.

---

## Unresolved Questions

None.
