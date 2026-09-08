# Codebase Summary

**Generated:** 2026-09-08
**Source:** Repository compaction produced by Repomix at `repomix-output.xml`,
then checked against the current package and source tree.  
**Purpose:** Compact navigation map, not a copy of the compaction.

The repository is a private Node/TypeScript package. `package.json` declares
`evcrate` version `1.0.0`, Node `>=22.19.0`, the `evcrate` bin at
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
tests/                         focused contract suites
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

The six generated projections (`.omp`, `.pi`, `.copilot`, `.codex`, `.gemini`,
`.antigravity`) carry the canonical policy and hook closure without drift.
The latest `npm run distribute:check` returned `status: "ok"` across all seven
registered adapters. Projected and published OMP runtime smoke returns `0, 0, 2, 2`
for allowed builds, an environment-prefixed build, a chained read, and a direct
generated-directory read. Build commands remain unblocked while heavy-directory
reads/searches stay blocked.

## TypeScript modules

| Area | Responsibility | Representative entry points |
|---|---|---|
| `src/protocol/` | Versioned JSON, canonical JSON, advisor v2/settings/diagnostic payloads, target IDs, resource/publication/scope wire shapes | `validation.ts`, `advisor-contracts.ts`, `advisor-settings.ts`, `diagnostic.ts` |
| `src/context/` | Immutable package/project/home/state/target context | `invocation-context.ts`, `target-registry.ts` |
| `src/manifests/` | Schema-2 target manifest loading and controller authorization | `manifest.ts`, `registry.ts`, `controller.ts` |
| `src/adapters/` | Seven fixed projection adapters, typed catalog projection, scanner layouts, and resource graph checks | `catalog-data.ts`, `catalog-types.ts`, `registry.ts`, `qualification.ts`, target subdirectories |
| `src/registry/` | Canonical scan, schema-1 records, compatibility and deterministic queries | `scanner.ts`, `schema.ts`, `store.ts` |
| `src/imports/` | Bounded external-source preview/apply and replay tokens | `preview.ts`, `apply.ts`, `handler.ts` |
| `src/scopes/` | Global/project assignment state, inheritance, revisions, and CAS | `state.ts`, `mutations.ts`, `changes.ts` |
| `src/advisor-settings/` | User policy snapshots, transactions, lock, journal, preview token, and recovery | `policy-files.ts`, `coordinator.ts`, `transactions.ts`, `recovery.ts` |
| `src/distribution/` | Local build/check, hash verification, staging, publication, recovery, Pi settings, cutover | `local-build.ts`, `build-resolution.ts`, `publication.ts`, `cutover.ts` |
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
lib/advisor/policy-schema.cjs
lib/advisor/profile.cjs
lib/advisor/runner.cjs
lib/advisor/managed-checkpoint.cjs
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

## Advisor controller timing and cleanup (Phase 02)

`runner.cjs` rejects mixed timing options at invocation construction and exposes
`createProbeRunner` for bounded probes plus `createGenerationRunner` for
indefinite generation. Cancellation is checked before spawn, during process
execution, after close, across result parsing, and before terminal commit, so
provisional advice cannot win a cancellation race. Warning delivery is
non-blocking and cannot block process draining or terminal settlement.

Detached POSIX process groups receive TERM/KILL escalation. Cleanup verification
checks leader liveness, process-group liveness, and the leader close/reap event;
successful generation requires confirmed cleanup. `isolated-workspace.cjs`
confirms workspace removal only when the absence probe returns **ENOENT**.
`controller.cjs` carries `cleanup_outcome` across runner/controller boundaries,
including probe cleanup uncertainty, and converts uncertain cleanup into
failure rather than successful advice. The focused Phase 02 closure passes
65/65 advisor-controller tests and the real smoke scenario completes after
31.25s of delayed generation with bounded `stderr` warnings.

## Advisor adapter qualification and strict terminal parsing (Phase 03)

Phase 03 qualifies the four enabled advisor backends (`claude`, `codex`, `pi`,
and `omp`) against fixed executable/argv, exact route controls, noninteractive
session isolation, read-only/no-tool behavior, and bounded machine-readable
output. `adapter-contract.cjs` requires every adapter to expose version, auth,
capability, invocation, result, and failure-classification methods. Capability
attestations bind the exact model and effort plus `noninteractive`, isolated
session, no tools, and output mode; no adapter may silently substitute a route.
`adapter-registry.cjs` keeps `antigravity` as a candidate with an explicit
unavailable adapter, while only the four qualified names are enabled.

### Qualification and terminal contracts

- **Claude:** version/auth/help probes verify the requested model/effort and
  read-only/session/output controls before invocation. The JSON result must be
  a successful, nonempty result envelope. Nonempty `permission_denials` rejects
  the result as READ_ONLY_UNSUPPORTED; a non-array value is invalid.
  `stop_reason` may be absent or `end_turn`/`stop`; `tool_use`/`tool_call`
  rejects read-only safety, max_tokens maps to OUTPUT_LIMIT, and every other
  value is PROTOCOL_INVALID. A reported model must equal the route.
- **Pi:** auth and offline model probes establish the exact provider/model and
  thinking effort, then help probes require JSON mode, no session/context
  features, and no approval/tools. The parser requires the ordered
  `session -> agent_start -> turn_start -> user -> assistant -> turn_end ->
  agent_end -> agent_settled` lifecycle, exact message shapes, exact workspace
  and route attestation, and one nonempty assistant answer. Final
  `stopReason` must be `stop`; `pending`, `length`, `toolUse`, `error`,
  `aborted`, and `deferred` cannot become advice (length is OUTPUT_LIMIT,
  tool use is READ_ONLY_UNSUPPORTED, and other nonterminal values are
  PROTOCOL_INVALID).
- **OMP:** `usage --json --redact --provider` is accepted as usable auth only
  when a matching report has nonempty limits whose statuses are all `ok` and
  `capacity[provider]` has entries with finite, positive
  `remainingAccounts`. Missing reports, exhausted limits, zero capacity, or
  malformed status fail closed as AUTH_UNAVAILABLE. The OMP parser enforces
  the session/user/assistant/turn/agent terminal lifecycle, exact route and
  usage shapes, `stopReason: "stop"`, empty tool results, and
  `isTerminal: true`. `advisor_yielded` is not a documented event and is
  rejected; it cannot bypass terminal validation.
- **Codex:** version/login/model-catalog probes qualify the exact model and
  reasoning effort, while help probes require ephemeral read-only JSONL
  execution and ignore-user-config/rules controls. The parser accepts only
  the ordered thread/turn/item lifecycle, one nonempty `agent_message`, and
  a terminal `turn.completed` after every item settles. Tool, file-change,
  web-search, MCP, and todo items, duplicate/late events, route drift, and
  malformed terminal output fail closed.

The Claude, Pi, and OMP parsers validate exact event/message keys, UTF-8 and
byte/line bounds, terminal ordering, and no-tool semantics before returning
recommendation text. The shared typed errors in `errors.cjs` preserve protocol,
read-only, output-limit, auth, capability, and process boundaries; arbitrary
stderr wording is not a retry or success assertion.

### Generation timing and limits

`resolveInvocationLimits` is used by all four enabled adapters. It merges
adapter defaults with context limits, but deletes `timeoutMs` whenever
`mode: "generation"` is selected. Probe invocations retain finite bounds
(including the adapter 5-second probe timeout); generation keeps prompt,
stdout/stderr, result, termination, and warning bounds while carrying no
generation deadline. Runner normalization rejects an explicit generation
`timeoutMs`, and the generation runner constructs its final invocation with
`timeoutMs: undefined`. Claude, Pi, OMP, and Codex therefore consume the
Phase 02 indefinite-generation contract without reintroducing a hidden
deadline.

Focused adapter coverage lives in
`tests/advisor-controller/{claude-adapter,pi-adapter,omp-adapter}.test.cjs`
and `fixtures/fake-omp.cjs`; runner/controller coverage asserts generation
invocations omit `timeoutMs`. These deterministic fixtures qualify parser and
control behavior only; they do not claim live vendor authentication or paid
route qualification.

## Advisor v2 contracts and safe policy migration (Phase 01)

The CJS closure and TypeScript control plane deliberately keep separate
validators: `.evcrate/source/.evcrate/bin/lib/advisor/{contracts-v2,policy-schema,
checkpoint-contract,controller-envelope,controller,errors}.cjs` and
`src/protocol/{advisor-contracts,advisor-settings,diagnostic}.ts`. The pair
freezes the same policy/checkpoint/result/envelope shapes without importing
`dist/` into the standalone runtime.

- Policy v2 is exact `version`/`advisor`/`wait`/`history`; advisor has explicit
  `primary`/`backup` route triples, wait warnings, and bounded history. Distinct
  routes required; backend/model/effort values remain operator-selected.
- Checkpoint/result/controller v2 bind task/checkpoint/evidence identity,
  structured task/evidence/result fields, bounded attempts, sanitized errors,
  and audit status. Task state, execution history, and outcomes are new v1
  local records with bounded owner-only storage.
- Legacy host-v1 and single-target-v1 policies are readable through settings
  `get` as migration views, never executable. Operator migration is
  `get -> prepare v2 -> preview -> apply`; CAS revisions, byte-safe journal
  recovery, ownership, and preview replay protection remain.
- Settings request/result, journal, and preview schemas stay v1 while carrying
  policy v2. No automatic HOME rewrite, invented backup route, or fallback
  runtime path. See [system architecture](./system-architecture.md) and the
  [Phase 01 plan](../plans/260907-1208-advisor-mentoring-recovery-audit/phase-01-contracts-and-policy-migration.md).

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
- [Pi-native migration](./pi-native-migration.md) — Pi-specific notes.
