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
18 production files under `.evcrate/source/.evcrate/bin/`:

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
lib/advisor/isolated-workspace.cjs
lib/advisor/json-document.cjs
lib/advisor/policy-schema.cjs
lib/advisor/profile.cjs
lib/advisor/runner.cjs
```

The current controller path validates the compatibility direct checkpoint and
executes one target/one attempt, but its timing boundary is now explicit:
adapter capability probes use finite `probe` mode, while the final model
invocation uses `generation` mode with no generation deadline. Generation
warnings report monotonic elapsed time on `stderr`; input, streams, output, and
termination remain bounded.

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
