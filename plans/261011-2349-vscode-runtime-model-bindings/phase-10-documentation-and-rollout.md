# Phase 10 — Documentation, support and guarded rollout

## Context links
- [Plan](./plan.md); [design contracts](./design-contracts.md); [verification matrix](./verification-matrix.md); Phase 09 accepted candidate receipts.
- Dependency: Phase 09 full acceptance PASS. Documentation must not promote planned behavior before proof.

## Overview
- Date: 2026-10-11; priority P2; implementation Pending (0%); implementation review Pending; design-summary review: [Advisor](./reports/advisor-review.md).
- Publish truthful native support/operations guidance and close source-to-doc drift after proof.

## Key Insights
- Private proposed API is version-coupled; Stable installation alone is not normal Marketplace support.
- Core harness recovery does not undo an external extension install or user binding edit.
- Missing companion after static cutover means actors unavailable, never implicit old static actors.

## Requirements
- Current `evc`/`evc-*`/`cmd-*` names, seven targets and controller-free architecture retained.
- Separate publication, plugin registration, extension install (including exit code `5` post-commit partial-success semantics without rollback or blind publication retry), proposal enablement, activation, binding configuration and per-session live-qualification consent instructions.
- Document local-only supported host/profile/multi-root/project+HOME matrix (with SSH/dev-container/WSL out of scope for this deliverable and rejected without silent local fallback), cross-scope binding precedence (`root actor > user actor > root tier > user tier`), cached-agent unintended-model risk *prior* to explicit reselection/window reload and narrow exception boundaries (never waiving model correctness after new discovery/reselection/reload, trust/source invalidation, restrictions or hooks), and bounded storage retention with fully closed-editor manual cleanup when automatic reclamation is unproven.

## Architecture
- Core docs remain authority; add narrow companion operations guide and links, no duplicate architecture/manual.
- Versioned support matrix links native candidate evidence; setup/rollback decisions user-controlled.

## Related code files
- Modify: `README.md`, `docs/{system-architecture.md,codebase-summary.md,code-standards.md,project-overview-pdr.md,project-roadmap.md,project-changelog.md}` and current VS Code support guide(s) discovered before editing.
- Create: `docs/vscode-runtime-model-bindings.md` if no existing guide owns this surface.
- Modify: `src/adapters/vscode/configuration-activation-guide.ts` and configuration examples; regenerate their projected copies through established scripts.
- Root `CHANGELOG.md`: semantic-release-owned; do not handwrite phase evidence there.
- Delete: obsolete maintained VS Code historical-map instructions; preserve immutable historical reports/receipts and evaluator documentation outside scope.

## Implementation Steps
1. Reconcile actual final design/receipts with proposed architecture section; replace planning-only label only after accepted native gates. Record known restrictions explicitly.
2. Document canonical intent versus runtime user identity versus native-observed choice; explain cross-scope binding resolution (`root actor override → user-default actor override → canonical inherit omission → root tier → user-default tier → unresolved`), explicit actor `inherit`/reset, root selection, local profile/window/root state isolation and rejection of unsupported remote contexts without silent local HOME/editor fallback.
3. Provide exact private install/launch examples with explicit local editor/profile and proposed flag, then configuration commands. Label `chat.pluginLocations` authorization separate from extension install and per-session live-model qualification consent (which requires prior explicit approval naming exact isolated profile/workspace, selected models and invocation scope); no auto-argv edits/restart. Document that an explicitly requested post-commit companion install failure or manual-setup-required outcome returns exit `5` with committed publication preserved on stdout and `install-notice-v1` on stderr, and that remediation retries only the companion install/setup rather than rolling back or blindly retrying publication.
4. Explain missing/removed/ambiguous identity, invalid source/schema, disabled/proposal-unavailable/trust states and storage-budget exhaustion (blocking new derivation without deleting uncertain referenced resources, and requiring manual cleanup only after all editor windows/processes using the storage are fully closed—preserving bindings/published files, warning that restored chats may reference removed generations, and never conflating storage cleanup with window reload). Document the cached-agent selection race and unintended-model execution risk when bindings/catalog/templates change while an agent remains selected, the required user recovery action (explicit agent reselection or window reload), and the narrow scope of this exception (provider refresh updates contributed inventory, and newly discovered or explicitly reselected/reloaded actors must use the expected model; trust/source invalidation, tool/delegation restrictions and hooks are never waived).
   Document Design §6 safe-cleanup prerequisites: retire referencing sessions or establish safe-reopen proof before removing generations. Closing the editor and warning about restored chats alone never authorizes deleting possibly referenced resources.
5. Publish the local support matrix for single-folder project/HOME coexistence, two-folder explicit multi-root switching and isolated local profiles; version tuple/digest/evidence required. Explicitly mark SSH, dev-container and WSL remote authorities as out of scope for this deliverable (failing closed without silent local HOME/editor fallback) and mark unsupported/new host tuples unqualified.
6. Write rollback/recovery runbook: core harness recover repairs transaction only; reverting installed companion is separate consented action to prior qualified package; bindings preserved. No old alias fallback or blanket user-data deletion.
7. Update roadmap/changelog/PDR/summary with completed phase evidence and breaking static-agent/model-map cutover. No claim release deployed/Marketplace published; release operator gates unchanged.
8. Prefer generated activation-guide/source example updates before Phase 09 candidate freeze. If edited here, regenerate/repackage atomically, assign new build/VSIX/template identities, update receipts and rerun affected contract plus actual native guide/reference/selection/hook proof; previous digest-bound acceptance is superseded. Pure maintained Markdown edits leave artifacts unchanged only after confirming no generated/package input changed.
9. Walk through final documented setup using the final requalified packaged bytes, including refusal/proposal-disabled/model-removed states, explicit reselection/reload recovery on binding change, exit-`5` post-commit install recovery and closed-editor storage cleanup instructions. Verify links/help/commands and retained receipts identify these bytes, never superseded candidate hashes.
10. Remove temporary scripts/scaffolds after retained proof, run final review, record actual phase progress; stop before deployment/commit/push unless separately requested.

## Todo list
- [ ] Architecture/requirements/source-map reconciled to actual proof.
- [ ] Local support matrix, actor-over-tier precedence, cached-selection risk/reselection/reload and closed-editor storage cleanup documented.
- [ ] Exit-`5` partial-success, recovery/rollback and per-session live-invocation/install consent boundaries documented.
- [ ] Roadmap/changelog evidence updated without historical edits.
- [ ] Real documentation walkthrough and generated guide checks passed.

## Success Criteria
- Technical reader can install/configure/use supported runtime and diagnose unavailable states without guessing authority/profile/consent.
- Maintained docs and generated guides match final code; no unproven native/production compatibility claims.
- All phases complete only after observable behavior acceptance and review, not after documentation write.

## Risk Assessment
- Documentation can accidentally collapse install/enable/activate into one step; explicit independent states/examples required.
- Host proposal API evolves; requalification trigger and unsupported-version guidance prevent misleading compatibility.

## Security Considerations
- No secrets in examples or receipts; never instruct bypassing trust/permissions/enterprise policy.
- No auto-uninstall or state cleanup commands affecting unrelated extensions/settings.

## Next steps
- User reviews completed candidate and separately authorizes rollout/deployment; this phase does not grant release authorization.

## Unresolved questions
- None after successful qualification. Future host upgrades need new evidence; evaluator repair remains separately undecided and excluded.
