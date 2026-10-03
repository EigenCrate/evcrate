# Phase 06 — Publication and Explicit Activation Report

## Outcome

Phase 06 publication integration is implemented for the distinct persisted target `vscode`. The native bundle is staged and published under the isolated `.evcrate-vscode` root for HOME and project scopes, with separate publication ownership from `.copilot`, `.claude`, and VS Code user settings. The publication contract and dedicated tests keep editor activation explicit and outside EVCrate's publication transaction.

**Phase gate:** implementation and code review are recorded complete in the [Phase 06 contract](../phase-06-publication-and-activation.md) and [code review](./code-review-261003-1916-phase-06-publication-and-activation.md). **Release readiness is conditional:** this establishes publication, not qualified native support. Phase 07 release qualification and Phase 08 native runtime evidence remain required before support is announced.

## Scope and implementation

The Phase 06 deliverables are the eight files in the authorized change set:

| Area | Implementation |
|---|---|
| Target declaration | `.evcrate/targets/vscode/manifest.json` declares schema 2, adapter `dist/adapters/vscode/index.js`, output root `.evcrate-vscode`, matching HOME/project binding, promotion order 50, `.evcrate.json` preservation, and fail-closed unmanaged-collision rejection. The registry lists `vscode` as the eighth persisted target. |
| Build staging | `src/distribution/local-build-staging.ts` dispatches `vscode` to `vscodeAdapter` and other targets through the projection registry, validates each target build before copying declared outputs, and preserves executable mode on staged executable files on POSIX. `.evcrate-vscode` is included in the package-root legacy-root cleanliness check. The shared advisor controller remains separately staged under `.evcrate/bin`. |
| Build receipt validation | `src/distribution/manifest.ts` enforces an 8 MiB bounded schema-2 build manifest with exact top-level keys. Build verification compares declared source/adapter hashes when supplied and checks controller and output hashes; mismatches fail closed. |
| Name projection | `src/adapters/vscode/names.ts` builds deterministic maps for commands, skills, agents, styles, and workflows. It validates kebab-case names and the 64-character limit, distinguishes native, approximated, archived, and managed-static dispositions, and rejects case-insensitive collisions in the generated skill-directory namespace. |
| Generated receipts | `.evcrate/build-manifest-vscode.json` records the selected target receipt; `.evcrate/build-manifest.json` records the aggregate build. Both currently declare schema 2 and `validation.complete: true`. The selected receipt records `.claude`, `CLAUDE.md`, and `vscode/manifest.json` source hashes, the adapter entry-point hash, the shared advisor-controller hashes, owner/output hashes, and the `vscode` HOME policy. The aggregate receipt records all eight target policies. |
| HOME/project regressions | `tests/distribution/publication-vscode-home.test.mjs` covers isolated/idempotent HOME publication, collision rejection, and post-plan compare-and-swap conflict. `tests/distribution/publication-vscode-project.test.mjs` covers project publication with preserved user files and scope-isolated recovery. |

### Publication and ownership contracts

- HOME and project publications bind only `.evcrate-vscode`; project and HOME state/recovery remain scope-specific. HOME publication also owns the pre-existing shared advisor controller at `.evcrate/bin` as a separate phase.
- The manifest preserves the installed `.evcrate-vscode/.evcrate.json` user policy and rejects an unmanaged collision at a managed path rather than silently overwriting it. The project test also verifies an unrelated user document survives and that publication does not create `.evcrate` or a HOME `.evcrate-vscode` root for a project-only request.
- The HOME test checks that `.copilot`, `.claude`, and `.vscode` are not created as side effects. The registration example and activation guide are published as inert bundle artifacts; publication does not write VS Code settings, profiles, or registration state. A user reviews the bundle and explicitly registers one selected installation outside publication atomicity.
- Publication evidence means bytes/ownership were built and installed under the declared roots. It does not prove Local discovers, activates, or safely executes the plugin, nor does it qualify coexistence with existing CLI skills/hooks.
- Legacy aggregate build state remains distinct from a fresh eight-target build: an old seven-target selection does not acquire `vscode` ownership retroactively. Current aggregate policy contains the shared controller plus all eight persisted targets.

## Validation evidence

The results below are recorded by the Phase 06 code-review report; they were **not rerun for this documentation task**. The reviewed report marks the implementation approved (9.3/10) with no critical or high-priority findings.

| Recorded command / evidence | Result in the review report |
|---|---|
| `npm run build` | Success; zero errors. |
| `node --test tests/distribution/publication-vscode-home.test.mjs tests/distribution/publication-vscode-project.test.mjs` | 5/5 passed. The inspected tests assert HOME isolation/idempotence, marker completion, unmanaged collision and CAS failure, user-file preservation, and independent HOME/project recovery. |
| `npm run test:publication` | 91/91 passed. |
| `npm run test:adapters` | 99/99 passed. |
| `npm run test:cli` | 56 passed; one Windows-only suite skipped on Linux. |
| `npm run test:cutover && npm run test:validation-rollout` | 7/7 cutover and 6/6 validation-rollout tests passed. |

**Test-trail note:** An earlier publication-suite run recorded 90/91, with the oversized-result case rejected in `discoverVscodeWorkflows`. A subsequent rerun and the code review recorded 91/91. The available reports do not confirm the failure's root cause or a specific fix; the green rerun is the final recorded result, without attributing it to an unverified change.

The build receipts were inspected as data, not regenerated or independently re-verified here: the target receipt is schema 2, lists `.evcrate` and `.evcrate-vscode` output roots, and records a `vscode` policy with `.evcrate.json` preservation and collision rejection. The aggregate receipt is schema 2 and lists all eight target policies. These recorded fields are not a substitute for Phase 07 candidate qualification.

## Review findings and remaining work

1. **Adapter hash closure (required before release candidate).** The target manifest currently has `adapter_sources: []`; the selected build receipt hashes only `dist/adapters/vscode/index.js`. The code review notes that changes to re-exported implementation files may therefore not invalidate a build if the barrel stays unchanged. Enumerate the compiled adapter closure or generate it deterministically, then regenerate and qualify the build receipts in Phase 07.
2. **Native encoding/line endings (runtime question).** The review leaves platform-specific VS Code Local line-ending/encoding normalization unresolved. Resolve using pinned-runtime evidence in Phase 08 rather than assuming the generated CJS closure is sufficient.
3. **Native end-to-end behavior remains unqualified.** The earlier Phase 00 completion receipt records a pre-live-verification state in which `code` was absent. It is superseded for the live gate by the newer [Phase 00 runtime report](./phase-00-native-contract.md) and current [progress reconciliation](../progress.md): VS Code 1.140.0 and Copilot Chat 0.68.0 were verified and the Phase 00 live gate was cleared. Phase 08 still must qualify the immutable Phase 07 candidate in real Local scenarios, including root/context transport, HOME/project precedence, duplicate-copy and hook coexistence, and supported platform behavior. Phase 00 feasibility evidence is not Phase 08 feature proof.
4. **Next release gate.** Run the Phase 07 automated qualification against the completed candidate after its writers finish. Keep release-candidate evidence, publication evidence, and native behavior evidence separate; do not represent this phase as general VS Code Local support.

## Readiness and metrics

| Measure | Status |
|---|---|
| Phase 06 implementation/review | Complete per the phase contract and approved code-review report. |
| Dedicated publication tests | 5/5 passed in recorded review evidence. |
| Publication / adapter suites | 91/91 and 99/99 passed in recorded review evidence. |
| CLI / cutover / validation-rollout suites | 56 passed + 1 skipped; 7/7 and 6/6 passed in recorded review evidence. |
| Build | Successful in recorded review evidence; build manifests currently record schema 2 and `validation.complete: true`. |
| Automated release qualification (Phase 07) | Pending; not demonstrated by this report. |
| Native activation qualification (Phase 08) | Pending end-to-end candidate/scenario evidence; Phase 00's live-runtime feasibility gate is cleared on the verified workstation. |
| Native-support release claim | Not ready. |
| Coverage percentage, documentation update frequency | Not measured. |

## Unresolved questions

- What exact compiled VS Code adapter source set must participate in the build hash, and how will Phase 07 ensure the set cannot silently drift?
- Does the pinned Local runtime require platform-specific line-ending or encoding normalization?
- What are the pinned runtime's actual project/HOME precedence, active-root transport, and duplicate skill/hook behavior? These remain Phase 08 evidence questions, not publication guarantees.
