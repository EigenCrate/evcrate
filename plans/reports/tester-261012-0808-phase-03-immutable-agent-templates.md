# Phase 03 Verification Report — Immutable Agent Templates

- **Date:** 2026-10-12
- **Phase:** `plans/261011-2349-vscode-runtime-model-bindings/phase-03-immutable-agent-templates.md`
- **Verdict:** **FAIL (Full Suite) / PASS (Phase 03 Focused & Adapter Gates)** — Gates 1–5 pass completely (247 test executions pass across Gate 3 focused suite [16] and Gate 4 adapter suite [231]; note focused suite is a subset of adapter suite plus companion contracts). Gate 6 (`npm test`) fails during `npm run test:build-generation` on `tests/manifests/adapter-runtime-identity.test.mjs` (2 failed tests out of 658 total executed across suites: 655 pass, 2 fail, 1 skipped) due to stale `dist/adapters/vscode/models.js` entry in `.evcrate/targets/vscode/manifest.json`.

## 1. Scope & Verification Commands

| Verification Gate | Command | Status | Details |
|---|---|---|---|
| 1. Core TypeScript Build | `npm run build` | **PASS** | `node scripts/build-typescript.mjs -p tsconfig.json` completed with 0 diagnostics (1.39s). |
| 2. Companion Compilation | `node scripts/build-typescript.mjs -p extensions/vscode-model-bindings/tsconfig.json` | **PASS** | Extension TypeScript compiled with 0 diagnostics (1.04s). |
| 3. Focused Test Suite | `node --test tests/adapters/vscode-configuration.test.mjs tests/adapters/vscode-resource-projection.test.mjs tests/vscode-companion/contracts.test.mjs` | **PASS** | 16 tests run, 16 passed, 0 failed, 0 skipped (1,762.64 ms). |
| 4. Adapter Test Suite | `npm run test:adapters` | **PASS** | 231 tests run, 231 passed, 0 failed, 0 skipped (31,133.86 ms). |
| 5. Distribution Check | `npm run distribute:check` | **PASS** | `operation: "distribute.check"`, `status: "ok"` (12.68s). |
| 6. Full Test Suite | `npm test` | **FAIL** | Fails in `test:build-generation` (2 failures in `adapter-runtime-identity.test.mjs`). Across all 14 individual test suites executed: 655 pass, 2 fail, 1 skipped (Windows CLI test). |

## 2. Test Results Overview

*Note: When running `npm test` as a single compound pipeline, execution stops at `test:build-generation` on the first test failure. To ensure exhaustive QA accounting across all target domains, downstream suites (`test:integration` through `test:distribution:rollout`) were executed individually to confirm no additional latent failures exist.*

| Suite | Execution Context / Command | Total | Pass | Fail | Skip | Duration | Status |
|---|---|---:|---:|---:|---:|---:|---|
| Focused Suite (Gate 3) | `node --test tests/adapters/vscode-configuration.test.mjs tests/adapters/vscode-resource-projection.test.mjs tests/vscode-companion/contracts.test.mjs` | 16 | 16 | 0 | 0 | 1,762.64 ms | PASS |
| VS Code Adapter Suite (Gate 4) | `npm run test:adapters` | 231 | 231 | 0 | 0 | 31,133.86 ms | PASS |
| Protocol Suite | `npm run test:protocol` | 17 | 17 | 0 | 0 | 67.40 ms | PASS |
| CLI & Context Suite | `npm run test:cli` | 62 | 61 | 0 | 1 | 24,455.54 ms | PASS |
| Primitives & Manifests Suite | `npm run test:primitives` | 24 | 24 | 0 | 0 | 2,012.90 ms | PASS |
| Registry & Imports Suite | `npm run test:registry` | 32 | 32 | 0 | 0 | 608.30 ms | PASS |
| Scopes Suite | `npm run test:scopes` | 5 | 5 | 0 | 0 | 362.80 ms | PASS |
| Publication Suite | `npm run test:publication` | 118 | 118 | 0 | 0 | 270,523.09 ms | PASS |
| Build Generation Suite | `npm run test:build-generation` | 75 | 73 | 2 | 0 | 238,947.81 ms | **FAIL** |
| Integration Suite | `npm run test:integration` | 35 | 35 | 0 | 0 | 102,292.78 ms | PASS |
| Cutover Suite | `npm run test:cutover` | 7 | 7 | 0 | 0 | 46,223.79 ms | PASS |
| Validation & Rollout Suite | `npm run test:validation-rollout` | 6 | 6 | 0 | 0 | 59,772.08 ms | PASS |
| Release Suite | `npm run test:release` | 21 | 21 | 0 | 0 | 11,389.00 ms | PASS |
| Linux Installer Suite | `npm run test:installer:linux` | 28 | 28 | 0 | 0 | 1,520.17 ms | PASS |
| Distribution Rollout Suite | `npm run test:distribution:rollout` | 5 | 5 | 0 | 0 | 54,504.99 ms | PASS |
| **Full Suite Accounting (Gate 6)** | `npm test` (composite with downstream suites) | **658** | **655** | **2** | **1** | **~845 s** | **FAIL** |

## 3. Failed Tests Details

### Suite: `test:build-generation` -> `tests/manifests/adapter-runtime-identity.test.mjs`

1. **`a shared adapter helper change invalidates every translated adapter and rejects the recorded build`**
   - File/Line: `tests/manifests/adapter-runtime-identity.test.mjs:72:1`
   - Duration: 39.96 ms
   - Error: `ENOENT: no such file or directory, lstat '/home/loidinh/WS/worktrees/evcrate-vscode-runtime-model-bindings/dist/adapters/vscode/models.js'`
   - Stack trace:
     ```
     Error: ENOENT: no such file or directory, lstat '/home/loidinh/WS/worktrees/evcrate-vscode-runtime-model-bindings/dist/adapters/vscode/models.js'
         at cpSyncFn (node:internal/fs/cp/cp-sync:56:13)
         at cpSync (node:fs:3158:3)
         at copiedTranslatedRuntime (tests/manifests/adapter-runtime-identity.test.mjs:44:7)
         at TestContext.<anonymous> (tests/manifests/adapter-runtime-identity.test.mjs:73:34)
     ```

2. **`a VS Code helper change invalidates only its adapter and rejects the recorded build`**
   - File/Line: `tests/manifests/adapter-runtime-identity.test.mjs:98:1`
   - Duration: 16.22 ms
   - Error: `ENOENT: no such file or directory, lstat '/home/loidinh/WS/worktrees/evcrate-vscode-runtime-model-bindings/dist/adapters/vscode/models.js'`
   - Stack trace:
     ```
     Error: ENOENT: no such file or directory, lstat '/home/loidinh/WS/worktrees/evcrate-vscode-runtime-model-bindings/dist/adapters/vscode/models.js'
         at cpSyncFn (node:internal/fs/cp/cp-sync:56:13)
         at cpSync (node:fs:3158:3)
         at copiedTranslatedRuntime (tests/manifests/adapter-runtime-identity.test.mjs:44:7)
         at TestContext.<anonymous> (tests/manifests/adapter-runtime-identity.test.mjs:99:34)
     ```

### Root Cause Analysis

- In Phase 03, `src/adapters/vscode/models.ts` and `.evcrate/source/.evcrate-vscode/evcrate/model-map.json` were removed per plan architecture: "Delete through source/regeneration: old map exports/implementation and generated `evcrate/model-map.json`; old static agent paths. Remove `models.ts` if now obsolete; no empty compatibility module."
- As a result, compiling TypeScript produces no `dist/adapters/vscode/models.js`.
- However, `.evcrate/targets/vscode/manifest.json` line 34 still lists `"dist/adapters/vscode/models.js"` in its `adapter_sources` array.
- When `adapter-runtime-identity.test.mjs` executes `copiedTranslatedRuntime()`, it iterates over `manifest.adapterSources` for each target and copies each source file from `packageRoot`. Because `dist/adapters/vscode/models.js` no longer exists, `cpSync` throws `ENOENT`.

## 4. Performance Metrics

- `npm run build`: 1.39s
- Companion build: 1.04s
- Focused suite (`16` tests): 1,762.64 ms
- Adapter suite (`231` tests): 31,133.86 ms
- Distribution check: 12.68s
- Publication suite (`118` tests): 270,523.09 ms (~4.5 min)
- Build generation suite (`75` tests): 238,947.81 ms (~4 min)
- Full suite total execution: ~845s (~14 min)

## 5. Critical Issues & Blocking Items

- **Stale Runtime Target Source Reference:** `.evcrate/targets/vscode/manifest.json` lists `"dist/adapters/vscode/models.js"` under `adapter_sources`. Following deletion of `src/adapters/vscode/models.ts` in Phase 03, the compiled file does not exist, causing `adapter-runtime-identity.test.mjs` to fail with `ENOENT`.
- **Target Specification vs Generated Build Manifests:** `.evcrate/targets/vscode/manifest.json` defines the target adapter sources consumed by the distribution and verification pipelines. Removing `"dist/adapters/vscode/models.js"` from this target manifest alters the targets tree hash (`.evcrate/targets`), which is tracked by all-target build manifests (`.evcrate/build-manifest*.json`). Per Phase 03 Step 9, repository regeneration should be refreshed atomically via `npm run generate:all` rather than manually editing build manifests.
- **Untracked Artifacts:** The newly emitted `.evcrate/source/.evcrate-vscode/evcrate/agent-intent.json` and 17 templates in `.evcrate/source/.evcrate-vscode/evcrate/agent-templates/*.md` are currently untracked in git. They must be tracked/committed alongside Phase 03 adapter changes.
## 6. Recommendations & Next Steps

1. Prune line 34 (`"dist/adapters/vscode/models.js"`) from `.evcrate/targets/vscode/manifest.json` so `adapter_sources` accurately reflects the post-Phase-03 runtime sources.
2. Re-run `npm run test:build-generation` (or `node --test tests/manifests/adapter-runtime-identity.test.mjs`) to verify green status.
3. Re-run `npm test` to verify full suite passes end-to-end.

## Unresolved Questions

1. Should `.evcrate/targets/vscode/manifest.json` be patched immediately in Phase 03 to prune `"dist/adapters/vscode/models.js"`, or is all manifest maintenance intentionally deferred until Phase 09 integrated qualification despite failing `adapter-runtime-identity.test.mjs`?
2. Does updating `.evcrate/targets/vscode/manifest.json` require a subsequent `npm run generate:all` run to recompute target tree hashes in `.evcrate/build-manifest*.json`?
