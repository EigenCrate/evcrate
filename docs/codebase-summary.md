# Codebase Summary

**Last Updated**: 2026-09-01  
**Status**: Phase 6 registry and explicit-import contracts complete (canonical-only); release remains Unreleased
**Repository**: [NEBULEA-M/evcrate](https://github.com/NEBULEA-M/evcrate)

## Purpose and current boundary

EVCrate is a multi-target CLI coding-agent distribution repository. Canonical
Claude resources are projected into target trees and, when explicitly requested,
published into a user HOME by the existing Python distribution authority. The
TypeScript control-plane CLI provides typed, bounded command, protocol, registry,
import, and filesystem primitives; it invokes that authority rather than
replacing it.

Phase 4 adds distribution authorization and transaction primitives. Phase 5 adds
seven target projection adapters that build isolated staging roots and compare
output with Python references. Phase 6 adds a schema-v1 canonical resource
registry and explicit import preview/apply transaction. The implementation does
not claim publication or live cutover, HOME support for imports, Python-free
completion, Windows security equivalence, live installed-CLI qualification, or
unverified deployment behavior.

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
│   └── build-manifest*.json             # verified build metadata
├── src/                                 # TypeScript/npm control plane
│   ├── cli/                             # one-shot CLI, bridge, runner, output
│   ├── context/                          # HOME/state/project/target resolution
│   ├── protocol/                         # strict JSON and versioned contracts
│   ├── manifests/                        # schema-2 manifests and controller closure
│   ├── filesystem/                       # paths, hashes, atomic I/O, locks
│   ├── distribution/                     # build verification and promotion
│   ├── advisor-settings/                 # policy-file staging, CAS, recovery
│   ├── adapters/                         # staging-only target projections
│   ├── registry/                        # resource records, scans, revisions
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
| `src/imports/` | Read bounded external source descriptors, require capability approvals, stage non-mutating previews, persist owner-only single-use tokens, hash selected projections, and atomically apply canonical source plus registry under CAS. |
| `src/filesystem/` | Enforce normalized containment, owner/symlink checks, descriptor-stable reads, mode-aware complete tree hashes, atomic I/O, capability-backed staged roots, and interoperable locks. |
| `src/distribution/` | Validate schema-2 build manifests and output/controller hashes; promote staged roots with durable journals, snapshots, pre-rename CAS, and recovery. |
| `src/advisor-settings/` | Read bounded owner-only policy files and provide staged policy replacement, CAS, recovery, and identity-checked cleanup; policy remains outside the resource registry/import contract. |
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
  complete document. The CLI settings operations remain a typed
  `CAPABILITY_UNSUPPORTED` boundary without policy I/O until their owning phases.

## Lock and release-state interoperability

Publication uses an owner-only state directory and an `O_EXCL` JSON lock with a
bounded 4 KiB metadata document (`pid`, `startedAt`, random `token`, and Linux
process-start token). TypeScript exposes separate `publish.lock` and
`advisor-settings.lock` critical sections; Python's `publish_lock` uses the same
publication lock shape and metadata so the two implementations interoperate.
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

Focused implementation evidence records `npm run build` exit 0 and **85/85**
across the Phase 6 (**23/23**), protocol (**19/19**), Phase 4 (**31/31**),
and Phase 5 (**12/12**) focused commands. These contract results do not claim
publication, live cutover, HOME support, Python-free completion, or deployment
behavior.

Residuals remain the low same-UID/path-race window and Linux-first security
scope. Live vendor qualification and any publication/cutover remain
operator-controlled and unclaimed.

## Related documentation

- [System Architecture](./system-architecture.md)
- [Code Standards](./code-standards.md)
- [Project Overview and PDR](./project-overview-pdr.md)
- [Advisor distribution architecture](./advisor-distribution-architecture.md)
- [Advisor supervision migration](./advisor-supervision-migration.md)
- [Native Pi migration](./pi-native-migration.md)
- [Repository changelog](../CHANGELOG.md)

## Compaction record

A temporary Repomix XML compaction was generated on 2026-09-01 using the
repository's configured exclusions. Repomix reported **2,573 files**,
**8,764,045 tokens**, and **33,054,904 characters**. The compaction was used as
analysis input and is not retained as a repository deliverable.
