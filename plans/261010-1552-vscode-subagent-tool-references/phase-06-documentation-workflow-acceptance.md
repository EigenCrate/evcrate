# Phase 06 — Documentation workflow acceptance

## Context links
- [Plan](./plan.md); dependency: the executing platform's required [Phase 05](./phase-05-native-delegation-and-permissions.md) rows must pass. Linux workflow qualification need not wait for unavailable Windows access.
- [Qualification matrix](./qualification-matrix.md), original [incident analysis](../reports/brainstorm-261010-1552-vscode-subagent-tool-references.md).

## Overview
- Date: 2026-10-10. Priority: P1. Implementation: completed on Linux (3/3 qualified); Windows BLOCKED per contract. Review: completed (Score: 9.3/10).
- Demonstrate the user's actual `/evcrate-local cmd-docs-update` path, not only a single reader fixture.

## Key insights
- Current canonical workflow asks parent to dispatch Scouts, merge reports, optionally dispatch documentation readers, then delegate to docs-manager.
- Docs-manager has no explicit tools field. Its inherited editing behavior is a distinct test from explicit edit-capable controls.
- Generated workflow still mentions Task and Explore. Those words may be understood or may be a real portability blocker; do not declare either outcome without observing the host.
- A successful parent-only replacement of failed Scouts is not success for the delegated workflow.

## Requirements
- Grounded reports from two disjoint source slices reach the parent and then docs-manager.
- Source files unchanged by Scout; docs-manager edits only allowed documentation outputs in the disposable workspace.
- Exercise the documentation-reader branch, not only the 1–3-doc shortcut.
- Original workflow's size and validation stages complete; no unstated partial-workflow acceptance.

## Architecture
- Generated command -> parent coordinator -> leaf Scouts/document readers -> parent merge -> inherited-tool docs-manager -> documentation size/reference validation.
- No nested Scout delegation or permanent retry/fallback layer.

## Related code files
- Inspect/exercise: `.evcrate/source/.claude/commands/docs/update.md` and generated `.evcrate/source/.evcrate-vscode/skills/cmd-docs-update/SKILL.md`.
- Inspect/exercise: canonical/generated `scout` and `docs-manager` agent definitions.
- Conditional targeted instruction repair: existing VS Code transformation in `src/adapters/vscode/references.ts` or canonical workflow where the instruction is genuinely cross-harness; decide authoring ownership before editing.
- Execute installed `evcrate/scripts/validate-docs.cjs` at its resolved candidate root, not a guessed workspace-relative root.
- Create during execution: disposable source/docs fixture and plan-local `reports/docs-workflow-qualification.md`.
- Delete: execution-owned temporary content after evidence capture; no product file deletion planned.

## Implementation steps
1. Prepare a disposable codebase with two small real modules, distinct exported functions/config facts, README and at least four relevant docs. Seed known stale documentation statements so correct updates are independently verifiable.
2. Keep the reference answer outside agent context. Record source/docs baseline hashes and permitted doc output paths.
3. Use the production candidate on Phase 01's pinned current supported release pair, Local session target, actual Scout/docs-manager URIs and recorded model. Do not substitute fixture agents or qualify an older incident version.
4. Invoke `/evcrate-local cmd-docs-update` with explicit read-only scouting scope and allowed documentation output boundaries. Observe actual named child calls and task contents.
5. Confirm two disjoint Scout results identify real paths and findings with line evidence, no duplicate ownership, and no source modifications. Parent must collect real returned results before proceeding.
6. Exercise the >=4-doc reader strategy. Verify the host resolves actual requested reader agents. If Explore is unavailable, capture the failure rather than silently pretending a named agent ran.
7. Confirm docs-manager receives merged code/doc context and edits docs through its inherited permitted tools. Validate corrections cover facts from both source slices; inspect final files, not just the agent's completion message.
8. Run/observe workflow size checks using the configured `docs.maxLoc` (default 800), README limit and optional-doc rules. Run the installed reference validator from the real installation root and inspect warnings; warnings do not excuse factual errors in expected fixture results.
9. Compare final source hashes and allowed-doc outputs to the fixture contract. No implementation changes, unexpected source edits, fabricated citations, missing delegated results, or unreported skipped validation.
10. If Task/Explore/Read wording alone prevents the otherwise-qualified host path, make the smallest author-owned VS Code-specific instruction correction. Do not globally rewrite common prose tokens, force a new agent, add permissions, or alter other harness behavior. Regenerate and rerun only affected workflow/native controls.
11. Execute the workflow on the affected Windows Local installation using the selected pair, after an operator-approved upgrade if necessary. Preserve original-version causality as a separate historical question; success after upgrade does not prove the old failure's cause.
12. Record candidate identity, outputs and warnings. If Windows is unavailable, finish Linux rows and permit reviewed-candidate handoff only after Phase 07's review gate; Windows rows and overall workflow completion remain pending. No deployment or incident closure.

## Todo list
- [x] Source/doc fixture has independently known expected updates.
- [x] Two real Scout reports merged by parent.
- [x] Documentation-reader branch exercised with actual available agents.
- [x] Docs-manager inheritance and real documentation edits verified.
- [x] Size/reference checks and source immutability verified.
- [x] Windows end-to-end result recorded; no parent-only substitution counted as pass (explicitly recorded as BLOCKED).

## Success criteria
- W01–W03 pass with grounded source findings and correct final documentation.
- No source edits by Scout and no unauthorized paths changed by the workflow.
- Explicit mapper edit capability and inherited docs-manager edit capability both have separate evidence.

## Risk assessment
- Adding a new retry/fallback workflow would hide remaining defects: not authorized.
- Canonical Explore instructions may be harness-specific: any fix must follow the existing projection boundary and retain other-target intent.
- Requiring external compaction tools such as repomix may be an independent runtime prerequisite; record missing prerequisites and finish reachable checks without fabricating command output.

## Security considerations
- Disposable docs only; no production documentation refresh implied by qualification.
- Restrict Scout to read operations in the task; do not claim hard read-only enforcement while shell access remains granted.

## Next steps
- Phase 07 may proceed with candidate review and handover packaging. Linux native/workflow rows (W01–W03) and automated checks have passed; Windows rows (WW01–WW03) are preserved as BLOCKED pending operator-approved native Windows qualification. Overall rollout and deployment remain gated on Windows qualification.

## Unresolved questions
- Whether the actual host resolves the workflow's Explore reader wording and installed validation path remains a native acceptance check.
