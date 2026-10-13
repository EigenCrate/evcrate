---
title: "Correct VS Code subagent tool references"
description: "Repair central frontmatter mapping, preserve permission intent, and qualify direct/delegated Scout plus documentation workflow."
status: pending
priority: P1
branch: fix/vscode-subagent-tool-references
tags: [bugfix, vscode, agents, permissions, qualification]
created: 2026-10-10
---

# VS Code subagent tool-reference correction

## Goal and decision
Correct the existing VS Code adapter, not host delegation architecture. Generated tool declarations must resolve to supported native capabilities without widening permissions. Close the Windows incident only with affected-host evidence.

Based on the [agreed brainstorm](../reports/brainstorm-261010-1552-vscode-subagent-tool-references.md). Planning only; no implementation, tests, publication or editor settings changes performed. The registered `/cmd-plan__hard` handler was executed and the planning skill loaded explicitly.

## Execution phases
| # | Phase | Dependency | Status | Exit gate |
|---|---|---|---|---|
| 01 | [Host contract and baseline](./phase-01-host-contract-and-baseline.md) | None | Complete | All mapper capabilities have host evidence and semantic decisions |
| 02 | [Frontmatter mapping cutover](./phase-02-frontmatter-mapping-cutover.md) | 01 | Complete | Correct references; Task/empty/omitted permissions preserved |
| 03 | [Regressions and native fixtures](./phase-03-regression-and-native-fixtures.md) | 01–02 | Pending | Consumer-visible security/capability regressions and usable controls |
| 04 | [Build, regenerate, stage](./phase-04-build-regenerate-and-stage.md) | 02–03 | Pending | Integrated checks, real fixture CLI, isolated candidate publication |
| 05 | [Native delegation and permissions](./phase-05-native-delegation-and-permissions.md) | 04 | Pending | Direct/delegated reads, edits, terminal and negative controls pass |
| 06 | [Documentation workflow](./phase-06-documentation-workflow-acceptance.md) | 05 | Pending | Real docs-update scouting/readers/docs-manager/validation succeeds |
| 07 | [Documentation and rollout](./phase-07-documentation-and-rollout.md) | 04–06 | Pending | Reviewed evidence, truthful docs/changelog, authorized deployment |

## Contracts and supporting material
- [Proposed architecture](./architecture.md): existing adapter/publisher, three tool-name namespaces, no new subsystem.
- [Qualification matrix](./qualification-matrix.md): exact positive/negative cases, prompts, evidence fields, failure routing.
- [Host-reference research](./research/host-reference-contract.md): core versus extension registrations; edit selector and terminal semantics gates.
- [Qualification/release research](./research/qualification-release-contract.md): existing fixtures, command entrypoints, isolation and recovery limits.
- [Command access point](./cmd-plan.md).
- [Current progress overview](./progress.md): active phase tracking and reconciled scope.

## Scope and invariants
- In: every affected entry in the VS Code mapper, emitter/audit contract, affected tests/fixtures, regenerated VS Code output, native qualification and docs.
- Conditional: only captured-host-required hook normalization and demonstrated workflow instruction repair. No speculative runtime/prose rewrite.
- Out: new extension/broker, broad tool sets, permission bypass, automatic fallback/retries, model-binding redesign, other-harness migration, broad Windows parity.
- Preserve source tool intent, `tools: []`, omitted tools, unsupported-only denial, `agents: []`, and user/model invocation controls.
- Frontmatter references are not model-facing tool names or hook identities. Audit output is not effective grant evidence.
- Preserve canonical/generated ownership; no installed-agent hotfixes or manual manifest edits.

## Compatibility and prerequisites
- Support target: one current supported VS Code/Copilot release pair, pinned in Phase 01 and qualified on native Linux and Windows Local. The inspected 1.140.0/0.68.0 pair is evidence, not an assumed current-release policy.
- Require the affected Windows installation to use that selected release before repair acceptance. Preserve older incident evidence; if its versions differ, historical root-cause diagnosis remains separate. No automatic upgrade authorization.
- Missing Windows evidence blocks Windows acceptance, incident closure and deployment, but not reviewed-candidate handoff. No older-version matrix or Remote/WSL/macOS guarantee.
- Phase 01 must qualify model-specific edit selector behavior before edit-map changes; `editFiles` metadata alone is insufficient.
- Existing Node/npm build tooling, authenticated qualification host, disposable workspace/profile/HOME/state, nonsecret fixtures.
- No deployment authority implied; production rollout is separately approved.

## Acceptance summary
1. Actual native file discovery, content search and read succeed directly and in explicitly named Scout children; results include unprovided fixture values and tool traces.
2. Empty/no-child controls remain denied; Task coordinators still delegate; source capabilities are not silently removed or broadened.
3. Explicit native edit/create/overwrite/multi-edit and intended terminal operations work; child-todo restriction is recorded accurately.
4. Production policies preserve deny/approval behavior with real payloads; no terminal bypass rescues missing read/edit grants.
5. Two Scout slices, docs readers, inherited-tool docs-manager and final validation pass on both platforms using the selected release; affected-host success does not prove older-version causality.
6. Generated artifacts/manifests, behavior tests and release checks pass; docs distinguish declaration, runtime qualification, incident closure and deployment.

## Execution discipline
One integration owner; one active execution slice per worktree. Copy ignored plans by SHA-256 when using worktrees. Phase 06 depends on its platform's Phase 05 pass; Phase 07 candidate review may proceed after automated and Linux native/workflow checks, even if Windows is unavailable. No concurrent phase writers. Keep overall completion, incident closure and deployment blocked until all required platform gates pass. Update status from observed evidence only.

## Validation Summary
**Validated:** 2026-10-10 through `/cmd-plan__validate`; **questions asked:** 3. Implementation remains pending.
### Confirmed decisions
- Current supported release only; no promise to repair or qualify older incident versions.
- Include minimal evidence-backed hook normalization in both source/runtime authorities; preserve security decisions and add paired regressions.
- If Windows is unavailable, allow reviewed-candidate handoff only; no incident closure or deployment.
### Validation propagation
- [x] Current-release-only scope and separate historical attribution reflected in all seven phases, design and qualification matrix.
- [x] Minimal proven normalization and Windows-blocked reviewed-candidate handoff reflected in implementation, regression and delivery gates.
- [x] Pin the exact current supported editor/extension pair during Phase 01; operator-approved upgrades only.

## Unresolved questions
- Exact Windows editor/extension versions, loaded Scout URI, and original failure trace.
- Effective model-specific edit selector and actual terminal/read/edit hook payloads; Phase 01 gates their implementation choices.
- Workflow Explore-reader resolution and installed validation path; Phase 06 verifies before closure.
- Production deployment destination/approval; resolve only at rollout.
- Session activation helper reported `EVCRATE_SESSION_ID` absent; plan files exist, but active-plan session state was not persisted.
