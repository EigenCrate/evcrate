# Phase 08 — Two-platform qualification and operator handoff

## Context links
- [Plan](plan.md); dependency [Phase 07](phase-07-packaging-and-regression.md); [validation matrix](validation-matrix.md).
- [Design contracts](design-contracts.md); Phase 01 support receipts establish baseline, not final acceptance.

## Overview
- Date 2026-10-13. Priority P1 release gate. Implementation pending. Review pending.
- Prove specified behavior end-to-end against final package on Linux x64 and Windows x64; hand off usable installation/docs without public publication.

## Key Insights
- No compile/test/mock output can prove Copilot actually invokes a second model or sees startup context.
- Each platform needs actual desktop/Extension Host/authorized model observation, not merely portable tests.
- Missing access is a blocked acceptance criterion, never a silent Linux-only release.

## Requirements
- Exact final VSIX digest and source identity, pinned host tuples, authorized real Copilot account/model.
- Scratch project with controlled known defect and non-secret sentinel files; separate disabled/untrusted/unsupported cases.
- Observable first-turn guidance, native tool selection, selected-model response and executor continuation.
- Evidence for privacy defaults, cancellation, errors, ownership and uninstall limits.

## Architecture
- Native acceptance runs real user journey; deterministic tests cover hard-to-provoke denial/quota/race edges separately.
- Record requested selected model identity and observed responding model metadata when publicly available. Distinguish selected catalog identity from provider-reported identity; never invent hidden routing proof.
- Receipts reference screenshots/debug context/output events without copying private source or tokens.

## Related code files
Create plan-local `/home/loidinh/WS/evcrate/plans/261013-1025-vscode-local-advisor/reports/native-qualification-linux.md`, `native-qualification-windows.md`, `final-acceptance.md` during implementation.
Update `/home/loidinh/WS/evcrate/docs/vscode-advisor.md`, `README.md`, `docs/system-architecture.md`, `docs/codebase-summary.md`, `docs/project-overview-pdr.md`, `docs/project-roadmap.md`, `docs/project-changelog.md` with observed shipped boundaries only.
Update phase/plan statuses after evidence, never before. No automatic commits/push/deploy/publication.

## Implementation Steps
1. Freeze final VSIX hash. Install in isolated profile/extension dirs on both platforms without proposed flags or model-binding companion. Record exact host/Copilot/Node/Git/shell/package identifiers.
2. Run configure: observe explicit model consent/selection and privacy summary; cancel once and verify saved state unchanged. No workspace file should be written before enable consent.
3. Enable in trusted single-root fixture. Preview/approve exact files; inspect untouched existing hooks/settings. Confirm status reports hook discovery/configuration health without pretending to know model execution success.
4. Start new **Local / Agent** session, ensure native tool selected, submit a task with substantive proposed defect. Use supported context/debug surface to verify startup guidance precedes first model response and contains correct callable tool reference, not merely an extra UI warning.
5. Explicitly invoke `#evcAdvisor`, observe selected-model review returned as native tool result; main executor decides whether to adapt and validates independently. Verify advisor tool supplied no tools and performed no workspace edits.
6. Repeat with natural high-value planning/failure/completion prompts to observe best-effort automatic consultation. Record behavior, not a guaranteed invocation rate; lack of automatic call does not falsify explicit tool correctness but must not be marketed as enforced.
7. Exercise default privacy using controlled sentinels: Git summary returns names/status/counts, no patch/body; redaction replaces known credential pattern; rules bounded; full/attachments remain unavailable until explicit user changes. Inspect application-boundary captured request in safe qualification instrumentation, never retain raw production payloads; remove instrumentation before final digest qualification or make it test-only outside shipped package.
8. Enable full/explicit text attachments in scratch user configuration, verify requested ceiling narrowing and per-file/aggregate limits; reset defaults. Confirm unknown root/multi-root/remote/untrusted scenarios refuse without model request.
9. Cancel during actual stream and observe cancelled—not complete—review. Test missing selected model and disabled tool/hook; record actual model/quota denial if naturally available, with deterministic suite covering unprovoked error classes. Do not intentionally exhaust subscription quota.
10. Disable workspace while enabled/active; new requests refused and new session gets no enabled guidance. Remove through owned command and verify unchanged user files. Test extension-disabled orphan hook: conditional guidance is allowed, fake successful review is not. Document manual cleanup after uninstall.
11. Exercise repair and upgrade of unmodified owned assets; introduce a user edit and verify preservation. Cross-profile owner conflict must refuse instead of overwriting. Windows locked-file/junction behavior and shell path tests must have platform-specific receipts.
12. If any fixes change package bytes, rebuild, rerun affected deterministic gates and repeat final native baseline against new digest. Do not combine receipts from mismatched candidates into PASS.
13. Update docs from planning-only to actual supported behavior only after both native gates pass. Preserve explicit exclusions and Preview hook caveat; record tested model pair without implying universal entitlement.
14. Final review checks every matrix row with PASS/BLOCKED/NOT-APPLICABLE and evidence link. Blocked essential native row keeps plan incomplete. Deliver private VSIX path/hash, install instructions, source/tests/docs and limitations; no public publish.

## Todo list
- [ ] Linux final-package native receipt.
- [ ] Windows final-package native receipt.
- [ ] First-turn guidance and same-chat advisor result observed.
- [ ] Default/opt-in privacy and cancellation evidence.
- [ ] Ownership/disable/removal/upgrade evidence.
- [ ] Full matrix reviewed; docs accurate; candidate-bound handoff.

## Success Criteria
- All mandatory matrix rows pass with appropriate deterministic or native evidence, and both platforms satisfy native G/N rows.
- User can install, configure, enable, start fresh Local chat, consult advisor, disable/remove safely by following docs.
- No proposed flags, OMP process, external credentials, replacement chat, hidden retries or hard gates.
- Exact candidate-bound support statement; no missing platform or account prerequisite hidden as completed work.

## Risk Assessment
- Provider/model changes can invalidate results later: record exact tuple and rerun on supported upgrades.
- Model critique is nondeterministic: known-defect scenario verifies meaningful evidence delivery and review workflow, not exact prose or universal bug detection.
- UI screenshots alone cannot establish payload privacy; pair with deterministic request-boundary evidence.

## Security Considerations
- Authorized requests only, no real secrets/private code in qualification.
- Redact evidence and remove temporary instrumentation before freezing final package.
- Uninstall cannot retract already-sent data or existing session context; state clearly.

## Next steps
User evaluates the completed supported product. Enforced gates, images, transcript history, remote/multi-root/macOS, Marketplace release and EVCrate publish integration require separately approved plans; none is silently promised here.

## Unresolved questions
None for product scope. Native account/environment failures remain explicit execution blockers until resolved.
