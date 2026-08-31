# Codebase Summary

**Last Updated**: 2026-08-31  
**Status**: Phase 4 distribution-safety continuation complete; release remains Unreleased  
**Repository**: [NEBULEA-M/evcrate](https://github.com/NEBULEA-M/evcrate)

## Purpose and current boundary

EVCrate is a multi-target CLI coding-agent distribution repository. Canonical
Claude resources are projected into target trees and, when explicitly requested,
published into a user HOME. The TypeScript control-plane CLI provides typed,
bounded command and filesystem primitives. The existing Python distribution
engine remains the authority for `build`, `check`, `publish`, `all`, and `recover`;
TypeScript invokes that engine rather than replacing it.

Phase 4 adds distribution authorization and transaction primitives to the
TypeScript package. It does **not** claim Python-free distribution parity,
Windows security equivalence, live installed-CLI qualification, or a live HOME
cutover.

## Repository map

```text
.
├── .evcrate/
│   ├── source/.claude/                 # canonical authored harness resources
│   ├── source/.evcrate/bin/            # sole authored advisor-controller source
│   ├── source/{.agents,.codex,.gemini,
│   │           .antigravity,.omp,.copilot,.pi}/  # generated projections
│   ├── targets/manifest.json            # schema-2 target registry
│   └── build-manifest*.json             # verified build metadata
├── src/                                 # TypeScript/npm control plane
│   ├── cli/                             # one-shot CLI, bridge, runner, output
│   ├── context/                          # HOME/state/project/target resolution
│   ├── protocol/                         # strict JSON and versioned contracts
│   ├── manifests/                        # schema-2 manifests and controller closure
│   ├── filesystem/                       # paths, hashes, atomic I/O, locks
│   ├── distribution/                     # build verification and promotion
│   ├── advisor-settings/                 # policy-file staging, CAS, recovery
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
| `src/protocol/` | Parse bounded JSON; provide Python-compatible canonical JSON and SHA-256 policy digests; validate resource, diagnostic, advisor-settings, and error envelopes. |
| `src/manifests/` | Load target declarations, enforce source/adapter/patch/path policy, check set-level output ownership, and validate the exact advisor-controller inventory and import closure. |
| `src/filesystem/` | Enforce normalized containment, owner/symlink checks, descriptor-stable reads, deterministic tree hashes, atomic files, capability-backed staged roots, and interoperable locks. |
| `src/distribution/` | Validate schema-2 build manifests and output/controller hashes; promote staged roots with durable journals, snapshots, pre-rename CAS, and recovery. |
| `src/advisor-settings/` | Read bounded owner-only policy files and provide staged policy replacement, source/destination CAS, durable journal recovery, and identity-checked cleanup. |

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

Independent validation passed **110/110**: Phase 4 **29/29**, protocol **18/18**,
CLI **28/28**, and Python-authority **35/35**. Final security review approved
**9.5/10**. Residuals are the documented low same-UID/path-race window and the
Linux-first security scope. Live vendor qualification and HOME cutover remain
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

A temporary Repomix XML compaction was generated on 2026-08-31 for this update
using the repository's configured exclusions. Repomix reported **2,513 files**,
**8,648,881 tokens**, and **32,595,351 characters**. The compaction was used as
analysis input and is not retained as a repository deliverable.
