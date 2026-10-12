# Codebase Summary

**Maintained:** 2026-10-12
**Source:** Canonical resources and TypeScript control-plane contracts for the completed advisor subsystem retirement cutover and VS Code `evc`/`cmd-*` container mapping; live vendor/native-host qualification remains separate.
**Package:** Private npm package `evcrate` 2.11.0; Node `>=22.19.0`.
Single binary: `evcrate` (`dist/cli/evcrate.js`).
**Qualification:** Historical candidates and test counts do not qualify the current package. Windows support is limited to standalone installer lifecycle and `version --json`; actual-host native qualification remains separate.

EVCrate builds and publishes validated projections of one canonical agent-harness
source tree. The TypeScript CLI is the package control plane.

## Source-of-truth map

| Path | Role | Editing rule |
|---|---|---|
| `.evcrate/source/.claude/` | Canonical harness resources | Author 140 resources: 17 agents, 70 commands, 13 hooks, 34 skills, 6 workflows, including neutral `plan-progress.md` and the main-session interview. Do not hand-edit target copies. |
| `.evcrate/targets/` | Schema-2 target manifests and overlays | Change target policy or declared overlays, then rebuild. |
| `.evcrate/source/{.claude-projection,.agents/skills,.codex,.antigravity,.pi,.omp,.copilot}/` and declared native project documents | Generated target projections | Regenerate; never treat as authoring roots. |
| `.evcrate/source/.evcrate-vscode/` | Generated VS Code Local plugin bundle | Regenerate from canonical resources and the `vscode` target manifest; do not hand-edit. |
| `.evcrate/registry.json` | Schema-2 canonical resource records | Regenerate from the canonical 140-resource scan; distinct from target/build manifests. |
| `src/` | TypeScript control plane | Primary package implementation. |
| `extensions/vscode-model-bindings/` | Standalone VS Code model-bindings companion extension package, runtime provider, renderer, staging storage, and pure contracts | Compiled in isolation from root `src/`; never import root `src/` or vice versa. |
| `scripts/` | Generation, package, release, benchmark (`benchmark-build-generation.mjs`), and TypeScript incremental build tooling (`build-typescript.mjs`, `typescript-build-cache.mjs`, `typescript-build-receipt.mjs`) | Follow each script's declared authority; generated outputs are not edited by hand. |
| `tests/` | Contract and behavior suites | Focused regression and integration tests, not live vendor qualification. |
| `docs/`, `plans/` | Maintained documentation and work plans | See the documentation map below. |

The persisted target IDs are `claude`, `codex`, `antigravity`, `pi`, `omp`, `copilot`, and `vscode`. Standalone Gemini is retired, not Antigravity's vendor HOME directory. Codex owns `.agents/skills`; Antigravity owns exact `.agents` hook/rule leaves. `vscode` uses a separate local-build adapter route; generated outputs and manifests are build artifacts.

## TypeScript module map

| Area | Responsibility | Representative files |
|---|---|---|
| `src/protocol/` | Bounded JSON and versioned request/result contracts | `validation.ts`, `resource-payloads.ts`, `publication-payloads.ts` (`PUBLICATION_BINDING_ORDER`, `PREDECESSOR_BINDING_ORDER`, validated `legacyLeftovers`), `index.ts` |
| `src/context/` | Immutable package, project, HOME, state, and target context | `invocation-context.ts`, `path-resolution.ts`, `target-registry.ts` |
| `src/manifests/` | Target manifest loading and resource roots | `manifest.ts`, `registry.ts` |
| `src/adapters/` | Seven target projection adapters; canonical graph `AGENTS.md`, native instruction formats, OMP admission/context guards, Pi main/child extension, current Antigravity hooks/rules, Copilot `.github` project instructions, VS Code Local plugin and companion contracts (`model-intent.ts`, `companion-package-contracts.ts`, `companion-cli-contracts.ts`); shared URI restoration and Markdown frontmatter | `registry.ts`, `qualification.ts`, `markdown-frontmatter.ts`, `vscode/`, `codex/`, `omp/`, `pi/`, `copilot/`, `antigravity.ts` |
| `src/distribution/` | Local build/check, single-projection manifest reuse, bounded worker pool (`worker-pool.ts`), input snapshot isolation (`input-snapshot.ts`, `input-snapshot-tree.ts`), publication planning, staging, atomic promotion, and recovery | `local-build.ts`, `local-build-staging.ts`, `manifest-view-derivation.ts`, `local-staging-fs.ts`, `worker-pool.ts`, `input-snapshot.ts`, `publication-plan.ts` (Phase 08 removed bindings reconciliation), `publication.ts`, `legacy-leftovers.ts` (Phase 08 unmanaged leftover scanning and migrated collision checks) |
| `src/filesystem/` | Host/portable paths, hashing, atomic writes, and locks | `paths.ts`, `hashing.ts`, `atomic.ts`, `locking.ts` (`readReleaseMarker`/`writeReleaseMarker` v1/v2/v3) |
| `src/registry/` | Canonical resource scan, schema, validation, and queries | `scanner.ts`, `schema.ts`, `store.ts` |
| `src/imports/` | Bounded explicit-source preview/apply and materialization | `source.ts`, `preview.ts`, `apply.ts`, `handler.ts` |
| `src/scopes/` | Global/project assignments, revisions, and CAS | `identity.ts`, `state.ts`, `mutations.ts`, `changes.ts` |
| `src/cli/`, `src/errors/` | One-shot dispatch, output, stable errors, and exit mapping | `arguments.ts`, `dispatch.ts`, `main.ts`, `output.ts` (Phase 08 legacy leftovers TTY warning), `control-plane-error.ts` |
| `extensions/vscode-model-bindings/src/` | Companion extension runtime, root resolution, generation loader, template renderer, atomic staging storage and authority accounting, scoped template watcher, single-flight refresh reconciler/controller, provider registration, model catalog querying, scoped binding store, pure inventory resolver, QuickPick configuration commands, runtime diagnostics snapshot/display, and pure contracts | `extension.ts`, `installation-roots.ts`, `generation-loader.ts`, `agent-renderer.ts`, `resource-storage.ts`, `storage-accounting.ts`, `template-watcher.ts`, `refresh-reconciler.ts`, `refresh-controller.ts`, `agent-provider.ts`, `model-catalog.ts`, `binding-store.ts`, `binding-resolver.ts`, `configuration-commands.ts`, `configuration-pickers.ts`, `clear-commands.ts`, `command-registration.ts`, `diagnostics.ts`, `diagnostics-display.ts`, `provider-registration.ts`, `runtime-contracts.ts`, `binding-contracts.ts`, `diagnostics-contracts.ts`, `contracts.ts` |

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

### VS Code runtime model bindings companion (Phases 01–06 implemented; CLI packaging pending; live qualification deferred)

- **Phase 01 offline feasibility**: 10/10 automated harness checks passed on Linux against pinned declarations for VS Code `1.140.0` (`07f806f999227108933c2e30515b26eecc1fda74`) and Copilot Chat `0.68.0` ([native feasibility](../plans/261011-2349-vscode-runtime-model-bindings/reports/native-feasibility.md), [support matrix](../plans/261011-2349-vscode-runtime-model-bindings/reports/support-matrix.md)). Temporary `/tmp/evcrate-phase01-spike/` directory removed.
- **Phase 02 contracts and ownership (DONE 2026-10-12)**: Implemented pure contract modules in `src/adapters/vscode/{model-intent.ts,companion-package-contracts.ts,companion-cli-contracts.ts}` and standalone extension workspace `extensions/vscode-model-bindings/{package.json,tsconfig.json,vscode.proposed.chatPromptFiles.d.ts,src/runtime-contracts.ts,src/diagnostics-contracts.ts,src/contracts.ts}` with boundary tests in `tests/vscode-companion/contracts.test.mjs` (4/4 companion contract tests + 97/97 VS Code adapter tests = 101/101 passing; Review Cycle 2 approved 8.5/10, 0 critical issues; [interface-freeze.md](../plans/261011-2349-vscode-runtime-model-bindings/reports/interface-freeze.md)).
- **Phase 03 immutable templates and truthful build intent (DONE 2026-10-12)**: Cut over VS Code projection from static agent definitions (`.evcrate-vscode/com.github.copilot/agents/*.agent.md` deleted) to immutable templates located in `.evcrate-vscode/evcrate/agent-templates/${name}.md` with disposition `immutable-template`. Stripped actionable `model` key from template frontmatter while preserving tools, arguments, descriptions, and user-invocable flags. Emits truthful `evcrate/agent-intent.json` (`evcrate-vscode-agent-intent-v1`) capturing SHA-256 template digests and canonical tier intent, and upgraded `evcrate/agent-tool-audit.json` to schema v2 (`evcrate-vscode-agent-tool-audit-v2`). Deleted `src/adapters/vscode/models.ts` (`VSCODE_LOCAL_MODEL_MAP`, `resolveLocalModel`, `buildVscodeModelMap`) and generated `evcrate/model-map.json` without compatibility shims. Updated inventory (`projection-inventory.json`), target manifest (`.evcrate/targets/vscode/manifest.json`), activation guidance (`activation-guide.md`), and reference tests (`tests/adapters/vscode-configuration.test.mjs`, `tests/adapters/vscode-resource-projection.test.mjs`). Full suites pass (665 passed, 0 failed, 1 skipped); user approved.
- **Phase 04 companion provider runtime (DONE 2026-10-12)**: Implemented guarded activation, candidate root resolution, secure generation loading, immutable template rendering, atomic generation storage, and single-owner agent provider in `extensions/vscode-model-bindings/src/` (13/13 companion tests pass; 232/232 core adapter tests pass; Review Cycle 3 approved 7/10, 0 critical issues):
  - **Prerequisite contract refinements**: Resolved Phase 02 Review Cycle 2 items: canonical URI serialization idempotent across percent encoding/spaces/Unicode/Windows drives with control character rejection (`W-A`), extracted leaf module `binding-contracts.ts` eliminating circular value imports (`W-B`), and enforced `<=512` actor bounds, string length caps, and diagnostic coherence in `validateRuntimeDiagnosticsV1` (`W-C`).
  - **Guarded host activation (`extension.ts`, `installation-roots.ts`)**: Evaluates host preconditions on activation (`inspectHostGuard` checking workspace trust, proposal availability, and non-remote authority). Non-local remote authorities (`ssh-remote`, `dev-container`, `wsl`) and untrusted workspaces fail closed without silent fallback to local HOME.
  - **Candidate root resolution (`installation-roots.ts`)**: Implements strict precedence (`project > HOME`), directory discovery (`.evcrate-vscode/evcrate/agent-templates/` and `.evcrate-vscode/evcrate/agent-intent.json`), and approval filtering via workspace state.
  - **Secure generation loader (`generation-loader.ts`)**: Traverses manifest-declared actors, strictly validates relative template paths (`validateSafeTemplatePath` preventing path traversal, symlink escape, and null-bytes), verifies template SHA-256 integrity, enforces size limits (`<= 256 KiB`), and isolates per-actor errors into `withheldReasons`. Computes stable template inventory SHA-256 for generation deduplication.
  - **Agent renderer (`agent-renderer.ts`)**: Injects validated model selectors into frontmatter, protects code fences, preserves immutable intent body, omitted tools, arguments, and metadata, and safely rebases relative references without modifying external URLs.
  - **Storage & provider owner (`resource-storage.ts`, `agent-provider.ts`)**: Staging executes via atomic `mkdtemp` and directory rename into extension storage (`stageAgentGeneration`), validating storage budgets (`STORAGE_AND_SOURCE_BOUNDS`). Single-instance `CompanionAgentProvider` implements VS Code's proposed `CustomAgentProvider` interface (`provideCustomAgents`), deduplicating change events on identical inventory and honoring cancellation tokens.
- **Phase 05 runtime tiers, actor overrides and picker commands (DONE 2026-10-12)**: Implemented runtime model catalog querying, versioned scoped binding store, pure inventory resolver, and QuickPick configuration commands in `extensions/vscode-model-bindings/src/` (34/34 companion tests pass across `tests/vscode-companion/`; 232/232 core adapter tests pass; Review Cycle 2 approved 8/10, 0 critical issues; user approved):
  - **Model catalog querying (`model-catalog.ts`)**: Queries available models via `vscode.lm.selectChatModels` (`queryChatModelCatalog`), validates entries (`validateCatalogEntry`), formats selectors as `<name> (<vendor>)`, detects ambiguities (`findAmbiguousSelectors`), and compiles frozen snapshots (`buildCatalogSnapshot`) without inferring preferred models or sending requests.
  - **Scoped versioned binding store (`binding-store.ts`)**: `ScopedBindingStore` partitions state between unsynced user defaults (`globalState`) and installation-scoped root workspace overrides (`workspaceState`). Fails closed on unsupported remote authorities (`UNSUPPORTED_REMOTE_AUTHORITY`), validates schema bounds (`validateBindingsV1`, `<= 64 KiB`), enforces revision increments and CAS expected-revision checks, and provides granular clear operations (`clearUserBindings`, `clearRootBindings`, `clearAllBindings`).
  - **Pure inventory resolver (`binding-resolver.ts`)**: Implements strict precedence layering (`root.actor > user.actor > canonical.inherit > root.tier > user.tier > unresolved`). Canonical inherit actors omit frontmatter `model` selector when not explicitly overridden. Validates selectors against the catalog snapshot (`MODEL_NOT_FOUND`, `SELECTOR_AMBIGUOUS`) and isolates withheld reasons per actor.
  - **Interactive QuickPick UX & commands (`configuration-pickers.ts`, `configuration-commands.ts`, `clear-commands.ts`, `command-registration.ts`, `diagnostics-display.ts`)**: Registers command palette gestures (`evcrate.configureAgentModels`, `evcrate.configureActorModel`, `evcrate.clearModelBindings`, `evcrate.showModelBindings`, `evcrate.selectInstallation`). Supports interactive scope selection (user default vs root workspace), canonical tier pick (`opus`, `sonnet`, `haiku`), actor pick (manifest-discovered actors), catalog model pick, explicit inherit selection, and granular reset. Commits atomically and triggers immediate generation refresh; cancellation preserves state without mutation.
  - **Runtime & loader integration (`extension.ts`, `generation-loader.ts`)**: Subscribes to catalog changes (`vscode.lm.onDidChangeChatModels`), manages single-flight debounced refresh, withdraws actors cleanly upon corrupt user or root state, and passes active catalog and binding layers into generation loading.
- **Phase 06 refresh, immutable generations and diagnostics (DONE 2026-10-12)**: Implemented event-driven single-flight refresh, persistent authority storage accounting, immutable generation reuse, and validated runtime diagnostics in `extensions/vscode-model-bindings/src/` with behavior suites in `tests/vscode-companion/{resource-storage.test.mjs,refresh-lifecycle.test.mjs,refresh-test-harness.mjs}` (41/41 companion tests + 98/98 VS Code adapter tests = 139/139 passing; Review Cycle 2 approved 8.3/10, 0 critical issues; user approved):
  - **Storage accounting, stage lock & generation reuse (`storage-accounting.ts`, `resource-storage.ts`, `generation-loader.ts`)**: `inspectAuthorityStorageUsage` scans persistent authority storage (`MAX_STORAGE_SCAN_ENTRIES = 65_536`), rejecting symlinks (`PATH_UNSAFE`) and tracking per-instance active generations (`<= 32` / `<= 8 MiB`) and shared authority bytes (`<= 64 MiB`). `stageAgentGeneration` enforces token-verified `.authority-stage.lock` (`owner.json` with `instanceUuid`, `pid`, `token`, bounded retry, and stale lock/staging cleanup via `cleanStaleStagingDirectories`), blocking new derivation on `STORAGE_BUDGET_EXCEEDED` without deleting existing generations. `loadAndStageGeneration` reuses intact generations across `A -> B -> A` binding transitions via bounded `stagedByInventoryKey` lookup and safely parses manifest actors (`readManifestActorsSafe`, `<= 1 MiB`).
  - **Scoped watcher & single-flight refresh (`template-watcher.ts`, `refresh-reconciler.ts`, `refresh-controller.ts`, `extension.ts`)**: `createScopedTemplateWatcher` monitors `.evcrate-vscode`, `evcrate/`, `agent-templates/`, and `agent-intent.json` (`isEnrolledTemplateInventoryPath`), ignores derived storage (`isDerivedStoragePath`), and watches the parent directory to re-attach child watchers across atomic publication directory swaps. `RefreshController` and `executeRefreshPass` coordinate revisioned 200ms coalesced single-flight refresh (`STORAGE_AND_SOURCE_BOUNDS.refreshDebounceMs`), activation-epoch supersession guards, sticky forced catalog re-query (`catalogNeedsRequery`), bounded lock-contention retries, and immediate inventory withdrawal (`IMMEDIATE_WITHDRAW_REASONS`) on `catalog-changed`, `root-changed`, and `trust-changed` without deleting stored bindings.
  - **Runtime diagnostics & guidance (`diagnostics.ts`, `diagnostics-display.ts`, `command-registration.ts`)**: `buildRuntimeDiagnosticsSnapshot` builds validated `evcrate-vscode-runtime-bindings-v1` snapshots (`RuntimeDiagnosticsReport`) with separate `rootBindingRevision` and `userBindingRevision`, `templateInventorySha256`, `contributedActors`, `withheldActors`, and `removedStoredActors` (`ACTOR_REMOVED_FROM_MANIFEST`). Separates contributed `renderedSelector` from `hostObservedModel` (null until live native evidence is available) and surfaces `CACHED_SELECTION_RESELECTION_GUIDANCE` alongside distinct `CLOSED_EDITOR_STORAGE_CLEANUP_GUIDANCE` (`formatStorageCleanupGuidance` naming `<baseStorage>/resolved`).
- **Cutover & qualification boundary**: Static actor registrations have been removed; immutable templates, companion provider runtime, runtime model bindings/picker commands, and event-driven refresh/diagnostics (Phases 01–06) are implemented. Consented CLI packaging (Phases 07–08) remains pending. Per the explicit 2026-10-12 user gate amendment, live native editor qualification remains deferred to Phase 09 real-case verification.
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
- **Release workflow (Phase 07)**: `.github/workflows/release.yml` implements least-privilege producer (`contents: read`), 4-row matrix (`windows-2025` x64, Windows PowerShell 5.1 and PowerShell 7, Node 22.19.0 and 24.21.0), exact-ID handoff, and publisher (`contents: write`).
- **PR smoke (Phase 08)**: `.github/workflows/windows-smoke.yml` provides unprivileged diagnostic smoke on Windows PowerShell 7 + Node 22.19.0 with fixture identities; `.releaserc.json` locks exact Windows labels.
- **Integrated qualification (Phase 09)**: Proved full gate sequence, bare-mirror isolation, tamper rejection, 4-row matrix routing, irreversible predecessor transitions, rerun boundaries, and final seven-file byte identity.
- **Support cutover (Phase 10)**: Updated `README.md` and core docs with bounded installer/version support and explicit runtime/desktop/signing exclusions.
## Native command context and inline interview

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

`/evc-cmd-advise` uses `advise-inline/v1` semantics in the main session across seven
targets: one substantive question per turn, up to eight discovery questions and
two explicit reframe confirmation cycles. Only confirmed problems produce sanitized,
no-clobber reports of at most 32 KiB under an explicitly active plan's reports
directory or repository `plans/reports/`. Host path/create capabilities limit report
safety; missing capability stops writing without a saved-report claim.
See [architecture](./system-architecture.md#5-native-command-context-and-inline-interview)
for exact header/report contracts.

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

### Phase 10 documentation, changelog, and release promotion pipeline

Phase 10 cuts over maintained documentation, migration guidance, and the dual-branch prerelease/stable release pipeline:
- **Prerelease and promotion release pipeline:** `.releaserc.json` configured with canonical branches `["main", {"name": "next", "channel": "next", "prerelease": "rc"}]`. Workflow `.github/workflows/release.yml` triggers pushes on both branches; stable publication verifies the actual GitHub `production` required-reviewer protections rather than treating an environment declaration as a review gate.
- **Candidate mirror seeding & topology guards:** `scripts/release/run-release-candidate.cjs` seeds bare candidate mirrors with triggering branch at `sourceCommit`, seeds verified configured `main` (and `next`) refs from repository history, and pushes all local tags.
- **Stable candidate authorization:** `scripts/release/github-approval.cjs` verifies the live canonical GitHub run, protected production environment, main-only branch policy, independent review history and actual reviewer maintain/admin permission. `publish-release.cjs` requires this authorization before stable publication, independently of receipt/assets and branch topology checks. Removed approval-file authorization; stable reruns fail closed because review history lacks attempt provenance.
- **Normative documentation reconciliation:** Reconciled `README.md`, `code-standards.md`, `system-architecture.md`, `project-overview-pdr.md` (FR-12), `project-roadmap.md`, `pi-native-migration.md`, and `guide/SKILLS.md` covering universal `evc-cmd-*` / `evc-*` naming, single `AGENTS.md` authority, pre-upgrade customization backup warnings, and exact local-asset installer installation procedures.
## Documentation navigation

- [System architecture](./system-architecture.md) — central contracts.
- [Project overview and PDR](./project-overview-pdr.md) — requirements.
- [Code standards](./code-standards.md) — implementation rules.
- [Project roadmap](./project-roadmap.md) — phases and gates.
- [Project changelog](./project-changelog.md) — historical evidence.
- [Project changelog archive](./project-changelog-archive.md) — older detail.
- Canonical docs validator: [`validate-docs.cjs`](../.evcrate/source/.claude/scripts/validate-docs.cjs) searches hidden source, excludes heavy directories, and distinguishes incomplete searches from missing references.
- [Pre-Upgrade Backup & Leftover Guidance](./upgrade-backup-and-leftover-guidance.md) — operational upgrade, backup, and collision safety guidance.
