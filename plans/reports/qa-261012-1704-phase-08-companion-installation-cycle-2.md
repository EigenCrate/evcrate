# QA Test Execution Report: Phase 08 Consented Postpublish Installation (Review Cycle 2)

**Date:** 2026-10-12  
**Plan:** `plans/261011-2349-vscode-runtime-model-bindings/phase-08-consented-postpublish-installation.md`  
**Target:** CLI companion installation, arguments, dispatch, vscode-companion contracts after Review Cycle 1 fixes  

---

## Sequential Thinking Analysis

### Thought 1/6: Scope & Review Cycle 1 Fixes Baseline
- Cycle 1 fixes under verification:
  1. Uncaught post-commit exception guard added in `coordinateVscodeCompanionInstallation` (catches unexpected errors, emits `install-notice-v1` stderr notice, preserves committed stdout, returns exit code 5 when requested).
  2. `extensionsDirectory` validation requires absolute path (`isAbsolute`), failing closed on missing/untrusted directories.
  3. Post-install verification re-probes extension list (`--list-extensions --show-versions`) to verify extension presence before declaring success.
  4. `--list-extensions` probe failure fails closed (status: `failed`, exit 5 when requested).
  5. Staged file opened via safe file descriptor with `fstatSync` regular file verification.
  6. Staged path and proposal launch flag (`--enable-proposed-api=eigencrate.evcrate-model-bindings`) displayed in interactive prompt.
  7. Notice reason sanitized and bounded via `sanitizeReason` (strips ANSI escapes, non-printable characters, bounded to 512 chars).
  8. 3 new tests added to `tests/cli/vscode-companion-installation.test.mjs` (14 tests total).

### Thought 2/6: Build & Compilation Verification
- `npm run build`: Exit 0 (1.42s). Clean TypeScript compilation to `dist/`.
- `npm run build:vscode-companion`: Exit 0 (1.89s with check). Generates VSIX (45674 bytes, sha256 `dc40781...`), descriptor with buildIdentity `7f809ba...`, and 34-input source receipt.
- `npm run check:vscode-companion`: Exit 0. Companion artifacts verified.
- `npm run release:check`: Exit 0. Validates runtime closure with zero external dependencies.
- `npm run distribute:check`: Exit 0. Projections verified in sync.
- `npm run lint`: Note: Command only executes `echo "Linting passed"`. Does not perform static analysis.

### Thought 3/6: Primary Phase 08 Suite Execution
- Executed all 4 primary suites via `node --test`:
  - `tests/cli/vscode-companion-installation.test.mjs`: 14/14 pass (219ms). Covers: skip on unselected target, dry-run skip, explicit skip notice, non-interactive skip, unsupported remote context exit 5, tampered VSIX exit 5, successful install via processRunner, already-installed with verified build identity, matching version with unverified build identity reporting `manual-setup-required` (exit 5), user prompt decline, processRunner failure exit 5, post-install re-probe verification failure exit 5, list-extensions probe failure exit 5, uncaught exception guard exit 5.
  - `tests/cli/arguments.test.mjs`: 12/12 pass (49ms). Parses and validates companion flags, editor/profile options, mutual exclusivity, eligibility constraints.
  - `tests/cli/dispatch.test.mjs`: 11/11 pass (5.46s). Confirms stdout preservation of committed publication, stderr `install-notice-v1` emission, exit code 5 override on requested failure.
  - `tests/vscode-companion/contracts.test.mjs`: 4/4 pass (46ms). Strict parity of extension contracts, canonical schemas, layout verifier.
- Primary Phase 08 pass rate: 41/41 (100%).

### Thought 4/6: Adjacent & Regression Suite Execution
- `tests/vscode-companion/*.test.mjs` (all companion suites): 41/41 pass (475ms).
- `tests/distribution/vscode-companion-vsix.test.mjs`: 12/12 pass (693ms).
- `tests/adapters/vscode-*.test.mjs`: 98/98 pass (1.92s).
- `tests/distribution/publication-vscode-*.test.mjs`: 5/5 pass (8.87s).
- `npm run test:cli`: 82 pass, 0 fail, 1 skipped (Windows reparse on Linux) (25.53s). Pass count increased from 79 to 82 matching the 3 new companion tests.
- `tests/installers/*.test.mjs`: 28/28 pass (1.47s).
- `tests/distribution/release-and-cutover.test.mjs`: 7/7 pass (253.4s).
- `tests/distribution/validation-and-rollout.test.mjs`: 6/6 pass (26.5s) when run independently.
- `tests/distribution/private-unpack-rollout.test.mjs`: 5/5 pass (50.9s).
- `npm run test:protocol`, `test:primitives`, `test:scopes`, `test:registry`: 78/78 pass.

### Thought 5/6: Investigation of Test Anomalies & Failures
1. **Concurrent Suite Collision (`assertOwners` failure):**
   - When `release-and-cutover.test.mjs` and `validation-and-rollout.test.mjs` executed in parallel in a single multi-argument `node --test` invocation, `unmanaged existing content in user HOME is preserved across publication apply` failed with `ControlPlaneError: Publication failed` at `assertOwners (dist/distribution/build-resolution.js:91:13)`.
   - Both suites pass 100% when run separately (as defined by sequential `package.json` scripts `npm run test:cutover` and `npm run test:validation-rollout`).
   - Root cause: `release-and-cutover.test.mjs` executes `prepack` / `build-manifests.mjs`, mutating workspace build manifest and target files concurrently while `validation-and-rollout.test.mjs` reads them.
2. **Qualification Scenario Failures:**
   - `tests/qualification/vscode-local-phase05-qualification.test.mjs` and `phase06-qualification.test.mjs` fail with `ENOENT: no such file or directory, open '.../.evcrate/source/.evcrate-vscode/com.github.copilot/agents/*.agent.md'`.
   - Files were moved to immutable templates under `evcrate/agent-templates/` during Phase 03; scenario runner scripts were not updated.
   - Note: Not part of `npm test` gate.
3. **DEP0190 Deprecation Warning:**
   - Warning emitted during `npm run test:cli`: `Passing args to a child process with shell option true...`.
   - Traced to `tests/cli/package-smoke.test.mjs:15,32`. No `shell: true` in production code.

### Thought 6/6 [FINAL]: Synthesizing Findings
- Verification confirms all Review Cycle 1 fixes implemented and exercised by unit and integration tests.
- 100% pass across all Phase 08 targeted tests (41/41) and core suites.
- Untracked files noted: `src/cli/vscode-companion-installation.ts`, `src/cli/vscode-companion-prompt.ts`, `tests/cli/vscode-companion-installation.test.mjs` must be staged before commit.

---

## Test Results Overview

| Suite Category | Target Files / Commands | Total | Passed | Failed | Skipped | Pass Rate |
|---|---|---|---|---|---|---|
| **Phase 08 Primary** | `vscode-companion-installation`, `arguments`, `dispatch`, `contracts` | 41 | 41 | 0 | 0 | **100%** |
| **All Companion Tests** | `tests/vscode-companion/*.test.mjs` | 41 | 41 | 0 | 0 | **100%** |
| **Companion VSIX Dist** | `tests/distribution/vscode-companion-vsix.test.mjs` | 12 | 12 | 0 | 0 | **100%** |
| **Full CLI Suite** | `npm run test:cli` (`tests/cli/*.test.mjs`, `tests/context/*.test.mjs`) | 83 | 82 | 0 | 1 | **98.8%** (100% Linux) |
| **VS Code Adapters** | `tests/adapters/vscode-*.test.mjs` | 98 | 98 | 0 | 0 | **100%** |
| **VS Code Publication** | `tests/distribution/publication-vscode-*.test.mjs` | 5 | 5 | 0 | 0 | **100%** |
| **Publication Batches** | `publication-apply`, `ownership`, `parity`, `plan`, `recovery`, `prune` | 81 | 81 | 0 | 0 | **100%** |
| **Installers (Linux)** | `tests/installers/*.test.mjs` | 28 | 28 | 0 | 0 | **100%** |
| **Cutover & Validation** | `npm run test:cutover`, `npm run test:validation-rollout` (sequential) | 13 | 13 | 0 | 0 | **100%** |
| **Private Unpack Rollout** | `npm run test:distribution:rollout` | 5 | 5 | 0 | 0 | **100%** |
| **Protocols & Primitives** | `test:protocol`, `test:primitives`, `test:scopes`, `test:registry` | 78 | 78 | 0 | 0 | **100%** |
| **Qualification** | `tests/qualification/vscode-local-*.test.mjs` | 17 | 15 | 2 | 0 | **88.2%** |

---

## Coverage Metrics (Phase 08 Focus Run)

Generated via `node --test --experimental-test-coverage` executing `vscode-companion-installation.test.mjs`, `arguments.test.mjs`, `dispatch.test.mjs`, and `contracts.test.mjs`:

| Component / Source File | Line Coverage | Branch Coverage | Function Coverage | Uncovered Paths |
|---|---|---|---|---|
| `src/cli/vscode-companion-installation.ts` | 81.45% | 82.30% | 77.78% | Non-machine notice formatting, error recovery edge-cases |
| `src/cli/arguments.ts` | 91.13% | 84.87% | 100.00% | Retired flag validations, multi-target edge combinations |
| `src/cli/types.ts` | 100.00% | 100.00% | 100.00% | None |
| `src/cli/vscode-companion-prompt.ts` | 46.97% | 50.00% | 50.00% | Interactive readline fallback (mocked via console port in tests) |
| `src/adapters/vscode/companion-cli-contracts.ts` | 80.28% | 78.31% | 100.00% | Invalid option contract boundary variations |
| `src/adapters/vscode/companion-package-contracts.ts` | 81.08% | 50.00% | 100.00% | Rare descriptor schema mutation branches |
| `src/cli/dispatch.ts` | 57.46% | 62.62% | 79.41% | Non-publish CLI routes (scopes, imports, recovery) |

---

## Failed Tests & Execution Anomalies

### 1. `tests/qualification/vscode-local-phase05-qualification.test.mjs`
- **Error:** `ENOENT: no such file or directory, open '.../.evcrate/source/.evcrate-vscode/com.github.copilot/agents/evc-scout.agent.md'`
- **Location:** `scripts/qualification/scenario-phase05-native-delegation.mjs:278:31`
- **Cause:** Scenario reads obsolete static Copilot agent path removed during Phase 03 cutover to immutable templates (`agent-templates/`). Not part of standard `npm test`.

### 2. `tests/qualification/vscode-local-phase06-qualification.test.mjs`
- **Error:** `ENOENT: no such file or directory, open '.../.evcrate/source/.evcrate-vscode/com.github.copilot/agents/evc-docs-manager.agent.md'`
- **Location:** `scripts/qualification/scenario-phase06-docs-workflow.mjs:413:37`
- **Cause:** Identical to Phase 05 scenario: obsolete static agent path.

### 3. Concurrent Multi-Suite Collision (`tests/distribution/validation-and-rollout.test.mjs`)
- **Error:** `ControlPlaneError: Publication failed` at `assertOwners (dist/distribution/build-resolution.js:91:13)`
- **Condition:** Occurred only when running `release-and-cutover.test.mjs` and `validation-and-rollout.test.mjs` together in one `node --test` command across shared CPUs.
- **Resolution:** Both suites pass 100% when run sequentially per `package.json` targets (`npm run test:cutover` followed by `npm run test:validation-rollout`). No code change or assertion weakening warranted.

---

## Performance Metrics

- `tests/cli/vscode-companion-installation.test.mjs`: 219 ms (14 tests, avg 15.6 ms/test)
- `tests/cli/arguments.test.mjs`: 49 ms (12 tests, avg 4.1 ms/test)
- `tests/cli/dispatch.test.mjs`: 5,456 ms (11 tests, avg 496 ms/test)
- `tests/vscode-companion/contracts.test.mjs`: 46 ms (4 tests, avg 11.5 ms/test)
- `tests/vscode-companion/*.test.mjs`: 475 ms (41 tests, avg 11.6 ms/test)
- `tests/distribution/vscode-companion-vsix.test.mjs`: 693 ms (12 tests, avg 57.8 ms/test)
- `tests/adapters/vscode-*.test.mjs`: 1,918 ms (98 tests, avg 19.6 ms/test)
- `tests/distribution/publication-vscode-*.test.mjs`: 8,869 ms (5 tests, avg 1.77 s/test)
- `npm run test:cli`: 25,535 ms (83 tests)

---

## Build Status

- `npm run build`: Success (Exit 0, 1.42s). TypeScript compiles cleanly.
- `npm run build:vscode-companion`: Success (Exit 0, 1.89s). VSIX, descriptor, source receipt emitted.
- `npm run check:vscode-companion`: Success (Exit 0). Companion artifacts match verified checkout state.
- `npm run release:check`: Success (Exit 0, 0.45s). Zero unapproved external dependencies.
- `npm run distribute:check`: Success (Exit 0, 12.87s). Projections verified in sync.
- `npm run lint`: Warning: Inert script (`echo "Linting passed"`). No ESLint/Biome execution configured.

---

## Critical Issues & Implementation Risks

1. **Untracked Delivery Files:**
   - `src/cli/vscode-companion-installation.ts`
   - `src/cli/vscode-companion-prompt.ts`
   - `tests/cli/vscode-companion-installation.test.mjs`
   - These files exist in the working directory but remain untracked in git. Must be staged (`git add`) prior to commit.
2. **Qualification Script Bitrot:**
   - `scripts/qualification/scenario-phase05-native-delegation.mjs` and `scenario-phase06-docs-workflow.mjs` fail due to removed static paths. Requires remediation in Phase 09.
3. **Node Deprecation Warning DEP0190:**
   - `spawnSync('npm', ..., { shell: true })` in `tests/cli/package-smoke.test.mjs:15,32` produces runtime warning. Not present in production code paths.

---

## Recommendations

1. **Stage Untracked Files:** Ensure `src/cli/vscode-companion-installation.ts`, `src/cli/vscode-companion-prompt.ts`, and `tests/cli/vscode-companion-installation.test.mjs` are staged with modified files.
2. **Preserve Sequential Test Execution:** Maintain `--test-concurrency=1` or separate script boundaries for distribution/rollout suites in CI to prevent manifest contention.
3. **Migrate Qualification Scripts:** In Phase 09, update scenario scripts to read agent templates from `evcrate/agent-templates/*.md`.
4. **Remove `shell: true` in Tests:** Update `tests/cli/package-smoke.test.mjs` to invoke `npm` without `shell: true` to eliminate Node DEP0190 warnings.

---

## Next Steps

1. Stage all Phase 08 implementation and test files.
2. Hand off clean Phase 08 deliverables to Main agent for commit.
3. Advance to Phase 09 (Integrated qualification).

---

## Unresolved Questions

1. Should `npm run lint` be wired to an actual linter (e.g. ESLint or Biome) or remain an echo placeholder?
2. Should qualification scenarios under `scripts/qualification/` be maintained as part of automated CI gates or remain offline manual verification scripts?
