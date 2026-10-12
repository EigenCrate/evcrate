# Code Review Summary — Phase 09 Integrated Contract & Native Qualification

- **Date:** 2026-10-12
- **Phase:** `Phase 09 — Integrated contract and native qualification` (`plans/261011-2349-vscode-runtime-model-bindings/phase-09-integrated-qualification.md`)
- **Score:** **8.5 / 10**
- **Disposition:** Automated contract/package/CLI/extension-host fixes sound; review warnings remain; Phase 09 overall sign-off remains **BLOCKED** on interactive VS Code GUI picker & authenticated Copilot Chat inference rows.

---

### Scope
- **Files reviewed (25 Phase 09 target files + 6 regenerated manifest/artifact paths in worktree):**
  - Extension runtime & declarations (9):
    - `extensions/vscode-model-bindings/vscode.proposed.chatPromptFiles.d.ts`
    - `extensions/vscode-model-bindings/src/contracts.ts`
    - `extensions/vscode-model-bindings/src/installation-roots.ts`
    - `extensions/vscode-model-bindings/src/provider-registration.ts`
    - `extensions/vscode-model-bindings/src/extension.ts`
    - `extensions/vscode-model-bindings/src/template-watcher.ts`
    - `extensions/vscode-model-bindings/src/clear-commands.ts`
    - `extensions/vscode-model-bindings/src/configuration-commands.ts`
    - `extensions/vscode-model-bindings/src/diagnostics-display.ts`
  - Core CLI & package scripts (5):
    - `src/cli/process-runner.ts`
    - `src/cli/types.ts`
    - `src/cli/vscode-editor-launcher.ts`
    - `src/cli/vscode-companion-installation.ts`
    - `package.json`
  - Tests & harnesses (6):
    - `tests/vscode-companion/prerequisites-regressions.test.mjs`
    - `tests/vscode-companion/provider-runtime.test.mjs`
    - `tests/vscode-companion/refresh-test-harness.mjs`
    - `tests/vscode-companion/refresh-lifecycle.test.mjs`
    - `tests/adapters/vscode-session-state.test.mjs`
    - `tests/cli/vscode-companion-installation.test.mjs`
    - `tests/integration/vscode-installed-runtime.test.mjs`
  - Qualification & QA reports (5):
    - `plans/261011-2349-vscode-runtime-model-bindings/reports/integrated-qualification.md`
    - `plans/261011-2349-vscode-runtime-model-bindings/reports/native-qualification.md`
    - `plans/261011-2349-vscode-runtime-model-bindings/reports/support-matrix.md`
    - `plans/261011-2349-vscode-runtime-model-bindings/verification-matrix.md`
    - `plans/reports/tester-261012-2000-phase-09-integrated-qualification.md`
  - Regenerated artifacts excluded from manual source edits (6): `.evcrate/registry.json`, `.evcrate/build-manifest.json`, `.evcrate/build-manifest-vscode.json`, `.evcrate/source/.evcrate-vscode/evcrate/companion/evcrate-model-bindings-2.11.0.vsix`, `.evcrate/targets/vscode/files/evcrate/companion/{evcrate-model-bindings-2.11.0.vsix,package.json,source-receipt.json}`.
- **Lines of code analyzed:** ~3,450 LOC across source, tests, and qualification reports.
- **Review focus:** Security, performance, architecture, YAGNI/KISS/DRY, and strict separation of automated/isolated-host proof (`N-01`, `N-02`, `N-03`) vs blocked interactive GUI/live Copilot inference gates.

---

### Overall Assessment
Five real defects uncovered during isolated VS Code `1.140.0` qualification on Windows x64 were fixed cleanly without introducing `shell: true` execution or weakening fail-closed invariants:
1. `readHostRemoteAuthority(vscode.env)` reads stable `vscode.env.remoteName` before falling back to `vscode.env.remoteAuthority` inside `try/catch` (avoiding the VS Code `1.140.0` `resolvers` API proposal throw).
2. `createProviderManager().tryRegister` catches proposal-disabled throws from `vscode.chat.registerCustomAgentProvider`, disposes `candidateProvider`, and returns `proposalSupported: false`.
3. `fsPathToLocalRootUri` normalizes Windows drive paths and POSIX paths into `validateLocalRootUri` while rejecting UNC (`\\server\share`), device (`\\?\`, `\\.\`), relative, and traversal paths.
4. `createScopedTemplateWatcher` uses parent-level recursive watching on `win32` filtered by `isEnrolledTemplateInventoryPath`, preventing child watcher handles from blocking atomic `.evcrate-vscode` directory swaps with `EPERM`.
5. `resolveVscodeEditorLaunchTarget` resolves Windows `bin\code.cmd` wrappers to contained non-symlink `Code.exe` + `cli.js` with `ELECTRON_RUN_AS_NODE=1` and `shell: false`.

Qualification reports (`integrated-qualification.md`, `native-qualification.md`, `support-matrix.md`, `verification-matrix.md`, `tester-261012-2000-phase-09-integrated-qualification.md`) accurately separate passing automated/isolated-host receipts (`N-01`, `N-02`, `N-03`) from **BLOCKED** interactive Copilot Chat GUI and live inference gates.

---

### Critical Issues
None (0).

---

### Warnings (High / Medium Priority Findings)

1. **[Medium — Test Hermeticity & Tuple Pinning] Unconditional `PATH` editor dependency in `tests/integration/vscode-installed-runtime.test.mjs:594–596`**
   - **Problem:** Test `isolated temp-dir VS Code 1.140.0 CLI installs packaged companion VSIX...` is wired into `npm run test:integration` (and therefore `npm test`) and asserts `assert.ok(editorPath, 'VS Code CLI must be available on PATH...')`. On clean CI/headless environments without `code` on `PATH`, `npm test` will fail; conversely, when any `code` binary is on `PATH`, the test does not assert that `code --version` matches the pinned `1.140.0` (`07f806f999227108933c2e30515b26eecc1fda74`) tuple.
   - **Recommendation:** Either gate live host CLI execution behind an explicit qualification flag/suite or verify the probed `--version` output against the declared `supportedHost` tuple when recording native qualification receipts.

2. **[Medium — Watcher Correctness Edge Case] Empty `filename` dropped on Windows recursive watch (`extensions/vscode-model-bindings/src/template-watcher.ts:111–117`)**
   - **Problem:** Under `useRecursiveParentWatch` (`win32`), `if (name.length === 0) return;` ignores `fs.watch` events where the OS omits `filename` (e.g., `ReadDirectoryChangesW` kernel buffer overflow), whereas the non-Windows branch (`line 119`) conservatively triggers `onRelevantChange(resolvedPlugin)` when `name === ''`.
   - **Recommendation:** When `name.length === 0` on `win32`, invoke `onRelevantChange(resolvedPlugin)` so `RefreshController` runs a debounced inventory-hash check rather than silently dropping overflow notifications.

3. **[Medium — Environment Allowlist Scope] Ambient `ELECTRON_RUN_AS_NODE` propagation (`src/cli/process-runner.ts:4–8`)**
   - **Problem:** Adding `'ELECTRON_RUN_AS_NODE'` to `SAFE_ENVIRONMENT_KEYS` means any ambient `process.env.ELECTRON_RUN_AS_NODE` in the caller's environment is inherited by all `runBoundedProcess` invocations even when `options.env` is omitted.
   - **Recommendation:** Strip ambient `ELECTRON_RUN_AS_NODE` by default or pass explicit `envOverrides` through `runBoundedProcess` only when `resolveVscodeEditorLaunchTarget` resolves a Windows `Code.exe` + `cli.js` target.

4. **[Medium — Test Coverage vs Title Drift] Overstated test titles in `tests/cli/vscode-companion-installation.test.mjs`**
   - **Problem:**
     - `line 585`: Title states `post-install non-zero exit or timeout fails closed with exit 5`, but body only simulates `exitCode: 1, termination: 'completed'` (no `termination: 'timeout'` case).
     - `line 681`: Title states `resolves Windows code.cmd versioned and unversioned layouts...`, but body only exercises the versioned layout (`07f806f999\resources\app\out\cli.js`) and a broken wrapper, omitting an unversioned `resources\app\out\cli.js` assertion.
   - **Recommendation:** Add the unversioned layout and `termination: 'timeout'` assertions or narrow the test descriptions to match the exercised paths.

---

### Suggestions (Low Priority Improvements)

1. **[Low — UX Label Accuracy] Inverted project vs HOME description in `extensions/vscode-model-bindings/src/installation-commands.ts:31–35` (pre-existing context)**
   - Project root `c.uri` is the workspace folder URI (`file:///path/to/workspace`, which does not contain `.evcrate-vscode`), whereas HOME root `c.uri` is `file:///home/user/.evcrate-vscode`. Checking `c.uri.includes('.evcrate-vscode') ? 'Project installation' : 'HOME installation'` swaps the QuickPick descriptions.
2. **[Low — Subprocess Termination Context] Direct-child check in `src/cli/process-runner.ts:63–68` (pre-existing)**
   - `killChild` skips `SIGKILL` if the direct child already exited even when a grandchild still holds stdio pipes open, and Windows termination signals only the direct child PID. Acceptable for bounded `code --version` / `--list-extensions` / `--install-extension` CLI calls, but worth tracking if arbitrary wrapper trees are ever spawned.
3. **[Low — DRY `ScopedBindingStore` Instantiation] Repeated `new ScopedBindingStore(context.globalState, context.workspaceState, readHostRemoteAuthority(vscode.env))`**
   - Appears in `extension.ts:44`, `clear-commands.ts:27`, `configuration-commands.ts:50,125`, and `diagnostics-display.ts:50`. A small factory helper on `binding-store.ts` (`createHostBindingStore(context)`) would remove repetition.

---

### Positive Observations
- **Strict security posture on Windows CLI launching:** Refused `shell: true` for `.cmd` wrappers; parsed `%~dp0` targets under `MAX_WRAPPER_SCRIPT_BYTES` (16 KiB), enforced `assertNoSymlinkAncestors` + `lstatSync` regular-file containment inside `installRoot`, and executed `Code.exe` directly with `shell: false`.
- **Fail-closed URI & authority boundaries:** `fsPathToLocalRootUri` cleanly blocks UNC, Win32 device prefixes, control characters, and relative/traversal segments while preserving round-trip idempotence with `validateLocalRootUri`.
- **Honest qualification reporting:** `integrated-qualification.md`, `native-qualification.md`, `support-matrix.md`, and `verification-matrix.md` maintain exact cryptographic receipts (`VSIX SHA-256: c4638015d732945f85f3a6040a8864ac6b004d2fffdcf02f974e53fe7bed97a2`, `buildIdentity: caf354b6a8a2276f25e80fff3cef77be7529e061f122c3aab12150325f998dab`) and explicitly mark interactive GUI picker and live Copilot Chat inference rows as **BLOCKED** rather than substituting automated tests.

---

### Validation Commands & Results (from QA Receipt `tester-261012-2000-phase-09-integrated-qualification.md` & `integrated-qualification.md`)

| Command | Exit | Result Summary |
|---|---:|---|
| `npm run check:vscode-companion` | 0 | PASS (0.75 s) — VSIX `c4638015...`, `buildIdentity: caf354b6...`, 34 source inputs verified |
| `npm run distribute:check` | 0 | PASS (43.31 s) — `"status":"ok"` across all 7 targets |
| `npm run release:check` | 0 | PASS (1.04 s) — Runtime closure clean |
| `node --test tests/vscode-companion/*.test.mjs tests/distribution/vscode-companion-vsix.test.mjs` | 0 | PASS — 54/54 tests (2.082 s TAP) |
| `node --test tests/adapters/vscode-*.test.mjs` | 0 | PASS — 98/98 tests (4.522 s TAP) |
| `node --test tests/cli/vscode-companion-installation.test.mjs tests/cli/arguments.test.mjs tests/cli/dispatch.test.mjs tests/cli/vscode-settings-registration.test.mjs` | 0 | PASS — 48/48 tests (57.363 s TAP) |
| `node --test tests/integration/vscode-installed-runtime.test.mjs` | 0 | PASS — 6/6 tests (7.333 s TAP; includes isolated `N-01` CLI install & `N-03` hook bridge) |
| `node --test --test-concurrency=1 tests/distribution/publication-vscode-*.test.mjs` | 0 | PASS — 5/5 tests (86.609 s TAP) |
| **QA Node Test Total** | **0** | **211 / 211 passed, 0 failed, 0 skipped** (157.908 s TAP) |
| Isolated VS Code `1.140.0` Extension Host (`N-02`, `native-qualification.md`) | 0 | PASS — Real activation, `PROJECT_INSTALLATION_INVALID` pre-approval guard, all 5 `evcrate.*` commands, 17 staged `evc-*.agent.md` files, and `root.actor > user.actor > root.tier` precedence |
| Interactive Copilot Chat GUI picker & live authenticated inference (`AC 02`, `AC 04`–`AC 07`, Linux GUI) | — | **BLOCKED** — Requires interactive user GUI session with authenticated GitHub Copilot |

---

### Recommended Actions
1. In `extensions/vscode-model-bindings/src/template-watcher.ts`, trigger `onRelevantChange(resolvedPlugin)` when `useRecursiveParentWatch` receives an empty `filename` (`name.length === 0`).
2. In `tests/cli/vscode-companion-installation.test.mjs`, add assertions for the unversioned Windows `resources\app\out\cli.js` fallback and `termination: 'timeout'` post-install re-probe failure.
3. In `tests/integration/vscode-installed-runtime.test.mjs`, guard or pin the live `findEditorOnPath` test so clean environments without `code` on `PATH` do not fail `npm test` unexpectedly and live qualification verifies the expected VS Code version tuple.
4. Scope `ELECTRON_RUN_AS_NODE=1` to explicit child environment overrides in `src/cli/process-runner.ts` rather than inheriting ambient `process.env.ELECTRON_RUN_AS_NODE`.
5. Execute the manual interactive VS Code GUI verification checklist in `plans/261011-2349-vscode-runtime-model-bindings/reports/native-qualification.md` (§4) in an authenticated Copilot Chat session before claiming full Phase 09 native qualification completion.

---

### Unresolved Questions
1. When will an interactive user GUI session with an authenticated GitHub Copilot account (on Windows x64 and/or Linux x86_64) be run to complete the remaining **BLOCKED** verification matrix rows (`AC 02` live picker/subagent UI, `AC 04` `hostObservedModel` inference, `AC 05`/`AC 06` live cached-selection race & reselection/reload recovery, `AC 07` live chat turn tool/delegation enforcement)?
2. Should the live VS Code CLI test in `tests/integration/vscode-installed-runtime.test.mjs` (`line 594`) remain in the default `npm test` gate or be separated/guarded when `code` `1.140.0` is absent on `PATH`?
