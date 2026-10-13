# Plan validation

Date: 2026-10-10. Scope: planning artifacts only. Implementation status remains pending.

## Checks exercised

- Executed installed `/cmd-plan__hard` custom command handler through its `execute` API with detailed brainstorm context; received and followed expanded planning instructions.
- Explicitly loaded planning skill and organization/design/output references. No automatic skill activation claim.
- Inspected mapper, emitter, consumer tests, runtime normalization, fixture materializer, CLI options, publication tests and relevant architecture/standards/PDR sections.
- Two bounded research slices completed; parent integrated reports and corrected unsupported conclusions using pinned VS Code core source and installed extension metadata.
- Executed a read-only Markdown validator: 13 plan Markdown files at time of check, seven phase files, 49 relative links checked, zero errors; required sections ordered, overview <=80 lines, `status: pending` present.
- Existing compiled CLI parser accepted three planned argument shapes: target-vscode build; isolated HOME publication preview with settings registration disabled; isolated project publication apply with settings registration disabled. Parser only; no dispatcher/build/publication executed.
- Source-parser smoke via raw Node failed because TypeScript imports use compiled `.js` paths. Eval import also failed on a type-only export resolution. Switched to already-present compiled parser after source inspection; no compilation or code modification performed to support planning.
- First Node invocation was rejected by Scout's path heuristic because its log text contained `build/publication`. Removed that misleading log phrase; no ignore-policy or access-setting change made.
- Active-plan helper invoked from published HOME resources; reported `EVCRATE_SESSION_ID` absent, so session state did not persist. Plan files and explicit paths remain usable.

## Integration review findings resolved in the plan

1. Extension metadata is not the complete registry. Terminal, Task and todo tools are core registrations; do not drop them as unsupported.
2. `canDelegate` is in `metadata-tools.ts`, not the agent emitter. Qualified Task reference requires preserving source capability semantics.
3. `editFiles` is registered as a placeholder selector; native edit expansion needs evidence. `createFile` cannot overwrite existing files.
4. `distribute:copilot` targets the wrong adapter and publishes. Planned commands use `vscode` and separate build/check/publication.
5. CLI offers opt-in editor-settings registration; planned sandbox publication explicitly disables it.
6. Fixture materializer embeds agent definitions. Updating checked-in fixture Markdown alone is insufficient.
7. Runtime hook normalization is in `tool-inputs.ts`; production generated bridge has a separate `LOCAL_TOOL_INPUTS_SOURCE` in `runtime-sources.ts`. A proven correction must cover both.
8. A no-child control needs an otherwise valid delegation capability and direct invocation; default nested-agent prohibition alone cannot prove `agents: []`.
9. Negative permission assertions require host state/denial evidence, not agent refusal text.
10. Real docs-update acceptance includes docs readers, inherited-tool docs-manager, final content, size and reference validation—not just Scout success.

## Changed artifacts

- Created `plans/261010-1552-vscode-subagent-tool-references/`: overview, command entrypoint, design, seven phases, qualification matrix, two research reports and this validation report.
- Added an explicitly pending design reference to `docs/system-architecture.md`; no current implementation or native qualification claim changed.
- No source implementation, tests, generated bundles, installed agents, user settings or runtime policy files changed.

## Limits and unresolved questions

- No native chat, affected Windows reproduction, build/test suite, fixture publication or deployment run during planning.
- Existing compiled parser smoke validates syntax only; freshness of all compiled implementation modules was not qualified.
- Windows version/profile/trace and actual model-specific edit-tool expansion remain Phase 01/05 gates.
- Production rollout requires explicit authorization. Three interview decisions: current supported release only; minimal proven normalization in scope; reviewed candidate allowed without Windows but no closure/deployment. The validation command initially updated only the overview; the subsequent user-requested reconciliation propagated these decisions into all seven phases, design and qualification matrix. Phase 06 platform prerequisites and Phase 07 candidate-review gates now allow reachable Linux work without marking blocked Windows phases complete.
