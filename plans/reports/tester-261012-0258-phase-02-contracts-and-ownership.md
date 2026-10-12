# Phase 02 Verification Report — Contracts & Ownership (Post-Review Cycle 1)

- **Date:** 2026-10-12
- **Phase:** `plans/261011-2349-vscode-runtime-model-bindings/phase-02-contracts-and-ownership.md`
- **Verdict:** **PASS — all requested offline verification gates and Review Cycle 1 contract/branch assertions pass; live native release qualification remains deferred** (101/101 tests pass; 0 failed, 0 skipped, 0 cancelled, 0 todo; build, runtime closure, and distribution checks completed without reported errors)

## 1. Test Results Overview

| Suite | Command | Total | Pass | Fail | Skip | Cancelled | Todo | Duration |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| Companion Contracts (Post-Review Cycle 1) | `node --test tests/vscode-companion/contracts.test.mjs` | 4 | 4 | 0 | 0 | 0 | 0 | 49.20 ms |
| VS Code Adapter Suite | `node --test tests/adapters/vscode-*.test.mjs` | 97 | 97 | 0 | 0 | 0 | 0 | 1,910.38 ms |
| **Combined Total** | — | **101** | **101** | **0** | **0** | **0** | **0** | **1,959.58 ms** |

## 2. Build, Closure & Distribution Status

| Verification Gate | Command | Status | Exercised Evidence |
|---|---|---|---|
| Core TypeScript Build | `npm run build` | **PASS** | `node scripts/build-typescript.mjs -p tsconfig.json` completed without reported diagnostics. |
| Companion Extension Build | `node scripts/build-typescript.mjs -p extensions/vscode-model-bindings/tsconfig.json` | **PASS** | Extension TypeScript compilation completed without reported diagnostics. |
| Runtime Closure Check | `npm run release:check` | **PASS** | `validateRuntimeClosure(process.cwd())` passed without error. |
| Distribution Check | `npm run distribute:check` | **PASS** | Returned `status: "ok"`, `operation: "distribute.check"`, `protocol: "evcrate-resource-control"`, `protocolVersion: 1`. |

## 3. Verified Contract & Review Cycle 1 Coverage (`tests/vscode-companion/contracts.test.mjs`)

- **Extension Manifest Identity & Core/Extension Constant Parity (#1):**
  - Verifies `publisher.name === VSCODE_EXTENSION_ID` (`eigencrate.evcrate-model-bindings`), `EXT_ID === VSCODE_EXTENSION_ID`, `PINNED_HOST_TUPLE` deep-equals `PINNED_VSCODE_HOST_TUPLE`, `CANONICAL_TIERS` deep-equals `VSCODE_CANONICAL_TIERS`, `STORAGE_AND_SOURCE_BOUNDS.maxActorsPerRoot === MAX_ACTORS_PER_ROOT` (`512`), `STORAGE_AND_SOURCE_BOUNDS.maxTemplateBytes === MAX_TEMPLATE_BYTES` (`1,048,576`), `pkg.version === rootPkg.version` (`2.11.0`), `pkg.engines.vscode === "1.140.0"`, `extensionKind: ["workspace"]`, `enabledApiProposals: ["chatPromptFiles"]`, `activationEvents: ["onStartupFinished"]`, `capabilities.virtualWorkspaces.supported === false`, and 5 contributed commands.
- **Canonical Intent, Round-Trip & Audit Schemas (#2):**
  - `resolveCanonicalModelIntent`: `undefined`/`"inherit"` -> `{ mode: "inherit", tier: null }`, `"opus"` -> `{ mode: "tier", tier: "opus" }`, rejects concrete model `"claude-3-opus"` and `42` (`CONTRACT_INVALID`).
  - `validateAgentIntentManifest` (`evcrate-vscode-agent-intent-v1`): full canonical round-trip deep-equality `assert.deepEqual(validateAgentIntentManifest(validManifest), validManifest)`, rejects legacy `evcrate-vscode-model-map-v1` (`SCHEMA_UNSUPPORTED`), rejects `../evc-planner.md` (`PATH_UNSAFE`), and rejects malformed digest `not-a-sha256` (`HASH_MISMATCH`).
  - `validateAgentToolAuditV2` (`evcrate-vscode-agent-tool-audit-v2`): accepts valid schema, verifies defensive cloning (`validatedAudit.agents['evc-planner'] !== validAudit.agents['evc-planner']`), and rejects `nativeModel` field (`CONTRACT_INVALID`).
- **Companion Descriptor, Source Receipt, Layout Verifier & CLI Install Contracts (#3):**
  - `validateCompanionDescriptor` (`evcrate-vscode-companion-descriptor-v1`) and `validateCompanionSourceReceipt` (`evcrate-vscode-companion-source-receipt-v1`, `BUILD_IDENTITY_IMMUTABLE_VIOLATION`, and `PATH_UNSAFE` on `./bad/path.ts`).
  - `verifyCompanionLayoutContract`: verifies `development-checkout` (`checkoutFreshnessVerified: true`), `packed-package` (`checkoutFreshnessVerified: false`), and missing input rejection (`MISSING_CHECKOUT_INPUT`).
  - `validateCompanionCliOptions`: rejects conflicting flags and ineligible `recover` command (`USAGE_INVALID`); detects remote SSH context (`remoteContextUnsupported: true`).
  - `validateCompanionInstallNotice`: enforces exit code `5` on `manual-setup-required` when `requested: true` and rejects exit code `0` (`CONTRACT_INVALID`).
- **URI Allowlist, Root Precedence, Cross-Scope Bindings, Selector Collision & Storage Bounds (#4):**
  - `validateLocalRootUri`: normalizes percent-encoded `file://` strings and `{ scheme: "file", path }` objects to canonical root identity; rejects `vscode-remote://` and `wsl://` (`UNSUPPORTED_REMOTE_AUTHORITY`) and percent-encoded traversal `%2e%2e` (`PATH_UNSAFE`).
  - `resolveInstallationRoot`: enforces `WORKSPACE_UNTRUSTED` (even when `projectRoots: []` and `homeRoot` is valid), `PROJECT_INSTALLATION_INVALID` (no silent fallback to valid HOME), `MULTI_ROOT_SELECTION_REQUIRED`, and explicit multi-root selection.
  - `formatCatalogSelector`, `resolveCatalogModelSelector`, & `validateBindingsV1`: verifies `<name> (<vendor>)` formatting, duplicate `(vendor, name)` rejection (`SELECTOR_AMBIGUOUS`), missing model (`MODEL_NOT_FOUND`), and `>64 KiB` limit (`BOUNDS_EXCEEDED`).
  - `resolveEffectiveActorBinding`: verifies `user.actor` over `root.tier`, explicit root actor `{ kind: "inherit" }` (`renderedSelector: null`), clearing root overrides revealing `user.tier`, `root.tier` resolution, `TIER_UNBOUND` withholding, and `canonical.inherit` bypassing tier bindings.
  - Storage & Diagnostics: verifies `buildGenerationStoragePath`, `evaluateStorageBudget` (`CONTRACT_INVALID` on `NaN`/negative inputs and `STORAGE_BUDGET_EXCEEDED` on cap exhaustion), `canReclaimGeneration` (`false` across distinct instances), and defensive cloning in `validateRuntimeDiagnosticsV1` (`validatedDiag !== diagInput`).
- **Modularization Hygiene:** All 9 Phase 02 files are `<= 195` LOC (`model-intent.ts`: 194, `companion-package-contracts.ts`: 187, `companion-cli-contracts.ts`: 195, `package.json`: 56, `vscode.proposed.chatPromptFiles.d.ts`: 71, `runtime-contracts.ts`: 194, `diagnostics-contracts.ts`: 146, `contracts.ts`: 172, `contracts.test.mjs`: 191).

## 4. Failed Tests

- None (`0` failures).

## 5. Performance Metrics

- `tests/vscode-companion/contracts.test.mjs`: `49.20 ms` total (`0.80 ms`–`1.23 ms` per test).
- `tests/adapters/vscode-*.test.mjs`: `1,910.38 ms` total; slowest tests are `vscode-projection: complete end-to-end build and validation` (`1,714.93 ms`) and `vscode-hooks: subprocess execution of local-hook-bridge.cjs` (`534.38 ms`).

## 6. Critical Issues

- None observed in offline verification gates; live native release qualification remains deferred per user gate amendment below.

## 7. Recommendations & Next Steps

1. Proceed with Phase 03 template/intent emission (`src/adapters/vscode/`) and Phase 04–06 companion extension runtime implementation (`extensions/vscode-model-bindings/src/`) within documented file ownership boundaries.

## Unresolved Questions

- Live native editor qualification remains deferred to Phase 09 real-case verification per the 2026-10-12 user gate amendment across all five areas recorded in `reports/interface-freeze.md`:
  1. Cross-source plugin hook attribution (`local-hook-bridge.cjs`) and relative reference/skill resolution for extension-attributed custom agents.
  2. Live host selector matching (`name (vendor)`), child subagent model inheritance, and explicit tool-model/cost precedence.
  3. Observed cached-selection race behavior when a selected agent is rebound or removed mid-session, and recovery via explicit agent reselection or window reload.
  4. Live multi-window / restored-chat URI retention behavior to calibrate the provisional storage budgets.
  5. Profile disabled-state preservation and installed build-identity inspection during CLI post-publish companion installation.
