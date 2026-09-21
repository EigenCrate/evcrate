# Code Standards and Codebase Structure

**Status:** Current implementation standard
**Updated:** 2026-09-21
**Applies to:** TypeScript control plane, Phase E00 advisor-plugin domain
contracts, canonical harness resources, shared advisor controller, generated
projections, and publication tooling
**Windows qualification:** Complete through Phase 10 (10/10 phases, 100%; completed
2026-09-15) for standalone installer lifecycle and `version --json`; live runtime
commands and vendor qualification remain Linux-only and operator-gated.

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


### Enforceable architectural bans

The following patterns are strictly prohibited across the codebase:
- **No project-local controller**: The advisor controller closure (`.evcrate/bin`) is strictly HOME-owned (`<home>/.evcrate/bin`). Never materialize a controller under a project directory.
- **No reverse lock acquisition**: In project publication, the HOME publication lock is always acquired first, held through shared commit and project harness application, and released last. The project workspace lock is acquired second. Reverse lock acquisition or premature release is banned.
- **No arbitrary body rewrite**: Installed wrappers are neutral. Never perform global or arbitrary text rewrites on wrapper code. Only schema-validated command registration fields may be transformed for HOME materialization (e.g. Antigravity mapping into `.gemini/config`).
- **No ancestor project search or cwd child resolution**: Installed wrappers must locate child resources relative to their own installation root (`import.meta.url` / `__dirname`). Never traverse parent directories hoping to find an ancestor project root, and never use `process.cwd()` to resolve EVCrate internal child resources.
- **No cross-volume atomicity fiction**: Per-volume atomic renaming is the attainable filesystem boundary. Cross-volume project publication explicitly admits and manages partial completion. Never attempt cross-volume rollback of committed shared HOME state.
- **No hand edits to generated files**: Never edit generated target projections, build manifests, registries, or runtime brief artifacts directly. Modify canonical sources and regenerate through established scripts.
- **No cross-scope recovery search**: Recovery must never cross the requested scope boundary. HOME recovery never mutates project files; project recovery never searches or mutates HOME state.
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
The seven generated target trees are listed above; the persisted adapter IDs remain
`claude`, `codex`, `gemini`, `antigravity`, `pi`, `omp`, and `copilot`. Do not count
the `.agents` Codex companion root as an additional adapter.

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
seven generated target trees (`.agents`, `.codex`, `.gemini`, `.antigravity`, `.pi`,
`.omp`, `.copilot`) and require `npm run distribute:check` before publication.
`.agents` is Codex's companion output root, not an eighth adapter.
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

Do not add a daemon, listener, generic/unbounded retry loop, background worker,
arbitrary launcher, or direct migrator dispatch. The managed v2 advisor controller
is the explicit retry exception: Phase 05 permits up to four sequential primary
launches with cancellable 10/20/30-second backoff, followed by one configured
backup; no other CLI operation retries. Compatibility paths must be explicit and
transition-only; they must not mix Python and TypeScript mutations in one atomic
operation. Unknown failures become stable sanitized errors; raw paths, child
stderr, credentials, and stack traces do not cross the public boundary.

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
published once to `$HOME/.evcrate/bin/`. Its generated closure currently has 33
production files: the original 29 CJS files plus four generated CommonJS runtime
modules under `lib/advisor/generated/`. It reads the user-owned
`$HOME/.evcrate/advisor-routing.json`; policy is never generated or published.

### Portable advisor contract runtime
Phase 01 prepares an exact four-file TypeScript protocol closure boundary:

- `src/protocol/advisor-contract-runtime.ts` is the portable implementation.
  Keep it free of `node:*` imports, process/HOME/filesystem access, and crypto;
  it may use the existing protocol JSON primitives. Validators return
  deep-frozen values and throw `AdvisorContractError` with stable code/path data.
- `src/protocol/advisor-contracts.ts` owns state v1 declarations and re-exports
  the runtime; do not recreate advisor wire types or constants here.
- `src/protocol/advisor-settings.ts` is the control-plane adapter. Delegate
  shared route/wait/history/policy validation, then map runtime failures to
  `<code>SETTINGS_INVALID</code>` without leaking neutral error details.
- `src/protocol/index.ts` is the public protocol barrel and must export the
  runtime alongside existing protocol modules. Root `src/index.ts` reaches it
  transitively.

The Phase 01 boundary is source/export preparation, not a replacement for the
installed advisor controller closure. Preserve the exact 33-file CJS closure,
while retaining dated 29-file release evidence unchanged. Keep valid/invalid
contract fixtures and focused protocol tests synchronized with exported
validators.

### Phase 02 metrics kernel and generated CJS adapters

- `src/protocol/advisor-metrics.ts` is the single portable history-metrics
  implementation. Its pure exports are `normalizeHistoryRecord`,
  `normalizeHistoryFilter`, `filterHistoryRecords`, `nearestRankPercentile`, and
  `calculateHistoryMetrics`; callers provide `generated_at`.
- Normalize IDs before grouping. Invalid execution records do not enter a
  population. Byte-identical duplicate identities may collapse; conflicting
  copies exclude every copy and emit `DUPLICATE_IDENTITY`. Return values remain
  deeply frozen.
- Filters are the exact ten-key wire shape. `null` is unconstrained; values are
  OR-within and AND-across; positive `started_at_from`/`started_at_to` bounds are
  inclusive. Ratios and means round to six decimals and use `null` on a zero
  denominator; latency uses terminal receipt elapsed time and nearest-rank
  percentiles.
- The digest compatibility contract is not canonical JSON: validate without
  reconstruction or key sorting, preserve insertion order, hash UTF-8 bytes of
  `JSON.stringify(validatedCheckpoint)`, and emit lowercase SHA-256 hex. Node
  crypto and browser Web Crypto adapters must hash identical bytes.
- `tsconfig.advisor-runtime.json` and `npm run generate:advisor-runtime` emit
  exactly `canonical-json.js`, `json.js`, `advisor-contract-runtime.js`, and
  `advisor-metrics.js` under `lib/advisor/generated/`. Generated output is
  literal-relative CommonJS, dependency-free, and never hand-edited.
- `contracts-v2.cjs` retains Node hashing, advice parsing, state delegation,
  export names, and existing boundary mappings. `policy-schema.cjs` retains
  enabled-backend decisions, legacy inspection/migration, parse/decode exports,
  and route error codes while delegating shared validation.

Policy v2 has exact top-level keys `version`/`advisor`/`wait`/`history`.
`advisor` has distinct `primary`/`backup` route triples
(`backend`/`model`/`effort`); wait mode is `until_terminal` with warning bounds
`1000..3600000` ms; history is `1..365` days and
`1048576..1073741824` bytes. Keep the 16 KiB policy limit and strict
UTF-8/JSON, duplicate-key, credential, unknown-field, unsafe-path, owner, and
mode checks. Candidate backends are `claude`, `codex`, `antigravity`, `pi`,
and `omp`; enabled backends are `claude`, `codex`, `pi`, and `omp`. Gemini and
Copilot are not controller backends.

Legacy host-v1 and single-target-v1 policy is read-only migration input. Settings
`get` may return a `migration_required` view; execution rejects legacy policy.
Use `get -> operator prepares v2 -> preview -> apply`. Preserve revisions,
single-use preview authorization, owner/mode checks, byte-safe journal recovery,
and stale-token rejection. Never auto-write HOME, guess a backup, or place
credentials in policy. Settings request/result, journal, and preview schemas
remain v1 while carrying policy v2.

The v2 direct checkpoint binds task/run/checkpoint/phase identity and revisions
to bounded task, proposal, evidence, and prior fields. The v2 result requires
exactly seven body fields: `recommendation`, `rationale`, `must_fix`,
`cautions`, `assumptions`, `success_checks`, and `unresolved_questions`. The
v2 controller envelope carries bounded attempt summaries, build identity,
sanitized errors, and audit status. State/execution/outcome records are schema
v1 and owner-only. Keep paths metadata-only; the controller does not read
arbitrary checkpoint paths.

The canonical mentor instructions are authored in
`.claude/skills/advisor-strategy/references/brief-contract.md` and generated
into the standalone `runtime-brief.generated.cjs` closure artifact. V2 prompt
packaging uses `formatMentorPrompt` with explicitly quoted checkpoint data.
For v2 checkpoints, enabled adapters pass extracted assistant text to the shared
`parseAdviceBody` parser; malformed, fenced, prose, unknown-field, or
incomplete bodies fail closed.

The compatibility v1 controller path remains one target/one attempt; v2 now
uses generated prompts, structured result normalization, and v2 identity
linkage. Phase 05 v2 execution permits up to four sequential primary launches
and one configured backup, with cancellable bounded backoff. Generation has no
generation deadline, while streams, output, termination, and adapter probes
remain bounded. Task gates and history commands are explicit managed operations,
not behavior inferred from validator presence. Runner calls still use
`shell:false`, fixed allowlisted argv/environment, stdin-only prompts, bounded
streams, detached POSIX groups, TERM/KILL cancellation, and descendant reaping.

### Sanitized history and outcome records

Phase 07 history is optional rich audit, never required task-state authority.
Keep version-1 `execution.json` and `outcome.json` records strict, sanitized,
owner-only, and bounded to 128 KiB and 64 KiB respectively. Store them under
`$HOME/.evcrate/advisor-history/<project-id>/<task-run-id>/<consultation-id>/`;
directories are `0700`, files are `0600`, and Linux descriptor pinning prevents
ancestor swaps. Use the shared state I/O ownership, identity, atomic-write, and
lock primitives; do not create an append-only stream or database.

Record execution as `started` before model launch, update bounded attempt facts,
then settle exactly once as <code>ADVICE_READY</code> or <code>FAILED</code>.
Terminal settlement must recheck consultation/task/checkpoint identity and the
original bytes before CAS replacement. Record outcomes only with linked
consultation/task identity, validated disposition, evidence revision, actual
changed paths, validation, result, and correction number; identical replays are
idempotent, conflicting records fail closed.

History writes must never launch another model, reset required state, or turn
usable inference into failure. Surface `audit_status: "degraded"` when optional
storage is unavailable. `history list` is metadata-only and project-scoped;
`show` sanitizes ANSI/control text; `export` requires an explicit safe,
non-existing destination and reports redaction findings; `prune` supports
dry-run/apply retention and quota cleanup, oldest terminal records first, while
protecting active or foreign-project records. Never retain credentials, hidden
reasoning, raw stderr, or raw vendor logs.

### History metrics CLI integration (Phase 04)

Keep `history metrics` read-only, current-project scoped, and unlocked. Parse one
bounded v1 request with exact keys; `project_id: null` means the invocation
project, and a supplied ID must match. Apply optional task scope before the
shared generated metrics kernel, then apply its exact ten-key filters. Do not
reimplement formulas, sorting, or duplicate handling in CommonJS.

The collector must normalize validated execution/outcome pairs, exclude invalid
execution records, preserve missing/invalid/unknown outcomes, and return bounded
relative-path diagnostics plus bytes, counts, completeness, and limitation
codes. Absolute HOME/cwd paths, raw advice, credentials, stderr, and hidden
reasoning never cross the output boundary. Return one
`evcrate-advisor-history` v1 result with `operation: "metrics"` and
`HISTORY_READY`; malformed requests remain sanitized `REQUEST_INVALID` failures.
Existing list/show/export/prune request shapes, locks, sanitization, and results
remain unchanged.


### Browser viewer history I/O (Phase 05)

Keep browser history access separate from the Node controller boundary:

- Select only explicit user-granted handles with `showDirectoryPicker`/`read`
  permission. Do not infer HOME, walk parents, persist handles, upload/archive
  data, or mutate history and policy.
- Traverse only the selected project/history root's sorted
  project/task/consultation levels and direct `execution.json`/`outcome.json`
  files. Treat unexpected entries and concurrent changes as diagnostics.
- Enforce `history-scan-budget.ts` limits before scheduling reads. Keep the
  four-worker queue, 64-record yield cadence, 4,096 retained-diagnostic cap, and
  explicit incomplete status; never present a bounded partial sample as fresh.
- Decode fatal UTF-8, parse strict JSON, validate through shared v1 contracts,
  check directory/record identity, and normalize through `advisor-metrics.ts`.
  The browser digest must hash insertion-order checkpoint JSON with Web Crypto
  SHA-256 so Node and browser identities remain byte-compatible.
- `history-reader.ts` owns monotonic generation and cancellation. Replace only
  complete or complete-with-errors scans; retain the prior snapshot as stale for
  limits, permission/traversal failures, cancellation, or stale generations.
- `policy-reader.ts` is read-only: enforce the 16 KiB bound, delegate v2/legacy
  classification to `inspectPolicy`, and expose migration-required/invalid
  statuses without rewriting the selected file.

The full source map and budget table are in [Browser History Scanner](./browser-history-scanner.md).


### Phase E00 advisor-plugin domain data API

`src/protocol/advisor-plugin-data-api.ts` is the single TypeScript authority for
`evcrate-advisor-data` v1; `src/protocol/index.ts` is its public barrel. Keep the
method set exact: `history.refresh`, `history.summary`, `history.page`,
`history.detail`, `policy.readCurrent`, `evaluations.list`, `evaluations.read`,
and `evaluations.compare`. Domain params never accept actor, installation,
grant, HOME, target-path, or binding overrides; generic host context supplies
authorization.

Validators must reject unknown keys before dispatch, preserve discriminated
changed/missing/unavailable states, check UUID/SHA-256 identity and positive
safe-integer timestamps, and return frozen values. Keep the published limits
aligned: opaque IDs 128 bytes, cursors 256 bytes, history pages 500 rows,
evaluation pages 100 rows, page results 1 MiB, frames 16 MiB, controls 64 KiB,
evaluation documents 8 MiB, and compare requests 32 items.

`scripts/generate-advisor-plugin-data-schema.mjs` is the only schema-generation
authority. It writes `plugin/contracts/evcrate-advisor-data-v1.schema.json` and
`contract-manifest.json`; `--check` must pass before publication. Never hand-edit
these outputs. Keep positive/negative wire, path/worktree identity, and golden
insertion-order digest fixtures synchronized with both protocol parity suites.

`plugin/contracts/read-closure-feasibility.json` is the E00 G0 feasibility
authority, not an extraction implementation. Its read closure permits only
`node:fs`, `node:path`, and `node:crypto`; mutation, model/process/network, and
workspace modules stay outside it, and the expected controller inventory delta
is zero. E01 must revalidate the graph before a clean caller cutover.

Transport/provider code must enforce raw byte ceilings before JSON deserialization
to avoid unconstrained allocations. Current review follow-ups remain to normalize
metric-filter failures to `PluginDataApiError` and recursively validate compare
groups once the UI shape is stable.

### Phase E02 framed Node plugin worker

`plugin/backend/worker.cjs` is the only worker entrypoint. Use the pinned D00
SDK for four-byte big-endian framing, strict UTF-8 JSON-RPC 2.0 validation, and
frame limits; never duplicate generic framing or accept batches/numeric IDs.
Check payload ceilings before allocation. stdout is protocol frames only; all
operational data goes through the bounded sanitized stderr logger.

Keep the worker private and runner-owned: no listener, shell, child model
process, arbitrary filesystem discovery, mutation, credentials, or durable grant
registry. Require Node `>=22.19.0`. `runner.hello` gates all other methods and
must report protocol/SDK/manifest/data versions plus only implemented
capabilities. A repeated hello cancels requests and revokes old contexts.

Contexts are ephemeral, target-verified, revision-tagged, and operation-limited:
maximum 16 contexts/worker, 4 operations/context, 300-second idle TTL by the
current SDK budget. Every invoke checks context, allowed operation, policy flag,
and supplied activation/binding/grant revisions; stale revisions cancel work
and revoke the context. The host remains the durable authorization authority.

Request admission is bounded to 16 active operations and queue 32, with one
history refresh and one evaluation parse active per worker. Map one request ID
to one `AbortController`/SDK cancellation token. Deadlines and cancellation
must settle the original invocation exactly once; queued settlement must not
decrement active counters. Do not retry or replay after cancellation, reconnect,
or worker restart.

Map provider/internal failures to the D00 safe error taxonomy. Redact paths,
long token-like values, credentials, source bytes, raw stderr, and stacks; keep
only allowlisted detail keys. Domain status unions are valid results, not
exceptions. Unexpected failures become `WORKER_FAILED` and terminate through
runner recovery semantics.

`plugin/backend/data-api.cjs` is the package-local E00 validator closure.
`plugin/manifest.json` inventory and
`scripts/build-advisor-plugin-candidate.mjs` are generated/validated package
authority: deterministic backend-only candidate for G1, not E04 release or root
exact-seven assets. See the [worker guide](./advisor-plugin-worker.md).

### React Explorer, evaluation, and packaging standards (Phases 06–10)

- **Pure client state**: The React viewer (`viewer/src/`) is a client-side state machine. State transitions (`idle`, `scanning`, `fresh`, `stale`, `error`) must never execute model calls, mutate disk files, write to browser persistence or cookies, or infer file paths.
- **Inert rendering and security**: Render all user-controlled data (prompts, counsel text, error messages, evaluation metadata) as inert text. Never use `dangerouslySetInnerHTML` or create active external links. Strict CSP (`connect-src 'none'; object-src 'none'; frame-ancestors 'none'`) must be enforced on preview and development servers.
- **Accessibility and responsiveness**: Use semantic HTML, explicit ARIA attributes (`aria-label`, `role="tab"`, `role="tabpanel"`), visible focus rings (`:focus-visible`), and full keyboard navigation (Tab, Shift+Tab, Enter, Space). Layouts must remain functional on both desktop and narrow viewports.
- **Evaluation reader boundary**: Untrusted `evcrate-advisor-counsel-evaluation` v1 JSON documents are loaded via an explicit multi-file picker bounded to 8 MiB per selection. Evaluations are strictly isolated: they never merge with consultation history, modify disk records, or affect production metrics.
- **Generated runtime and inventory authority**: Never hand-edit `lib/advisor/generated/*.js`, `src/manifests/controller-inventory.generated.ts`, `viewer/dist/`, or root build manifests. Regenerate via `npm run prebuild` or `npm run generate:all`.
- **Package and release boundaries**: Root `package.json` must maintain zero production dependencies; viewer dependencies (`react`, `react-dom`, `vite`, `@playwright/test`) remain development-only. Controller inventory remains exactly 33 files. Release directory `dist/release/` remains exactly seven assets; viewer build assets are packaged inside platform release archives, never as a separate release asset.
- **Explicit non-claims**: The explorer provides descriptive visualization only. It makes no POSIX filesystem attestation (`0600` permissions, ownership, symlink authenticity), complete lifetime audit coverage, causal effectiveness, cost, or saved-time claims.
See [system architecture](./system-architecture.md) for complete wire shapes,
limits, closure, adapter boundaries, and support claims.

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
- Require real owner-controlled directories for managed roots and ancestors.
  Filesystem directories do not restrict or limit user permissions via strict
  mode bitmasks; they allow standard user permissions without failing closed.
  Never chmod or replace unrelated HOME or project data.
- **Preflight before mutation**: Perform complete path normalization, ancestor verification,
  owner control checks, intra- and cross-target overlap detection, and same-volume
  verification before any destination reads, writes, or staging.
- **Two-phase project transactions and locking order**:
  1. Acquire HOME publication lock.
  2. Preflight shared controller and project harness destinations.
  3. Commit shared controller to `<home>/.evcrate/bin` on the HOME volume.
  4. Acquire project workspace lock (HOME lock held, never reversed).
  5. Apply harness projections to `<project-root>`.
  6. If harness application fails: roll back only project workspace changes. Shared
     HOME commit is never rolled back or compensated.
  7. Release project lock, then release HOME lock.
- Stage on the destination volume. Record device/inode/size/mode/digest snapshots
  and compare them before every backup/promotion rename.
- Write journals, markers, policy bytes, and lock metadata through owner-only atomic
  temporary files; flush metadata where supported.
- **Scope-isolated recovery**: Recover only validated, owner-controlled, contained journal
  paths matching the requested scope (`--scope home` reads only HOME state;
  `--scope project` validates canonical `projectIdentity` and reads only
  `stateRoot/project-publication/<canonical SHA-256 identity>`). Restore the complete
  prior set for an interrupted transaction; leave unexpected state and user data
  untouched. Recovery never crosses scope boundaries.
- Publication, scope, and advisor-settings locks are separate transactions. Lock
  release requires matching token and device/inode identity; uncertain release
  leaves state for recovery.

Advisor settings uses `advisor-settings.lock`, single-use preview tokens, durable
prepared/backed-up/promoted journals, revision/CAS checks, and whole-document
atomic apply. It never joins scope or target-publication atomicity.
## Build, closure, and release standards

`scripts/generate-controller-inventory.mjs` is the source of the generated
33-file controller inventory, including the four generated runtime modules.
`npm run generate:advisor-runtime` runs before inventory generation in `prebuild`.
`scripts/build-manifests.mjs` invokes the TypeScript local-build path for each
persisted target and the aggregate set. Build manifests are schema 2 and carry
`source_hashes`, `adapter_hashes`, `controller_hashes`, `owners`, `output_hashes`,
`validation`, and `home_policy`.

Build/check must verify complete validation, current hashes, regular non-symlink
files, canonical entrypoint mode/shebang, and no missing/extra/foreign closure file.
Publication consumes only a current verified build and preserves unmanaged roots.
`install.sh` and `install.ps1` embed the same code-point-sorted 33-file list;
changes to the generated inventory require parity updates in both installers.
The manifest contract suite covers exact count/hash parity and rejects viewer or
external-package entries; dated 29/29 evidence remains unchanged.
Linux x64 is the qualification boundary for full CLI runtime behavior. Windows
qualification is complete through Phase 10 (10/10 phases, 100%; completed
2026-09-15) and is strictly bounded to the standalone installer lifecycle
(`install`, repeat-install, `repair`, upgrade, `rollback`, `uninstall`) and
`version --json` on hosted `windows-2025` x64 across PowerShell 5.1/7 and Node
22.19.0/24.21.0. Windows runtime commands (`publish`, `health`, advisor execution,
and process-tree parity) remain Linux-only operator-gated behavior. Desktop/signing/
policy environments, live vendor qualification, npm publication, deployment, and
rollout remain explicitly excluded.
### Windows fixture and predecessor standards (Phase 04)

- Build Windows fixtures through `buildReleaseArchives` and the real
  `install.ps1`; share sorted-record, inventory/controller/build-manifest digest,
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

The focused orchestration suite covers clean/dirty checkout, no-release and
release paths, mirror cleanup, receipt/tamper checks, exact outputs, and
verify-only publication. Its Phase 06 review records 12/12 orchestration tests
and 29/29 `npm run test:release` checks passing.

### Release workflow producer, matrix, and publisher standards (Phase 07)

- Keep `.github/workflows/release.yml` read-only by default; grant GitHub write scopes only to the success-gated publisher.
- Preserve the producer's ordered Linux gates before candidate creation; a no-release result must not upload or trigger downstream jobs.
- Route matrix and publisher bytes by exact `artifact_id`, never by artifact name or digest; keep the receipt and producer hashes as verification authorities.
- Keep the native matrix fixed at `windows-2025` x64 with PowerShell 5.1/7 crossed with Node `22.19.0`/`24.21.0`; use `fail-fast: false`.
- Matrix jobs consume the artifact-carried harness without checkout/npm. The publisher checks out the exact source SHA, copies only seven assets, and uses verify mode.
- Pin every action to a full commit SHA with its version comment. Pass workflow expressions through step `env:` blocks rather than interpolating them in shell scripts.


### Windows release qualification and installer safety standards (Phases 03, 08, 10)

- **Installer safety protocol**: Standalone `install.ps1` must enforce strict root containment (`Assert-ContainedPath`), reparse-point ancestor rejection (`Assert-NoReparseAncestor`), exclusive delete-on-close locking (`Acquire-InstallLock` with random token), snapshot verification, and safe rollback/repair/uninstall lifecycles without touching unmanaged data. Never recommend `-ExecutionPolicy Bypass`.
- **Exact-set verifier authority**: `scripts/release/asset-verification.cjs` is the sole release-set verifier. Exact-seven (`verifyReleaseAssetSet`) and exact-four (`verifyWindowsAssetSet`) reject missing, extra, directory, symlink, hash, size, and metadata mismatches without byte repair.
- **Workflow permissions and isolation**: Producer is read-only (`contents: read`); matrix rows run unprivileged; publisher is the sole write-capable job (`contents: write`). Publisher must never rebuild assets or publish on failure/cancellation (<code>always()</code> is strictly banned). Downstream jobs consume the exact `artifact_id` handoff.
- **PR smoke boundary**: `windows-smoke.yml` runs diagnostic smoke on `windows-2025` x64 with PowerShell 7 and Node `22.19.0` using checked-in version/SHA fixtures (`--allow-fixture-identity`); it has zero secrets, write permissions, or release handoff authority.
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

- Keep Markdown files below the repository limit of 800 lines; keep README strictly
  below 300 lines. Split oversized historical/reference topics into linked documents
  instead of exceeding either limit.
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
- [Project changelog archive](./project-changelog-archive.md)
- [Pi-native migration](./pi-native-migration.md)
- [Browser history scanner](./browser-history-scanner.md)
