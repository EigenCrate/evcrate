# Codebase Summary

**Generated:** 2026-09-13
**Source:** Fresh repository compaction produced by Repomix v1.18.0 at
`repomix-output.xml`; `.repomixignore` excludes tests, plans, and docs, which were
checked directly for Phase 09 evidence and documentation consistency.
**Purpose:** Compact navigation map, not a copy of the compaction.

The repository is a private Node/TypeScript package. `package.json` declares
`evcrate` version `2.0.0`, Node `>=22.19.0`, the `evcrate` bin at
`dist/cli/evcrate.js`, and the `evcrate-advisor` bin at
`.evcrate/source/.evcrate/bin/evcrate-advisor`.

## Source-of-truth map

```text
.evcrate/source/.claude/       canonical harness resources
.evcrate/source/.evcrate/bin/  shared CommonJS advisor controller source
.evcrate/targets/              schema-2 target manifests and overlays
.evcrate/registry.json         schema-1 canonical resource registry
src/                           TypeScript control plane
scripts/                       inventory, manifest, and release tooling
tests/                         focused contract and acceptance suites
README.md                      package entry point
docs/                         maintained project documentation
```

Generated target roots under `.evcrate/source/` are `.agents`, `.codex`,
`.gemini`, `.antigravity`, `.pi`, `.omp`, and `.copilot`. They are build outputs;
maintainers change canonical resources or target overlays and rebuild instead of
editing them. `distribution/` and `pi_adapter/` are not active source modules in
the current scoped inventory and should not be described as runtime engines.

## Canonical catalogs and scanner contracts (Phase 02)

Phase 02 freezes the committed command/skill inputs, retires the legacy
`power_level` field, and adds source-derived freshness validation. See the
[Phase 02 plan](../plans/260906-2300-scan-command-skill-catalogs/phase-02-catalog-data-schema-and-freshness.md),
[test report](../plans/reports/tester-260907-0152-catalog-regression-freshness.md),
and [code review](../plans/reports/code-review-260907-0153-phase-02-catalog-schema-freshness.md)
for scope and evidence.

### Frozen committed-record schema

The scanner data files are strict, ordered YAML lists. Every mapping must have
exactly the listed keys in the listed order. Unknown, missing, duplicate, or
unsafe records are rejected by validation; `--freshness` additionally rejects
stale records without generating output:

| Input | Exact keys and types | Required invariants |
|---|---|---|
| `commands_data.yaml` | `source`, `name`, `path`, `description`, `argument_hint`, `category` — all strings | Every field except `argument_hint` is non-empty; `source` and `path` are normalized relative POSIX paths; `name` starts with `/`; category is allowlisted; `source`, `name`, and `path` are unique. |
| `skills_data.yaml` | `source`, `name`, `path`, `description`, `category` — strings; `has_scripts`, `has_references` — booleans | The five strings are non-empty; both flags must be actual booleans; `source`, `name`, and `path` are unique; `template-skill` and unmanaged entries are excluded. |

`source` is the stable canonical relative identity used for adapter and
freshness joins. `name` and `path` describe the target-native representation.
The canonical inputs currently contain 70 commands and 36 non-template skills.
The retired `power_level` field is not accepted by the exact-key validator and
does not appear in the committed command data.

`generate_catalogs.py` consumes the six-/seven-key input records and removes
only `source` from grouped presentation entries. Consequently, generated
`commands` entries have five keys and generated `skills` entries have six;
`source` remains in the committed `*_data.yaml` inputs for identity and
freshness checks.

### Scanner and generator behavior

- `scan_commands.py` defines the frozen command-layout contract: root, format
  (`markdown`, `toml`, or `command-skill`), optional output, managed entries,
  and target name-map/resolver bindings. Strict parsers require valid metadata,
  UTF-8, managed-entry coverage, and unique command names.
- `scan_skills.py` defines the frozen skill-layout contract for root, output,
  managed entries, exclusions, and source mapping. It preserves arbitrary
  nesting in skill names and rejects missing, unsafe, symlinked, or duplicate
  managed entries.
- Both scanner CLIs resolve roots and adjacent data outputs from
  `Path(__file__).resolve()`, so repository-root, script-directory, and
  unrelated temporary-CWD invocation use the same authoritative paths.
- Scanner writes use an adjacent temporary UTF-8 YAML file followed by atomic
  replacement; temporary files are removed on success and failure. Generator
  `--output` writes, flushes, `fsync`s, closes, and atomically replaces the
  destination only after complete validation. A failed generation leaves an
  existing destination unchanged.

### Path safety and freshness

`generate_catalogs.py` validates every `source` and `path` as a normalized
relative POSIX path. It rejects non-strings, empty values, embedded NUL bytes,
backslashes, absolute paths, `./` prefixes, empty/dot/dot-dot segments, and
non-canonical POSIX spellings. This embedded-null defense prevents poisoned
metadata from reaching filesystem operations.

`generate_catalogs.py --freshness` reloads and validates both committed data
files, scans the authoritative canonical command and skill roots in memory, and
deep-compares sorted records (including source, native name/path, metadata, and
flags). It exits successfully only when the committed inputs match the live
scans; a count, identity, or field mismatch exits 1 with concise stderr and
does not write output.

`test-scan-catalogs.py` covers canonical counts, all three command formats,
Unicode and deep nesting, managed allowlists, malformed input, duplicate and
unsafe identities, NUL-byte paths, sentinel preservation, CWD independence,
schema validation, freshness, generated totals, and atomic output (7/7 suites
passed in the Phase 02 evidence). `test-evcrate-help.py` remains independent
from scanners and generated data (19/19 suites in the same evidence).

## Seven-target scanner and catalog adapters (Phase 03)

Phase 03 moves catalog projection into shared TypeScript code while keeping the
projected Python scanners runnable in every registered target. `catalog-types.ts`
defines the exact command/skill record keys, category allowlists, safe POSIX-path
predicate, scanner-layout shape, YAML parser, and deterministic serializers.
`catalog-data.ts` validates canonical records, applies each adapter's existing
source-to-native mapping, verifies every mapped file is a staged regular file,
and writes target-native `commands_data.yaml`, `skills_data.yaml`, and
`scanner-layout.json` as one projected catalog set.

The generated sidecar uses schema `evcrate-scanner-layout-v1`. It declares the
target, command format/root/output/authority, and skill root/output/authority.
`scan_commands.py` supports Markdown, TOML, and command-skill inputs; it resolves
the sidecar and authority from its own `Path(__file__)`, restricts traversal to
allowlisted managed entries, rejects missing/unsafe/duplicate mappings, and
atomically replaces adjacent YAML output. `scan_skills.py` uses the same
path-derived layout, supports target source maps and explicit exclusions,
preserves nested names, and applies the same fail-closed/atomic boundary. A
foreign current working directory therefore cannot change scanner roots or
outputs, and unrelated user files in native roots do not enter EVCrate catalogs.

Each adapter supplies its existing conversion authority instead of inventing a
second naming registry:

| Target | Command representation | Catalog authority |
|---|---|---|
| Claude | Recursive Markdown | Canonical resource graph/data set |
| Gemini | Recursive native TOML | Migration behavior matrix |
| Antigravity | `cmd_*` command-skills | Migration behavior matrix |
| Codex | `cmd-*` command-skills | Migration inventory and skill metadata |
| Pi | Archived recursive Markdown | `inventory.json` and native skills |
| OMP | Flattened `cmd-*.md` | `evcrate-omp-command-map-v1` |
| Copilot | Prefixed command-skills | `evcrate-copilot-command-map-v1` and migration inventory |

OMP now loads its generated command map at runtime rather than depending on
canonical source-string rewrites. Gemini, Antigravity, Codex, Pi, and Copilot
retain their native command/skill transforms, hook/runtime wrappers, and
advisory capability boundaries while exposing the resulting paths to the
scanner. Claude remains the canonical scanner/data owner; all seven targets
receive the same scanner scripts, generator, README, data files, and layout
contract.

Phase 03 evidence records a clean TypeScript build, 10/10 adapter contract
tests, 1/1 Python-parity test, 7/7 scanner/catalog regression suites, and
19/19 independent `ev-help.py` tests. The all-target contract runs cover
foreign-CWD execution, native regular-file resolution, unmanaged-resource
isolation, duplicate/missing authority entries, unsafe paths, and preservation
of existing catalog bytes on failure. See the
[Phase 03 plan](../plans/260906-2300-scan-command-skill-catalogs/phase-03-seven-target-scanner-and-catalog-adapters.md),
[test report](../plans/reports/tester-260907-0959-phase-03-seven-target-adapters.md),
and [code review](../plans/reports/code-review-260907-1004-phase-03-seven-target-scanner-and-catalog-adapters.md).

## Regeneration, documentation, and release gates (Phase 04)

Phase 04 is complete as of 2026-09-07. The canonical scripts README now records
the exact command/skill schemas, `evcrate-scanner-layout-v1` bindings, target
formats and authorities, CWD-independent invocation, managed-only ownership,
atomic/fail-closed writes, generator modes, and the release sequence. It also
keeps `ev-help.py` explicitly independent from scanners and generated catalogs.
See the [Phase 04 plan](../plans/260906-2300-scan-command-skill-catalogs/phase-04-regeneration-documentation-and-release-gates.md),
[validation report](../plans/reports/tester-260907-1123-phase04-validation-matrix.md),
and [final post-fix review](../plans/reports/code-review-260907-1457-phase-04-final-post-fixes.md).

### Generated ownership and scanner parity

- `npm run distribute:build` is the regeneration authority for all seven target
  projections, native `commands_data.yaml`/`skills_data.yaml`, scanner sidecars,
  migration authorities, and the aggregate plus seven target manifests. These
  outputs are never hand-edited.
- `catalog-types.ts` freezes exact record keys, category allowlists, safe
  relative POSIX paths, scanner-layout shape, multiline/quoted YAML parsing, and
  deterministic serialization.
- `catalog-data.ts` validates canonical records, applies existing adapter
  mappings, verifies mapped native files are regular non-symlink files, extracts
  target-native descriptions and argument hints, and projects the sidecar plus
  both catalogs as one set.
- Antigravity exposes `cmd_*` command-skills and a migration-behavior authority;
  its adapter excludes generated catalog inputs from resource copying before
  writing the target scanner layout.
- Python scanners use the same sidecar/authority contract as TypeScript. They
  support Markdown, TOML, and command-skill formats, keep PyYAML output
  unwrapped for byte parity, restrict scans to managed entries, and atomically
  replace adjacent data files. Foreign CWD execution cannot change roots or
  outputs; unrelated user resources remain excluded.

### Release gate sequence

The completed gate order is: canonical scanner/help suites; TypeScript build;
adapter, parity, manifest, and publication tests; `npm run distribute:build`;
both scanners and both generator modes from an unrelated temporary CWD for all
seven target script roots; then `npm run distribute:check`. The smoke compares
catalog bytes, native names/paths, authority maps/inventories, actual managed
regular files, and unrelated-resource exclusions before and after execution.

The Phase 04 validation report records 85/85 focused assertions and 35/35
foreign-CWD scanner/generator invocations. The final post-fix review records
14/14 foreign-CWD scanners, live catalog freshness, all 14 npm test suites at
290/290, and `distribute:check` with `status: "ok"`. This proves repository
catalog/projection closure only; live vendor qualification, Windows support, npm
publication, deployment, and rollout remain separate operator gates.

## Canonical scout-block hook and ignore policy

The canonical Claude scout hook lives under `.evcrate/source/.claude/hooks/`.
It protects context budget by matching extracted tool paths against the local
ignore policy. A recognized build/tooling segment skips only that segment's path
extraction; every later or chained segment is still checked. Blocked candidates
retain exit status `2`, while existing fail-open handling remains for malformed
JSON and unexpected hook errors.

The canonical `.evcrateignore` and matcher fallback defaults contain the same
twelve heavy-directory rules, all with trailing `/`: `node_modules/`, `dist/`,
`build/`, `.next/`, `.nuxt/`, `__pycache__/`, `.venv/`, `venv/`, `vendor/`,
`target/`, `.git/`, and `coverage/`. Directory-only rules block directory
operands and descendants (`build/`, `apps/web/build/out.js`) without blocking
bare lexical command tokens such as `build`; legacy custom bare patterns retain
their prior behavior.

| File | Responsibility |
|---|---|
| `hooks/scout-block.cjs` | Splits commands into shell segments, strips leading environment assignments and grouping wrappers, recognizes anchored package/language/tool runners, preserves virtual-environment execution allowance, and evaluates each non-exempt segment. |
| `hooks/scout-block/path-extractor.cjs` | Performs quote/escape-aware segment scanning, classifies runner syntax versus operands, extracts exploration paths, detects shell substitutions conservatively, and preserves or adds directory trailing `/` markers. |
| `hooks/scout-block/pattern-matcher.cjs` | Loads canonical or fallback policy, preserves directory-only rules and legacy custom patterns, and reports the original matching rule. |
| `hooks/scout-block/tests/test-path-extractor.js` | Unit coverage for tool-input paths, contextual command extraction, directory operands, quote handling, segment splitting, and environment-assignment cleanup. |
| `hooks/scout-block/tests/test-pattern-matcher.js` | Unit coverage for all twelve trailing-slash defaults, directory descendants, lexical near-matches, Windows separators, legacy custom rules, and negation behavior. |
| `hooks/scout-block/tests/test-build-command-allowlist.js` | Production `isBuildCommand` matrix for package managers, build tools, language runners, environment prefixes, malformed/substitution inputs, and direct directory commands. |
| `hooks/tests/test-scout-block.js` | End-to-end hook coverage for allowed builds, blocked generated/dependency exploration, adversarial chains, process substitution, broad patterns, and virtual-environment executables. |
| `hooks/tests/test-evcrateignore.js` | Canonical/custom policy integration, fallback equality, legacy rules, and byte-for-byte policy/backup restoration on completion or process termination. |
| `hooks/scout-block/tests/test-monorepo-scenarios.js` | Nested package, generated-directory, and deep path protection scenarios. |

Focused canonical runs on 2026-09-07 reported 299/299 passing assertions:

| Suite | Result |
|---|---:|
| `test-path-extractor.js` | 55 passed |
| `test-pattern-matcher.js` | 55 passed |
| `test-build-command-allowlist.js` | 95 passed |
| `test-scout-block.js` | 52 passed |
| `test-evcrateignore.js` | 9 passed |
| `test-monorepo-scenarios.js` | 33 passed |
Evidence: [Phase 04 test report](../plans/reports/tester-260907-0209-unblock-build-commands-phase-04.md) and [code review](../plans/reports/code-review-260907-0209-unblock-build-commands-phase-04.md).

The seven generated projection roots (`.agents`, `.codex`, `.gemini`,
`.antigravity`, `.pi`, `.omp`, `.copilot`) carry the canonical policy and hook
closure without drift.
The latest `npm run distribute:check` returned `status: "ok"` across all seven
registered adapters. Projected and published OMP runtime smoke returns `0, 0, 2, 2`
for allowed builds, an environment-prefixed build, a chained read, and a direct
generated-directory read. Build commands remain unblocked while heavy-directory
reads/searches stay blocked.

## TypeScript modules

| Area | Responsibility | Representative entry points |
|---|---|---|
| `src/protocol/` | Versioned JSON, canonical JSON, advisor v2/settings/diagnostic payloads, target IDs, resource/publication/scope wire shapes | `validation.ts`, `advisor-contracts.ts`, `advisor-settings.ts`, `diagnostic.ts`, `resource-payload-validation.ts` |
| `src/context/` | Immutable package/project/home/state/target context, project directory/document descriptors | `invocation-context.ts`, `target-registry.ts` |
| `src/manifests/` | Schema-2 target manifest loading, descriptor types, and controller authorization | `manifest.ts`, `registry.ts`, `controller.ts`, `types.ts` |
| `src/adapters/` | Seven fixed projection adapters, typed catalog projection, scanner layouts, and resource graph checks | `catalog-data.ts`, `catalog-types.ts`, `registry.ts`, `qualification.ts`, target subdirectories |
| `src/registry/` | Canonical scan, schema-1 records, compatibility and deterministic queries | `scanner.ts`, `schema.ts`, `store.ts` |
| `src/imports/` | Bounded external-source preview/apply and replay tokens | `preview.ts`, `apply.ts`, `handler.ts` |
| `src/scopes/` | Global/project assignment state, canonical project identity, inheritance, revisions, and CAS | `identity.ts`, `state.ts`, `mutations.ts`, `changes.ts` |
| `src/advisor-settings/` | User policy snapshots, transactions, lock, journal, preview token, and recovery | `policy-files.ts`, `coordinator.ts`, `transactions.ts`, `recovery.ts` |
| `src/distribution/` | Local build/check, hash verification, phase planning, staging, publication, recovery, Pi settings, cutover | `local-build.ts`, `build-resolution.ts`, `publication-plan.ts`, `publication-inventory.ts`, `publication-rules.ts`, `publication.ts`, `publication-recovery.ts`, `shared-json.ts`, `cutover.ts` |
| `src/filesystem/` | Safe paths, hashes, atomic operations, and locks | `paths.ts`, `hashing.ts`, `atomic.ts`, `locking.ts` |
| `src/cli/` | Argument parser, request files, dispatch, output, health, process runner, executable | `arguments.ts`, `dispatch.ts`, `main.ts`, `evcrate.ts` |
| `src/errors/` | Stable control-plane error types and exit mapping | `control-plane-error.ts` |
| `src/index.ts` | Side-effect-free public export surface | `index.ts` |

`src/protocol/validation.ts` owns the persisted target list
`claude`, `codex`, `gemini`, `antigravity`, `pi`, `omp`, `copilot`; `agy` is an
input alias only. `src/adapters/index.ts` registers all seven projection adapters,
while `src/adapters/registry.ts` rejects duplicates and missing implementations.

## CLI and build tooling

`package.json` scripts expose the current TypeScript path:

| Script/action | Role |
|---|---|
| `npm run build` | Runs controller inventory generation through `prebuild`, then TypeScript compilation. |
| `npm run generate:inventory` | Regenerates the controller inventory from the JavaScript closure list. |
| `npm run generate:registry` | Regenerates canonical schema-1 resource records. |
| `npm run generate:manifests` | Builds target and aggregate schema-2 manifests through `scripts/build-manifests.mjs`. |
| `npm run distribute:build` / `distribute:check` | Run compiled CLI build/check actions. |
| `npm run distribute:all` | Build and publish all selected targets through the TypeScript CLI. |
| `npm run distribute:pi`, `distribute:omp`, `distribute:copilot` | Select one projection target. |
| `npm run test:advisor-controller` and focused suites | Existing contract evidence; not a replacement for live vendor qualification. |

The compiled CLI accepts version, health, advisor-settings, resource, import, scope,
change, publish, recover, and distribution actions. There is no root
`distribute.py` in the current root inventory; old Python snippets are not the
canonical package path.

## Controller closure

The generated inventory in `src/manifests/controller-inventory.generated.ts` is
produced by `scripts/generate-controller-inventory.mjs`. It lists exactly these
29 production files under `.evcrate/source/.evcrate/bin/`:

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
lib/advisor/contracts-v2.cjs
lib/advisor/controller-envelope.cjs
lib/advisor/controller.cjs
lib/advisor/errors.cjs
lib/advisor/history-contract.cjs
lib/advisor/history-prune.cjs
lib/advisor/history-query.cjs
lib/advisor/history-store.cjs
lib/advisor/isolated-workspace.cjs
lib/advisor/json-document.cjs
lib/advisor/managed-checkpoint.cjs
lib/advisor/policy-schema.cjs
lib/advisor/profile.cjs
lib/advisor/runner.cjs
lib/advisor/runtime-brief.generated.cjs
lib/advisor/state-baseline.cjs
lib/advisor/state-contract.cjs
lib/advisor/state-human.cjs
lib/advisor/state-io.cjs
lib/advisor/task-state.cjs
```

The runtime brief artifact is generated from the canonical
`.claude/skills/advisor-strategy/references/brief-contract.md`; it is part of
the exact closure and is never hand-edited.

## Advisor mentoring brief and structured advice (Phase 04)

Phase 04 completed on 2026-09-08. The canonical
`.evcrate/source/.claude/skills/advisor-strategy/references/brief-contract.md`
owns mentor instructions. `scripts/generate-runtime-brief.mjs` extracts the
`## Canonical Runtime Mentor Instructions` block, computes its SHA-256 digest,
and emits the standalone
`.evcrate/source/.evcrate/bin/lib/advisor/runtime-brief.generated.cjs` artifact
with **CANONICAL_MENTOR_INSTRUCTIONS**, its digest, and the
`evcrate-advisor-v2-*` build identity. The controller never reads ambient
`.claude` or HOME skill files at runtime.

`checkpoint-contract.cjs` validates the v2 checkpoint, computes its digest, and
`formatMentorPrompt` packages the generated instructions followed by explicitly
quoted checkpoint data. The controller computes this prompt once and gives the
same `context.prompt` to the Claude, Codex, OMP (`omp-parser`), and Pi adapter
invocations; the adapters do not supply divergent mentor instructions. Each
adapter extracts raw assistant text from its transport and passes v2 output to
the shared `parseAdviceBody` parser.

The parser requires exactly seven semantic fields:
`recommendation`, `rationale`, `must_fix`, `cautions`, `assumptions`,
`success_checks`, and `unresolved_questions`. It accepts one JSON object only:
markdown fences, leading/trailing prose, missing or unknown fields, non-array
lists, control characters, and sensitive material fail closed. Field values may
contain ordinary prose, but raw stack-frame shapes are rejected for Node
(`at ... file:line:column`, `node:internal`), Python (`File "…", line N`), Go
(`goroutine N` or function-plus-`.go:N` frames), and Rust (`stack backtrace`
or hexadecimal `N: 0x… -` frames). Benign prose such as “Retry at new
checkpoint” or a standalone `worker.go:42` reference remains valid.

V2 envelope correspondence is independently validated. `validateEnvelopeV2`
recomputes the expected checkpoint digest with `computeCheckpointDigestV2`,
checks task/checkpoint identity and revisions, requires
`expected_build_identity` to equal `receipt.build_identity` when supplied, and
requires a successful attempt's route effort to equal `receipt.effort`.
`receiptV2`/the V2 builders also reject a build identity that differs from the
generated **ADVISOR_BUILD_IDENTITY**. V1 remains an explicit compatibility path;
Phase 04 adds no retries or provider switching.

Evidence: 118/118 advisor-controller tests passed in approximately 7.3 seconds;
`npm run build` and `npm run release:check` both exited 0 on 2026-09-08.
Astra's post-fix sign-off is 8/10; all four critical issues were resolved:
public digest/build-identity correspondence, strict builder build identity,
receipt-effort correspondence, and the refined multi-language
**RAW_STACK_PATTERN**. Sol mentor counsel records Phase 05 preconditions; no paid
mentoring-quality claim is made.

## Advisor retry orchestration (Phase 05)

Phase 05 completed on 2026-09-08. `controller.cjs` now runs an explicit,
sequential consultation state machine. It qualifies the configured primary route
before model launch, permits up to four primary launches, and applies
cancellable 10/20/30-second backoff after positively classified transient
failures. After four primary transient failures, or a route-local preflight skip
before any primary model launch, it qualifies the configured backup and invokes
it once; backup failures are terminal and never retried.

Trusted structured provider cooldowns use the larger of configured backoff and
cooldown; unsupported cooldowns above one hour fail closed. Cancellation during
backoff, non-retryable failures, or unconfirmed cleanup prevents later launches.
Every attempt records slot, phase, route, model-started flag, classification,
retry delay, and cleanup outcome, while serialized execution keeps at most one
model process active.

Qualification-to-spawn identity binding captures adapter capability and
executable identity. The controller rebuilds each invocation and rechecks its
executable and resolved path before spawn, so drift fails closed without a model
launch. A route-local primary preflight skip is recorded separately and preserves
the primary error if backup qualification fails. See the
[Phase 05 plan](../plans/260907-1208-advisor-mentoring-recovery-audit/phase-05-primary-retry-and-backup-orchestration.md)
and `tests/advisor-controller/retry-orchestration.test.cjs`.

Evidence: 140/140 advisor-controller tests passed and
`npm run release:check` exited 0.

## Advisor durable task state and correction gates (Phase 06)

Phase 06 completed on 2026-09-08 and was user-approved after two review cycles
and a senior mentor challenge. See the
[Phase 06 plan](../plans/260907-1208-advisor-mentoring-recovery-audit/phase-06-task-state-scope-and-human-handoff.md).
Six CommonJS modules under
`.evcrate/source/.evcrate/bin/lib/advisor/` provide durable task governance:
- `state-io.cjs`: Linux descriptor-pinned `/proc/self/fd` directory traversal,
  owner-only (0600 file / 0700 dir) permissions, token plus `/proc` start-time
  process locking, dead-process reaping without age-based TTL stealing, atomic
  replacement with `fsync`, and fail-closed crash handling.
- `state-baseline.cjs`: Selected file baseline capture (up to 32 paths, 16 MiB/file,
  64 MiB total) with streaming SHA-256 digests and Git status/index tracking.
  Conditionally runs bounded global cached raw-diff rename discovery
  (`git diff --cached --raw -z --find-renames`) when selected paths show index
  additions/deletions, retaining origin and binding both endpoints without
  widening worktree reads.
- `state-contract.cjs`: Strict `TaskStateV1` schema validation, replay ledger
  reconstruction, and request/payload parsing for all seven state operations.
- `task-state.cjs`: State transition service (`executeStateRequest`,
  `claimCheckpoint`, `attachControllerResult`, `preflightHumanDecision`). Enforces
  5-slot end-to-end ledger headroom at reservation, 3-cycle failed correction
  escalation to `needs_human`, one-use observed continuation, no-correction clean
  completion pathways, and Git index-aware outcome attribution.
- `state-human.cjs`: Cooperative local controlling-terminal (`/dev/tty`) challenge
  with randomized authorization string and signal cancellation propagation.
- `managed-checkpoint.cjs`: Wraps v2 inference so that a prior state reservation
  must be claimed before inference, and required terminal linkage is committed
  to disk before advice is emitted.

Evidence: 185/185 advisor-controller tests passed; `npm run build` and
`npm run release:check` passed against the generated 25-file controller closure.

`runController` accepts both the compatibility v1 checkpoint and the v2
checkpoint and keeps one correlation ID and one final envelope. Route
qualification uses finite `probe` mode; model attempts use `generation` mode
with no generation deadline. For v2, `formatMentorPrompt` supplies the generated
brief and quoted data, adapters parse the seven-field body, and the controller
emits the structured V2 result/envelope. Generation warnings report monotonic
elapsed time on `stderr`; input, streams, output, termination, and cleanup
remain bounded.

## Sanitized advisor history and outcome review (Phase 07)

Phase 07 completed on 2026-09-08. The four history modules extend the shared
advisor closure from 25 to 29 production files; the generated inventory remains
the authority. See the [Phase 07 plan](../plans/260907-1208-advisor-mentoring-recovery-audit/phase-07-audit-history-and-outcome-review.md)
and [QA evidence](../plans/reports/tester-260908-1344-phase07-final-verification.md).

- `history-contract.cjs` validates version-1 history requests and execution/
  outcome records, sanitizes display text, and detects credential/raw-output
  patterns before export.
- `history-store.cjs` stores
  `$HOME/.evcrate/advisor-history/<project-id>/<task-run-id>/<consultation-id>/`
  with owner-only directories/files. It pins Linux directory descriptors,
  serializes mutations with process-identity locks, enforces 128 KiB execution
  and 64 KiB outcome limits, and uses CAS/temporary-file identity checks for
  terminal settlement and idempotent outcome writes.
- `history-query.cjs` implements current-project metadata list pagination,
  validated show, and explicit non-existing-destination export with sanitized
  records and redaction findings. `history-prune.cjs` previews/applies retention
  and quota cleanup, oldest terminal records first, while protecting active
  records and unrelated projects.
- `controller.cjs` records a started snapshot before model launch, updates
  bounded attempt facts, settles <code>ADVICE_READY</code>/<code>FAILED</code>
  execution history, and reports `audit_status: "degraded"` without turning
  history failure into model retry or inference failure. `task-state.cjs` links
  disposition/outcome data to `outcome.json`.
- The managed CLI exposes `evcrate-advisor history list|show|export|prune`.
  Requests are strict, versioned, bounded, and project-scoped; prune supports
  dry-run/apply modes and the default policy is 30 days/100 MiB.

Evidence: targeted history suites pass 19/19; the full advisor-controller suite
passes 204/204 across 16 files. The Phase Lead/Senior Mentor review resolved all
seven final implementation items and approved Phase 07 unconditionally at 10/10.

## Cooperative mentoring across commands and harnesses (Phase 08)

Phase 08 completed on 2026-09-08. The canonical workflow contract now owns
checkpoint dispatch, task-state transitions, executor dispositions, correction
exhaustion, human handoff, and baseline-preserving change review. See the
[Phase 08 plan](../plans/260907-1208-advisor-mentoring-recovery-audit/phase-08-workflow-and-harness-gate-integration.md)
and [integration tests](../tests/adapters/phase08-mentoring-integration.test.mjs).

### Canonical dispatcher and real CLI lifecycle

`.evcrate/source/.claude/workflows/advisor-mentoring.md` is the single authored
contract for all named checkpoint consumers. The 16 canonical code, cook,
bootstrap, and fix command files reference the same
`evcrate-advisor-checkpoint/v2` dispatcher; none retains a v1 dispatcher reference.
Its required state sequence is:

```text
init (0 -> 1)
  -> checkpoint reserve (1 -> 2)
  -> controller claim/attach (2 -> 3 -> 4)
  -> state get (reads 4)
  -> disposition (4 -> 5)
  -> bounded work
  -> outcome (5 -> 6)
  -> complete (6 -> completed)
```
The controller's **ADVICE_READY** result is terminal advice only after the reserved
checkpoint is claimed and attached. `accept`, `reject-with-evidence`,
`need-evidence`, and `reconcile` are explicit executor dispositions; scope
authorization, evidence freshness, and actual changed paths remain required.
Concern-free advice uses a validated no-change outcome (`action_id: null`,
`episode_id: null`, empty changed paths) rather than inventing edits.

### Durable review/correction and baseline boundaries

`task-state.cjs` persists failed correction outcomes and computes exact
one-indexed ordinals 1, 2, and 3. The third failed correction enters durable
`needs_human`; `state human-decision` requires a fresh revision and cooperative
`/dev/tty` authorization before continuation, scope revision, or abandonment.
The executor's three-review-cycle cap is separate: it can request a user choice
without pretending that conversational approval satisfies durable correction
exhaustion. `state-baseline.cjs` captures selected file/Git identity and
post-change attribution; pre-existing user changes, untracked files, and
unrelated hunks are preserved.

### Seven-target mentoring capability matrix
`src/adapters/advisory.ts` exports **TARGET_MENTORING_CAPABILITIES**,
`renderMentoringCapabilities`, and `renderMentoringWorkflow`. Every registered
projection adapter renders the canonical mentoring markers into its target
workflow:

| Target | Mentoring | Write checks |
|---|---|---|
| Claude | supported | advisory-only |
| Codex | supported | advisory-only |
| OMP | supported | advisory-only |
| Antigravity | supported | advisory-only |
| Gemini | supported | advisory-only |
| Copilot | supported | advisory-only |
| Pi | supported | advisory-only |

Mentoring support means the target can invoke and consume the shared controller
contract. `advisory-only` write checks mean no universal pre-edit mediation claim;
missing host hooks do not disable mentoring. Projection markers are generated
output, not runtime proof of live vendor support.

Phase 08 integration coverage validates capability declarations, marker rendering,
all 10 canonical workflow JSON examples, real disposable-HOME CLI Path A and
Path B lifecycles, exact three-cycle ordinals and durable gate blocking, all 16
dispatcher references, and all seven projection adapters. Evidence is 279/279
tests; Lead Mentor approval is 10/10 and user approval is recorded.

## Historical advisor mentoring release packaging and staged cutover (Phase 09; 2026-09-08)

This historical Phase 09 synchronized target projections, controller closure parity,
standalone installers, and disposable-HOME publication/recovery runbooks. See the
[historical Phase 09 plan](../plans/260907-1208-advisor-mentoring-recovery-audit/phase-09-projection-publication-and-documentation-cutover.md).

### Key deliverables and parity

- **Controller closure parity (29 files)**: `scripts/generate-controller-inventory.mjs`
  emits `src/manifests/controller-inventory.generated.ts`, which drives `src/manifests/controller.ts`
  and `scripts/release/runtime-closure.cjs`. Standalone installer scripts `install.sh` and
  `install.ps1` are updated to match the exact 29-file list, resolving closure digest
  mismatches during unpack installation.
- **Projections and manifests synchronization**: All seven target projections are
  built with `npm run distribute:build` and verified with `npm run distribute:check`.
  Build manifests (`.evcrate/build-manifest-*.json`) and `.evcrate/registry.json` are
  regenerated and pinned with `npm run generate:all`.
- **Standalone unpack and installer verification**: Linux network-namespace testing
  via `tests/distribution/private-unpack-rollout.test.mjs` proves package hash invariance,
  network-isolated installation, clean-new/whole-old-backup mutable state semantics,
  and published target preservation upon uninstall. Subprocess installer tests in
  `tests/installers/*.test.mjs` validate archive checksum checks, controller closure
  digest verification, atomic locking, staging rollback, and pointer commit.
- **Publication and crash recovery**: Atomic publication testing under disposable HOME
  via `tests/distribution/publication-apply.test.mjs` and `tests/distribution/publication-recovery.test.mjs`
  proves CAS conflict prevention, idempotent journal recovery, and policy preservation;
  reviewer smoke tests confirm active/incomplete task state and history sentinels remain
  isolated and intact.
- **Operator runbook:** Explicit cutover, quiescence, settings migration, and
  rollback procedures live in `docs/system-architecture.md`; native Windows
  qualification and live route authorization remain separate gates.
### Historical Phase 09 contract boundaries

The persisted target registry is exactly seven IDs. `scripts/build-manifests.mjs`
emits eight schema-2 files: the aggregate `.evcrate/build-manifest.json` plus one
`.evcrate/build-manifest-<target>.json` for each target. The current eight manifests
are complete, mark the target registry as validated, and each carries 29 controller
hashes. `.evcrate/registry.json` remains schema 1 and currently indexes 140
canonical resources; each record carries compatibility entries for all seven target
IDs. `generate:all` runs inventory, build, registry, and manifest generation in that
order. Generated projections, registries, and manifests are never hand-edited.

Publication recovery and release rollback are separate operations:

- A valid `staged`/`promoting` journal rolls back promoted operations and returns
  `rolled-back`; a `committed` journal left by a cleanup crash is verified and
  finalized; no journal returns `none`. `recover` never rolls back a completed
  release.
- A post-first-promotion external collision retains the promoting journal; recovery
  fails closed until the operator reconciles the conflicting path. To roll back a
  completed release, use the installer `rollback` action for the prior package
  snapshot, then run publication `apply` from that restored snapshot.

Settings migration remains an independent user-owned transaction. V2 policy keys
are exactly `version`/`advisor`/`wait`/`history`; `advisor` is exactly
`primary`/`backup`, each route exactly `backend`/`model`/`effort`; `wait` is exactly
`mode`/`warn_after_ms`/`warn_every_ms`; and `history` is exactly
`retention_days`/`max_bytes`. Legacy v1 is a read-only migration view with
`version`/`advisor` (`backend`/`model`/`effort`/`timeout_ms`) plus
`migration_required: true`. The settings transport remains version 1: request keys
are exactly `protocol`, `protocolVersion`, `requestId`, `operation`, and `payload`;
preview payload is `policy`/`currentRevision`/`destination`/`mode`; apply payload
is `token`/`currentRevision`. The operator flow is `get -> prepare v2 -> preview ->
apply`; no automatic HOME rewrite.

Before cutover, pause admissions and inspect from the original task project root
and original HOME. Require no active `evcrate-advisor` process, a **STATE_READY**
state response, and `pending_process_status` of `null`, `never-started`, or `dead`;
block on `live`, `unknown`, or any inspection error. Keep admissions paused through
publication and recovery.

## Historical advisor mentoring Phase 10 deterministic acceptance (DONE 2026-09-08)

The prior milestone's deterministic acceptance gate is verified. Live vendor
qualification, empirical paired executor comparison, and real HOME publication
remain explicit operator gates. See the [QA report](../plans/reports/qa-260908-1915-phase10-acceptance.md)
and [acceptance matrix](../plans/260907-1208-advisor-mentoring-recovery-audit/acceptance-matrix.md).

### Acceptance fixtures and corpus

The added fixtures exercise the installed CommonJS controller and state/history CLI
in disposable roots; evaluation uses representative advice without production history.

| Fixture | Contract |
|---|---|
| `tests/distribution/phase10-test-helpers.mjs` | Owner-only temporary HOME/project/bin roots, fake Codex/OMP routes, Git baseline, bounded subprocess calls, and credential/PAT scrubbing. |
| `tests/fixtures/mentoring-evaluation/corpus.json` | Nine sanitized cases: one positive control and eight failure-oriented cases; five rubric dimensions; passing threshold `4.0`. |
| `tests/fixtures/mentoring-evaluation/evaluator.mjs` | Deterministic decision, direction, scope, actionability, evidence, generic-filler, and destructive-command checks. |

### Dedicated acceptance suites

| Suite | Cases | Observable coverage |
|---|---:|---|
| `phase10-controller-scenarios.test.mjs` | 7 | Primary success, fatal/malformed input, stream handling, unsupported route, cancellation, and child credential scrubbing. |
| `phase10-state-and-history.test.mjs` | 3 | Stale evidence, idempotent replay/history inspection, and dirty-user-baseline preservation. |
| `phase10-human-gate.test.mjs` | 1 | Three failed corrections enter `needs_human`; fourth remediation is denied. |
| `phase10-commands-and-evaluation.test.mjs` | 4 | Seven-target declarations, V2/`--advice` contract, corpus pass, and adversarial counsel rejection. |
| **Dedicated total** | **15** | **15/15 passed** |

### Deterministic evidence

| Command or surface | Result |
|---|---:|
| `node --test tests/distribution/phase10-*.test.mjs` | 15/15 |
| `node tests/advisor-controller/smoke-30s.cjs` | 1/1; 31.28s silent generation, one launch |
| `npm run test:advisor-controller` | 204/204 |
| `npm run test:adapters` | 24/24 |
| `npm run release:check` | 29/29 controller files; closure verified |
| `npm run test:installer:linux` | 15/15 |
| `npm run test:cutover && npm run test:validation-rollout` | 13/13 |
| **Deterministic total** | **272/272; 100%** |

### Explicit boundary

- Deterministic tests verify repository contracts, state transitions, process
  behavior, capability declarations, sanitized evaluation, packaging, and
  disposable-HOME preservation. Fake CLIs do not authenticate vendors or prove
  paid model quality.
- All seven targets declare mentoring support with `writeChecks: advisory-only`;
  generated markers do not establish live host enforcement or a universal
  pre-edit hard block.
- No real credentials, external vendor APIs, or empirical paired runs were used;
  live qualification and the paired improvement baseline remain **UNVERIFIED (GATED)**.
- Tests use disposable HOME only; production `$HOME/.evcrate/` is untouched;
  publication requires explicit operator authorization.

Phase 10 closes deterministic acceptance without claiming live qualification,
measured quality improvement, or authorized rollout.

## Advisor invocation modes

A final standalone `--advice` token activates formal checkpoint mentoring through
`evcrate-advisor-checkpoint/v2` during reviews, for up to three correction cycles.
The documentation-facing `/cmd-advise` name (the `/advise` command) is a separate
interview-first main-session workflow; it does not use checkpoint routing policy
or invoke the shared checkpoint controller.

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


## Hook materialization scope distribution and release verification (Phases 01–09)

Phases 01–08 deliver scope-aware publication (`--scope home|project`, defaulting
to `home`), neutral runtime closures, two-phase transactions, schema-2 state
migration, scope-isolated recovery, and installed Linux release verification.
Phase 09 reconciles and finalizes operator documentation against that proof:

1. **Scope and destination matrix**:
   - **Shared infrastructure**: The advisor controller closure (`.evcrate/bin`) is unconditionally
     materialized under `<home>/.evcrate/bin` across all scopes. `--target` never filters shared controller
     publication, and the controller is never materialized under a project root.
   - **Seven target projections**:
     - Claude: `<home>/.claude` (HOME) / `<project>/.claude` (Project).
     - Codex: `<home>/.agents` then `<home>/.codex` without root doc (HOME) / `<project>/.codex`, `<project>/.agents`, then `<project>/AGENTS.md` (Project).
     - Gemini: `<home>/.gemini` without root doc (HOME) / `<project>/.gemini` then `<project>/GEMINI.md` (Project).
     - Antigravity: mapped to `<home>/.gemini/config` via structured rule (HOME) / `<project>/.antigravity` (Project).
     - Pi: `<home>/.pi` (HOME) / `<project>/.pi` (Project).
     - OMP: `<home>/.omp` with declared path mapping (HOME) / `<project>/.omp` (Project).
     - Copilot: `<home>/.copilot` (HOME) / `<project>/.copilot` (Project).

2. **Preflight and two-phase transaction semantics**:
   - Preflight validates real owner-controlled directories, non-symlink ancestry, canonical project
     root (SHA-256 `projectIdentity`), intra-/cross-target descriptor overlap, and same-volume atomicity.
   - HOME publication executes as a single atomic transaction under the HOME publication lock.
   - Project publication executes in two phases:
     1. Shared commit to `<home>/.evcrate/bin` under the HOME publication lock.
     2. Project harness commit to `<project-root>` under the project workspace lock (holding HOME lock, never reversing lock acquisition).
   - Partial failure: If project harness application fails after shared commit, only the project workspace
     is rolled back. Shared HOME commit is never compensated. If rollback succeeds, the result is
     `status: 'partial'` with `PUBLICATION_FAILED` (exit category 5). If rollback fails, the journal is
     preserved with `ROLLBACK_FAILED` (exit category 5) for operator recovery.

3. **Schema-2 scope-isolated recovery**:
   - `evcrate recover --scope home`: Reads only HOME publication state under `$HOME/.evcrate/publication/`.
   - `evcrate recover --scope project --project-root <dir>`: Validates matching canonical `projectIdentity`
     and recovers only project publication state under `<project-root>/.evcrate-publish-state/`.
   - Quiescence is strictly required; recovery never crosses requested scope boundaries.

4. **Installed release verification**:
   - Modularized installed assertions in `scripts/release/installed-lifecycle-assertions.cjs` (< 200 LOC)
     integrate with `scripts/release/linux-verification-assertions.cjs` and `scripts/verify-private-linux-release.cjs`.
   - Verifies HOME non-mutation on installation, all-seven HOME publication with shared controller,
     project publication to an independent workspace without a project controller, multi-target execution
     from a foreign workspace, partial failure rollback/isolation, and package snapshot byte invariance throughout.
   - Release gates pass sequentially: `test:release` (10/10), `test:installer:linux` (15/15),
     `test:validation-rollout` (6/6), `test:distribution:rollout` (5/5), and full test suite (512/512).
## Projection map

- Claude is the canonical authoring projection and source of command/workflow text.
- Codex, Gemini, Antigravity, Pi, OMP, and Copilot are registered TypeScript
  projections with target-specific transforms and validation.
- OMP stages canonical commands, writes `evcrate/command-name-map.json`, and
  flattens nested command paths to `cmd-` files with `__` separators.
- Copilot writes its own command map and exposes `evcrate-cmd-*` skills with raw
  `$ARGUMENTS`; it is not an advisor backend.
- Pi keeps a target-specific runtime/extension overlay and owns a separate settings
  merge contract documented in [Pi-native migration](./pi-native-migration.md).

### Command naming note

Core documentation uses `/cmd-*` for every documented slash command/resource name,
including `.claude` references. OMP nested names use `__`; Copilot uses
`/evcrate-cmd-*`. The canonical `.claude` scanner currently derives names from
paths and the CLI parser accepts bare operational actions, so prefix enforcement is
a documented/target convention and a known follow-up, not a completed source change.
Shell commands (`npm`, `node`, `python3`, `cp`, `export`) remain normal executable
syntax and are not slash resource names.

## Documentation navigation

- [System architecture](./system-architecture.md) — central distribution,
  controller, supervision, wire, isolation, and publication authority.
- [Project overview and PDR](./project-overview-pdr.md) — requirements and acceptance.
- [Code standards](./code-standards.md) — implementation rules and boundaries.
- [Project roadmap](./project-roadmap.md) — phases, gates, and unresolved work.
- [Project changelog](./project-changelog.md) — historical phase evidence.
- [Project changelog archive](./project-changelog-archive.md) — older phase detail.
- [Pi-native migration](./pi-native-migration.md) — Pi-specific notes.
