# Phase 09 Integrated Contract & Package Qualification Report

**Date:** 2026-10-12  
**Plan:** [plan.md](../plan.md) | [Phase 09](../phase-09-integrated-qualification.md) | [Verification Matrix](../verification-matrix.md)  
**Status:** Automated Integrated Contract, Package Closure, Isolated CLI Install & Isolated Extension-Host Execution **PASS**; Interactive GUI Picker & Authenticated Copilot Inference Rows **BLOCKED** (awaiting interactive user GUI session).

---

## 1. Candidate Identity & Cryptographic Receipts

| Artifact / Input | Path / Scope | Digest (SHA-256) / Identity |
|---|---|---|
| Base Git Commit | `HEAD` prior to Phase 09 commit | `a8d9258460fb1692796684589350e6c7fded76ad` |
| Extension ID & Version | `eigencrate.evcrate-model-bindings@2.11.0` | Engine `^1.140.0` (verified on VS Code `1.140.0` & `1.141.0`) |
| Companion Build Identity | `.evcrate/targets/vscode/files/evcrate/companion/package.json` | `68a82c4549d3b68a8cab7b73b3252a46d195d87634e8a08023af64d1119bb965` |
| Packaged VSIX (Overlay) | `.evcrate/targets/vscode/files/evcrate/companion/evcrate-model-bindings-2.11.0.vsix` (46,723 bytes) | `833e982d1cb08139e4df4a4891a4622d5f001076ab55a66a77f80f70f449cc89` |
| Packaged VSIX (Projected) | `.evcrate/source/.evcrate-vscode/evcrate/companion/evcrate-model-bindings-2.11.0.vsix` | `833e982d1cb08139e4df4a4891a4622d5f001076ab55a66a77f80f70f449cc89` |
| Companion Source Receipt (`v1`) | `.evcrate/targets/vscode/files/evcrate/companion/source-receipt.json` (34 inputs) | `83ab4a35e9620207a4f7f41aad0e2607cd3d87aeac9eda396bf57f6caa0f3795` |
| Agent Intent Inventory (`v1`) | `.evcrate/source/.evcrate-vscode/evcrate/agent-intent.json` (17 `evc-*` actors) | `806949c4ac36df66bc813cb4372ea825919adf2e64e8cfc19cbf8ee85f2d4164` |
| Agent Tool Audit (`v2`) | `.evcrate/source/.evcrate-vscode/evcrate/agent-tool-audit.json` | `809d019cea0774e2ce0036977cc6b75698d39be6ad3b59a057d636d0d5e2c0ef` |
| Resource Registry | `.evcrate/registry.json` (138 resources) | `c7b34542c06e611edba6b93ba7ef7bc300180ab4892939ed3f7e7e975638ab8c` |
| Aggregate BuildManifest (`v3`) | `.evcrate/build-manifest.json` | `874410d302a31e1334351324322a226ce7680472f7d64bddc682702622a8afcd` |
| VS Code Target BuildManifest (`v3`) | `.evcrate/build-manifest-vscode.json` | `e7adb5821e36c6eebbbb2daf2891624285e068c701b9a7ac6d23c6f1051555b4` |

---

## 2. Real Defects Discovered & Fixed During Phase 09 Qualification

1. **VS Code 1.140.0 `vscode.env.remoteAuthority` `resolvers` API Proposal Throw (`extensions/vscode-model-bindings/src/installation-roots.ts`):**
   - **Discovery:** Launching the real VS Code `1.140.0` (`07f806f999227108933c2e30515b26eecc1fda74`) extension host with `--enable-proposed-api=eigencrate.evcrate-model-bindings` revealed that `vscode.env.remoteAuthority` is gated behind the `resolvers` API proposal in `extensionHostProcess.js` (`get remoteAuthority(){return L(P,"resolvers"),t.remote.authority}`) and throws at runtime when only `chatPromptFiles` is declared, whereas `vscode.env.remoteName` is the stable public property (`get remoteName(){return ly(t.remote.authority)}`).
   - **Fix:** Added `readHostRemoteAuthority(vscode.env)` which reads stable `vscode.env.remoteName` first and wraps `vscode.env.remoteAuthority` fallback in `try/catch` for test mocks.
2. **VS Code 1.140.0 `vscode.chat.registerCustomAgentProvider` Proposal-Disabled Throw (`extensions/vscode-model-bindings/src/provider-registration.ts`):**
   - **Discovery:** In VS Code `1.140.0`, `vscode.chat.registerCustomAgentProvider` is always a function property on `vscode.chat` and throws `CANNOT use API proposal: chatPromptFiles` when invoked without `--enable-proposed-api=eigencrate.evcrate-model-bindings`.
   - **Fix:** Wrapped `vscode.chat.registerCustomAgentProvider(candidateProvider)` in `try/catch` inside `tryRegister`, disposing the candidate provider and returning `{ qualified: false, proposalSupported: false, reason: 'chatPromptFiles API proposal is not available' }` when proposal permission is absent.
3. **Cross-Platform Filesystem-to-URI Conversion (`extensions/vscode-model-bindings/src/installation-roots.ts`):**
   - **Discovery:** Passing Windows `fsPath` (`C:\Users\...`) into `validateLocalRootUri({ scheme: 'file', path: fsPath })` failed because `validateLocalRootUri` enforces normalized POSIX URI paths.
   - **Fix:** Added dedicated `fsPathToLocalRootUri(fsPath)` helper that converts local POSIX and Windows drive-letter paths to normalized URI inputs while rejecting UNC (`\\server\share`), Win32 device (`\\?\`, `\\.\`), relative, and traversal paths without weakening `validateLocalRootUri`.
4. **Windows Atomic Swap Directory Lock in Scoped Watcher (`extensions/vscode-model-bindings/src/template-watcher.ts`):**
   - **Discovery:** Opening child `fs.watch` handles directly on `.evcrate-vscode` on Windows blocked publication-style atomic directory swaps (`renameSync(pluginDir, backupDir)`) with `EPERM`.
   - **Fix:** On `win32`, `createScopedTemplateWatcher` uses recursive parent-directory watching (`watch(parentDir, { persistent: false, recursive: true })`) filtered strictly through `isEnrolledTemplateInventoryPath` and `isDerivedStoragePath`, allowing atomic `.evcrate-vscode` directory swaps while ignoring unrelated workspace and storage writes.
5. **Windows VS Code CLI Wrapper Resolution (`src/cli/vscode-editor-launcher.ts`, `src/cli/process-runner.ts`, `src/cli/vscode-companion-installation.ts`):**
   - **Discovery:** Node 24 on Windows throws `spawn EINVAL` when spawning `.cmd` batch wrappers (`bin\code.cmd`) with `shell: false`.
   - **Fix:** Added `resolveVscodeEditorLaunchTarget` in `src/cli/vscode-editor-launcher.ts` to inspect Windows `bin\code.cmd` wrappers (both versioned `<commit>\resources\app\out\cli.js` and unversioned `resources\app\out\cli.js` layouts), verify containment and non-symlink regular-file safety inside the installation root, and execute `Code.exe` + `[cliJsPath, ...args]` with `ELECTRON_RUN_AS_NODE=1` and `shell: false`.

---

## 3. Automated & Package Qualification Results

| Check / Suite | Command | Result | Evidence Summary |
|---|---|---|---|
| Core + Companion Build & Regeneration | `npm run generate:all` | **PASS** (Exit 0) | Compiles TS, builds deterministic VSIX (`c4638015...`), regenerates registry (138 resources) and all 8 manifests in single pass |
| Distribution Check | `npm run distribute:check` | **PASS** (Exit 0) | `"status":"ok"` across all 7 targets |
| Companion Verifier (Checkout Mode) | `npm run check:vscode-companion` | **PASS** (Exit 0) | Verifies VSIX ZIP safety, CRC32, runtime closure, descriptor, and 34 live checkout input digests |
| Companion Verifier (Extracted Packed Mode) | `node scripts/verify-vscode-companion.mjs --mode=packed-package --project-root=<isolated-dir>` | **PASS** (Exit 0) | Verified outside checkout with `src/`, `extensions/`, `scripts/` absent; `development-checkout` mode fails closed as expected |
| Runtime Closure | `npm run release:check` | **PASS** (Exit 0) | Zero unapproved external dependencies across core `dist/` and embedded VSIX JS |
| Companion + VSIX Distribution Suite | `node --test tests/vscode-companion/*.test.mjs tests/distribution/vscode-companion-vsix.test.mjs` | **PASS** (54/54) | All 12 companion test files + `vscode-companion-vsix.test.mjs` pass ([QA receipt](../../../reports/tester-261012-2000-phase-09-integrated-qualification.md)) |
| VS Code Adapter Suite | `node --test tests/adapters/vscode-*.test.mjs` | **PASS** (98/98) | Projections, hooks, policy, references, metadata, session-context, session-state pass ([QA receipt](../../../reports/tester-261012-2000-phase-09-integrated-qualification.md)) |
| CLI Companion Installation & Settings Suite | `node --test tests/cli/vscode-companion-installation.test.mjs tests/cli/arguments.test.mjs tests/cli/dispatch.test.mjs tests/cli/vscode-settings-registration.test.mjs` | **PASS** (48/48) | Covers non-TTY skip, refusal, remote refusal exit 5, tamper exit 5, unverified identity exit 5, Windows `.cmd` resolution, settings registration, and stdout preservation ([QA receipt](../../../reports/tester-261012-2000-phase-09-integrated-qualification.md)) |
| Integrated Runtime + Real Isolated CLI Install | `node --test tests/integration/vscode-installed-runtime.test.mjs` | **PASS** (6/6) | Exercises real `.evcrate-vscode` templates + companion runtime + `local-hook-bridge.cjs` + real VS Code `1.140.0` CLI VSIX install in isolated temp dirs ([QA receipt](../../../reports/tester-261012-2000-phase-09-integrated-qualification.md)) |
| VS Code Publication Suite | `node --test --test-concurrency=1 tests/distribution/publication-vscode-*.test.mjs` | **PASS** (5/5) | Scoped VS Code publication apply, ownership, recovery, and settings registration pass ([QA receipt](../../../reports/tester-261012-2000-phase-09-integrated-qualification.md); scoped QA Node total: **211/211**) |
| Single-Projection Manifest Reuse & Parity | `node --test --test-concurrency=1 tests/distribution/single-projection-manifest-reuse.test.mjs` | **PASS** (6/6) | Separate main-session run: byte-identical 8-manifest promotion between single-pass and sequential builds |
| Private Release Artifacts & Seven-Asset Gate | `node --test --test-concurrency=1 tests/distribution/private-release-artifacts.test.mjs` | **PASS** (18/18) | Separate main-session run: verifies npm pack allowlist, Linux `tar.gz`, Windows `.zip`, `.sha256` sidecars, release metadata v2, and exact 7 external release assets |

---

## 4. Unresolved Questions, Review Follow-Ups & Blocking Gates

- **Interactive GUI & Live Copilot Inference (BLOCKED):** Live interactive VS Code GUI Copilot Chat model inference (`hostObservedModel`), live custom-subagent child invocation, live cached-selection race/reselection observation, live-turn tool/delegation enforcement, and Linux GUI/CLI smoke cannot be executed headlessly and remain **BLOCKED** pending an authenticated interactive user GUI session (see [native-qualification.md](./native-qualification.md)). Recording a blocker does not satisfy final release acceptance.
- **Full Monolithic `npm test` & Coverage:** Scoped suites (`211/211` in QA report plus `6/6` manifest reuse and `18/18` release artifacts) passed, while the full monolithic `npm test` run and coverage collection remain open.
- **Code Review Follow-Ups (4 Medium Warnings in [review report](../../../reports/code-reviewer-261012-2008-phase-09-integrated-qualification.md)):**
  1. Guard or pin `findEditorOnPath` in `tests/integration/vscode-installed-runtime.test.mjs:594` so clean CI hosts without `code` `1.140.0` on `PATH` do not fail `npm test` unexpectedly.
  2. Trigger `onRelevantChange(resolvedPlugin)` on `win32` when `fs.watch` delivers an empty `filename` (`extensions/vscode-model-bindings/src/template-watcher.ts:112`).
  3. Scope `ELECTRON_RUN_AS_NODE=1` to explicit child `envOverrides` rather than inheriting ambient `process.env.ELECTRON_RUN_AS_NODE` in `SAFE_ENVIRONMENT_KEYS` (`src/cli/process-runner.ts:6`).
  4. Add explicit `termination: 'timeout'` and unversioned Windows `resources\app\out\cli.js` assertions in `tests/cli/vscode-companion-installation.test.mjs`.
