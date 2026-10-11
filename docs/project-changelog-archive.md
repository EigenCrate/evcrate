# Project Changelog Archive

Historical phase entries moved from [project-changelog.md](./project-changelog.md) to keep the maintained phase mirror below the repository's 800-line documentation limit. Paths and evidence are preserved; current Phase 09 milestone status remains in the main changelog.

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

### Advisor mentoring, recovery, and audit — Phase 02

**Updated:** 2026-09-07  
**Status:** Complete (100%)  
**Plan:** [Phase plan](../plans/260907-1208-advisor-mentoring-recovery-audit/phase-02-wait-cancellation-and-cleanup.md)

- Split runner timing into finite `probe` mode and indefinite `generation` mode.
  Generation has no deadline; input, streams, output, and termination remain
  bounded.
- Added monotonic elapsed progress warnings on `stderr`, separate from the
  single terminal JSON result, with bounded non-blocking delivery and suppression
  after the warning cap.
- Made cancellation dominant across construction, spawn, process, parsing,
  cleanup, and other asynchronous boundaries; no provisional advice can win
  after cancellation.
- Termination uses detached POSIX process groups with TERM/KILL escalation and
  leader/group liveness plus close/reap verification.
- Workspace cleanup is observable: removal is confirmed only when the absence
  probe returns **ENOENT**; other results remain `unconfirmed` and cannot coexist
  with successful advice.
- The runner/controller boundary carries cleanup uncertainty from probes and
  generation, preserving the primary probe or execution error while exposing
  the cleanup outcome.
- The implementation and focused-test closure covers `runner.cjs`,
  `isolated-workspace.cjs`, `controller.cjs`, `profile.cjs`, `errors.cjs`,
  `controller-envelope.cjs`, `evcrate-advisor`, the runner/controller tests,
  the real 31-second smoke scenario, and the fake Codex fixture.

Verification recorded for this phase: 65/65 advisor-controller tests passed; the
real smoke scenario completed in 31.25s with one launch and three elapsed
warnings; `npm run distribute:check` and `npm run release:check` exited
successfully. Sol Cycle 3 signed off at 9/10, and Astra mentor approval was
recorded.

Phase 03, adapter qualification and terminal parsing, is ready to start and
consumes the Phase 02 timing interface.


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

- Regenerated seven generated projection roots (`.agents`, `.omp`, `.pi`,
  `.copilot`, `.codex`, `.gemini`, `.antigravity`) from canonical Claude resources;
  each carries the standardized policy and segment-aware hook closure.
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

## [2.0.0] - 2026-09-09

**Release commit:** `628183eb` (`chore(release): 2.0.0 [skip ci]`)  
**Status:** Phase 10 deterministic acceptance complete.

- Aligns the v2.0.0 release with the pure TypeScript control plane, seven-target
  projections, schema-2 manifests, and v2 advisor routing/retry orchestration.
- Deterministic acceptance: 272/272 tests, 29/29 controller-closure files, and
  9/9 sanitized mentoring baseline cases passed.
- Live vendor qualification and production `$HOME/.evcrate/` publication remain
  operator-gated; no live quality or rollout claim is made.


### 2026-09-08 — test(advisor): verify deterministic Phase 10 acceptance and establish synthetic improvement baseline (phase-10)

**Status:** Phase 10 DONE for deterministic acceptance (272/272; 100%). Live
vendor qualification, empirical paired baseline, and real HOME publication
remain explicit operator gates.  
**Plan:** [Phase 10 plan](../plans/260907-1208-advisor-mentoring-recovery-audit/phase-10-acceptance-qualification-and-improvement-evaluation.md)  
**Evidence:** [QA acceptance report](../plans/reports/qa-260908-1915-phase10-acceptance.md) and
[acceptance matrix](../plans/260907-1208-advisor-mentoring-recovery-audit/acceptance-matrix.md)

- Added disposable-HOME end-to-end fixtures for controller, state/history, human-gate,
  capability, command, and mentoring-evaluation behavior.
- `tests/distribution/phase10-test-helpers.mjs` creates owner-only temporary roots,
  fake Codex/OMP routes, a Git baseline, bounded subprocess invocation, and a
  strict child-environment allowlist with token/PAT scrubbing.
- `tests/fixtures/mentoring-evaluation/corpus.json` defines nine sanitized cases
  (one positive control and eight failure-oriented cases) over five rubric
  dimensions: direction accuracy, scope discipline, safety invariants,
  actionability, and evidence grounding. Passing threshold: average score `4.0`.
- `evaluator.mjs` supplies deterministic scoring, generic-filler rejection,
  decision-alignment checks, evidence grounding, and destructive-command safety
  probes. The corpus is a synthetic baseline, not a live model-quality benchmark.

#### Dedicated acceptance suites

| Suite | Cases | Observable coverage |
|---|---:|---|
| `phase10-controller-scenarios.test.mjs` | 7 | Primary success, fatal/malformed input, stream handling, unsupported route, cancellation, and child credential scrubbing |
| `phase10-state-and-history.test.mjs` | 3 | Stale evidence, idempotent replay/history inspection, and dirty-user-baseline preservation |
| `phase10-human-gate.test.mjs` | 1 | Three failed corrections enter `needs_human`; fourth remediation is denied |
| `phase10-commands-and-evaluation.test.mjs` | 4 | Seven-target declarations, V2/`--advice` command contract, corpus pass, and adversarial counsel rejection |
| **Dedicated total** | **15** | **15/15 passed** |

#### Deterministic evidence

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

#### Explicit boundary

- Deterministic tests verify repository contracts, state transitions, process
  behavior, capability declarations, sanitized evaluation, packaging, and
  disposable-HOME preservation. Fake CLIs do not authenticate vendors or prove
  paid model quality.
- All seven targets declare mentoring support with `writeChecks: advisory-only`;
  generated markers do not establish live host enforcement or a universal
  pre-edit hard block.
- No real credentials, external vendor APIs, or empirical paired executor runs
  were used. Live route/auth/model/effort/no-tool qualification and the paired
  improvement baseline remain **UNVERIFIED (GATED)**.
- Tests use disposable HOME only; production `$HOME/.evcrate/` was not modified.
  HOME publication requires an operator-selected route and explicit authorization
  before `npm run distribute:all` or an equivalent staged publish/apply action.

This evidence closes the deterministic Phase 10 acceptance surface without
claiming live qualification, measured quality improvement, or authorized rollout.

### 2026-09-08 — feat(distribution): generate projections, synchronize build manifests, and stage coherent cutover (phase-09)

**Status:** Phase 09 DONE (2026-09-08; 100%); superseded by the Phase 10
deterministic acceptance entry above; the v2.0.0 milestone is recorded above
**Plan:** [Phase 09 plan](../plans/260907-1208-advisor-mentoring-recovery-audit/phase-09-projection-publication-and-documentation-cutover.md)  
**Evidence:** Full controller closure parity (29 files), 24/24 adapter projection tests, 7/7 cutover tests, 11/11 publication recovery tests, 15/15 installer tests, 5/5 private unpack rollout tests, passing `npm run distribute:check` and `npm run release:check`

- Synchronized all seven target projections (`claude`, `codex`, `gemini`, `antigravity`,
  `pi`, `omp`, `copilot`) from canonical `.claude/` sources via `npm run distribute:build`
  and verified parity with `distribute:check`.
- Added `"generate:registry"` script to `package.json` and synchronized `.evcrate/registry.json`
  and `.evcrate/build-manifest-*.json` via `npm run generate:all`.
- Synchronized **ADVISOR_CONTROLLER_FILES** across `install.sh`, `install.ps1`,
  `scripts/generate-controller-inventory.mjs`, and `src/manifests/controller.ts`, establishing
  strict 29-file closure parity and closing controller closure digest mismatches.
- Verified standalone unpack installers under Linux network namespace isolation
  (`tests/distribution/private-unpack-rollout.test.mjs`) and subprocess tests
  (`tests/installers/*.test.mjs`): package hash invariance, controller closure verification,
  clean-new/whole-old-backup mutable state semantics, atomic locking, and published target preservation.
- Verified publication atomic promotion, CAS conflict protection, and crash recovery in
  disposable HOME (`tests/distribution/publication-apply.test.mjs`,
  `tests/distribution/publication-recovery.test.mjs`), with reviewer smoke tests confirming
  active/incomplete task state and history sentinels remain isolated and intact.
- Documented operator cutover sequence, quiescence, settings workflow, and rollback runbooks
  across system architecture, codebase summary, and roadmap.
- Recovery semantics are explicit: `recover` rolls back a valid interrupted
  `staged`/`promoting` transaction, finalizes a `committed` cleanup window, and
  returns `none` when idle; it never rolls back a completed release. A completed
  release rollback uses installer `rollback` to select a prior snapshot, followed
  by publication `apply` from that snapshot. Post-first-promotion collisions
  retain the journal and fail closed until the external path is reconciled.
- The cutover runbook records the exact V2 policy shape and V1 transport boundary,
  explicit `get -> prepare v2 -> preview -> apply` migration, non-clobbering backup,
  and quiescence inspection from the original project root/HOME. Live pending
  processes or unknown inspection status block deployment; HOME apply remains a
  Phase 10 operator gate.

### 2026-09-08 — feat(advisor): integrate cooperative V2 mentoring gates across commands and harnesses (phase-08)

**Status:** Complete (100%); Lead Mentor approval: 10/10; user approved  
**Plan:** [Phase 08 plan](../plans/260907-1208-advisor-mentoring-recovery-audit/phase-08-workflow-and-harness-gate-integration.md)  
**Evidence:** [Phase 08 integration tests](../tests/adapters/phase08-mentoring-integration.test.mjs)

- Added one canonical `evcrate-advisor-checkpoint/v2` dispatcher and state
  lifecycle for all 16 canonical code/cook/bootstrap/fix consumers:
  `init` -> checkpoint reserve -> controller claim/attach -> state get ->
  disposition -> outcome -> complete, with an explicit human-decision branch.
  Generated projections and manifests retain the canonical source authority.
- Replaced implicit executor behavior with four explicit dispositions:
  `accept`, `reject-with-evidence`, `need-evidence`, and `reconcile`, bounded by
  authorized scope, fresh evidence, and actual changed-path review.
- Separated the three-cycle executor review cap from durable correction exhaustion.
  Failed correction outcomes persist exact one-indexed ordinals 1, 2, and 3;
  the third failure enters `needs_human`, and conversational approval cannot
  bypass the durable state gate.
- Preserved the user's baseline and unrelated edits through pre-write baseline
  checks and post-change actual-path attribution. Concern-free advice supports a
  validated no-change outcome and completion without invented edits.
- Added **TARGET_MENTORING_CAPABILITIES** and target projection rendering. The
  seven-target capability matrix is:

  | Target | Mentoring | Write checks |
  |---|---|---|
  | Claude | supported | advisory-only |
  | Codex | supported | advisory-only |
  | OMP | supported | advisory-only |
  | Antigravity | supported | advisory-only |
  | Gemini | supported | advisory-only |
  | Copilot | supported | advisory-only |
  | Pi | supported | advisory-only |

- Real disposable-HOME CLI integration covers bounded correction (Path A),
  concern-free/no-change completion (Path B), exact 1/2/3 correction ordinals,
  durable `needs_human` blocking, all 10 workflow JSON examples, all 16
  dispatcher references, and all seven projections. Aggregate evidence is
  279/279 tests; this proves fixture-backed lifecycle and projection behavior,
  not paid inference, live vendor qualification, hostile-process containment,
  or HOME publication.


### 2026-09-08 — feat(advisor): add sanitized audit history and outcome review tools (phase-07)

**Status:** Complete (100%); Phase Lead/Senior Mentor sign-off: unconditional
approval, 10/10  
**Plan:** [Phase plan](../plans/260907-1208-advisor-mentoring-recovery-audit/phase-07-audit-history-and-outcome-review.md)  
**Evidence:** [Phase 07 QA verification](../plans/reports/tester-260908-1344-phase07-final-verification.md)

- Added strict version-1 execution and outcome history contracts with bounded
  `execution.json` (128 KiB) and `outcome.json` (64 KiB) records under the
  owner-only `$HOME/.evcrate/advisor-history/<project-id>/<task-run-id>/<consultation-id>/`
  hierarchy.
- The controller persists a started snapshot before model launch, updates
  bounded attempt facts, and settles terminal <code>ADVICE_READY</code>/<code>FAILED</code> execution
  through compare-and-set (CAS) identity checks. Linked outcomes retain
  disposition, evidence revision, actual changed paths, validation, result, and
  correction number.
- History writes are optional rich audit: storage failure exposes
  `audit_status: "degraded"` without failing usable inference, launching another
  model, or resetting required task state. Sanitization excludes credentials,
  raw stderr, hidden reasoning, and raw vendor logs.
- Added managed `evcrate-advisor history list|show|export|prune` operations:
  metadata-only scoped pagination, sanitized inspection, explicit safe
  non-existing-destination export with redaction review, and dry-run/apply
  retention/quota pruning that protects active records and unrelated projects.
- Registered the four history modules in the generated advisor closure, expanding
  the inventory from 25 to 29 production files.
- Verification: 204/204 advisor-controller tests passed across 16 files; the
  targeted Phase 07 history suites passed 19/19. The final mentor review resolved
  all seven implementation items and approved Phase 07 unconditionally at 10/10.

### 2026-09-08 — feat(advisor): add durable task and correction gates (phase-06)

**Status:** Complete (100%); user-approved 2026-09-08 after two review cycles
and a senior mentor challenge.
**Plan:** [Phase plan](../plans/260907-1208-advisor-mentoring-recovery-audit/phase-06-task-state-scope-and-human-handoff.md)

- Added owner-only 64 KiB task state, selected-file/Git baseline identity,
  short process-identity locks, atomic CAS writes and bounded replay protection.
- V2 CLI inference requires a matching reserved checkpoint; terminal linkage
  persists before advice is emitted. Missing/unsafe state blocks dependent work
  without relaunching inference or resetting unresolved episodes.
- Added explicit disposition/outcome/scope/recovery operations. Three failed
  advised corrections block the next correction; observed continuation permits
  exactly one additional correction without resetting the counter.
- Local terminal confirmation is cooperative, not protection against same-user
  terminal automation. Windows state and authentic per-host event linkage remain
  unqualified; no host-wide enforcement claim.
- Verification: 185/185 advisor-controller tests; `npm run build` and
  `npm run release:check` passed against the generated 25-file controller
  closure. Disposable-HOME actual CLI smoke ran real syntax validation through
  three failures, rejected a fourth correction, exercised an automated PTY
  confirmation, then resolved/completed with sentinel preserved.
  Cycle 2 resolved C1 (no-correction completion), C2 (ledger capacity headroom),
  C3 (preflight human decision replay and cancellation), and C4 (compound Git
  staged rename identity and index metadata attribution). Fixture backend
  only; no paid inference or real user-authorization claim from the smoke.

### 2026-09-08 — feat(advisor): add bounded primary retry and one-shot backup orchestration (phase-05)

**Status:** Complete (100%)  
**Plan:** [Phase plan](../plans/260907-1208-advisor-mentoring-recovery-audit/phase-05-primary-retry-and-backup-orchestration.md)

- Added an explicit sequential consultation state machine with up to four
  primary model launches. Positively classified transient failures use
  cancellable 10/20/30-second backoff and stop on the first success.
- After four primary transient failures, or a route-local preflight skip before
  any primary model launch, the configured backup is qualified and invoked once.
  Backup failures are terminal and never retried. Trusted provider cooldowns use
  the larger of configured backoff and cooldown; excessive cooldowns fail closed.
- Qualification-to-spawn identity binding rechecks the invocation executable and
  resolved path before each launch. Drift fails closed without counting a model
  launch; attempt records retain route, slot, model-started, classification,
  retry-delay, and cleanup facts.
- Evidence: 140/140 advisor-controller tests passed; `npm run release:check`
  exited 0. Astra review sign-off is 8/10, and Sol mentor counsel is recorded.
- No provider substitution, parallel hedge, backup retry, or paid
  mentoring-quality claim is made.

### 2026-09-08 — feat(advisor): package canonical mentoring brief and preserve structured V2 advice (phase-04)

**Status:** Complete (100%)  
**Plan:** [Phase plan](../plans/260907-1208-advisor-mentoring-recovery-audit/phase-04-mentor-brief-evidence-and-results.md)

- Established
  `.evcrate/source/.claude/skills/advisor-strategy/references/brief-contract.md`
  as the single source for runtime mentor instructions. The
  `brief-contract.md` → `scripts/generate-runtime-brief.mjs` →
  `runtime-brief.generated.cjs` chain emits the standalone closure artifact
  with a digest and `evcrate-advisor-v2-*` build identity; the generated file is
  never hand-edited.
- `checkpoint-contract.cjs` owns `formatMentorPrompt`: one generated brief is
  followed by explicitly quoted v2 checkpoint data. Claude, Codex, OMP
  (`omp-parser`), and Pi receive the same packaged prompt; each adapter only
  performs transport parsing and sends raw assistant text to the shared parser.
- `contracts-v2.cjs` strictly parses exactly seven advice-body fields:
  `recommendation`, `rationale`, `must_fix`, `cautions`, `assumptions`,
  `success_checks`, and `unresolved_questions`. A body must be one JSON object:
  markdown fences and leading/trailing prose are rejected, as are unknown or
  missing fields, malformed lists, control characters, sensitive material, and
  raw stack frames from Node, Python, Go, or Rust. Ordinary prose that is not a
  raw frame remains accepted.
- Public `validateEnvelopeV2` recomputes the checkpoint digest with
  `computeCheckpointDigestV2`, checks task/checkpoint identity and revisions,
  requires `expected_build_identity` to equal `receipt.build_identity`, and
  requires a successful attempt's route effort to equal `receipt.effort`.
  `receiptV2` and the V2 builders enforce equality with the generated
  **ADVISOR_BUILD_IDENTITY**.
- V2 controller envelopes preserve correlation/task/checkpoint identity,
  revisions, checkpoint digest, receipt/build identity, attempt summaries, and
  sanitized failures. V1 remains an explicit compatibility path; Phase 04
  adds no retry or provider-switch behavior.
- Evidence: 118/118 advisor-controller tests passed in approximately 7.3
  seconds; `npm run build` and `npm run release:check` exited 0. Astra's
  post-fix sign-off is 8/10; all four critical correspondence/RAW_STACK
  issues are resolved. Sol mentor counsel records the Phase 05 preconditions.
  No paid mentoring-quality claim is made.

### 2026-09-08 — feat(advisor): qualify adapters, enforce strict terminal parsing, and adapt generation limits (phase-03)

**Status:** Complete (100%)  
**Plan:** [Phase plan](../plans/260907-1208-advisor-mentoring-recovery-audit/phase-03-adapter-qualification-and-terminal-parsing.md)

- Qualified the fixed Claude, Pi, OMP, and Codex adapter contracts for exact
  model/effort routes, noninteractive isolated sessions, read-only/no-tool
  controls, bounded machine-readable output, and typed failures. Antigravity
  remains an explicit unavailable candidate rather than an inferred backend.
- Claude now rejects nonempty `permission_denials`, tool/nonterminal stop reasons,
  model drift, malformed result envelopes, and over-limit output.
- Pi now requires strict user-then-assistant message sequencing, exact route and
  workspace attestation, a settled terminal lifecycle, and
  `stopReason: "stop"` before returning advice.
- OMP now requires affirmative redacted usage readiness: a matching usable
  report plus positive provider capacity. Its strict parser rejects tool
  results, retries, unknown events, and undocumented `advisor_yielded`.
- Codex now validates exact auth/model/effort capability probes and a complete
  terminal JSONL thread/item lifecycle with no disallowed tool or side-effect
  items.
- All enabled adapters use `resolveInvocationLimits`; generation mode removes
  `timeoutMs` while retaining bounded streams, output, termination, and warning
  controls. Probes keep finite deadlines.
- Focused Claude, Pi, OMP, fixture, runner, and controller coverage records the
  rejection and generation-limit contracts without claiming live vendor or paid
  route qualification.

## Current unresolved questions

- Confirm whether this docs-facing changelog should remain the package's phase
  mirror when a separate release authority is introduced.
- Reconcile the historical 255/255 and 241/241 totals only if release documentation
  needs one aggregate denominator; do not infer a new total from those records.
- Decide where future source enforcement should validate the documented `cmd` prefix
  without renaming existing canonical resources.
