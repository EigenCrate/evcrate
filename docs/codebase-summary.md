# Codebase Summary

**Last Updated**: 2026-09-04  
**Status**: Phase 11 validation and staged rollout gates complete; release remains Unreleased
**Repository**: [NEBULEA-M/evcrate](https://github.com/NEBULEA-M/evcrate)

## Purpose and current boundary

EVCrate is a multi-target CLI coding-agent distribution repository. Canonical
Claude resources are projected into target trees and published through the
TypeScript control-plane CLI after verified build and per-target cutover gates.
The CLI provides typed, bounded command, protocol, registry, import, scope,
filesystem, target-publication, manifest-generation, and recovery primitives.
The repository retains a Python compatibility bridge only for explicitly selected
transition paths; Python distribution and migrator sources are not packaged.

Phase 4 adds distribution authorization and transaction primitives. Phase 5 adds
seven target projection adapters that build isolated staging roots and compare
output with Python references. Phase 6 adds a schema-v1 canonical resource
registry and explicit import preview/apply transaction. Phase 7 adds package-local
global/project scopes, explicit inheritance/disablement, revision-vector CAS,
typed preview hash/token bindings, and a separate advisor-settings coordinator
with lock/journal/recovery. Phase 8 adds current-build resolution, deterministic
HOME publication planning, manifest-driven merge rules, same-volume staging,
durable target-publication journals/markers, bounded release retention, and
idempotent rollback/finalization recovery. Phase 9 adds the packed npm consumer
boundary: DamHopper resource-control lifecycle, target publication/recovery,
qualification-only health, and fail-closed protocol/error handling. Phase 10
completes TypeScript release packaging, per-target cutover receipts, uniform
engine enforcement, manifest generation, and the Python-free packed runtime
boundary.
Phase 11 validates packed consumer publication, consumer-mode build resolution,
zero-mutation package-root behavior, and the full validation/rollout gate suite.

The default CLI path now performs projection build/check, verified-manifest
generation, HOME publication/recovery, health, settings, and resource-control
operations in TypeScript. An explicit Python engine override or injected process
runner may still exercise the compatibility bridge during transition testing;
that bridge is not selected by the packaged default path.

The TypeScript publication path is now the default staging, parity, and recovery
engine. Consumer publication resolves a verified bundled build in `consumer` mode:
it validates output and controller hashes without requiring authoring Python adapter
sources, and it never writes under an installed package root. The compatibility
bridge remains available only for explicit transition overrides or injected
process-runner tests. The implementation does not claim live vendor-CLI
qualification, Windows security equivalence, npm publication, operator rollout,
or unverified deployment behavior.

## Repository map

```text
.
├── .evcrate/
│   ├── source/.claude/                 # canonical authored harness resources
│   ├── source/.evcrate/bin/            # sole authored advisor-controller source
│   ├── source/{.agents,.codex,.gemini,
│   │           .antigravity,.omp,.copilot,.pi}/  # generated projections
│   ├── targets/manifest.json            # schema-2 target registry and roots
│   ├── registry.json                    # schema-1 canonical resource registry
│   ├── scopes/                          # package-local global/project scope state
│   └── build-manifest*.json             # verified build metadata
├── src/                                 # TypeScript/npm control plane
│   ├── cli/                             # one-shot CLI, bridge, runner, output
│   ├── context/                         # HOME/state/project/target resolution
│   ├── protocol/                        # strict JSON and versioned contracts
│   ├── manifests/                       # schema-2 manifests and controller closure
│   ├── filesystem/                      # paths, hashes, atomic I/O, locks
│   ├── distribution/                    # build, cutover, publication, recovery
│   ├── advisor-settings/                # policy-file staging, CAS, recovery
│   ├── adapters/                        # staging-only target projections
│   ├── registry/                        # resource records, scans, revisions
│   ├── scopes/                          # assignments, inheritance, revisions, CAS
│   ├── imports/                         # bounded preview/apply and token state
│   └── errors/                          # stable error serialization and exits
├── scripts/                             # controller inventory and build-manifest generation
├── distribution/                        # Python compatibility/transition authority
├── copilot_adapter/                     # staging-only legacy reference
├── omp_adapter/                         # staging-only legacy reference
├── pi_adapter/                          # staging-only legacy reference
├── migrate_claude_to_*.py               # legacy parity references
├── tests/                               # focused TypeScript, integration, and Python contracts
├── docs/                                # maintained technical documentation
├── guide/                               # command and skill references
├── distribute.py                        # explicit Python compatibility entrypoint
├── package.json                         # CommonJS package, bins, scripts, and packed closure
└── CHANGELOG.md                         # repository changelog
```

Generated JavaScript/declarations under `dist/` are build outputs. The generated
`src/manifests/controller-inventory.generated.ts` is derived from the controller
inventory generator and is not hand-edited. `scripts/build-manifests.mjs` runs
after compilation to regenerate one target-specific build manifest per target
plus the aggregate manifest.

## TypeScript control-plane modules

| Area | Verified responsibility |
|---|---|
| `src/cli/` | Parse one invocation, load one bounded request file, resolve context, dispatch one operation, render one validated result, and exit. Child processes use fixed argv, `shell: false`, bounded streams, and cleanup; packed consumers retain a module-root version fallback. |
| `src/context/` | Resolve package-owned roots and the schema-2 registry; derive package roots from explicit source/cwd for packed consumers; normalize target aliases (`agy` is input-only) and reject unsafe/symlinked paths. |
| `src/protocol/` | Parse bounded JSON; provide Python-compatible canonical JSON and SHA-256 policy digests; validate resource/import payloads, versioned envelopes, advisor settings, diagnostics, and errors. |
| `src/manifests/` | Load target declarations and manifest-derived resource roots; enforce source/adapter/patch/path policy, check set-level output ownership, and validate the exact advisor-controller inventory and import closure. |
| `src/registry/` | Scan declared canonical resource roots, validate schema-v1 records, derive seven-target compatibility/capabilities, verify revisions and hashes, and serve bounded deterministic list/get queries. |
| `src/scopes/` | Persist package-local global/project assignments, resolve inheritance and disablement, compute project identities and revision vectors, and apply scope CAS. |
| `src/imports/` | Read bounded external source descriptors, require capability approvals, stage non-mutating previews, persist owner-only single-use tokens, hash selected projections, and atomically apply canonical source plus registry under CAS. |
| `src/filesystem/` | Enforce normalized containment, owner/symlink checks, descriptor-stable reads, mode-aware complete tree hashes, atomic I/O, capability-backed staged roots, and interoperable locks. |
| `src/distribution/` | Resolve authoring and consumer verified builds; consumer mode checks bundled output/controller hashes without authoring adapter sources; build/check isolated TypeScript projections; enforce cutover receipts and uniform engine selection; plan, stage, promote, retain, journal, and recover target publications without package-root mutation; preserve manifest shared-JSON source fragments; merge Copilot/Pi shared JSON; parse JSONC. |
| `src/advisor-settings/` | Read bounded owner-only policy files and provide staged policy replacement, CAS, recovery, and identity-checked cleanup; policy remains outside the resource registry/import/publication contract. |
| `src/adapters/` | Build and validate seven target projections from frozen resource-graph bytes; expose exhaustive five-kind compatibility and enforce declared staging roots. |

## Phase 4 distribution authorization

### Schema-2 manifests and build metadata

The registry contains exactly the persisted targets `antigravity`, `claude`,
`codex`, `copilot`, `gemini`, `omp`, and `pi`. Each target declaration is schema
2. Target paths and adapter sources are normalized relative POSIX paths; adapter
and helper inputs must be regular, non-symlink files. Output roots are declared
as normalized roots, and the manifest set rejects equal or nested roots so two
targets cannot claim overlapping output ownership.

Patch declarations are authorized as a unit: the source must be under the
manifest's `patches/` tree and be a regular file; every key is a non-empty,
strict dotted JSON path with no duplicate keys; each destination is normalized,
unique across patches, and contained by a declared output root. Owned source
paths are limited to the manifest's `files/` subtree. HOME bindings must cover
the declared roots without duplicate destinations and respect promotion order.

A build manifest is schema 2 with the exact fields
`schema_version`, `source_hashes`, `adapter_hashes`, `controller_hashes`,
`owners`, `output_hashes`, `validation`, and `home_policy`. The TypeScript reader
bounds the document at 4 MiB, rejects symlinked/unstable files, requires
`validation.complete === true`, and compares current source, adapter, output,
and controller hashes before accepting a build.

### Controller inventory and hash closure

The controller is authored only at `.evcrate/source/.evcrate/bin`. The canonical
inventory has exactly these 17 production files:

```text
 evcrate-advisor
 lib/advisor/adapter-contract.cjs
 lib/advisor/adapter-registry.cjs
 lib/advisor/adapters/claude.cjs
 lib/advisor/adapters/codex.cjs
 lib/advisor/adapters/omp.cjs
 lib/advisor/adapters/omp-parser.cjs
 lib/advisor/adapters/pi.cjs
 lib/advisor/checkpoint-contract.cjs
 lib/advisor/controller-envelope.cjs
 lib/advisor/controller.cjs
 lib/advisor/errors.cjs
 lib/advisor/isolated-workspace.cjs
 lib/advisor/json-document.cjs
 lib/advisor/policy-schema.cjs
 lib/advisor/profile.cjs
 lib/advisor/runner.cjs
```

The source and projection validators reject symlinks, extra production files,
tests, fixtures, helpers, fake artifacts, and non-literal or out-of-closure
imports. The entrypoint requires the canonical Node shebang and executable mode.
`controller_hashes` must contain exactly the same 17 `.evcrate/bin/...` keys and
must match the current bytes; projections must be byte-identical.

## Phase 5 target projection adapters

The seven TypeScript projection adapters are registered in the fixed order
Claude, Gemini, Antigravity, Codex, Pi, OMP, Copilot. Each consumes canonical
`.evcrate/source/.claude/` resources plus declared manifest/helper inputs and
writes only its own isolated staging roots; generated targets and the advisor
controller are never adapter inputs or outputs.

Python snapshot parity is asserted by `tests/adapters/python-parity.test.mjs`.
The exact explicit records in `tests/adapters/parity-deltas.mjs` total 2,033:
Claude 189 directory records; Gemini 797 (249 directories, 548 files);
Antigravity 324 (225 directories, 99 files); Codex 362 (232 directories, 130
files); Pi 98 file records plus 14 approved extension extras; OMP 86 file
records; and Copilot 177 file records. The Python migrators/helpers remain
parity references; TypeScript adapters are authoritative after the Phase 10
target-specific cutover receipts.

Declared staging roots are `.claude`; `.gemini` and `GEMINI.md`; `.antigravity`;
`.agents`, `.codex`, and `AGENTS.md`; `.pi`; `.omp`; and `.copilot`,
respectively. Validators reject traversal, graph mutation, missing/extra/hash/
mode/symlink/special outputs, and controller markers. `npm run test:phase5`
passed with a clean build and **12/12** tests; this is staging/parity evidence
only, not HOME publication or live qualification.

## Phase 6 registry and explicit imports

### Registry authority and manifest roots

The schema-2 target manifest remains distribution authority. Its single
`resource_roots` map declares exactly five canonical roots: `skill`, `agent`,
`workflow`, `command`, and `hook`. The resolver keeps the manifest-derived
`resourceRoot` assumption: it reads `.evcrate/targets/manifest.json`, infers the
repository from that path, and resolves normalized non-overlapping roots below
`.evcrate/source/.claude`. Alternate layouts and arbitrary roots are not implied.

`.evcrate/registry.json` is a separate schema-v1 document, distinct from the
schema-2 target/build manifests. It contains a revision and code-point-sorted
records with `kind:canonical-relative-path` IDs, source paths, mode-aware content
hashes, provenance, seven-target compatibility, detected capabilities, optional
model metadata, and per-record revisions. It never duplicates target manifests,
output/HOME bindings, controller files, or advisor policy.

### Bounded deterministic scanning and queries

Canonical scanning requires owner-controlled real roots, hashes the tree before
discovery, rejects symlinks/special entries, and excludes sensitive path segments
from resource discovery. Granularity is fixed: skill directories must contain
`SKILL.md`; agents/workflows are root-level Markdown files; commands recurse for
Markdown files; hooks are root-level files or directories. Registry documents are
bounded to 4 MiB and 10,000 records. Canonical traversal is bounded to 100,000
files/directories, 256 MiB total, 16 MiB per file, depth 32, and 4 KiB paths.
Entries and IDs use Unicode code-point order.

`resources.list` validates kind/target/status filters, a code-point cursor, and a
limit of 1–100 (default 50). `resources.get` resolves one validated ID. Loading
rescans canonical roots and compares content, capabilities, compatibility, and
ownership; stale documents, duplicate ownership, and an empty registry hiding
existing canonical content fail closed.

Projection adapters provide the compatibility map. The registry requires all
seven persisted target IDs and records `native`, `needsAdapter`, or
`unsupported` (with a reason). Missing adapters and unsupported selected target
capabilities fail before projection execution.

### Explicit import lifecycle

`imports.preview` accepts a source path, one resource kind, destination,
provenance, selected targets, capability approvals, and a 1–900 second expiry
(default 300). Source descriptors reject unsafe ancestors, symlinks/special
entries, sensitive paths, and group/world-writable modes. Traversal is bounded to
1,000 files, 64 MiB total, 16 MiB per file, 100,000 directories, depth 32, and
4 KiB per path. Executable bits, script suffixes, or shebangs require
`script-execution`; every hook requires `hook-execution`. Content is classified
but never executed.

Preview copies canonical source into an owner-only stage, materializes the
candidate, rescans it, and runs selected adapters in separate temporary stages.
It does not mutate canonical source, the registry, target manifests, generated
projections, controller files, advisor policy, HOME, or managed settings. It
persists only an owner-only (0600) single-use replay token under
`stateRoot/import-previews`; the canonical token record is exact-key and bounded
to 128 KiB.

Apply validates that token and expiry, rejects replay, and recomputes source
hash/identity, canonical current/prospective hashes, registry revision/file
identity, selected targets, target-registry and target-manifest hashes, adapter
hashes, projection output hashes, destination, provenance, approvals, and the
resource record. Source identity includes device/inode/size/mode; registry file
identity includes digest plus those fields; complete canonical hashes include
file and directory modes; promotion snapshots include kind, device/inode, size,
mode, and digest. Mode-only changes therefore conflict.

For create/update, canonical source and `.evcrate/registry.json` are promoted
from the same-volume stage as one lock-protected transaction with durable
backup/journal state and CAS checks before each backup/promotion rename. The
preview token is consumed only after success. Identical re-imports return
`unchanged` and preserve the registry revision.

| Destination state | Contract |
|---|---|
| No record and no node | Create the managed node and record. |
| Same-provenance managed record, matching kind | Replace in staging; `update` or `unchanged`. |
| Different provenance, kind mismatch, or changed dependency | `CAS_CONFLICT`; preserve the node. |
| Node with no matching managed record | `CAS_CONFLICT`; never adopt or delete unmanaged content. |

Generated roots, controller source/runtime, target manifests, advisor policy,
HOME paths, and managed settings are excluded import sources/destinations.


## Phase 7 scopes, advisor settings, and CAS

Scope state is persisted package-locally under `.evcrate/scopes/`: global
`global.json` plus project files under `projects/<opaque-project-id>.json`.
Project identity is the SHA-256 hash of canonical absolute project-root UTF-8
bytes; raw roots never become filenames or protocol output. Project assignments
override global assignments, explicit disabled assignments suppress inheritance,
and absent assignments inherit. The registry and scope documents contribute the
explicit revision vector
`{registryRevision,globalScopeRevision,projectScopeRevision|null}`.

`changes.preview|apply` uses owner-only single-use tokens. Preview bindings
include the revision vector, selected targets, canonical/registry/target-manifest/
adapter hashes, independent output-root hashes, and expiry; apply rechecks these
at mutation boundaries and consumes tokens only after success. Package-local scope
mutations serialize through `scopes.lock`.

Advisor settings is a separate coordinator, never a scope/registry/publication
transaction. Its canonical `advisor-settings.lock` protects frozen v1
complete-document request-file operations; opaque revisions bind policy bytes,
file identity, and mode. Single-use tokens, whole-document atomic apply, and
settings-specific journal/recovery protect manual edits, replay, expiry, and
replacement. Authored agent model frontmatter remains static resource content;
commands/workflows have no model binding, and mutable resource model operations
are intentionally deferred.

## Phase 8 atomic publication and recovery

Phase 8 added a TypeScript target-publication subsystem under
`src/distribution/`. It consumes only a current, complete schema-2 build and
selected target manifests. Publication and recovery never run target migrators or
adapters and never mutate advisor settings. Phase 8 established the
staging/parity/recovery boundary; Phase 10 promotes this path to the default
after the per-target gates, and Phase 11 validates the packed consumer path and
staged rollout gates.

### Build closure and deterministic planning

- `build-resolution.ts` selects the requested manifests and target-specific or
  all-target build-manifest path, validates complete schema-2 metadata, checks
  manifest-derived HOME policy parity, owners, and output roots. Authoring mode
  additionally re-hashes canonical source and manifest-declared adapter inputs;
  consumer mode verifies only bundled output hashes and controller closure, so an
  installed package does not require authoring Python adapter files.
- `publication-rules.ts` accepts only the closed manifest rules
  `omp-agent-prefix`, `codex-home-path-rewrite`, and
  `claude-skill-root-exclusion`. Rules are authorized to their owning target:
  OMP prefixes published files under `agent/`, Codex rewrites HOME hook/MCP
  paths, and Claude excludes a root-level `skills/<name>` file.
- `publication-inventory.ts` walks staging roots in canonical order with
  bounded file/directory/byte/depth/path limits. It rejects symlinks and
  special entries, computes controller and complete-tree hashes, records
  device/inode/size/mode metadata, checks owner-controlled ancestors, and
  validates both TypeScript target-publication markers and compatible Python
  publication markers.
- `publication-plan.ts` creates frozen controller plus selected-target binding
  plans. Each operation records source/destination, before snapshot, intended
  hash, preservation, merge, create, update, delete, no-op, or conflict action.
  Previous marker-managed paths drive stale-file deletion; unmanaged collisions
  remain conflicts.

Consumer publication plans call `resolveCurrentBuild` in consumer mode and map
only verified bundled projections; staging, promotion, and recovery are directed
at HOME roots, not the installed package root.

The selected bindings are sorted and validated against the exact order:

```text
.evcrate/bin  → .evcrate/bin       (controller, order 5)
.gemini       → .gemini            (order 10)
.agents       → .agents            (order 20)
.codex        → .codex             (order 20)
.pi           → .pi                (order 25)
.gemini/config → .gemini/config    (order 30)
.omp          → .omp               (order 30)
.claude       → .claude            (order 40)
.copilot      → .copilot           (order 40)
```

### Shared JSON and settings merges

- `jsonc.ts` provides bounded JSONC scanning for comments, trailing commas,
  duplicate keys, strings, values, nesting, node count, and trailing data while
  retaining original text spans.
- `managed-json.ts` applies a manifest-declared `managed-json-v1` fragment only
  to its exact top-level keys. It preserves unrelated keys, comments, newline
  style, and BOM; it rejects root/type/key mismatches and returns
  `create`, `update`, or byte-identical `noop`.
- `pi-settings.ts` applies `pi-settings-v1` to the declared settings key,
  preserves unrelated package entries and object shapes, pins the three
  manifest packages, and reports a `conflict` when `pi-code` is present. It
  never removes `pi-code` automatically.
- `shared-json.ts` dispatches only those two manifest schemas and maps planner
  failures to stable publication errors. OMP has no shared-JSON merge.

### Atomic apply, marker, and recovery

`publication.ts` exposes `publishDryRun`, `publishApply`, and
`recoverPublication`. State lives below `$HOME/.evcrate/publication` in an
owner-only `release-marker.json`, `publication-journal.json`, and release
transaction directories. Dry-run creates no state. Apply acquires the shared
publication lock, preflights any prior journal, checks same-volume placement,
recomputes before snapshots, stages controller/files, renames prior destinations
into identity-checked backups, promotes in the frozen order, syncs directories,
and verifies intended snapshots after each rename.

The journal is canonical, bounded, owner-only, and keyed to a release ID,
selected targets, binding order, build-manifest digest, managed paths, operation
count/digest, before snapshots, intended hashes, backup paths, and promotion
state. A committed transaction writes the complete marker, removes the active
journal, and retains at most one prior release subject to the 512 MiB and
seven-day limits. Failures before promotion restore the prior marker; failures
after promotion invoke recovery. `publication-recovery.ts` validates every
path, identity, digest, marker/journal relationship, and operation transition,
then either restores the prior complete state (`rolled-back`) or finalizes a
committed state (`finalized`). Repeated recovery with no journal is `none`;
unexpected replacements and ambiguous evidence fail closed rather than being
deleted.

The target marker and journal own only target publication. The
`$HOME/.evcrate/advisor-routing.json` policy remains byte/mode-preserved, and
the separate `advisor-settings` lock/journal/recovery transaction never
consumes target-publication state.

## Phase 9 DamHopper and Agent Store integration

Phase 9 verifies the packed npm artifact as an external consumer boundary. A
DamHopper adapter invokes one short-lived `evcrate` subprocess with fixed argv,
bounded stdio, a deadline, and a sanitized environment; it does not read or
write EVCrate registry, scope, manifest, generated, controller, policy, or HOME
artifacts directly.

`package.json` adds `test:phase9` (`npm run build && node --test
tests/integration/*.test.mjs`) and packs `.evcrate/source/.evcrate/**`,
`.evcrate/registry.json`, and `.evcrate/build-manifest*.json` so installed
consumers retain the verified control-plane closure. Context resolution accepts
an explicit package root, derives one from an explicit canonical source, detects
a manifest in the caller cwd, and otherwise falls back to the installed module
root. Version dispatch checks the resolved package and module-root metadata.

Consumer-mode resolution validates the bundled outputs and controller directly; it
does not resolve or hash authoring adapter sources that are absent from an
installed package.

The integration adapter is split by concern:

- `dam-hopper-commands.mjs` builds resource discovery/get, import preview/apply,
  scope list/get/mutate, changes preview/apply, publish, and recover argv.
- `dam-hopper-client.mjs` spawns the packed CLI, validates protocol v1 envelopes,
  and bounds output (`10 MiB`) and execution (`30 s` default).
- `dam-hopper-errors.mjs` maps stable client/CAS errors and recursively rejects
  counsel/checkpoint fields; malformed, empty, timeout, unsupported, and error
  envelopes fail closed.
- `dam-hopper-lifecycle.test.mjs` covers packed tarball SHA-256/install,
  version/discovery/get, import preview/apply, scope assignment and
  disable/enable/remove with stale-revision conflict, independent OMP/Copilot
  publish dry-runs, OMP apply/recover, and qualification-only health.
- `dam-hopper-fixtures.test.mjs` validates protocol v1 discovery, import,
  scope, publication, diagnostic, CAS/error, and negative counsel-proxy
  fixtures under `tests/fixtures/dam-hopper-v1/`.

The adapter never routes advisor counsel. Top-level `health` accepts and returns
only the qualification diagnostic; it cannot synthesize counsel, retry another
backend, or alter routing policy. Resource operations preserve request IDs,
selected targets, revision/token/hash metadata, publication activation, and
recovery results.

## Phase 9 evidence and boundary

`npm run test:phase9` passed **14/14** integration tests: six adapter client
tests, six fixture-schema/proxy tests, and two packed-consumer lifecycle tests.
Aggregate focused evidence passed **212/212** tests; code review scored **9.8/10**
and the advisor approved. Evidence covers the feature worktree and packed
artifact contract only. Phase 10 now records the TypeScript cutover; live
vendor-CLI qualification, operator rollout, or `main` merge remain separate.

## Phase 10 release packaging and per-target cutover

Phase 10 closes the TypeScript release boundary for all seven persisted targets.
`src/distribution/cutover.ts` exposes immutable `TargetGateReceipt` records with
the target, authoritative engine, parity and closure results, schema version,
cutover timestamp, and operator notes. `authoritativeEngineForTarget` normalizes
`agy` to `antigravity` and honors an explicit transition override;
`assertUniformAuthoritativeEngine` rejects any atomic request that would span
Python- and TypeScript-owned targets with `CAPABILITY_UNSUPPORTED`.

### Release packaging and manifest generation

`npm run build` executes `scripts/generate-controller-inventory.mjs` first,
regenerating the exact 17-file CommonJS controller inventory used by TypeScript
validation. `node scripts/build-manifests.mjs` then calls `runLocalBuild` once
for each persisted target and once for the aggregate set. Isolated staging runs
the registered TypeScript adapters, validates declared roots, copies the
controller closure, and writes `.evcrate/build-manifest-<target>.json` or
`.evcrate/build-manifest.json`. Build/check compare staged output and reject
legacy project-root target roots before any publication.

`package.json` exposes the CommonJS `evcrate` and `evcrate-advisor` bins and
allows compiled `dist/**`, `.evcrate/**`, plans, and release metadata. Phase 10
package contracts require compiled JavaScript and the controller/manifest
closure while excluding `distribution/`, migrators, legacy adapter packages,
`__pycache__`, and Python bytecode from the packed artifact.

### Default engine and runtime boundary

`distribute build|check|publish|all|recover`, top-level publish/recover,
version, health, advisor settings, and resource-control operations use the
TypeScript path by default. The compatibility bridge remains available only
when an explicit Python engine override or injected process runner selects it;
that path invokes package-relative `python3 distribute.py` and is retained for
transition tests, not as the packaged default. Generated projections remain
derived artifacts and are never hand-edited.

### Phase 10 evidence

`npm run test:phase10` passes **8/8**, covering all seven receipts, alias and
uniform-engine selection, controller closure, target/aggregate manifest
generation, legacy-root cleanliness, Python-free package allow-list checks, and
pure TypeScript CLI routing. Full validation passes **255/255** tests. This
evidence proves release packaging and default runtime behavior in the feature
worktree; Phase 11 now records consumer validation and rollout readiness. Live
vendor qualification, npm publication, deployment behavior, and `main` merge
remain separate release gates.

## Phase 11 validation and rollout readiness

Phase 11 validates the external packed-consumer path and the evidence needed for
staged rollout. `resolveCurrentBuild` has an explicit `consumer` mode: it verifies
the bundled complete schema-2 manifest, output hashes, controller closure,
ownership, and HOME policy without requiring authoring Python adapter sources.
Authoring build/check retains canonical source and adapter hash verification.

`createPublicationPlan` selects consumer mode for publication. The packed install
scenario runs from an unrelated working directory and proves that dry-run, apply,
repeat apply, and recovery leave the installed package root unchanged while
publishing only to disposable HOME/state roots. Tampered output is rejected before
publication, and unmanaged HOME content plus publication/advisor-settings state
remain isolated.

The hashing subsystem excludes `.gitignore` entries from deterministic
`treeHash`, `sourceTreeHash`, and `completeTreeHash` records while retaining
bounded traversal and symlink/special-entry rejection.

`npm run test:phase11` passed **7/7**; full validation passed **241/241**. Code
review scored **9.7/10** (approved). The advisor checkpoint is `ADVICE_READY`
with a recommendation to mark Phase 11 complete and proceed to release/rollout;
actual live qualification, npm publication, deployment, and `main` merge remain
separate operator/release gates.

## Canonical JSON and hashing

The TypeScript serializer follows the Python authority for supported values:
object keys sort by Unicode code point, arrays retain order, object `undefined`
fields are omitted, and numeric spellings use Python-compatible float/exponent
forms. Hashes are SHA-256. `treeHash`, `sourceTreeHash`, and `completeTreeHash`
include deterministic directory records, empty directories, and file digests in
global lexical path order but exclude `.gitignore` entries. Symlinks and
unsupported entries fail closed. Local dependency/compiler artifacts such as
`node_modules`, `__pycache__`, `dist`, `.pyc`, `.pyo`, and `.coverage` remain
excluded according to source/artifact mode.

The strict parser accepts only object or array document roots. It rejects
invalid UTF-8, control characters, unpaired surrogates, duplicate object keys,
non-finite numbers, trailing data, and nesting deeper than 16 levels. Bounded
UTF-8 and canonical-byte checks apply before protocol or manifest validation.

## Filesystem and transaction primitives

- Absolute paths reject traversal, backslashes, empty/dot segments, symlinked
  ancestors, non-regular entries, and escapes from declared roots.
- Managed roots and parents must be real, owner-controlled directories; owner-
  only state, stage, journal, lock, and policy files use restrictive modes on
  POSIX. Staged promotion sources must be on the destination volume.
- A staged root is an opaque capability created by the module. Its path and
  device/inode identity are checked before use. Cleanup first renames the exact
  identity to a quarantine name, rechecks ownership/identity, then removes it;
  replacement directories are not recursively deleted.
- Promotion writes an owner-only journal and backup set, snapshots source and
  destination bytes/metadata, rechecks both immediately before each rename,
  promotes complete roots, commits the journal, syncs the parent, and removes
  backups only after success. Recovery validates journal paths and restores the
  last complete set; unexpected replacements fail closed.
- Advisor policy replacement uses bounded canonical bytes, a prepared/
  backed_up/promoted journal, source and destination revision CAS at rename
  boundaries, post-promotion byte/mode verification, and recovery of the old
  complete document. The functional `advisor settings get|preview|apply`
  coordinator uses frozen v1 complete-document request-file input, the canonical
  `advisor-settings.lock`, and settings-specific journal/recovery; positional
  preview/apply remain behind the request-file boundary.

## Lock and release-state interoperability

Publication uses an owner-only state directory and an `O_EXCL` JSON lock with a
bounded 4 KiB metadata document (`pid`, `startedAt`, random `token`, and Linux
process-start token). TypeScript exposes `publish.lock`, package-local
`scopes.lock`, and `advisor-settings.lock` critical sections; Python's
`publish_lock` uses the same publication lock shape and metadata so the two
implementations interoperate.
A process-start check avoids treating a reused PID as the same owner when the
platform exposes `/proc/<pid>/stat`. A stale lock is atomically renamed to a
random quarantine name, re-read, matched by token/device/inode, and then removed.
Malformed, changing, or uncertain metadata blocks acquisition. Release removes a
lock only when token and device/inode identity still match; otherwise the lock is
left for recovery.

The release marker is an atomic owner-only schema-1 JSON file, bounded at 4 MiB.
Missing state has an explicit empty marker; malformed, symlinked, unsupported, or
unstable marker data fails closed. Unmanaged HOME files remain outside the
managed marker set.

## Python compatibility and package boundary

The compatibility bridge invokes only package-relative `python3 distribute.py`
actions and passes the resolved state root through the established handoff. It
does not invoke migrators directly. The packaged Phase 10 allow-list excludes
the distribution/migrator/legacy adapter Python trees, `__pycache__`, and Python
bytecode; the default TypeScript CLI path therefore needs no Python interpreter.
CommonJS package exports retain both the `evcrate` CLI and the existing
`evcrate-advisor` executable.

## Evidence and limitations

Focused implementation evidence records all builds passing. Phase 11
`npm run test:phase11` passed **7/7**, and full validation passed **241/241**.
Phase 10 `npm run test:phase10` passed **8/8**; Phase 9 `npm run test:phase9`
passed **14/14** integration tests; its aggregate focused evidence passed
**212/212**. Phase 8 `npm run test:phase8` passed **54/54**; earlier aggregate
evidence remains **133/133** across Phase 7 (**16/16**), protocol (**20/20**),
CLI (**31/31**), Phase 6 (**23/23**), Phase 4 (**31/31**), and Phase 5
(`npm run test:phase5`, **12/12**).

Phase 10 evidence covers target gate receipts, TypeScript manifest generation,
controller closure, packed artifact allow-listing, Python-free default CLI
operations, and mixed-engine rejection. Phase 11 adds consumer-mode build
resolution without authoring adapter sources, tamper rejection, packed
publication/recovery, the zero-mutation installed-package-root invariant,
cutover receipts, unmanaged HOME preservation, and isolated
publication/advisor-settings state. It does not claim live vendor-CLI
qualification, deployment behavior, npm publication, or `main` merge.

Residuals remain the low same-UID/path-race window and Linux-first security
scope. Live vendor qualification and rollout remain operator-controlled.

## Related documentation

- [System Architecture](./system-architecture.md)
- [Code Standards](./code-standards.md)
- [Project Overview and PDR](./project-overview-pdr.md)
- [Advisor distribution architecture](./advisor-distribution-architecture.md)
- [Advisor supervision migration](./advisor-supervision-migration.md)
- [Native Pi migration](./pi-native-migration.md)
- [Repository changelog](../CHANGELOG.md)
- [Phase release tracking](./project-changelog.md)

## Compaction record

Repomix v1.18.0 generated `repomix-output.xml` on 2026-09-04 using the
repository's configured/default exclusions. It reported **2,603 files**,
**8,813,510 tokens**, and **33,274,114 characters**. The compaction was used
as the source snapshot for this summary; it is not a package deliverable.
