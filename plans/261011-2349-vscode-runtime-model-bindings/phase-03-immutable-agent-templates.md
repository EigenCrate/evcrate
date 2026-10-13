# Phase 03 — Immutable templates and truthful build intent

## Context links
- [Plan](./plan.md); [design contracts](./design-contracts.md); [baseline](./reports/baseline-analysis.md).
- Dependencies: Phases 01–02 PASS. Coordinate with Phase 04 shared schema owner.

## Overview
- Date: 2026-10-12; priority P1; status: DONE (2026-10-12; 100%; 665 passed, 0 failed, 1 skipped; user approved); implementation review: complete; design-summary review: [Advisor](./reports/advisor-review.md); verification: [test suite report](../reports/tester-261012-0844-phase-03-test-suite.md), [tester report](../reports/tester-261012-0808-phase-03-immutable-agent-templates.md).
- Migrate VS Code static actor output into immutable templates without changing canonical model intent or six other targets.

## Key Insights
- Existing emission writes `model: opus` while audit advertises old Claude IDs.
- Template relocation affects name/path inventory, catalogs, links and validation, not only `agents.ts`.
- Final baseline must not contribute both static and provider-owned `evc-*` actors.

## Requirements
- Reuse current frontmatter parser, naming/tool mapping, protected reference handling and source resource graph.
- Strict canonical intent validation; reject invalid type/alias rather than treating it as inherited.
- Generated build audit contains intent/template disposition only, never "effective model" claims.

## Architecture
- Adapter converts full native actor template, strips actionable model selector, records canonical tier in strict intent inventory.
- Templates in `evcrate/agent-templates/`, not any host-discovered actor directory. Supporting plugin resources unchanged.
- Inventory disposition/version changes migrate every build/reference consumer; no old map reexport/shim.

## Related code files
- Modify: `src/adapters/vscode/{agents.ts,models.ts,metadata.ts,index.ts,adapter.ts,names.ts,inventory.ts,catalogs.ts,configuration.ts,configuration-activation-guide.ts,references.ts}` as actual references require; shared `model-intent.ts` from Phase 02.
- Modify tests: `tests/adapters/vscode-configuration.test.mjs`, `vscode-resource-projection.test.mjs`, `vscode-reference-closure.test.mjs`, `vscode-behavior.test.mjs`, `vscode-metadata-permissions.test.mjs`.
- Generate only: `.evcrate/source/.evcrate-vscode/**`, `.evcrate/build-manifest*.json`.
- Delete through source/regeneration: old map exports/implementation and generated `evcrate/model-map.json`; old static agent paths. Remove `models.ts` if now obsolete; no empty compatibility module.

## Implementation Steps
1. Query LSP references before deleting `VSCODE_LOCAL_MODEL_MAP`, `resolveLocalModel`, `buildVscodeModelMap` exports; if no server supports them, record scoped reference inventory. Migrate metadata/index reexports, adapter/agent callers and tests in one cutover.
2. Validate each canonical model as absent/empty/inherit or exact supported tier per frozen contract. Preserve deliberate inheritance and rejected malformed model values; do not hardcode current actor count.
3. Keep existing tool/delegation/visibility/skills/permission conversion. Emit template body with current name and supporting references, but no runtime concrete `model` key.
4. Build deterministic intent records keyed by canonical `evc-*` ID, including template hashes and original reference base. Advance audit semantics to v2; remove contradictory old pinned-native fields.
5. Migrate `names.ts` target paths, inventory target-exists checks and catalog actor representation to immutable-template disposition. Update help/configuration guidance so template availability is not misrepresented as native actor availability.
6. Ensure `plugin.json` no longer exposes actor templates as static agents (including directory scanning/default discovery). Keep hooks, instructions, `cmd-*` skills and workflows registered once.
7. Replace affected old-contract tests with observable new behavior: invalid intent fails; inherited/pinned intent preserved; explicit `tools: []`/leaf metadata maintained; supporting references resolve. Delete source-text/incidental wording assertions, never repin them.
8. Run core compile and focused adapter suite after writers settle. Exercise a real projection in temporary staging; inspect output intent and supporting paths and compare other-target output/ canonical hashes.
9. Keep repository regeneration atomic via `npm run generate:all`; do not patch per-target manifests. Final integrated regeneration/closure proof occurs in Phase 09 after companion packaging is present.

## Todo list
- [x] Export/caller migration complete without shims.
- [x] Immutable template and intent producer implemented.
- [x] Inventories/catalogs/reference callers migrated.
- [x] Static ownership removed; supporting resources preserved.
- [x] Behavior regressions and staging smoke passed.

## Success Criteria
- No hardcoded VS Code historical model IDs, old native-map artifact or static `evc-*` actor registrations in new output.
- Every current canonical actor represented once in intent; six other target model policies unchanged.
- Build audit and emitted immutable bytes agree; runtime user binding required for native selector resolution.

## Risk Assessment
- Discovery may scan unexpected template paths: prove with Phase 01 rules and native Phase 09 inventory.
- This source branch is temporarily not release-qualified until real companion reaches integration; never publish half-cutover.

## Security Considerations
- Retain deny-all/leaf semantics and non-bypass permission rules; no broadened tool groups.
- Hashes bind content, not host grants; docs and audit must maintain that distinction.

## Next steps
- Phase 04 consumes intent; Phase 07 packages final artifacts; Phase 09 proves atomic generated/native integration.

## Unresolved questions
- None blocking Phase 03. Live native editor qualification (cross-source hooks, live selector matching, cached-selection races, storage retention caps, and profile install state) remains deferred to Phase 09 real-case verification per the 2026-10-12 user gate amendment. Windows native context suite skipped in Linux CI environment; requires explicit validation when Windows runner is active.
