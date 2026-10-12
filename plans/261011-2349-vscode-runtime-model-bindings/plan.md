---
title: "VS Code runtime model bindings"
description: "Private proposed-API companion with immutable agent intent, user runtime model bindings and consented postpublish installation."
status: in-progress
priority: P2
effort: 65h
branch: main
tags: [feature, vscode, api, experimental]
created: 2026-10-11
---

# VS Code runtime model bindings

## Decision and scope

Phase 01 offline spike complete; Phases 02–08 DONE (2026-10-12). Phase 09 status: Automated/isolated-host qualification complete (2026-10-12); overall qualification pending blocked interactive gates. Recorded evidence: 211/211 automated tests plus isolated VS Code 1.140.0 CLI install N-01, Extension-Host activation/commands N-02, and hook bridge N-03 PASS; Review Cycle 1 approved 8.5/10. Phase 10 documentation/guarded rollout is next, but does not clear the blocked gates; release/deployment requires native gates to clear and separate user authorization.

Input: [agreed brainstorm](../reports/brainstorm-261008-1239-vscode-runtime-model-bindings.md). Current baseline replaces its historical advisor/Gemini assumptions: 17 `evc-*` actors; plugin `evc`, command skills `cmd-*`.

Deliverables: hashed VSIX inside vscode output; immutable templates/intent; runtime tier/actor picker; provider-owned concrete resources outside publication roots; refresh/diagnostics; independent consented CLI installation; integrated native proof and operations docs. No evaluator repair, inference harness, hidden latest-model guessing, editor patches or silent static fallback.

Required support/qualification is local only: project/HOME coexistence, multi-root and profiles. SSH, dev-container and WSL are excluded from this companion deliverable; unrelated baseline support is unchanged. Cached selections may execute an unintended model until explicit reselection/reload. Native race and recovery proof remains required; correctly refreshed/reselected resources, trust, restrictions and hooks remain hard correctness gates.

## Phases

| Phase | Dependency | Status / progress | Estimate | Details |
|---|---|---|---|---|
| 01 Native feasibility | None | Offline complete / native gates BLOCKED (2026-10-12) | 8h | [Phase 01](./phase-01-native-feasibility.md) |
| 02 Contracts and ownership | 01 PASS | DONE (2026-10-12; contracts & parsers complete, live editor qualification deferred to Phase 09 per user gate amendment) (100%) | 5h | [Phase 02](./phase-02-contracts-and-ownership.md) |
| 03 Immutable templates | 02 | DONE (2026-10-12; immutable templates, intent v1 & tool audit v2 emitted, models.ts removed, 665 passed, 0 failed, 1 skipped) (100%) | 7h | [Phase 03](./phase-03-immutable-agent-templates.md) |
| 04 Companion provider runtime | 02; 03 for smoke | DONE (2026-10-12; guarded activation, candidate roots, secure loader, renderer, atomic storage & provider; 13/13 companion tests, 232/232 adapter tests pass) (100%) | 8h | [Phase 04](./phase-04-companion-provider-runtime.md) |
| 05 Runtime bindings and picker | 03–04 | DONE (2026-10-12; model catalog validation, scoped versioned binding store, pure resolver, QuickPick configuration commands, diagnostics display, and loader integration; 34/34 companion tests, 232/232 adapter tests pass) (100%) | 6h | [Phase 05](./phase-05-runtime-bindings-and-picker.md) |
| 06 Refresh and diagnostics | 03–05 | DONE (2026-10-12; revisioned coalesced single-flight refresh, scoped atomic-swap template watcher, persistent authority storage accounting/locking, and runtime diagnostics v1 implemented; 41/41 companion tests, 98/98 adapter tests pass; live native editor smoke deferred to Phase 09 per user gate amendment) (100%) | 6h | [Phase 06](./phase-06-refresh-and-diagnostics.md) |
| 07 VSIX/build integration | 03–06 | DONE (2026-10-12; offline pinned build/verifier, targets overlay & source receipt bound to snapshot, serial/worker promotion parity proven, package/archive VSIX closure and seven-asset invariants verified; 82/82 distribution & companion tests pass; Review Cycle 3 approved 8.5/10; packed install smoke deferred to Phase 09 per user gate amendment) (100%) | 6h | [Phase 07](./phase-07-vsix-and-build-integration.md) |
| 08 Consented installation | 02, 07 | DONE (2026-10-12; flags, pre-mutation validation, verified staged-file install via processRunner, post-install re-probe verification, uncaught exception guard, stdout publication preservation, stderr install-notice-v1, exit 5 on requested failure/manual-setup; 41/41 primary tests pass; Review Cycle 2 approved 7/10; live native install smoke deferred to Phase 09 per user gate amendment) (100%) | 6h | [Phase 08](./phase-08-consented-postpublish-installation.md) |
| 09 Integrated qualification | 03–08 | Automated/isolated-host qualification complete (2026-10-12); overall qualification pending blocked interactive gates. Evidence: 211/211 automated tests; isolated VS Code 1.140.0 CLI N-01, Extension-Host N-02, and hook bridge N-03 PASS; Review Cycle 1 approved 8.5/10. Interactive GUI/live-inference rows remain BLOCKED. | 10h | [Phase 09](./phase-09-integrated-qualification.md) |
| 10 Documentation/rollout | 09 closeout (automated/isolated rows PASS; interactive GUI/live-inference rows remain BLOCKED) | Pending / 0% | 3h | [Phase 10](./phase-10-documentation-and-rollout.md) |

65h is nominal engineering work only; excludes environment provisioning, external model/profile access and feasibility-driven redesign. Not a completion deadline or qualification promise. Shared gates sequential; only 03/04 have independent ownership after freeze. No half-cutover publication.

## Contracts and evidence

- [Design contracts](./design-contracts.md): schemas, root/authority precedence, actor/tier layering, storage/lifecycle bounds, packaging and post-action status.
- [Verification matrix](./verification-matrix.md): all eleven report acceptance criteria, failure cases and real native proof.
- [Baseline analysis](./reports/baseline-analysis.md); [native API research](./research/native-provider-contract.md); [package research](./research/publication-package-contract.md); [native feasibility report](./reports/native-feasibility.md); [support matrix](./reports/support-matrix.md); [interface freeze](./reports/interface-freeze.md).
- [Maintained architecture](../../docs/system-architecture.md#proposed-vs-code-runtime-model-bindings--planning-only) records immutable templates, companion provider runtime, runtime bindings/picker, refresh/diagnostics, VSIX build/snapshot integration, and consented postpublish installation implemented; Phase 09 automated/isolated qualification is complete with interactive GUI/live-inference rows blocked; Phase 10 documentation and guarded rollout is pending.

## Execution rules
1. Start Phase 01 with authorized isolated local editor/profile/workspace prerequisites. Before any live model check in any phase, obtain explicit approval per qualification session naming the exact isolated profile/workspace, selected models and invocation scope; changes require renewed approval. This plan/interview grants no live invocation, extension-installation or API-enablement consent. Failed hook/reference/restriction or refreshed-selection correctness gates stop cutover; the documented cached-selection limitation is accepted.
2. Freeze interfaces only from observed native evidence. Each phase has exact files, steps, checks, security risks and unresolved questions.
3. Before exported-symbol removal use available LSP references. Reuse existing parser/tool/reference/CLI/process/build conventions; clean caller migration, no shims.
4. Runtime never edits canonical/published files. Artifact placement is not install consent; installation is not API enablement/activation.
5. Final proof uses packaged bytes, actual picker/direct/subagent/tool/hook paths and current local host/profile tuples. Unavailable required local scope stays blocked; further support reduction requires explicit user approval. Cached-selection races require recorded evidence, unintended-model risk disclosure and explicit reselection/reload recovery proof, not strict invocation interception.
6. Regenerate aggregate plus seven per-target manifests atomically; retain exact seven external release assets. New VSIX is embedded data, not controller infrastructure.

## Review and planning verification
Advisor design-summary review completed; four contract corrections incorporated. [Advisor review](./reports/advisor-review.md) and baseline/API research retain historical conclusions; the Validation Summary and reconciled contracts supersede their remote-scope and strict cached-selection gates. [Planning verification](./reports/planning-verification.md) records document/link coverage only, not implementation acceptance.

## Validation Summary
**Validated:** 2026-10-12 | **Questions asked:** 8 (6 decision topics; 2 clarification questions)
### Confirmed Decisions
- Support: local contexts only—project/HOME coexistence, multi-root and profiles retained; SSH, dev-container and WSL qualification/support claims removed from this deliverable.
- Stale selections: accept a documented cached-agent limitation until explicit reselection/reload, including possible unintended-model execution; not a blanket waiver of model correctness, trust, restrictions or hooks.
- Extension binding precedence: actor specificity wins across scopes; a user-default actor override beats a root tier binding, and a root actor override beats the user-default actor override.
- Storage: accept bounded retention and manual closed-editor cleanup when safe automatic reclamation is unproven; proposed caps remain subject to feasibility measurements, and exhaustion blocks new derivation without deleting possibly referenced resources.
- Terminal partial success: explicitly requested install failure/manual setup returns exit 5; stdout preserves committed publication, stderr reports companion status. No rollback or blind publication retry.
- Live model checks: require approval per qualification session for the exact isolated profile/workspace, selected models and invocation scope. This interview grants no live invocation, install or API-enablement consent.

### Action Items
- [x] Revise support scope in design contracts, verification matrix and affected phases: remove required remote rows/claims while retaining local project/HOME, multi-root, profiles and local storage isolation.
- [x] Revise stale-selection gates in design contracts, verification matrix and Phases 01/06/09/10: distinguish cached-selection limitations from correctly refreshed bindings, preserve native race evidence, and document explicit reselection/reload guidance plus unintended-model risk.
- [x] Make per-session live-invocation approval explicit in Phases 01/09 before any quota-consuming qualification.

- **Recommendation:** Document reconciliation, Phases 02–08, and Phase 09 automated/isolated qualification are complete (2026-10-12). Phase 09's interactive Copilot Chat GUI picker and live authenticated inference rows remain explicitly BLOCKED in [native qualification](./reports/native-qualification.md). Proceed next with Phase 10 documentation/guarded rollout, documenting only evidenced behavior and preserving separate release authorization.

## Unresolved questions
- Interactive Copilot Chat GUI picker, live authenticated inference, cached-selection race/recovery, in-turn restriction/hook enforcement, and Linux native GUI qualification remain BLOCKED pending their required host/profile/session access ([native qualification](./reports/native-qualification.md)). Live invocation, extension installation and proposed-API enablement require separate per-session authorization. Evaluator repair remains undecided and excluded.
