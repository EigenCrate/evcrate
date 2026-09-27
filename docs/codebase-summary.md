# Codebase Summary

**Generated:** 2026-09-27  
**Source:** Repomix v0.2.26 XML compaction (`repomix-output.xml`); `.repomixignore` excludes `docs/`, `plans/`, and `tests/`. This source map was cross-checked against current package metadata and implementation files.
**Package:** Private npm package `evcrate` 2.3.2; Node `>=22.19.0`. Binaries: `evcrate` (`dist/cli/evcrate.js`) and `evcrate-advisor` (`.evcrate/source/.evcrate/bin/evcrate-advisor`).
**Phase 01:** Launchability and identity is complete as of 2026-09-27; see the [phase plan](../plans/260927-0428-filesystem-cutover-review/phase-01-launchability-and-identity.md) and [review](../plans/reports/code-review-260927-1740-phase-01-launchability-and-identity.md). Phase 02 recovery/migration and capability-policy decisions remain open.

EVCrate builds and publishes validated projections of one canonical agent-harness source tree. The TypeScript CLI is the package control plane; the shared advisor controller remains a separate CommonJS runtime.

## Source-of-truth map

| Path | Role | Editing rule |
|---|---|---|
| `.evcrate/source/.claude/` | Canonical harness resources | Author here; do not hand-edit generated target copies. |
| `.evcrate/source/.evcrate/bin/` | Shared advisor controller source | Maintain the source closure; generated files come from their generators. |
| `.evcrate/targets/` | Schema-2 target manifests and overlays | Change target policy or declared overlays, then rebuild. |
| `.evcrate/source/{.agents,.codex,.gemini,.antigravity,.pi,.omp,.copilot}/` | Generated target projections | Regenerate; never treat as authoring roots. |
| `.evcrate/registry.json` | Schema-1 canonical resource records | Regenerate from the canonical scan; distinct from target/build manifests. |
| `src/` | TypeScript control plane | Primary package implementation. |
| `scripts/` | Generation, package, and release tooling | Follow each script's declared authority; generated outputs are not edited by hand. |
| `plugin/`, `viewer/src/` | Advisor plugin backend/package and shared UI | See the worker and UI guides for their separate qualification boundaries. |
| `tests/` | Contract and behavior suites | Focused regression and integration tests, not live vendor qualification. |
| `docs/`, `plans/` | Maintained documentation and work plans | See the documentation map below. |

The persisted projection targets are `claude`, `codex`, `gemini`, `antigravity`, `pi`, `omp`, and `copilot`. `.agents` is a Codex companion output root, not an eighth adapter. Generated projections and manifests are build artifacts.

## TypeScript module map

| Area | Responsibility | Representative files |
|---|---|---|
| `src/protocol/` | Bounded JSON and versioned request/result contracts | `validation.ts`, `resource-payloads.ts`, `publication-payloads.ts`, `advisor-settings.ts`, `index.ts` |
| `src/context/` | Immutable package, project, HOME, state, and target context | `invocation-context.ts`, `path-resolution.ts`, `target-registry.ts` |
| `src/manifests/` | Target manifest loading, build metadata, controller closure | `manifest.ts`, `registry.ts`, `controller.ts` |
| `src/adapters/` | Seven fixed target projections and resource/catalog transforms | `registry.ts`, `qualification.ts`, target subdirectories |
| `src/distribution/` | Local build/check, publication planning, staging, apply, and recovery | `local-build.ts`, `publication-plan.ts`, `publication.ts`, `publication-recovery.ts` |
| `src/filesystem/` | Host/portable paths, hashing, atomic writes, and locks | `paths.ts`, `hashing.ts`, `atomic.ts`, `locking.ts` |
| `src/registry/` | Canonical resource scan, schema, validation, and queries | `scanner.ts`, `schema.ts`, `store.ts` |
| `src/imports/` | Bounded explicit-source preview/apply and materialization | `source.ts`, `preview.ts`, `apply.ts`, `handler.ts` |
| `src/scopes/` | Global/project assignments, revisions, and CAS | `identity.ts`, `state.ts`, `mutations.ts`, `changes.ts` |
| `src/advisor-settings/` | User-policy snapshots, journaled transactions, and recovery | `policy-files.ts`, `coordinator.ts`, `transactions.ts`, `recovery.ts` |
| `src/cli/`, `src/errors/` | One-shot dispatch, output, stable errors, and exit mapping | `arguments.ts`, `dispatch.ts`, `main.ts`, `control-plane-error.ts` |

The CLI resolves context, validates one invocation, dispatches one operation, writes one validated result, and exits. It exposes version/health, resource and import operations, scopes/changes, advisor settings, and distribution build/check/publish/recover operations. There is no canonical root `distribute.py` runtime.

## Build, publication, and installer flow

`npm run build` compiles the TypeScript control plane; its `prebuild` generates the canonical runtime brief, advisor runtime modules, and controller inventory. `npm run distribute:build` creates target projections and verified build manifests; `npm run distribute:check` checks the generated state. Publication consumes a verified build and publishes the shared advisor controller under HOME plus target harness files in HOME or project scope. Recovery is scope-isolated.

The Linux standalone installer unpacks a verified package snapshot and launches its staged CLI for a version smoke. Phase 01 now provisions mandatory launch roles independently of archive permission bits and runs the staged CLI by its real path. The separate Windows qualification boundary remains installer lifecycle and `version --json`; this Phase 01 work does not qualify broader Windows runtime behavior.

## Phase 01 launchability and identity

Publication execution intent is derived from the published relative path and published shebang bytes (with explicit launcher roles), not from source permission metadata. The plan carries execution intent separately from content hashes and CAS identity: a content-equal no-op stays a no-op, while new or changed POSIX launchers receive the required execute bit. Required staging/install chmod failures are errors rather than successful fallbacks.

`hashFile` remains a raw byte SHA-256. Resource file roots use a domain-separated file identity shared by the canonical registry scanner/store and direct-file imports; directory roots retain their tree identity. A suffixless file therefore cannot alias a directory identity. Capability assessment remains separate from content hashing.

Advisor state and history comparisons ignore ctime and permission-only changes while retaining object/type metadata and explicit byte equality at state/history CAS boundaries. Lock ownership continues to bind token/process identity and the lock object. Baseline Git evidence normalizes executable-only mode metadata while preserving content/index, conflict, and rename identity.

The committed schema-1 `.evcrate/registry.json` was regenerated with the new file hashes. Existing records with prior raw-file hashes are not silently reinterpreted; `npm run generate:registry` performs a canonical rescan. Phase 01 did not decide whether execute-bit-only capability changes are an exception to chmod-invariance or set a durable-journal recovery/migration policy.

## Advisor plugin and support boundaries

The plugin worker and shared UI are documented separately in [advisor-plugin-worker.md](./advisor-plugin-worker.md) and [advisor-plugin-ui.md](./advisor-plugin-ui.md). The standalone picker/reader source was removed; joint G4 qualification/sign-off and standalone retirement are not established by source cutover alone. Cross-project history contracts are in [all-project-advisor-history.md](./all-project-advisor-history.md).

Live advisor vendor qualification, HOME rollout, npm publication, deployment, and broader Windows runtime support remain separate operator/release gates. See the [system architecture](./system-architecture.md) for implementation contracts, the [PDR](./project-overview-pdr.md) for requirements, the [code standards](./code-standards.md) for normative rules, the [roadmap](./project-roadmap.md) for current phase status, and the [changelog](./project-changelog.md) for dated evidence.