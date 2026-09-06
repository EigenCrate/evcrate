# Codebase Summary

**Generated:** 2026-09-06  
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

## Canonical scout-block hook

The canonical Claude scout hook lives under `.evcrate/source/.claude/hooks/`.
It protects context budget by matching extracted tool paths against the local
ignore policy. A recognized build/tooling segment skips only that segment's path
extraction; every later or chained segment is still checked. Blocked candidates
retain exit status `2`, while existing fail-open handling remains for malformed
JSON and unexpected hook errors.

| File | Responsibility |
|---|---|
| `hooks/scout-block.cjs` | Splits commands into shell segments, strips leading environment assignments and grouping wrappers, recognizes anchored package/language/tool runners, preserves virtual-environment execution allowance, and evaluates each non-exempt segment. |
| `hooks/scout-block/path-extractor.cjs` | Performs quote/escape-aware segment scanning, classifies runner syntax versus operands, extracts exploration paths, detects shell substitutions conservatively, and preserves or adds directory trailing `/` markers. |
| `hooks/scout-block/tests/test-build-command-allowlist.js` | Canonical `isBuildCommand` matrix for package managers, build tools, language runners, environment prefixes, malformed/substitution inputs, and direct directory commands. |
| `hooks/scout-block/tests/test-path-extractor.js` | Unit coverage for tool-input paths, contextual command extraction, directory operands, quote handling, segment splitting, and environment-assignment cleanup. |
| `hooks/tests/test-scout-block.js` | End-to-end hook coverage for allowed builds, blocked generated/dependency exploration, adversarial chains, process substitution, broad patterns, and virtual-environment executables. |

Targeted canonical runs on 2026-09-06 reported 216/216 passing assertions:

| Suite | Result |
|---|---:|
| `test-scout-block.js` | 66 passed |
| `test-path-extractor.js` | 55 passed |
| `test-build-command-allowlist.js` | 95 passed |

Phase 01 changes are canonical hook behavior and focused tests only. Ignore-file
directory semantics and generated target/runtime synchronization remain owned by
Phases 02 and 03 of the active plan.

## TypeScript modules

| Area | Responsibility | Representative entry points |
|---|---|---|
| `src/protocol/` | Versioned JSON, canonical JSON, target IDs, resource/publication/scope/settings/diagnostic payloads | `validation.ts`, `json.ts`, `canonical-json.ts` |
| `src/context/` | Immutable package/project/home/state/target context | `invocation-context.ts`, `target-registry.ts` |
| `src/manifests/` | Schema-2 target manifest loading and controller authorization | `manifest.ts`, `registry.ts`, `controller.ts` |
| `src/adapters/` | Seven fixed projection adapters and resource graph checks | `registry.ts`, `qualification.ts`, target subdirectories |
| `src/registry/` | Canonical scan, schema-1 records, compatibility and deterministic queries | `scanner.ts`, `schema.ts`, `store.ts` |
| `src/imports/` | Bounded external-source preview/apply and replay tokens | `preview.ts`, `apply.ts`, `handler.ts` |
| `src/scopes/` | Global/project assignment state, inheritance, revisions, and CAS | `state.ts`, `mutations.ts`, `changes.ts` |
| `src/advisor-settings/` | User policy transactions, lock, journal, preview token, and recovery | `coordinator.ts`, `transactions.ts`, `recovery.ts` |
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
17 production files under `.evcrate/source/.evcrate/bin/`:

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

The controller reads the required HOME policy, validates one direct ten-key
checkpoint, selects one candidate adapter, runs ordered probes and one final model
process under one deadline, emits one frozen success/failure envelope, and cleans up
its owner-only temporary workspace. Candidate/enabled backend details and limits
are maintained in [system architecture](./system-architecture.md).

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
