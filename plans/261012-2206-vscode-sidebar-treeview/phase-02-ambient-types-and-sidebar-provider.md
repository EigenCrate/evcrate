# Phase 02 — Ambient types and sidebar provider

Priority P2 · Status completed — DONE (100%; 2026-10-12) · Effort 2h · Wave 1, parallel with Phase 01
Completion evidence (2026-10-12): final VSIX SHA-256 `033f0b54466af9ba0ea4828c692cb7538bfbc14ba4c6389b7b2b236d93f4ff5a`; Companion `buildIdentity` `3285fa1e52d6f500095506b3c5b007828cac7646ed27e5aad3c52491aa58fdbe`; integrated tests 163/163 passed.

## Context and ownership
- [Overview / shared contracts](plan.md); [Phase 03 integration](phase-03-manifest-wiring-and-tests.md).
- Modify `extensions/vscode-model-bindings/vscode.proposed.chatPromptFiles.d.ts` only.
- Create `extensions/vscode-model-bindings/src/sidebar-tree-provider.ts` only; no deletions.
- Read existing `diagnostics.ts`, `diagnostics-contracts.ts`, `binding-contracts.ts`, `model-catalog.ts`, `runtime-contracts.ts`, and command handlers. Do not edit manifest, extension wiring, refresh controller, commands, tests, scripts, or generated output.

## Architecture / API contract
- Export `SidebarSnapshot` with readonly `report: RuntimeDiagnosticsReport | null`, `rootBindings: VscodeModelBindingsV1 | null`, `userBindings: VscodeModelBindingsV1 | null`, `catalog: CatalogSnapshot | null`, `settingsPending: boolean`.
- Export discriminated `SidebarTreeNode` variants for section, installation action, tier/all action, actor, and non-actionable status. Stable IDs such as `section:tiers`, `tier:opus`, `actor:evc-planner`; leaf commands have no nested children.
- Export `EvcrateSidebarTreeProvider implements vscode.TreeDataProvider<SidebarTreeNode>, vscode.Disposable`.
- Constructor accepts `getSnapshot: () => SidebarSnapshot`, plus optional structural emitter dependency (`event`, `fire`, `dispose`) for tests; default uses `vscode.EventEmitter`. Implement `getChildren(element?)`, `getTreeItem(element)`, `refresh()` (one full-tree event), `dispose()` (release emitter; no later emission).
- Getter supplies one cached committed snapshot, initially empty, captured by Phase 03 after refresh completion. Provider never reads files/mementos, queries models, changes bindings, or derives a new generation. Repeated reads do not refresh the controller or emit events.

## Completed implementation
1. Extend existing ambient module minimally with stable API shapes compatible with pinned VS Code: `TreeItemCollapsibleState` enum (`None=0`, `Collapsed=1`, `Expanded=2`); `ThemeIcon` constructor/id; `Command` (`title`, `command`, optional `arguments`); `TreeItem` constructor/label and consumed id/description/tooltip/iconPath/command/collapsibleState/contextValue fields; `TreeDataProvider<T>` event and methods; `window.registerTreeDataProvider<T>(viewId, provider): Disposable`.
2. Keep `onDidChangeTreeData` event compatible with full-tree refresh (`T | T[] | undefined | null | void`), and provider methods returning `ProviderResult`. Do not introduce `@types/vscode`, unused API surface, or broad `any`. Fit ambient file under 200 lines without compressed declarations that harm readability.
3. Return exactly three ordered root sections: `Installation Root`, `Model Tiers`, `Agents (${count})`. Sections use collapsible states; status/action/actor leaves use `None`. Expansion state survives refresh through stable item IDs.
4. Installation section contains a clickable current-root row, or `Select Installation Root` if no root, mapped to `evcrate.selectInstallation`. Display committed diagnostics' canonical root identity in description/tooltip; distinguish initial pending snapshot, `NO_INSTALLATION_FOUND`, unsupported remote/untrusted host, and an empty valid inventory. Use existing reason fields, never invent success.
5. Model Tiers contains exactly `opus`, `sonnet`, `haiku`, `Bind All Tiers` in that order. When `settingsPending`, show `Settings pending refresh`, not `Unbound` or a newer selection. Otherwise show configured `root.tier` then `user.tier` selection, or `Unbound`; use catalog selector helpers for readable names when available, vendor/id otherwise. Label these as configured settings: actor overrides / canonical inherit may supersede them. Avoid storing a fabricated default/all-tier model.
6. Tier command is `evcrate.configureAgentModels` with `arguments: [tier]`; Bind All Tiers uses `['all']`. Phase 03 owns validating and consuming these arguments. Root selection needs no arguments.
7. Actors come from `report.diagnostics.actors`, excluding IDs in `report.removedStoredActors` explicitly; sort deterministically. Do not infer removal from `canonicalTier === null`, which also represents inherit. Standard canonical manifest yields 17 actor leaves; do not hard-code names or runtime count.
8. Actor labels show actor ID; description includes rendered effective selector or explicit `Inherit` / `Withheld` / `Unresolved`, plus source badge using the exact `effectiveSource` (`root.actor`, `user.actor`, `root.tier`, `user.tier`, `canonical.inherit`, `unresolved`). Tooltip carries selected vendor/id, reason, and cached-agent reselection guidance as relevant. Withheld actors stay visible, but selected settings are never claimed as executed models; `hostObservedModel` is separate and not inferred.
9. Actor command is `evcrate.configureActorModel` with `arguments: [actorId]`. Non-actionable placeholders have no command. Use native `ThemeIcon` glyphs, text descriptions, and tooltips; no webview/HTML/custom source-badge assets.
10. Hand off provider/snapshot signatures and command argument contract to Phase 03. No build/test/formatters; no ambient or provider changes in other owners' files.

Acceptance criteria (covered by Phase 03 tests and met in the integrated parent verification, 2026-10-12)
- Initial and populated snapshots both have exactly three root sections, stable IDs, valid collapsible states; leaves return no children.
- Tier children exactly match specified labels/order; all four command IDs/arguments are correct, including `all`. Root/user tier precedence and unbound/missing-catalog text are truthful; revision-mismatched settings show pending, never applied.
- Canonical fixture produces `Agents (17)` and 17 unique sorted actor rows; another inventory produces its actual count. Removed stored actor is omitted; canonical-inherit actor remains.
- Effective model and exact source badges reflect diagnostics for root/user actor overrides, tier mappings, inherit, unresolved, and withheld cases. Tooltips distinguish selected binding from contributed selector and actual host observation.
- Root/no snapshot/no installation/unsupported host/empty inventory render useful non-success states without exceptions or unintended queries/mutations.
- One explicit `refresh()` fires one full-tree event; getters fire none. Disposing releases the emitter and prevents further events.
- Provider and ambient code each `<200 LOC`; unknown data uses runtime narrowing rather than inline unchecked casts. Runtime imports limited to `vscode`, local extension modules, or permitted Node built-ins; no extension imports from repository `src/`.

## Risks / dependency and handoff
A live getter or synchronous post-pass Memento read could combine newer bindings with older diagnostics after a catalog await: Phase 03 compares binding/catalog revisions with the report before capturing; mismatches produce explicit pending settings, not mixed model claims. Actors remain the committed diagnostics snapshot, including withheld entries, not just published resources. The sidebar must not promise that cached selected chat agents have switched models.

Phase 02 had no packaging dependency. Phase 03 consumed the provider contract and completed wiring/tests; the final parent verification evidence is recorded above.

## Unresolved questions
None. The implementation dispatch is complete; live VS Code UX qualification remains a separate host-dependent gate and is not claimed by this phase.
