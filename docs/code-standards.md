# Code Standards and Codebase Structure

**Status:** Current implementation standard  
**Updated:** 2026-09-07  
**Applies to:** TypeScript control plane, canonical harness resources, shared advisor
controller, generated projections, and publication tooling

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
- **Explicit ownership.** User-owned advisor policy and unmanaged HOME data are
  preserved; EVCrate only mutates declared managed roots.

## Repository structure and ownership

```text
.
├── .evcrate/source/.claude/       canonical harness resources
├── .evcrate/source/.evcrate/bin/  shared advisor-controller source
├── .evcrate/source/{.agents,.codex,.gemini,.antigravity,.pi,.omp,.copilot}/
│                                  generated target projections
├── .evcrate/targets/              schema-2 target manifests and overlays
├── .evcrate/registry.json         schema-1 canonical resource registry
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

The canonical Claude resources are the only authored hook source. Regenerate
the six target projections (`.omp`, `.pi`, `.copilot`, `.codex`, `.gemini`,
`.antigravity`) and require `npm run distribute:check` before publication.
Projected and published OMP runtime behavior must retain the same allow/block
boundary.

## TypeScript and npm standards

### Package and entrypoints

- Keep the package CommonJS-compatible and compile strict NodeNext TypeScript from
  `src/` to `dist/` with declarations.
- Retain both bins: `evcrate` for the one-shot control-plane CLI and
  `evcrate-advisor` for the existing CommonJS controller.
- Keep public exports side-effect free. Importing `src/index.ts` must not start a
  process, open a listener, mutate HOME, or run a distribution action.
- Treat `package.json` scripts as command authority. Prefer `npm run build`,
  `npm run distribute:build`, `npm run distribute:check`, and target-specific
  `npm run distribute:*` scripts over stale Python snippets.

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

The CLI supports version, health, `resources list|get`, `imports preview|apply`,
`scopes list|get|assign|remove|enable|disable`, `changes preview|apply`,
advisor-settings `get|preview|apply`, and distribution `build|check|publish|all|recover`.
A request file is one complete bounded versioned envelope and is mutually exclusive
with positional command construction. JSON and non-TTY output derive from the same
validated result.

Do not add a daemon, listener, retry loop, background worker, counsel proxy,
arbitrary launcher, or direct migrator dispatch. Compatibility paths must be
explicit and transition-only; they must not mix Python and TypeScript mutations in
one atomic operation. Unknown failures become stable sanitized errors; raw paths,
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

## Normative command naming

All documentation and target-facing examples use a literal `cmd` prefix for every
slash command/resource name, including names referring to `.claude` resources.
This rule applies to prose, tables, examples, and generated documentation:

- Root forms are `/cmd-plan`, `/cmd-code`, `/cmd-cook`, `/cmd-fix`, and `/cmd-advise`.
- OMP nested resource names replace path separators with `__`, for example
  `/cmd-fix__hard` and `/cmd-review__codebase`.
- Copilot projects a nested resource as `/evcrate-cmd-fix-hard`; its raw arguments
  remain `$ARGUMENTS`.
- A source path such as `.claude/commands/fix/hard.md` is a file reference, not a
  slash invocation, and does not change source naming.
- Shell executable syntax (`npm`, `node`, `python3`, `cp`, `export`) is not a slash
  resource name and remains syntactically executable.

This is a documentation/target convention for the migration. The canonical
`.claude/scripts/scan_commands.py` scanner currently derives names from relative
paths, and `src/cli/arguments.ts` accepts bare operational action names. Neither
currently enforces a `cmd` prefix. That enforcement is a follow-up; do not claim
this documentation change renamed source commands or completed parser migration.
The OMP and Copilot `evcrate/command-name-map.json` files are authoritative for
their projections. Do not invent aliases.

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

## Manifest, registry, and resource standards

### Target manifests

The schema-2 target registry persists exactly `antigravity`, `claude`, `codex`,
`copilot`, `gemini`, `omp`, and `pi`. `agy` is input-only normalization for
`antigravity`. Manifests declare exactly the resource roots `skill`, `agent`,
`workflow`, `command`, and `hook`, plus target output/home policy. Normalize paths;
reject traversal, backslashes, duplicate lists, symlinked ancestors, equal/nested
output roots, unsafe adapter/helper files, and obsolete per-harness controller
fields.

Patch authorization is explicit: a source must be a regular file under the manifest
patch subtree; destination must be normalized, unique, and inside a declared output
root; keys must be non-empty, unique strict dotted JSON keys; patch text must be
valid JSON.

### Resource registry and imports

Keep `.evcrate/registry.json` (schema 1) distinct from target/build manifests
(schema 2). Registry records use stable `kind:canonical-relative-path` IDs,
canonical source paths, mode-aware content hashes, provenance, all seven target
compatibility entries, capabilities, bounded optional metadata, and positive
revisions. IDs and records sort by Unicode code point.

Canonical scans use owner-controlled roots, reject symlink/special entries, and hash
before discovery. Resource kinds are fixed: skill directories contain `SKILL.md`;
agents/workflows are root-level Markdown files; commands recurse for Markdown files;
hooks are root-level files or directories. Imported content is never executed.

`imports.preview` reads immutable bounded descriptors into an owner-only stage and
writes only a single-use replay token. `imports.apply` rechecks source identity,
canonical/registry/manifest/adapter/output hashes, destination, provenance,
approvals, expiry, and resource record before promotion. Same-provenance matches are
updates/unchanged; different provenance, kind mismatch, stale dependencies, or
unmanaged destinations return <code>CAS_CONFLICT</code> without adopting or deleting user data.

## Advisor controller standards

The shared controller is authored only at `.evcrate/source/.evcrate/bin/` and
published once to `$HOME/.evcrate/bin/`. It reads the required user policy at
`$HOME/.evcrate/advisor-routing.json`; policy is never generated or published.

Policy version 1 has exactly top-level `version`/`advisor` and advisor keys
`backend`/`model`/`effort`/`timeout_ms`, with timeout `60000..900000`. Bound policy
to 16 KiB, parse strict UTF-8/JSON, reject duplicate keys, credentials, unknown
fields, unsafe paths/modes, and `hosts` migration input. Candidate backends are
`claude`, `codex`, `antigravity`, `pi`, and `omp`; enabled backends are `claude`,
`codex`, `pi`, and `omp`. Gemini and Copilot are not controller backends.

The direct stdin checkpoint has exactly ten keys:
`protocol`, `version`, `checkpoint`, `question`, `kind`, `task_or_phase`, `evidence`,
`changed_paths`, `prior_counsel`, and `owner_disposition`. Bound request/evidence
sizes, evidence files, changed paths, safe relative paths, and checkpoint IDs. A
single controller transaction generates a UUID, loads policy once, selects one
adapter, creates one empty owner-only workspace, probes and invokes once under one
monotonic deadline, emits one frozen envelope, and cleans up. No retry, provider
switch, model substitution, effort downgrade, callback, or local fallback is
permitted.

The public result is one JSON line with <code>ADVICE_READY</code> or <code>FAILED</code>, a correlation UUID,
and a receipt containing backend/model/effort/controller version/adapter version and
elapsed time. Failure contains only sanitized error fields. Stderr is empty and exit
zero means success only. Runner calls use `shell:false`, fixed allowlisted argv and
environment, stdin-only prompts, bounded streams, detached POSIX process groups,
TERM/KILL cancellation, and descendant reaping.

See [system architecture](./system-architecture.md) for the complete wire shape,
limits, closure, adapter boundaries, and verification boundary.

## Filesystem, locking, and transaction standards

- Normalize relative POSIX paths before joining; reject absolute paths, backslashes,
  dot/dot-dot segments, empty segments, NULs, symlinked ancestors, special entries,
  and containment escapes.
- Require real owner-controlled directories for managed roots and ancestors.
  State, locks, journals, and policy files are owner-only on POSIX. Never chmod or
  replace unrelated HOME data.
- Stage on the destination volume. Record device/inode/size/mode/digest snapshots
  and compare them before every backup/promotion rename.
- Write journals, markers, policy bytes, and lock metadata through owner-only atomic
  temporary files; flush metadata where supported.
- Recover only validated, owner-controlled, contained journal paths. Restore the
  complete prior set for an interrupted transaction; leave unexpected state and
  user data untouched.
- Publication, scope, and advisor-settings locks are separate transactions. Lock
  release requires matching token and device/inode identity; uncertain release
  leaves state for recovery.

Advisor settings uses `advisor-settings.lock`, single-use preview tokens, durable
prepared/backed-up/promoted journals, revision/CAS checks, and whole-document
atomic apply. It never joins scope or target-publication atomicity.

## Build, closure, and release standards

`scripts/generate-controller-inventory.mjs` is the source of the generated 17-file
controller inventory. `scripts/build-manifests.mjs` invokes the TypeScript local-build
path for each persisted target and the aggregate set. Build manifests are schema 2
and carry `source_hashes`, `adapter_hashes`, `controller_hashes`, `owners`,
`output_hashes`, `validation`, and `home_policy`.

Build/check must verify complete validation, current hashes, regular non-symlink
files, canonical entrypoint mode/shebang, and no missing/extra/foreign closure file.
Publication consumes only a current verified build and preserves unmanaged roots.
Linux x64 is the current live qualification boundary; do not infer Windows
security equivalence, live vendor qualification, npm publication, deployment, or
rollout from deterministic contracts.

## Testing and review standards

Tests defend observable behavior: strict parser/manifest contracts, bounded scans,
capability approvals, non-mutating previews, token expiry/replay, managed/unmanaged
collisions, CAS hashes, output ownership, controller closure, symlink/owner checks,
staged-root cleanup, locks, stale quarantine, promotion recovery, and advisor policy
recovery. Prefer temporary roots and real filesystem/process behavior. Do not weaken
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

- Keep Markdown files below the repository limit of 800 lines; keep README below
  300 lines. Prefer tables, concise sections, and links over duplicated contracts.
- Link only to verified files under `docs/` or the repository root.
  `docs/project-changelog.md` mirrors phase evidence and boundaries; root
  `CHANGELOG.md` is semantic-release output, not the phase-authority document.
- Date-stamp Unreleased documentation entries where project conventions require it.
  Do not invent release versions, test totals, APIs, environment variables, or
  support claims.
- Keep detailed controller/distribution/supervision authority in
  [system architecture](./system-architecture.md), requirements in the
  [PDR](./project-overview-pdr.md), and source navigation in the
  [codebase summary](./codebase-summary.md).

## References

- [System architecture](./system-architecture.md)
- [Project overview and PDR](./project-overview-pdr.md)
- [Codebase summary](./codebase-summary.md)
- [Project roadmap](./project-roadmap.md)
- [Project changelog](./project-changelog.md)
- [Pi-native migration](./pi-native-migration.md)
