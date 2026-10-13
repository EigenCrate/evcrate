# Codebase Summary

**Maintained:** 2026-10-13
**Source:** Canonical resources and TypeScript control-plane contracts for the 3.0.0 release on `main`, including completed advisor subsystem retirement cutover and VS Code `evc`/`cmd-*` container mapping; live vendor/native-host qualification remains separate.
**Package:** Private npm package `evcrate` 3.0.0; Node `>=22.19.0`.
Single binary: `evcrate` (`dist/cli/evcrate.js`).
**Qualification:** Historical candidates and test counts do not qualify the current package. Windows support is limited to standalone installer lifecycle and `version --json`; actual-host native qualification remains separate.

EVCrate builds and publishes validated projections of one canonical agent-harness
source tree. The TypeScript CLI is the package control plane.
## Source-of-truth map

| Path | Role | Editing rule |
|---|---|---|
| `.evcrate/source/.claude/` | Canonical harness resources | Author 137 resources: 17 agents, 69 commands, 13 hooks, 34 skills, 4 workflows. Do not hand-edit target copies. |
| `.evcrate/targets/` | Schema-2 target manifests and overlays | Change target policy or declared overlays, then rebuild. |
| `.evcrate/source/{.claude-projection,.agents/skills,.codex,.antigravity,.pi,.omp,.copilot}/` and declared native project documents | Generated target projections | Regenerate; never treat as authoring roots. |
| `.evcrate/source/.evcrate-vscode/` | Generated VS Code Local plugin bundle | Regenerate from canonical resources and the `vscode` target manifest; do not hand-edit. |
| `.evcrate/registry.json` | Schema-2 canonical resource records | Regenerate from the canonical 137-resource scan; distinct from target/build manifests. |
| `src/` | TypeScript control plane | Primary package implementation. |
| `scripts/` | Generation, package, release, benchmark (`benchmark-build-generation.mjs`), and TypeScript incremental build tooling (`build-typescript.mjs`, `typescript-build-cache.mjs`, `typescript-build-receipt.mjs`) | Follow each script's declared authority; generated outputs are not edited by hand. |
| `tests/` | Contract and behavior suites | Focused regression and integration tests, not live vendor qualification. |
| `docs/`, `plans/` | Maintained documentation and work plans | See the documentation map below. |
| `ext/` | Standalone extension packages | Author standalone extensions outside canonical harness (e.g. Snyk specialist, SonarQube test quality). |

The persisted target IDs are `claude`, `codex`, `antigravity`, `pi`, `omp`, `copilot`, and `vscode`. Standalone Gemini is retired, not Antigravity's vendor HOME directory. Codex owns `.agents/skills`; Antigravity owns exact `.agents` hook/rule leaves. `vscode` uses a separate local-build adapter route; generated outputs and manifests are build artifacts.

## TypeScript module map and exact exported symbols

| Area | Responsibility | Exact exported symbols |
|---|---|---|
| `src/cli/` | CLI parsing, process runner, request-file decoding, dispatch, and JSON/TTY result rendering | `main`, `parseArguments`, `dispatchInvocation`, `runCompatibilityDistribution`, `runTypedPublication`, `MAX_CLI_TIMEOUT_MS`, `CliCommand`, `CliOptions`, `CliInvocation`, `renderResult`, `writeResult`, `exitCodeForResult`, `readBoundedRequestFile`, `resolveRequestFile`, `runBoundedProcess`, `sanitizeEnvironment` |
| `src/protocol/` | Bounded JSON, canonical JSON, wire validation, resource contracts, publication/recovery payloads | `ResourceRequest`, `ResourceResult`, `RESOURCE_OPERATIONS`, `RESOURCE_PROTOCOL`, `PROTOCOL_VERSION`, `PERSISTED_TARGETS`, `PublishRequestPayload`, `RecoverRequestPayload`, `PublicationChange`, `DryRunPhaseRecord`, `ApplyPhaseRecord`, `RecoveryPhaseRecord`, `ScopeRevisionVector`, `ScopeAssignment`, `ChangesPreviewResultPayload`, `PUBLICATION_BINDING_ORDER`, `PREDECESSOR_BINDING_ORDER` |
| `src/manifests/` | Schema-2 target manifest loading, aggregate registry, manifest validation and digests | `loadTargetManifest`, `loadTargetManifestRegistry`, `loadSelectedManifests`, `validateManifestSet`, `buildManifestBytes`, `buildManifestDigest`, `TargetManifest`, `TargetManifestRegistry`, `BuildManifest` |
| `src/filesystem/` | Host/portable paths, symlink ancestor rejection, SHA-256 tree hashing, atomic file writes, staged root lifecycle, and lock protocols | `normalizeRelativePath`, `containedPath`, `assertNoSymlinkAncestors`, `assertRegularFile`, `assertRealDirectory`, `hashFile`, `treeHash`, `completeTreeHash`, `writeAtomicFile`, `writeAtomicProjectionFile`, `createStagedRoot`, `assertStagedRoot`, `removePath`, `sameVolume`, `withLock`, `withPublishLock`, `readReleaseMarker`, `writeReleaseMarker`, `PUBLISH_LOCK_NAME`, `RELEASE_MARKER_NAME` |
| `src/context/` | Immutable invocation context, safe path resolution, target registry selection, and project identity | `resolveInvocationContext`, `InvocationContext`, `SelectedTargetContext`, `assertNoDescriptorOverlap`, `resolveSafePath`, `resolveProjectIdentity` |
| `src/distribution/` | Local build/check orchestration, worker pool, snapshot isolation, publication planning, journal v4/marker v3 transactional promotion, collision checks, legacy leftovers, and recovery | `runLocalBuild`, `runAllManifestsBuild`, `runLocalCheck`, `runLocalDistribution`, `assembleLocalStage`, `buildAndStageTarget`, `resolveCurrentBuild`, `resolveCurrentPublicationBuild`, `validateBuildManifest`, `verifyBuild`, `verifyOutputHashes`, `publishDryRun`, `publishApply`, `recoverPublication`, `isMigratedDestination`, `detectLegacyLeftovers`, `reconcileRetiredBindings` |
| `src/scopes/` | Global and project scope assignments, revision CAS vectors, change preview tokens, and mutations | `effectiveAssignmentFor`, `loadScopeState`, `scopeMutationCandidate`, `applyScopeMutation`, `previewScopeChange`, `applyScopeChange`, `canonicalProjectRoot`, `projectIdentity` |
| `src/imports/` | Bounded external resource tree ingestion, preview tokens, and transactional canonical promotion | `prepareImport`, `assertPreviewBinding`, `applyImport`, `readImportSource`, `canonicalImportDestination` |
| `src/registry/` | Canonical resource rescan (137 resources), domain-separated file hashes, schema-2 store, and queries | `scanCanonicalResources`, `validateRegistryDocument`, `loadResourceRegistry`, `listResources`, `getResource`, `upsertResource` |
| `src/adapters/` | Target projection adapters, canonical naming authority, native delivery formats, catalog layout, and VS Code Local transforms | `ProjectionAdapter`, `ProjectionBuildContext`, `ProjectionValidation`, `ProjectionExpectedEntry`, `registerProjectionAdapter`, `registerProjectionAdapters`, `getProjectionAdapter`, `requireProjectionAdapters`, `PROJECTION_REGISTRY_ORDER`, `PROJECTION_QUALIFICATION_ORDER`, `COMMAND_PREFIX`, `SEGMENT_SEPARATOR`, `AGENT_PREFIX`, `COPILOT_STYLE_PREFIX`, `parseCommandName`, `formatCommandName`, `commandNameFromSourcePath`, `assertAgentName`, `assertUniqueNames`, `claudeAdapter`, `antigravityAdapter`, `codexAdapter`, `piAdapter`, `ompAdapter`, `copilotAdapter`, `vscodeAdapter`, `discoverAllVscodeNames`, `convertVscodeCommands`, `convertVscodeAgents`, `convertVscodeSkills`, `convertVscodeHooks`, `replaceCommandInvocations`, `transformVscodePrompt`, `mapAgentTools`, `VSCODE_LOCAL_HOOK_EVENTS` |
| `src/errors/` | Control-plane error hierarchy, sanitized messages, and stable exit-code mapping | `ControlPlaneError`, `SerializedControlPlaneError`, `CONTROL_PLANE_ERROR_CODES`, `CONTROL_PLANE_EXIT_CODES` |
| `scripts/` | Incremental TS build caching, manifest generation, registry generation, release packaging, and sandboxed verification | `buildTypeScript`, `PROJECT_ROOT` (`build-typescript.mjs`), `validateAndInvalidateCache`, `isBuildInfoCorrupt` (`typescript-build-cache.mjs`), `cleanStaleOutputs` (`typescript-build-receipt.mjs`), `build-manifests.mjs`, `benchmark-build-generation.mjs`, `generate-resource-registry.mjs`, `verify-private-linux-release.cjs`, `prepare-release-assets.cjs` |

The CLI resolves context, validates one invocation, dispatches one operation, writes one validated result, and exits. It exposes version, resource/import operations, scopes/changes, and distribution build/check/publish/recover. There is no canonical root `distribute.py` runtime.
## Build, publication, and installer flow

`npm run build` compiles the TypeScript control plane incrementally via `scripts/build-typescript.mjs -p tsconfig.json`. `npm run build:clean` uses `--clean`, invalidating `.tsbuildinfo` while preserving prior receipts for stale-output ownership cleanup. Distribution build/check creates and verifies target projections and strict BuildManifest v3.

### TypeScript incremental build caching architecture

TypeScript builds use a compiler-driven incremental caching subsystem orchestrated by `scripts/build-typescript.mjs`:
- **Cache locations & configuration**: `tsconfig.json` declares `"incremental": true` with `.cache/evcrate/tsconfig.tsbuildinfo`. The `.cache/` root is excluded via `.gitignore`.
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
- **In-memory metadata derivation**: `deriveManifestView` constructs seven single-target manifests (`build-manifest-<target>.json`) and one aggregate manifest (`build-manifest.json`) without duplicate projection runs or disk re-reads. All six translated targets declare their transitive adapter helper closure, including `dist/adapters/uri-restoration.js`, in `adapter_sources`. All eight manifests and staged outputs are committed in a single atomic promotion transaction (`promoteTransaction`).
- **Benchmark metric**: `scripts/benchmark-build-generation.mjs` measures post-build parent process RSS (`memoryUsage().rss`), not worker process-tree peak.

Publication consumes a verified build and publishes only selected harness bindings
in HOME or project scope. Current HOME bindings follow the eight-entry
`PUBLICATION_BINDING_ORDER` (`.agents/skills`, `.codex`, `.pi`, `.gemini/config`,
`.omp`, `.claude`, `.copilot`, `.evcrate-vscode`, without `.evcrate/bin`), while
`PREDECESSOR_BINDING_ORDER` retains historical bindings (`.evcrate/bin`, `.gemini`,
`.agents`, `.codex`, `.pi`, `.gemini/config`, `.omp`, `.claude`, `.copilot`,
`.evcrate-vscode`) for predecessor state admission and recovery. Each scope has one
harness transaction; project publication does not first commit HOME infrastructure.
Journal v4 and marker v3 contain only `records: {harness}`; `readReleaseMarker` and
`writeReleaseMarker` (`src/filesystem/locking.ts`) support `schema_version` 1, 2, and 3.
Actual workspace identity precedes the first staged journal and destination mutation.
CAS, scoped locks, backup/progress checks, rollback, and strict historical journal
v1/v2/v3 and marker v1/v2 admission remain. Python-era publication-marker parsing does
not add publication recovery; the separate existing `.evcrate-promotion-journal.json`
recovery retains its own boundary.

The standalone installers unpack verified package snapshots and smoke the staged
CLI. Release metadata writes `evcrate-private-release/v2`; installer receipts/current
pointers remain v1. Both `install.sh` and `install.ps1` enforce predecessor snapshot
containment/non-symlink checks on `repair` and require current v2 packages to expose
only `evcrate -> dist/cli/evcrate.js`: v2 repair recovers missing or corrupt predecessor
`installer-receipt.json` files without reading receipt contents, whereas v1
(`evcrate-private-release/v1`) repair requires a regular non-symlink/non-reparse receipt
matching `snapshot_id`, `version`, `archive_name`, `archive_sha256`, and `inventory_digest`.
Core release assets remain exactly seven.

## VS Code Local target and historical qualification

Schema-2 persists seven target IDs, including `vscode`; its target manifest writes
to `.evcrate-vscode`. `src/adapters/vscode/` contains native conversion and runtime
modules. `local-build-staging.ts` selects `vscodeAdapter` for this target; the other
six adapters use the shared registry. The npm allowlist includes the generated
`.evcrate/source/.evcrate-vscode/**` bundle, but core release assets remain exactly
seven. Activation stays user-controlled through manual `chat.pluginLocations`
registration.

The current plugin descriptor declares `"name": "evc"` (formerly `evcrate-local`).
`src/adapters/vscode/names.ts` maps canonical `evc-cmd-*` commands to local `cmd-*`;
`commands.ts` emits `.evcrate-vscode/skills/cmd-*/SKILL.md` as manual skills.
Copilot Chat displays `evc cmd-*` and qualifies invocation as
`/<plugin-name>:<skill-name>` → `/evc:cmd-*`, avoiding a duplicate `evc` prefix.
`replaceCommandInvocations` in `src/adapters/vscode/references.ts` converts
`/evc-cmd-*` and `$evc-cmd-*` to `/cmd-*` and `$cmd-*`, including wildcard families
such as `/evc-cmd-plan-x-*` → `/cmd-plan-x-*`. Shared
`.evcrate/source/.claude/scripts/ev-help.py` scans both `evc-cmd-*/SKILL.md`
and `cmd-*/SKILL.md`. Canonical names, `-x-` nesting, and semantic IDs remain stable.

Historical Phase 08 evidence used Linux x64, VS Code 1.140.0 and Copilot Chat 0.68.0:
[qualification index](../plans/261002-2213-vscode-local-native-support/reports/native-local/qualification-index.md),
[project receipt](../plans/261002-2213-vscode-local-native-support/reports/native-local/linux-x64-project/receipt.md),
and [HOME receipt](../plans/261002-2213-vscode-local-native-support/reports/native-local/linux-x64-home/receipt.md).
Those dated receipts do not qualify this source cutover or the inline interview.

Phase 09 establishes documentation, controlled rollout, and lifecycle governance:
- Clear separation between GitHub Copilot CLI (`copilot`) and VS Code Local (`vscode`).
- User quickstart and manual registration guidance via `chat.pluginLocations`.
- Scoped recovery without editor settings mutation (`evcrate recover`).
- Coexistence rules for project and HOME plugin installations.
- Privacy boundaries (fail-closed security bridge, ask/deny human confirmation).
- Explicit stop-trigger criteria for version drift and announced upstream Local retirement.
### VS Code subagent tool reference normalization

- **Namespace decoupling:** `src/adapters/vscode/metadata-tools.ts` separates canonical source tool intent, host frontmatter tool references (`read/readFile`, `runInTerminal`, `search/fileSearch`, `search/textSearch`, `search/listDirectory`, `todo`, `web/fetch`, `edit/editNotebook`), model invocation spellings, and hook event names.
- **Dual-authority parameter normalization:** `src/adapters/vscode/tool-inputs.ts` and `runtime-sources.ts:LOCAL_TOOL_INPUTS_SOURCE` (projected to `.evcrate-vscode/evcrate/runtime/local-tool-inputs.cjs`) normalize host `filePath`, `FilePath`, `dirPath`, batch edit paths (`files`, `replacements`), notebook `filePath`/`editType`/`cellId`, `web/fetch` HTTP(S) `urls`/`query`, and terminal helper tools (`getTerminalOutput`, `killTerminal`).
## Phase 01 launchability and identity

Publication execution intent is derived from the published relative path and published shebang bytes (with explicit launcher roles), not from source permission metadata. The plan carries execution intent separately from content hashes and CAS identity: a content-equal no-op stays a no-op, while new or changed POSIX launchers receive the required execute bit. Required staging/install chmod failures are errors rather than successful fallbacks.

`hashFile` remains a raw byte SHA-256. Resource file roots use a domain-separated file identity shared by the canonical registry scanner/store and direct-file imports; directory roots retain their tree identity. A suffixless file therefore cannot alias a directory identity. Capability assessment remains separate from content hashing.


The current schema-2 registry uses domain-separated resource-file identities; prior raw-file hashes are not silently reinterpreted. `npm run generate:registry` performs the canonical rescan. New publication journals are v4; strict historical v1/v2/v3 admission is retained.


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
| `release-fixture-shared-helpers.mjs` | Shared sorted-record, inventory/build-manifest digest, and real-installer authorities. |
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
- **Release workflow (Phase 07)**: `.github/workflows/release.yml` implements least-privilege producer (`contents: read`), exact-ID handoff, and publisher (`contents: write`) directly after `release-candidate`.
- **PR smoke (Phase 08)**: `.github/workflows/windows-smoke.yml` provides unprivileged diagnostic qualification on `windows-2025` x64 with PowerShell 7 (`pwsh.exe`) + Node 24.21.0 and fixture identities; `.releaserc.json` locks exact Windows labels.
- **Integrated qualification (Phase 09)**: Proved full gate sequence, bare-mirror isolation, tamper rejection, 4-row matrix routing, irreversible predecessor transitions, rerun boundaries, and final seven-file byte identity.
- **Support cutover (Phase 10)**: Updated `README.md` and core docs with bounded installer/version support and explicit runtime/desktop/signing exclusions.
## Native command context

OMP uses `evcrate_omp_command_context` v3 with exact protocol/version/source/command/context
fields. Source is `native-user`; context is `project_root`, `command`, `work_target`,
`plan_path`, `phase_path`, `phase_id`, with plan/phase values null unless validated
explicitly by the caller. Admission requires the command module's installed resource
root, existing absolute cwd, raw string, and mandatory workflow/documentation resources.
Missing prerequisites stop before admission with bounded privacy-safe notice.

Pi uses `evcrate-pi-command-context` v2 (`protocol`, `version`, `source`, `command`,
`raw_arguments`); raw input stays unchanged and source is native-user/model-tool.
Installed-root containment, nesting/cycle/tool bounds, child-start, and privacy
guards remain. Native execution and discovery are not inferred from generated files.

See [architecture](./system-architecture.md#5-native-command-context)
for exact header contracts.

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


## Scoped harness publication

| Target | HOME destination | Project destination |
|---|---|---|
| Claude | `.claude` | `.claude` |
| Codex | `.agents/skills`, `.codex/AGENTS.md` | `.codex`, `.agents/skills`, root `AGENTS.md` |
| Antigravity | `.gemini/config` | `.antigravity`, exact `.agents/hooks.json` and `.agents/rules/evcrate-antigravity.md` |
| Pi | `.pi` | `.pi` |
| OMP | `.omp` with declared path mapping | `.omp` |
| Copilot | `.copilot/copilot-instructions.md` | `.copilot`, exact `.github/copilot-instructions.md` |
| VS Code Local | `.evcrate-vscode` | `.evcrate-vscode` |

Preflight validates real directories, non-symlink ancestry, canonical project
identity, overlap, ownership, same-volume staging, and physical/byte CAS.
Each publication has one scoped harness commit. Failure uses ordinary structured
error output; failed rollback retains the journal without asserting restoration.
HOME state is `.evcrate/publication/`; project state is
`stateRoot/project-publication/<canonical SHA-256 identity>`. Recovery is strictly
scope-bound. Ordinary publication leaves old `.evcrate/bin` and user data untouched;
admitted historical interrupted recovery can restore its transaction-owned bytes
as data. Existing predecessor harness-file pruning remains ownership/CAS-gated.
Installed fresh/upgrade/interrupted recovery and current native-host qualification
must be exercised separately, not inferred from historical fixtures or counts.

## Projection map

- `.evcrate/source/.claude/AGENTS.md` is canonical; all current adapters consume
  its resource-graph entry. Local Claude projection uses `.claude-projection`
  without replacing authoring resources. See the [native delivery matrix and
  loader prerequisites](./system-architecture.md#instruction-authority-and-native-delivery).
- Commands retain canonical `evc-cmd-*` identities; VS Code Local projects container-local `cmd-*` skills under plugin `evc`, while the other six targets retain `evc-cmd-*`. Agent names remain `evc-*`.
- Copilot emits `evc-cmd-*` skills with raw `$ARGUMENTS`.
- Pi resolves command, workflow, and main/child instruction references from its active installed resource root.

### Command and resource naming convention

Canonical commands are authored as flat files (`commands/evc-cmd-<segment>(-x-<segment>)*.md`) with `-x-` segment separation, and agents use `evc-*`. Governed by `src/adapters/resource-naming.ts` and enforced by `.evcrate/source/.claude/scripts/scan_commands.py`, all seven active targets retain flat resource names; VS Code Local uses `cmd-*` command skill names inside plugin `evc`. Semantic command identities (`code/auto`) retain their command identities. Shell commands remain executable syntax, not slash resource names.

### Projection and catalog inventories

Canonical resources total 140: 17 agents, 70 commands, 13 hooks, 34 skills, and
6 workflows. Regenerate seven target projections, catalogs, schema-2 registry,
and aggregate/per-target BuildManifest v3 through established tools. Canonical
`.claude/AGENTS.md` remains the hash/authoring authority; generated root AGENTS
and `.claude-projection` are delivery outputs. Source inventories determine
catalog totals.

### Phase 08 publication prune, collision refusal, and legacy leftover reporting

Phase 08 establishes the hard cutover publication upgrade path, collision protections, and legacy residual management:
- **Universal unmanaged collision refusal:** `isMigratedDestination` enforces collision refusal across all active targets for unified command destinations (`evc-cmd-*`), agent destinations (`evc-*`), Copilot/VS Code unified extensions, and canonical instruction documents (`AGENTS.md`, `.github/copilot-instructions.md`, `.agents/rules/evcrate-antigravity.md`, `.agents/hooks.json`). Unmanaged files at migrated destinations yield `conflict` actions, failing closed atomically (`PUBLICATION_FAILED`) with zero user data loss.
- **HOME/project retired binding reconciliation:** `reconcileRetiredBindings` prunes exact predecessor-owned Gemini files when Antigravity is selected, without adding retired bindings to active metadata. Current schema-4 journals retain the file-only `retired-binding` authorization; strict historical schema-3 recovery remains. Inherited Codex `.agents` residuals stay preserved.
- **Untracked legacy leftover reporting:** `detectLegacyLeftovers` performs a bounded, read-only inspection of known resource locations across selected targets, subtracting current and prior recorded ownership. Untracked legacy files are preserved byte-identically and reported across five kinds (`command`, `agent`, `skill`, `style`, `instruction`).
- **Dual-interface reporting:** Machine payloads carry `legacyLeftovers: readonly LegacyLeftoverRecord[]` sorted deterministically in both `PublishApplyResultPayload` and `PublishDryRunResultPayload`; human TTY output displays `published` (or `preview` on dry-run) followed by concise warnings with manual review recommendations.
- **Upgrade guidance:** Full operational procedures, ownership policies, and pre-upgrade backup requirements are documented in [Pre-Upgrade Backup & Leftover Guidance](./upgrade-backup-and-leftover-guidance.md).

### Phase 09 tests, golden fixture regressions, and concurrency protection

Phase 09 establishes cross-cutting test suites, golden contract regressions, and test infrastructure stability:
- **Phase 09 regression suite (`tests/distribution/phase09-golden-and-contract-regressions.test.mjs`):** Exercises 10 focused contracts covering unified naming invariants, `-x-` nesting reversibility, Copilot skill/style prefixing, command name mapping purity (no foreign `evcrate-local:` prefixes), Phase 12 snapshot drift safety across both serial and parallel worker modes, Claude rules delivery invariants, target AGENTS output verification, and schema-2 target manifest registrations.
- **Installed command boundaries:** `tests/integration/controller-free-installed.test.mjs` verifies installed-root discovery, raw transport, containment, privacy-safe failures, and HOME data noninteraction.
- **tmpfs concurrency protection (`--test-concurrency=1`):** Configured serial test execution in `package.json` for heavy workspace fixture suites (`test:publication`, `test:build-generation`, and `test:integration`), preventing out-of-memory and inode exhaustion on tmpfs mounts while maintaining full isolation.
- **Buffer overrun protection (`maxBuffer`):** Updated `scripts/release/npm-runner.cjs` with a 64MB default `maxBuffer` in `execNpmSync` and `spawnNpmSync`, preventing `ENOBUFS` truncation during large `npm pack --dry-run --json` invocations.

### Phase 10 documentation, changelog, and release pipeline

Phase 10 cuts over maintained documentation, migration guidance, and the stable `main` release pipeline:
- **Stable release pipeline:** `.releaserc.json` configured with canonical branch `["main"]`. Workflow `.github/workflows/release.yml` triggers pushes on `main`, producing and verifying candidate artifacts on Linux before publishing automatically (`windows-smoke.yml` qualifies Windows in PRs on `windows-2025` with `pwsh.exe` and Node `24.21.0`).
- **Candidate mirror seeding & topology guards:** `scripts/release/run-release-candidate.cjs` seeds bare candidate mirrors with `main` at `sourceCommit` and pushes all local tags. `scripts/release/publish-release.cjs` enforces `main`-only stable publication and rejects prerelease candidate versions.
- **Normative documentation reconciliation:** Reconciled `README.md`, `code-standards.md`, `system-architecture.md`, `project-overview-pdr.md` (FR-12), `project-roadmap.md`, `pi-native-migration.md`, and `guide/SKILLS.md` covering universal `evc-cmd-*` / `evc-*` naming, single `AGENTS.md` authority, pre-upgrade customization backup warnings, and exact local-asset installer installation procedures.

## Standalone SonarQube test quality extension (Phases 02–07)

The standalone extension `ext/sonarqube-test-quality/` provides neutral SonarQube triage, test refactoring, coverage verification, scanner lifecycles, cycle ledger contracts, sanitized run guidance, portable evidence actor specification, bounded remediation command skill prompt, dual-root transactional installer, and offline behavioral evals catalog (Phases 02–07 deliver repository-source discovery, scanner lifecycle, test/coverage, cycle-ledger, run-guidance references/templates, portable evidence actor specification, thin portable command skill prompt, multi-target two-skill transactional installer, packaging allowlist, behavioral evals catalog, contract alignment for `declined-upload`, and offline test suites; packed installer extraction and offline scenario verification are evidenced, while live LLM host execution and candidate qualification handoff remain Phase 07 unexercised gates pending Phase 08):
- **Source root**: `ext/sonarqube-test-quality/` contains the skill source tree (`SKILL.md`, `agents/`, `commands/`, `references/`, `templates/`, `scripts/`, `bin/`, `lib/`, `evals/`, `tests/`).
- **Profile and applicability discovery (`references/project-discovery.md`)**:
  - Deterministic discovery order: repository manifests → approved scripts, scanner configuration, tracked CI → installed tool help and versions → matching official vendor docs.
  - Safe actual-input identity: records SHA, ref, manifests, and nonsecret config with credential redaction (`sonar.token`, `sonar.login`, etc.). Two-factor report freshness requires artifact timestamp newer than source/config mtimes AND input content digest provenance binding.
  - Requirement contracts (`required`, `optional`, justified `not-applicable`) separated from runtime observations (`available/passed`, `available/failed`, `unsupported`, `unavailable`).
- **Ordered scanner lifecycles and recovery (`references/local-analysis.md`)**:
  - 8-stage sequence: Preparation → Instrumentation/Begin → Native Build → Native Test → Coverage Generation → Import & Upload → Submission Tracking → Finalization.
  - 3 universal lifecycle shapes: Shape A (Integrated Build/Scanner), Shape B (Standalone Scanner), Shape C (Preparation→Build→End).
  - Native semantic parity: mandatory clean uninstrumented native verification when scanner instrumentation alters compiler flags or build semantics.
  - Auth and TLS separation: CLI query session verification (`sonar auth status`) separated from scanner process credentials; TLS verification never disabled.
  - Stage-specific failure recovery: aborts cleanly without executing upload-capable steps or `end` hooks as cleanup.
- **Neutral test and coverage verification (`references/testing-and-coverage.md`)**:
  - Neutral test execution rules with two-factor coverage freshness.
  - Counter and denominator rules: zero denominator (`0/0`) is undefined/empty, never 100%; unsupported branch coverage is marked `unsupported`, not implicitly satisfied.
  - Retains optional Java/Maven/JaCoCo helper recipes (`scripts/calculate-jacoco-coverage.ps1`).
- **CLI quick reference (`references/sonar-cli-commands.md`) & skill entrypoint (`SKILL.md`)**:
  - Dynamic server status discovery rather than fixed defaults; links discovery, local analysis, and full-scan routes; requires recorded preflight upload authorization for scanner executions and uploads.
- **Cycle budget, state persistence, and server evidence policy (`references/remediation-cycles.md`)**:
  - Specifies policy for global entered-round fix budget `N` across all targets (excluding `C0` baseline and non-editorial Stage `F`), stage transitions, single corrective batch (`CK_CORRECTION → CK_REREVIEW`), no in-round test-failure retry, and two-round comparable no-progress escalation. Halting triggers include `declined-upload` alongside `declined-commit`, `test-or-build-failed`, `failed-review`, `failed-rereview`, and `role-independence-violation`.
  - Defines policy for the private resume checkpoint (`<private-evidence-dir>/resume-checkpoint.json`), atomic multi-target shared checkpoint, exact `submission → ceTaskId → analysisId → qualityGate` binding, local finding stage vs. bound server active status separation, disappearance causation rules (`code-fixed` vs. non-code/unknown dispositions), human-only hotspot reviews, and Stage `F` success criteria.
- **Sanitized run guidance, redaction, and promotion policy (`references/run-guidance.md`)**:
  - Specifies dual-artifact separation: store the private cycle ledger and raw evidence store (`<private-evidence-dir>/`) outside the checkout or in an already-approved Git-ignored location (never committed, pushed, or distributed), and emit a separate sanitized guidance report on every run outcome (with any sharing gated on explicit repository owner permission).
  - Defines structural + key-name redaction placeholders (`<REDACTED_SECRET_TOKEN>`, `<REDACTED_ENV_VAR>`, `<REDACTED_SONAR_HOST>`, `<SYNTHETIC_CODE_FIXTURE>`, neutral `RUN-`/`GD-` slugs), provenance-to-confidence ceilings (`synthetic` capped at `hypothesized`; `observed`; `validated (offline)`; `validated (live-server)`), and owner-reviewed promotion gates prohibiting runtime self-modification or background telemetry.
- **Cycle ledger & guidance templates (`templates/remediation-cycle-report.md`, `templates/run-guidance-report.md`) and handoff links (`references/remediation-and-handoff.md`, `references/report-formats.md`)**:
  - Provide the private cycle ledger template (run header/profile, YAML resume state index, cross-cycle finding matrix, checks/coverage table with canonical two-factor freshness, per-cycle/per-target submission/task/analysis/consistency ledger, Stage `F` qualification table, blockers/escalations with `declined-upload` trigger support) and sanitized run guidance template with `[ILLUSTRATIVE PLACEHOLDER]` markers and data-only notices.
  - Linked from `references/remediation-and-handoff.md` while preserving lightweight single-batch local remediation and keeping `references/report-formats.md` JSON-authoritative over converted Markdown inspection views.
- **Portable Sonar Evidence actor specification (`agents/sonar-evidence.md`)**:
  - Defines portable `<evidence-actor-role>` subagent Markdown prompt contract with zero host-specific frontmatter, native engine bindings, or `evc-*` registrations; prompt/policy resolution strictly from installed root (`skills/sonarqube-test-quality/agents/sonar-evidence.md`, installed by Phase 06).
  - Bounded writes restricted to build/scanner dirs (`.scannerwork/`, `.sonar/`), test/coverage reports, and owner-only private evidence directory (`<evidence-destination>/`, mode 0700, never inlined into reports). Prohibits checkout/source code edits, test file mutations, server finding/hotspot status mutations, git operations, CI/build config changes, and toolchain installs.
  - Role independence: strictly isolates `actor_id` from `implementer_id`, `reviewer_id`, `rereviewer_id`, and `auditor_id`; cannot self-certify Stage `F` final audit (`F_FINAL_AUDIT`); no hotspot review authority (human repository owner only); fails closed on role conflicts (`role-independence-violation`).
  - Three mutually exclusive operating modes: `snapshot` (read-only query/indexing, no checkout/source writes or uploads, private evidence index writes only), `verify-upload` (preflight upload authorization required, ordered lifecycle execution, report freshness, task polling, quality gate retrieval), and `verify-final` (strictly non-editorial Stage `F` verification with zero code edits permitted).
  - Execution mechanics: serial multi-target execution per checkout; pre/post working-copy drift checks; uninstrumented native semantic parity; crash-window handling and task resume without re-upload; exact `analysisId`-bound quality gate (rejects latest-project gate fallbacks); complete paging and ceiling detection; 14 labeled offline scenario traces (`E-TR-01` through `E-TR-14`).
- **Evidence actor offline test suite (`tests/sonar-evidence-actor.test.mjs`)**:
  - 21 unit and regression tests across 2 suites verifying specification existence, zero host frontmatter, root resolution, bounded writes/security, TLS rules, role independence, operating mode boundaries, multi-target support, drift checks, lifecycle parity, task resume, gate binding, paging/consistency, closed enums, guidance redaction/schema, 14 offline scenario traces, and embedded JSON request/terminal result block validation against canonical schemas.
- **Bounded remediation command skill prompt (`commands/cmd-sonar-remediate/SKILL.md`)**:
  - Thin portable command skill prompt that sequences real host subagents across 17 lifecycle stages governed by `references/remediation-cycles.md`.
  - Arguments: mandatory global fix budget ceiling `N` (> 0, interactive prompt on omitted/invalid, never inferred or defaulted); target context, scope, and outside-checkout private evidence destination.
  - Sibling resolution: resolves within loaded installed skill root (`.agents` or `.claude`), with fallback to `../../` in repository source checkouts; never falls back to arbitrary CWD.
  - Role binding contract: operational roles (`implementer_id`, `tester_id`, `reviewer_id`, `rereviewer_id`, `evidence_actor_id`, `auditor_id`) require `implementer_id` to differ from all reviewers, evidence actor, and auditor, and require all five roles in Stage `F` (`implementer_id`, `reviewer_id`, `rereviewer_id`, `auditor_id`, `evidence_actor_id`) to be pairwise distinct; fails closed on `role-independence-violation` (prompt guidance, not an OS sandbox).
  - 17-stage state machine: `C0_BASELINE` (zero budget cost against `N`), 9 fix-round stages `Ck` (`CK_FIX`, `CK_TEST`, `CK_REVIEW`, `CK_CORRECTION`, `CK_REREVIEW`, `CK_VERIFY_IMPORT`, `CK_UPLOAD`, `CK_TASK_WAIT`, `CK_EVALUATION`), 6 non-editorial Stage `F` stages (`F_AGGREGATE_REVIEW`, `F_AWAITING_COMMIT`, `F_COMMITTED_INPUT_CHECK`, `F_FINAL_LIFECYCLE_UPLOAD`, `F_FINAL_TASK_WAIT`, `F_FINAL_AUDIT`), and terminal `HALTED`.
  - Transition invariants: single correction batch per round; test failure halts `Ck` immediately without in-round retry (`test-or-build-failed`); initial review rejection halts with `failed-review`; Stage `F` aggregate review rejection returns to `C(k+1)` if budget `N` remains or halts if exhausted; separate user commit authorization without auto-push (`awaiting commit` on decline); mandatory actual scanner upload on committed SHA; 11-point success contract certified by independent auditor.
  - Durable persistence: `<evidence-destination>/resume-checkpoint.json` with input hash drift detection (`drift-invalidated`); sanitized run guidance generation without external telemetry.
- **Command specification and behavioral simulation test suite (`tests/cmd-sonar-remediate.test.mjs`)**:
  - 31 unit and scenario tests across 3 suites verifying specification existence/frontmatter, argument resolution, installed layout resolution (`.agents` and `.claude`), pairwise role binding, and 15 simulated state transition scenarios.
- **Reference and entrypoint alignment (`references/remediation-cycles.md`, `SKILL.md`)**:
  - `references/remediation-cycles.md` documents `failed-review` and `role-independence-violation` triggers, and clarifies Stage `F` return to `C(k+1)` vs post-`N` extension.
  - `SKILL.md` links the bounded remediation command prompt route and reference.
- **Dual-root transactional two-skill installer (`lib/install.js`, `bin/install.js`) and packaging (`package.json`) (Phase 06)**:
  - Multi-target installation: `--target agents|claude|both` with required explicit target selection and project root via `--directory <project-root>`; unsupported or missing targets fail closed. Legacy `--target agents` preserves paths under `<project>/.agents/skills/sonarqube-test-quality/`.
  - Installed asset inventory: 18 assets and exactly two skill entrypoints per selected root (`skills/sonarqube-test-quality/SKILL.md` and `skills/cmd-sonar-remediate/SKILL.md`), writing 36 destinations when `--target both` is chosen. Writes zero unselected root payload, settings, or native registrations.
  - Transactional staging and verification: plans, stages beside destinations on the same volume, publishes, and verifies exact byte matches across selected roots. Rejects cross-volume moves; caught errors trigger in-process rollback restoring replaced original bytes, removing owned additions and empty owned directories, preserving unrelated and concurrently modified files. Surfaces partial rollback if restoration encounters conflicts (no persistent journal, crash recovery, or atomic reader visibility claim).
  - Two-tier lock coordination: acquires project-level lock `<project>/.sonarqube-test-quality.install.lock` first, followed by legacy lock `<project>/.agents/skills/sonarqube-test-quality/.install.lock` whenever `agents` is selected; releases successfully owned locks in reverse order on exit or failure.
  - Path and symlink security: validates that project root and ancestors are non-symlink regular directories, rejects symlink traversal and containment breaches; `--force` requires `--yes` confirmation for file overwrites and never bypasses path traversal or type safety guards.
  - Packaging allowlist: `package.json#files` includes `commands`, `agents`, `templates`, and `evals` alongside existing references, scripts, library, and documentation (23 packaged files in release tarball).
  - Installer test suite (`tests/install.test.mjs`): 19 tests verifying asset inventories, multi-target layouts, two-tier locking, dry-run, force/yes confirmation, fault injection, and rollback mechanics.
- **Behavioral evals catalog (`evals/evals.json`) and test suite (`tests/evals.test.mjs`) (Phase 07)**:
  - Behavioral evals catalog (`evals/evals.json`): 64 instruction scenarios and 195 authored prose assertions with monotonic unique integer IDs 1–64 covering all four scanner lifecycle shapes (Shape A integrated build/scanner, Shape B standalone scanner, Shape C prep/build/end, Shape D multi-target), global budget $N$ enforcement (omission, invalid $N$, $N=1$ failure, resume without budget, no free edits), single correction batch invariant, two-round comparable no-progress escalation, neutral applicability and metric requirements (zero executed tests, justified profile, unsupported coverage, zero denominator, stale reports, incompatible metric aggregation), authority/refusal invariants (`declined-upload`, `declined-commit`, query vs scanner auth separation, missing child, unsafe scripts, attempted TLS bypass refusal, actor status mutation refusal, guidance sharing refusal), evidence/paging/consistency rules, and 11-point Stage $F$ server-verified success contract definitions. Contains zero literal credentials or unauthorized TLS bypass instructions.
  - Evals test suite (`tests/evals.test.mjs`): 15 tests verifying catalog schema, ID monotonicity, non-empty prompts/outputs, assertion density (at least 2 assertions per scenario), explicit multi-target coverage, lifecycle shapes, Stage $F$ actual submission contracts, $N$ budget limits, correction limits, recovery boundaries, applicability rules, authority/auth invariants, evidence/paging/consistency rules, security audit invariants, and static acceptance matrix traceability mapping across A01–A09, D01–D09, C01–C12, E01–E08.
  - Consolidated package test and release verification: all 114 package tests pass across 8 test suites (`tests/*.test.mjs`); release tarball packages exactly 23 verified entries (`package.json#files`). Packed installer extraction and offline scenario verification pass cleanly in isolated workspaces; live LLM host harness execution and candidate qualification handoff remain Phase 07 unexercised gates pending Phase 08.
## Documentation navigation

- [Agent guidance](../AGENTS.md) — shared agent workflows and subagent completion contract.
- [System architecture](./system-architecture.md) — central contracts.
- [Project overview and PDR](./project-overview-pdr.md) — requirements.
- [Code standards](./code-standards.md) — implementation rules.
- [Project roadmap](./project-roadmap.md) — phases and gates.
- [Project changelog](./project-changelog.md) — historical evidence.
- [Project changelog archive](./project-changelog-archive.md) — older detail.
- [Pi-native migration](./pi-native-migration.md) — Pi-specific projection/runtime notes.
- [Snyk specialist guide](./snyk-expert-cli.md) — standalone common .agents bundle.
- Canonical docs validator: [`validate-docs.cjs`](../.evcrate/source/.claude/scripts/validate-docs.cjs) searches hidden source, excludes heavy directories, and distinguishes incomplete searches from missing references.
- [Pre-Upgrade Backup & Leftover Guidance](./upgrade-backup-and-leftover-guidance.md) — operational upgrade, backup, and collision safety guidance.
