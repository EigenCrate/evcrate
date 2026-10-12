# QA Test Execution Report: Phase 08 Consented Postpublish Installation

**Date:** 2026-10-12  
**Plan:** `plans/261011-2349-vscode-runtime-model-bindings/phase-08-consented-postpublish-installation.md`  
**Target:** CLI companion installation, arguments, dispatch, vscode-companion contracts  

---

## Sequential Thinking Analysis

### Thought 1/6: Scope & Baseline Identification
- Target deliverables for Phase 08:
  - `src/cli/arguments.ts`: `--install-vscode-companion`, `--no-install-vscode-companion`, `--vscode-editor`, `--vscode-profile`
  - `src/cli/types.ts`: companion installation CLI options, console port, and exit seams
  - `src/cli/vscode-companion-prompt.ts`: default interactive TTY prompt handler
  - `src/cli/vscode-companion-installation.ts`: post-publish coordinator for VSIX staging and process runner invocation
  - `src/cli/dispatch.ts`: integration after committed publication; exit code 5 override on requested install failure
  - `src/adapters/vscode/configuration-activation-guide.ts`: activation guide text updates
- Primary test suites:
  - `tests/cli/vscode-companion-installation.test.mjs`
  - `tests/cli/arguments.test.mjs`
  - `tests/cli/dispatch.test.mjs`
  - `tests/vscode-companion/contracts.test.mjs`

### Thought 2/6: Build & Compilation Verification
- Ran TypeScript build pipeline:
  - `npm run build`: Exit 0 (1.56s), no errors.
  - `npm run build:vscode-companion`: Exit 0 (1.73s), VSIX generated (45674 bytes, sha256 `dc40781...`), descriptor and 34-input source receipt emitted.
  - `npm run check:vscode-companion`: Exit 0 (0.35s), verified development-checkout companion artifacts.

### Thought 3/6: Primary Phase 08 Suite Execution
- Executed all 4 primary suites via `node --test`:
  - `tests/cli/vscode-companion-installation.test.mjs`: 11/11 pass (212ms)
  - `tests/cli/arguments.test.mjs`: 12/12 pass (50ms)
  - `tests/cli/dispatch.test.mjs`: 11/11 pass (13.46s)
  - `tests/vscode-companion/contracts.test.mjs`: 4/4 pass (137ms)
- Combined primary pass rate: 38/38 (100% pass rate).

### Thought 4/6: Adjacent & Regression Suite Execution
- Executed companion and VS Code suites:
  - `tests/vscode-companion/*.test.mjs` (all companion test files): 41/41 pass (713ms).
  - `tests/distribution/vscode-companion-vsix.test.mjs`: 12/12 pass (784ms).
  - `tests/adapters/vscode-*.test.mjs` (all VS Code adapter tests): 98/98 pass (1.93s).
  - `tests/distribution/publication-vscode-*.test.mjs`: 5/5 pass (9.65s).
  - `npm run test:cli`: 79 pass, 0 fail, 1 skipped (Windows-only reparse test on Linux) (29.06s).

### Thought 5/6: Discrepancy & Anomaly Investigation
- Full publication suite (`npm run test:publication`): Timed out at 300s under sequential `--test-concurrency=1` during `publication-phase08-prune-and-upgrade.test.mjs`. Scope was interrupted; targeted VS Code publication tests pass.
- Qualification tests (`tests/qualification/vscode-local-*.test.mjs`): 15 pass, 2 fail.
  - Failures: `vscode-local-phase05-qualification.test.mjs` and `vscode-local-phase06-qualification.test.mjs`.
  - Cause: Scripts reference legacy static agent path `.evcrate/source/.evcrate-vscode/com.github.copilot/agents/*.agent.md` deleted during Phase 03 cutover to immutable templates (`agent-templates/*.md`).
- Node warning `[DEP0190] DeprecationWarning: Passing args to a child process with shell option true`:
  - Traced to `tests/cli/package-smoke.test.mjs` lines 15 & 32 invoking `spawnSync('npm', [...], { shell: true })`.
  - Verified `src/cli/vscode-companion-installation.ts` uses `processRunner.run({ executable, args })` which enforces `shell: false`.

### Thought 6/6 [FINAL]: Synthesizing Findings, Implementation Risks & Recommendations
- Advisor consultation identified two implementation risks:
  1. `findEditorOnPath()` uses `lstatSync(candidate).isFile()`, which rejects standard symlinked `code` launchers.
  2. `mkdtempSync()` for stageDir is outside the inner `try` block; unhandled FS exceptions could escape without `install-notice-v1` stderr notice.
- Formulate concise, rigorous report with metrics, failures, critical risks, and actionable recommendations.

---

## Test Results Overview

| Suite Category | Files / Targets | Tests Run | Passed | Failed | Skipped | Pass Rate |
|---|---|---|---|---|---|---|
| **Phase 08 Primary** | `vscode-companion-installation`, `arguments`, `dispatch`, `contracts` | 38 | 38 | 0 | 0 | **100%** |
| **All Companion Tests** | `tests/vscode-companion/*.test.mjs` | 41 | 41 | 0 | 0 | **100%** |
| **Companion VSIX Dist** | `tests/distribution/vscode-companion-vsix.test.mjs` | 12 | 12 | 0 | 0 | **100%** |
| **Full CLI Suite** | `tests/cli/*.test.mjs`, `tests/context/*.test.mjs` | 80 | 79 | 0 | 1 | **98.75%** (100% on Linux) |
| **VS Code Adapters** | `tests/adapters/vscode-*.test.mjs` | 98 | 98 | 0 | 0 | **100%** |
| **VS Code Publication**| `tests/distribution/publication-vscode-*.test.mjs` | 5 | 5 | 0 | 0 | **100%** |
| **Full Publication** | `npm run test:publication` | 42+ | 41+ | 0 | 0 | **TIMEOUT (300s)** |
| **Qualification** | `tests/qualification/vscode-local-*.test.mjs` | 17 | 15 | 2 | 0 | **88.24%** |

---

## Coverage Metrics (Selected Four-Suite Run)

Metrics generated via `node --test --experimental-test-coverage` exercising `vscode-companion-installation.test.mjs`, `arguments.test.mjs`, `dispatch.test.mjs`, and `contracts.test.mjs`:

| Component / File | Line Coverage | Branch Coverage | Function Coverage | Uncovered Paths Notes |
|---|---|---|---|---|
| `src/cli/arguments.ts` | 91.13% | 84.87% | 100.00% | Edge-case argument combinations, multi-target validation |
| `src/cli/vscode-companion-installation.ts` | 77.25% | 80.22% | 80.00% | Human-readable notice formatting, PATH discovery fallback |
| `src/cli/vscode-companion-prompt.ts` | 46.97% | 50.00% | 50.00% | Default interactive `readline` confirmation (mocked in tests) |
| `src/cli/dispatch.ts` | 57.46% | 62.62% | 79.41% | Non-publish CLI routes (resources, imports, recovery) |
| `src/cli/types.ts` | 100.00% | 100.00% | 100.00% | Type interfaces and schemas |
| `src/adapters/vscode/companion-cli-contracts.ts` | 80.28% | 78.05% | 100.00% | Notice field validation edge-cases |
| `src/adapters/vscode/companion-package-contracts.ts` | 81.08% | 50.00% | 100.00% | Descriptor validation branches |

---

## Failed Tests & Timeouts

### 1. `tests/qualification/vscode-local-phase05-qualification.test.mjs`
- **Error:** `ENOENT: no such file or directory, open '.../.evcrate/source/.evcrate-vscode/com.github.copilot/agents/evc-scout.agent.md'`
- **Stack Trace:**
  ```
  at Object.readFileSync (node:fs:441:20)
  at runPhase05Qualification (scripts/qualification/scenario-phase05-native-delegation.mjs:278:31)
  at TestContext.<anonymous> (tests/qualification/vscode-local-phase05-qualification.test.mjs:42:24)
  ```
- **Root Cause:** Phase 03 replaced static Copilot agent markdown files under `com.github.copilot/agents/` with immutable templates under `evcrate/agent-templates/`. The legacy qualification scenario script was not updated to read from template locations.

### 2. `tests/qualification/vscode-local-phase06-qualification.test.mjs`
- **Error:** `ENOENT: no such file or directory, open '.../.evcrate/source/.evcrate-vscode/com.github.copilot/agents/evc-docs-manager.agent.md'`
- **Stack Trace:**
  ```
  at Object.readFileSync (node:fs:441:20)
  at runPhase06DocsWorkflow (scripts/qualification/scenario-phase06-docs-workflow.mjs:413:37)
  at TestContext.<anonymous> (tests/qualification/vscode-local-phase06-qualification.test.mjs:42:24)
  ```
- **Root Cause:** Identical to Phase 05: references deleted static agent path.

### 3. Full Publication Test Suite (`npm run test:publication`)
- **Status:** Interrupted / timed out after 300 seconds.
- **Interrupted File:** `tests/distribution/publication-phase08-prune-and-upgrade.test.mjs`
- **Root Cause:** Sequential `--test-concurrency=1` running 11 heavy publication suites exceeds 300s budget. Focused VS Code project and HOME publication suites (`publication-vscode-project.test.mjs` and `publication-vscode-home.test.mjs`) pass in 9.6s.

---

## Performance Metrics

- `tests/cli/vscode-companion-installation.test.mjs`: 212 ms (11 tests, avg 19.3 ms/test)
- `tests/cli/arguments.test.mjs`: 50 ms (12 tests, avg 4.2 ms/test)
- `tests/cli/dispatch.test.mjs`: 13,457 ms (11 tests)
  - Slowest test: `request-file distribution publication uses compatibility orchestration` (4,543 ms)
  - Companion exit 5 override test: `dispatch preserves committed publication stdout...` (4,379 ms)
  - Pure TypeScript distribution test: (4,131 ms)
- `tests/vscode-companion/contracts.test.mjs`: 137 ms (4 tests, avg 34.3 ms/test)
- `tests/vscode-companion/*.test.mjs`: 713 ms (41 tests, avg 17.4 ms/test)
- `tests/adapters/vscode-*.test.mjs`: 1,928 ms (98 tests, avg 19.7 ms/test)

---

## Build Status

- `npm run build`: Success (Exit 0, 1.56s). TypeScript compiled cleanly to `dist/`.
- `npm run build:vscode-companion`: Success (Exit 0, 1.73s). VSIX and descriptor generated.
- `npm run check:vscode-companion`: Success (Exit 0, 0.35s). Companion artifacts verified.
- **Warning Noted:** `[DEP0190] DeprecationWarning: Passing args to a child process with shell option true...` observed during `npm run test:cli`. Traced directly to `tests/cli/package-smoke.test.mjs:15,32`. No usage of `shell: true` exists in the companion installation runtime.

---

## Critical Issues & Implementation Risks

1. **Launcher Symlink Exclusion in PATH Discovery:**
   - Location: `src/cli/vscode-companion-installation.ts:70-71`
   - Code: `lstatSync(candidate).isFile()`
   - Risk: On Unix/macOS, `/usr/local/bin/code` or `/usr/bin/code` is almost universally a symlink pointing to `/opt/VSCode/bin/code` or an App bundle. `lstatSync().isFile()` returns `false` for symlinks, failing automatic editor discovery on standard systems.
   - Fix: Use `statSync(candidate).isFile()` (or follow symlinks with canonicalization) and verify executable permissions via `fs.constants.X_OK`.

2. **Uncontained Temporary Directory Allocation:**
   - Location: `src/cli/vscode-companion-installation.ts:272`
   - Code: `const stageDir = mkdtempSync(...)` sits immediately before `try { ... } finally { rmSync(stageDir) }`.
   - Risk: If `mkdtempSync` throws (`ENOSPC`, permission denied in `tmpdir`), the exception escapes uncaught from `coordinateVscodeCompanionInstallation`. In `dispatch.ts`, this would prevent emitting `install-notice-v1` on stderr and convert a committed publication into an unhandled CLI crash envelope.
   - Fix: Wrap `mkdtempSync` in try-catch to emit `status: 'failed'`, exit code 5 (when requested), and preserve committed stdout.

3. **Qualification Scenario Bitrot:**
   - `scripts/qualification/scenario-phase05-native-delegation.mjs` and `scenario-phase06-docs-workflow.mjs` are broken due to Phase 03 static agent deletion. They are not part of `npm test`, but cause failures when running `tests/qualification/`.

---

## Recommendations

1. **Resolve Launcher Symlinks:** Update `findEditorOnPath` to resolve symlinks (`realpathSync` / `statSync`) and verify executable access (`accessSync(..., constants.X_OK)`). Add unit test for symlinked binary.
2. **Contain Postcommit FS Exceptions:** Enclose `mkdtempSync` and stage creation in try-catch to guarantee exit 5 and `install-notice-v1` stderr notice on disk full / staging failure.
3. **Migrate Qualification Scripts:** Update `scenario-phase05-native-delegation.mjs` and `scenario-phase06-docs-workflow.mjs` to target `.evcrate-vscode/evcrate/agent-templates/*.md` instead of obsolete `com.github.copilot/agents/*.agent.md`.
4. **Partition Publication Test Suite:** Split `test:publication` into smaller grouped jobs or parallel chunks in `package.json` to avoid 300s single-process test timeouts.
5. **Clean Package Smoke Shell Option:** In `tests/cli/package-smoke.test.mjs`, remove `shell: true` from `spawnSync('npm', ...)` to eliminate Node DEP0190 deprecation warning.

---

## Next Steps

1. Review Phase 08 code changes with implementation owner addressing the two identified risks (`findEditorOnPath` symlink support, `mkdtempSync` exception containment).
2. Update qualification scenarios to match Phase 03 template directory structure.
3. Proceed to Phase 09 full acceptance matrix and native qualification.

---

## Unresolved Questions

1. Should `findEditorOnPath` support platform-specific snap/flatpak paths (e.g. `/var/lib/flatpak/exports/bin/com.visualstudio.code`) or remain restricted to `$PATH`?
2. Should `test:publication` be split into scoped targets (e.g. `test:publication:unit`, `test:publication:e2e`) to fit within standard CI/test timeouts?
