# QA Validation Report: Phase 12 Corrected Boundary Test Suites

**Target**: Sequential focused test suites (`--test-concurrency=1`) in private disk-backed `/tmp` mount (`.phase12-verification-6CkJ4o/boundary-test-tmp`).  
**Namespace wrapper**: `unshare --user --map-root-user --mount sh -c "mount --bind $SCRATCH_ABS /tmp && export TMPDIR=/tmp && [command]"`  
**Environment**: Linux x64, Node v24.16.0, CWD `/home/loidinh/WS/evcrate-ws/evc-unified-naming`. No build executed.

---

## Build Manifest Hash Preservation

Pre-run and post-run SHA256 checksums verify zero manifest mutation:
- `.evcrate/build-manifest.json`:
  - Before: `878393fe186d4fe51a58793592f0059031989c56cbaae1f27de1391d027777ae`
  - After:  `878393fe186d4fe51a58793592f0059031989c56cbaae1f27de1391d027777ae`
  - Status: **IDENTICAL**
- `.evcrate/build-manifest-pi.json`:
  - Before: `26aa399d217954641d6b6daae5951778ac95e3a6c28c8a5d5ce9f0d8e732ab25`
  - After:  `26aa399d217954641d6b6daae5951778ac95e3a6c28c8a5d5ce9f0d8e732ab25`
  - Status: **IDENTICAL**

---

## Test Results Overview

| Suite | Exact Command | Total | Pass | Fail | Skip | Duration | Wall | Status |
|---|---|---|---|---|---|---|---|---|
| **Suite 1: Adapters (8 files)** | `node --test --test-concurrency=1 tests/adapters/native-instruction-delivery.test.mjs tests/adapters/copilot-native-instructions.test.mjs tests/adapters/antigravity-context.test.mjs tests/adapters/contracts.test.mjs tests/adapters/vscode-behavior.test.mjs tests/adapters/omp-native-activation.test.mjs tests/adapters/help-consumer.test.mjs tests/adapters/uri-restoration-differential.test.mjs` | 116 | 115 | 1 | 0 | 35.73s | 35.84s | ✖ FAIL |
| **Suite 2: Registry** | `node --test --test-concurrency=1 tests/registry/target-schema-migration.test.mjs` | 8 | 8 | 0 | 0 | 0.07s | 0.17s | ✔ PASS |
| **Suite 3: Manifests** | `node --test --test-concurrency=1 tests/manifests/distribution-manifests.test.mjs tests/manifests/adapter-runtime-identity.test.mjs` | 16 | 14 | 2 | 0 | 2.39s | 2.49s | ✖ FAIL |
| **Suite 4: Protocol** | `node --test --test-concurrency=1 tests/protocol/contracts.test.mjs` | 22 | 22 | 0 | 0 | 0.08s | 0.18s | ✔ PASS |
| **Suite 5: Distribution (Publication)** | `node --test --test-concurrency=1 tests/distribution/publication-apply.test.mjs tests/distribution/publication-plan.test.mjs tests/distribution/publication-parity.test.mjs tests/distribution/publication-native-document-ownership.test.mjs` | 24 | 24 | 0 | 0 | 194.46s | 194.56s | ✔ PASS |
| **Suite 6a: Pi Hooks** | `node --test --test-concurrency=1 .evcrate/targets/pi/tests/hooks.test.mjs` | 2 | 2 | 0 | 0 | 0.41s | 1.06s | ✔ PASS |
| **Suite 6b: Pi Declared Validation** | `node --test --test-concurrency=1 .evcrate/targets/pi/tests/extension-smoke.test.mjs .evcrate/targets/pi/tests/runtime-integration.test.mjs` | 8 | 8 | 0 | 0 | 225.97s | 226.07s | ✔ PASS |
| **Subtotal Requested Suites** | | **196** | **193** | **3** | **0** | **459.11s** | **460.37s** | |
| **Suite 7a: Qualification** | `node --test --test-concurrency=1 tests/adapters/qualification.test.mjs` | 4 | 4 | 0 | 0 | 0.13s | 0.23s | ✔ PASS |
| **Suite 7b: Mentoring Integration** | `node --test --test-concurrency=1 tests/adapters/phase08-mentoring-integration.test.mjs` | 5 | 5 | 0 | 0 | 4.21s | 4.32s | ✔ PASS |
| **Suite 7c: Invocation Context** | `node --test --test-concurrency=1 tests/context/invocation-context.test.mjs` | 7 | 7 | 0 | 0 | 0.18s | 0.28s | ✔ PASS |
| **Grand Total** | | **212** | **209** | **3** | **0** | **463.63s** | **465.20s** | |

---

## Comparison With Ground Truth Run (`qa-261009-phase12-final-focused.md`)

- **Prior 9 Failures Status**:
  1. `contracts.test.mjs` (6 failures from `/tmp` EDQUOT quota limit): **RESOLVED (6/6 PASS)**. Disk-backed unshare bind mount removed host `/tmp` quota constraint completely.
  2. `publication-native-document-ownership.test.mjs:61:1` (`unmanaged native instruction and hook collisions refuse without changing user bytes`): **RESOLVED (PASS)**.
  3. `extension-smoke.test.mjs:252:1` (`isolated published Pi entrypoint preserves resolver and hook adapter behavior`): **RESOLVED (PASS)**.
  4. `runtime-integration.test.mjs:69:1` (`packed distribution publishes and Pi discovers native commands and skills`): **RESOLVED (PASS)**.
- **Pi Validation Count**: Actual count for the declared two-file Pi command (`extension-smoke.test.mjs` + `runtime-integration.test.mjs`) is **8 tests** (7 in extension-smoke + 1 in runtime-integration), NOT advisor-guessed 10. All 8 tests pass cleanly.
- **New Tests Added**:
  - `tests/adapters/help-consumer.test.mjs` (7 tests: 6 pass, 1 fail).
  - `tests/adapters/uri-restoration-differential.test.mjs` (20 tests: 20 pass).
  - Extra sequential consumer suites requested: `qualification.test.mjs` (4 pass), `phase08-mentoring-integration.test.mjs` (5 pass), `invocation-context.test.mjs` (7 pass).

---

## Authoritative Failure Evidence & Stack Traces

Total failures: **3**.

### Failure 1: Suite 1 (Adapters)
**File**: `tests/adapters/help-consumer.test.mjs:43:3`  
**Test**: `vscode: installed help uses its own catalog and relay identity from foreign CWD`  
**Error**: `Error [ControlPlaneError]: Capability is unsupported`  
**Stack Trace**:
```text
Error [ControlPlaneError]: Capability is unsupported
    at getProjectionAdapter (/home/loidinh/WS/evcrate-ws/evc-unified-naming/dist/adapters/registry.js:66:15)
    at TestContext.<anonymous> (file:///home/loidinh/WS/evcrate-ws/evc-unified-naming/tests/adapters/help-consumer.test.mjs:50:21)
    at Test.runInAsyncScope (node:async_hooks:227:14)
    at Test.run (node:internal/test_runner/test:1306:25)
    at Test.processPendingSubtests (node:internal/test_runner/test:897:18)
    at Test.postRun (node:internal/test_runner/test:1447:19)
    at Test.run (node:internal/test_runner/test:1372:12)
    at async Test.processPendingSubtests (node:internal/test_runner/test:897:7) {
  code: 'CAPABILITY_UNSUPPORTED',
  category: 'capability',
  action: 'Select a supported target or capability.',
  exitCode: 3,
  detail: undefined
}
```
**Cause**: `getProjectionAdapter('vscode')` throws `CAPABILITY_UNSUPPORTED` because VS Code adapter is not a projection adapter (`needsAdapter: false` in schema, behavioral bridge only). `help-consumer.test.mjs` iterates all 7 targets including `vscode`.

---

### Failure 2: Suite 3 (Manifests)
**File**: `tests/manifests/adapter-runtime-identity.test.mjs:73:1`  
**Test**: `a shared adapter helper change invalidates every translated adapter and rejects the recorded build`  
**Error**: `Error [ControlPlaneError]: Path is unsafe`  
**Stack Trace**:
```text
Error [ControlPlaneError]: Path is unsafe
    at unsafe (/home/loidinh/WS/evcrate-ws/evc-unified-naming/dist/filesystem/paths.js:16:11)
    at assertRealDirectory (/home/loidinh/WS/evcrate-ws/evc-unified-naming/dist/filesystem/paths.js:87:9)
    at loadResourceRoots (/home/loidinh/WS/evcrate-ws/evc-unified-naming/dist/manifests/registry.js:49:40)
    at loadTargetManifestRegistry (/home/loidinh/WS/evcrate-ws/evc-unified-naming/dist/manifests/registry.js:107:27)
    at copiedTranslatedRuntime (file:///home/loidinh/WS/evcrate-ws/evc-unified-naming/tests/manifests/adapter-runtime-identity.test.mjs:36:20)
    at TestContext.<anonymous> (file:///home/loidinh/WS/evcrate-ws/evc-unified-naming/tests/manifests/adapter-runtime-identity.test.mjs:74:34)
    at Test.runInAsyncScope (node:async_hooks:227:14)
    at Test.run (node:internal/test_runner/test:1306:25)
    at Test.start (node:internal/test_runner/test:1177:17)
    at startSubtestAfterBootstrap (node:internal/test_runner/harness:385:17) {
  code: 'PATH_UNSAFE',
  category: 'path',
  action: 'Use a safe path within the selected context.',
  exitCode: 3,
  detail: 'not a real directory: "/tmp/evcrate-adapter-identity-txuDM0/.evcrate/source/.claude"'
}
```
**Cause**: `copiedTranslatedRuntime` helper in `adapter-runtime-identity.test.mjs` clones only specific paths into disposable `/tmp` tree without creating real directory `.evcrate/source/.claude`. `loadResourceRoots` enforces `assertRealDirectory` on declared resource roots.

---

### Failure 3: Suite 3 (Manifests)
**File**: `tests/manifests/adapter-runtime-identity.test.mjs:99:1`  
**Test**: `a VS Code helper change invalidates only its adapter and rejects the recorded build`  
**Error**: `Error [ControlPlaneError]: Path is unsafe`  
**Stack Trace**:
```text
Error [ControlPlaneError]: Path is unsafe
    at unsafe (/home/loidinh/WS/evcrate-ws/evc-unified-naming/dist/filesystem/paths.js:16:11)
    at assertRealDirectory (/home/loidinh/WS/evcrate-ws/evc-unified-naming/dist/filesystem/paths.js:87:9)
    at loadResourceRoots (/home/loidinh/WS/evcrate-ws/evc-unified-naming/dist/manifests/registry.js:49:40)
    at loadTargetManifestRegistry (/home/loidinh/WS/evcrate-ws/evc-unified-naming/dist/manifests/registry.js:107:27)
    at copiedTranslatedRuntime (file:///home/loidinh/WS/evcrate-ws/evc-unified-naming/tests/manifests/adapter-runtime-identity.test.mjs:36:20)
    at TestContext.<anonymous> (file:///home/loidinh/WS/evcrate-ws/evc-unified-naming/tests/manifests/adapter-runtime-identity.test.mjs:100:34)
    at Test.runInAsyncScope (node:async_hooks:227:14)
    at Test.run (node:internal/test_runner/test:1306:25)
    at Test.processPendingSubtests (node:internal/test_runner/test:897:18)
    at Test.postRun (node:internal/test_runner/test:1447:19) {
  code: 'PATH_UNSAFE',
  category: 'path',
  action: 'Use a safe path within the selected context.',
  exitCode: 3,
  detail: 'not a real directory: "/tmp/evcrate-adapter-identity-sCfr1K/.evcrate/source/.claude"'
}
```
**Cause**: Same fixture isolation defect in `copiedTranslatedRuntime` as Failure 2; missing `.claude` resource root directory in cloned sandbox.

---

## Scratch Directory Cleanup

Scratch folder `.phase12-verification-6CkJ4o/boundary-test-tmp` extracted and cleanly purged. Host filesystem and shared parent artifacts remain completely untouched.

---

## Recommendations

1. In `tests/adapters/help-consumer.test.mjs`, exclude non-projection targets (`vscode`) or handle `CAPABILITY_UNSUPPORTED` gracefully in help relay check.
2. In `tests/manifests/adapter-runtime-identity.test.mjs:copiedTranslatedRuntime`, copy or `mkdirSync` declared `.evcrate/source/.claude` directory so `assertRealDirectory` validation passes.

---

## Unresolved Questions

None.
