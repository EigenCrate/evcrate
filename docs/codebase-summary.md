# Codebase Summary

**Last Updated**: 2026-09-02  
**Status**: Phase 8 atomic publication and recovery complete; release remains Unreleased
**Repository**: [NEBULEA-M/evcrate](https://github.com/NEBULEA-M/evcrate)

## Purpose and current boundary

EVCrate is a multi-target CLI coding-agent distribution repository. Canonical
Claude resources are projected into target trees and, when explicitly requested,
published into a user HOME by the existing Python distribution authority. The
TypeScript control-plane CLI provides typed, bounded command, protocol, registry,
import, scope, filesystem, and target-publication primitives; it invokes the
Python authority rather than replacing it.

Phase 4 adds distribution authorization and transaction primitives. Phase 5 adds
seven target projection adapters that build isolated staging roots and compare
output with Python references. Phase 6 adds a schema-v1 canonical resource
registry and explicit import preview/apply transaction. Phase 7 adds package-local
global/project scopes, explicit inheritance/disablement, revision-vector CAS,
typed preview hash/token bindings, and a separate advisor-settings coordinator
with lock/journal/recovery. Phase 8 adds current-build resolution, deterministic
HOME publication planning, manifest-driven merge rules, same-volume staging,
durable target-publication journals/markers, bounded release retention, and
idempotent rollback/finalization recovery.

The TypeScript publication path is staging, parity, and recovery evidence. The
default CLI compatibility bridge still invokes Python for production generation,
build/check, HOME publication, and cutover. The implementation does not claim
Python-free completion, live vendor-CLI qualification, Windows security
equivalence, or unverified deployment behavior.

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
│   ├── scopes/                           # package-local global/project scope state
│   └── build-manifest*.json             # verified build metadata
├── src/                                 # TypeScript/npm control plane
│   ├── cli/                             # one-shot CLI, bridge, runner, output
│   ├── context/                          # HOME/state/project/target resolution
│   ├── protocol/                         # strict JSON and versioned contracts
│   ├── manifests/                        # schema-2 manifests and controller closure
│   ├── filesystem/                       # paths, hashes, atomic I/O, locks
│   ├── distribution/                     # build, publication planning, and recovery
│   ├── advisor-settings/                 # policy-file staging, CAS, recovery
│   ├── adapters/                         # staging-only target projections
│   ├── registry/                         # resource records, scans, revisions
│   ├── scopes/                           # assignments, inheritance, revisions, CAS
│   ├── imports/                         # bounded preview/apply and token state
│   └── errors/                           # stable error serialization and exits
├── distribution/                         # Python-authoritative distribution engine
├── copilot_adapter/                      # staging-only Copilot projection
├── omp_adapter/                          # staging-only OMP projection
├── pi_adapter/                           # staging-only native Pi projection
├── migrate_claude_to_*.py                # target adapters called by Python gates
├── tests/                                # focused TypeScript and Python contracts
├── docs/                                 # maintained technical documentation
├── guide/                                # command and skill references
├── distribute.py                         # Python distribution entrypoint
├── package.json                          # CommonJS package, bins, scripts
└── CHANGELOG.md                          # repository changelog
```

Generated JavaScript/declarations under `dist/` are build outputs. The generated
`src/manifests/controller-inventory.generated.ts` is derived from the Python
controller authority and is not hand-edited.

## TypeScript control-plane modules

| Area | Verified responsibility |
|---|---|
| `src/cli/` | Parse one invocation, load one bounded request file, resolve context, dispatch one operation, render one validated result, and exit. Child processes use fixed argv, `shell: false`, bounded streams, and cleanup. |
| `src/context/` | Resolve package-owned roots and the schema-2 registry; normalize target aliases (`agy` is input-only) and reject unsafe/symlinked paths. |
| `src/protocol/` | Parse bounded JSON; provide Python-compatible canonical JSON and SHA-256 policy digests; validate resource/import payloads, versioned envelopes, advisor settings, diagnostics, and errors. |
| `src/manifests/` | Load target declarations and manifest-derived resource roots; enforce source/adapter/patch/path policy, check set-level output ownership, and validate the exact advisor-controller inventory and import closure. |
| `src/registry/` | Scan declared canonical resource roots, validate schema-v1 records, derive seven-target compatibility/capabilities, verify revisions and hashes, and serve bounded deterministic list/get queries. |
| `src/scopes/` | Persist package-local global/project assignments, resolve inheritance and disablement, compute project identities and revision vectors, and apply scope CAS. |
| `src/imports/` | Read bounded external source descriptors, require capability approvals, stage non-mutating previews, persist owner-only single-use tokens, hash selected projections, and atomically apply canonical source plus registry under CAS. |
| `src/filesystem/` | Enforce normalized containment, owner/symlink checks, descriptor-stable reads, mode-aware complete tree hashes, atomic I/O, capability-backed staged roots, and interoperable locks. |
| `src/distribution/` | Resolve verified schema-2 builds; apply explicit HOME rules; plan, stage, promote, retain, journal, and recover target publications; merge Copilot/Pi shared JSON; parse JSONC. The Phase 8 modules are `build-resolution.ts`, `publication-rules.ts`, `publication-inventory.ts`, `publication-plan.ts`, `publication.ts`, `publication-recovery.ts`, `shared-json.ts`, `managed-json.ts`, `pi-settings.ts`, and `jsonc.ts`. |
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
records; and Copilot 177 file records. The current Python migrators/helpers
remain authoritative until target-specific cutover.

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

Phase 8 adds a TypeScript target-publication subsystem under
`src/distribution/`. It consumes only a current, complete schema-2 build and
selected target manifests. It never runs target migrators/adapters during
publication or recovery and never mutates advisor settings. The CLI's default
compatibility path still calls `python3 distribute.py`; these TypeScript
operations establish the typed staging/parity/recovery boundary until the
Phase 10 cutover gates.

### Build closure and deterministic planning

- `build-resolution.ts` selects the requested manifests, resolves the
  target-specific or all-target build-manifest path, validates the complete
  schema-2 build, checks manifest-derived HOME policy parity, re-hashes current
  canonical source/manifest/adapter inputs, checks owners and output roots, and
  delegates final digest comparison to `verifyBuild`.
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

## Canonical JSON and hashing

The TypeScript serializer follows the Python authority for supported values:
object keys sort by Unicode code point, arrays retain order, object `undefined`
fields are omitted, and numeric spellings use Python-compatible float/exponent
forms. Hashes are SHA-256. Tree hashes include deterministic directory records,
empty directories, and file digests in global lexical path order; symlinks and
unsupported entries fail closed. Local dependency/compiler artifacts such as
`node_modules`, `__pycache__`, `dist`, `.pyc`, `.pyo`, and `.coverage` are
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

## Python authority and package boundary

The TypeScript compatibility bridge invokes only package-relative
`python3 distribute.py` actions and passes the resolved state root through the
established handoff. It does not invoke migrators directly, provide a Node
fallback, or claim Python-free parity. CommonJS package exports retain both the
`evcrate` CLI and the existing `evcrate-advisor` executable.

## Evidence and limitations

Focused implementation evidence records all builds passing and Phase 8
`npm run test:phase8` passing **54/54**; the command covers protocol, CLI,
publication planning, apply, recovery, parity, and isolation contracts. Earlier aggregate
evidence remains **133/133** across Phase 7 (**16/16**), protocol (**20/20**),
CLI (**31/31**), Phase 6 (**23/23**), Phase 4 (**31/31**), and Phase 5
(`npm run test:phase5`, **12/12**). These contract results do not claim live
vendor-CLI qualification, Python-free completion, deployment behavior, or
`main` merge.

Residuals remain the low same-UID/path-race window and Linux-first security
scope. Live vendor qualification and target cutover remain operator-controlled.

## Related documentation

- [System Architecture](./system-architecture.md)
- [Code Standards](./code-standards.md)
- [Project Overview and PDR](./project-overview-pdr.md)
- [Advisor distribution architecture](./advisor-distribution-architecture.md)
- [Advisor supervision migration](./advisor-supervision-migration.md)
- [Native Pi migration](./pi-native-migration.md)
- [Repository changelog](../CHANGELOG.md)

## Compaction record

Repomix v1.18.0 generated `repomix-output.xml` on 2026-09-02 using the
repository's configured/default exclusions. It reported **2,596 files**,
**8,810,707 tokens**, and **33,260,379 characters**. The compaction was used
as the source snapshot for this summary; it is not a package deliverable.
