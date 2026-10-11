# Code Standards and Codebase Structure

**Status:** EVCrate core implementation standards for the completed advisor subsystem retirement cutover; live vendor/native-host qualification remains separate.
**Updated:** 2026-10-11
**Applies to:** TypeScript control plane, canonical harness resources, generated projections, and publication tooling.
**Windows release boundary:** Standalone installer lifecycle and clean-install `version --json` only; prior candidate evidence does not qualify the current package.

**Plugin architecture:** VS Code Local native support is an isolated Agent Plugins 1.0 bundle (`evcrate-local`) registered through user-controlled `chat.pluginLocations`, separate from Copilot CLI.
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
- **Protected historical progress**: Inspect immutable in-repo receipts and sealed-path metadata without rewriting captured plan/phase/evidence/index identities. Parent alone publishes uncaptured progress/receipts; recorded completion and present freshness remain distinct.
- **No legacy command or agent naming in maintained sources**: All commands strictly project `evc-cmd-*` (nested with `-x-`, length <= 64), custom agents project `evc-*`, and Copilot skills project `evc-<skill>`. Never emit legacy shapes (`cmd_`, colons, underscores).
- **Single AGENTS.md authoring authority**: Canonical instructions are authored strictly at `.evcrate/source/.claude/AGENTS.md`. Never author in root `AGENTS.md` (generated Codex output) or create repository-owned files named `CLAUDE.md`.
- **Branch topology and release qualification**: Canonical release branches are `main` (stable) and `next` (prerelease `rc`). Stable publication always requires live, candidate-bound GitHub authorization; caller-authored approval files and environment flags cannot grant authorization.

### Stable-release authorization

- Configure `production` before stable publication: required human User reviewers with repository maintain/admin roles, prevent self-review, disable administrator bypass, and allow only the selected `main` branch (no tag policies or wildcards).
- The publisher checks the live environment and branch-policy APIs, then verifies the candidate's canonical repository, source commit, release workflow path, run ID, and attempt against GitHub.
- The workflow run's production review history must contain an approved review by a configured maintainer/admin distinct from both the actor and triggering actor. Record the actual reviewer and source API, not the initiating actor or a fabricated review timestamp.
- Stable publication requires `GITHUB_TOKEN` or `GH_TOKEN` with access to run/review history, environment protections, branch policies, and collaborator permissions. API errors or unsupported protection shapes fail closed.
- Review history cannot bind approvals to rerun attempts; stable reruns require a new workflow run. Offline stable publication is not supported. Prerelease publication does not require production approval.
- `--approval`, `--approval-evidence`, `--require-approval`, and local approval-path/requirement environment variables are removed. Candidate receipt and asset-hash verification remain mandatory.
- Live setup verified 2026-10-10: `production` reviewers `loidinhm31` and `quochuy-vo`, self-review prevented, admin bypass disabled, selected deployment branch `main`. The publisher rechecks these protections rather than trusting this documentation.
- API contracts: [environment protections](https://docs.github.com/en/rest/deployments/environments) and [workflow review history](https://docs.github.com/en/rest/actions/workflow-runs#get-the-review-history-for-a-workflow-run).

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

All documentation and target-facing examples use unified `evc-cmd-*` naming for
slash commands and `evc-*` naming for agents. The single authority is
`src/adapters/resource-naming.ts`, enforced canonically by
`.evcrate/source/.claude/scripts/scan_commands.py`:

- Canonical command source files are flat files under `.evcrate/source/.claude/commands/evc-cmd-*.md`.
- Root forms are `/evc-cmd-plan`, `/evc-cmd-code`, `/evc-cmd-cook`, `/evc-cmd-fix`, and `/evc-cmd-advise`.
- Nested resources use the reserved segment separator `-x-`, for example
  `/evc-cmd-fix-x-hard` and `/evc-cmd-review-x-codebase`. No segment may contain an isolated `x` token.
- Agents use `/evc-*` (e.g., `evc-code-reviewer`, `evc-planner`).
- Copilot projects user-invocable skills as `evc-cmd-*` (with raw `$ARGUMENTS`) and styles as `evc-style-*`.
- Semantic identities (e.g. `code/auto`) join segments with `/` and remain stable command identities.
- All seven active target projection adapters emit flat `evc-*` names without compatibility aliases.
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
### Control-plane error taxonomy

`ControlPlaneErrorCategory` is the stable public classification. Exit codes are
grouped by category:

| Category | Exit code | Typical boundary |
|---|---:|---|
| `success` | 0 | Operation completed successfully. |
| `usage`, `protocol` | 2 | CLI syntax or versioned request shape is invalid. |
| `validation`, `path`, `capability` | 3 | Input, path, or requested capability is unsupported. |
| `conflict` | 4 | A revision or ownership CAS check failed. |
| `publication`, `rollback`, `recovery` | 5 | Publication transaction or recovery failed. |
| `internal` | 6 | Unexpected failure; expose only the sanitized diagnostic. |

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

- [System architecture](./system-architecture.md), [Project overview and PDR](./project-overview-pdr.md), [Codebase summary](./codebase-summary.md).
- [Project roadmap](./project-roadmap.md), [Project changelog](./project-changelog.md), [Project changelog archive](./project-changelog-archive.md).
- [Pre-Upgrade Backup & Leftover Guidance](./upgrade-backup-and-leftover-guidance.md).
- [Pi-native migration](./pi-native-migration.md).
