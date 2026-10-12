---
title: "VS Code Activity Bar and native model-bindings sidebar"
description: "Add an EVCrate Activity Bar icon and native TreeDataProvider sidebar with targeted model configuration."
status: completed
priority: P2
effort: 8h
branch: feat/vscode-runtime-model-bindings
tags: [feature, vscode, frontend, packaging]
created: 2026-10-12
---

# Option A: Native sidebar TreeView

## Outcome and boundaries
- Activity Bar container `evcrate-sidebar` / `EVCrate`; view `evcrate.modelBindingsView` / `Model Bindings`.
- Three root sections: Installation Root, Model Tiers, Agents (17 in canonical inventory; runtime count dynamic). Show configured tiers, effective actor model/source, and truthful unavailable/withheld states.
- Root selection, targeted tier/all-tier and actor configuration use existing commands; Command Palette no-argument behavior stays unchanged. No webview, dependencies, inferred host execution, or new binding schema.
- Implementation complete; parent final verification completed (see Final acceptance). This plan records implementation and packaging status only; no live editor UX qualification is claimed.

## Dependency graph
`Phase 01 || Phase 02 -> Phase 03 -> parent sequential validation/build`

Spawn two implementation writers for Wave 1; wait for both terminal artifacts before integration. Phase 03 is one integration owner. No writer runs build/test/formatters mid-flight.

| Phase | Status | Effort | Dependency |
|---|---|---:|---|
| [01: VSIX media packaging](phase-01-vsix-media-packaging.md) | completed — DONE (100%; 2026-10-12) | 2h | none |
| [02: Ambient types and provider](phase-02-ambient-types-and-sidebar-provider.md) | completed — DONE (100%; 2026-10-12) | 2h | none |
| [03: Manifest, wiring and tests](phase-03-manifest-wiring-and-tests.md) | completed — DONE (100%; 2026-10-12) | 4h | 01 + 02 terminal handoffs |

## Strict ownership matrix
Paths repository-relative; C=create, M=modify. Read other files freely; never edit another owner's files.

| Owner | Owned files |
|---|---|
| Phase 01 | C `extensions/vscode-model-bindings/media/evcrate-icon.svg`; C `scripts/vscode-companion-media.mjs`; M `scripts/build-vscode-companion.mjs`; M `scripts/verify-vscode-companion.mjs` |
| Phase 02 | M `extensions/vscode-model-bindings/vscode.proposed.chatPromptFiles.d.ts`; C `extensions/vscode-model-bindings/src/sidebar-tree-provider.ts` |
| Phase 03 | M `extensions/vscode-model-bindings/package.json`; M `extensions/vscode-model-bindings/src/extension.ts`; C `extensions/vscode-model-bindings/src/sidebar-snapshot.ts`; M `extensions/vscode-model-bindings/src/refresh-controller.ts`; M `extensions/vscode-model-bindings/src/command-registration.ts`; M `extensions/vscode-model-bindings/src/configuration-commands.ts`; C `tests/vscode-companion/sidebar-tree-provider.test.mjs`; C `tests/vscode-companion/sidebar-commands-and-packaging.test.mjs`; M `tests/vscode-companion/contracts.test.mjs` |
| Parent, after all writers | Sequential generated outputs under `dist/`, `.cache/`, `.evcrate/`; feature documentation/changelog updates; final verification/review |

No other source edits, helper files, test harness edits, or generated-output hand edits. Any further ownership change requires parent authorization before dispatch.

## Shared integration contracts
- Phase 02 exports `SidebarTreeNode`, `SidebarSnapshot`, `EvcrateSidebarTreeProvider`; constructor accepts a typed committed-snapshot getter and optional event-emitter seam; methods `getChildren`, `getTreeItem`, `refresh`, `dispose`.
- Snapshot: diagnostics report, root/user bindings, catalog, `settingsPending`; cache after commit. Binding revisions must match the report's root/user revisions, and catalog revision must match diagnostics; otherwise omit mismatched settings and label them pending. No mixed live getters while refresh is in flight.
- Commands: root `evcrate.selectInstallation`; tiers/all `evcrate.configureAgentModels`, arguments `[tier]` (`opus`, `sonnet`, `haiku`, `all`); actors `evcrate.configureActorModel`, arguments `[actorId]`.
- Phase 03 introduces optional `onDidCompleteRefresh?: () => void`; notify only current, non-disposed passes with a newly committed diagnostics report, including withdrawal/diagnostics-only updates, inside a guarded `try/catch` that logs/surfaces callback errors via `onErrorMessage` without failing the committed pass or stranding refresh waiters. Retry-only and superseded passes do not notify.

## Side-effect review checklist (completed parent acceptance)
- VSIX ZIP: extend only the flat SVG allowlist; exact required `extension/media/evcrate-icon.svg`; preserve traversal/duplicate/CRC/size checks and deterministic ordering. SVG content type is `image/svg+xml`.
- Receipt: all `extensions/vscode-model-bindings/media/*.svg` plus the new build helper tracked in `inputs`, `buildIdentity`, and `.evcrate/targets/vscode/files/evcrate/companion/source-receipt.json`; detect new, changed, missing media in checkout mode. Packed mode requires no checkout sources.
- All new modules and touched TypeScript/test files remain `<200 LOC`; pre-existing packaging entrypoints retain their documented exception. New media logic stays in the dedicated helper; refresh-controller additions remain bounded.
- No inline unchecked casts; narrow unknown command arguments with `typeof`, exact literals, `in` / `isPlainObject` as appropriate.
- `scripts/release/runtime-closure.cjs`: static media lies outside its `extension/dist/*.js` scan; keep it unchanged. New provider imports only local modules / `vscode` / permitted Node built-ins; no runtime `node_modules` dependency or cross-package `src/` imports.
- Preserve trust/remote fail-closed behavior, scope/CAS safeguards, explicit inherit, cached-agent reselection guidance, and separation of contributed selectors from host-observed execution.
- Generated outputs were produced after Phase 03; this plan and the roadmap record implementation status. Automated assertions do not establish live VS Code UX qualification.

## Final acceptance
All three phase criteria are satisfied. Parent validation completed on 2026-10-12:

- Status: **DONE (100%)**; VSIX SHA-256: `033f0b54466af9ba0ea4828c692cb7538bfbc14ba4c6389b7b2b236d93f4ff5a`.
- Companion `buildIdentity`: `3285fa1e52d6f500095506b3c5b007828cac7646ed27e5aad3c52491aa58fdbe` (39 tracked inputs).
- **163/163 tests passed** across `tests/vscode-companion/*.test.mjs`, `tests/distribution/vscode-companion-vsix.test.mjs`, `tests/integration/vscode-installed-runtime.test.mjs`, and `tests/adapters/vscode-*.test.mjs`.
- `check:vscode-companion` passed in development-checkout and packed-package modes; closure validation passed (28 JS files); `distribute:check` returned `status: "ok"`.
- Code review: 9.4/10, 0 critical issues; the warning and DRY suggestion were fixed before the final rebuild.
- This records automated/package verification, not live VS Code GUI/UX qualification.
Evidence is transcribed from the supplied parent verification summary; no checks were rerun during this documentation update.

## Resolved implementation approach
- Packaging scripts (`scripts/build-vscode-companion.mjs`, `scripts/verify-vscode-companion.mjs`) are pre-existing CLI entrypoints (>200 LOC baseline); all new media packaging/verification logic lives in `scripts/vscode-companion-media.mjs` (`<200 LOC`, tracked in `source-receipt.json`) with minimal delegation calls in the two entrypoints and zero unrelated refactoring or code compression.
- Phase 03 owns `extensions/vscode-model-bindings/src/sidebar-snapshot.ts`, `tests/vscode-companion/sidebar-tree-provider.test.mjs`, and `tests/vscode-companion/sidebar-commands-and-packaging.test.mjs` so all TypeScript and test files stay strictly `<200 LOC` with full readable test coverage.
