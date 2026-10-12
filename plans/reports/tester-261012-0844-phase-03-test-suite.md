# Phase 03 Verification Report — Test Suite Execution Post-Manifest Fix

- **Date:** 2026-10-12
- **Phase:** `plans/261011-2349-vscode-runtime-model-bindings/phase-03-immutable-agent-templates.md`
- **Context:** Post-fix validation after pruning stale `dist/adapters/vscode/models.js` from `.evcrate/targets/vscode/manifest.json`, wiring `model-intent.js` and companion contracts, and regenerating build manifests.
- **Verdict:** **PASS (All 6 Gates Green)** — 100% test pass rate across focused, identity, adapter, build generation, distribution check, and full compound test suite (`npm test`). Zero test failures.

---

## 1. Scope & Verification Commands

| Gate | Command | Status | Exact Pass / Fail / Skip | Duration |
|---|---|---|---|---|
| **1. Focused Tests** | `node --test tests/adapters/vscode-configuration.test.mjs tests/adapters/vscode-resource-projection.test.mjs tests/vscode-companion/contracts.test.mjs` | **PASS** | 16 pass / 0 fail / 0 skip | 1,773.46 ms |
| **2. Runtime Identity** | `node --test tests/manifests/adapter-runtime-identity.test.mjs` | **PASS** | 2 pass / 0 fail / 0 skip | 253.90 ms |
| **3. Adapter Suite** | `npm run test:adapters` | **PASS** | 231 pass / 0 fail / 0 skip | 31,188.79 ms |
| **4. Distribute Check** | `npm run distribute:check` | **PASS** | status: "ok" (operation: distribute.check) | 14.73 s |
| **5. Build Generation** | `npm run test:build-generation` | **PASS** | 75 pass / 0 fail / 0 skip | 192,516.29 ms |
| **6. Full Test Suite** | `npm test` | **PASS** | 665 pass / 0 fail / 1 skip | 795.89 s |

---

## 2. Test Breakdown (`npm test`)

The compound `npm test` pipeline runs 14 test runner commands sequentially after `npm run build:all`.

| Suite Runner | Command Context | Total | Pass | Fail | Skip | Duration | Status |
|---|---|---:|---:|---:|---:|---:|---|
| `test:protocol` | `node --test tests/protocol/*.test.mjs` | 17 | 17 | 0 | 0 | 65.18 ms | PASS |
| `test:cli` | `node --test tests/cli/*.test.mjs tests/context/*.test.mjs` | 62 | 61 | 0 | 1 | 25,492.65 ms | PASS |
| `test:primitives` | `node --test tests/filesystem/distribution-primitives.test.mjs tests/manifests/distribution-manifests.test.mjs` | 24 | 24 | 0 | 0 | 2,086.58 ms | PASS |
| `test:adapters` | `node --test tests/adapters/*.test.mjs` | 231 | 231 | 0 | 0 | 31,479.03 ms | PASS |
| `test:registry` | `node --test tests/registry/resource-registry.test.mjs ...` | 32 | 32 | 0 | 0 | 610.11 ms | PASS |
| `test:scopes` | `node --test tests/scopes/*.test.mjs` | 5 | 5 | 0 | 0 | 377.50 ms | PASS |
| `test:publication` | `node --test --test-concurrency=1 tests/protocol/contracts.test.mjs ...` | 118 | 118 | 0 | 0 | 284,579.55 ms | PASS |
| `test:build-generation` | `node --test --test-concurrency=1 tests/distribution/typescript-*.test.mjs ...` | 75 | 75 | 0 | 0 | 207,455.52 ms | PASS |
| `test:integration` | `node --test --test-concurrency=1 tests/integration/*.test.mjs` | 35 | 35 | 0 | 0 | 101,224.69 ms | PASS |
| `test:cutover` | `node --test tests/distribution/release-and-cutover.test.mjs` | 7 | 7 | 0 | 0 | 48,605.24 ms | PASS |
| `test:validation-rollout` | `node --test tests/distribution/validation-and-rollout.test.mjs` | 6 | 6 | 0 | 0 | 27,350.37 ms | PASS |
| `test:release` | `node --test tests/distribution/private-release-artifacts.test.mjs ...` | 21 | 21 | 0 | 0 | 11,254.90 ms | PASS |
| `test:installer:linux` | `node --test tests/installers/*.test.mjs` | 28 | 28 | 0 | 0 | 1,532.84 ms | PASS |
| `test:distribution:rollout` | `node --test tests/distribution/private-unpack-rollout.test.mjs` | 5 | 5 | 0 | 0 | 50,763.62 ms | PASS |
| **Total Full Suite** | `npm test` compound execution | **666** | **665** | **0** | **1** | **795.89 s** | **PASS** |

*Note: 1 test skipped in `test:cli`: "Windows native context and reparse contract suite" (skipped due to execution on Linux x64 platform).*

---

## 3. Root Cause Resolution Verification

- Previous failure in `tests/manifests/adapter-runtime-identity.test.mjs`:
  - `ENOENT: no such file or directory, lstat '.../dist/adapters/vscode/models.js'` during `cpSyncFn` inside `copiedTranslatedRuntime()`.
- Fix applied:
  - Replaced stale entry `"dist/adapters/vscode/models.js"` with `"dist/adapters/vscode/model-intent.js"` and added companion contracts in `.evcrate/targets/vscode/manifest.json`.
  - Regenerated target build manifests (`.evcrate/build-manifest*.json`).
- Verification outcome:
  - `tests/manifests/adapter-runtime-identity.test.mjs` passed both tests in 253.90 ms.
  - `npm run test:build-generation` progressed from 73 pass / 2 fail to 75 pass / 0 fail.
  - `npm test` compound run completed successfully with exit code 0.

---

## 4. Observations & Critical Items

1. **Untracked Replacement Files (Delivery Blocker):**
   - The 17 published `.agent.md` files in `.evcrate/source/.evcrate-vscode/com.github.copilot/agents/` and `model-map.json` were deleted.
   - Newly generated replacement files:
     - `.evcrate/source/.evcrate-vscode/evcrate/agent-intent.json`
     - `.evcrate/source/.evcrate-vscode/evcrate/agent-templates/` (17 template files)
   - These are currently untracked (`??`). A fresh clone will fail tests unless these files are tracked/committed.
2. **Clean-Artifact Reproducibility:**
   - Both `npm run build` and `npm run build:clean` should be exercised alongside `npm run generate:all` to ensure no lingering untracked dependencies exist in `dist/`.

---

## Unresolved Questions

1. Will the untracked templates (`.evcrate/source/.evcrate-vscode/evcrate/agent-templates/*.md`) and `agent-intent.json` be staged/committed directly in Phase 03 or in an upcoming integration phase?
2. Are there remaining CI environments running on Windows that require explicit matrix validation for the skipped Windows native context test suite?
