# Codebase Summary

**Maintained:** 2026-10-05 (PR #17 remediation).
**Source:** Current repository declarations and implementation modules; [Linux remediation verification](../plans/reports/implementation-261005-1303-pr17-verification.md). Historical candidate qualification evidence remains dated separately.
**Updated:** 2026-10-05
**Package:** Private npm package `evcrate` 2.8.0; Node `>=22.19.0`. Binaries: `evcrate` (`dist/cli/evcrate.js`) and `evcrate-advisor` (`.evcrate/source/.evcrate/bin/evcrate-advisor`). The former Advisor plugin API package/runtime is retired; the core Advisor controller and producer history remain.
**Windows advisor:** Phase 07 exercised one native Windows x64 row (111 passed; formal qualification invalidated by stale `.omp` manifest under Rule 94). Phase 06 completed replacement candidate regeneration (`evcrate-candidate-1791140555626`, 7,410 files, archive SHA-256 `6a720dfb...`, manifest SHA-256 `365f145b...`) with repaired `.omp` output hash, 9/9 extracted root launch test pass, Cycle 2 native Windows runner fixes, clean Linux qualification (753/753 passed, 25 win32 skips), and code review score 9.8/10; ready for Phase 07 requalification. Broader Windows support remains limited to installer lifecycle and `version --json`.
**Current phases:** Filesystem-policy Phases 01–02, Windows readiness Repairs 01–04, and VS Code Local Phases 08–09 are complete. Advisor Node-only Phases 01–05 are durably complete; Phase 06 candidate regeneration and Linux requalification are complete (review 9.8/10, user approved). Build generation performance Phases 01–05 complete 2026-10-05 (single-projection manifest reuse, bounded worker pool with snapshot isolation, compiler incremental caching, parity verification, and post-build parent RSS benchmark metrics).
**Controller closure:** Exactly 44 files (36 prior entries plus eight Darwin assets); earlier 29-, 33-, and 36-file inventories are dated counts.
**Former Workspace Advisor integration:** The 2026-09-30 Phase 09 paired qualification is historical plugin-era evidence, not qualification of the current native DamHopper integration. The plugin runtime and paired host integration were retired 2026-10-02.

EVCrate builds and publishes validated projections of one canonical agent-harness source tree. The TypeScript CLI is the package control plane; the shared advisor controller remains a separate CommonJS runtime.

## Source-of-truth map

| Path | Role | Editing rule |
|---|---|---|
| `.evcrate/source/.claude/` | Canonical harness resources | Author here; do not hand-edit generated target copies. |
| `.evcrate/source/.evcrate/bin/` | Shared advisor controller source, Darwin native sources and prebuilt assets | Maintain the generated closure; the Darwin integration is present but actual macOS runtime remains untested/unqualified. |
| `.evcrate/targets/` | Schema-2 target manifests and overlays | Change target policy or declared overlays, then rebuild. |
| `.evcrate/source/{.agents,.codex,.gemini,.antigravity,.pi,.omp,.copilot}/` | Generated target projections | Regenerate; never treat as authoring roots. |
| `.evcrate/source/.evcrate-vscode/` | Generated VS Code Local plugin bundle | Regenerate from canonical resources and the `vscode` target manifest; do not hand-edit. |
| `.evcrate/registry.json` | Schema-1 canonical resource records | Regenerate from the canonical scan; distinct from target/build manifests. |
| `src/` | TypeScript control plane | Primary package implementation. |
| `scripts/` | Generation, package, release, benchmark (`benchmark-build-generation.mjs`), and TypeScript incremental build tooling (`build-typescript.mjs`, `typescript-build-cache.mjs`, `typescript-build-receipt.mjs`) | Follow each script's declared authority; generated outputs are not edited by hand. |
| `viewer/src/` | Shared Advisor UI source retained after plugin retirement | Maintain only against current consumers; the former `plugin/` backend/package was removed. |
| `tests/` | Contract and behavior suites | Focused regression and integration tests, not live vendor qualification. |
| `docs/`, `plans/` | Maintained documentation and work plans | See the documentation map below. |

The persisted target IDs are `claude`, `codex`, `gemini`, `antigravity`, `pi`, `omp`, `copilot`, and `vscode`. `.agents` is a Codex companion output root, not an additional target. `vscode` uses a separate local-build adapter route; generated outputs and manifests are build artifacts.

## TypeScript module map

| Area | Responsibility | Representative files |
|---|---|---|
| `src/protocol/` | Bounded JSON and versioned request/result contracts | `validation.ts`, `resource-payloads.ts`, `publication-payloads.ts`, `advisor-settings.ts`, `index.ts` |
| `src/context/` | Immutable package, project, HOME, state, and target context | `invocation-context.ts`, `path-resolution.ts`, `target-registry.ts` |
| `src/manifests/` | Target manifest loading, build metadata, controller closure | `manifest.ts`, `registry.ts`, `controller.ts` |
| `src/adapters/` | Eight target projection adapters (seven shared-registry adapters plus VS Code Local native adapter in `vscode/`; all 7 translated adapters hash `dist/adapters/uri-restoration.js`; Codex linear regex callback URL restoration) | `registry.ts`, `qualification.ts`, `vscode/` (`adapter.ts`, `hook-protocol.ts`, `policy.ts`, `session-context.ts`, `advisory-caller.ts`), `codex/` (`transforms.ts`) |
| `src/distribution/` | Local build/check, single-projection manifest reuse, bounded worker pool (`worker-pool.ts`), input snapshot isolation (`input-snapshot.ts`, `input-snapshot-tree.ts`), publication planning, staging, atomic promotion, and recovery | `local-build.ts`, `local-build-staging.ts`, `manifest-view-derivation.ts`, `local-staging-fs.ts`, `worker-pool.ts`, `input-snapshot.ts`, `publication-plan.ts`, `publication.ts` |
| `src/filesystem/` | Host/portable paths, hashing, atomic writes, and locks | `paths.ts`, `hashing.ts`, `atomic.ts`, `locking.ts` |
| `src/registry/` | Canonical resource scan, schema, validation, and queries | `scanner.ts`, `schema.ts`, `store.ts` |
| `src/imports/` | Bounded explicit-source preview/apply and materialization | `source.ts`, `preview.ts`, `apply.ts`, `handler.ts` |
| `src/scopes/` | Global/project assignments, revisions, and CAS | `identity.ts`, `state.ts`, `mutations.ts`, `changes.ts` |
| `src/advisor-settings/` | User-policy snapshots, journaled transactions, and recovery | `policy-files.ts`, `coordinator.ts`, `transactions.ts`, `recovery.ts` |
| `src/cli/`, `src/errors/` | One-shot dispatch, output, stable errors, and exit mapping | `arguments.ts`, `dispatch.ts`, `main.ts`, `control-plane-error.ts` |

The CLI resolves context, validates one invocation, dispatches one operation, writes one validated result, and exits. It exposes version/health, resource and import operations, scopes/changes, advisor settings, and distribution build/check/publish/recover operations. There is no canonical root `distribute.py` runtime.

## Build, publication, and installer flow

`npm run build` compiles the TypeScript control plane incrementally via `scripts/build-typescript.mjs -p tsconfig.json`; its `prebuild` generates the canonical runtime brief, advisor runtime modules (`npm run generate:advisor-runtime` via `scripts/build-typescript.mjs -p tsconfig.advisor-runtime.json`), and controller inventory. Full clean builds run via `npm run build:clean` (`--clean`), which shares the prebuild lifecycle (`npm run prebuild:clean`) and purges `.tsbuildinfo` while preserving prior receipts so stale outputs remain tracked and cleaned. `npm run distribute:build` creates target projections and verified build manifests; `npm run distribute:check` checks the generated state.

### TypeScript incremental build caching architecture

TypeScript builds use a compiler-driven incremental caching subsystem orchestrated by `scripts/build-typescript.mjs`:
- **Cache locations & configuration**: Both `tsconfig.json` and `tsconfig.advisor-runtime.json` declare `"incremental": true` with build info paths directed to `.cache/evcrate/` (`tsconfig.tsbuildinfo` and `tsconfig.advisor-runtime.tsbuildinfo`). The `.cache/` root is excluded via `.gitignore`.
- **Compiler execution**: The authoritative TypeScript compiler binary (`node_modules/typescript/bin/tsc`) is invoked directly with `-p <config>` and forwarded arguments via `spawnSync`. Failures propagate non-zero exit codes immediately without downstream mutations.
- **Cache validation and invalidation (`scripts/typescript-build-cache.mjs`)**:
  - Dynamically computes expected `.js` and `.d.ts` outputs using official TypeScript compiler APIs (`ts.readConfigFile`, `ts.parseJsonConfigFileContent`, `ts.createProgram`, `ts.getOutputFileNames`). The full emit-eligible program closure is captured, including non-root imported modules.
  - Automatically detects corrupted cache files (zero bytes or invalid JSON via `isBuildInfoCorrupt`) and removes them.
  - Automatically verifies disk presence for all expected outputs via `validateAndInvalidateCache` (skipped under `--noEmit`). If any output artifact is missing, the `.tsbuildinfo` cache is deleted to force `tsc` to perform full re-emission.
- **Receipt management and safe stale cleanup (`scripts/typescript-build-receipt.mjs`)**:
  - Tracks compiler-owned output artifacts in atomic schema version 1 receipts (`<tsBuildInfoPath>.receipt.json` or `.cache/evcrate/<config>.receipt.json`) containing `config`, `outDir`, `declarationDir`, `timestamp`, and sorted `outputs`. Output path overrides partition receipt identity with a 16-hex SHA-256 hash.
  - On successful compilation, `cleanStaleOutputs` diffs current expected outputs against the previous receipt to delete obsolete files (e.g., when sources are deleted or renamed).
  - Safety invariants: enforces strict boundary containment (`isSafeOutputPath`), refuses symlinks (`fs.lstatSync`) across root ancestors, parent directories, and output leaves, verifies physical containment via `fs.realpathSync`, and never sweeps `outDir`.
  - Cleanup failure returns status 1 without rewriting the receipt, preserving the unhandled ownership ledger on disk.
  - Receipts are written atomically via `.tmp.<timestamp>` files and atomic rename.

### Bounded worker staging, snapshot isolation, and manifest derivation

For full repository manifest generation, `scripts/build-manifests.mjs` executes `runAllManifestsBuild` using single-projection manifest reuse (`src/distribution/local-build.ts`, `src/distribution/local-build-staging.ts`, `src/distribution/manifest-view-derivation.ts`). Staging supports bounded subprocess workers (`TargetWorkerPool`, `--jobs <n>`, default 2):
- **Input snapshot isolation**: `prepareInputSnapshot` creates an isolated staging copy of canonical harness inputs (`.claude`) and compiled runtime (`dist/**/*.js`).
- **Consumed input identity**: `canonicalInputHash` computes snapshot freshness across all consumed files, including `.gitignore` (which Claude projects); manifest `treeHash` retains its canonical definition excluding `.gitignore`.
- **Physical boundary validation**: `visitSnapshotInputs` verifies `assertNoSymlinkAncestors` and `assertRealDirectory`. Unsafe entries (symlinks, special files) throw `PATH_UNSAFE` immediately before any filter is evaluated. Traversal filters (`isIgnoredArtifact`) bypass heavy excluded directories (`node_modules/`, `__pycache__/`) without reading or recursing into descendant paths.
- **Compiled runtime revision binding**: `compiledRuntimeHash` hashes all `.js` outputs in `dist`. The parent compares disk runtime against in-memory `loadedRuntimeHash`; any divergence throws `PUBLICATION_FAILED` across both serial (jobs 1) and worker (jobs 2) execution. Workers execute the snapshot runtime (`sharedInputs.runtimeRoot/distribution/target-worker.js`).
- **Promotion freshness under lock before journal**: In `promoteUnlocked`, `options.hooks?.beforeTransaction?.()` executes input freshness checks (`assertLiveInputsUnchanged`) while holding the promotion lock, strictly BEFORE writing the journal or claiming destination outputs. Source drift fails safely before journal recording, avoiding spurious `ROLLBACK_FAILED`.
- **In-memory metadata derivation**: `deriveManifestView` constructs 8 single-target manifests (`build-manifest-<target>.json`) and 1 aggregate manifest (`build-manifest.json`) without duplicate projection runs or disk re-reads. All 7 translated targets declare `dist/adapters/uri-restoration.js` in `adapter_sources`. All 9 manifests and staged outputs are committed in a single atomic promotion transaction (`promoteTransaction`), maintaining 100% byte-for-byte parity.
- **Benchmark metric**: `scripts/benchmark-build-generation.mjs` measures post-build parent process RSS (`memoryUsage().rss`), not worker process-tree peak.

Publication consumes a verified build and publishes the shared advisor controller under HOME plus target harness files in HOME or project scope. Recovery is scope-isolated.

The Linux standalone installer unpacks a verified package snapshot and launches its staged CLI for a version smoke. Phase 01 now provisions mandatory launch roles independently of archive permission bits and runs the staged CLI by its real path. The separate Windows qualification boundary remains installer lifecycle and `version --json`; this Phase 01 work does not qualify broader Windows runtime behavior.

The release workflow verifies an exact set of seven core assets. The plugin
archive and checksum under `dist/advisor-plugin/` were removed; current release
assembly does not build or publish them.

## Phase 06 package and Linux qualification

Phase 06 regenerated the eight-target projections and froze replacement candidate bundle `evcrate-candidate-1791140555626` for native Windows qualification re-execution. This bundle is separate from an npm release artifact.

| Helper | Role and boundary |
|---|---|
| `tests/advisor-controller/qualification-bundle.cjs` | Freeze, verify-archive, and verify commands produce `candidate.zip`, an external manifest, receipt, and SHA-256 sidecar. Archive and extracted-root checks enforce paths, sizes, hashes, and no unexpected files. |
| `tests/advisor-controller/native-windows-qualification.cjs` | Phase 07 runner; requires native Windows x64 and takes `--bundle`, absolute `--powershell`, external `--evidence`, and `--mode automated|console`. Staged in an isolated HOME/project sandbox. Updated with Cycle 2 fixes: retry-bounded sandbox cleanup (`maxRetries: 5`), fail-safe receipt writing, and space-separated argument syntax. |

### Candidate regeneration and Linux requalification metrics
- **Candidate ID:** `evcrate-candidate-1791140555626`
- **Archive path:** `/tmp/evcrate-qualification-bundle/candidate.zip`
- **Archive SHA-256:** `6a720dfb136fb80ccd624cdca63dbce3ca18ba08fe75a2ef322c90f3d7a5b3a9`
- **Manifest SHA-256:** `365f145bb0deefe9eabad83ac6c9f9e598e7bb80f275c435e54a17321ee7c86a`
- **Total files:** 7,410 entries matching byte-for-byte across archive and extracted filesystem (132,976,902 expanded bytes; 0 missing, 0 unexpected files).
- **Manifest defect repair:** Repaired `.omp` build manifest output hash in `.evcrate/build-manifest-omp.json`; `distribute:check` and `release:check` passed with `status: "ok"`.
- **Extracted candidate verification:** `tests/advisor-controller/node-launch.test.cjs` verified **9/9 passed** directly within extracted candidate root (`/tmp/evcrate-qualification-extracted/package`).
- **Linux qualification gates:** `npm test` passed **753/753** (25 expected platform Win32 skips, 778 total on Node `v24.16.0` Linux x64); health and launch behavior passed **17/17**; `release:check` and `distribute:check` passed; smoke check passed **>30s** (exit 0).
- **Code review:** Score **9.8/10**, zero critical findings, user approved. Candidate is frozen and verified, ready for Phase 07 native Windows requalification.
## Phase 07 native Windows execution and handoff

The 2026-10-05 rerun verified 7,433 / 7,433 candidate archive and extracted files (149,783,540 expanded bytes), then ran the updated repository runner against that frozen root. The candidate package remained unchanged; the repository runner SHA differed from the runner embedded in the candidate.

- Host row: native Windows x64, Windows PowerShell 5.1.26100.9444, Node `v24.21.0`, OS release `10.0.26200`.
- Native suites: provider launch identity/retry **48/48**, supervision/verification lifecycle **19/19**, controller/state/history CLI integration **44/44** — **111 passed, 0 failed, 0 skipped**.
- Required `node-launch-behavior`: **1 passed, 8 failed** with `PUBLICATION_FAILED` while validating the frozen candidate's `.omp` output hash (`b886...` recorded; `c5b6...` actual). Overall: **120 tests, 112 passed, 8 failed, 0 skipped**; qualification **INVALIDATED**.
- Installed lifecycle passed: `state init` → `state checkpoint` → central consultation → `state disposition` → `state outcome` → `state complete`; final task revision 7 and `gate_status: completed`.
- Windows PowerShell 5.1 BOM-free UTF-8 pipeline returned `HISTORY_READY`, exit 0. Headless `state human-decision` rejected piped approval with `HUMAN_EVENT_REQUIRED`.
- Only PowerShell 5.1 × Node 24.21.0 ran. Node 22.19.0 and PowerShell 7 were unavailable; positive attached-console evidence was blocked.
- Rule 94 prohibits candidate patching on Windows. Phase 06 completed candidate regeneration and Linux requalification: repaired `.omp` build manifest, updated the native Windows runner with Cycle 2 fixes, passed all Linux gates (753/753 passed, 25 skips), and froze replacement bundle `evcrate-candidate-1791140555626` (review score 9.8/10).
- Phase 07 is ready for re-execution against replacement candidate `evcrate-candidate-1791140555626` across the native Windows matrix. Cycle 2 review scored 8.8/10 with no critical findings; its two attached-TTY defects make positive console evidence outstanding.

See the [Phase 07 execution report](../plans/261003-1527-advisor-node-only-launch/reports/phase-07-windows-qualification.md), [Cycle 1 review](../plans/261003-1527-advisor-node-only-launch/reports/code-review-261005-0043-phase-07-native-windows-qualification.md), and [Cycle 2 review](../plans/261003-1527-advisor-node-only-launch/reports/code-review-261005-0110-phase-07-native-windows-qualification.md). These documentation changes are included in candidate payloads; freeze and Linux-requalify any replacement candidate before Windows transfer.

## Darwin native runtime integration (Phase 04 build; Phase 05 source integration)

The controller closure is exactly 44 files: the prior 36 shared/Windows entries plus eight Darwin entries (one loader, five C/provenance text files, and two prebuilt Mach-O addons). The generated inventory classifies the addons as binary and validates Mach-O magic. `darwin-platform.cjs` selects only the matching `arm64` or `x64` Node-API 8, bridge ABI 1 binary. The approved build authority is `node scripts/build-darwin-advisor-native.mjs`; it is not an install-time compiler or downloader.

Phase 05 connects the native bridge to:
- `state-io.cjs`: Canonical project/HOME capabilities (`openRoot`), state transaction and lock dispatch (`openDirectory`, `openRegular`, `removeOwned`), self-token verification before lock/recovery writes, and conservative Darwin process identity (`getDarwinProcessIdentity`, `checkDarwinProcessStatus`).
- `state-baseline.cjs`: Pinned directory/file capture capabilities, final rehash with stat checks, and safe rewalk of missing paths without unverified pathname traversal.
- `history-store.cjs`: Capability traversal for history root and consultation directories, self-token verification before `history.lock` writes, and bounded storage sync.
- `history-query.cjs` & `history-prune.cjs`: Safe reopened read capabilities after scanner closure, bounded query reads, and capability-scoped prune of owned leaves and empty directories.
- `controller.cjs` & `isolated-workspace.cjs`: Canonical project identity hash convergence, temp-root resolution, descriptor-relative workspace creation (`created=true` verification), and capability-based recursive cleanup.

Key architectural and safety invariants:
- **Descriptor-relative capabilities:** Darwin managed I/O operates entirely via descriptor-relative capabilities; logical display paths are strictly metadata and never passed to raw Node filesystem mutation.
- **Scoped capability ownership (`owns_parent`):** `AdvisorCap` in `storage.c`, `advisor-native.c`, and `advisor-native.h` scopes parent descriptor lifecycle. Intermediate ancestor capabilities during `openRoot` walk set `owns_parent = true` to reclaim descriptors on leaf close, while child capabilities derived via `openDirectory` set `owns_parent = false` to preserve the caller's parent descriptor lifetime.
- **Self-token identity verification:** Valid non-null monotonic start token verification is mandatory before writing state/history locks or persisting pending consultation records.
- **Platform isolation:** Gated strictly by `process.platform === 'darwin'`, preserving Linux (procfs/kill-0/fd-pinning) and Windows (PowerShell/Job Objects) invariants without cross-platform leakage.
- **Cycle 3 static review warning:** Static review flags `owns_parent` as uninitialized for `/var` and `/tmp` intermediate capabilities, a potential descriptor leak; no macOS behavior has been tested.
- **Boundary:** Darwin implementation is present, but macOS addon loading, controller/provider execution, tests, and CI remain prohibited and untested/unqualified. Static review and Linux results do not qualify native behavior. See the [system architecture](./system-architecture.md) and [Phase 05 integration record](../plans/261003-1527-advisor-node-only-launch/phase-05-darwin-runtime-integration.md).

## VS Code Local target, qualification, and Phase 09 rollout

Schema-2 persists eight target IDs, including `vscode`; its target manifest writes
to `.evcrate-vscode`. `src/adapters/vscode/` contains native conversion and runtime
modules. `local-build-staging.ts` selects `vscodeAdapter` for this target; the other
seven adapters use the shared registry. The npm allowlist includes the generated
`.evcrate/source/.evcrate-vscode/**` bundle, but core release assets remain exactly
seven. Activation stays user-controlled through manual `chat.pluginLocations`
registration.

Phase 08 completed real VS Code Local qualification on Linux x64 (VS Code 1.140.0;
Copilot Chat 0.68.0), verified via the [qualification index](../plans/261002-2213-vscode-local-native-support/reports/native-local/qualification-index.md),
[Linux project receipt](../plans/261002-2213-vscode-local-native-support/reports/native-local/linux-x64-project/receipt.md),
and [Linux HOME receipt](../plans/261002-2213-vscode-local-native-support/reports/native-local/linux-x64-home/receipt.md).
The matrix reconciles all 50 capabilities (C01–C50) across 12 declared contexts: 6 qualified
on Linux x64, 5 unexercised due to physical workstation requirements, and 1 explicitly unsupported
(`other-remote-web`). Gates passed at 8/8 qualification tests, 737/737 full test suite, and score 9.4/10
(commit `cbd298a4`).

Phase 09 establishes documentation, controlled rollout, and lifecycle governance:
- Clear separation between GitHub Copilot CLI (`copilot`) and VS Code Local (`vscode`).
- User quickstart and manual registration guidance via `chat.pluginLocations`.
- Scoped recovery without editor settings mutation (`evcrate recover`).
- Coexistence rules for project and HOME plugin installations.
- Privacy boundaries (fail-closed security bridge, ask/deny human confirmation).
- Explicit stop-trigger criteria for version drift and announced upstream Local retirement.
## Windows advisor supervision, console repair, and verification

Readiness Repair Phase 02 integrates native supervision and human-decision observation into the shared controller. The completion review records 9/9 focused tests, 236/236 advisor-controller tests, build, and `release:check`; these are implementation evidence, not production Windows qualification.

- `runner.cjs` routes Windows provider invocations through `runWindowsSupervisorInvocation`; `windows-platform.cjs` starts the fixed PowerShell bridge, and `windows-native.ps1` dispatches to `windows-native.cs`.
- The native launcher assigns each provider to a kill-on-close Job at process creation, captures `{pid, startToken}` from the launch handle, frames bounded provider output separately from cleanup/exit records, and uses a distinct control/lifetime input for cancellation and EOF. Cleanup is confirmed only after a successful empty-Job query; unconfirmed cleanup blocks success/retry. Windows `taskkill` and teardown-time PID lookup are removed.
- `state-human.cjs` keeps state/replay preflight and revision checks around a Windows observer that opens `CONIN$`/`CONOUT$` independently of JSON stdin. Only exact `OBSERVED` creates an event; piped JSON never authorizes a decision. The POSIX process-group and `/dev/tty` paths remain.
- `tests/advisor-controller/verification-regressions.test.cjs` covers R1–R5 behavior: Job descendant cleanup after either leader outcome, standard OS-permission policy behavior, provider package selection/containment, no-clobber state creation under controlled and competing-process races, and replacement-workspace preservation.
- `tests/advisor-controller/verification-lifecycle.test.cjs` covers pinned-file CAS, supervisor output/timeout/cancellation, launcher tampering and Windows environment aliases, a fixture-backed isolated source CLI V2 lifecycle plus history operations, and unattended/piped-console rejection; it is not live vendor qualification.
- Phase 04 verification: **20/20** focused tests and **390/390** final required-suite runs across focused, advisor-controller, primitives, and protocol suites; independent review **9.0/10**, zero critical findings. Coverage instrumentation was not collected. These are implementation checks, not production Windows runtime qualification.
- Repair Phase 04 verification closed the separate repair track (20/20 focused tests, 390/390 final required-suite runs, 9.0/10 review). Native advisor Phases 01–04 are complete: Phase 03 observed live OMP `ADVICE_READY` and full Linux qualification passed 400/400; Phase 04 qualified OMP/Codex diagnostics. Claude/Pi remain unverified, and broad Windows runtime support remains outside the release boundary.

See the [system architecture](./system-architecture.md#6-advisor-supervision-and-command-projections), [code standards](./code-standards.md#advisor-controller-standards), and [PDR](./project-overview-pdr.md#fr-23-native-windows-advisor-lifecycle-implementation-phase-02).

## Phase 01 launchability and identity

Publication execution intent is derived from the published relative path and published shebang bytes (with explicit launcher roles), not from source permission metadata. The plan carries execution intent separately from content hashes and CAS identity: a content-equal no-op stays a no-op, while new or changed POSIX launchers receive the required execute bit. Required staging/install chmod failures are errors rather than successful fallbacks.

`hashFile` remains a raw byte SHA-256. Resource file roots use a domain-separated file identity shared by the canonical registry scanner/store and direct-file imports; directory roots retain their tree identity. A suffixless file therefore cannot alias a directory identity. Capability assessment remains separate from content hashing.

Advisor state and history comparisons ignore ctime and permission-only changes while retaining object/type metadata and explicit byte equality at state/history CAS boundaries. Lock ownership continues to bind token/process identity and the lock object. Baseline Git evidence normalizes executable-only mode metadata while preserving content/index, conflict, and rename identity.

The committed schema-1 `.evcrate/registry.json` was regenerated with the new file hashes. Existing records with prior raw-file hashes are not silently reinterpreted; `npm run generate:registry` performs a canonical rescan. Filesystem-policy Phase 02 later completed schema-3 journal writing, authentic schema-1/2 recovery, and mode-free executable-capability derivation from path type and shebang.


## Historical Advisor plugin and host integration

The former plugin worker and embedded host are retired; their design and Phase
E00–E05 / Workspace Phase 00–09 evidence below are historical. The standalone
picker/reader source and plugin package were removed, and the old Phase 09
qualification does not establish current native integration status. EVCrate
still maintains its core CLI/controller and shared viewer source. See the
[system architecture](./system-architecture.md), [historical all-project
history contract](./all-project-advisor-history.md), and [Workspace host
contract](./workspace-advisor-host-contract.md).

The Phase 06 standalone browser reader used an explicit multi-file picker with an
8 MiB per-document bound. That reader source has since been removed. Fixtures
`valid-mixed.json`, `digest-mismatch.json`, `invalid-observations.json`, and
`corpus-nine-cases.json` remain evidence for protocol boundaries; the **87/87 test**
result and **10/10 review** were recorded in 2026-09-18 and are historical.
The milestone handed off to Phase 07.

## Workspace Advisor host admission (Phase 01)

Phase 01 adds the selected-project `describeView` contract in the paired DamHopper host. The `packages/ui/src/api/` client and WebSocket transport call `POST /api/plugins/view-context`; the Rust route and plugin service resolve a required configured project/worktree and return safe metadata, canonical `workspaceProject` identity, effective operations, actual history/context scopes, and `authorityKey`.

The server derives `projectId` from the canonical target directory's UTF-8 bytes, never a browser-supplied ID or display label. Root history grants only four history reads; policy and evaluation permissions remain separately grant-protected. `authorityKey` is revision/equality metadata, not a credential, and the descriptor does not replace authorization on asset, open, or invoke requests.

See the [host contract](./workspace-advisor-host-contract.md) and [Phase 01 behavioral evidence](../plans/260929-1346-advisor-workspace-panel/phase-01-host-admission-and-identity.md). The documented phase record reports 102 passing checks; Phase 01 does not claim Workspace rollout or production deployment.

## Workspace Advisor history scope (Phase 02)

Phase 02 qualified existing EVCrate history behavior with sanitized fixtures: root All (`history-root`, `project_id: null`) includes valid-ID unmapped Project U (no registration or sidecar label), for 7 accepted records across six discovered directories; malformed JSON and directory/payload ID mismatch remain 2 invalid records. Project-bound null queries do not widen, foreign IDs reject, and cursors remain query-bound. Separately granted policy/evaluation reads work without history-root access. No production provider/scanner or v1/v2 schema change was required; the fixture is not a production-history census or end-to-end rollout. Review recorded 59 passing test executions and 9.6/10 approval. See the [Phase 02 plan](../plans/260929-1346-advisor-workspace-panel/phase-02-history-scope-and-unmapped-records.md) and [review](../plans/reports/code-review-260929-1850-phase-02-history-scope-and-unmapped-records.md).
Fixture sources: `tests/fixtures/advisor-history/workspace-panel-fixtures.mjs` defines the sanitized history root; `tests/plugin/workspace-panel-fixtures.test.mjs` covers Phase 02 scope, unmapped detail, bounded/cancelled scans, independent bound reads, and framed dispatch.

## Workspace Advisor bridge and reusable host (Phase 03)

Phase 03 completes the paired `workspace-advisor-v1` extension across the DamHopper SDK/host and EVCrate viewer. The version-`1.0.0` bridge keeps its generic-plugin handshake and adds `host.contextReady`, `host.workspaceChanged`, and `frame.uiIntent`; all messages remain bound to bridge version, frame session, and activation generation.

- The host advertises the extension and trusted Workspace context in `host.bootstrap`; `host.contextReady` follows port acknowledgement and successful authorized context open. The viewer does not report data readiness until then.
- `AdvisorWorkspaceContext` carries a positive revision, host-derived `authorityKey`, selected project ID/label, actual history/context scope, and effective operations. Selection updates use a higher revision and the same authority key; authority or owner changes revoke before replacement.
- `frame.uiIntent` is limited to `activate` / `dismiss`; it is accepted only for a negotiated, Ready, visible session and never grants a data operation.
- DamHopper `usePluginHost` owns selection/connection fencing, metadata and asset verification, frame-session lifecycle, and teardown. `PluginHost` is reusable presentation; `PluginHostPage` is the thin route wrapper. Same-authority project changes update the current frame instead of reopening it.
- EVCrate `AdvisorDataProvider` adds trusted workspace context/events and optional UI intent while keeping the eight E00 data operations unchanged. The host contract documents full envelope and lifecycle boundaries.

Implementation map: DamHopper `packages/plugin-sdk/src/ui-bridge.ts`, `packages/ui/src/plugins/{bridge-validators,bridge-host,use-plugin-host}.ts`, and `packages/ui/src/components/{PluginHost,PluginHostPage}.tsx`; EVCrate `viewer/src/providers/{bridge-contract,advisor-data-provider,dam-hopper-port-provider}.ts`. See the [Phase 03 plan](../plans/260929-1346-advisor-workspace-panel/phase-03-bridge-and-reusable-host.md), [review](../plans/reports/code-review-260929-2056-phase-03-bridge-and-reusable-host-cycle-2.md), and [host contract](./workspace-advisor-host-contract.md). The Phase 03 record predates Phase 05 placement, now documented below; paired end-to-end rollout remains unclaimed.

## Advisor Plugin data API and cross-project history (E00/Phases 01–05)

E00 completed with `evcrate-advisor-data` v1; Phase 01 froze v2 while retaining v1 schemas/semantics and on-disk history v1. See the [E00 plan](../plans/260920-1603-dam-hopper-advisor-plugin/phase-00-domain-contracts-and-parity.md), [E00 validation](../plans/reports/tester-260921-0805-phase-e00-domain-contracts-parity.md), [E00 review](../plans/reports/code-review-260921-0808-phase-e00-domain-contracts-and-parity.md), and [cross-project contract](./all-project-advisor-history.md).
- `advisor-plugin-data-api.ts` registers exactly `history.refresh`, `history.summary`, `history.page`, `history.detail`, `policy.readCurrent`, `evaluations.list`, `evaluations.read`, and `evaluations.compare`; validators reject unknown/authority fields, unsafe values, invalid IDs, and inconsistent results.
- `scripts/generate-advisor-plugin-data-schema.mjs` deterministically emits v1/v2 schemas and the supported-version manifest; `--check` rejects stale generated bytes.
- Positive/negative fixtures cover wire parity. V2 summary/page queries carry `project_id: string | null`; the same-snapshot per-project inventory is capped at 500 entries with counts independent of active filters.
- Phase 02 in DamHopper binds root history to the installation and authenticated history-only admission; the API refreshes its source cache from runner state on each context open.
- Phase 03 `context-table.cjs` binds root scope to the configured owner history root. `history-scanner.cjs` traverses sorted SHA-256 project IDs under shared budgets and marks cap-limited snapshots incomplete.
- `.evcrate/source/.evcrate/bin/lib/advisor/history-store.cjs` writes a sanitized basename to a version-1 `project-metadata.json` sidecar keyed by project ID under the cross-platform trusted-files policy; read failures or unknown names retain the record with a null label/abbreviated-ID fallback.
- Scanner and detail reads use `O_NOFOLLOW`, post-open descriptor checks, matching directory IDs, and device/inode/size/content fingerprints to prevent unsafe or changed-source reads.
- `cursor-manager.cjs` HMAC-binds snapshot, query, and offset; stable ordering is `started_at` descending, then project/task/consultation IDs ascending. `snapshot-store.cjs` accounts for normalized records and inventory under cache limits.
- `scripts/build-advisor-plugin-candidate.mjs` reuses `collectPluginPackageRecords` from `scripts/plugin/package-inventory.cjs`; the candidate and package manifest now share one closure inventory.
- Phase 03 review approved **9.5/10** and records **354/354 test executions passed** (0 failures, 0 skips); package, candidate-manifest, and distribution checks passed. See the [Phase 03 plan](../plans/260924-1055-all-project-advisor-history/phase-03-worker-history-provider.md) and [review](../plans/reports/code-review-260924-1628-phase-03-owner-safe-history-worker.md).
- Phase 04 threads same-snapshot inventory through refresh/summary into app state; `project_id` drives server-filtered summary/page and Overview, while project switches reset rows/detail/cursor and fence late responses. Project-only scope stays locked.
- History labels use validated inventory names with abbreviated canonical-ID fallback. Configuration labels current owner policy; Evaluations label their bound corpus; both disclaim History-project filtering. The provider label uses custom label/bootstrap plugin ID/generic fallback, never account or project identity. DamHopper filters exact ID `evcrate.advisor` from standalone navigation while preserving all other plugin IDs, including other `evcrate` publishers; its retired route returns `PluginUnavailableState reason="not-visible"` before plugin list, asset, or frame preparation.
- Phase 05 preserves malformed or identity-mismatched outcomes as `invalid` rather than `missing`; the local framed-worker benchmark checks 10,000 discovered records, accepted/invalid accounting, and cancellation samples. Paired qualification, artifact digests, and release decision are recorded in the [Release Evidence Manifest](../plans/reports/release-evidence-manifest-260924-2140-phase-05.md).

## Owner-safe plugin read provider (Phase E01)

Phase E01 completed on 2026-09-21 and supplied the read-only, context-bound
provider that Phase E02 wrapped in the pinned D00 worker. See the [phase plan](../plans/260920-1603-dam-hopper-advisor-plugin/phase-01-owner-safe-provider.md),
[verification](../plans/reports/audit-260921-1139-phase-e01-verification.md), and
[re-review](../plans/reports/code-review-260921-1216-phase-e01-fixes-re-review.md).

| Module | Responsibility |
|---|---|
| `plugin/backend/provider.cjs` | Rechecks binding, gates the eight E00 methods, validates params/results, and dispatches operations. |
| `plugin/backend/provider-errors.cjs` | Internal typed error taxonomy and sanitized error factories. |
| `plugin/backend/binding.cjs` | Absolute-path, project-identity, owner, non-symlink, realpath, and safe-regular-file checks. |
| `plugin/backend/snapshot-store.cjs` | Immutable per-context snapshots; 2/context, 128 MiB aggregate, 5-minute TTL, and LRU limits. |
| `plugin/backend/cursor-manager.cjs` | HMAC snapshot/query cursors, code-point tie breaks, 1..500 pages, and <=1 MiB responses. |
| `plugin/backend/history-scanner.cjs` | Sorted cooperative traversal, descriptor-pinned bounded reads, validation, normalization, and fingerprints. |
| `plugin/backend/history-detail.cjs` | Fingerprinted execution/outcome reread with `ready`, `changed`, and `missing` transitions. |
| `plugin/backend/history-provider.cjs` | Fair FIFO refresh (capacity 32), stale/unavailable handling, summary, page, and detail. |
| `plugin/backend/policy-provider.cjs` | Capability-gated 16 KiB current account-policy read with revision/status labels. |
| `plugin/backend/evaluation-provider.cjs` | Explicit descriptor-bound 8 MiB list/read/compare with provenance-preserving groups. |

- Policy/evaluation/history readers use `O_RDONLY | O_NOFOLLOW`, post-open regular-file, single-link, and size checks, and descriptor reads to close TOCTOU windows; filesystem UID-ownership checks were removed under the cross-platform trusted-files policy. History fingerprints bind device and inode as well as size/digest.
- `tests/plugin/provider.test.mjs` covers lifecycle, history, policy, and
  evaluation; `provider-cancellation.test.mjs` covers abort/deadline/stale
  retention and FIFO; `provider-source-safety.test.mjs` covers path/link/race
  safety and context isolation.
- Dated E01 verification (2026-09-21) recorded **56/56 passing** across 8 files; the 33-file controller closure remained unchanged (inventory delta `0`).
- The historical E02 worker wrapped this provider in the former D00 worker SDK;
  the plugin package and worker source were removed in the 2026-10-02 cutover.
  See the [historical integration record](./system-architecture.md#9-historical-damhopper-advisor-plugin-integration-retired-2026-10-02).
- At E03 completion, provider-neutral adapters covered the local picker and
  MessagePort paths. The local picker/reader source was later removed by the E05
  repository cutover; the old source and qualification boundary are retained in the
  [historical integration record](./system-architecture.md#9-historical-damhopper-advisor-plugin-integration-retired-2026-10-02).

## Historical React views and embedded provider (Phases 07/E03)

Phase 07 completed on 2026-09-19 as a private static React explorer. Phase E03
(2026-09-21; review 9.2/10) reused the shared app/views in the former DamHopper
opaque-srcdoc entry. The E03 source included a local File System Access picker
and reader; those standalone sources were later removed in the E05 cutover.
These dated design details do not describe a current plugin package, host
integration, or release qualification.

See the [Phase 07 plan](../plans/260917-2308-advisor-visual-metrics/phase-07-react-explorer-and-view-architecture.md),
[historical integration record](./system-architecture.md#9-historical-damhopper-advisor-plugin-integration-retired-2026-10-02),
and [E03 review](../plans/reports/code-review-260921-1718-phase-e03-embedded-four-view-ui.md).

### Retained shared React source

- `viewer/src/app.tsx` composes controls, status, tabs, the selected view,
  diagnostics, and footer.
- `viewer/src/app-state-types.ts`, `app-actions.ts`, `app-state-reducer.ts`,
  `app-state-selectors.ts`, and `app-state.ts` define shared immutable state,
  actions, reducer, and selectors. `activityScope` separates Workspace Project/All
  from metric filters; `selectHistoryQuery` derives scoped `project_id` from trusted
  Workspace context and rejects unavailable queries. Context epochs and query revisions
  fence late commits.
- `viewer/src/app.tsx` owns monotonic request IDs and independently refreshes
  authorized history, policy, and evaluation-list sources only on user action.
  Tab, scope, and filter changes do not trigger history refresh.
- `viewer/src/hash-view.ts` maps the hash to Overview, History, Configuration, or
  Evaluations. File-system picker/reader state is not a current source path.

### Current views, provider, and components

| Path | Responsibility |
|---|---|
| `viewer/src/views/overview-view.tsx` | Counts, rates, missingness, latency, methodological limitations, and activity-scope control. |
| `viewer/src/views/history-view.tsx`, `history-detail.tsx` | Workspace Project/All scope, inventory-backed labels/counts, server-filtered pages, and lazy detail. |
| `viewer/src/views/configuration-view.tsx` | Current account-wide policy is not filtered by History scope; route groups follow the selected history summary. |
| `viewer/src/views/evaluations-view.tsx`, `evaluation-detail.tsx` | Bound evaluation corpus is independent of History scope; comparable groups, provenance, and masked/revealed candidates. |
| `viewer/src/providers/advisor-data-provider.ts`, `bridge-contract.ts`, `dam-hopper-port-provider.ts` | Provider contract, validated bridge envelopes, and bounded MessagePort data path. |
| `viewer/src/components/activity-scope-control.tsx` | Shared ActivityScopeControl in Overview and History; labels the selected Workspace project and gates All History. |
| `viewer/src/components/` | Manual Refresh/Cancel controls, status, tabs, diagnostics, pagination, and inert text rendering. |
| `plugin/ui/plugin-main.tsx`, `plugin-document.html`, `vite.config.ts` | Mounts the shared App with `DamHopperPortProvider` and builds the embedded document. |

The Phase 07 standalone explorer acceptance recorded **28/28 tests passed**, strict
viewer typecheck/build with **zero TypeScript diagnostics**, and a **10/10 review**
on 2026-09-19. That evidence is historical; it does not verify the removed picker,
current release assets, or G4. The shared views render validated data and make no
mentor-quality or live-vendor claim.
Workspace Advisor Phase 04 review records **28/28 focused tests**, strict
TypeScript checking with zero errors, and a passing V-E3 call-count smoke proving
scope/filter/view transitions do not call `history.refresh`. See the
[phase record](../plans/260929-1346-advisor-workspace-panel/phase-04-viewer-scope-and-request-state.md)
and [review](../plans/reports/code-review-260929-2154-phase-04-viewer-scope-and-requests.md).

## Persistent Workspace Advisor placement (Phase 05)

DamHopper `WorkspacePage` mounts one `WorkspaceAdvisorHost` outside shell-mode branches. It owns the persistent `PluginHost`/iframe; IDE, Terminal, and compact shells render `AdvisorPanelSlot`s that register geometry and activation rather than owning or moving a frame.

- IDE right tool, Terminal floating panel, and compact full-height Workspace surface use modes `ide`, `terminal`, and `compact`, with default z-indexes 15, 25, and 35. The Terminal slot reserves `pb-8 pr-8` for the floating resize grip.
- The host projects a rounded, connected, nonzero slot rectangle into a fixed container. ResizeObserver, viewport resize/scroll, app zoom, and `workspace:layout-change` trigger coalesced measurements; observers, event listeners, and pending work are cleaned up with the active slot effect.
- With no active slot, the host stays mounted but is hidden, pointer-disabled, `inert`, and `aria-hidden`; focus returns to a connected launcher when possible. Placement does not alter project, editor, or terminal selection.
- The G5 Chromium fixture asserts one unchanged iframe DOM node across IDE → Terminal → compact → IDE and hide/reopen. It mocks `PluginHost`, so it does not directly observe live FrameSession, snapshot, or history-refresh identity. `use-plugin-host.ts` applies visibility to the session and revokes on unmount; direct internal session continuity remains an inference from production lifecycle and stable placement.
- Phase 05 review reports **106 unit + 12 browser tests passed**, clean `tsc --noEmit`, and 9.8/10 approval. The evidence handoff maps projectless admission and cleanup guarantees, distinguishing source behavior from direct test assertions.

**Source map:** DamHopper `packages/ui/src/components/pages/WorkspacePage.tsx`, `components/organisms/{WorkspaceAdvisorHost,AdvisorPanelSlot}.tsx`, `contexts/WorkspaceAdvisorContext.tsx`, `lib/workspace-advisor-placement.ts`, `organisms/TerminalFloatingToolPanel.tsx`, and `plugins/use-plugin-host.ts`. See the [Phase 05 plan](../plans/260929-1346-advisor-workspace-panel/phase-05-workspace-panel-placement.md), [contract](./workspace-advisor-host-contract.md#phase-05-persistent-workspace-panel-placement), and [evidence handoff](../plans/reports/docs-manager-260929-2357-phase-05-persistent-workspace-placement.md).


## Compact activity views and accessible tabs (Phase 06)

Phase 06 completed the shared viewer's compact Overview/History composition and
four hash-addressable tabs. The Cycle 2 review approved 10/10; final status
records 55/55 tests (43 EVCrate viewer, 12 DamHopper browser) and clean TypeScript
checks across both repositories. Phase 07 then added Configuration/Evaluations disclosures, bounded comparison, descriptor inspection, focus-safe detail, and candidate blinding. Phase 08 completed standalone navigation/package cutover; Phase 09 subsequently qualified the paired candidate with 11/11 browser scenarios and four screenshots. Production rollout remains subject to operator authorization.

- `HashTabs` preserves `#overview`, `#history`, `#configuration`, and `#evaluations`,
  with tab semantics, `aria-selected`, roving `tabIndex`, arrow/Home/End activation,
  and focused-tab scrolling. Escape remains available to the host shell.
- `ActivityScopeControl` is shared by Overview and History; it uses the selected
  Workspace project, disables All History when authority/provider/project is absent,
  and does not provide an independent project picker.
- Overview retains six rate ratios, latency quantiles/sample counts, outcome and
  missingness counts, and observational limitations. Narrow layouts stack cards.
- History retains status/outcome filters, cursor paging, all row fields, an Inspect
  action, and explicit detail transitions. Narrow cards and the wide table preserve
  the same data; details retain loading/changed/missing/error/ready states.
- Tab, scope, filter, disclosure, and row-selection actions do not trigger
  `history.refresh`; explicit Refresh/Cancel remains the scan control.

See [`hash-view.ts`](../viewer/src/hash-view.ts), `viewer/src/components/`,
`viewer/src/views/`, `viewer/src/styles.css`, and
`tests/viewer/{hash-view,compact-activity-views}.test.mjs` for the implementation
map. The Phase 06 review did not claim then-future Phase 09 paired qualification or production deployment. Phase 09 has since qualified the paired candidate; production deployment remains subject to explicit operator authorization.

## Configuration and Evaluations disclosures (Workspace Phase 07)

Phase 07 adds inspectable, responsive policy/history presentations and lazy evaluation comparison/detail without widening either source. The Phase 07 Cycle 2 review approved 9.6/10; its report records 13/13 targeted tests, 100/100 related suites, clean TypeScript checking, and a clean UI build. This is viewer implementation evidence, not paired rollout or production qualification.

- `ConfigurationView` separates the current owner-policy card from history-scope route metrics. Policy status/permission feedback and the visible isolation badge remain outside the collapsed native disclosure; full route/runtime parameters and raw JSON are shown only in the ready-state disclosure.
- Route metrics use cards below 640px (single column in narrow docks, including 180–260px; 260px-minimum columns when space permits from 580px) and replace them with a six-column table at >=640px. Cards retain route/effort, identities, consultation count, ratios, and p50/p95.
- `EvaluationsHeader` shows the bound source and list/comparison states. It reports descriptor count until groups exist; the explicit compare action sends only the first 32 available refs with their source revisions. Descriptor cards page 10 at a time, clamp the page after list changes, and invoke revision-checked reads only on Inspect.
- The inline inspected-evaluation card reports loading/error/ready state and, when ready, IDs/revision/rubric digest and candidate/case/observation counts. Comparable group cards use the returned cases/responses/human/automated-score counts and mount `EvaluationDetail` only for the selected group.
- The detail region intercepts Escape in the window capture phase and restores focus on unmount. Candidate reveal defaults off: sorted unique IDs across response and both score arrays map deterministically to Candidate A/B labels; identity, route, effort, build, and prompt details stay out of rendered attributes/text until explicit reveal. Context changes, revocation, disconnect, and incompatibility clear reveal state.

Source map: `viewer/src/views/{configuration-view,evaluations-view,evaluation-detail}.tsx`; `viewer/src/components/{policy-summary-card,route-group-card,evaluations-header,evaluation-descriptors-section,evaluation-descriptor-card,evaluation-group-card,comparable-groups-section,candidate-performance-table,score-provenance-card}.tsx`; `viewer/src/styles.css`; targeted contract `tests/viewer/phase-07-configuration-evaluations-ui.test.mjs`. See the [Phase 07 plan](../plans/260929-1346-advisor-workspace-panel/phase-07-bound-source-disclosures.md), [Cycle 2 review](../plans/reports/code-review-260930-0400-phase-07-cycle-2-disclosures.md), and [design guidelines](./design-guidelines.md#accessible-component-specifications).


## Standalone navigation and package cutover (Workspace Advisor Phase 08)

Phase 08 completed on 2026-09-30; the 9.8/10 review records 41/41 passing tests across EVCrate and DamHopper, package archive verification, and `cargo check`. DamHopper filters exact installation ID `evcrate.advisor` from standalone navigation and returns `PluginUnavailableState reason="not-visible"` on the retired route before host list/asset/frame preparation; generic plugin hosting remains. The regenerated EVCrate manifest uses `navigation: []` and `hostVersionRange: ">=0.7.0"`. Qualification server/client use `workspace_url`/`workspaceUrl` and launch through the Workspace Activity Bar; archive digests are in the [changelog](./project-changelog.md). Phase 09 paired qualification later passed 11/11 browser scenarios; production rollout remains subject to operator authorization.

## Historical packaging, CSP, preview, and release inventory (Advisor Metrics Explorer Phase 08)

Phase 08 completed on 2026-09-19. At that milestone, the standalone viewer had a
static-build, loopback-preview, and package boundary outside the advisor controller
closure. See the [Phase 08 plan](../plans/260917-2308-advisor-visual-metrics/phase-08-packaging-csp-preview-and-release-inventory.md).

### Current DamHopper Plugin UI build paths

| Path | Responsibility |
|---|---|
| `plugin/ui/tsconfig.json` | Strict ES2020/DOM browser typecheck with Bundler resolution, `react-jsx`, and isolated modules. |
| `plugin/ui/vite.config.ts` | Inlines styles and classic scripts into `plugin/ui/index.html` with zero external assets. |
| `plugin/ui/plugin-main.tsx` | Mounts the shared React App with `DamHopperPortProvider` for embedded iframe execution. |

### Historical package and release boundary

- The Phase 08 package inventory excluded standalone viewer source from the root
  package and recorded the then-current exact-seven release-asset contract.
- Phase 08 evidence recorded **39/39 tests passed** and a **298.5 kB <= 5 MiB**
  standalone viewer bundle. The controller inventory was 33 files at that time.
  These dated results do not verify current release assets, G4, or authorize
  standalone retirement.

## Historical qualification, benchmarks, and documentation cutover (Phases 09–10)

Phase 09 reports from 2026-09-19 recorded the following standalone viewer evidence:
- **Browser qualification:** 14 Playwright tests exercised scanning, handle revocation,
  manual Refresh/Cancel, stale retention, CSP, network blocking, keyboard navigation,
  visible focus, and responsive views.
- **Frozen 10,000-consultation benchmark:** five runs recorded p95 scan 1,643 ms
  (<= 5,000 ms), p95 detail 67 ms (<= 100 ms), cancel 104 ms (<= 250 ms), and zero
  long tasks above 200 ms. Web Worker fallback was not needed.
- **Package/cutover checks:** Historical reports recorded six package inventory
  tests, seven distribution cutover tests, the 33-file controller closure, and an
  exact-seven asset boundary; they are not current release-asset verification.
- **Phase 10 documentation cutover:** The 2026-09-19 docs recorded then-current
  viewer operation, CSP/network boundaries, metric limits, and Chromium/Linux scope.
  Later source removal does not convert that evidence into G4 qualification.


## Historical advisor state and audit modules (Phases 06–07)

These 2026-09-08 mentoring phases are separate from the current metrics
explorer. The historical state module added owner-only task reservations,
dispositions, outcomes, three-cycle `needs_human`, and cooperative TTY
continuation; the history modules added sanitized execution/outcome records,
CAS settlement, bounded list/show/export/prune, and read-only `history metrics`.
The generated controller inventory remains authoritative. See the
[state plan](../plans/260907-1208-advisor-mentoring-recovery-audit/phase-06-task-state-scope-and-human-handoff.md),
[audit plan](../plans/260907-1208-advisor-mentoring-recovery-audit/phase-07-audit-history-and-outcome-review.md),
and [audit evidence](../plans/reports/tester-260908-1344-phase07-final-verification.md).
Historical evidence remains 185/185 state tests and 204/204 controller tests;
the current 44-file closure, including the Darwin native build assets, and current
metrics-explorer implementation are documented in their respective sections above.


## Cooperative mentoring across commands and harnesses (historical Phase 08)

The 2026-09-08 milestone made
`.evcrate/source/.claude/workflows/advisor-mentoring.md` the single authored
checkpoint dispatcher for 16 code/cook/bootstrap/fix consumers. It preserves
the reserve → claim/attach → disposition → outcome → complete lifecycle,
explicit dispositions, exact correction ordinals, durable `needs_human`, and
baseline-preserving review. All seven projections declare mentoring supported
with `writeChecks: advisory-only`; generated markers are not live vendor or
host-enforcement proof. See the
[Phase 08 plan](../plans/260907-1208-advisor-mentoring-recovery-audit/phase-08-workflow-and-harness-gate-integration.md)
and [integration evidence](../tests/adapters/phase08-mentoring-integration.test.mjs).
Evidence: 279/279 tests; Lead Mentor approval 10/10.

## Windows release qualification asset boundary (Phase 02)

Phase 02 (2026-09-14) freezes the read-only release-asset boundary used by
candidate, predecessor, and publisher phases. See the
[phase plan](../plans/260914-0636-windows-release-qualification/phase-02-exact-release-asset-verifier-and-prepare-boundary.md),
[design contracts](../plans/260914-0636-windows-release-qualification/design-contracts.md#exact-asset-verification),
and [acceptance matrix](../plans/260914-0636-windows-release-qualification/acceptance-matrix.md).

- `scripts/release/asset-verification.cjs` reuses `release-contract.cjs` for
  canonical names, code-point ordering, strict sidecar parsing, metadata
  validation, and digest policy. It exports
  `getExpectedReleaseAssetNames`, `sha256File`, `verifyWindowsAssetSet`,
  `verifyReleaseAssetSet`, `parseVerifierArgs`, and `main`.
- Exact-seven `verifyReleaseAssetSet` permits only
  `evcrate-v<version>-linux-x64.tar.gz`, its `.sha256` sidecar,
  `evcrate-v<version>-windows-x64.zip`, its `.sha256` sidecar,
  `evcrate-v<version>.release.json`, `install.sh`, and `install.ps1`.
  Exact-four `verifyWindowsAssetSet` permits only the Windows archive, its
  sidecar, release metadata, and `install.ps1`; Linux records may remain in
  metadata but Linux files must be absent from this directory.
- Both sets enumerate once, `lstat` every entry, reject directory/symlink/
  special-file entries, enforce exact membership, validate metadata version,
  `v<version>` tag, lowercase 40-hex `source_commit`, required platform and
  installer records, strict sidecar bytes, archive/installer sizes, and
  streaming SHA-256 digests. Caller `tag`, `sourceCommit`, `expectedHashes`,
  and expected file records can strengthen checks; unknown expected file keys
  reject. No verifier path writes, repairs, or regenerates bytes.
- Successful verification returns the frozen
  `{version, tag, sourceCommit, files, metadata}` summary. Materialized file
  records contain name/size/SHA-256 in canonical code-point order.
- `semantic-release-asset-prepare.cjs` requires
  `EVCRATE_RELEASE_ASSET_MODE`; after trimming, only `build` and `verify` are
  accepted, and mode validation runs before filesystem/process work. Build
  delegates `scripts/prepare-release-assets.cjs <version>` then verifies
  exact-seven output. Verify checks existing `dist/release` only and cannot
  build, invoke npm/distribution, or regenerate missing/tampered assets.
- `.releaserc.json` changes only the exec `prepareCmd`; analyzer, notes,
  changelog, npm, GitHub, and git plugin order/specifications remain intact.
  `tests/distribution/private-release-artifacts.test.mjs` covers WRQ-007–012:
  exact sets, identity/tamper/receipt-hash rejection, no-mutation behavior,
  mode isolation, CLI parsing, and configuration structure.

## PowerShell installer safety and lifecycle (Phase 03)
Phase 03 (2026-09-14) hardens the standalone `install.ps1` state machine; this is an internal contract and does not qualify native Windows support.
- `Resolve-InstallRoots` validates root ancestry before optional creation; already-uninstalled teardown does not recreate roots.
- `Acquire-InstallLock` uses exclusive create, no sharing, delete-on-close semantics, and a random token; legacy stale locks are rename-quarantined only, and release disposes the handle.
- `Test-ContainedPath`/`Assert-ContainedPath` enforce canonical case-insensitive separator boundaries; `Test-InventoryPathSafety` validates snapshot and receipt keys before combination.
- `Assert-NoReparseAncestor` walks root-to-leaf, including dangling reparse fallback; directory creation and every state/pointer mutation are checked before and after writes.
- Journals use same-directory flushed temporary files and atomic replace/move; recovery validates schema and stage/target containment.
- Extraction is two-pass and bounded, rejects links/collisions, creates each file without overwrite, and records hashes; rollback verifies receipt inventory before repointing.
- Uninstall deletes receipt-owned files only, reports survivors with nonzero status, verifies PATH removal, and removes only empty owned roots; install/repair alone require Node.
- Native `powershell.exe`/`pwsh.exe` lifecycle execution was verified on hosted `windows-2025` x64 in Phase 09.
Evidence: [Phase 03 plan](../plans/260914-0636-windows-release-qualification/phase-03-powershell-installer-safety-and-lifecycle.md), [acceptance matrix](../plans/260914-0636-windows-release-qualification/acceptance-matrix.md), and [cycle 3 review](../plans/reports/code-review-260914-1407-phase-03-powershell-installer-safety-and-lifecycle.md).

## Deterministic Windows fixture and predecessor resolver (Phase 04)

Phase 04 (2026-09-14) adds the reproducible Windows predecessor boundary. See
the [phase plan](../plans/260914-0636-windows-release-qualification/phase-04-deterministic-windows-fixture-and-predecessor.md),
[acceptance matrix](../plans/260914-0636-windows-release-qualification/acceptance-matrix.md),
and [cycle 2 review](../plans/reports/code-review-260914-1805-phase-04-deterministic-windows-fixture-predecessor-cycle-2.md).

| Module | Responsibility |
|---|---|
| `fixture-records.mjs` | Fixed `FIXTURE_BUILD_TIMESTAMP` and minimal deterministic records. |
| `release-fixture-shared-helpers.mjs` | Shared sorted-record, controller/build-manifest digest, and real-installer authorities. |
| `windows-release-fixture.mjs` | `buildWindowsTestReleaseSet`, using `buildReleaseArchives` and real `install.ps1`, returns exactly ZIP/sidecar/metadata/installer records. |
| `private-release-fixture.mjs` | Linux fixture compatibility through the shared authorities. |
| `predecessor-resolver-core.mjs` | Bounded GitHub release pagination, stable semver filtering, exact-label qualification, canonical asset names, and irreversible plan selection. |
| `predecessor-downloader.mjs` | Bounded streaming downloads, cross-origin token stripping, private staging, exact-four verification, post-promotion verification, and cleanup. |
| `prepare-windows-predecessor.mjs` | Bootstrap/qualified orchestration and strict CLI/library boundary; handoff shape is `{kind, version, tag, sourceCommit, files, directory}`. |
| `windows-predecessor-mock-releases.mjs` and three `windows-*` suites | Determinism, resolver state/tamper/API cases, and subprocess CLI coverage. |

The resolver starts in bootstrap mode only when no stable release has the exact
Windows archive and installer labels. It builds verified `1.0.0`/`v1.0.0` bytes
with the fixed lowercase `a`×40 source identity and requires candidate `>` 1.0.0.
After any qualified release, it inspects only the latest stable release; an
unqualified latest, missing/tampered/duplicate asset, or required API/token
failure aborts without older-release or bootstrap fallback. Qualified downloads
contain only the Windows ZIP, sidecar, release metadata, and `install.ps1`.

Cycle 2 evidence: targeted Phase 04 suites 7/7, release suite 17/17, Linux
installer suite 15/15, total 39/39 (100%); code review approved 10/10. Predecessor
transitions and downloads were integrated into the full matrix qualification in Phase 09.

## Windows release candidate, qualification, and support cutover (Phases 05–10)
- **Qualification harness (Phase 05)**: `tests/installers/windows-release-qualification.mjs` runs strict CLI/host/byte preflight, safe PowerShell/`cmd.exe` invocation, and smoke/full lifecycle/negative flows.
- **Candidate & publisher (Phase 06)**: `run-release-candidate.cjs` uses a bare mirror and stages exact assets plus receipt; `publish-release.cjs` verifies receipt/hashes and copies only verified assets.
- **Release workflow (Phase 07)**: `.github/workflows/release.yml` implements least-privilege producer (`contents: read`), 4-row matrix (`windows-2025` x64, Windows PowerShell 5.1 and PowerShell 7, Node 22.19.0 and 24.21.0), exact-ID handoff, and publisher (`contents: write`).
- **PR smoke (Phase 08)**: `.github/workflows/windows-smoke.yml` provides unprivileged diagnostic smoke on Windows PowerShell 7 + Node 22.19.0 with fixture identities; `.releaserc.json` locks exact Windows labels.
- **Integrated qualification (Phase 09)**: Proved full gate sequence, bare-mirror isolation, tamper rejection, 4-row matrix routing, irreversible predecessor transitions, rerun boundaries, and final seven-file byte identity.
- **Support cutover (Phase 10)**: Updated `README.md` and core docs with bounded installer/version support and explicit runtime/desktop/signing exclusions.
## Historical advisor mentoring Phase 10 deterministic acceptance (DONE 2026-09-08)

The prior advisor milestone's deterministic acceptance gate is verified; live
vendor qualification, empirical paired comparison, and production HOME
publication remain operator-gated. See the [QA report](../plans/reports/qa-260908-1915-phase10-acceptance.md)
and [acceptance matrix](../plans/260907-1208-advisor-mentoring-recovery-audit/acceptance-matrix.md).

Fixtures used disposable owner-only HOME/project roots, fake Codex/OMP routes,
Git baselines, bounded subprocesses, and credential/PAT scrubbing. The evaluation
corpus contains nine sanitized cases (one positive, eight failure-oriented) over
direction, scope, safety, actionability, and evidence dimensions; threshold `4.0`.

| Suite | Cases | Coverage |
|---|---:|---|
| `phase10-controller-scenarios.test.mjs` | 7 | Success/failure, streams, unsupported route, cancellation, scrubbing. |
| `phase10-state-and-history.test.mjs` | 3 | Stale evidence, replay/history, dirty-baseline preservation. |
| `phase10-human-gate.test.mjs` | 1 | Three failures enter `needs_human`; fourth is denied. |
| `phase10-commands-and-evaluation.test.mjs` | 4 | Seven targets, V2/`--advice`, corpus, adversarial counsel. |
| **Dedicated total** | **15** | **15/15 passed** |

Deterministic evidence: phase10 suites 15/15; advisor-controller 204/204;
adapters 24/24; `release:check` verified 29/29 closure files; Linux installer
15/15; cutover/validation 13/13; total 272/272. These fixtures verify
repository contracts and sanitized transitions, not paid model quality, live
vendor authentication, or universal host enforcement. All seven targets remain
`writeChecks: advisory-only`; production `$HOME/.evcrate/` was untouched.

## Advisor invocation modes

A final standalone `--advice` enables explicit checkpoint mentoring. Handoffs
preserve the mode and active run identity; default mode carries no advice token.
The main-session `/cmd-advise` interview remains separate from checkpoint routing.
See the [canonical argument-mode and caller lifecycle](../.evcrate/source/.claude/workflows/advisor-mentoring.md#argument-mode).

- **Fresh review:** The parent settles implementation, actual declared validation, reviewer output, selected documentation/artifacts, and relevant writers behind a writer barrier, then initializes once immediately before the first checkpoint.
- **Active run:** Retain run/phase/project identity, revisions, prior context, and correction accounting; the parent alone owns state. Accepted registered work requires validation and its matching outcome before the next checkpoint; resume existing actions without duplication. Disputed counsel without active work uses a supported disposition, read-only evidence/resolution, and fresh same-run counsel before writes or a resolved outcome, without invented work/outcome. No replacement ID or implicit refresh.
- **Baseline:** `baseline_paths` is the union of authorized writable paths and selected evidence files/artifacts. Read-only evidence remains captured, but only `authorized_paths` grants write permission.
- **Freeze:** Keep the complete baseline and selected Git index/status identity unchanged from evidence/baseline capture through reservation, inference, and disposition, and from final outcome through completion.
- **Finalization:** Whole-phase approval includes planned docs, reports, status, and selected index transitions. Authorize them, record disposition, perform bounded work, validate, then record a truthful outcome with actual paths before `complete`.
- **No-change:** Require no file/index/status changes, passed declared validation, `accept`, and no `must_fix` or unresolved questions; cautions/assumptions alone need no edits. Advice completion requires successful durable completion; ordinary default completion retains normal approval/validation.
- **Limits and recovery:** The three reviewer/advisor-cycle cap differs from durable `correction_count` (unsuccessful completed corrections; the third failure requires `needs_human`). Stale init-only authentic abandonment is separate and was not exercised in the fixture smoke.
- **Progress surfaces:** The shared `Plan progress and phase reconciliation` contract drives code variants, related completion owners, planner/status writers and archive/validation guards. Advice-controlled plans use uncaptured `progress.md` plus immutable scope/run receipts; sealed plan/status files remain historical. Ordinary plans still update `plan.md`; a new default phase in a protected plan records non-durable approval/validation evidence without a new controller run.
- **Selection and recovery:** Reconcile identity, scope, successful completion ledger operation and resolved outcome before dependent dispatch; abandonment is not success. Keep active-run gates even without the flag. Missing/conflicting evidence blocks dependent work; stale overview or interrupted receipt publication never causes duplicate implementation. Parent alone repairs administrative outputs; controller schemas and freshness enforcement are unchanged.

## Distribution publication rules

Target manifests own publication transforms; generated output is never hand-edited.

| Rule | Target | Effect |
|---|---|---|
| `omp-agent-prefix` | OMP | Prefixes every published relative path with `agent/`. |
| `codex-home-path-rewrite` | Codex | Rewrites `hooks.json` and `config.toml` paths to the destination HOME root. |
| `claude-skill-root-exclusion` | Claude | Omits root-level `skills/*` files while retaining nested skill packages. |
| `reject_unmanaged_collisions` | Copilot | Blocks publication when an unmanaged destination path collides; Copilot alone enables this flag. |

Build resolution uses `.evcrate/build-manifest-<target>.json` for one selected
target and `.evcrate/build-manifest.json` for multiple or all targets.


## Hook materialization scope distribution and release verification (Phases 01–09)

Phases 01–08 deliver scope-aware publication (`--scope home|project`, defaulting
to `home`), neutral runtime closures, two-phase transactions, schema-2 state
migration, scope-isolated recovery, and installed Linux release verification.
Phase 09 reconciles and finalizes operator documentation against that proof:

1. **Scope and destination matrix**:
   - **Shared infrastructure**: The advisor controller closure (`.evcrate/bin`) is unconditionally
     materialized under `<home>/.evcrate/bin` across all scopes. `--target` never filters shared controller
     publication, and the controller is never materialized under a project root.
   - **Seven target projections**:
     - Claude: `<home>/.claude` (HOME) / `<project>/.claude` (Project).
     - Codex: `<home>/.agents` then `<home>/.codex` without root doc (HOME) / `<project>/.codex`, `<project>/.agents`, then `<project>/AGENTS.md` (Project).
     - Gemini: `<home>/.gemini` without root doc (HOME) / `<project>/.gemini` then `<project>/GEMINI.md` (Project).
     - Antigravity: mapped to `<home>/.gemini/config` via structured rule (HOME) / `<project>/.antigravity` (Project).
     - Pi: `<home>/.pi` (HOME) / `<project>/.pi` (Project).
     - OMP: `<home>/.omp` with declared path mapping (HOME) / `<project>/.omp` (Project).
     - Copilot: `<home>/.copilot` (HOME) / `<project>/.copilot` (Project).

2. **Preflight and two-phase transaction semantics**:
   - Preflight validates real owner-controlled directories, non-symlink ancestry, canonical project
     root (SHA-256 `projectIdentity`), intra-/cross-target descriptor overlap, and same-volume atomicity.
   - HOME publication executes as a single atomic transaction under the HOME publication lock.
   - Project publication executes in two phases:
     1. Shared commit to `<home>/.evcrate/bin` under the HOME publication lock.
     2. Project harness commit to `<project-root>` under the project workspace lock (holding HOME lock, never reversing lock acquisition).
   - Partial failure: If project harness application fails after shared commit, only the project workspace
     is rolled back. Shared HOME commit is never compensated. If rollback succeeds, the result is
     `status: 'partial'` with `PUBLICATION_FAILED` (exit category 5). If rollback fails, the journal is
     preserved with `ROLLBACK_FAILED` (exit category 5) for operator recovery.

3. **Schema-2 scope-isolated recovery**:
   - `evcrate recover --scope project --project-root <dir>`: Validates matching canonical `projectIdentity`
     and recovers only project publication state under
     `stateRoot/project-publication/<canonical SHA-256 identity>`.
   - Quiescence is strictly required; recovery never crosses requested scope boundaries.

4. **Installed release verification**:
   - Modularized installed assertions in `scripts/release/installed-lifecycle-assertions.cjs` (< 200 LOC)
     integrate with `scripts/release/linux-verification-assertions.cjs` and `scripts/verify-private-linux-release.cjs`.
   - Verifies HOME non-mutation on installation, all-seven HOME publication with shared controller,
     project publication to an independent workspace without a project controller, multi-target execution
     from a foreign workspace, partial failure rollback/isolation, and package snapshot byte invariance throughout.
   - Release gates pass sequentially: `test:release` (10/10), `test:installer:linux` (15/15),
     `test:validation-rollout` (6/6), `test:distribution:rollout` (5/5), and full test suite (512/512).
## Projection map

- Claude is canonical; Codex, Gemini, Antigravity, Pi, OMP, and Copilot are
  fixed TypeScript projections with target-specific transforms and validation.
- OMP emits `evcrate/command-name-map.json` and flattens nested commands with `__`.
- Copilot emits `evcrate-cmd-*` skills with raw `$ARGUMENTS`; it is not an advisor
  backend. Pi keeps its runtime/extension and settings-merge boundary.

### Command naming note

Core docs use `/cmd-*`; OMP nested names use `__`, and Copilot uses
`/evcrate-cmd-*`. The canonical scanner/parser do not yet enforce this convention;
it is a documented follow-up, not a source rename. Shell commands remain executable
syntax, not slash resource names.

## Documentation navigation

- [System architecture](./system-architecture.md) — central contracts.
- [Project overview and PDR](./project-overview-pdr.md) — requirements.
- [Workspace Advisor Product Requirements](./workspace-advisor-pdr.md) — detailed Phase 01–09 requirements and acceptance criteria.
- [Code standards](./code-standards.md) — implementation rules.
- [Project roadmap](./project-roadmap.md) — phases and gates.
- [Project changelog](./project-changelog.md) — historical evidence.
- [Project changelog archive](./project-changelog-archive.md) — older detail.
- [Historical Advisor integration records](./all-project-advisor-history.md), [Workspace host contract](./workspace-advisor-host-contract.md), and [Workspace Advisor PDR](./workspace-advisor-pdr.md) — former plugin-era contracts and evidence.
- Canonical docs validator: [`validate-docs.cjs`](../.evcrate/source/.claude/scripts/validate-docs.cjs) searches hidden source, excludes heavy directories, and distinguishes incomplete searches from missing references.
