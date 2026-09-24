# Codebase Summary

**Generated:** 2026-09-24
**Source:** Repomix v1.18.0 compaction; `.repomixignore` excludes tests, plans, and docs.
Companion Phase 02 host implementation was inspected directly; it is in DamHopper, not this EVCrate compaction. Contract details: [all-project advisor history](./all-project-advisor-history.md).
Current UI source map: [E03 guide](./advisor-plugin-ui.md); worker detail: [E02 guide](./advisor-plugin-worker.md).

The repository is a private Node/TypeScript package. `package.json` declares
`evcrate` version `2.1.0`, Node `>=22.19.0`, the `evcrate` bin at
`dist/cli/evcrate.js`, and the `evcrate-advisor` bin at
`.evcrate/source/.evcrate/bin/evcrate-advisor`.

**Plugin UI current state:** Standalone picker/reader source has been removed from
the repository. The shared React app/views and DamHopper MessagePort provider remain.
The E05 source cutover does not establish joint G4 qualification/sign-off, which is
unverified; standalone retirement is not release-authorized. This summary does not
assert current release assets were verified.

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

- `scan_commands.py` and `scan_skills.py` define frozen command and skill layout contracts: root, format, managed entries, and path mapping with strict metadata and UTF-8 parsers.
- Scanners resolve roots from `Path(__file__).resolve()` for CWD independence, write adjacent temporary files, and atomically replace targets.
- `generate_catalogs.py` validates normalized POSIX paths, rejecting NUL bytes, `./` prefixes, empty/dot/dot-dot segments, and non-canonical spellings.
- `generate_catalogs.py --freshness` deep-compares sorted records against live scans in memory, exiting 1 on mismatch without modifying data.
- Deterministic test suites: `test-scan-catalogs.py` (7/7 passed) and `test-evcrate-help.py` (19/19 passed) verify layout, safety, and freshness contracts.

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
catalog/projection closure only; live vendor qualification, broader Windows runtime support, npm
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
| `src/protocol/` | Versioned JSON, canonical JSON, portable advisor contracts/metrics/evaluation documents, the Phase E00 plugin data API, settings/diagnostic payloads, target IDs, resource/publication/scope wire shapes, and host/portable path validation | `validation.ts`, `advisor-contract-runtime.ts`, `advisor-contracts.ts`, `advisor-metrics.ts`, `advisor-evaluation.ts`, `advisor-evaluation-validation.ts`, `advisor-evaluation-comparison.ts`, `advisor-plugin-data-api.ts`, `advisor-settings.ts`, `index.ts` |
| `src/context/` | Immutable package/project/home/state/target context and host-native path resolution | `invocation-context.ts`, `path-resolution.ts`, `target-registry.ts` |
| `src/manifests/` | Schema-2 target manifest loading, descriptor types, and controller authorization | `manifest.ts`, `registry.ts`, `controller.ts`, `types.ts` |
| `src/adapters/` | Seven fixed projection adapters, typed catalog projection, scanner layouts, and resource graph checks | `catalog-data.ts`, `catalog-types.ts`, `registry.ts`, `qualification.ts`, target subdirectories |
| `src/registry/` | Canonical scan, schema-1 records, compatibility and deterministic queries | `scanner.ts`, `schema.ts`, `store.ts` |
| `src/imports/` | Bounded external-source preview/apply and replay tokens | `preview.ts`, `apply.ts`, `handler.ts` |
| `src/scopes/` | Global/project assignment state, canonical project identity, inheritance, revisions, and CAS | `identity.ts`, `state.ts`, `mutations.ts`, `changes.ts` |
| `src/advisor-settings/` | User policy snapshots, transactions, lock, journal, preview token, and recovery | `policy-files.ts`, `coordinator.ts`, `transactions.ts`, `recovery.ts` |
| `src/distribution/` | Local build/check, hash verification, phase planning, staging, publication, recovery, Pi settings, cutover | `local-build.ts`, `build-resolution.ts`, `publication-plan.ts`, `publication-inventory.ts`, `publication-rules.ts`, `publication.ts`, `publication-recovery.ts`, `shared-json.ts`, `cutover.ts` |
| `src/filesystem/` | Safe paths, the shared native-separator ancestor guard, hashes, atomic operations, and locks | `paths.ts`, `hashing.ts`, `atomic.ts`, `locking.ts` |
| `src/cli/` | Argument parser, request files, dispatch, output, health, process runner, executable | `arguments.ts`, `dispatch.ts`, `main.ts`, `evcrate.ts` |
| `src/errors/` | Stable control-plane error types and exit mapping | `control-plane-error.ts` |
| `src/index.ts` | Side-effect-free public export surface | `index.ts` |

`src/protocol/validation.ts` owns persisted targets `claude`, `codex`, `gemini`,
`antigravity`, `pi`, `omp`, `copilot`; `agy` is an input alias only. `safePath`
is host-native on win32; `normalizeRelativePath` remains slash-relative POSIX metadata.
`src/context/path-resolution.ts` uses `lexicalAbsoluteWindows`, then shared
`assertNoSymlinkAncestors` from `src/filesystem/paths.ts`; URL-derived Phase 01
fixtures cover the boundary; Windows standalone installer lifecycle and version verification are qualified (Phases 01–10).

## CLI and build tooling

`package.json` scripts expose the current TypeScript path:

| Script/action | Role |
|---|---|
| `npm run build` | Generates the runtime brief, four generated advisor runtime modules, and controller inventory through `prebuild`, then compiles TypeScript. |
| `npm run build:all` | Runs the root TypeScript build followed by the plugin UI build (`build:advisor-plugin-ui`). |
| `npm run build:advisor-plugin-ui` | Compiles and inlines the self-contained plugin UI document to `plugin/ui/index.html`. |
| `npm run build:advisor-plugin` | Packages the deterministic plugin tarball with exact inventory closure. |
| `npm run verify:advisor-plugin` | Validates archive integrity, permissions, member counts, and sidecar digests. |
| `npm run generate:inventory` | Regenerates the exact controller inventory. |
| `npm run generate:registry` | Regenerates canonical schema-1 resource records. |
| `npm run generate:manifests` | Builds target and aggregate schema-2 manifests. |
| `npm run distribute:build` / `distribute:check` | Build and verify projections through the compiled CLI. |
| `npm run distribute:all` | Build and publish all selected targets. |
| `npm run distribute:pi`, `distribute:omp`, `distribute:copilot` | Select one projection target. |
| `npm run release:check` | Verifies the current 33-file runtime closure. |
| `npm run generate:advisor-runtime` | Compiles the exact four-file CommonJS protocol runtime. |
| `npm run generate:advisor-plugin-schema` / `check:advisor-plugin-schema` | Generate or byte-check the Phase E00 schema and contract manifest; generated outputs are not hand-edited. |
| `npm run test:advisor-plugin` | Runs the Phase E00 wire-validator and schema-generator tests. |
| `npm run test:advisor-metrics` / `test:advisor-parity` | Exercises kernel formulas and ESM/generated-CJS/browser digest parity. |
| `npm run release:candidate` | Builds the immutable semantic-release candidate and receipt. |
| `npm run release:verify-assets` | Verifies exact release asset sets and expected hashes. |
| `npm run semantic-release` | Runs the verify-only release publisher wrapper. |
| `npm run test:release` | Runs release-artifact and release-orchestration suites. |
| `npm run test:installer:linux` | Runs Linux installer lifecycle tests. |
| `npm run test:installer:windows` | Runs the Windows qualification harness. |
| `npm run test:distribution:rollout` | Runs private unpack rollout checks. |
| `npm run test:advisor-controller` and focused suites | Contract evidence; not live vendor qualification. |

The compiled CLI accepts `version`, `health`, `resources list|get`, `imports
preview|apply`, `scopes list|get|assign|remove|enable|disable`, `changes
preview|apply`, advisor settings, publication, recovery, and distribution
actions. There is no canonical root `distribute.py` command.

## Portable advisor contract runtime (Phase 01)

`src/protocol/advisor-contract-runtime.ts` centralizes environment-neutral advisor
policy, checkpoint, result, receipt, attempt, envelope, and v1 history types,
constants, deep-freezing, and code/path validators. It imports only protocol JSON
helpers and has no `node:*`, process, HOME, filesystem, or crypto dependency.

The Phase 01 source boundary is `advisor-contract-runtime.ts`,
`advisor-contracts.ts`, `advisor-settings.ts`, and `protocol/index.ts`;
`src/index.ts` exposes it transitively. Focused contract fixtures cover frozen
valid values and neutral code/path failures. The source boundary is not the
installed controller closure.

## Advisor metrics kernel and generated CJS runtime (Phase 02)

Phase 02 completes the pure history-metrics kernel, digest compatibility, and
CommonJS adapter generation. See the [Phase 02 plan](../plans/260917-2308-advisor-visual-metrics/phase-02-checkpoint-digest-metrics-kernel-and-generated-cjs-adapters.md).
`src/protocol/advisor-metrics.ts` exports `normalizeHistoryRecord`,
`normalizeHistoryFilter`, `filterHistoryRecords`, `nearestRankPercentile`, and `calculateHistoryMetrics`; callers provide `generated_at`, and all returned values are deeply frozen.
- Normalization lowercases identities, excludes invalid execution records, and
  excludes conflicting duplicate identities with `DUPLICATE_IDENTITY` diagnostics.
- Filters use the exact ten-key shape: null is unconstrained, arrays are
  OR-within/AND-across, and positive time bounds are inclusive.
- Ratios/means round to six decimals and use null for zero denominators; latency
  uses terminal receipt elapsed time and nearest-rank p50/p95.
- Results retain scan diagnostics, counts, missingness, completeness, limitation
  codes, attempts, failures, and deterministically ordered route groups.

Checkpoint digests are not canonical JSON: validate without reconstruction or key
sorting, preserve insertion order, hash UTF-8 `JSON.stringify(validatedCheckpoint)` bytes
with SHA-256 and emit lowercase hex. The golden fixture proves Node and Web Crypto parity.

`tsconfig.advisor-runtime.json`/`npm run generate:advisor-runtime` emit exactly:
`canonical-json.js`, `json.js`, `advisor-contract-runtime.js`, and
`advisor-metrics.js`. `contracts-v2.cjs` retains Node hashing, advice parsing,
state delegation, exports, and boundary mappings; `policy-schema.cjs` retains
enabled-backend and legacy migration behavior while delegating shared validation.

## Controller closure and inventory migration (Phase 03)

`scripts/generate-controller-inventory.mjs` produces `src/manifests/controller-inventory.generated.ts`, authority for the current 33-file CommonJS
closure under `.evcrate/source/.evcrate/bin/`. Four generated modules live under
`lib/advisor/generated/`; imports remain literal-relative CommonJS or Node built-ins, with no `dist/` or external package dependency.
`install.sh` and `install.ps1` carry the same code-point-sorted list; hashes,
manifests, staging, publication, and release checks consume it.
`tests/manifests/distribution-manifests.test.mjs` asserts exact count/hash parity and rejects `viewer.js` and
`require('lodash')`; [closure evidence](../plans/reports/evidence-260918-1140-phase-03-33-file-closure-parity.json) records parity, and generated files are never hand-edited.

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

## Advisor retry orchestration (historical Phase 05)

The historical advisor milestone (2026-09-08) added four sequential primary
launches with cancellable 10/20/30-second backoff and one configured backup.
Cancellation, cleanup uncertainty, excessive cooldowns, and executable drift
fail closed; backup failure is terminal. See the
[historical Phase 05 plan](../plans/260907-1208-advisor-mentoring-recovery-audit/phase-05-primary-retry-and-backup-orchestration.md).
Evidence: 140/140 advisor-controller tests and `npm run release:check`.


## Historical standalone browser history reader (Phase 05; 2026-09-18)

At Phase 05 completion, the standalone explorer used explicit user-granted handles,
sorted three-level traversal, bounded strict reads, shared validation, identity
checks, normalization, and stale retention for incomplete scans. Those picker and
reader sources have since been removed from this repository. The dated evidence
remains in the [project changelog](./project-changelog.md); it is not a current
viewer I/O source map or G4 qualification.

## Advisor counsel evaluation protocol and fixtures (Phase 06)

Phase 06 completed on 2026-09-18 and froze display-only external counsel comparison
documents. `src/protocol/advisor-evaluation.ts` and its primitives, validation, and
comparison modules enforce exact keys, bounds, canonical rubric/input digests,
complete observation matrices, immutable documents, and provenance-separated
aggregation. Response states remain distinct (`ADVICE_READY`, `FAILED`, `MISSING`);
scores preserve provenance, dimension coverage, partial/full/null rules,
two-decimal averages, and thresholds. Evaluation IDs never join consultation history.

The Phase 06 standalone browser reader used an explicit multi-file picker with an
8 MiB per-document bound. That reader source has since been removed. Fixtures
`valid-mixed.json`, `digest-mismatch.json`, `invalid-observations.json`, and
`corpus-nine-cases.json` remain evidence for protocol boundaries; the **87/87 test**
result and **10/10 review** were recorded in 2026-09-18 and are historical.
The milestone handed off to Phase 07.

## Advisor Plugin domain data API and cross-project scope (E00/Phases 01–02)

E00 completed on 2026-09-21 with `evcrate-advisor-data` v1. Phase 01 froze v2 while preserving v1 schema/behavior support and on-disk history v1. See the [Phase E00 plan](../plans/260920-1603-dam-hopper-advisor-plugin/phase-00-domain-contracts-and-parity.md), [E00 validation](../plans/reports/tester-260921-0805-phase-e00-domain-contracts-parity.md), [review](../plans/reports/code-review-260921-0808-phase-e00-domain-contracts-and-parity.md), and [cross-project contract guide](./all-project-advisor-history.md).

- `advisor-plugin-data-api.ts` registers exactly eight operations: `history.refresh`, `history.summary`, `history.page`, `history.detail`, `policy.readCurrent`, `evaluations.list`, `evaluations.read`, and `evaluations.compare`. Validators reject unknown/authority fields, unsafe scalar sizes, invalid IDs, and inconsistent results; accepted values are frozen.
- `scripts/generate-advisor-plugin-data-schema.mjs` deterministically emits v1 and v2 draft-07 schemas plus `contract-manifest.json`, which advertises supported versions 1 and 2; `--check` rejects stale generated bytes.
- V1 and v2 positive/negative fixtures cover strict wire parity. Phase 01 contract and runner verification recorded 92/92 executions; E00's 28/28 result is dated historical evidence.
- V2 summary/page queries carry `project_id: string | null`; the bounded inventory has at most 500 project entries with snapshot-consistent counts independent of query filters.
- The version-1 project metadata sidecar maps SHA-256 project IDs to display names and timestamps. Strict owner-safe name validation prevents path/HOME disclosure; labels never confer access.
- Companion host types define `ContextScopeKind` and `ContextScopeDescriptor`; Phase 02 adds installation-bound owner-root admission and runner reauthorization in DamHopper. The API refreshes its process-local owner-source cache from runner state at each context open. Worker root scanning, project-filter UI, and paired qualification remain pending; see the [Phase 02 plan](../plans/260924-1055-all-project-advisor-history/phase-02-host-authorization-context.md).
- `plugin/contracts/read-closure-feasibility.json` records a feasible G0 read graph: only `node:fs`, `node:path`, and `node:crypto` are permitted; mutators, model adapters, workspace isolation, and process/network built-ins are excluded; expected controller-inventory delta is zero. E01 re-confirmed the graph without adding shared controller modules.
- Review follow-ups are non-blocking: normalize filter failures to `PluginDataApiError`, deepen compare-group validation when UI shapes stabilize, and enforce raw-I/O byte limits before JSON deserialization.

## Owner-safe plugin read provider (Phase E01)

Phase E01 completed on 2026-09-21 and supplied the read-only, context-bound
provider that Phase E02 wrapped in the pinned D00 worker. See the [phase plan](../plans/260920-1603-dam-hopper-advisor-plugin/phase-01-owner-safe-provider.md),
[verification](../plans/reports/audit-260921-1139-phase-e01-verification.md), and
[re-review](../plans/reports/code-review-260921-1216-phase-e01-fixes-re-review.md).

| Module | Responsibility |
|---|---|
| `plugin/backend/provider.cjs` | Rechecks binding, gates the eight E00 methods, validates params/results, and dispatches operations. |
| `plugin/backend/provider-errors.cjs` | Internal typed error taxonomy and sanitized error factories. |
| `plugin/backend/binding.cjs` | Absolute-path, project-identity, owner, non-symlink, realpath, and safe-regular-file checks. |
| `plugin/backend/snapshot-store.cjs` | Immutable per-context snapshots; 2/context, 128 MiB aggregate, 5-minute TTL, and LRU limits. |
| `plugin/backend/cursor-manager.cjs` | HMAC snapshot/query cursors, code-point tie breaks, 1..500 pages, and <=1 MiB responses. |
| `plugin/backend/history-scanner.cjs` | Sorted cooperative traversal, descriptor-pinned bounded reads, validation, normalization, and fingerprints. |
| `plugin/backend/history-detail.cjs` | Fingerprinted execution/outcome reread with `ready`, `changed`, and `missing` transitions. |
| `plugin/backend/history-provider.cjs` | Fair FIFO refresh (capacity 32), stale/unavailable handling, summary, page, and detail. |
| `plugin/backend/policy-provider.cjs` | Capability-gated 16 KiB current account-policy read with revision/status labels. |
| `plugin/backend/evaluation-provider.cjs` | Explicit descriptor-bound 8 MiB list/read/compare with provenance-preserving groups. |

- Policy/evaluation/history readers use `O_RDONLY | O_NOFOLLOW`, post-open
  `fstat` owner/single-link/size checks, and descriptor reads to close TOCTOU
  windows; history fingerprints bind device and inode as well as size/digest.
- `tests/plugin/provider.test.mjs` covers lifecycle, history, policy, and
  evaluation; `provider-cancellation.test.mjs` covers abort/deadline/stale
  retention and FIFO; `provider-source-safety.test.mjs` covers path/link/race
  safety and context isolation.
- Dated E01 verification (2026-09-21) recorded **56/56 passing** across 8 files; the 33-file controller closure remained unchanged (inventory delta `0`).
- E02 wraps the provider in the pinned D00 worker (`worker.cjs`,
  `context-table.cjs`, `request-table.cjs`, `dispatcher.cjs`, `error-mapping.cjs`,
  local `data-api.cjs`) and deterministic candidate builder; see the [worker guide](./advisor-plugin-worker.md).
- At E03 completion, provider-neutral adapters covered the local picker and
  MessagePort paths. The local picker/reader source was later removed by the E05
  repository cutover; see the [UI guide](./advisor-plugin-ui.md). This historical
  architecture is not G4 qualification.

## React views and embedded provider (Phases 07/E03; current source map)

Phase 07 completed on 2026-09-19 as a private static React explorer. Phase E03
(2026-09-21; review 9.2/10) reused the shared app/views in the DamHopper
opaque-srcdoc entry. The E03 source included a local File System Access picker and
reader; those standalone sources were later removed in the E05 repository cutover.
That source change is not joint G4 qualification/sign-off: required external Linux
owner-runner and separate-LAN evidence are not present here, and standalone
retirement is not release-authorized.

See the [Phase 07 plan](../plans/260917-2308-advisor-visual-metrics/phase-07-react-explorer-and-view-architecture.md),
[E03 UI guide](./advisor-plugin-ui.md), and
[E03 review](../plans/reports/code-review-260921-1718-phase-e03-embedded-four-view-ui.md).

### Current shared React application

- `viewer/src/app.tsx` composes controls, status, tabs, the selected view,
  diagnostics, and footer.
- `viewer/src/app-state-types.ts`, `app-actions.ts`, `app-state-reducer.ts`,
  `app-state-selectors.ts`, and `app-state.ts` define the shared immutable state,
  actions, reducer, and selectors; provider generation/session fences reject late data.
- `viewer/src/hash-view.ts` maps the hash to Overview, History, Configuration, or
  Evaluations. File-system picker/reader state is not a current source path.

### Current views, provider, and components

| Path | Responsibility |
|---|---|
| `viewer/src/views/overview-view.tsx` | Counts, rates, missingness, latency, and methodological limitations. |
| `viewer/src/views/history-view.tsx`, `history-detail.tsx` | Filtered history table, server-backed pages, and lazy inert detail drawer. |
| `viewer/src/views/configuration-view.tsx` | Current policy separated from historical route/prompt/build groups. |
| `viewer/src/views/evaluations-view.tsx`, `evaluation-detail.tsx` | Comparable groups, result states, provenance, and masked/revealed candidates. |
| `viewer/src/providers/advisor-data-provider.ts`, `bridge-contract.ts`, `dam-hopper-port-provider.ts` | Provider contract, validated bridge envelopes, and bounded MessagePort data path. |
| `viewer/src/components/` | Refresh/cancel controls, status, tabs, diagnostics, pagination, and inert text rendering. |
| `plugin/ui/plugin-main.tsx`, `plugin-document.html`, `vite.config.ts` | Mounts the shared App with `DamHopperPortProvider` and builds the embedded document. |

The Phase 07 standalone explorer acceptance recorded **28/28 tests passed**, strict
viewer typecheck/build with **zero TypeScript diagnostics**, and a **10/10 review**
on 2026-09-19. That evidence is historical; it does not verify the removed picker,
current release assets, or G4. The shared views render validated data and make no
mentor-quality or live-vendor claim.

## Packaging, CSP, preview, and release inventory (historical Phase 08)

Phase 08 completed on 2026-09-19. At that milestone, the standalone viewer had a
static-build, loopback-preview, and package boundary outside the advisor controller
closure. See the [Phase 08 plan](../plans/260917-2308-advisor-visual-metrics/phase-08-packaging-csp-preview-and-release-inventory.md).

### Current DamHopper Plugin UI build paths

| Path | Responsibility |
|---|---|
| `plugin/ui/tsconfig.json` | Strict ES2020/DOM browser typecheck with Bundler resolution, `react-jsx`, and isolated modules. |
| `plugin/ui/vite.config.ts` | Inlines styles and classic scripts into `plugin/ui/index.html` with zero external assets. |
| `plugin/ui/plugin-main.tsx` | Mounts the shared React App with `DamHopperPortProvider` for embedded iframe execution. |

### Historical package and release boundary

- The Phase 08 package inventory excluded standalone viewer source from the root
  package and recorded the then-current exact-seven release-asset contract.
- Phase 08 evidence recorded **39/39 tests passed** and a **298.5 kB <= 5 MiB**
  standalone viewer bundle. The controller inventory was 33 files at that time.
  These dated results do not verify current release assets, G4, or authorize
  standalone retirement.

## Historical qualification, benchmarks, and documentation cutover (Phases 09–10)

Phase 09 reports from 2026-09-19 recorded the following standalone viewer evidence:
- **Browser qualification:** 14 Playwright tests exercised scanning, handle revocation,
  manual Refresh/Cancel, stale retention, CSP, network blocking, keyboard navigation,
  visible focus, and responsive views.
- **Frozen 10,000-consultation benchmark:** five runs recorded p95 scan 1,643 ms
  (<= 5,000 ms), p95 detail 67 ms (<= 100 ms), cancel 104 ms (<= 250 ms), and zero
  long tasks above 200 ms. Web Worker fallback was not needed.
- **Package/cutover checks:** Historical reports recorded six package inventory
  tests, seven distribution cutover tests, the 33-file controller closure, and an
  exact-seven asset boundary; they are not current release-asset verification.
- **Phase 10 documentation cutover:** The 2026-09-19 docs recorded then-current
  viewer operation, CSP/network boundaries, metric limits, and Chromium/Linux scope.
  Later source removal does not convert that evidence into G4 qualification.


## Historical advisor state and audit modules (Phases 06–07)

These 2026-09-08 mentoring phases are separate from the current metrics
explorer. The historical state module added owner-only task reservations,
dispositions, outcomes, three-cycle `needs_human`, and cooperative TTY
continuation; the history modules added sanitized execution/outcome records,
CAS settlement, bounded list/show/export/prune, and read-only `history metrics`.
The generated controller inventory remains authoritative. See the
[state plan](../plans/260907-1208-advisor-mentoring-recovery-audit/phase-06-task-state-scope-and-human-handoff.md),
[audit plan](../plans/260907-1208-advisor-mentoring-recovery-audit/phase-07-audit-history-and-outcome-review.md),
and [audit evidence](../plans/reports/tester-260908-1344-phase07-final-verification.md).
Historical evidence remains 185/185 state tests and 204/204 controller tests;
the current 33-file closure and current metrics explorer evidence are documented
in their respective sections above.


## Cooperative mentoring across commands and harnesses (historical Phase 08)

The 2026-09-08 milestone made
`.evcrate/source/.claude/workflows/advisor-mentoring.md` the single authored
checkpoint dispatcher for 16 code/cook/bootstrap/fix consumers. It preserves
the reserve → claim/attach → disposition → outcome → complete lifecycle,
explicit dispositions, exact correction ordinals, durable `needs_human`, and
baseline-preserving review. All seven projections declare mentoring supported
with `writeChecks: advisory-only`; generated markers are not live vendor or
host-enforcement proof. See the
[Phase 08 plan](../plans/260907-1208-advisor-mentoring-recovery-audit/phase-08-workflow-and-harness-gate-integration.md)
and [integration evidence](../tests/adapters/phase08-mentoring-integration.test.mjs).
Evidence: 279/279 tests; Lead Mentor approval 10/10.

## Windows release qualification asset boundary (Phase 02)

Phase 02 (2026-09-14) freezes the read-only release-asset boundary used by
candidate, predecessor, and publisher phases. See the
[phase plan](../plans/260914-0636-windows-release-qualification/phase-02-exact-release-asset-verifier-and-prepare-boundary.md),
[design contracts](../plans/260914-0636-windows-release-qualification/design-contracts.md#exact-asset-verification),
and [acceptance matrix](../plans/260914-0636-windows-release-qualification/acceptance-matrix.md).

- `scripts/release/asset-verification.cjs` reuses `release-contract.cjs` for
  canonical names, code-point ordering, strict sidecar parsing, metadata
  validation, and digest policy. It exports
  `getExpectedReleaseAssetNames`, `sha256File`, `verifyWindowsAssetSet`,
  `verifyReleaseAssetSet`, `parseVerifierArgs`, and `main`.
- Exact-seven `verifyReleaseAssetSet` permits only
  `evcrate-v<version>-linux-x64.tar.gz`, its `.sha256` sidecar,
  `evcrate-v<version>-windows-x64.zip`, its `.sha256` sidecar,
  `evcrate-v<version>.release.json`, `install.sh`, and `install.ps1`.
  Exact-four `verifyWindowsAssetSet` permits only the Windows archive, its
  sidecar, release metadata, and `install.ps1`; Linux records may remain in
  metadata but Linux files must be absent from this directory.
- Both sets enumerate once, `lstat` every entry, reject directory/symlink/
  special-file entries, enforce exact membership, validate metadata version,
  `v<version>` tag, lowercase 40-hex `source_commit`, required platform and
  installer records, strict sidecar bytes, archive/installer sizes, and
  streaming SHA-256 digests. Caller `tag`, `sourceCommit`, `expectedHashes`,
  and expected file records can strengthen checks; unknown expected file keys
  reject. No verifier path writes, repairs, or regenerates bytes.
- Successful verification returns the frozen
  `{version, tag, sourceCommit, files, metadata}` summary. Materialized file
  records contain name/size/SHA-256 in canonical code-point order.
- `semantic-release-asset-prepare.cjs` requires
  `EVCRATE_RELEASE_ASSET_MODE`; after trimming, only `build` and `verify` are
  accepted, and mode validation runs before filesystem/process work. Build
  delegates `scripts/prepare-release-assets.cjs <version>` then verifies
  exact-seven output. Verify checks existing `dist/release` only and cannot
  build, invoke npm/distribution, or regenerate missing/tampered assets.
- `.releaserc.json` changes only the exec `prepareCmd`; analyzer, notes,
  changelog, npm, GitHub, and git plugin order/specifications remain intact.
  `tests/distribution/private-release-artifacts.test.mjs` covers WRQ-007–012:
  exact sets, identity/tamper/receipt-hash rejection, no-mutation behavior,
  mode isolation, CLI parsing, and configuration structure.

## PowerShell installer safety and lifecycle (Phase 03)
Phase 03 (2026-09-14) hardens the standalone `install.ps1` state machine; this is an internal contract and does not qualify native Windows support.
- `Resolve-InstallRoots` validates root ancestry before optional creation; already-uninstalled teardown does not recreate roots.
- `Acquire-InstallLock` uses exclusive create, no sharing, delete-on-close semantics, and a random token; legacy stale locks are rename-quarantined only, and release disposes the handle.
- `Test-ContainedPath`/`Assert-ContainedPath` enforce canonical case-insensitive separator boundaries; `Test-InventoryPathSafety` validates snapshot and receipt keys before combination.
- `Assert-NoReparseAncestor` walks root-to-leaf, including dangling reparse fallback; directory creation and every state/pointer mutation are checked before and after writes.
- Journals use same-directory flushed temporary files and atomic replace/move; recovery validates schema and stage/target containment.
- Extraction is two-pass and bounded, rejects links/collisions, creates each file without overwrite, and records hashes; rollback verifies receipt inventory before repointing.
- Uninstall deletes receipt-owned files only, reports survivors with nonzero status, verifies PATH removal, and removes only empty owned roots; install/repair alone require Node.
- Native `powershell.exe`/`pwsh.exe` lifecycle execution was verified on hosted `windows-2025` x64 in Phase 09.
Evidence: [Phase 03 plan](../plans/260914-0636-windows-release-qualification/phase-03-powershell-installer-safety-and-lifecycle.md), [acceptance matrix](../plans/260914-0636-windows-release-qualification/acceptance-matrix.md), and [cycle 3 review](../plans/reports/code-review-260914-1407-phase-03-powershell-installer-safety-and-lifecycle.md).

## Deterministic Windows fixture and predecessor resolver (Phase 04)

Phase 04 (2026-09-14) adds the reproducible Windows predecessor boundary. See
the [phase plan](../plans/260914-0636-windows-release-qualification/phase-04-deterministic-windows-fixture-and-predecessor.md),
[acceptance matrix](../plans/260914-0636-windows-release-qualification/acceptance-matrix.md),
and [cycle 2 review](../plans/reports/code-review-260914-1805-phase-04-deterministic-windows-fixture-predecessor-cycle-2.md).

| Module | Responsibility |
|---|---|
| `fixture-records.mjs` | Fixed `FIXTURE_BUILD_TIMESTAMP` and minimal deterministic records. |
| `release-fixture-shared-helpers.mjs` | Shared sorted-record, controller/build-manifest digest, and real-installer authorities. |
| `windows-release-fixture.mjs` | `buildWindowsTestReleaseSet`, using `buildReleaseArchives` and real `install.ps1`, returns exactly ZIP/sidecar/metadata/installer records. |
| `private-release-fixture.mjs` | Linux fixture compatibility through the shared authorities. |
| `predecessor-resolver-core.mjs` | Bounded GitHub release pagination, stable semver filtering, exact-label qualification, canonical asset names, and irreversible plan selection. |
| `predecessor-downloader.mjs` | Bounded streaming downloads, cross-origin token stripping, private staging, exact-four verification, post-promotion verification, and cleanup. |
| `prepare-windows-predecessor.mjs` | Bootstrap/qualified orchestration and strict CLI/library boundary; handoff shape is `{kind, version, tag, sourceCommit, files, directory}`. |
| `windows-predecessor-mock-releases.mjs` and three `windows-*` suites | Determinism, resolver state/tamper/API cases, and subprocess CLI coverage. |

The resolver starts in bootstrap mode only when no stable release has the exact
Windows archive and installer labels. It builds verified `1.0.0`/`v1.0.0` bytes
with the fixed lowercase `a`×40 source identity and requires candidate `>` 1.0.0.
After any qualified release, it inspects only the latest stable release; an
unqualified latest, missing/tampered/duplicate asset, or required API/token
failure aborts without older-release or bootstrap fallback. Qualified downloads
contain only the Windows ZIP, sidecar, release metadata, and `install.ps1`.

Cycle 2 evidence: targeted Phase 04 suites 7/7, release suite 17/17, Linux
installer suite 15/15, total 39/39 (100%); code review approved 10/10. Predecessor
transitions and downloads were integrated into the full matrix qualification in Phase 09.

## Windows release candidate, qualification, and support cutover (Phases 05–10)
- **Qualification harness (Phase 05)**: `tests/installers/windows-release-qualification.mjs` runs strict CLI/host/byte preflight, safe PowerShell/`cmd.exe` invocation, and smoke/full lifecycle/negative flows.
- **Candidate & publisher (Phase 06)**: `run-release-candidate.cjs` uses a bare mirror and stages exact assets plus receipt; `publish-release.cjs` verifies receipt/hashes and copies only verified assets.
- **Release workflow (Phase 07)**: `.github/workflows/release.yml` implements least-privilege producer (`contents: read`), 4-row matrix (`windows-2025` x64, Windows PowerShell 5.1 and PowerShell 7, Node 22.19.0 and 24.21.0), exact-ID handoff, and publisher (`contents: write`).
- **PR smoke (Phase 08)**: `.github/workflows/windows-smoke.yml` provides unprivileged diagnostic smoke on Windows PowerShell 7 + Node 22.19.0 with fixture identities; `.releaserc.json` locks exact Windows labels.
- **Integrated qualification (Phase 09)**: Proved full gate sequence, bare-mirror isolation, tamper rejection, 4-row matrix routing, irreversible predecessor transitions, rerun boundaries, and final seven-file byte identity.
- **Support cutover (Phase 10)**: Updated `README.md` and core docs with bounded installer/version support and explicit runtime/desktop/signing exclusions.
## Historical advisor mentoring Phase 10 deterministic acceptance (DONE 2026-09-08)

The prior advisor milestone's deterministic acceptance gate is verified; live
vendor qualification, empirical paired comparison, and production HOME
publication remain operator-gated. See the [QA report](../plans/reports/qa-260908-1915-phase10-acceptance.md)
and [acceptance matrix](../plans/260907-1208-advisor-mentoring-recovery-audit/acceptance-matrix.md).

Fixtures used disposable owner-only HOME/project roots, fake Codex/OMP routes,
Git baselines, bounded subprocesses, and credential/PAT scrubbing. The evaluation
corpus contains nine sanitized cases (one positive, eight failure-oriented) over
direction, scope, safety, actionability, and evidence dimensions; threshold `4.0`.

| Suite | Cases | Coverage |
|---|---:|---|
| `phase10-controller-scenarios.test.mjs` | 7 | Success/failure, streams, unsupported route, cancellation, scrubbing. |
| `phase10-state-and-history.test.mjs` | 3 | Stale evidence, replay/history, dirty-baseline preservation. |
| `phase10-human-gate.test.mjs` | 1 | Three failures enter `needs_human`; fourth is denied. |
| `phase10-commands-and-evaluation.test.mjs` | 4 | Seven targets, V2/`--advice`, corpus, adversarial counsel. |
| **Dedicated total** | **15** | **15/15 passed** |

Deterministic evidence: phase10 suites 15/15; advisor-controller 204/204;
adapters 24/24; `release:check` verified 29/29 closure files; Linux installer
15/15; cutover/validation 13/13; total 272/272. These fixtures verify
repository contracts and sanitized transitions, not paid model quality, live
vendor authentication, or universal host enforcement. All seven targets remain
`writeChecks: advisory-only`; production `$HOME/.evcrate/` was untouched.

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
   - `evcrate recover --scope project --project-root <dir>`: Validates matching canonical `projectIdentity`
     and recovers only project publication state under
     `stateRoot/project-publication/<canonical SHA-256 identity>`.
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

- Claude is canonical; Codex, Gemini, Antigravity, Pi, OMP, and Copilot are
  fixed TypeScript projections with target-specific transforms and validation.
- OMP emits `evcrate/command-name-map.json` and flattens nested commands with `__`.
- Copilot emits `evcrate-cmd-*` skills with raw `$ARGUMENTS`; it is not an advisor
  backend. Pi keeps its runtime/extension and settings-merge boundary.

### Command naming note

Core docs use `/cmd-*`; OMP nested names use `__`, and Copilot uses
`/evcrate-cmd-*`. The canonical scanner/parser do not yet enforce this convention;
it is a documented follow-up, not a source rename. Shell commands remain executable
syntax, not slash resource names.

## Documentation navigation

- [System architecture](./system-architecture.md) — central contracts.
- [Project overview and PDR](./project-overview-pdr.md) — requirements.
- [Code standards](./code-standards.md) — implementation rules.
- [Project roadmap](./project-roadmap.md) — phases and gates.
- [Project changelog](./project-changelog.md) — historical evidence.
- [Project changelog archive](./project-changelog-archive.md) — older detail.
- [Advisor plugin worker](./advisor-plugin-worker.md) — E02 framing/lifecycle/candidate; [Embedded UI guide](./advisor-plugin-ui.md) — current shared UI and historical E03 architecture; [Pi-native migration](./pi-native-migration.md) — Pi-specific notes.
