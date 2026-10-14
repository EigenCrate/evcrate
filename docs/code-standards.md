# Code Standards and Codebase Structure

**Baseline:** `evcrate@3.0.0` (private Node/TypeScript package, Node `>=22.19.0`).
**Target Topology:** `3.0.0` (stable on `main`).
**Status:** EVCrate core implementation standards for the completed advisor subsystem retirement cutover and 7-target unified naming; live vendor/native-host qualification remains separate.
**Updated:** 2026-10-13
**Applies to:** TypeScript control plane, canonical harness resources, generated projections, and publication tooling.
**Windows release boundary:** Standalone installer lifecycle and clean-install `version --json` only; prior candidate evidence does not qualify the current package.

**Plugin architecture:** VS Code Local native support is an isolated Agent Plugins 1.0 bundle (`evc`, formerly `evcrate-local`) registered through user-controlled `chat.pluginLocations`, separate from Copilot CLI.
**Linting standard:** Package script `npm run lint` is currently an echo-only check (`echo "Linting passed"`). Code standards and invariants are enforced deterministically via TypeScript compiler checks (`tsc`), runtime closure checks, and the automated test suite.
This document states implementation rules. The [system architecture](./system-architecture.md)
is the detailed contract authority; the [codebase summary](./codebase-summary.md)
is the navigation map.
## Governing principles

- **Correctness before optimization.** Prefer explicit validation and predictable
  failure over clever or speculative behavior.
- **YAGNI, KISS, and DRY.** Add only the boundary required by a contract. Reuse one
  parser, path policy, hash policy, lock protocol, and error serializer per boundary.
- **Fail closed.** Invalid input, ambiguous ownership, unsafe paths, changed
  identities, malformed journals, and uncertain cleanup stop the operation.
- **Single authority.** Canonical resources are authored once. Generated projections,
  generated inventory, manifests, and publication state are never hand-edited.
- **Bounded work.** Every file read, JSON document, path, process stream, process
  lifetime, workspace, and metadata record has an explicit limit.
- **Explicit ownership.** User-owned settings and unmanaged HOME data are
  preserved; EVCrate only mutates declared managed harness roots.


### Enforceable architectural bans

The following patterns are strictly prohibited across the codebase:
- **Scope-bound publication locks**: Ordinary publication acquires only the requested scope's harness locks. Project publication cannot acquire HOME publication locks or commit HOME infrastructure.
- **No arbitrary body rewrite**: Installed wrappers are neutral. Never perform global or arbitrary text rewrites on wrapper code. Only schema-validated command registration fields may be transformed for HOME materialization (e.g. Antigravity mapping into `.gemini/config`).
- **No ancestor project search or cwd child resolution**: Installed wrappers must locate child resources relative to their own installation root (`import.meta.url` / `__dirname`). Never traverse parent directories hoping to find an ancestor project root, and never use `process.cwd()` to resolve EVCrate internal child resources.
- **No cross-volume atomicity fiction**: Stage on the selected destination volume. Reject cross-volume promotion; one scoped harness transaction is the atomicity boundary.
- **No hand edits to generated files**: Never edit generated target projections, build manifests, or registries directly. Modify canonical sources and regenerate through established scripts.
- **No cross-scope recovery search**: Recovery never crosses the requested publication scope. HOME recovery does not mutate project files; project recovery does not inspect or mutate HOME publication state or locks. HOME-derived storage for project-scoped durable state grants no cross-scope authority.
- **No legacy command or agent naming in maintained sources**: Canonical commands use `evc-cmd-*` (nested with `-x-`, length <= 64); VS Code Local alone projects `cmd-*` within plugin `evc`. Custom agents project `evc-*`, and Copilot skills project `evc-<skill>`. Never emit legacy resource names (`cmd_`, colons, underscores); VS Code's `/evc:cmd-*` qualifier is host syntax, not a resource name.
- **Single AGENTS.md authoring authority**: Canonical target instructions are authored strictly at `.evcrate/source/.claude/AGENTS.md`. Never hand-edit `.evcrate/source/AGENTS.md` (generated Codex output) or create repository-owned files named `CLAUDE.md`.
- **Branch topology and release qualification**: Canonical release branch is `main` (stable). Candidate receipt and exact-seven asset verification are mandatory before publication; prerelease candidates are retired.

### Release candidate and publication verification

- `scripts/release/run-release-candidate.cjs` runs semantic-release against a disposable local bare mirror seeded at `sourceCommit` on `main`, verifies the exact-seven release assets, resolves the Windows predecessor, and stages `release-candidate/` (`candidate.json`, `assets/`, `predecessor/`, `qualification/`).
- `.github/workflows/windows-smoke.yml` runs Windows PR qualification on `windows-2025` (`pwsh.exe` and Node `24.21.0`), while `.github/workflows/release.yml` proceeds directly from `release-candidate` to `publish` on `main`.
- `scripts/release/publish-release.cjs` enforces `EVCRATE_RELEASE_ASSET_MODE=verify`, rejects prerelease versions and non-`main` branches, verifies `candidate.json` and all seven asset digests, prepares `dist/release`, and publishes the verified release on `main`.

## Repository structure and ownership

```text
.
├── .evcrate/source/.claude/       canonical harness resources
├── .evcrate/source/{.claude-projection,.agents/skills,.codex,.antigravity,.pi,.omp,.copilot}/
│                                  generated target projections
├── .evcrate/targets/              schema-2 target manifests and overlays
├── .evcrate/registry.json         schema-2 canonical resource registry
├── .evcrate/scopes/               package-local scope state
├── src/                           TypeScript control plane
├── extensions/vscode-model-bindings/ standalone VS Code companion extension package
├── scripts/                       inventory, manifest, and release tooling
├── tests/                         focused contract suites
├── dist/                          compiled JavaScript/declarations
├── package.json                   package metadata and scripts
├── README.md                      concise package entry point
└── docs/                          maintained project documentation
```

`distribution/` and `pi_adapter/` are not active runtime modules in the current
scoped repository inventory. Do not describe them as alternate engines. The current
package path is TypeScript; source retains compatibility-engine types for transition
and validation boundaries, but no root `distribute.py` command is canonical.
Persisted adapter IDs are `claude`, `codex`, `antigravity`, `pi`, `omp`, `copilot`,
and `vscode`. Standalone Gemini is retired. Codex owns only `.agents/skills`;
Antigravity owns exact hook/rule leaves within that shared parent. Claude local
output `.claude-projection` never replaces canonical `.claude/AGENTS.md`.

### Scout-block ignore policy

The canonical `.evcrate/source/.claude/.evcrateignore` and
the scout-block matcher fallback defaults are one policy: keep the
same twelve heavy-directory entries, ordering, and comments. Standard entries
use trailing `/`: `node_modules/`, `dist/`, `build/`, `.next/`, `.nuxt/`,
`__pycache__/`, `.venv/`, `venv/`, `vendor/`, `target/`, `.git/`, and
`coverage/`.

Trailing `/` is normative directory-only syntax. It blocks root or nested
directory operands and descendants (`build/`, `apps/web/build/out.js`) but does
not block a bare lexical command token (`build`) or safe near-matches such as
`src/build-tools.js`. Preserve legacy custom bare-name patterns and ordered
negation behavior. Do not add `!dist`/`!build` command workarounds, infer file
types from the working tree, or hand-edit generated projections.

The canonical Claude resources are the only authored hook source. Regenerate the
current target projections and require `npm run distribute:check` before publication.
Include VS Code Local and native nested instruction/hook/rule leaves. Companion
directories are ownership boundaries, never additional adapter IDs.
Projected and published OMP runtime behavior must retain the same allow/block
boundary.

## TypeScript and npm standards

### Package and entrypoints

- Keep the package CommonJS-compatible and compile strict NodeNext TypeScript from
  `src/` to `dist/` with declarations.
- Expose only `evcrate`, the one-shot control-plane CLI.
- Keep public exports side-effect free. Importing `src/index.ts` must not start a
  process, open a listener, mutate HOME, or run a distribution action.
- Treat `package.json` scripts as command authority:
  - `npm run build`: Incremental TypeScript compilation via `node scripts/build-typescript.mjs -p tsconfig.json`.
  - `npm run build:clean`: Clean build invalidating build info cache (`.tsbuildinfo`) while retaining prior receipt via `node scripts/build-typescript.mjs -p tsconfig.json --clean`.
  - `npm run generate:all`: Orchestrated sequence: `npm run build && npm run generate:registry && npm run generate:manifests`.
  - `npm run distribute:build`, `npm run distribute:check`, and target-specific `npm run distribute:*` scripts for target projections.

### TypeScript incremental build caching and receipt safety

TypeScript builds enforce deterministic incremental caching with compiler-owned output tracking:
- **Cache configuration & layout**: `tsconfig.json` configures `"incremental": true` with its build info cache in `.cache/evcrate/tsconfig.tsbuildinfo`. The `.cache/` root is gitignored (`/.cache/`).
- **Authoritative compiler driver**: `scripts/build-typescript.mjs` orchestrates compilation:
  - Exposes `buildTypeScript(options)` and CLI flags `-p`/`--project <config>` and `--clean`.
  - Resolves outputs and caches via public TypeScript compiler APIs (`ts.readConfigFile`, `ts.parseJsonConfigFileContent`, `ts.createProgram`, `ts.getOutputFileNames`).
  - Spawns `node_modules/typescript/bin/tsc` via `spawnSync` with `-p <absoluteConfigPath>`.
  - Non-zero compiler exits halt driver cleanup and receipt updates; compiler emission still follows TypeScript's `noEmitOnError` policy.
  - **Clean mode semantics**: `--clean` removes only the `.tsbuildinfo` file to force complete compilation. The prior receipt is preserved so `cleanStaleOutputs` can diff against prior ownership.
  - **Effective CLI flags & noEmit**: CLI arguments are parsed with `ts.parseCommandLine` relative to the compiler working directory (`outDir`, `rootDir`, `declarationDir`, `tsBuildInfoFile`, `baseUrl`). For `--noEmit` (typecheck-only) runs, expected output inventory is empty, cache validation skips missing outputs, and `buildTypeScript` skips emitting-build stale output cleanup and receipt mutation entirely.
  - **Output override receipt partitioning**: When CLI flags override `outDir` or `declarationDir`, `receiptPath` appends a 16-hex SHA-256 partition hash (`<receiptPath>.<identity>`) to prevent cross-configuration receipt collisions.
- **Cache validation and invalidation**: `scripts/typescript-build-cache.mjs` ensures build soundness:
  - **Program closure inventory**: `resolveConfigOutputs` uses `ts.createProgram` to resolve the full emit-eligible program closure (`!source.isDeclarationFile && !program.isSourceFileFromExternalLibrary(source)`), capturing both root and imported non-root modules. Output filenames are computed via `ts.getOutputFileNames`. Live imported module outputs are fully tracked and never deleted as stale.
  - **Corruption recovery**: `isBuildInfoCorrupt` detects empty or malformed JSON `.tsbuildinfo` files and purges them.
  - **Missing output recovery**: `validateAndInvalidateCache` checks disk presence for all expected `.js` and `.d.ts` outputs (skipped under `noEmit`). If any artifact is absent or deleted, the `.tsbuildinfo` file is unlinked, forcing full compiler re-emission.
- **Receipt management and safe stale cleanup**: `scripts/typescript-build-receipt.mjs` tracks compiler-owned outputs in schema version 1 receipts (`<tsBuildInfoPath>.receipt.json`):
  - **Safe stale cleanup**: `cleanStaleOutputs` diffs current expected outputs against the prior receipt to remove obsolete outputs from renamed or deleted source files.
  - **Separate declaration directory**: Supports distinct `declarationDir`, tracking declaration artifacts alongside code outputs and recording `declarationDir` in receipt metadata.
  - **Physical all-ancestor containment & symlink refusal**: `isSafeOutputPath` inspects every path component from the filesystem root through output root ancestors, parent directories, and leaves via `fs.lstatSync`. Symbolic links in ancestors, parent directories, or output leaves are strictly refused (never unlinked or followed). Confirms physical containment of parent directory inside real output root via `fs.realpathSync`.
  - **No directory sweeping**: Never sweeps `outDir` or unlinks unrecorded files.
  - **Failed cleanup ledger preservation**: If stale output cleanup encounters errors, `buildTypeScript` halts with exit status 1 without calling `writeReceipt`, preserving the prior receipt on disk for subsequent runs.
  - **Atomic persistence**: On successful cleanup, `writeReceipt` records `{ version: 1, config, outDir, declarationDir, timestamp, outputs }` using a `.tmp.<timestamp>` file and atomic `fs.renameSync`.
### One-shot CLI lifecycle

```text
parse arguments/request file
        ↓
resolve immutable package/project/home/target context
        ↓
dispatch exactly one operation
        ↓
validate and write exactly one result
        ↓
exit
```

The CLI supports version, `resources list|get`, `imports preview|apply`,
`scopes list|get|assign|remove|enable|disable`, `changes preview|apply`,
and distribution `build|check|publish|all|recover`.
A request file is one complete bounded versioned envelope and is mutually exclusive
with positional command construction. JSON and non-TTY output derive from the same
validated result.

Do not add a daemon, listener, generic/unbounded retry loop, background worker,
arbitrary launcher, or direct migrator dispatch. Compatibility paths must be
explicit and transition-only; never mix Python and TypeScript mutations in one
atomic operation. Unknown failures become stable sanitized errors; raw paths,
child stderr, credentials, and stack traces do not cross the public boundary.

### Naming and module design

- Files and directories use descriptive kebab-case.
- Functions and variables use `camelCase`; classes and types use uppercase-leading
  names; constants use uppercase snake case.
- Keep modules focused. Prefer existing boundaries over new registries, service
  containers, aliases, or parallel conventions.
- Use immutable interfaces (`readonly` fields, frozen result objects) at protocol,
  manifest, context, and transaction boundaries.
- Exported functions have explicit return types and exhaustive result branches.
- Comments explain security rationale or non-obvious invariants, not syntax.

## Normative command and resource naming

Canonical documentation and non-VS Code command projections use `evc-cmd-*`;
VS Code Local uses container-local `cmd-*` skills in plugin `evc`. Agents use
`evc-*`. Canonical naming authority is `src/adapters/resource-naming.ts`, enforced
by `.evcrate/source/.claude/scripts/scan_commands.py`:

- Canonical command source files are flat files under `.evcrate/source/.claude/commands/evc-cmd-*.md`.
- Root forms are `/evc-cmd-plan`, `/evc-cmd-code`, `/evc-cmd-cook`, `/evc-cmd-fix`, and `/evc-cmd-advise`.
- Nested resources use the reserved segment separator `-x-`, for example
  `/evc-cmd-fix-x-hard` and `/evc-cmd-review-x-codebase`. No segment may contain an isolated `x` token.
- Agents use `/evc-*` (e.g., `evc-code-reviewer`, `evc-planner`).
- Copilot projects user-invocable skills as `evc-cmd-*` (with raw `$ARGUMENTS`) and styles as `evc-style-*`.
- Semantic identities (e.g. `code/auto`) join segments with `/` and remain stable command identities.
- VS Code `plugin.json` declares `"name": "evc"`; canonical `evc-cmd-*` maps to `.evcrate-vscode/skills/cmd-*/SKILL.md`. Copilot Chat displays `evc cmd-*` and qualifies invocation as `/evc:cmd-*`; never emit duplicate `evc-` prefixes in local command skill names.
- `src/adapters/vscode/references.ts` (`replaceCommandInvocations`) rewrites `/evc-cmd-*` and `$evc-cmd-*` to local `/cmd-*` and `$cmd-*`, including wildcard family references. Preserve `-x-` nesting and semantic IDs.
- The shared `ev-help.py` scanner must discover both `evc-cmd-*/SKILL.md` and `cmd-*/SKILL.md`.
- All seven adapters retain flat resource names without compatibility aliases; plugin qualification is separate from resource naming.
- Shell executable syntax (`npm`, `node`, `python3`, `cp`, `export`) is executable shell syntax, not slash resource names.
## Protocol and JSON standards

Use repository parsers rather than permissive ad-hoc parsing at a control-plane
boundary. Contracts enforce, as applicable:

- fatal UTF-8 decoding and bounded documents;
- object/array roots where required, never primitive protocol roots;
- duplicate-key, control-character, trailing-data, non-finite-number, and depth
  checks;
- unpaired-surrogate rejection and plain objects/arrays only;
- exact-key validation for frozen wire shapes;
- canonical JSON ordering and SHA-256 digesting.

Validate before dispatch. Reject unknown fields, duplicate semantic paths,
credentials, counsel-shaped fields, control characters, unsafe metadata paths,
overlong values, traversal, symlinked ancestors, special entries, and invalid
ownership. Use stable control-plane error codes and established exit mapping. Never
return secrets, policy credentials, raw child output, raw filesystem implementation
paths, or stack traces.
### Control-plane error hierarchy and exit codes

`ControlPlaneErrorCategory` and `ControlPlaneErrorCode` define the public error model in `src/errors/control-plane-error.ts`. Exit codes are deterministically grouped:

| Error code | Category | Exit code | Message | Required action |
|---|---|:---:|---|---|
| `OK` | `success` | 0 | Success | No action required. |
| `USAGE_INVALID` | `usage` | 2 | Usage is invalid | Use the documented command syntax. |
| `PROTOCOL_INVALID` | `protocol` | 2 | Protocol is invalid | Provide one valid versioned protocol request. |
| `VALIDATION_INVALID` | `validation` | 3 | Validation failed | Correct the invalid value and retry. |
| `PATH_UNSAFE` | `path` | 3 | Path is unsafe | Use a safe path within the selected context. |
| `CAPABILITY_UNSUPPORTED` | `capability` | 3 | Capability is unsupported | Select a supported target or capability. |
| `CAS_CONFLICT` | `conflict` | 4 | Revision conflict | Refresh the current revision and preview again. |
| `PUBLICATION_FAILED` | `publication` | 5 | Publication failed | Repair the publication state before retrying. |
| `ROLLBACK_FAILED` | `rollback` | 5 | Rollback failed | Run recovery for the incomplete publication. |
| `RECOVERY_FAILED` | `recovery` | 5 | Recovery failed | Resolve the recovery marker before retrying. |
| `INTERNAL_ERROR` | `internal` | 6 | Internal error | Retry or inspect the bounded diagnostic. |

Keep this mapping in `src/errors/control-plane-error.ts`; do not invent
operation-specific exit codes at individual call sites.
## Manifest, registry, and resource standards

### Target manifests

The schema-2 target registry persists exactly `antigravity`, `claude`, `codex`,
`copilot`, `omp`, `pi`, and `vscode`. `agy` is input-only normalization for
`antigravity`. Manifests declare exactly the resource roots `skill`, `agent`,
`workflow`, `command`, and `hook`, plus target output/home policy. Normalize paths;
reject traversal, backslashes, duplicate lists, symlinked ancestors, equal/nested
output roots, unsafe adapter/helper files, and unknown fields.
Nested project documents are closed exact declarations: Copilot
`.github/copilot-instructions.md`; Antigravity `.agents/hooks.json` and
`.agents/rules/evcrate-antigravity.md`. Do not authorize either parent as a
replaceable root; preserve user sibling contents and reject unmanaged leaf collisions.

Patch authorization is explicit: a source must be a regular file under the manifest
patch subtree; destination must be normalized, unique, and inside a declared output
root; keys must be non-empty, unique strict dotted JSON keys; patch text must be
valid JSON.

### Resource registry and imports

Keep schema-2 resource registries distinct from schema-2 target definitions and schema-3 build manifests. Validate
historical schema-1 and complete old eight-target schema-2 resource documents
before read-only normalization; remove retired Gemini and add VS Code only for
schema 1. Current writes persist seven targets with original-byte CAS.
Registry records use stable `kind:canonical-relative-path` IDs, canonical source paths,
file-versus-tree domain-separated content hashes, provenance, compatibility entries,
capabilities, bounded optional metadata, and positive revisions. IDs and records sort
by Unicode code point. Permission bits are not content hashes; capability assessment
remains separate.
Canonical scans validate canonical-root and resource-root containment, reject
symlink/special entries, and hash before discovery. Resource kinds are fixed: skill
directories contain `SKILL.md`; agents/workflows are root-level Markdown files;
commands recurse for Markdown files; hooks are root-level files or directories.
Imported content is never executed.

`imports.preview` reads immutable bounded descriptors into a bounded isolated stage and
writes only a single-use replay token. `imports.apply` rechecks source identity,
canonical/registry/manifest/adapter/output hashes, destination, provenance,
approvals, expiry, and resource record before promotion. Same-provenance matches are
updates/unchanged; different provenance, kind mismatch, stale dependencies, or
unmanaged destinations return <code>CAS_CONFLICT</code> without adopting or deleting user data.

## Filesystem, locking, and transaction standards

- Normalize relative POSIX paths before joining; reject absolute paths, backslashes,
  dot/dot-dot segments, empty segments, NULs, symlinked ancestors, special entries,
  and containment escapes.
- Keep host-native absolute paths separate from portable metadata. `safePath` and
  `resolveSafePath` use the host branch for context roots; on Windows only
  drive-rooted native paths are accepted and hostile lexical forms fail closed.
- Keep `normalizeRelativePath` slash-relative and platform-neutral for manifests,
  archives, inventories, and receipts; never feed it native host paths.
- `assertNoSymlinkAncestors` is the sole ancestor guard. Walk from the parsed
  native root using `sep`, inspect existing components, stop only when a component
  is absent, and fail closed on other filesystem errors. Context resolution reuses it.
- Managed roots and ancestors must be real directories with contained paths and no symlink ancestry. Preserve host permissions; do not require filesystem UID/SID/ACL, private-mode, or exact-mode attributes. Never chmod or replace unrelated HOME or project data.
- **Preflight before mutation**: Normalize paths, verify ancestors/kinds and
  containment, detect managed-resource ownership conflicts/target overlap, and verify
  same-volume staging before destination reads or mutation.
- **Scoped harness transaction**: Acquire only derived locks for the selected scope,
  validate and stage the harness workspace on its destination volume, then commit
  harness projections. Project work never first commits HOME infrastructure.
  Failures use ordinary structured errors and roll back admitted scoped work only.
- Stage on the destination volume. Publication snapshots bind physical kind,
  device/inode/size, and content digest; compare these before backup/promotion.
- Write journals, markers, and lock metadata through bounded atomic temporaries;
  flush metadata where supported. `readReleaseMarker` and `writeReleaseMarker`
  (`src/filesystem/locking.ts`) accept `schema_version` `1`, `2`, and `3`. Record
  actual v4 workspace device/inode and parent identity before the first staged journal;
  persist it before destination mutation. Current HOME publication orders bindings via
  the eight harness entries in `PUBLICATION_BINDING_ORDER` (`.agents/skills`, `.codex`,
  `.pi`, `.gemini/config`, `.omp`, `.claude`, `.copilot`, `.evcrate-vscode`, without
  `.evcrate/bin`), while `PREDECESSOR_BINDING_ORDER` retains historical bindings
  (`.evcrate/bin`, `.gemini`, `.agents`, `.codex`, `.pi`, `.gemini/config`, `.omp`,
  `.claude`, `.copilot`, `.evcrate-vscode`) strictly for predecessor state admission
  and recovery. Do not infer trust or ownership from mode bits.
- **Scope-isolated recovery**: Recover only validated, scope-bound, contained journal
  paths matching the requested scope (`--scope home` reads only HOME state;
  `--scope project` validates canonical `projectIdentity` and reads only
  `stateRoot/project-publication/<canonical SHA-256 identity>`). Restore the complete
  prior set for an interrupted transaction; leave unexpected state and user data
  untouched. Recovery never crosses scope boundaries.
- Publication and scope locks are separate transactions. Lock release requires
  matching token and device/inode identity; uncertain release leaves evidence for recovery.

## Build, closure, and release standards

Root control-plane compilation uses `scripts/build-typescript.mjs -p tsconfig.json`
(`npm run build`); `build:clean` uses the same driver with `--clean`.
`npm run typecheck:omp-runtime` checks the generated OMP runtime with the retained
OMP tsconfig after `npm run distribute:build`.
`scripts/build-manifests.mjs` uses `runAllManifestsBuild`. Strict schema-3 manifests
contain exactly `schema_version`, `source_hashes`, `adapter_hashes`, `owners`,
`output_hashes`, `validation`, and `home_policy`. Aggregate policies cover all seven
targets; each per-target policy view covers only its selected target. Validation
contains only `complete: true`, `symlinks: "rejected"`, and `target_registry: "validated"`.
Old active build artifacts fail with `PROTOCOL_INVALID` and rebuild/regenerate guidance.

### Target manifest derivation, worker staging, and snapshot safety

- **Single-projection manifest reuse & parallel workers**: `scripts/build-manifests.mjs` and `runAllManifestsBuild` execute target projection once per persisted target. `TargetWorkerPool` supports bounded parallel execution (`--jobs <n>`, default 2 workers), maintaining exact bit-for-bit manifest and projection parity with serial execution.
- **Input snapshot isolation**: `prepareInputSnapshot` creates an isolated staging copy of canonical harness inputs (`.claude`) and compiled runtime (`dist/**/*.js`).
- **Consumed input identity vs manifest tree hash**: `canonicalInputHash` computes snapshot freshness across all consumed files, including `.gitignore` (which Claude projects); manifest `treeHash` retains its canonical definition excluding `.gitignore`.
- **Physical safety and pre-filter rejection**: `visitSnapshotInputs` verifies `assertNoSymlinkAncestors` and `assertRealDirectory`. Unsafe entries (symlinks, non-regular files/directories) throw `PATH_UNSAFE` immediately before any ignore filter is evaluated. Traversal filters (`isIgnoredArtifact`) bypass heavy excluded directories (`node_modules/`, `__pycache__/`) without reading or recursing into descendant paths.
- **Compiled runtime revision binding**: `compiledRuntimeHash` hashes all `.js` outputs in `dist`. The parent compares disk runtime against in-memory `loadedRuntimeHash`; any divergence throws `PUBLICATION_FAILED` across both serial (jobs 1) and worker (jobs 2) execution. Workers execute the snapshot runtime (`sharedInputs.runtimeRoot/distribution/target-worker.js`).
- **Promotion freshness under lock before journal**: In `promoteUnlocked`, `options.hooks?.beforeTransaction?.()` executes input freshness checks (`assertLiveInputsUnchanged`) while holding the promotion lock, strictly BEFORE writing the journal or claiming destination outputs. Source drift fails safely before journal recording, avoiding spurious `ROLLBACK_FAILED`.
- **Adapter hash closures**: All six translated targets (`antigravity`, `codex`, `copilot`, `omp`, `pi`, `vscode`) declare `dist/adapters/uri-restoration.js` in `adapter_sources`; Antigravity also binds the shared Markdown frontmatter parser.
- **Codex URL restoration**: `applyReplacements` uses a linear regex callback to restore placeholder URLs literally without string template interpolation (`$&`, `$$`) or cascading token substitution.
- **Benchmark metric standard**: Build generation benchmark (`scripts/benchmark-build-generation.mjs`) reports post-build parent process RSS (`memoryUsage().rss`), not worker process-tree peak; historical qualification figures remain unchanged.

Publication derives launch intent from paths/shebangs and explicit roles. Linux
`install.sh` grants mandatory CLI execute bits and fails if chmod fails. Release
metadata uses `evcrate-private-release/v2`; installer receipts/current pointers
remain v1. Both `install.sh` and `install.ps1` verify predecessor snapshot directory
containment and non-symlink/non-reparse ancestry during `repair`. Current v2
(`evcrate-private-release/v2`) asset repair does not read or require predecessor
`installer-receipt.json` contents and can recover missing or corrupt receipts.
Historical v1 (`evcrate-private-release/v1`) asset repair requires a contained real
snapshot and a regular non-symlink/non-reparse `installer-receipt.json` matching
`snapshot_id`, `version`, `archive_name`, `archive_sha256`, and `inventory_digest`.
Both `install.sh` and `install.ps1` require current v2 packages to expose only
`evcrate -> dist/cli/evcrate.js` in `package.json#bin`; fresh installation requires
current v2 assets. Matching native Windows host qualification must be exercised on the
current candidate. Windows support remains installer lifecycle and `version --json`;
portable checks do not establish broader runtime or macOS qualification.
### Windows fixture and predecessor standards (Phase 04)

- Build Windows fixtures through `buildReleaseArchives` and the real
  `install.ps1`; share sorted-record, inventory/build-manifest digest,
  installer-byte, and metadata authorities with Linux fixtures.
- Freeze every byte-bearing timestamp (`FIXTURE_BUILD_TIMESTAMP`) and compare
  independent builds by filename, size, digest, and content. Do not use wall-clock
  values or duplicate release metadata rules.
- Treat exact labels as qualification markers only:
  `Windows x64 Archive` and `Windows Installer Entrypoint (install.ps1)` must be
  unique, canonical filenames must match, and all four materialized assets must
  pass `verifyWindowsAssetSet`.
- Resolve only non-draft, non-prerelease stable releases through bounded,
  read-only API access. Before qualification history, use only the verified
  `bootstrap-fixture` (`1.0.0`, `v1.0.0`, lowercase `a`×40); afterward inspect
  only the latest stable release and fail closed on uncertainty—never fall back.
- Download into private staging, bound redirects/response bytes, strip tokens
  across origins, verify before and after promotion, and remove partial output
  on failure. Return canonical `{kind, version, tag, sourceCommit, files,
  directory}` records for downstream receipt consumers.

### Canonical candidate and publisher standards (Phase 06)

- Treat `.releaserc.json` and semantic-release's public API as the sole version,
  notes, and prepare authority. Candidate orchestration must use a disposable
  `file://` bare mirror, preserve canonical plugin order, remove only the GitHub
  plugin, set `publish: []`, and never reimplement Conventional Commit rules.
- Require a clean checkout, one exact lowercase 40-hex source commit, branch/ref
  validation, and containment checks before clearing stale `dist/release` or
  candidate output. Seed only the local mirror with the triggering ref and tags;
  always remove it in `finally`.
- Build candidates with an allowlisted child environment and
  `EVCRATE_RELEASE_ASSET_MODE=build`; strip `GITHUB_TOKEN`, `GH_TOKEN`, and
  `NPM_TOKEN`. A false semantic-release result succeeds with `has_release=false`
  and no handoff.
- Stage privately, hash staged bytes, and atomically promote one tree containing
  exactly seven candidate assets, four predecessor assets, one qualification
  harness, and `candidate.json` (`evcrate-release-candidate/v1`). Receipt records
  use canonical code-point ordering and non-symlink regular files.
- Emit only the nine fixed `$GITHUB_OUTPUT` scalars defined by the candidate
  contract. Scalars route workflow jobs; the receipt remains the durable byte
  authority and must agree with every scalar/hash.
- The publisher is verify-only: require `EVCRATE_RELEASE_ASSET_MODE=verify`,
  expected receipt/version/tag/source/run identity, and producer hashes; clear
  `dist/release`, copy only verified `assets/`, verify again, and call canonical
  semantic-release. It must not build, repair, or accept `false`/identity
  mismatches.
- Keep `npm run release:candidate`, `npm run release:verify-assets`,
  `npm run test:installer:windows`, and `npm run semantic-release` bound to these
  wrappers. Do not hand-edit `package-lock.json` or root `CHANGELOG.md` for
  orchestration.

The focused orchestration suite covers clean/dirty checkout, release paths, mirror cleanup, receipt/tamper checks, exact outputs, and verify-only publication (12/12 orchestration tests, 29/29 `npm run test:release`).

### Release workflow producer, matrix, and publisher standards (Phase 07)

- Keep `.github/workflows/release.yml` read-only by default; grant GitHub write scopes only to the success-gated publisher.
- Preserve ordered Linux gates before candidate creation; no-release results never upload or trigger downstream jobs.
- Route matrix and publisher bytes by exact `artifact_id`, never by artifact name or digest; receipt and producer hashes remain authorities.
- Keep the native matrix fixed at `windows-2025` x64 with PowerShell 5.1/7 crossed with Node `22.19.0`/`24.21.0` (`fail-fast: false`).
- Matrix jobs consume artifact-carried harnesses without checkout/npm; publisher verifies exact source SHA and copies only seven assets.
- Pin actions to full commit SHAs with version comments; pass expressions via step `env:` blocks instead of shell script interpolation.

### Windows release qualification and installer safety standards (Phases 03, 08, 10)

- **Installer safety protocol**: Standalone `install.ps1` must enforce strict root containment (`Assert-ContainedPath`), reparse-point ancestor rejection (`Assert-NoReparseAncestor`), exclusive delete-on-close locking (`Acquire-InstallLock` with random token), snapshot verification, and safe rollback/repair/uninstall lifecycles without touching unmanaged data. Never recommend `-ExecutionPolicy Bypass`.
- **Exact-set verifier authority**: `scripts/release/asset-verification.cjs` is the sole release-set verifier. Exact-seven (`verifyReleaseAssetSet`) and exact-four (`verifyWindowsAssetSet`) reject missing, extra, directory, symlink, hash, size, and metadata mismatches without byte repair.
- **Workflow permissions and isolation**: Producer is read-only (`contents: read`); matrix rows run unprivileged; publisher is the sole write-capable job (`contents: write`). Publisher must never rebuild assets or publish on failure/cancellation (<code>always()</code> is strictly banned). Downstream jobs consume the exact `artifact_id` handoff.
- **PR smoke boundary**: `windows-smoke.yml` runs diagnostic smoke on `windows-2025` x64 with PowerShell 7 and Node `22.19.0` using checked-in version/SHA fixtures (`--allow-fixture-identity`); it has zero secrets, write permissions, or release handoff authority.
## Testing and review standards

Tests defend observable behavior: strict parser/manifest contracts, bounded scans,
capability approvals, non-mutating previews, token expiry/replay, managed/unmanaged
collisions, CAS hashes, output ownership, symlink/owner checks, staged-root cleanup,
locks, stale quarantine, promotion recovery, and scope isolation. Prefer temporary
roots and real filesystem/process behavior. Do not weaken
checks with fake success paths or assertions on incidental implementation details.

### Hook-policy test suites

Run the focused suites sequentially with direct `node` commands before
projection or publication:

| Suite | Contract |
|---|---|
| `scout-block/tests/test-path-extractor.js` | Quote/escape-aware extraction, directory markers, runner syntax, and shell segments. |
| `scout-block/tests/test-pattern-matcher.js` | Twelve trailing-slash defaults, descendants, near-matches, Windows paths, legacy rules, and negations. |
| `scout-block/tests/test-build-command-allowlist.js` | Production `isBuildCommand` classification; no duplicated regex authority. |
| `hooks/tests/test-scout-block.js` | Hook-process exit codes for build allowances, blocked reads, and adversarial chains. |
| `hooks/tests/test-evcrateignore.js` | Canonical/fallback/custom policy behavior; byte restoration in `finally` and termination handlers. |
| `scout-block/tests/test-monorepo-scenarios.js` | Nested package and deep generated-directory protection. |

The 2026-09-07 Phase 04 evidence records 299/299 focused assertions, plus
successful `npm run build`, `npm run distribute:build`, `npm run distribute:check`,
and projected/published OMP smoke values `0, 0, 2, 2`. Keep both positive build
cases and negative directory-read/search cases; a build exemption must never
cover a later or chained access to a protected path.

Tests that mutate canonical policy must snapshot the original bytes, restore them
in `finally` and termination handlers, and remove backups or temporary drivers
before reporting success.

### VS Code Local tool-reference, qualification, and rollout standards

- **Namespace separation & mapper authority**: `src/adapters/vscode/metadata-tools.ts` (`mapAgentTools`) is the sole authority mapping canonical tool intent (`Read`, `Glob`, `Grep`, `LS`, `Bash`, `BashOutput`, `KillBash`, `KillShell`, `Task`, `TodoWrite`, `Edit`, `Write`, `MultiEdit`, `WebFetch`, `NotebookEdit`; `WebSearch` intentionally dropped) to pinned VS Code `1.140.0` / Copilot Chat `0.68.0` frontmatter references (`read/readFile`, `search/fileSearch`, `search/textSearch`, `search/listDirectory`, `execute/runInTerminal`, `execute/getTerminalOutput`, `execute/killTerminal`, `agent/runSubagent`, `todo`, `editFiles`, `createFile`, `multiReplaceString`, `web/fetch`, `edit/editNotebook`). Keep frontmatter references distinct from model-facing names (`copilot_readFile`, `copilot_fetchWebPage`, `copilot_editNotebook`, `manage_todo_list`) and hook event identities; test capability contracts against independent host provenance (`tests/fixtures/vscode-local/tool-references.json`), never circular map copies.
- **Permission & hook-normalization invariants**: Preserve `tools: []` deny-all, omitted-tool inheritance (`hasExplicitTools: false`), unsupported-only empty lists, `Task`-derived `canDelegate` (`agents: ['*']` vs. leaf `agents: []`), and direct `todo` (disabled by host `runSubagentTool.ts` in child subagents). Normalize `filePath`, `FilePath`, `path`, `file_path`, `target_file`, `TargetFile`, search `includePattern`/glob roots, notebook `filePath` + `editType` (`insert`, `edit`, `delete`) + `cellId`, and `web/fetch` HTTP(S) `urls` arrays + `query` identically with `??` fallback and null-prototype/`Object.hasOwn` allowlist parity in `src/adapters/vscode/tool-inputs.ts` and `src/adapters/vscode/runtime-sources.ts` (`LOCAL_TOOL_INPUTS_SOURCE`), while exempting remote `kind: 'web'` URLs from local directory/privacy blocks. `evcrate/agent-tool-audit.json` attests build declarations, never effective runtime grants.
- **Operator republish, verification, workaround & rollback**: Preview then apply with explicit scope/paths (`evcrate publish --dry-run|--apply --scope home|project --target vscode`, using `--no-register-vscode-settings` unless user settings registration in `chat.pluginLocations` is explicitly approved). Confirm the loaded agent URI and candidate digest (`81792bf2...`) in a fresh session and run direct/delegated smoke before relying on subagents; while Windows Local remains unqualified, use parent-owned scouting as a temporary workaround without widening leaf permissions. `evcrate recover` repairs interrupted transactions only—it never downgrades versions, reverts agent-edited docs, or mutates user `settings.json`.
- **Runtime companion contract & gating standard**: Companion extension (`eigencrate.evcrate-model-bindings`, proposed `chatPromptFiles` API) contracts live in `src/adapters/vscode/{model-intent.ts,companion-package-contracts.ts,companion-cli-contracts.ts}` and `extensions/vscode-model-bindings/{package.json,tsconfig.json,vscode.proposed.chatPromptFiles.d.ts,src/runtime-contracts.ts,src/binding-contracts.ts,src/diagnostics-contracts.ts,src/contracts.ts}` (`tests/vscode-companion/`). Maintain strict compilation/import isolation (`extensions/vscode-model-bindings/` never imports root `src/`, and `src/` never imports `extensions/`), exact-key validation across companion schemas (`validateBindingsV1` <= 64 KiB), explicit layout verification mode (`development-checkout` vs `packed-package`), strict separation of `renderedSelector` vs `hostObservedModel`, and fail-closed rejection of non-`file://` authorities (`UNSUPPORTED_REMOTE_AUTHORITY`), invalid project roots (`PROJECT_INSTALLATION_INVALID` without HOME fallback), and storage budget exhaustion (`STORAGE_BUDGET_EXCEEDED`). Pure inventory resolver (`resolveInventoryBindings`) must strictly enforce precedence (`root.actor > user.actor > canonical.inherit > root.tier > user.tier > unresolved`), omit frontmatter `model` selector for inherit actors unless explicitly overridden, and reject ambiguous catalog selectors (`SELECTOR_AMBIGUOUS`) rather than picking arbitrary matches. Configuration commands (`evcrate.configureAgentModels`, `evcrate.configureActorModel`, `evcrate.clearModelBindings`) commit versioned state to scoped stores with CAS revision checks, trigger single-flight debounced generation refreshes, and preserve persisted state upon cancellation.
- **Consented companion postpublish installation standard (Phase 08)**: Post-commit companion installation (`coordinateVscodeCompanionInstallation` in `src/cli/vscode-companion-installation.ts`) coordinates extension installation strictly after successful publication commit, preserving stdout `ResourceResult`:
  - **Pre-mutation validation (`src/adapters/vscode/companion-cli-contracts.ts`)**: `validateCompanionCliOptions` validates `--install-vscode-companion`, `--no-install-vscode-companion`, `--vscode-editor`, and `--vscode-profile` before any filesystem mutation. Companion flags require target `vscode`; positive and negative install flags are mutually exclusive; editor paths and profile strings must be non-empty and valid.
  - **Staging and descriptor verification**: Validates committed descriptor (`validateCompanionDescriptor`), provisions an isolated `0700` temporary directory via `mkdtempSync`, safely copies the VSIX via atomic handle checks, and re-verifies the staged file's SHA-256 matches `descriptor.vsixSha256` prior to process launch.
  - **Installed build identity checking (`verifyInstalledBuildIdentity`)**: Inspects target extensions directory; matching version requires verified `buildIdentity` in `package.json`, else marks status `manual-setup-required` (exit code 5 if requested).
  - **Bounded process execution (`process-runner.ts`)**: In interactive TTY environments with policy `default-prompt`, prompts user with default-No confirmation. Bounded execution uses argument arrays (`--install-extension <staged-vsix>`, optional `--profile <profile>`), timeout (`COMPANION_INSTALL_TIMEOUT_MS = 60s`), stream buffer caps (`1 MiB`), and cancellation signal support. Private staging directory is cleaned up in `finally`.
  - **Notice and exit code protocol (`emitNotice`, `install-notice-v1`)**: Emits validated `evcrate-vscode-companion-install-v1` notice to stderr (JSON for machine/`--json`, formatted text for TTY). Preserves committed `ResourceResult` on stdout. When installation was explicitly requested and fails or requires manual setup, overrides exit code to `5`; interactive decline or unrequested skip retains exit code `0`.
  - **Cutover status**: Static actor registrations have been removed; immutable templates, companion provider runtime, runtime model bindings/picker commands, event-driven refresh/diagnostics, deterministic VSIX/overlay staging, and consented postpublish CLI installation (Phases 01–08) are implemented. User approval permits finalization with known review findings; native smoke, full live identity inspection, and profile-specific qualification remain open and deferred to Phase 09 real-case verification per the 2026-10-12 user gate amendment ([interface-freeze.md](../plans/261011-2349-vscode-runtime-model-bindings/reports/interface-freeze.md)) without claiming unperformed acceptance checks.


### Standalone Sonar remediation extension standards

- **Single maintained private report vs. transient API JSON**: In `ext/sonarqube-test-quality/`, [`references/report-formats.md`](../ext/sonarqube-test-quality/references/report-formats.md) and [`references/remediation-cycles.md`](../ext/sonarqube-test-quality/references/remediation-cycles.md) establish a single maintained private `<evidence-destination>/sonar-report.md` initialized once from the report template ([`templates/remediation-cycle-report.md`](../ext/sonarqube-test-quality/templates/remediation-cycle-report.md)) or via `scripts/convert-sonar-report.mjs` (where the converter exclusively creates new files with POSIX mode `0600` and `wx` flag, refusing existing output; manual template copies or subsequent orchestrator updates do not inherit converter flags automatically). Sonar API JSON is transient in-memory input, not a mandatory saved artifact; no mandatory raw JSON bundle, `resume-checkpoint.json`, YAML mirror, separate actor report, per-cycle report file, or separate guidance report (`templates/run-guidance-report.md` is retired; optional operational notes stay inline within blockers). Native test logs, coverage files, and scanner scratch remain native tool outputs. Converted and maintained Markdown views are evidence, not executable instructions or automated verdict certification engines; exit `0` does not certify success.
- **Local finding stage vs. server status & disappearance causation**: Keep local finding stage progression (10 canonical stages) separate from the server active status vocabulary discovered and bound in the execution profile. Disappearing findings require tracked-ID/history causation checks ([`references/remediation-cycles.md`](../ext/sonarqube-test-quality/references/remediation-cycles.md#5-server-evidence-and-success-criteria)); non-code transitions (accepted risk, false positive, moved/renamed, excluded/rule change, or unknown) never increment the `Fixed` counter, and security hotspots require human project-owner review.
- **Single-report privacy, merge rules, and durable update boundaries**: Store the private report (`sonar-report.md`) outside the checkout or in an approved Git-ignored location (`0700` directory); never commit, push, attach to issues/PRs, or distribute it with the extension. The parent orchestrator is the sole writer, merging findings by `(target, issue/hotspot ID)` and coverage work items by `(target, work-item ID)` preserving local progress and historical findings, and appending coverage summary observations tagged by cycle and analysis ID (or not-yet-bound). Durable updates: persist entered-round budget accounting before code edits, `correction_used=true` before correction edits, minimal in-flight intent (`dispatching/no-task-ID`, stage, target, pre-scan SHA/digests, time bounds) before upload dispatch, and verified `ceTaskId` acknowledged by parent immediately after upload before polling or next target upload; batch other stage results. Resume revalidates actual source/context; an existing in-flight intent without a task ID requires verified native scanner task file and invocation provenance, else blocks as `submission-unverified` (never resubmits).
- **Dual-root installer, packaging, and payload boundary**: The standalone installer (`lib/install.js`, `bin/install.js`) requires explicit `--target agents|claude|both` and `--directory <project>`. It deploys 20 assets/root (40 both), including two skill entrypoints, native Node ESM helpers and the vendored SAX runtime/license/provenance closure; merged tarball smoke verified 26 packaged files. Preserve two-tier locks, destination-local staging, post-publication byte verification and guarded in-process rollback that preserves unrelated/concurrent content and reports restoration conflicts. No crash-recovery or atomic-reader-visibility claim. Force replacement needs confirmation and never overrides path traversal, symlink or type guards. Tracked files under `docs/` and `ext/` must never introduce links to ignored `plans/` paths.
- **Transactional retirement, rollback safety, and closure verification**: Trusted release provenance (`lib/retirement-provenance.json`, `v3.0.0` commit `e2e2c284`) authorizes only the two exact obsolete PowerShell helper paths in selected roots. Absence is harmless; customized/unknown bytes or unsafe ancestors block all roots even with `--force --yes`. Capture bytes/modes before unlink, retire before active publication, and restore removed originals exclusively only into absent safe destinations; preserve concurrent recreations and report partial rollback. Completion requires all 20 active assets matching packaged bytes and both retired paths absent. Merged Linux Node24.16.0 checks passed 174/174 tests; exact Node22.19.0, Windows/macOS, live Sonar and consuming-host qualification remain separate.
- **Command orchestration, role independence, and gate contracts**: In `commands/cmd-sonar-remediate/SKILL.md`, the thin command skill prompt orchestrates real host subagents across 17 lifecycle stages. The prompt specifies operational roles (`implementer_id`, `tester_id`, `reviewer_id`, `rereviewer_id`, `evidence_actor_id`, `auditor_id`), requires `implementer_id` to differ from all reviewers, evidence actor, and auditor, and requires all five roles in Stage `F` (`implementer_id`, `reviewer_id`, `rereviewer_id`, `auditor_id`, `evidence_actor_id`) to be pairwise distinct, failing closed on role conflicts (`role-independence-violation`) while recognizing prompt instructions provide behavioral guidance rather than an OS sandbox. Budget `N` accounting is mandatory (never inferred or defaulted); initial review rejection halts with `failed-review`; test or build failure halts immediately without retry; Stage `F` is strictly non-editorial and requires independent auditor certification of the 11-point success contract.
- **Native issue-fetch helper execution and publication standards**: Migrated Node utilities in `ext/sonarqube-test-quality/scripts/` share the Node `>=22.19.0` runtime baseline with zero external npm dependencies. The issue-fetch helper (`scripts/fetch-sonar-issues.mjs`) invokes the native Sonar CLI executable via `spawn` with `shell: false` (rejecting Windows `.bat`/`.cmd` wrappers at argument validation) to prevent shell interpolation hazards. When `--output` is specified, it spools stdout through `pipeline()` into a unique sibling temporary staging file opened with exclusive POSIX mode 0600 (`O_WRONLY | O_CREAT | O_EXCL`), tightens permissions on the staged replacement file to `(existingMode & 0600)` (or `0600` for new targets), and replaces the regular destination atomically via rename upon exit code 0 and clean stream close. On handled non-zero child exit, catchable signals, or stream/launch errors, the staging file is unlinked and prior destination remains untouched (unhandled wrapper crashes or uncatchable signals like SIGKILL remain operating system boundaries). Child stderr is drained silently to avoid leaking session tokens or sensitive query parameters, and child exit codes are propagated directly.
- **Structural JaCoCo coverage calculation and arithmetic standards**: The offline coverage helper (`scripts/calculate-jacoco-coverage.mjs`) parses JaCoCo XML reports using vendored SAX (`scripts/vendor/sax.cjs`) with fatal UTF-8 decoding, allowing ordinary external DOCTYPE declarations without fetching them while strictly rejecting internal subsets and custom entity declarations (`parser.ondoctype`). Aggregates only direct child `LINE` and `BRANCH` counters of matched classes, strictly ignoring method, sourcefile, package, group, or report counter elements. Every matched class requires a direct `LINE` counter (missing `LINE` is invalid input exiting 1). Evaluates combined coverage against `--threshold` (0..100 unsigned decimal, default 95) using exact BigInt rational cross-multiplication (`100n * covered * q > p * total`) without floating-point rounding errors (percentages are display-only). Exits 0 on strict pass, 1 on invalid arguments/XML/counters, and 2 on threshold failure or empty matched aggregate.
- **Execution root isolation, containment, and toolchain standards (Phase 04)**: In `ext/sonarqube-test-quality/references/project-discovery.md` and `references/local-analysis.md`, execution guidance enforces the three-root model: `installed_skill_root` (extension directory resolved from loaded entrypoint, never process CWD), `checkout_root` (selected Git checkout/worktree root; administrative `.git` dir is distinct from worktree checkout), and `execution_root` (per-target child process working directory; accepts monorepo service subdirectories where `execution_root != checkout_root`). Enforces canonicalization (`realpath`) and path-component-aware containment (`..` path component checks) to reject path traversal and foreign sibling repositories. For local verification and upload modes, `git -C <execution_root> rev-parse --show-toplevel` must equal `checkout_root` and HEAD commit must match checkpoint SHA, halting immediately on nested foreign clones. On Windows with PowerShell, Maven (`mvn.cmd`) arguments pass as literal array elements with call-operator splatting (`& $mvnCmd @mvnArgs`), capturing native exit code (`$savedExitCode = $LASTEXITCODE`) immediately before `finally` directory restoration to ensure test failures halt without executing upload-capable scanner goals. Scanner task metadata paths are discovered from effective build configuration (`target/sonar/report-task.txt` for Maven), persisting metadata before cleanup to resume verified `ceTaskId` without re-upload or budget consumption.
## Documentation standards

- Keep Markdown files below the repository limit of 800 lines; keep README strictly
  below 300 lines. Split oversized historical/reference topics into linked documents
  instead of exceeding either limit.
- Link only to verified files under `docs/` or the repository root.
  `docs/project-changelog.md` mirrors phase evidence and boundaries; root
  `CHANGELOG.md` is semantic-release output, not the phase-authority document.
- Date-stamp Unreleased documentation entries where project conventions require it.
  Do not invent release versions, test totals, APIs, environment variables, or
  support claims.
- Keep detailed distribution/context/publication authority in
  [system architecture](./system-architecture.md), requirements in the
  [PDR](./project-overview-pdr.md), and source navigation in the
  [codebase summary](./codebase-summary.md).

## References

- [Agent guidance](../AGENTS.md), [System architecture](./system-architecture.md), [Project overview and PDR](./project-overview-pdr.md), [Codebase summary](./codebase-summary.md).
- [Project roadmap](./project-roadmap.md), [Project changelog](./project-changelog.md), [Project changelog archive](./project-changelog-archive.md).
- [Pre-Upgrade Backup & Leftover Guidance](./upgrade-backup-and-leftover-guidance.md).
- [Pi-native migration](./pi-native-migration.md).
- [Snyk specialist guide](./snyk-expert-cli.md).
