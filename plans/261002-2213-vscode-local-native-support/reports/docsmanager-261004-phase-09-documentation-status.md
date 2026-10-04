# Phase 09 Documentation Status

- **Date:** 2026-10-04
- **Status:** In progress / finalizing for parent status reconciliation. This audit records documentation state; it does not certify parent sign-off or production deployment.
- **Scope:** The 11 Phase 09 artifacts named in the assignment.

## Summary

All 11 assigned artifacts were reviewed (**11/11; 100% of this audit scope**). They describe the eighth `vscode` target, its isolated Agent Plugins 1.0 bundle, user-controlled `chat.pluginLocations` activation, the eight-event hook surface, scoped publication/recovery, and receipt-bounded rollout. Phase 08 qualification is consistently reported as Linux x64 evidence across 12 contexts: six qualified, five not exercised, and one unsupported.

Two material reconciliation issues remain: Phase 09 completion state differs across documents, and several core documents describe the current canonical resource registry as schema 1 although the implementation and checked-in registry are schema 2. The report does not edit those documents.

## Artifact audit

| Artifact | Audit result |
|---|---|
| [System architecture](../../../docs/system-architecture.md) | Documents eight persisted targets, schema-2 target/build manifests, the `evcrate-local` bundle at `.evcrate-vscode`, user-controlled activation, eight hooks, shared HOME advisor routing, and CAS v1 session context with 7-day / 256-per-project / 1024-per-user retention. Some canonical resource-registry labels remain stale; see findings. `Updated` metadata remains 2026-10-02. |
| [Codebase summary](../../../docs/codebase-summary.md) | Lists `src/adapters/vscode/` and representative adapter, hook, policy, session-context, and advisor-caller modules; records Phase 08 versions, receipts, 50 capabilities / 12 contexts, and Phase 09 rollout topics. Its header still says Phase 09 is pending parent reconciliation, contrary to the roadmap/changelog/rollout report. It identifies a 2026-09-30 full Repomix baseline plus a scoped 2026-10-04 Phase 08 refresh. |
| [Code standards](../../../docs/code-standards.md) | Distinguishes the native VS Code Local Agent Plugins bundle from retired DamHopper plugin/VSIX guidance; identifies `npm run lint` as echo-only and points to compiler/runtime/test enforcement. Prose enumerates eight target trees, but the structure diagram lists seven before a later sentence adds `.evcrate-vscode`. Resource-registry schema labels are stale. `Updated` metadata remains 2026-10-02. |
| [Project overview PDR](../../../docs/project-overview-pdr.md) | Lists eight adapters and current FR-25 for VS Code Local, with manual activation, unsupported relay, hook/session boundaries, and bounded acceptance evidence. Current resource-registry schema labels are stale; `Updated` metadata remains 2026-10-02. The current FR-25 label also overlaps the following historical FR-25–FR-33 range. |
| [Project roadmap](../../../docs/project-roadmap.md) | Phase 08 is marked DONE with its receipt/test evidence. The VS Code Local Phase 09 row and roadmap status mark Phase 09 DONE, not in progress/finalizing as specified for this finalization handoff. |
| [Project changelog](../../../docs/project-changelog.md) | Phase 09 appears under **Unreleased**, dated 2026-10-04, and summarizes the eight-target bundle, privacy/session behavior, coexistence, recovery, and lifecycle triggers. Its status describes Phase 09 as completed; legacy schema-1 wording should explicitly distinguish old input from the current schema-2 resource registry. |
| [README](../../../README.md) | Gives the eight-target list; distinguishes Copilot CLI from VS Code Local; records bundle inventory (19 agents, 70 commands, 40 skills, six styles), qualified versions, publication/activation quickstart, coexistence, privacy boundaries, and HOME/project recovery commands. These facts align with the Phase 08 index, Phase 09 report, and adapter source. |
| [Skills guide](../../../guide/SKILLS.md) | Covers all eight targets and maps VS Code Local slash commands to manual skills, including mapped/qualified names and raw argument forwarding. It correctly warns that generated projection is not proof of native discovery or enforcement. |
| [Claude scripts README](../../../.evcrate/source/.claude/scripts/README.md) | Correctly identifies nine schema-2 build manifests (aggregate plus eight targets) and the VS Code Local `vscode-session-context.cjs` / `set-active-plan.cjs` runtime helpers, with CAS and retention limits. Its scanner-target matrix lists seven targets; the later runtime section documents VS Code separately. |
| [Claude `evcrate-help`](../../../.evcrate/source/.claude/commands/evcrate-help.md) | Lists all eight harness targets and clearly states the VS Code Local bundle path, `evcrate-local` identity, manual-skill command mapping, user-owned activation, and scoped recovery boundary. |
| [Phase 09 rollout report](./phase-09-rollout-and-lifecycle-report.md) | Supplies the 12-context matrix, quickstart, one-active-copy rule, Copilot CLI coexistence, privacy/MCP boundaries, scope-isolated recovery, six stop triggers, and gate checklist. Its status is “approved & qualified for controlled rollout”; this is not evidence of universal platform qualification or production deployment. |

## Findings and recommendations

1. **High — reconcile Phase 09 state.** `docs/codebase-summary.md` says “pending parent reconciliation”; `docs/project-roadmap.md`, `docs/project-changelog.md`, the rollout report, and the currently observed progress-file diff say completed/approved. Keep the distinction between rollout eligibility and phase/parent sign-off explicit. Update the roadmap/status wording to the agreed finalizing state before declaring the documentation status reconciled.
2. **High — correct registry schema terminology.** `src/registry/schema.ts` sets `RESOURCE_REGISTRY_SCHEMA_VERSION = 2`; the checked-in `.evcrate/registry.json` also has `schema_version: 2`. `src/registry/legacy-registry-reader.ts` accepts schema-1 input only with exactly the seven legacy compatibility keys, adds the `vscode` compatibility entry, and returns a schema-2 document. Current-schema-1 claims appear in `docs/system-architecture.md` (resource table and module map), `docs/codebase-summary.md` (source map and registry history), `docs/code-standards.md` (tree and registry rules), and `docs/project-overview-pdr.md` (baseline and FR-3). Reword them to distinguish **legacy schema-1 input** from **current schema-2 resource-registry writes**; retain the separate schema-2 target/build-manifest description. Changelog and rollout-report references to schema-1 compatibility should make the legacy-input scope explicit.
3. **Medium — refresh dates and source provenance.** Architecture, code standards, and PDR still say `Updated: 2026-10-02` despite Phase 09 material dated 2026-10-04. The full `repomix-output.xml` snapshot is dated 2026-09-30; the codebase summary accurately records a scoped 2026-10-04 Phase 08 refresh, not a full Phase 09 repository refresh. Keep this distinction or regenerate the full snapshot/summary when that broader update is required.
4. **Medium — respect the 800-LOC documentation limit.** `docs/system-architecture.md` is 806 LOC and `docs/project-changelog.md` is 807 LOC; `docs/code-standards.md` is 795 LOC. Split the two oversized files at the next authorized content update; do not add material to them before that refactor.
5. **Low — clarify indexes and identifiers.** The code-standards tree diagram omits `.evcrate-vscode` while adjacent prose counts it as the eighth generated tree. The scripts README’s scanner matrix has seven entries while its later runtime section covers VS Code Local. The PDR reuses FR-25 for current native support while preserving a historical FR-25–FR-33 range. Clarify these scopes/labels to prevent readers treating omissions or duplicated IDs as a target gap.

## Metrics and verification basis

- **Coverage:** 11/11 assigned artifacts reviewed (100% of the named scope; not a claim of whole-repository documentation coverage).
- **Length:** 5,500 LOC across the 11 artifacts at audit time; two exceed `docs.maxLoc` 800.
- **Update cadence:** The current Phase 09 materials are dated 2026-10-04; repeated update frequency cannot be derived from these files. Three core documents retain 2026-10-02 `Updated` metadata.
- **Maintenance state:** Broad Phase 09 coverage is present; status reconciliation, schema wording, dates, and size limits remain open.
- **Evidence:** Direct reads of all 11 artifacts; source cross-checks in `src/protocol/validation.ts`, `src/manifests/registry.ts`, `src/adapters/vscode/`, `src/registry/schema.ts`, `src/registry/legacy-registry-reader.ts`, `package.json`, target manifests, the Phase 08 qualification index, and the Phase 09 rollout report. The existing Repomix artifact was dated 2026-09-30; current adapter and registry claims were checked against live source instead.
- **Checks:** No tests, build, lint, or docs validator were run for this report-only audit.

## Protected-path boundary

This report writer did not modify any prior sealed path. The path-scoped working-tree check showed no status entries for `plan.md`, Phase 00–08 reports, or `reports/native-local/**`. It did show `plans/261002-2213-vscode-local-native-support/progress.md` as modified at audit start; its diff updates reconciliation/run metadata and Phase 07–09 status. That protected file was left untouched. Therefore, the whole-workspace condition “no prior sealed paths modified” cannot be certified, although no Phase 00–08 evidence path was reported changed.

## Unresolved questions

- Which Phase 09 state is authoritative for the final handoff: “in progress/finalizing” or “completed/approved,” and when is parent sign-off recorded?
- Should the historical FR-25–FR-33 range be relabeled to avoid collision with the new native-support FR-25?
