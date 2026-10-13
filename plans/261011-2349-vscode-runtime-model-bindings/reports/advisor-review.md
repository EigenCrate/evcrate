# Advisor review — VS Code runtime model bindings

**Historical review:** The [Validation Summary](../plan.md#validation-summary) supersedes the remote qualification and strict cached-selection gates below. Current contracts require local project/HOME, multi-root and profiles only, and accept documented cached selections until explicit reselection/reload, including unintended-model risk. Race/recovery evidence and correctness for refreshed selections, trust, restrictions and hooks remain required. This notice does not claim the original review assessed the reconciled contract; native checks remain NOT RUN.

## Review scope

Host Advisor (`openai-codex/gpt-6-astra`) reviewed the completed design/phase summary. Initial exact-file attachment attempt was rejected because tracked-file attachments are disabled. Retried without attachments; consultation succeeded. Settings were not changed.

This is a design-summary review, not independent file-by-file review, code approval, native qualification or a second review of applied corrections. No numeric score or unconditional implementation approval was returned.

## Overall recommendation

Advisor supported the immutable-intent/runtime-selection split, explicit native gate and publication/installation separation. Recommendation: incorporate four contract corrections, keep native gates unproven, finish document/link validation.

## Corrections incorporated

| Finding | Settled correction | Updated surfaces |
|---|---|---|
| Shared storage across windows and restart does not establish exclusive ownership/safe reclamation | Authority/root/instance UUID namespace; no cross-instance deletion; per-instance plus persistent store budgets; native two-window/restart/restored-chat proof; lifecycle restart alone never grants cleanup | Design §6; Phases 01, 02, 06, 09; verification matrix |
| Source receipt/packed verification and overlay snapshot resolution underspecified | Exact checkout source/tool closure and missing-input failure; explicit validated packed-layout verification against embedded build identity/manifests/inventory, never missing-source bypass; serial/worker snapshot-only overlay, mutation/collision/symlink proof | Design §7; Phases 02, 07; matrix |
| Matching version is not exact VSIX identity; prelaunch hashing leaves replacement race | Embedded build identity/private release version immutability; version-only state unverified/manual setup; qualified installed identity proof; private checked staged copy retained through installer completion/cancel | Design §7–8; Phases 01, 02, 07–09; matrix |
| Phase 10 generated-guide edits can supersede Phase 09 candidate | Prefer guide changes before final freeze; later artifact edits regenerate package/manifests/identities and rerun affected native qualification; final receipts cannot cite old hashes | Design §9; Phases 09–10; matrix |

Estimate clarified as nominal engineering work only, excluding environment provisioning, external access and feasibility-driven redesign.

## Native blockers retained

- Provider/plugin attribution: required hooks, restrictions, relative references and skills must work for direct and child invocations.
- Stale selected actor/model: unintended-model execution fails chosen-model acceptance. Documenting race/reselection is not a pass; weaker guarantee needs explicit user-approved scope change.
- Profile/remote installation: exact target and disabled-state preservation require native proof. Manual instructions are safe guidance, not automatic-install acceptance.

These remain Phase 01 gates and are requalified against final bytes in Phase 09. No implementation or native proof was performed for this planning task.

## Unresolved questions

Native gate outcomes are unknown. Advisor attachments remain disabled; no exact-file independent review is claimed. Corrections were incorporated by the parent; a second Advisor approval was not requested or fabricated.
