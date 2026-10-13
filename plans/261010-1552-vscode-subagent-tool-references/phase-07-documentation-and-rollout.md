# Phase 07 — Documentation, review, and controlled rollout

## Context links
- [Plan](./plan.md); candidate review requires [Phase 04](./phase-04-build-regenerate-and-stage.md) and Linux rows from [Phase 05](./phase-05-native-delegation-and-permissions.md)/[Phase 06](./phase-06-documentation-workflow-acceptance.md). Full acceptance and rollout require both platforms' rows.
- [Design](./architecture.md), [qualification matrix](./qualification-matrix.md).

## Overview
- Date: 2026-10-11. Priority: P2.
- **Reviewed-Candidate Handoff Status:** Complete (Linux-qualified; Windows-unqualified).
- **Cross-Platform Acceptance / Incident Closure / Production Deployment:** Blocked pending affected-host Windows Local qualification on VS Code `1.140.0` / Copilot Chat `0.68.0` and explicit operator deployment authorization (Steps 9–10 intentionally not executed).
- Publish truthful compatibility guidance and a qualified candidate ([reports/candidate-handoff.md](./reports/candidate-handoff.md)), not an unverified tool-name hotfix.
## Key insights
- Declaration audit, automated behavior coverage, native host capability, and end-to-end incident closure are separate claims.
- Current architecture docs have a broad claim that publication never changes editor settings; source has separate opt-in registration. Clarify this distinction only where explaining this rollout; do not refactor unrelated settings behavior.
- Rollback of plugin declarations does not undo documentation edits or a committed shared HOME publication phase.

## Requirements
- Maintained docs/changelog describe Phase 01's single current supported release pair, preserved restrictions, tested platform rows and host limitations. No older-version support promise.
- Reviewer checks the complete generated-caller migration and permission behavior, not just Scout's header.
- If Windows is unavailable, allow reviewed-candidate handoff after automated and Linux native/workflow checks pass. Label it Windows-unqualified; keep Windows gates and this phase incomplete. No release deployment or incident closure.

## Architecture
- One integration owner updates shared docs and plan status after observing final candidate evidence.
- Release through existing publication pipeline; editor registration remains a separate explicit user-controlled operation.
- Keep the manual parent-scouting workaround documented only while relevant; no hidden permanent fallback.

## Related code files
- Modify after acceptance: `docs/system-architecture.md`, `docs/code-standards.md` only for applicable tool-reference/qualification rules.
- Modify: `CHANGELOG.md`; `docs/project-changelog.md` where the repository records this release's implementation milestones.
- Conditional usage guidance: existing VS Code activation guide authoring in `src/adapters/vscode/configuration-activation-guide.ts`, then regenerate rather than editing its generated Markdown.
- Update plan-local receipts/status and remove the pending-design label only when implementation and evidence justify it.
- Do not rewrite dated historical reports as if they used the current source/version.

## Implementation steps
1. Collect candidate hash and evidence by platform; list passed/failed/blocked/unrun rows. Review may proceed with blocked Windows access only after automated and Linux native/workflow checks pass. Record this as candidate handoff, not implementation acceptance.
2. Review source changes, all affected generated agent classes, omitted/empty/unsupported semantics, Task eligibility, direct/child todo distinction, edit selector behavior and namespace separation.
3. Verify any runtime normalization correction updated both TypeScript helper and production generated bridge authority, with real payload and protected-path regression coverage.
4. Confirm all named callsites/tests/docs are migrated or intentionally unchanged. Remove obsolete invalid-reference comments/aliases and incidental tests; retain genuine model-facing/hook names.
5. Update architecture's pending design paragraph to the implemented, evidence-bounded contract. Document no broad groups, no runtime discovery, no extra extension, and declaration audit versus effective grants.
6. Add changelog entries describing the corrected VS Code projection, not a proven VS Code host defect. State exact supported qualification rows and expected Local child-todo restriction.
7. Write operator instructions for clean republish, selected profile/candidate verification, direct/delegated smoke, and safe manual workaround. Keep source ownership and user-setting approval explicit.
8. Before reviewed-candidate handoff, run required broad verification against final source/generated state: `npm test` (includes its build), dedicated qualification tests absent from that chain, `npm run distribute:check`, and `npm run release:check`. Avoid redundant builds; later changes invalidate affected results and require appropriate reruns before release.
   Candidate handoff may then include review findings, immutable identity, Linux evidence and an explicit Windows blocker. Do not execute steps 9–10 until both platforms' required native/workflow rows pass and deployment is authorized.
9. Preview deployment using the same scope/target and explicit paths intended for the user. Production publication/registration requires deployment authorization; planning approval alone does not grant it.
10. Roll out only the qualified candidate through the existing publisher. Confirm the host loads the candidate URI/hash in a new session; observe direct/delegated smoke on that installation.
11. If rollback is required, stop new workflow sessions, preserve evidence, and use the existing publication recovery for an interrupted transaction or republish a verified known-good candidate. Recovery is not a general version-downgrade switch. Restore only authorized profile registration changes; preserve user-owned config and unrelated files.
12. Do not claim cross-scope rollback: shared HOME commit may remain after project phase failure. Do not undo docs-manager edits automatically; qualification uses disposable docs, production edits require separate review.
13. Record final scope/evidence and mark phases complete only when their success criteria pass. Clean execution-owned temporary scaffolding after evidence retention; leave no fake success receipts.

## Todo list
- [x] Independent review covers permissions, runtime identity and all mapper consumers.
- [x] Maintained docs/changelog updated with qualified claims only.
- [x] Final build/test/distribution/release evidence recorded.
- [x] Rollout explicitly left not deployed (Steps 9–10 gated on Windows qualification and operator deployment authorization).
- [x] Rollback boundaries documented; user-owned files preserved.
- [x] Plan completion distinguishes reviewed-candidate handoff, implementation acceptance, incident closure, and deployed state.
## Success criteria
- Implementation can be accepted only with all required behavior/security checks; deployment is a separate authorized action.
- Incident closed only with affected-host direct/delegated and full workflow evidence on the selected current release pair. Original older-version causality is a separate claim and remains unconfirmed without its own evidence.
- No fabricated host support or native testing claims in maintained documentation.

## Risk assessment
- Broad suite green is not native-host proof; retain matrix gates.
- Existing docs approach 800 LOC; make concise replacements/link to qualification evidence rather than adding large duplicated sections.
- Rollback can revert runtime declarations, not automatically reverse agent-made content changes.

## Security considerations
- No force-overwrite of unmanaged HOME collisions or modification of user settings without consent.
- Keep raw secrets/transcripts out of release artifacts and reports; review sanitizer output.

## Next steps
- If Windows access is unavailable, deliver only the reviewed candidate and explicit blockers; leave completion/closure/deployment pending. Once all acceptance gates pass, deployment still requires separate authorization.

## Unresolved questions
- Production deployment authorization and destination/profile will be resolved at rollout, not inferred from this planning request.
