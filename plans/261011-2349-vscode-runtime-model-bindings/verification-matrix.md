# Verification matrix

**Status:** Future implementation acceptance; every row currently NOT RUN. Reconciled with confirmed [Validation Summary](./plan.md#validation-summary). [Plan](./plan.md); [design](./design-contracts.md); [original criteria](../reports/brainstorm-261008-1239-vscode-runtime-model-bindings.md#acceptance-and-feasibility-gates).

## Report acceptance traceability

| AC | Observable requirement | Owning phases | Required proof |
|---|---|---|---|
| 01 | Install/activate on declared tuple; proposal-disabled setup guidance | 01, 04, 07–09 | Real exact VSIX installed in isolated selected profile; native activation/disabled-proposal receipts |
| 02 | Picker and custom-subagent actors exactly once; static actors absent | 01, 03–04, 09 | Native inventories and harmless actual child discovery, not directory-only count |
| 03 | Three required tiers, cross-scope actor precedence (`root actor > user actor > root tier > user tier`), deliberate inherit | 02, 05, 09 | Resolver boundary tests plus real commands/direct-child selection with override/reset |
| 04 | Newly discovered/refreshed/reselected direct and subagent model matches binding; truthful audit; tool/cost precedence | 01, 03, 05–06, 09 | Exact emitted selector + runtime provenance + native selected identity metadata on newly selected/reselected current-generation or reloaded invocations (wrong model after refresh/reselection fails); premium/explicit tool model observed |
| 05 | Running turn keeps immutable resource; config/catalog/template update refreshes inventory and reselected/reloaded invocations without unconditional cached-selection refresh promise | 01, 06, 09 | Native running-turn immutability + explicit reselection/reload recovery from current generation (provider event alone insufficient); revision/superseded-work regression |
| 06 | Missing/removed/ambiguous model explicit; cached selected-agent race and unintended-model limitation exercised with recovery proof | 01, 05–06, 09 | Empty/removed/ambiguous catalog cases, native cached-selection race observation + required explicit reselection/reload recovery proof; trust, restrictions and hooks never waived |
| 07 | Empty tools/agents, hooks, references, skills/workflows preserved | 01, 03–04, 09 | Native harmless deny/allow attempts and privacy/scout/session hook/reference execution; frontmatter alone insufficient |
| 08 | Canonical/published hashes unchanged at runtime; bindings survive republish | 03–07, 09 | Before/after hashes around real config/refresh/republish and persisted choices |
| 09 | Refusal/disabled/profile mismatch/install failure or manual-setup-required (exit 5)/untrusted handled safely | 01, 04, 08–09 | Native isolated-state before/after + CLI committed stdout, companion stderr and exit 5 on explicit failed/manual-setup-required, no rollback/blind retry or unauthorized mutations |
| 10 | Local project/HOME coexistence, multi-root and profiles declared/qualified; unsupported contexts refuse local fallback | 01–02, 04–06, 08–09 | Exact folder/root selection, local profile/root/window storage isolation, authority safety, and provider/install/hook/model evidence |
| 11 | Build, affected tests, distribution checks and native smoke pass | 07–10 | Current compiled/packed byte identity, integrated contract/full-suite outputs, real editor walk-through |

## Required context rows

- Local project-only and HOME-only; both installed with project precedence.
- Present invalid project with valid HOME (error, not policy switch); source disappearance/trust revocation and restoration.
- Two-folder workspace: explicit selected installation; reorder folders, switch selected root, conflicting same-name actor policies, no first-folder heuristic/duplicate registrations.
- Local storage isolation and authority boundary: isolated `storageUri`/partitioned `globalStorageUri` across local profiles, roots and window/extension-host instance UUIDs; SSH, dev-container and WSL are excluded from this deliverable without changing unrelated baseline support, retaining URI/authority validation and failing closed on unsupported non-local contexts without silent local HOME/editor fallback.
- Profile A/B, disabled/unknown extension, exact installed build identity versus matching version/different bytes, no proposal grant; explicit requested install `failed` or `manual-setup-required` returning exit 5 with committed core stdout, companion stderr notice and no rollback or blind publication retry; staged install race with concurrent republish, cancel and per-instance stage ownership.
- Untrusted workspace; unavailable/empty/error catalog; removed/renamed identity, ambiguous selector, host cost/tool override. Cached-agent selection across config/catalog/template updates has a narrow documented exception (possible unintended-model execution until explicit reselection/reload), but native race observation and explicit reselection/reload recovery proof remain REQUIRED; newly discovered, refreshed or reselected resources (current-generation selection/reselection or reload recovery, not a provider event alone) executing an unintended model fail acceptance, and workspace trust/source invalidation, tools/delegation restrictions and hooks are never waived.
- Schema/tamper, mixed snapshot, watcher/superseded work/cancel, two windows, extension-host restart/restored chat, root switching, and measured/proposed per-instance and shared persistent storage budgets (exhaustion blocks new derivation without deleting uncertain referenced resources; bounded retention and safe fully closed-editor manual cleanup with explicit session/reference retirement or reopen proof accepted when automatic reclamation is unproven). Checkout source receipt completeness and explicit packed-layout validation with missing-source/artifact behavior; live overlay mutation/symlink/collision cases.

All required local contexts remain in planned scope (SSH, dev-container and WSL are excluded from this deliverable per confirmed validation). An unavailable required local native host is a blocker/evidence gap, not an automated-test substitute or implicit support reduction. If a required row is technically infeasible, stop for user-approved redesign/support change.
Unsupported-authority guards are exercised as local boundary cases; they do not require provisioning or qualifying SSH, dev-container or WSL hosts. Safe manual cleanup follows Design §6: fully close the editor and retire references/sessions or establish safe-reopen proof before removing generations; a warning alone never permits deleting possibly referenced resources.

## Automated checks planned, not run now

- Core: existing `npm run build`; dedicated extension compile/check command added in Phase 07.
- Focused: affected `tests/adapters/vscode-*.test.mjs`, `tests/cli/*vscode*.test.mjs`, extension consumer-visible behavior suites, snapshot/parity/closure/package suites.
- Integration: `npm run generate:all`, `npm run distribute:check`, `npm run release:check`, companion VSIX verifier, existing `npm test` plus extension tests integrated into it.
- Package: npm inventory, Linux tar/Windows ZIP companion hashes, exact seven external assets; serial/worker equivalent projections and atomic eight-manifest promotion.
- Permanent tests target real errors/precedence/transitions/bounds. No source-text, wording, wiring/mock-echo or tautological tests. Native proof is always separate.

## Native evidence contract

Receipt names are produced only when exercised; every row is currently NOT RUN for future implementation only, with no empty PASS placeholders. Each live qualification session requires prior explicit user approval naming the exact isolated profile/workspace, selected models and invocation scope (separate from installation and proposed-API authorization). Minimum receipt fields: prior session approval scope (exact isolated profile/workspace, selected models, invocation scope), candidate/source revision, canonical/intent/template hashes, build digest, VSIX SHA-256/extension version, editor commit/version/Copilot version, selected profile/authority/trust/proposal state, exact scenario, expected/observed model/resource/restriction disposition (including required native cached-selection race and explicit reselection/reload recovery proof), pass/fail/unavailable, sanitized evidence reference.

Actual host-observed model metadata required for model selection; model self-description is not evidence. Catalog identity/emitted frontmatter are build/runtime evidence, not proof of inference choice. No credentials, prompts, tool traces/page bodies or hidden reasoning in reports.

## Acceptance boundary

Code completion requires all eleven AC rows plus affected callers/docs, final code review and current native proof. This planning task validates document structure/links only; no extension behavior, installation, model inference or release qualification is claimed.
Generated guide/source changes after Phase 09 require new candidate identities and affected native requalification; final receipts may not cite superseded hashes. Unsupported non-local contexts fail closed without local fallback; for required local profile tuples, `manual-setup-required` returns exit 5 when explicitly requested and does not satisfy automatic-install acceptance.

## Unresolved questions

Local native feasibility/support rows, measured retention caps and cached-selection race/reselection recovery behavior are resolved by Phase 01 and requalified against final bytes in Phase 09 after per-session live-invocation approval. Unconditional cached-selection refresh without explicit reselection/reload is not promised by this provider design.
