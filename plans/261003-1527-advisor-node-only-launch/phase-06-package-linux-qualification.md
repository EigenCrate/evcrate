# Phase 06 — Package and Linux qualification

## Context Links
- [Architecture contract](architecture-contract.md); [Darwin runtime contract](darwin-runtime-contract.md); [acceptance matrix](acceptance-matrix.md).
- [Baseline](research/repository-baseline.md); [caller inventory](research/caller-inventory.md); [platform research](research/platform-qualification.md).
- [Darwin storage](research/macos-storage-design.md); [Darwin process](research/macos-process-design.md).
- [Previous phase](phase-05-darwin-runtime-integration.md); [Windows handoff](phase-07-native-windows-qualification.md).
- [Package scripts](../../package.json); [architecture authority](../../docs/system-architecture.md); [code standards](../../docs/code-standards.md).

## Overview
- Date: 2026-10-03. Priority: P1.
- Implementation: complete. Review: passed (score: 9.7/10).
- Dependency: Phase 05 integrated every Darwin runtime path using the real Phase 04 arm64/x64 assets and interface. Missing assets/integration block this gate; source-only delivery is not sufficient.
- Outcome: complete Linux regression, final eight-target package/projection checks, then a byte-identified immutable qualification bundle containing everything Windows needs.

## Key Insights
- `npm test` includes build plus protocol, metrics, CLI, primitives, adapters, registry, scopes, publication, integration, cutover, validation-rollout, controller, release, Linux installer and distribution rollout suites. Focused tests alone are insufficient here.
- `npm run lint` currently only echoes `Linting passed`; omit it as evidence. Do not create a lint project to satisfy this change.
- Distribution build/check rejects root harness trees such as live `.omp/`. Use an approved clean package snapshot, not deletion of the user's unrelated roots.
- Current target authority has **eight** IDs: antigravity, claude, codex, copilot, gemini, omp, pi, vscode. `.agents` is a Codex companion, not target nine; VSCode's native projection differs from generated workflow targets.
- `release:check` validates built control-plane closure and delegates controller validation; `distribute:check` reconstructs/validates projections. Neither is a live platform/provider smoke.
- npm's shipped file list excludes controller tests/fixtures. The qualification archive is a separate internal transport, not an npm release or production publication.

## Requirements
- Preserve owner-approved dirty-source changes, including VSCode. Record their exact bytes; commit `main` alone cannot identify this snapshot.
- Stage all Windows-safe fixtures and the automated Windows harness **before** freezing. Phase 07 must never author its first harness on Windows or regenerate the candidate.
- Run native Linux parent gates on Node 24.21.0 and 22.19.0; record separate results/version/architecture. An unavailable pin blocks its qualification row, not permission to substitute a different version.
- Use disposable HOME, project, temp, routing policy and fake providers; no consult-e02/e03 execution, credentials, live vendor calls, release candidate workflow, or production HOME writes.
- Ship both native Darwin binaries/provenance byte-identically; Linux must not load them. Static/build evidence never becomes macOS runtime evidence.
- Reconcile N02–N13/N15, D06 and P01–P03; retain earlier Linux behavior receipts and add final complete-package evidence. Windows W01–W03 remain Phase 07 gates.

## Architecture
- Disjoint units: **package audit** verifies Phase 04 closure/classification; **qualification transport** authors two small test-only helpers; **fixture readiness** completes bounded portability gaps left by Phase 03. Parent owns shared-file integration, generated outputs, final gates and freeze. Workers skip gates/formatters.
- Reuse `scripts/release/canonical-json.cjs`, `path-policy.cjs`, `zip-writer.cjs:createZipArchive` and `zip-verifier.cjs:verifyZipArchive`; no generic extractor/security framework or changed release asset set.
- Proposed `tests/advisor-controller/qualification-bundle.cjs` CLI: `freeze --root <approved-package-root> --output <empty-external-dir>`; `verify --root <extracted-package-root> --manifest <external-manifest.json>`; `verify-archive --archive <candidate.zip> --manifest <external-manifest.json>`. These are qualification APIs, not advisor APIs.
- Proposed `tests/advisor-controller/native-windows-qualification.cjs` CLI: `--bundle <verified-package-root> --powershell <absolute-powershell.exe-or-pwsh.exe> --evidence <empty-external-dir> --mode automated|console`. Phase 06 authors it; Phase 07 executes it. Node-builtins and existing fixtures/compiled runtime only; no Windows dependency install/build.
- Freeze output: `candidate.zip` (existing writer's `package/` prefix), `manifest.json`, `receipt.json`, `candidate.zip.sha256`. Manifest/receipt/logs live outside payload to avoid self-hashing recursion.
- Manifest: schema/version, candidate ID, approved snapshot identity, complete sorted entries `{path,kind:'file',size,sha256,mode}`, count/total bytes and generated-root metadata. Native relative POSIX identities; reject symlinks, unsafe/case-colliding paths, missing/extra files and special objects using existing policy. Existing ZIP writer transports files, not empty directories; record empty generated roots as metadata, never synthesize placeholder files. Mode is producer/archive metadata; Windows does not pretend POSIX chmod is an ACL check.
- Include approved `src/`, complete `tests/` and fixtures, required `scripts/`, package/lock/tsconfig inputs, canonical resources, all current target manifests/overlays/projections, `.evcrate` registry/build manifests, full `dist/` closure, both Darwin artifacts/C headers/source/provenance, installer sources and publishable docs. Every payload file is enumerated; exclude declared development debris, `.git`, caches, credentials, live harness roots, `node_modules` and `plans/` evidence using existing archive policy. Document excluded paths/reasons, never omit a required test dependency.
- Receipt binds source manifest digest, archive size/SHA-256, target IDs, closure count/digest, native provenance digest, Linux environments and external gate-log hashes. Hash equality proves integrity, not signed provenance: record `unsigned` unless a real authorized signature exists.

## Related Code Files
- **Create, proposed:** `tests/advisor-controller/qualification-bundle.cjs`, `tests/advisor-controller/native-windows-qualification.cjs`.
- **Verify-only; modify bounded fixture gaps if needed:** `tests/advisor-controller/controller.test.cjs`, `tests/advisor-controller/mentor-brief.test.cjs`, `tests/advisor-controller/state-cli.test.cjs`, `tests/advisor-controller/history-cli.test.cjs`, `tests/advisor-controller/history-controller-integration.test.cjs`, `tests/advisor-controller/retry-orchestration.test.cjs`, `tests/advisor-controller/smoke-30s.cjs`.
- **Verify-only existing lifecycle/supervision:** `tests/advisor-controller/verification-lifecycle.test.cjs`, `tests/advisor-controller/supervision-console.test.cjs`, `tests/advisor-controller/provider-launch-identity.test.cjs`; `tests/adapters/phase08-mentoring-integration.test.mjs`; `tests/cli/health.test.mjs`.
- **Verify-only Phase 03 proposed behavior test:** `tests/advisor-controller/node-launch.test.cjs`.
- **Verify-only:** `src/manifests/controller.ts`, `scripts/generate-controller-inventory.mjs`, `scripts/release/runtime-closure.cjs`, `scripts/release/zip-writer.cjs`, `scripts/release/zip-verifier.cjs`, `scripts/release/canonical-json.cjs`, `scripts/release/path-policy.cjs`; `install.sh`, `install.ps1`, `package.json`, `package-lock.json`.
- **Generated, not hand-edited:** `src/manifests/controller-inventory.generated.ts`; `.evcrate/registry.json`; `.evcrate/build-manifest.json`; `.evcrate/build-manifest-{antigravity,claude,codex,copilot,gemini,omp,pi,vscode}.json` (brace notation enumerates outputs).
- **Generated:** declared roots beneath `.evcrate/source/`, including `.evcrate-vscode` when emitted by current authority; discover roots from `.evcrate/targets/manifest.json` and each manifest, not historical seven-root assumptions.
- **Verify-only Phase 04/05 assets:** `.evcrate/source/.evcrate/bin/lib/advisor/darwin-platform.cjs`, `.evcrate/source/.evcrate/bin/lib/advisor/native/darwin/prebuilt/artifacts.json`, `.evcrate/source/.evcrate/bin/lib/advisor/native/darwin/prebuilt/darwin-arm64/advisor-native.node`, `.evcrate/source/.evcrate/bin/lib/advisor/native/darwin/prebuilt/darwin-x64/advisor-native.node`.
- **Generated external evidence:** bundle manifest/archive/receipt, Linux logs and smoke receipts; no changes to old plans or unrelated live HOME.

## Implementation Steps
1. Parent reconciles Phase 05 source/assets with the approved snapshot. Prepare a disposable package root containing all approved inputs, no unrelated root harness directories; capture exclusions and source digest. Set absolute private HOME/project/temp roots and sanitized environment before any gate. Keep npm dependency/cache activity isolated from live configuration.
2. Confirm package scripts/Node pins/target authority still match this document; stop for owner reconciliation if concurrent changes alter the snapshot. Install locked development dependencies in this disposable Linux workspace with existing `npm ci`, not in the eventual frozen payload.
3. Integrate Phase 03 fixture readiness: package-shaped copied fake scripts and `.cmd` backend launchers on Windows; POSIX helpers only on POSIX; no symlink privilege requirement. Normalize case-insensitive PATH keys, use `path.delimiter`, protect explicit invalid HOME behavior. No retry/provider protocol change.
4. Author proposed helpers using the architecture above. The Windows helper verifies real win32/version/shell identity, runs the explicit Phase 07 tests plus installed lifecycle/UTF-8/no-fallback scenarios, writes external evidence, and records unavailable console separately. It rejects Linux/WSL as Windows; Linux can review this branch but cannot qualify it.
5. Ensure any lifecycle validation receipt is truthful: the existing lifecycle fixture's recorded `node --version` check must actually be executed and parsed, not merely serialized as passed. Carry this adaptation into the frozen test bytes.
6. Parent regenerates final canonical runtime/projections/manifests, from the disposable package cwd:
   ```bash
   npm run generate:all
   npm run distribute:build
   ```
   Existing `generate:all` runs inventory, build/prebuild, registry and per-target/aggregate manifest generation. Confirm all eight IDs and generated count authority; do not hand-edit inventory/manifests or force a historical 36-file closure.
7. After all edits land, parent runs one final gate batch per selected Linux Node pin, serially; logs outside payload:
   ```bash
   npm test
   node --test tests/cli/health.test.mjs tests/advisor-controller/node-launch.test.cjs
   node tests/advisor-controller/smoke-30s.cjs
   npm run release:check
   npm run distribute:check
   ```
   `node-launch.test.cjs` is proposed in Phase 03, unavailable until implemented. Capture real totals/skips/exit codes. The >30s fake-backed smoke proves controller process/wait behavior, not live Codex service compatibility.
8. Exercise installed/private-HOME controller behavior from the proposed launch test: complete shared closure copy, absolute Node/script argv, project cwd, exact Unicode UTF-8 JSON + EOF, real parsed envelopes/history/state, and a non-executable script copy. Observe failed selected Node never invokes an executable advisor trap; malformed/empty explicit HOME never selects live HOME. Preserve health's diagnostic packageRoot cwd separately.
9. Verify real Linux state/baseline/history, CAS/replay/stale evidence, export/prune safety, cancellation/progress/cleanup and headless human-gate behavior through the complete suites; record Win32-only skips honestly. Static native review checks literal binary imports, byte classification before UTF-8, matching source/artifact provenance, no Linux addon load and no runtime native build/download. Do not require the addon or execute any macOS code.
10. Verify release/package behavior tests cover actual binary-byte staging, projection/installed copy parity, inventories and tamper/missing assets; `release:check` must succeed with these real assets. Do not relax its separate dist-JS closure ban generally. Any packing lifecycle regeneration must finish before freeze; qualification transport includes tests whether npm pack would ship them or not.
11. Resolve failures in source, then repeat the affected phase-end qualification batch on the new approved snapshot. No freeze while a required gate is failed, missing or unexplained. Freeze only after generated bytes settle:
    ```bash
    # Proposed helper; run only after its implementation.
    node tests/advisor-controller/qualification-bundle.cjs freeze --root "$PACKAGE_ROOT" --output "$BUNDLE_OUTPUT"
    node tests/advisor-controller/qualification-bundle.cjs verify-archive --archive "$BUNDLE_OUTPUT/candidate.zip" --manifest "$BUNDLE_OUTPUT/manifest.json"
    ```
12. Round-trip the archive in a fresh external Linux directory with an available archive tool, then `verify --root <extracted>/package --manifest <manifest>`. Do not invent an extractor API. Re-run installed behavioral smoke from those verified bytes without rebuilding; ensure fixture chmod/copies happen outside payload. Bind every input and evidence file to the final receipt, send expected archive/manifest/receipt digests through the trusted handoff channel. No mutable-tree checkout, regeneration, `npm ci`, or publication in Phase 07.

## Todo List
- [x] Approved source/assets and isolated Linux workspace recorded.
- [x] Windows runner/portable fixtures complete before freeze; behavioral rather than source-string checks.
- [x] Eight-target generated outputs and complete native/controller closure verified.
- [x] Full Linux gates plus installed and >30s smoke have truthful version-specific receipts.
- [x] Complete archive manifest, round-trip verification and trusted digest handoff prepared.
## Success Criteria
- All required Linux rows/gates observed successful; explicit skipped/unavailable scenarios are not PASS. No fake lint evidence.
- Real stateful controller behavior uses one Node launcher and exact stdin/cwd/HOME semantics, with no direct fallback.
- Both built Darwin artifacts are included, byte-preserved and source-bound; macOS remains implementation-present, **untested/unqualified**.
- Windows receives the exact Linux-qualified source/tests/fixtures/dist/native closure; all required files are manifested and archive/root equality independently checked.
- Parent review accepts candidate completeness, evidence and narrow support statements; no production action implied.

## Risk Assessment
- Dirty/legacy roots can create misleading check failures: qualify the coherent approved snapshot without modifying unrelated work.
- Test fixtures can mutate source modes or emit output into payload: copy fixtures to sandboxes; verify content after runs, write evidence externally.
- Required helper/test dependency absent from transfer: treat as incomplete bundle; repair and Linux-requalify, never install/regenerate on Windows.
- Native bytes corrupted by text decoding/transforms: real binary parity/tamper checks; fail packaging rather than widen allowlists.
- Archive bounds may reject the complete qualification tree: reconcile actual inventory with existing limits before freezing; no silent truncation or unsafe limit bypass.

## Security Considerations
- No inherited production routing policy, history, credentials or provider account state. Fake packages are explicit fixtures, not qualified vendor releases.
- Hash-pinned bytes and approved producer provenance are mandatory; SHA-256 sidecars alone are not authentication/signatures.
- Shared closure remains HOME-owned; project controller copies/fallbacks, symlink traversal and native artifact lookup from environment remain forbidden.

## Next Steps
- Give Phase 07 the frozen archive, external manifest/receipt and trusted expected digests. Native Windows access is a future execution prerequisite, not a reason to omit this plan.
- Any candidate-byte repair creates a new ID/manifest and repeats Linux qualification before Windows runs.

## Unresolved Questions
- Which owner-approved coherent snapshot and native Windows transfer channel will be used? Capture before execution.
- Are both Linux Node pins available in the controlled environment? Missing access blocks the corresponding future row; no checks have run here.
