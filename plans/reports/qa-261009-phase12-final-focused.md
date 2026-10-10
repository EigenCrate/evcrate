# QA Validation Report: Phase 12 Final Focused Test Suites

**Target**: Sequential focused test suites execution (`--test-concurrency=1`, disk-backed `TMPDIR`)  
**Environment**: Linux x64, Node v24.16.0, CWD `/home/loidinh/WS/evcrate-ws/evc-unified-naming`  
**Working Snapshot**: Post-clean build + repaired adapter/publication fixtures + new document ownership test suite  

---

## Test Results Overview

| Suite | Command | Total | Pass | Fail | Skip | Duration | Status |
|---|---|---|---|---|---|---|---|
| **Suite 1: Adapters** | `node --test --test-concurrency=1 tests/adapters/native-instruction-delivery.test.mjs tests/adapters/copilot-native-instructions.test.mjs tests/adapters/antigravity-context.test.mjs tests/adapters/contracts.test.mjs tests/adapters/vscode-behavior.test.mjs tests/adapters/omp-native-activation.test.mjs` | 87 | 81 | 6 | 0 | 18.39s | ✖ FAIL |
| **Suite 2: Registry** | `node --test --test-concurrency=1 tests/registry/target-schema-migration.test.mjs` | 8 | 8 | 0 | 0 | 0.07s | ✔ PASS |
| **Suite 3: Manifests** | `node --test --test-concurrency=1 tests/manifests/distribution-manifests.test.mjs tests/manifests/adapter-runtime-identity.test.mjs` | 15 | 15 | 0 | 0 | 2.60s | ✔ PASS |
| **Suite 4: Protocol** | `node --test --test-concurrency=1 tests/protocol/contracts.test.mjs` | 22 | 22 | 0 | 0 | 0.09s | ✔ PASS |
| **Suite 5: Build-Generation** | `node --test --test-concurrency=1 tests/distribution/typescript-*.test.mjs tests/distribution/input-snapshot-safety.test.mjs tests/distribution/single-projection-manifest-reuse.test.mjs tests/distribution/bounded-worker-staging.test.mjs tests/distribution/platform-and-lifecycle-contracts.test.mjs tests/distribution/parity-verification-and-benchmarks.test.mjs tests/manifests/adapter-runtime-identity.test.mjs` | 65 | 65 | 0 | 0 | 291.77s | ✔ PASS |
| **Suite 6: Publication** | `node --test --test-concurrency=1 tests/distribution/publication-apply.test.mjs tests/distribution/publication-plan.test.mjs tests/distribution/publication-parity.test.mjs tests/distribution/publication-native-document-ownership.test.mjs` | 24 | 23 | 1 | 0 | 251.04s | ✖ FAIL |
| **Suite 7a: Pi Hooks & Smoke** | `node --test --test-concurrency=1 .evcrate/targets/pi/tests/hooks.test.mjs .evcrate/targets/pi/tests/extension-smoke.test.mjs` | 9 | 8 | 1 | 0 | 24.76s | ✖ FAIL |
| **Suite 7b: Pi Runtime Integration** | `node --test --test-concurrency=1 .evcrate/targets/pi/tests/runtime-integration.test.mjs` | 1 | 0 | 1 | 0 | 181.35s | ✖ FAIL |
| **Total** | | **231** | **222** | **9** | **0** | **770.07s** | |

---

## Comparison With Prior Run (`CorrectedBehaviorValidation`)

- **Prior Totals**: 233 tests (210 pass, 23 fail).
- **Test Set Delta**:
  - Suite 1: -2 incidental pins deleted (entrypoint helper wiring pin, stderr line count pin) → 89 down to 87.
  - Suite 5: -1 incidental pin deleted (F8 historical Git index identity) → 66 down to 65.
  - Suite 6: -1 incidental pin deleted (multi-target binding sequence pin) → 23 down to 22.
  - Suite 6: +2 new tests added (`tests/distribution/publication-native-document-ownership.test.mjs`) → 22 up to 24.
  - **Net Count**: 233 - 4 + 2 = 231 tests.
- **Pass Rate Improvement**: Failures decreased from 23 to 9 (14 previously failing tests resolved).
  - All 13 previous publication failures in `publication-apply`, `publication-plan`, and `publication-parity` now PASS (`safePath` `.github` allowance and fresh TMP package resolution effective).
  - VS Code strict UID ownership check now PASSES in isolated context.
  - OMP Unicode compact projection test now PASSES.

---

## Direct Coverage Exercised

- **Adapters**: Antigravity context bridge & commands, Copilot native instruction projection & URI preservation, OMP native activation & Unicode projection, VS Code session isolation & behavioral parsing, core adapter contracts.
- **Registry**: Schema 1 and Schema 2 target migration, Gemini deprecation handling, foreign CWD resolution.
- **Manifests**: Target distribution manifests, adapter runtime identity invalidation in disposable runtime.
- **Protocol**: Canonical JSON encoding/parsing, portable contracts, exit code band mappings, safe paths.
- **Build Generation (65 tests)**: Bounded worker staging (jobs 1–4), snapshot safety, parity verification, single-projection manifest reuse, TypeScript incremental caching, safe output cleanup.
- **Distribution Publication (24 tests)**: OMP publication, multi-target project apply/dry-run, recovery journals, mixed document ownership, unmanaged leaf collisions.
- **Pi Target**: Hook adapters, resolver hierarchy, TypeBox bundled loading, isolated npm package distribution and CLI publish dry-run.

---

## Failed Tests & Detailed Root Cause Analysis

### Suite 1: Adapters (6 failures)

All 6 failures locate in `tests/adapters/contracts.test.mjs`. Root cause: `contracts.test.mjs` line 35 hardcoded `fixtureRoot` to `process.platform === 'win32' ? tmpdir() : '/tmp'`. On test runner, user `loidinh` (uid 1000) reached disk quota limit on `tmpfs` mounted at `/tmp` (9394M used of 9530M limit; only ~136MB remaining), causing `EDQUOT` during target projection staging. Root filesystem (`/dev/mapper/fedora-root`) has 101GB free with no quota, but hardcoded `/tmp` bypassed configured `TMPDIR`.

1. `tests/adapters/contracts.test.mjs:258:1`
   - Test: `Antigravity rejects conflicting advisor names before emission and preserves absent names`
   - Trace: `Error [ControlPlaneError]: Publication failed` at `writeAtomicFileInternal (dist/filesystem/atomic.js:157:9)` via `writeProjectionFile` and `build (dist/adapters/antigravity.js:635:59)`. Underlying error: write failure to `/tmp` atomic scratch file.
2. `tests/adapters/contracts.test.mjs:321:1`
   - Test: `validators reject missing, extra, modified, symlink, and special outputs while accepting mode changes`
   - Trace: `Error: EDQUOT, Disk quota exceeded '/tmp/.mutation-antigravity-nXamZs/.antigravity'` at `cpSync` (`node:internal/fs/cp/cp-sync:145:22`).
3. `tests/adapters/contracts.test.mjs:368:1`
   - Test: `installed runtime entrypoints resolve children from their own roots and keep workspace context`
   - Trace: `Error: EDQUOT, Disk quota exceeded '/tmp/.installed-jDpQqX/.claude/workflows'` at `cpSync`.
4. `tests/adapters/contracts.test.mjs:434:1`
   - Test: `installed runtime wrappers deny missing and symlinked child hooks`
   - Trace: `Error: EDQUOT, Disk quota exceeded '/tmp/.installed-0kvV1f/.claude/workflows'` at `cpSync`.
5. `tests/adapters/contracts.test.mjs:471:1`
   - Test: `seven-target scanner and catalog contracts hold from foreign CWD`
   - Trace: `Error: Unknown system error -122, write` (errno -122 = `EDQUOT`) at `writeFileSync (node:fs:2422:20)`.
6. `tests/adapters/contracts.test.mjs:544:1`
   - Test: `projected scanners fail closed on missing target, duplicate map, and unsafe path`
   - Trace: `Error: Unknown system error -122, write` (errno -122 = `EDQUOT`) at `writeFileSync (node:fs:2422:20)`.

*Note*: 81/87 tests in Suite 1 passed, including all other adapter tests and VS Code behavior tests.

---

### Suite 6: Distribution Publication (1 failure)

1. `tests/distribution/publication-native-document-ownership.test.mjs:61:1`
   - Test: `unmanaged native instruction and hook collisions refuse without changing user bytes`
   - Assertion Failure:
     ```
     AssertionError [ERR_ASSERTION]: Missing expected exception.
         at TestContext.<anonymous> (tests/distribution/publication-native-document-ownership.test.mjs:65:12)
     ```
   - Observed Behavior: Test executes loop:
     ```js
     for (const [target, leaf] of [['copilot', '.github/copilot-instructions.md'], ['antigravity', '.agents/hooks.json']]) {
       ...
       assert.throws(() => publishApply(context, {}, { scope: 'project', selectedTargets: [target] }));
     }
     ```
     `publishApply` did not throw synchronous exception on collision fixture during programmatic API invocation.

---

### Suite 7: Pi Target (2 failures)

1. `.evcrate/targets/pi/tests/extension-smoke.test.mjs:252:1`
   - Test: `isolated published Pi entrypoint preserves resolver and hook adapter behavior`
   - Trace:
     ```
     ControlPlaneError [PUBLICATION_FAILED]: Publication failed
         at fail (dist/distribution/manifest.js:20:29)
         at verifyOutputHashes (dist/distribution/manifest.js:146:9)
         at verifyBuild (dist/distribution/manifest.js:164:5)
         at resolveBuild (dist/distribution/build-resolution.js:139:39)
         at resolveCurrentBuild (dist/distribution/build-resolution.js:158:12)
         at createPublicationPlan (dist/distribution/publication-plan.js:694:65)
         at homePublicationPlan (dist/distribution/publication.js:856:60)
         at publishDryRun (dist/distribution/publication.js:897:18)
     ```
   - **Empirical Mismatch Data** (captured via diagnostic script on exact fixture replication):
     - Mismatched Output Key: `.pi`
     - Expected Output Hash (`manifest.output_hashes['.pi']`): `1e87f896acbc2fcade7f1a818d86075cbb0b3d6e0ac6811b79685319f7681a37`
     - Actual Output Hash (`digest(fixturePackage/.evcrate/source/.pi)`): `788e2a8d7fd6220be68daf669a7fe3f42f1c0b8a147a0bb1ec610978ab6c9765`
     - Investigation: `prepareFixtureWorkspace` initially populates `.evcrate/source/.pi` with checked-in files. When `runLocalBuild(fixturePackage, PERSISTED_TARGETS)` executes, it runs the Pi adapter build, producing only `agent/extensions/evcrate/...` in the output tree and omitting 881 agent/command/skill files present in the checked-in manifest hash baseline.
     - Note: Previous claim that `dist` lacked compiled routing was `[INFERENCE]`; recorded evidence proves exact key is `.pi` tree content divergence.

2. `.evcrate/targets/pi/tests/runtime-integration.test.mjs:69:1`
   - Test: `packed distribution publishes and Pi discovers native commands and skills`
   - Failure: `evcrate publish --dry-run` failed with exit code 5:
     ```json
     {"error":{"action":"Repair the publication state before retrying.","category":"publication","code":"PUBLICATION_FAILED","message":"Publication failed"},"operation":"publish.dry-run","protocol":"evcrate-resource-control","protocolVersion":1,"status":"error"}
     ```
   - Root Cause: Same underlying publication verification failure during CLI publish dry-run resolution.

---

## Performance Metrics

- Total Execution Time: 770.07 seconds (~12.8 minutes)
- Longest Running Suites:
  - Suite 5: Build-Generation (291.77s) — Worker staging parity and manifest reuse benchmarks.
  - Suite 6: Publication (251.04s) — Large transaction rollback and multi-stage lifecycle apply tests.
  - Suite 7b: Pi Runtime Integration (181.35s) — Network-isolated npm install and package build.

---

## Build & Diagnostic Status

- Build status: Clean compiled `dist/` verified.
- Scratch Directory: Dedicated `.phase12-verification-6CkJ4o/final-focused-tmp` used for execution and cleanly removed. Preserved all parent fixtures (`native-bridges.cjs`, `publication-smoke.cjs`, `build-smoke.cjs`, `package/`, `publication/`).

---

## Critical Issues

1. `tests/adapters/contracts.test.mjs:35`: Hardcoded `/tmp` root causes test failures under quota-restricted runner environments. Must use `tmpdir()` respecting `TMPDIR`.
2. `tests/distribution/publication-native-document-ownership.test.mjs:65`: `publishApply` did not throw expected collision exception on unmanaged native files.
3. Pi target output verification: Mismatch on `.pi` output tree hash (`1e87...` expected vs `788e...` actual).

---

## Recommendations

1. Change `tests/adapters/contracts.test.mjs` line 35 to use `tmpdir()` rather than hardcoding `/tmp`.
2. Align `tests/distribution/publication-native-document-ownership.test.mjs:65` with CLI collision exit behavior or verify collision detection logic in programmatic `publishApply`.
3. Reconcile Pi projection output files with `build-manifest-pi.json` baseline.

---

## Unresolved Questions

None.
