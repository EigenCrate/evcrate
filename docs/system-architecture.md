# System Architecture

**Status:** Current EVCrate core implementation reference; filesystem-policy cutover Phases 01–02, Hook Materialization Scope Distribution through Phase 09, and Windows release qualification through Phase 10 remain documented milestones.
**Advisor metrics explorer:** Historical Phases 01–10 completed 2026-09-19; standalone picker/reader source was later removed.
**DamHopper Advisor integration:** The former plugin runtime and paired host integration were retired on 2026-10-02. EVCrate core CLI/controller and shared viewer source remain; historical plugin-era qualification below does not qualify the native DamHopper integration.
**Windows support:** The qualified release boundary remains standalone installer lifecycle and clean-install `version --json`; Phase 07 native advisor execution did not qualify broad Windows runtime parity.
**Native Windows advisor:** Phases 01–04 and readiness Repairs 01–04 are complete. Phase 07 executed one native x64 row (111 passed; formal qualification invalidated by stale `.omp` manifest). Phase 06 regenerated and Linux-requalified replacement candidate `evcrate-candidate-1791140555626` (7,410 files, repaired `.omp` hash, 9/9 extracted root launch tests passed, Cycle 2 native runner fixes, 753/753 Linux tests passed, review approved 9.8/10), ready for Phase 07 requalification. Production rollout remains operator-gated.
**Updated:** 2026-10-05

**Authority:** TypeScript control plane and canonical Advisor controller. The former DamHopper plugin integration pages are historical.

This document is the central authority for distribution, advisor supervision, wire
contracts, isolation, and publication. The [codebase summary](./codebase-summary.md)
provides the source map; the [project overview and PDR](./project-overview-pdr.md)
turns these contracts into requirements.

## 1. System shape

EVCrate is a private npm package (`evcrate`, version `2.10.0`) for building and
publishing one canonical agent-harness source tree into seven persisted target
projections (`claude`, `codex`, `antigravity`, `pi`, `omp`, `copilot`,
and `vscode`). Node `>=22.19.0` is the package engine. The package exposes two npm CLI binaries:

- `evcrate` → `dist/cli/evcrate.js`, the one-shot TypeScript control-plane CLI.
- `evcrate-advisor` → `.evcrate/source/.evcrate/bin/evcrate-advisor`, the shared
  CommonJS checkpoint controller. Launch with supported Node (`>=22.19.0`), pass
  absolute HOME script as `argv[0]`, send exact UTF-8 JSON on stdin, and use
  canonical project cwd (`packageRoot` for health diagnostics). Direct POSIX
  execution and retry/fallback are prohibited.

Separately, the controller build closure packages the HOME-owned helper asset:
- `evcrate-advice-mode` → `.evcrate/source/.evcrate/bin/evcrate-advice-mode`, the
  deterministic CommonJS advice activation helper. It is not an npm CLI binary on
  PATH; maintained callers invoke it strictly via supported Node (`>=22.19.0`) using
  its absolute HOME path (`node "$HOME/.evcrate/bin/evcrate-advice-mode"`), with zero
  positional options, bounded JSON stdin/stdout, and canonical project cwd.
The control plane resolves an immutable invocation context, validates one request,
dispatches one operation, writes one result, and exits. It does not run a daemon,
listener, background broker, or provider router.

```mermaid
flowchart TD
  Canonical[.evcrate/source/.claude\ncanonical authoring] --> Build[TypeScript build/check]
  Overlays[.evcrate/targets/*\nmanifest and overlay policy] --> Build
  Build --> Snapshot[VerifiedCurrentBuild snapshot\nand build digest]
  Snapshot --> SharedPhase[Ordered Phase 1: Shared\n.evcrate/bin closure]
  Snapshot --> HarnessPhase[Ordered Phase 2: Harness\nTarget projections]
  SharedPhase --> HomeShared[Shared HOME commit\n~/.evcrate/bin]
  HarnessPhase --> ScopeHome[--scope home\nHOME harness targets]
  HarnessPhase --> ScopeProject[--scope project\nProject workspace targets]
  Checkpoint[Versioned checkpoint v2\n(v1 compatibility)] --> AdvisorLaunch[node ~/.evcrate/bin/evcrate-advisor\nExplicit Node launch]
  AdvisorLaunch --> Advisor[~/.evcrate/bin/evcrate-advisor]
  Policy[$HOME/.evcrate/advisor-routing.json] --> Advisor
  Advisor --> Envelope[One terminal controller envelope]
```
## 2. Ownership and generated boundaries

| Area | Owner | Editing rule |
|---|---|---|
| Canonical harness resources | `.evcrate/source/.claude/` | Author here; includes 30 canonical paths (22 commands, 6 workflows including neutral `advice-activation.md` and `plan-progress.md`, 2 agents). Do not hand-edit projections. |
| Shared advisor controller | `.evcrate/source/.evcrate/bin/` | Author the 46-file controller closure here (`evcrate-advisor`, `evcrate-advice-mode`, Darwin assets). |
| Target policy | `.evcrate/targets/*/manifest.json` and declared overlays | Change policy/overlays, then rebuild. |
| Generated projections | `.evcrate/source/.claude-projection`, `.agents/skills`, `.codex`, `.antigravity`, `.pi`, `.omp`, `.copilot`, `.evcrate-vscode`, and declared native project documents | Generated output; never hand-edit. |
| Controller publication | `$HOME/.evcrate/bin/` | Publisher owns one shared copy; no target owns a copy. |
| Advisor routing policy | `$HOME/.evcrate/advisor-routing.json` | User-owned input; never generated, published, replaced, or chmodded by EVCrate. |
| Resource registry | `.evcrate/registry.json` | Schema-1 resource records; separate from schema-2 target/build manifests. |

The target registry persists seven targets: `claude`, `codex`, `antigravity`,
`pi`, `omp`, `copilot`, and `vscode`. `agy` is an input alias for `antigravity`,
never persisted. Standalone Gemini is retired; Gemini model names and
Antigravity's vendor HOME directory are not retired target selectors.
Projection registration is fixed and exhaustive, with no fallback adapter.

Historical schema-1 and complete eight-target schema-2 resource registries are
validated and normalized read-only: remove Gemini; schema 1 also adds VS Code.
Current writes contain only current targets and retain original-byte CAS.

### Instruction authority and native delivery

`.evcrate/source/.claude/AGENTS.md` is the sole authoring document and an internal
resource-graph entry. Build hashes and snapshot drift bind that file, never the
generated Codex root document. Local Claude output uses `.claude-projection`;
its logical manifest/publication root remains `.claude`, so building cannot
replace the canonical authoring tree.

| Target | Project instructions | HOME instructions | Loader |
|---|---|---|---|
| Claude | `.claude/rules/AGENTS.md` | `~/.claude/rules/AGENTS.md` | Native rules; no direct AGENTS copy or shim |
| Codex | `AGENTS.md` | `~/.codex/AGENTS.md` | Native instruction chain; sole project-root owner |
| Copilot | `.github/copilot-instructions.md` | `~/.copilot/copilot-instructions.md` | Native CLI instructions |
| VS Code Local | `.evcrate-vscode/com.github.copilot/rules/bootstrap.instructions.md` | Same path under HOME | User-registered local plugin |
| OMP | `.omp/evcrate/AGENTS.md` | `~/.omp/agent/evcrate/AGENTS.md` | Installed-root context bridge |
| Pi | `.pi/agent/evcrate/AGENTS.md` | Same path under HOME | Installed extension and child-context bridge |
| Antigravity | `.agents/rules/evcrate-antigravity.md` includes `.antigravity/AGENTS.md` | `~/.gemini/config/AGENTS.md` | Native always-on rule / global standalone rule |

OMP/Pi read bounded, nonempty UTF-8 payloads without symlink traversal; main
contexts deliver once, then rebuild after compaction. OMP print skips input
hooks: provider admission aborts an operation lacking an admitted context.
Pi consumes unsafe input; its child launch reads the installed payload before
dispatch. A working-directory document is never a fallback.
Pi marks startup-bearing messages separately from prompt reminders. When
compaction retains an earlier startup message, outgoing context supersedes
only that startup content; reminders, user/other-extension instructions, and
session history remain intact. Failed rebuilds still require a fresh safe read.

Help helpers resolve their installed target and command catalog from adjacent
`scanner-layout.json`, not the caller's working directory. Only Claude offers
the standalone advisor relay; all six other current targets reject `--agent`.
Declared adapter inputs cover each adapter's transitive `dist/adapters/**`
module family, including shared transforms and VS Code helpers.

Antigravity project hooks are leaf-owned `.agents/hooks.json`, using named
`PreInvocation` handlers and `PreToolUse` matcher groups. Canonical session-init
runs only at zero-indexed `invocationNum=0`; reminders return
`injectSteps[].ephemeralMessage`. The bridge verifies but does not reinject the
instruction body. Resume/compact/clear, SubagentStart, SessionEnd, and canonical
PostToolUse context semantics have no qualified native equivalent. HOME command
relocation is structured; `~/.gemini` itself is never owned or deleted.

Mixed installs need user-controlled loader profiles. Claude's `claude-md`
project-instructions profile keeps rules while skipping Codex root AGENTS;
project `pluginConfigs` cannot set it. OMP can disable foreign context providers;
Pi's `--no-context-files` isolates its extension. Copilot natively co-loads root
AGENTS/GEMINI documents in mixed workspaces; `--no-custom-instructions` disables
all custom instructions, not just foreign ones. Respect Codex overrides/custom
HOME, native byte limits, disabled settings sources, and managed-only policies.
VS Code GUI and Antigravity native execution remain unavailable in the Phase12
environment; generated-file/runtime bridge checks are not native qualification.

`vscode` projects an isolated Agent Plugins 1.0 bundle at `.evcrate/source/.evcrate-vscode/`,
Registration is strictly user-controlled via VS Code's `chat.pluginLocations` setting;
EVCrate publication never mutates user editor settings. Copilot CLI (`copilot`) and
VS Code Local (`vscode`) remain distinct targets with separate formats, hook protocols,
and runtime lifecycles. Neither target is a controller backend; both direct advisor workflows
to the shared controller at `$HOME/.evcrate/bin/evcrate-advisor`. Standalone `--agent` relay
on `vscode` is rejected with `ADVISE_AGENT_RELAY_UNSUPPORTED_VSCODE`.

### Snyk specialist composition: local porting boundary

Canonical `.claude/agents/snyk-expert.md` orchestrates two canonical task packages: `skills/snyk-fix/` and independently reusable read-only `skills/dependency-upgrade-review/`. Existing resource import, registry and projection adapters own integration; no second generator or routing mechanism is introduced. The sealed standalone `ext/snyk-expert/` authoring snapshot is retained unchanged.

The parent supplies a canonical absolute installed resource root distinct from the target root. The consuming context explicitly reads both entrypoints and all five references; serialized preload metadata is not reference-consumption evidence. Approval stays main-owned and bound to exact proposal/intent, scope and complete current baseline. Missing execution authority stops mutation; prompt instructions and tool lists are not an OS sandbox.

All current local projections include both skill packages. Antigravity intentionally omits the general specialist agent. Codex, Pi, OMP and Copilot omit Claude agent preload/permission metadata. Pi drops the requested web tools; OMP maps `WebFetch` to `read`; Codex tool lists remain migration comments. Copilot namespaces packages and rebases relative Markdown sibling skill links, preserving handoffs from entrypoints and nested references.

Generation, resolved local links and constructed explicit-read procedure behavior are distinct from native child discovery, permission enforcement and live remediation. No all-target parity, production publication or fixed-finding claim follows from local porting. See the [qualification matrix](../plans/261001-0304-claude-snyk-agent-skill-pattern/reports/porting-qualification.md); Phase 05 live qualification remains incomplete.

## 3. TypeScript control plane

The source is organized around narrow contracts:

- `src/protocol/`: bounded JSON, canonical JSON, resource, publication, scope,
  diagnostic, advisor-settings, portable advisor-contract, and Phase E00 plugin
  domain-data wire shapes.
- `src/context/`: package, project, home, state, target, and immutable path context.
- `src/manifests/`: schema-2 target manifests, resource roots, home bindings,
  patch authorization, and manifest registry loading.
- `src/adapters/`: seven target projection adapters (six shared-registry adapters plus the
  VS Code Local native adapter in `src/adapters/vscode/`), resource graph validation,
  qualification, and target-specific transforms.
- `src/registry/`: schema-1 canonical resource scan, compatibility records, and
  deterministic queries.
- `src/imports/`: bounded explicit-source preview/apply and single-use replay tokens.
- `src/scopes/`: global/project assignments, inheritance, revisions, and CAS.
- `src/advisor-settings/`: user policy get/preview/apply, locking, journal, and
  recovery; this transaction is separate from target publication.
- `src/distribution/`: local build/check, schema-2 build verification, staging,
  publication, recovery, managed JSON/JSONC, Pi settings, and cutover gates.
- `src/cli/`: argument parsing, request-file handling, dispatch, process runner,
  output, health, and the executable wrapper.
- `src/filesystem/` and `src/errors/`: bounded paths/I/O/hashes/locks/atomicity and
  stable sanitized errors.

The CLI accepts `version`, `health`, `resources list|get`, `imports preview|apply`,
`scopes list|get|assign|remove|enable|disable`, `changes preview|apply`,
`advisor settings get|preview|apply`, and distribution `build|check|publish|all|recover`.
A complete bounded versioned request file is mutually exclusive with positional
command construction. JSON and non-TTY output use the same validated result.

### Host-native context paths

Invocation context uses a strict host/portable path boundary:

- `safePath` and `resolveSafePath` validate host-native absolute roots. On Windows,
  `validateWindowsPath` accepts drive-rooted paths and emits native separators,
  while rejecting drive-relative, UNC/device, traversal, duplicate, ADS, invalid
  character, trailing dot/space, DOS-device, metadata, and sensitive segments.
- `normalizeRelativePath` remains the authority for relative POSIX metadata in
  manifests, archives, inventories, and receipts; Windows handling does not
  broaden those identities.
- `assertNoSymlinkAncestors` is the shared ancestor guard. It walks from
  `parse(resolve(value)).root` with the host `sep`, stops only at missing
  components, and fails closed for other filesystem errors. `path-resolution.ts`
  reuses it instead of maintaining a private walker.
- Context still resolves before request loading and dispatch; `version --json` has
  no context bypass. Focused context/CLI fixtures derive roots from file URLs,
  and package smoke uses ComSpec to invoke `.cmd` through Windows command dispatch.
  Phase 09 integrated qualification plus Phase 10 support cutover qualify the
  standalone installer lifecycle and clean-install verification across the
  supported Windows matrix; broader Windows runtime equivalence remains excluded.

## 4. Build, hash, and publication

A local build stages canonical resources and selected projections outside the live
roots, validates each projection, and verifies a schema-2 manifest recording source,
adapter, controller, owner, output, and validation data. Resource file roots use a
file-domain hash separate from directory-tree identity; generic `hashFile` remains raw
bytes. A build is current only when validation and expected-file/hash/owner checks match.

Build/check and publication are separate. One neutral verified build snapshot/digest
feeds ordered shared and harness phases for scalar `--scope home|project` (default
`home`). `publication-plan.ts` derives launch intent from published path roles and
shebang bytes, not source mode; mode-only changes are not actions, and new/updated
POSIX launcher writes receive additive execute bits.

1. **Shared infrastructure**: `.evcrate/bin` is published unconditionally to
   `<home>/.evcrate/bin` in both scopes; `--target` filters only harness output.
   The controller is never materialized under a project root. Shebang, npm `bin`,
   and execute bits remain packaging metadata, not a direct-execution fallback.
   Darwin helpers are packaged for both architectures; Phase 05 source integration
   does not authorize macOS execution or testing.
2. **Harness destinations**:
   - **HOME scope (`--scope home`)**: Target manifests specify `homePolicy.bindings`
     beneath `--home`. Codex owns `.agents/skills`, not the shared `.agents` parent;
     Antigravity maps to `<home>/.gemini/config`, never the vendor parent.
     Codex global AGENTS is inside its `.codex` binding; project-root AGENTS is
     excluded from HOME. Exact native project leaves preserve unrelated siblings.
   - **Project scope (`--scope project`)**: Harness projections bind under
     `--project-root`. Target manifests declare `output_roots`, `additional_roots`,
     and `project_docs` in deterministic declaration order. Installed wrappers resolve
     internal resources from their own installation location, while runtime environment
     and `process.cwd()` remain active project workspace data. Explicit session context
     uses atomic CAS v1 state with bounded retention (7d, 256/proj, 1024/user) and CLI
     support scripts (`set-active-plan.cjs`).
3. **Transaction models**:
   - **HOME scope**: Executes as a single atomic transaction on the HOME destination volume.
     Shared and harness records share a single `releaseId` and bounded retention cleanup.
   - **Project scope**: Executes as a two-phase transaction:
     - Phase 1: Commits the shared controller to `--home` under the HOME publication lock.
     - Phase 2: Acquires the project workspace lock (holding HOME lock, never reversing locks)
       and commits harness projections to `--project-root`.
     - The shared HOME commit is never compensated or rolled back if project harness application fails.
4. **Preflight and safety invariants**:
   - Complete path validation, non-symlink ancestor/kind and containment checks, managed-resource ownership conflict checks, and intra-/cross-target overlap checks before destination reads or mutations.
   - Both destinations must verify same-volume atomicity with their respective staging roots.
5. **Partial failure semantics (exit code 5)**:
   - Failure before shared commit fails closed as an ordinary resource error.
   - Failure during project harness application rolls back only the project workspace.
   - Successful rollback outputs status `'partial'` and sanitized error code `PUBLICATION_FAILED`.
   - Rollback failure outputs status `'partial'`, error code `ROLLBACK_FAILED`, and preserves
     the project journal for recovery. Exit category is 5.
6. **Scope-isolated recovery**:
   - `evcrate recover --scope home`: Reads only schema-2 HOME publication state under
     `$HOME/.evcrate/publication/`.
   - `evcrate recover --scope project --project-root <dir>`: Validates canonical
     `projectIdentity` (lowercase SHA-256 over normalized absolute path) and reads
     project harness state under `stateRoot/project-publication/<canonical SHA-256 identity>`.
   - Recovery requires process quiescence and never crosses requested scope boundaries.

Standalone unpack layouts differ by platform: Linux uses
`<data-root>/snapshots/<snapshot>` plus a `<data-root>/current` symlink;
Windows uses `<root>/versions/<snapshot>` plus a `<root>/current.json` pointer
and `<root>/bin/evcrate.cmd`. Publication state is separate from either
installer layout.

The TypeScript engine is authoritative; no root `distribute.py` exists, and stale
Python commands are not primary procedures. Publication and advisor state/history CAS
bind kind, object, and bytes rather than permission or ctime metadata; advisor state
and history also verify bytes and lock identity at final transitions. The Windows
release candidate and publisher are separate; see [PDR FR-15](./project-overview-pdr.md#fr-15-canonical-semantic-release-candidate-and-verify-only-publisher).

### 4.1 Single-projection manifest reuse and bounded worker staging

Full-workspace manifest generation (`scripts/build-manifests.mjs`, `runAllManifestsBuild`) eliminates redundant staging cycles by projecting each persisted target once, supporting serial mode and bounded worker pools (`TargetWorkerPool`, `--jobs <n>`, default 2):

1. **Input Snapshot Isolation**: `prepareInputSnapshot(packageRoot)` stages canonical inputs (`.claude`) and compiled runtime (`dist/**/*.js`). `canonicalInputHash` computes snapshot freshness across all consumed files, including `.gitignore` (projected by Claude); manifest `treeHash` retains its canonical definition excluding `.gitignore`.
2. **Physical Boundary & Traversal Safety**: `visitSnapshotInputs` validates `assertNoSymlinkAncestors` and `assertRealDirectory`. Unsafe entries (symlinks, special files) throw `PATH_UNSAFE` immediately before any filter. Traversal filters (`isIgnoredArtifact`) bypass excluded directories (`node_modules/`, `__pycache__/`) without recursing into descendant paths.
3. **Runtime Revision Binding**: `compiledRuntimeHash` hashes all `.js` files in `dist/`. The parent verifies disk runtime against in-memory `loadedRuntimeHash`; any divergence throws `PUBLICATION_FAILED` across serial and parallel modes. Workers execute the snapshot runtime (`sharedInputs.runtimeRoot/distribution/target-worker.js`).
4. **Adapter Hash Closures & URL Restoration**: All six translated targets (`antigravity`, `codex`, `copilot`, `omp`, `pi`, `vscode`) declare their transitive `dist/adapters/**` helper closure, including `dist/adapters/uri-restoration.js`, in `adapter_sources`. Codex `applyReplacements` uses a linear regex callback for literal URL restoration, preserving template sequences (`$&`, `$$`) without cascading substitution.
5. **In-Memory Metadata Derivation**: `deriveManifestView` derives metadata for all seven targets plus the aggregate manifest entirely in memory:
   - Target policies inject mandatory `advisor-controller` (`bindings: { '.evcrate/bin': '.evcrate/bin' }`, `preserve_paths: {}`, `promotion_order: 5`).
   - Source hashes for `.evcrate/targets` are included only in the aggregate manifest and omitted from single-target manifests.
   - All eight manifests (`build-manifest.json` and seven `build-manifest-<target>.json`) are written atomically into stage (`writeAtomicFile`).
6. **Promotion Freshness & Atomic Promotion**: In `promoteUnlocked`, `options.hooks?.beforeTransaction?.()` verifies live input freshness (`assertLiveInputsUnchanged`) under the promotion lock, strictly BEFORE writing the journal or claiming destination outputs. Source drift aborts safely before journal recording, avoiding `ROLLBACK_FAILED`. Promotion commits all eight manifests and outputs in a single atomic transaction (`promoteTransaction`).
7. **Verified Return Envelope & Benchmark Metric**: `runAllManifestsBuild` returns `VerifiedAllManifestsBuild` containing `aggregateBuild`, `targetBuilds`, and `allManifestPaths`. Benchmark harness (`scripts/benchmark-build-generation.mjs`) reports post-build parent process RSS (`memoryUsage().rss`), not worker process-tree peak.
### 4.2 Release workflow trust boundary (Phases 07–10)
`.github/workflows/release.yml` implements `release-candidate` →
`windows-qualification` → `publish`.
- The producer is read-only/non-canceling, keeps Ubuntu/Node 24.21.0 gates, uploads
  only for `has_release=true`, and routes bytes by exact `artifact_id`.
- The matrix is `windows-2025` x64, `fail-fast: false`, four PowerShell/Node rows
  without checkout/npm; any non-success blocks publication.
- `publish` is the sole writer after matrix success, checks out the producer SHA,
  copies the release candidate assets, re-verifies receipt/hash/run identity, and
  checks the exact seven core release files. It does not install the plugin SDK,
  build a plugin package, or attach plugin tarballs.
- Phase 09 proved integrated routing and final seven-file byte equality; Phase 10
  completed the bounded documentation/support cutover.

### 4.3 Unprivileged Windows PR smoke (Phase 08)
`.github/workflows/windows-smoke.yml` triggers only `pull_request` and manual dispatch; `contents: read` plus canceling concurrency keep PR execution unprivileged.
- On `windows-2025` x64 with Node `22.19.0`, it runs `npm ci` after pinned checkout/setup-node actions.
- It reads the checked-in version and current 40-hex SHA, builds diagnostic fixture assets with `--allow-fixture-identity`, verifies exact-seven files, and invokes the same smoke harness with explicit `--powershell pwsh.exe`.
- It has no secrets, write scope, upload, semantic-release, privileged follow-up, or release handoff; status is diagnostic only.
- `.releaserc.json` uses exact post-qualification labels `Windows x64 Archive` and `Windows Installer Entrypoint (install.ps1)`; other asset paths/labels and prepare authority remain unchanged.
- `tests/distribution/release-orchestration.test.mjs` covers WRQ-042 (workflow boundary), WRQ-043 (fixture/verify/smoke), and WRQ-044 (labels/preserved config).

The controller build is a separate exact closure rooted at `.evcrate/source/.evcrate/bin` (46 total entries: 36 shared/Windows files, 8 Darwin-specific entries, plus 2 deterministic advice activation assets: `evcrate-advice-mode` and `lib/advisor/activation.cjs`):
- **38 shared/Windows entries**: `evcrate-advisor`, `evcrate-advice-mode`, `lib/advisor/` (`activation.cjs`, `adapter-contract.cjs`, `adapter-registry.cjs`, `adapters/{claude,codex,omp,omp-parser,pi}.cjs`, `checkpoint-contract.cjs`, `contracts-v2.cjs`, `controller-envelope.cjs`, `controller.cjs`, `errors.cjs`, `generated/{advisor-contract-runtime,advisor-metrics,canonical-json,json}.js`, `history-{contract,prune,query,store}.cjs`, `isolated-workspace.cjs`, `json-document.cjs`, `managed-checkpoint.cjs`, `policy-schema.cjs`, `profile.cjs`, `runner.cjs`, `runtime-brief.generated.cjs`, `state-{baseline,contract,human,io}.cjs`, `task-state.cjs`, `windows-native.{cs,ps1}`, `windows-platform.cjs`).
- **8 Darwin entries**: `lib/advisor/darwin-platform.cjs`, `lib/advisor/native/darwin/` (`advisor-native.{c,h}`, `prebuilt/artifacts.json`, `prebuilt/{darwin-arm64,darwin-x64}/advisor-native.node`, `process.c`, `storage.c`).
`runtime-brief.generated.cjs` is generated by
`scripts/generate-runtime-brief.mjs` from the canonical
`.claude/skills/advisor-strategy/references/brief-contract.md`. The artifact
contains the instructions, SHA-256 digest, and `evcrate-advisor-v2-*` build
identity; it is part of the closure and is not hand-edited.

The controller closure permits only regular, non-symlink files; both `evcrate-advisor` and `evcrate-advice-mode`
are checked for their canonical Node shebang (`#!/usr/bin/env node`). Closure hashes cover file bytes, not
permission modes, and reject missing, extra, stale, or mismatched entries. Linux
`install.sh` grants mandatory CLI/advisor roles execute bits regardless of archive
mode and runs the staged CLI directly; required chmod failure aborts installation.

Native Windows Phase 02 synchronized installer inventories at its then-current 36-file baseline; Phase 05 Darwin expanded this to 44 entries; and deterministic advice activation brings the generated controller closure to exactly 46 entries. Generated inventory and installer manifests remain in parity.
The Windows sandbox publication evidence below is historical 36-file verification, not macOS qualification. The current Darwin support boundary is in Sections 5.6 and 7.

## 5. Shared advisor controller

### 5.1 Policy and migration boundary

The controller reads exactly one required user-owned policy:
`$HOME/.evcrate/advisor-routing.json`. There is no repository-local fallback,
default, partial merge, or host-route selection. Phase 01 freezes policy v2:

```json
{
  "version": 2,
  "advisor": {
    "primary": {"backend": "codex", "model": "operator-selected", "effort": "high"},
    "backup": {"backend": "omp", "model": "operator-selected", "effort": "high"}
  },
  "wait": {"mode": "until_terminal", "warn_after_ms": 120000, "warn_every_ms": 300000},
  "history": {"retention_days": 30, "max_bytes": 104857600}
}
```

The top level is exactly `version`/`advisor`/`wait`/`history`; routes are
exactly `backend`/`model`/`effort`. Primary and backup triples must differ.
Wait warnings are bounded to `1000..3600000` ms; history retention is
`1..365` days and quota `1048576..1073741824` bytes. There is no v2
`timeout_ms`; generation mode has no generation deadline while input, streams,
output, termination, and adapter probes remain bounded. Policy bytes remain
bounded to 16 KiB and use fatal-UTF-8/strict-JSON parsing,
duplicate-key, control-character, credential, unknown-field, unsafe-path, and
candidate-backend checks. The policy file is regular and user-managed input.
`$HOME` and `.evcrate` ancestors must be real, path-safe directories; host
permissions and umask are preserved without UID/SID/ACL or exact-mode checks.
Candidate backends are `claude`, `codex`, `antigravity`, `pi`, and `omp`;
enabled backends are `claude`, `codex`, `pi`, and `omp`. `antigravity` is an
unavailable candidate; Gemini and Copilot are not controller backends.

Legacy host-v1 and single-target-v1 documents are inspectable through the
settings `get` path as read-only `migration_required` views, but runtime
execution rejects them with distinct migration errors. Migration is explicit:
`settings get` -> operator prepares v2 -> `preview` -> `apply`. Apply preserves
the legacy revision for CAS, requires a complete backup route, and never
rewrites HOME automatically. Settings request/result, preview, and journal
wire schemas remain version 1; they carry a v2 policy payload. Old journals
recover in their own byte/digest format before v2 mutation; old preview tokens
cannot authorize v2 semantics.

### 5.2 Phase 01 v2 contract freeze

The standalone CJS validator remains separate from the TypeScript protocol
runtime. They share exact schemas and parity fixtures; CJS cannot import `dist/`
or projected resources. The TypeScript runtime has no `node:*` imports, process
state, HOME access, filesystem access, or crypto dependency.

Phase 01 prepares an exact four-file TypeScript protocol closure boundary:

1. `src/protocol/advisor-contract-runtime.ts` owns portable advisor policy,
   checkpoint, result, receipt, attempt, envelope, and history types/constants
   plus deep-freezing and neutral code/path validators.
2. `src/protocol/advisor-contracts.ts` retains state v1 contracts and re-exports
   the portable runtime for existing state consumers.
3. `src/protocol/advisor-settings.ts` delegates shared policy validators and maps
   runtime violations to the settings <code>SETTINGS_INVALID</code> boundary.
4. `src/protocol/index.ts` exports the runtime alongside the existing protocol
   barrels; `src/index.ts` exposes it transitively.

The Phase 01 four-file TypeScript boundary is source/export preparation only.
Advisor-metrics Phase 02 added the four generated CommonJS modules under `lib/advisor/generated/`; native Windows advisor Phase 02 expands the exact controller closure to 36 files, while the dated 29-file release evidence remains unchanged.

The following wire versions remain frozen:

| Contract | Version | Boundary |
|---|---:|---|
| `advisor-routing.json` policy | 2 | User-owned HOME input; primary/backup, wait, history. |
| `evcrate-advisor-checkpoint` | 2 | Managed caller to controller; identity, task, proposal, evidence, prior. |
| `evcrate-advisor-result` | 2 | Controller-normalized structured counsel. |
| `evcrate-advisor-controller` | 2 | Terminal envelope with attempts and audit status. |
| Settings request/result, journal, preview | 1 | Existing TS transaction transport; policy payload is v2. |
| Task state, execution history, outcome | 1 | Local records follow the cross-platform trusted-files policy; task state remains required gate authority, while history/outcome provide optional rich audit. |

The v2 checkpoint requires `task_run_id`, `checkpoint_id`, `phase_id`,
`task_revision`, `evidence_revision`, decision kind, task constraints,
proposal, bounded evidence, and prior disposition. It is at most 32 KiB:
question 4 KiB, task/proposal text 8 KiB, evidence text 16 KiB, four evidence
files, and sixteen changed paths. Paths are normalized relative POSIX metadata;
the controller does not read or mount them. Evidence digests bind selected
content; they do not prove semantic correctness.

The v2 result requires non-omittable `recommendation`, `rationale`,
`must_fix`, `cautions`, `assumptions`, `success_checks`, and
`unresolved_questions`; body limit is 16 KiB. The v2 envelope binds
correlation/task/checkpoint/evidence identity, receipt/build identity,
bounded ordered attempts, result or sanitized error, and `audit_status`.
It allows at most five model-started attempts and eight summaries; successful
counsel requires confirmed cleanup. Task state is capped at 64 KiB;
execution and outcome records at 128 KiB and 64 KiB.

Phase 01 freezes retry slots (`10/20/30` seconds for primary, one backup),
cleanup classifications, gate statuses, and correction cap (`3`) for later
phases. It does not itself activate indefinite generation, retry orchestration,
task-state commands, or history tooling.

#### Phase 02 checkpoint digest and history metrics

The checkpoint digest is a compatibility byte contract, not canonical JSON:
validate the v2 object without reconstruction or key sorting, preserve parsed
property insertion order, UTF-8 encode `JSON.stringify(validatedCheckpoint)`,
then SHA-256 those bytes and emit lowercase hex. The Node adapter uses
`createHash('sha256')`; browser consumers hash the same `TextEncoder` bytes with
Web Crypto. The non-lexicographic golden fixture protects retained history.

`src/protocol/advisor-metrics.ts` is the portable, deterministic kernel. Its
pure API is `normalizeHistoryRecord`, `normalizeHistoryFilter`,
`filterHistoryRecords`, `nearestRankPercentile`, and `calculateHistoryMetrics`;
callers supply `generated_at`, and the kernel performs no filesystem, crypto,
DOM, process, or locale work. It lowercases identities, excludes invalid
execution records, excludes every conflicting duplicate identity with a
`DUPLICATE_IDENTITY` diagnostic, and deep-freezes returned values.

The exact ten-key filter is null/unconstrained, OR-within and AND-across, with
inclusive positive timestamp bounds. Ratios use numerator/denominator/excluded
counts, six-decimal rounding, and `null` for zero denominators. Latency uses
terminal `receipt.elapsed_ms` only and nearest-rank p50/p95; attempt, failure,
and route groups use stored facts and deterministic code-point ordering. Results
carry scan diagnostics, counts, missingness, completeness, and stable limitation
codes so partial or unattested history is not presented as causal evidence.
#### Phase 04 history metrics CLI integration

`evcrate-advisor history metrics` is a read-only, current-project projection of
the retained controller history. The request is one bounded
`evcrate-advisor-history` v1 object with exact keys
`protocol`, `version`, `operation`, `project_id`, `task_run_id`, and `filters`:

```json
{"protocol":"evcrate-advisor-history","version":1,"operation":"metrics","project_id":null,"task_run_id":null,"filters":null}
```

`project_id: null` selects the invocation project; an explicit ID must match it.
An optional `task_run_id` is applied before the shared kernel's exact ten-key
filters. Collection is unlocked and non-atomic, reuses bounded descriptor-safe
history scanning, and never exposes absolute paths or HOME data. Valid execution
records are normalized through the generated metrics runtime; invalid execution
records are excluded with sorted relative-path diagnostics, while missing or
invalid outcomes remain visible as distinct missingness. Scan bytes, accepted and
invalid counts, completeness, and diagnostic suppression are returned.

The result is the standard `evcrate-advisor-history` v1 envelope with
`operation: "metrics"`, `status: "HISTORY_READY"`, metric-definition version,
scope, normalized filters, counts, metrics, missingness, scan facts,
completeness, and limitation codes. It exits zero only for `HISTORY_READY`;
malformed requests remain sanitized `FAILED`/`REQUEST_INVALID` results. The
operation does not claim complete audit coverage, task success, cost, saved
time, or causal effectiveness, and does not alter list/show/export/prune.

#### Historical standalone explorer milestones (Phases 05–10; 2026-09-18–19)

Historical milestones recorded explicit-handle history traversal, React explorer builds, benchmarks (p95 scan 1,643 ms), and Chromium/Linux limits. These browser sources were subsequently removed; the dated records do not establish current standalone support or G4 qualification.

### 5.3 Compatibility checkpoint wire contract
The existing compatibility helper still accepts the v1 direct checkpoint. The
executable receives it directly on stdin; no outer operation, active-host field,
route override, executable, argv, credential, debug, or fallback field is
accepted. Its ten keys are `protocol`, `version`, `checkpoint`, `question`,
`kind`, `task_or_phase`, `evidence`, `changed_paths`, `prior_counsel`, and
`owner_disposition`. New callers must use the v2 contract above.

#### Durable v2 task gate

The managed default entrypoint requires a prior `evcrate-advisor state checkpoint`
reservation for v2 inference. State operations never launch a model. Run all
operations from the same canonical project directory: its SHA-256 identity scopes
`$HOME/.evcrate/advisor-state/<project-id>/<task-run-id>/state.json`.

Each request is one strict JSON object on stdin with exact keys:
`protocol: "evcrate-advisor-state"`, `version: 1`, `operation`, UUID `task_run_id`,
UUID `operation_id`, `expected_revision`, and `payload`. `get` requires null
operation/revision IDs. `init` expects revision zero; returned state starts at
task revision one and evidence revision zero. Other mutations use the latest
returned task revision; immutable checkpoint revisions remain bound to their
reservation input while claim/attachment advance storage revisions.

| CLI operation | Payload |
|---|---|
| `state init` | `phase_id`, checkpoint-shaped `task`, selected `baseline_paths` |
| `state get` | Empty object; also returns pending process status |
| `state checkpoint` | Validated v2 `checkpoint`; returns exact input and consultation ID |
| `state disposition` | `consultation_id`, `evidence_revision`, `action`, `rationale`, `correction` |
| `state outcome` | `consultation_id`, `action_id`, `episode_id`, `result`, `validation`, `actual_changed_paths` |
| `state human-decision` | `action`, `rationale`, `authorized_paths` |
| `state complete` | Empty object |

Disposition actions: accept, reject-with-evidence, need-evidence, reconcile.
Correction is null or `{action_id, episode_id, validation_command}`. Outcomes
resolved/unresolved/regressed require terminal matching validation; unknown keeps
the correction incomplete. Only failed unresolved/regressed corrections increment
the episode count. A relevant verified resolution ends it. Three failures require
human continuation, consumed by one correction without resetting that count.

For concern-free advice (`action: 'accept'`, `correction: null`), `outcome`
supports `action_id: null`, `episode_id: null`, `result: 'resolved'`, with empty
`actual_changed_paths` and matching passed validation, advancing to
`gate_status: 'open'` and enabling `complete` without invented edits. A final
review consultation confirming clean state can likewise complete via this
no-correction outcome path.

End-to-end ledger headroom: accepting a checkpoint requires space for the entire
minimal closure sequence (checkpoint + attach + disposition + outcome + complete = 5
slots), failing closed (<code>STATE_GATE_BLOCKED</code>) before inference if the
ledger cannot accommodate that path. While pending, `recover-pending` requires
only 1 ledger slot as the terminal outcome of the reservation.

A preflight replay check inspects `operation_ledger` before invoking
`observeTerminalDecision`, ensuring exact matching replays return existing state
idempotently without re-prompting the controlling terminal or failing if TTY is
absent on replay.

Git baseline records selected dirty/index/rename/deletion metadata, discovering
staged rename identity (`git diff --cached --raw -z --find-renames`) even when
only one rename endpoint is selected in scope. Outcome actual change attribution
compares both content digests and Git status/identity metadata.

Per-task locking (`state.lock`) covers bounded synchronous state read/write,
file hashing (up to 64 MiB total), and bounded Git metadata commands (up to 5s
per command). No model wait occurs under lock. Competing writers encounter
<code>STATE_LOCKED</code>; inspect the current state and retry after the bounded
transaction, which may be non-trivial when hashing or Git metadata is required.

Offline operator recovery: in the event of a crash during atomic publication
leaving a temporary file (`.state-*.tmp`) or hard-linked state (`nlink = 2`), or
an uncertain recovery guard (`state-recovery.lock`), the store fails closed.
Recovery is operator-only: stop every process accessing the task directory,
verify owner/mode/type plus device/inode/link identity and recorded process
death, then identify the exact `.state-*.tmp` link sharing `state.json`'s inode
before unlinking it. Remove a recovery guard only after its recorded processes
and lock identity are verified dead. Never use wildcard or age-based cleanup,
blind reset, or replacement of the state file.

Human actions are continue, revise-scope, abandon, recover-pending. The Linux CLI
uses a separate controlling terminal and exact randomized confirmation; piped
JSON cannot supply an attestation. This is a cooperative interaction, not proof
against same-user automation. Per-host authentic event linkage remains Phase 08.
Recovery preserves state/work, requires dead or never-started pending identity,
and never kills or relaunches a process.

State files follow the cross-platform trusted-files policy (no UID/SID/ACL/0700/0600 private-mode enforcement; preserving OS permissions/errors, kind/symlink/nlink/identity/path/schema/bounds/CAS/process locks, and human approval). State is strictly validated and bounded to 64 KiB. A 64-entry operation
ledger and 16 human-decision limit fail closed rather than forget replay IDs.
Selected baseline records retain initial user content digests plus relevant Git
dirty/index/rename/deletion metadata; current evidence freshness ignores unrelated
files. Selected exact file paths are bounded to 32 (16 proposed changes), reads
to 16 MiB/file and 64 MiB total. Digests and declared validation identity do not
authenticate executor claims or prove semantic/hunk attribution.

Storage uses descriptor-pinned I/O, atomic fsync writes, and short
process-start/token locks; no lock survives an inference wait. Windows and Linux
state, baseline, and history paths operate under the trusted-files policy while
retaining platform branches and schemas. Advisor filesystem UID/SID/DACL/mode
restrictions were removed; the prior Phase 03/04 follow-up requiring path-threaded
Windows ownership verification is superseded. Unknown process identity remains
preserved for inspection. Optional rich audit is not required state authority.
Legacy v1 callers remain outside this v2 durable state path; canonical advice-mode callers use it. This caller-side binding does not change controller API, freshness checks, or routing policy, and claims no universal mediated-write enforcement.
#### Canonical caller lifecycle
Canonical workflow architecture separates activation, neutral historical inspection, and authorized mentoring into three distinct contracts:
1. **Neutral activation (`advice-activation.md`)**: Invokes `$HOME/.evcrate/bin/evcrate-advice-mode` with supported Node before any state initialization or mentoring load. Evaluates raw arguments and optional structured direct handoff to resolve mode (`off`, `explicit`, `inherited`).
2. **Neutral historical reconciliation (`plan-progress.md`)**: In `off` mode, never invokes `evcrate-advisor` (no get, no locks); its dependency basis is immutable in-repo receipts plus sealed-path metadata, reported `receipt-attested; controller not consulted` (an identified unreceipted run pauses same/overlapping scope only). Only in `explicit` or `inherited` mode does it inspect progress via identified `state get`. Never initializes state, claims runs, or writes durable ledgers. Permits existing lock acquisition/release and provably dead lock reaping. Association requires matching project identity, repo-relative plan/phase paths, controller phase, and snapshot digest (UUID alone is not authority). Completed scope is a verified no-op; controlled unresolved scope pauses cleanly without automatic resumption, replacement UUID, or gate bypass.
3. **Authorized mentoring (`advisor-mentoring.md`)**: Loaded conditionally ONLY upon resolved `explicit` or `inherited` mode. Off mode forbids eager mentoring through navigation, loops, or fallback prompts; off mode preserves ordinary debugging, review corrections, validation, approvals, and command-scoped Git policy without advice lifecycle calls (L=0).

For active advice runs, [caller lifecycle binding](../.evcrate/source/.claude/workflows/advisor-mentoring.md#caller-lifecycle-binding) governs checkpoints:
- **Fresh first review:** Settle implementation, declared validation, reviewer output, documentation, and writers before the writer barrier; parent initializes once immediately before first checkpoint reservation.
- **Active run/handoff:** Preserve advice mode, `task_run_id`, phase/project root, revisions, prior context, and correction accounting; parent alone owns state. Accepted registered work must finish actual validation and matching outcome before next checkpoint.
- **Baseline and freeze:** Capture `task.authorized_paths ∪ evidence.files[*].path ∪ evidence.artifacts[*].path`; only `authorized_paths` grants write authority. Freeze full manifest plus selected Git index/status identity from baseline capture through completion.
- **Finalization:** Whole-phase scope includes planned documentation, reports, status, and selected Git index transitions. Authorize each in advance, record disposition, perform bounded changes, run declared validation, then record truthful outcome before `complete`.
- **No-change:** Require no file or selected index changes, passed declared validation, `accept`, and no `must_fix` items or unresolved questions.
- **Current versus captured status:** `progress.md` is a derived live overview for advice-controlled plans. Parent publishes immutable scope/run-specific receipts outside the snapshot after successful completion; captured plan/status wording stays historical. Ordinary plans update `plan.md`.

### 5.4 Current v1 compatibility and v2 bounded transaction envelopes

`runController` accepts both the v1 compatibility checkpoint and the v2
checkpoint. The v1 compatibility path remains one target and one model attempt.
For v2, Phase 05 runs a managed transaction with up to four sequential primary
launches on transient failures, using cancellable 10/20/30-second backoff. After
four primary failures or a route-local preflight skip, it qualifies and invokes
the configured backup once. Backup failure is terminal; there is no provider or
model substitution, parallel hedge, or local fallback.

The controller generates a correlation UUID, parses the checkpoint, loads policy
once, probes each selected adapter before its launch, creates one empty isolated workspace under the trusted-files policy, and cleans up after each child exits.

For v2, the controller computes the checkpoint digest; `formatMentorPrompt` combines the canonical mentor brief with explicitly quoted checkpoint data.
Its tool-less instructions require outcome follow-through, evidence/assumption separation, relevant boundary/error/interleaving analysis, plausible-cause discrimination with expected observations, adversarial review, and caller-owned verification.
The same `context.prompt` reaches Claude, Codex, OMP (`omp-parser`), and Pi without adapter-specific mentor text; each extracts raw assistant text for shared seven-field `parseAdviceBody` validation before `normalizeResult` creates `evcrate-advisor-result` v2. The OMP adapter parser (`adapters/omp-parser.cjs`) enforces 1 MiB and 8192-line JSONL stream caps and accepts optional omp 18.7.0 `serviceTier` and `usage.premiumRequests` fields.

`parseAdviceBody` accepts exactly one JSON object with seven fields:
`recommendation`, `rationale`, `must_fix`, `cautions`, `assumptions`,
`success_checks`, and `unresolved_questions`. It rejects markdown fences,
leading/trailing prose, missing or unknown fields, malformed lists, control
characters, sensitive material, and raw stack frames. The stack guard covers
Node (`at ...:line:column` and `node:internal`), Python (`File "…", line N`),
Go (`goroutine N` and multiline `.go:N` frames), and Rust (`stack backtrace`
and hexadecimal frame forms). Ordinary prose in a field remains valid when it
does not match those frame shapes.

Public V2 envelope validation recomputes the checkpoint digest with
`computeCheckpointDigestV2` and compares it with the supplied envelope value;
it also checks task/checkpoint identity and revisions. When validation receives
`expected_build_identity`, it must equal `receipt.build_identity`; the builder
and `receiptV2` additionally require the generated **ADVISOR_BUILD_IDENTITY**.
For success, the selected attempt's route backend/model/effort must correspond
to the receipt, including exact effort equality. These checks prevent stale
checkpoint, build, or route metadata from being treated as counsel.

The v2 envelope preserves task/checkpoint/evidence identity, checkpoint digest,
receipt/build identity, controller version 2, ordered attempt summaries, and
audit status. Success requires a model attempt with confirmed cleanup.
The v1 path keeps its compatibility result/envelope shape. Both paths emit one
terminal JSON line with `status: "ADVICE_READY"` or `status: "FAILED"`.
Failures expose only sanitized `code`, `category`, `action`, and `message`;
stderr is empty; exit code is zero only for success.

### 5.5 Adapter and process isolation

Each enabled adapter owns credential-safe version/auth/capability probes, fixed
arguments, and result parsing. Installed vendor CLIs retain their own credentials;
EVCrate's adapter auth-key allowlists are empty. Version equality alone is not
qualification: model/effort controls, authentication boundary, no-tool/session
policy, output protocol, and lifecycle probes must pass.
For v2, every primary retry and the one-shot backup repeats adapter qualification
and qualification-to-spawn executable identity checks. At most one model process
is active; cancellation, non-retryable failure, or unconfirmed cleanup prevents
later launches.

The runner uses `shell: false`, fixed allowlisted argv/environment, stdin-only
prompt delivery, fatal UTF-8 decoding, bounded streams/results, and one
monotonic deadline. POSIX detached process groups receive TERM, then KILL if
needed, and descendants are reaped. The workspace is empty, isolated, outside
the repository, checked against symlink/identity changes, and removed after
child termination.

### 5.6 Approved Node-only launch contract & cross-platform runtime boundary

Status: Approved Node-only launch contract and caller migration (Phases 01–02, 2026-10-04); Phase 06 replacement candidate regenerated (ID: `evcrate-candidate-1791140555626`, review approved 9.8/10); ready for Phase 07 native Windows requalification.
Standardizes advisor invocation on one cross-platform tuple across Linux, native
Windows, and macOS, while defining the approved Darwin runtime enablement boundary:

```text
executable = supported Node executable (engine >=22.19.0)
argv       = [absolute HOME-owned evcrate-advisor path, ...operation arguments]
stdin      = exact request JSON encoded as UTF-8, then EOF
cwd        = canonical caller project directory (packageRoot for health diagnostics)
```

1. **Invocation and executable resolution**:
   - Programmatic Node callers running under Node use `process.execPath`.
   - Shell and harness callers invoke the configured or available supported `node` executable.
   - Bun-hosted harnesses must not assume Bun `process.execPath` is Node; select actual Node explicitly. No Bun support is added to the Node-only CLI.
   - Executable resolution is performed once per invocation; launch failure is terminal transport failure, never an implicit fallback to direct execution or alternative interpreter.
2. **Absolute HOME and controller path resolution**:
   - The controller path must be an absolute native path under authoritative HOME: `<home>/.evcrate/bin/evcrate-advisor`.
   - Explicit `HOME` when present must be non-empty, absolute, and safe; empty, invalid, or relative explicit HOME fails closed. Never use `HOME || os.homedir()`.
   - Windows native-profile fallback (`USERPROFILE` / `UserProfile`) applies only when `HOME` is absent.
   - Native path joining and argv arrays with `shell: false` are required; never pass unexpanded `~`, JSON in argv, or `node -e` interpolation.
3. **Stdin and argument contracts**:
   - Standard input streams exact UTF-8 request JSON followed immediately by EOF.
   - Argument arrays preserve exact operations: `[]` for checkpoint inference, `['state', op]`, and `['history', op]`. Diagnostic requests use empty argv and their distinct envelope.
   - Standard output framing, byte limits, cancellation signals, and terminal envelopes (`ADVICE_READY`, `QUALIFIED`, `STATE_READY`, `HISTORY_READY`, `FAILED`) are strictly preserved.
4. **Platform support and Darwin boundary**:
   - **Linux**: Primary implementation platform; qualified with real local smoke verification, focused regressions, and full package/projection gates.
   - **Native Windows**: Phase 07 exercised Windows x64, PowerShell 5.1, Node `v24.21.0`: 111/111 portable/native advisor tests passed, as did installed lifecycle and PowerShell transport. Formal qualification failed when required `node-launch-behavior` hit a stale `.omp` candidate build-manifest hash. Phase 06 completed replacement candidate regeneration (`evcrate-candidate-1791140555626`) with repaired manifests, Cycle 2 runner fixes, and clean Linux requalification, ready for Phase 07 re-execution.
   - **macOS (Darwin)**: Phase 05 integrates the packaged Node-API 8/ABI 1 bridge with state, baseline, history, export/prune, and workspace paths. The code is present but untested/unqualified; addon/controller/provider execution, tests, and CI remain prohibited.
   - **Cycle 3 boundary**: Static review plus Linux results do not qualify native behavior. An outstanding static warning identifies `owns_parent` as uninitialized for `/var` and `/tmp` intermediate capabilities, a potential descriptor leak; no macOS behavior has been tested.

### 5.7 Darwin native runtime architecture and capability model (Phase 05)

Darwin runtime integration introduces a descriptor-relative capability architecture gated strictly by `process.platform === 'darwin'`:

1. **Strict platform isolation**: All Darwin capability and process logic is isolated behind platform checks; Linux (procfs, kill-0, fd-pinning) and Windows (PowerShell/Job Objects) invariants are preserved without shared fallback paths.
2. **Descriptor-relative capabilities**: Pinned capabilities replace logical path mutations across runtime modules:
   - `state-io.cjs`: Traverses roots via `openRoot`, performs transactional mutations and locks via `openDirectory`, `openRegular`, and `removeOwned`.
   - `state-baseline.cjs`: Captures baseline and rehashes files using descriptor-relative capabilities and stat comparisons; safely rewalks missing paths without pathname traversal.
   - `history-store.cjs`: Manages history roots and consultation directories via capability descriptors; enforces sync and bounds.
   - `history-query.cjs` & `history-prune.cjs`: Safely re-pins parents for post-scan reads; performs capability-scoped pruning of owned leaves and empty directories.
   - `isolated-workspace.cjs`: Resolves temp roots and creates workspaces via `openDirectory(..., true)` requiring `created=true` provenance, followed by recursive capability cleanup.
3. **Scoped parent capability ownership (`owns_parent`)**: In `AdvisorCap` (`storage.c`, `advisor-native.c`, `advisor-native.h`), intermediate directory descriptors opened during `openRoot` set `owns_parent = true` so leaf closure reclaims the ancestor descriptor chain. Child capabilities from `openDirectory` set `owns_parent = false` to preserve the caller's shared parent capability.
4. **Process identity & self-token verification**: Darwin process status is evaluated from monotonic start tokens (`getDarwinProcessIdentity`, `checkDarwinProcessStatus`). A valid non-null self token is mandatory before writing state locks (`state.lock`), history locks (`history.lock`), recovery guards (`state-recovery.lock`), or persisting pending consultations (`claimCheckpoint`).
5. **Cycle 3 static review & status boundary**: An outstanding static review warning flags uninitialized `owns_parent` for `/var` and `/tmp` intermediate capabilities. Darwin implementation is present but untested/unqualified; addon loading, controller/provider execution, automated tests, and CI on macOS remain prohibited.

## 6. Advisor supervision and command projections

Deterministic advice activation is governed by the packaged Node helper `evcrate-advice-mode` (`$HOME/.evcrate/bin/evcrate-advice-mode`) executed with supported Node (`>=22.19.0`) before any state initialization or full mentoring load. Supported OMP command entrypoints run helper admission before the prompt; activation membership derives from the helper's exported frozen `COMMAND_NAMES` array (single authority). Other hosts follow their projected receiving contract:
- **Wire, realpath and execution limits:** Strict bounded JSON stdin (`protocol: "evcrate-advice-mode"`, version 1, max 64 KiB), raw arguments (max 32 KiB), terminal output (max 256 KiB), and 2-second input/output deadlines. Invoked with zero positional options from canonical `project_root`. CLI compares `fs.realpathSync(project_root)` to `fs.realpathSync(process.cwd())`; a symlinked logical root is accepted, while an unresolvable or different root fails with `ADVICE_CONTEXT_MISMATCH`; original context is echoed on success. Selection paths (`plan_path`, `phase_path`) are validated by metadata and relative-POSIX safety only: reject leading `/`, `\`, `:`, controls, empty/`.`/`..` components, trailing `.` or space, characters `<` `>` `"` `|` `?` `*`, and case-insensitive device stems CON, PRN, AUX, NUL, CLOCK$, COM0–COM9, LPT0–LPT9, COM¹ COM² COM³, LPT¹ LPT² LPT³, CONIN$, CONOUT$, with or without any extension as well as device stems with optional spaces before an extension (conservative admission policy, no Windows qualification claim; names with internal spaces or merely resembling stems stay accepted); 1 KiB bound; no sensitive-name filter — artifact readers keep their own fences.
- **Token parsing, quote spans & byte preservation:** Strict quote-span and whitespace boundaries govern flag parsing. Single (`'...'`) and double (`"..."`) quotes define non-evaluating spans where flags are ignored. A quote opens a span only at an unescaped token boundary (start of input or after unescaped whitespace); mid-token quotes (`don't`, `café's`, `日本's`, `5" bezel`) are ordinary text (no word-character apostrophe heuristic). In boundary-less constructs such as `key="x --advice y" --advice` or `("use --advice here") --advice`, the inner flag is not inside a quote span, producing two eligible flags that fail closed with `ADVICE_MODE_DUPLICATE_FLAG` rather than silently activating. Backslashes escape following characters (`\"`, `\'`, `\\`); odd backslashes escape quotes and suppress flags; unclosed quotes extend to the end of arguments suppressing flags (`off` mode). Standalone unescaped `--advice` requires whitespace or string boundaries; duplicate eligible flags reject with `ADVICE_MODE_DUPLICATE_FLAG`. Original task bytes and quotes are never stripped or shell-evaluated; only the final standalone `--advice` token and preceding whitespace are stripped when resolving `explicit` mode.
- **Modes & lazy mentoring:**
  - `off` (`NO_FINAL_FLAG`): Helper performs zero state init, zero get (`L=0`), and never loads mentoring. Off mode never invokes `evcrate-advisor` (no get, no locks); dependency reconciliation uses immutable in-repo receipts and sealed-path metadata, reported `receipt-attested; controller not consulted`; an identified unreceipted run pauses same/overlapping scope only.
  - `explicit` (`EXPLICIT_FINAL_FLAG`): Mentoring loads lazily only after helper confirms explicit mode; fresh init at existing lifecycle barrier.
  - `inherited`: Structured caller handoff without synthetic flags or eager run creation. Reasons: `INHERITED_PRE_RUN` (routers `/cmd-cook`, `/cmd-fix` forward context with `run: null`, preserving known `plan_path`, `phase_path`, and `phase_id`; downstream receivers may refine only unknown `null` selections) or `INHERITED_SAME_RUN` (forwards verified binding; lazy get validates project/phase/revisions; completed/abandoned runs fail closed with `ADVICE_RUN_COMPLETED`).
- **Fail-closed:** Missing/unreadable helper, unsupported Node, nonzero exit, malformed output, context mismatch, or stale revisions halt routing immediately with a sanitized four-key diagnostic (`{ code, category, action, message }`). Diagnostics distinguish missing Node (`Node >=22.19.0 not found on PATH…`), missing helper or unreadable packaged resource (republish via `evcrate publish --apply --scope home --target omp`; if CLI unavailable, manual `./install.sh repair` or fresh `./install.sh install` from release bundle; admission never downloads or executes installers), and helper faults (`HOME activation helper failed: <reason>`, without Node wording). No alternate parser, automatic install, retry loop, or heuristic mode inference.
- **Cooperative boundary & handoffs:** Canonical entry/replay rule: *"A user-entered command always uses `handoff: null`. A handoff exists only when built by the router delegating this exact call; never reuse or replay one from earlier turns, commands, plans, reports or transcripts."* Handoffs and context headers are a cooperative contract, not authentication (severity MEDIUM); pre-run inheritance grants no more than a fabricated `--advice`; capability tokens were rejected because a model could mint one via a fabricated flag while a token store, locks, and expiry add cost without closing that boundary. Native user invocations have `handoff: null` and initial null plan/phase selections. Mentoring instructions are loaded lazily. No V1/direct API or CAS schema changes.
- **Multi-target packaging and transports:**
  - *OMP:* Supported command admission executes the HOME helper before prompt admission, injecting `evcrate_omp_command_context` with `protocol`, `version: 2`, `source: "native-user"`, `command`, `mode`, `reason`, exact `context`, and `run`. No duplicate `raw_arguments`, `work_arguments`, or `activation_result`. Admitted work text is projected once in the body. Native `execute(args, ctx, raw?)` evaluates with `handoff: null` and emits `source: "native-user"`. Delegating directly to a command within a session or reading its definition always invokes the HOME helper with the exact child context and current-call handoff per `advice-activation.md`; callers never trust model-typed headers, reuse parent native results, or synthesize native headers. Structural generator replaces the `## Advice Mode` invocation paragraph (heading + first paragraph) without sentence regexes, deriving activation membership from helper `COMMAND_NAMES`. Headless errors use stderr.
  - *Pi:* Installation-root contained resources, manifest-owned `type: module` package boundary for extension `.js`, static TypeBox imports, zero production dependencies. Pi handoff wording pin removed in favor of structural path behavior.
  - *Copilot:* Removed unconditional workflow preload in favor of conditional activation reads.
  - *Claude, Codex, Antigravity, VS Code Local:* Neutral workflows projected; shared workflow lookup.
- **Qualification scope:** Linux x64 bounded native qualification observed on OMP 18.6.1 across six scenario classes (`s01`, `s02`, `s03`, `s05`, `s07`, `s11`) capped at Step 0; prerequisite gates (`s10` diagnostic uncaptured, `s12` timed out) remain explicit native limits; incomplete A02/A22 historical artifact evidence, A12 retained-record reconciliation without compiler loops, and unexercised A13/A16 native branches. Other vendor model loops remain unqualified; native Windows and macOS are excluded by user direction, while preserving unrelated historical Windows/Darwin documentation; ordinary Phase 04 user approved completed 2026-10-06T14:13:41+07:00 / 9.8 review, no durable completion/provider release/commit claim.

The approved Node-only contract is implemented across maintained canonical workflows (`.claude/workflows/advice-activation.md`, `plan-progress.md`, `advisor-mentoring.md`), skills (`advisor-strategy`), and command projections: invoke the controller through explicit Node, with no direct POSIX execution or fallback. Preserve the tool-less counsel boundary and exact JSON streaming.
The inline advice workflow is a separate main-session feature. It interviews the
user and writes its own report; it does not use checkpoint routing policy or act as
an alternate controller path. Copilot, Pi, and Codex projections may expose
an inline capability but do not gain controller relay authority.
### Normative command and resource naming convention

Canonical commands are authored as flat files (`commands/evc-cmd-<segment>(-x-<segment>)*.md`)
and agents as `agents/evc-<agent>.md`, governed by `src/adapters/resource-naming.ts` and
enforced by `.evcrate/source/.claude/scripts/scan_commands.py`:

- Slash command forms use `/evc-cmd-*` (e.g., `/evc-cmd-code`, `/evc-cmd-cook`, `/evc-cmd-fix`, `/evc-cmd-advise`).
- Nested commands use the reserved `-x-` path separator (e.g., `/evc-cmd-fix-x-hard`, `/evc-cmd-review-x-codebase`).
- Agents use `/evc-*` (e.g., `evc-advisor`, `evc-code-reviewer`, `evc-planner`). Copilot styles use `evc-style-*`.
- Semantic command identities (`code/auto`) remain the stable join for advisor activation.
- All seven active target adapters emit flat `evc-*` names for commands and agents. Shell commands (`npm`, `node`, `python3`, `cp`, `export`) are executable shell syntax, not slash resource names.

## 7. Verification and support boundary

Automated contracts cover strict policy/checkpoint parsing, fixed argv, sanitized environment, isolated cwd, output lifecycle, timeout/cancellation, descendant cleanup, workspace removal, envelope immutability, stale-hash blocking, atomic recovery, and selected-target publication. These contracts do not authenticate a vendor CLI.

### Phase 06 package and Phase 07 native Windows execution (2026-10-05)
Phase 06 regenerated projections and froze replacement candidate `evcrate-candidate-1791140555626` (7,410 files, archive SHA-256 `6a720dfb...`, manifest SHA-256 `365f145b...`) with repaired `.omp` build manifest output hash, 9/9 extracted test pass, Cycle 2 runner fixes (`maxRetries: 5`), clean Linux requalification (753/753 passed, 25 win32 skips), and code review score 9.8/10.
Phase 07 verified 111/111 native suite assertions; required `node-launch-behavior` failed (1 passed, 8 failed) due to candidate stale hash under Rule 94, readying requalification against candidate `evcrate-candidate-1791140555626`. Cycle 2 review (8.8/10) notes attached-TTY defects before positive console qualification. Details: [Phase 07 report](../plans/261003-1527-advisor-node-only-launch/reports/phase-07-windows-qualification.md), [Phase 06 review](../plans/reports/code-review-261005-0231-phase-06-qualification-regeneration.md).

### Historical boundaries and Windows supervision
Historical standalone Explorer testing (Phases 01–10; 2026-09-19) covered Chromium >=120 on Linux; picker/reader sources are removed. Deterministic Windows fixtures remain recorded in [code standards](./code-standards.md). Native Windows advisor supervision (PowerShell/C# bridge, Job cleanup, launch identity) is implementation evidence; Windows support remains limited to the installer and `version --json` boundary in [codebase summary](./codebase-summary.md).

## 8. Historical advisor mentoring and release qualification (Phases 01–10)

Historical context: advisor mentoring acceptance (2026-09-08) recorded 272/272 tests and a 9/9 sanitized baseline. The Windows release milestone (2026-09-15) proved the immutable candidate, native matrix, failure routing, and predecessor transition.
- **Sanitized history:** Version-1 `execution.json` (128 KiB) and `outcome.json` (64 KiB) are bounded records under project/task/consultation. Started records precede model launch; settlement uses byte CAS. Default retention is 30 days/100 MiB via `history list|show|export|prune`.
- **Projections and publication:** Current builds generate and verify all seven projections and schema-2 manifests. Publication/recovery boundaries are in Section 4. The 46-entry controller closure source authority is detailed in [codebase summary](./codebase-summary.md).

## 9. Historical DamHopper Advisor plugin integration (retired 2026-10-02)

The 2026-10-02 cutover retired the plugin runtime/backend, package, worker, and release artifacts. EVCrate maintains its core CLI, controller, and shared viewer source. DamHopper owns its native Advisor API and Workspace integration. Historical contracts and evidence remain in [Workspace Advisor PDR](./workspace-advisor-pdr.md), [host contract](./workspace-advisor-host-contract.md), and [all-project advisor history](./all-project-advisor-history.md).
## Related documents

- [Project overview and PDR](./project-overview-pdr.md)
- [Workspace Advisor Product Requirements](./workspace-advisor-pdr.md) — historical plugin-era requirements.
- [Code standards](./code-standards.md)
- [Codebase summary](./codebase-summary.md)
- [Project roadmap](./project-roadmap.md)
- [Project changelog](./project-changelog.md)
- [Historical Workspace Advisor host contract](./workspace-advisor-host-contract.md)
