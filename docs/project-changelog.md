# Project Changelog

## Unreleased

**Updated:** 2026-09-06  
**Status:** Phase 01 complete; historical Phase 9/10/11 evidence retained; release remains Unreleased

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

Phase 01 changes the canonical scout hook and its focused tests only. Ignore-file
directory-only semantics, target projections, and active runtime synchronization
remain Phase 02/03 work. The hook remains a context-protection control, not a
general shell authorization allowlist.

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
