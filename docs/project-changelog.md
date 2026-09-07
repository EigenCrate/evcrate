# Project Changelog

## Unreleased

**Updated:** 2026-09-07  
**Status:** Phase 04 regeneration/documentation/release gates complete; Phase 03 seven-target scanner/adapters complete; Phase 02 catalog schema/freshness complete; release remains Unreleased

### Advisor mentoring, recovery, and audit — Phase 01

**Updated:** 2026-09-07  
**Status:** Complete for contract freeze and policy migration; later runtime phases pending  
**Plan:** [Phase plan](../plans/260907-1208-advisor-mentoring-recovery-audit/phase-01-contracts-and-policy-migration.md)  
**Review:** [Code review](../plans/reports/code-review-260907-1648-phase-01-v2-contracts-and-policy-migration.md)

- Frozen policy v2 with explicit primary/backup routes, wait warnings, bounded
  history, candidate/enabled backend boundaries, and strict 16 KiB validation.
- Frozen checkpoint/result/controller v2 plus task-state, execution-history, and
  outcome v1 records with identity, evidence, attempt, cleanup, audit, and
  correction bounds.
- Kept CJS and TypeScript validators in their independent runtime closures;
  parity and sanitized typed errors remain explicit boundaries.
- Added read-only legacy policy inspection and explicit
  `get -> prepare v2 -> preview -> apply` migration. Existing revision/CAS,
  single-use preview, owner/mode, and byte-safe journal recovery remain.
- No automatic HOME rewrite, invented route/default, runtime retry/wait cutover,
  task-state command, history tool, or live vendor qualification is claimed.

The review records 139 focused assertions passing and no critical issues. Its
non-blocking follow-up is dedicated v2 validator boundary coverage before later
phases consume the records.

### Phase 04: Regeneration, documentation, and release gates

**Updated:** 2026-09-07  
**Status:** Complete  
**Plan:** [Phase plan](../plans/260906-2300-scan-command-skill-catalogs/phase-04-regeneration-documentation-and-release-gates.md)  
**Evidence:** [validation report](../plans/reports/tester-260907-1123-phase04-validation-matrix.md) and [final code review](../plans/reports/code-review-260907-1457-phase-04-final-post-fixes.md)

- Rebuilt all seven target scanner/data/layout closures and eight manifests through
  distribution tooling; generated projections remain distribution-owned.
- Canonical and projected script READMEs document exact command/skill schemas,
  managed authorities, native formats, CWD-independent scanner invocations,
  atomic/fail-closed generation, and scanner/generator separation.
- Focused release gates pass 85/85; the foreign-CWD scanner/generator matrix
  passes 35/35; `npm run distribute:check` returns `status: "ok"`.
- `ev-help.py` remains independent from scanners and generated data; architecture
  ownership boundaries remain unchanged.

Phase 04 closes the command/skill catalog plan. Live vendor qualification,
npm publication, rollout, and Windows validation remain separate operator gates.

### Phase 03: Seven-target scanner and catalog adapters

**Updated:** 2026-09-07  
**Status:** Complete  
**Plan:** [Phase plan](../plans/260906-2300-scan-command-skill-catalogs/phase-03-seven-target-scanner-and-catalog-adapters.md)  
**Evidence:** [test report](../plans/reports/tester-260907-0959-phase-03-seven-target-adapters.md) and [code review](../plans/reports/code-review-260907-1004-phase-03-seven-target-scanner-and-catalog-adapters.md)

#### Shared catalog and layout contract

- Added `src/adapters/catalog-types.ts` for the exact command/skill record
  schemas, category allowlists, safe relative POSIX paths, scanner-layout type,
  YAML parsing, and deterministic serialization.
- Added `src/adapters/catalog-data.ts` for canonical record validation,
  adapter-supplied source-to-native mapping, staged regular-file checks, and
  projection of target-native `commands_data.yaml`, `skills_data.yaml`, and
  `scanner-layout.json`.
- Standardized the projected sidecar on `evcrate-scanner-layout-v1`: target,
  command format/root/output/authority, and skill root/output/authority.
  Authority always comes from an existing adapter map, inventory, migration
  matrix, or canonical managed data; no compatibility alias registry is added.

#### Projected scanners

- `scan_commands.py` and `scan_skills.py` now resolve layout, roots, authority,
  and adjacent output files from their own `Path(__file__)` location, so
  invocation from a repository root, script directory, or unrelated temporary
  CWD is equivalent.
- Command scanning supports the seven native layouts: Claude recursive
  Markdown; Gemini TOML; Pi archived Markdown; OMP flattened `cmd-*.md`;
  Codex `cmd-*` command-skills; Antigravity `cmd_*` command-skills; and
  Copilot prefixed command-skills.
- Authority maps/inventories produce managed-entry allowlists. Missing,
  duplicate, symlinked, traversal, or otherwise unsafe target entries fail
  closed; unrelated user commands/skills planted beside managed resources are
  ignored.
- Scanner writes use adjacent temporary UTF-8 YAML plus atomic replacement.
  Invalid input leaves existing catalog bytes unchanged.

#### Adapter coverage

| Target | Command authority | Skill authority |
|---|---|---|
| Claude | Canonical resource graph/data set | Canonical managed skill set |
| Gemini | Migration behavior matrix | Matrix mappings with target-name/path transforms |
| Antigravity | Migration behavior matrix | Matrix mappings |
| Codex | Migration inventory and generated command-skills | Inventory and explicit exclusions |
| Pi | `inventory.json` archived command list | Native skill inventory |
| OMP | `evcrate-omp-command-map-v1` | OMP skill map/inventory |
| Copilot | `evcrate-copilot-command-map-v1` | Copilot skill map/inventory |

OMP now consumes its generated command map at runtime instead of brittle
canonical source-string rewrites. Gemini, Antigravity, Codex, Pi, and Copilot
retain native hook/runtime/advisory transforms while exposing their generated
paths to the common scanner contract. Frontmatter and advisory capability
rendering remain target-valid, and Claude remains the canonical authoring
projection.

#### Verification

- `npm run build`: pass.
- `node --test tests/adapters/contracts.test.mjs`: 10/10 pass, including
  seven-target foreign-CWD scanner/catalog execution and fail-closed authority
  mutation cases.
- `node --test tests/adapters/python-parity.test.mjs`: 1/1 pass with explicit
  intentional projection deltas.
- `python3 .evcrate/source/.claude/scripts/test-scan-catalogs.py`: 7/7 suites
  pass, including all three command formats, managed allowlists, CWD
  independence, schema/freshness, and atomic output.
- `python3 .evcrate/source/.claude/scripts/test-evcrate-help.py`: 19/19 pass;
  help behavior remains independent from scanner modules and generated data.

The Phase 03 test report records 37/37 focused cases passing with no skips or
failures. Phase 04 now closes regeneration, documentation, manifest, and release
gates for the command/skill catalog plan.

### Phase 02: Catalog schema and freshness

**Updated:** 2026-09-07  
**Status:** Complete  
**Plan:** [Phase plan](../plans/260906-2300-scan-command-skill-catalogs/phase-02-catalog-data-schema-and-freshness.md)  
**Evidence:** [test report](../plans/reports/tester-260907-0152-catalog-regression-freshness.md) and [code review](../plans/reports/code-review-260907-0153-phase-02-catalog-schema-freshness.md)

#### Frozen data contract

- `commands_data.yaml` is a strict list of records with exactly six keys, in
  order: `source`, `name`, `path`, `description`, `argument_hint`, `category`.
  All values are strings; all fields except `argument_hint` are non-empty.
- `skills_data.yaml` is a strict list of records with exactly seven keys, in
  order: `source`, `name`, `path`, `description`, `category`, `has_scripts`,
  `has_references`. The first five values are non-empty strings; the last two
  are strict booleans.
- Both schemas require unique normalized `source`, `name`, and `path`
  identities. `source` is the stable canonical relative identity for adapter
  and freshness joins; `name` and `path` retain the current native
  representation.
- The retired `power_level` field is rejected as an unknown key and is absent
  from the 70-record command input. `template-skill` and unmanaged skill
  entries are excluded from the 36-record skill input.

#### Validation, path safety, and atomic generation

- `generate_catalogs.py` validates exact keys/types, required values,
  allowlisted categories, uniqueness, and normalized relative POSIX paths
  before grouping or serialization.
- Path validation rejects absolute paths, backslashes, traversal or empty
  segments, `./` prefixes, non-canonical spellings, and embedded NUL bytes.
  The explicit NUL check prevents poisoned metadata from reaching filesystem
  operations.
- `scan_commands.py` and `scan_skills.py` write through adjacent temporary
  UTF-8 files and atomically replace their data files, cleaning temporary
  files on success or failure. Generator `--output` fully validates and
  serializes first, then flushes, `fsync`s, closes, and atomically replaces the
  destination; an existing destination survives a failed generation.
- Generated grouped catalog presentation intentionally omits only `source`;
  source remains in committed inputs for identity and freshness checks.

#### Freshness and verification

- `generate_catalogs.py --freshness` reloads both committed data files, runs
  authoritative canonical command/skill scans in memory, and deep-compares
  sorted records, including source identity, native names/paths, metadata, and
  skill flags. A count, identity, or field mismatch exits 1 with concise
  `stderr` and performs no write.
- Scanner and generator roots/data paths resolve from `Path(__file__).resolve()`,
  so invocation is independent of the caller's current working directory.
- `test-scan-catalogs.py` passed 7/7 suites covering schema errors, NUL/path
  safety, duplicates, freshness, canonical counts, all three command formats,
  managed-entry exclusion, CWD independence, generated totals, and atomic
  preservation. The accompanying `test-evcrate-help.py` independence and
  behavior suite passed 19/19.

The six implementation/data/test files changed for this phase are
`generate_catalogs.py`, `scan_commands.py`, `scan_skills.py`,
`commands_data.yaml`, `skills_data.yaml`, and `test-scan-catalogs.py`.

### Phase 01: Canonical metadata and scanner contracts

**Updated:** 2026-09-07  
**Status:** Complete  
**Plan:** [Phase plan](../plans/260906-2300-scan-command-skill-catalogs/phase-01-canonical-metadata-and-scanner-contracts.md)  
**Evidence:** [test report](../plans/reports/tester-260907-0036-canonical-metadata-and-scanner-contracts.md) and [code review](../plans/reports/code-review-260907-0038-canonical-metadata-and-scanner-contracts.md)

#### Canonical metadata

- Normalized all 70 canonical `.claude/commands/**/*.md` files to YAML mapping
  frontmatter with a non-empty string `description` and explicit string
  `argument-hint`; no-argument commands use `argument-hint: ""`.
- Kept changes frontmatter-only so command bodies remain unchanged.
- Regenerated `commands_data.yaml` with 70 deterministic records and
  `skills_data.yaml` with 36 deterministic records.

#### Scanner contracts

- `scan_commands.py` now exposes a frozen CommandLayout binding for root,
  Markdown/TOML/command-skill format, output, managed entries, and target naming
  maps/resolvers. Strict format-specific parsers reject malformed metadata,
  wrong consumed-field types, invalid UTF-8, missing managed entries, and
  duplicate names.
- Command scanning uses deterministic POSIX-relative records and an atomic
  adjacent temporary-file replacement. CLI roots and catalog outputs derive from
  `Path(__file__).resolve()`, making invocation independent of the caller's CWD.
- `scan_skills.py` now exposes a frozen SkillLayout binding with authoritative
  managed-entry and exclusion allowlists. It preserves arbitrary nesting in skill
  names, excludes the declared template skill, rejects missing/unsafe entries,
  and uses the same atomic-write boundary.
- `test-scan-catalogs.py` adds regressions for 70 commands/36 skills, all three
  command formats, Unicode and deep nesting, allowlists, malformed input,
  sentinel preservation, and root/script/temporary-CWD execution.
- `test-evcrate-help.py` adds an independence regression proving `ev-help.py`
  does not import scanner modules or generated catalog data while retaining
  existing guide and intent-routing behavior.

#### Verification

| Focused evidence | Result |
|---|---:|
| `test-scan-catalogs.py` | 5/5 suites passed |
| `test-evcrate-help.py` | 19/19 cases passed |
| Standalone command and skill scans | 70 and 36 records written atomically |

Phase 01 supplied the strict canonical inputs for the remaining scan/catalog plan.
Phase 02 now completes schema/freshness validation; seven-target adapter bindings
and projection regeneration remain later phases. `ev-help.py` remains intentionally
separate.

### Phase 01: Core hook enhancements

**Updated:** 2026-09-06  
**Status:** Complete for canonical hook behavior and focused tests

#### Features

- Split Bash input on top-level `&&`, `||`, `;`, `|`, newline, and background
  separators without splitting quoted or escaped text.
- Strip consecutive leading `KEY=value` assignments and grouping wrappers without
  evaluating shell input.
- Recognize anchored package-manager, language-runner, and build-tool forms,
  including Python module/setup builds, Node build scripts, Deno, Zig, .NET,
  Swift, and existing virtual-environment/package-manager forms.
- Apply the build exemption per segment rather than bypassing a complete command
  chain. A later `cat`, `grep`, `ls`, or equivalent read of protected output is
  still evaluated.
- Make path extraction invocation-aware: build-runner subcommand syntax is not
  emitted as a path, exploration operands become directory candidates with
  trailing `/`, and malformed quoting or shell substitutions receive
  conservative handling.

#### Verification

The three changed canonical suites were run directly on 2026-09-06:

| Suite | Passed | Failed |
|---|---:|---:|
| `test-scout-block.js` | 66 | 0 |
| `test-path-extractor.js` | 55 | 0 |
| `test-build-command-allowlist.js` | 95 | 0 |
| **Total** | **216** | **0** |

Coverage includes compound/env-prefixed builds, Python/Node/Deno/Zig/.NET/Swift
runner forms, direct and nested generated-directory exploration, adversarial
chains, quote/escape handling, `$(...)`/backtick/process substitution, and
virtual-environment executable allowance.

#### Boundary

Phase 01 established canonical hook behavior. Phases 02-04 completed ignore-file
directory semantics, target projections, and active runtime synchronization. The
hook remains a context-protection control, not a general shell authorization
allowlist.

### Phases 02-04: Ignore policy, projections, and verification

**Updated:** 2026-09-07  
**Status:** Complete  
**Evidence:** [Phase 04 test report](../plans/reports/tester-260907-0209-unblock-build-commands-phase-04.md) and [code review](../plans/reports/code-review-260907-0209-unblock-build-commands-phase-04.md)

#### Standardized ignore policy

- Canonical `.evcrate/source/.claude/.evcrateignore` and matcher fallback
  defaults now contain the same twelve heavy-directory rules, all with trailing
  `/`: `node_modules/`, `dist/`, `build/`, `.next/`, `.nuxt/`, `__pycache__/`,
  `.venv/`, `venv/`, `vendor/`, `target/`, `.git/`, and `coverage/`.
- Trailing `/` preserves directory-only semantics: bare lexical tokens such as
  `build` remain usable, while directory operands and descendants such as
  `build/`, `dist/app.js`, and `node_modules/pkg/index.js` remain blocked.
- Legacy custom bare-name rules and ordered negation behavior remain compatible;
  no `!dist` or `!build` workaround is required.

#### Projection and runtime parity

- Regenerated six target projections (`.omp`, `.pi`, `.copilot`, `.codex`,
  `.gemini`, `.antigravity`) from canonical Claude resources; each carries the
  standardized policy and segment-aware hook closure.
- Manifest and distribution checks report no projection drift. Published OMP
  policy, hook closure, and runtime helper match the generated OMP projection.

#### Verification matrix

| Evidence | Result |
|---|---:|
| Build, distribution build, and distribution check | 0 / pass |
| Allowed package/language/tool build forms, including compound and environment-prefixed commands | 0 / pass |
| Direct reads/searches of heavy directories and descendants | 2 / blocked |
| Adversarial build-plus-read chains | 2 / blocked |
| Canonical hook suites | 299 / 299 passed |
| Projected and published OMP runtime smoke (`0, 0, 2, 2`) | pass |

Focused suites cover path extraction, pattern matching, production build-command
classification, canonical ignore integration, hook process behavior, and
monorepo scenarios. Heavy-directory protections remain active while standard
build commands are unblocked.

The 2026-09-07 evidence records six focused suites at 299/299 passed,
`npm run distribute:check` as `status: "ok"` across seven adapters, and 21/21
bounded matrix rows (63 evaluations) passing across canonical, projected OMP, and
published OMP hooks.

### Documentation centralization

- Folded advisor distribution, checkpoint supervision, policy, wire, isolation,
  publication, and migration facts into the six core documents.
- Removed the two standalone advisor documents so
  [system architecture](./system-architecture.md) is the detailed controller and
  distribution authority.
- Standardized documented slash command/resource examples on `/cmd-*`, OMP `__`
  flattening, and Copilot `evcrate-cmd-*` projection names. This is a
  documentation/target convention; current scanner/parser enforcement remains a
  follow-up and no source command was renamed.
- Added cross-links among the [PDR](./project-overview-pdr.md),
  [code standards](./code-standards.md), [codebase summary](./codebase-summary.md),
  [roadmap](./project-roadmap.md), and [Pi migration](./pi-native-migration.md).

### Phase 9: DamHopper and Agent Store integration

#### Features

- Added the Phase 9 integration command and packed-consumer closure for canonical
  source, resource registry, and build manifests.
- Resolved package roots from explicit package/source/cwd inputs and preserved
  shared-JSON source fragments during publication planning.
- Kept DamHopper outside EVCrate artifact ownership; no direct registry, scope,
  manifest, or HOME mutation belongs to that adapter.

#### Adapter and compatibility evidence

- The integration client invokes the packed `evcrate` CLI as a bounded short-lived
  subprocess with fixed arguments and sanitized environment.
- Resource discovery/get, import preview/apply, scope, changes, publish, recover,
  and qualification-only health paths were covered by recorded fixtures.
- Historical evidence reports 14/14 Phase 9 integration tests and an aggregate
  212/212 focused result. Those numbers describe the feature worktree evidence and
  are not a live release claim.

#### Release boundary

Phase 9 proves the packed npm/adapter contract only. It does not claim a live
DamHopper or Agent Store release, installed vendor-CLI qualification, target cutover,
Python-free distribution, rollout, or `main` merge. Generated projections,
controller files, advisor policy, manifests, registry, scopes, and HOME roots remain
EVCrate-owned boundaries.

### Phase 10: TypeScript release packaging and per-target cutover

#### Features

- `scripts/build-manifests.mjs` builds each persisted target and the aggregate
  schema-2 build manifest through the TypeScript local-build path.
- The npm package allow-list ships compiled `dist/**`, target manifests, verified
  build manifests, generated target assets, and one exact CommonJS controller
  closure.
- TypeScript is authoritative by default for `claude`, `gemini`, `antigravity`,
  `codex`, `pi`, `omp`, and `copilot`; `agy` remains input-only for Antigravity.
- Cutover receipts record parity, closure, schema, timestamp, and notes; mixed
  Python/TypeScript atomic selection is rejected rather than split.
- The supported npm CLI build/check/publish/all/recover, version, health,
  advisor-settings, and publication paths execute through TypeScript. Compatibility
  engine types remain explicit transition boundaries.

#### Release boundary

The historical Phase 10 evidence records completed per-target cutover contracts and
255/255 full validation. That evidence covers the feature worktree and packed
artifact boundary; live vendor qualification, npm publication, rollout, and `main`
merge remain separate gates.

### Phase 11: Validation and staged rollout

**Updated:** 2026-09-04  
**Status:** Historical validation gate recorded complete; release and rollout remain
operator-controlled

#### Features

- Consumer-mode build resolution verifies bundled complete schema-2 manifests, output
  hashes, controller closure, ownership, and HOME policy without requiring authoring
  adapters.
- Consumer publication runs from an external working directory, preserves the
  installed package root, and supports dry-run, apply, repeat apply, and recovery.
- Deterministic tree hashes exclude `.gitignore` entries while retaining bounded
  traversal, mode/identity, symlink, and special-entry checks.

#### Release boundary

Historical Phase 11 evidence records a 7/7 rollout suite and 241/241 full
validation. These are separate historical totals from Phase 10's broader evidence,
not a new release claim. Phase 11 does not itself perform live vendor qualification,
npm publication, deployment, or `main` merge.

## Current unresolved questions

- Confirm whether this docs-facing changelog should remain the package's phase
  mirror when a separate release authority is introduced.
- Reconcile the historical 255/255 and 241/241 totals only if release documentation
  needs one aggregate denominator; do not infer a new total from those records.
- Decide where future source enforcement should validate the documented `cmd` prefix
  without renaming existing canonical resources.
