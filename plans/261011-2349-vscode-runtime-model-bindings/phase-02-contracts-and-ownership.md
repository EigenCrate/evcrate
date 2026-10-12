# Phase 02 — Freeze schemas, ownership and support

## Context links
- [Plan](./plan.md); [design contracts](./design-contracts.md); both [research reports](./research/native-provider-contract.md); [package research](./research/publication-package-contract.md); [interface freeze report](./reports/interface-freeze.md).
- Dependency: Phase 01 offline checks PASS; live editor checks bypassed for Phase 02 by explicit user gate amendment (2026-10-12) and deferred to real-case verification (Phase 09).

## Overview
- Date: 2026-10-12; priority P1; status: DONE (2026-10-12; 100%; Review Cycle 2 approved 8.5/10; user approved; live native checks deferred to Phase 09 per user gate amendment); design-summary review: [Advisor](./reports/advisor-review.md); verification: [tester report](../reports/tester-261012-0258-phase-02-contracts-and-ownership.md), [code review](../reports/code-review-261012-0258-phase-02-contracts-and-ownership.md).
- Convert proposed defaults into one documented contract used by adapter, extension, packager and CLI, with live native qualification explicitly deferred per user gate amendment.

## Key Insights
- Build audit must describe immutable intent; runtime diagnostics describe derived selector; native receipt describes observed selection.
- Installed, enabled, proposed-permitted, activated and configured are separate states.

## Requirements
- Exact schema versions, allowed keys/bounds and change behavior; no second resource/publication protocol.
- Single actor and supporting-hook owners; explicit local root/authority isolation and cross-scope actor-over-tier binding precedence (`root actor > user actor > root tier > user tier`, with canonical `inherit` omitted unless actor overridden).
- Retain all report scope as reconciled by confirmed validation decisions (local project/HOME coexistence, multi-root and local profiles; SSH/dev-container/WSL out of this deliverable), current naming, seven targets and controller-free release rules.

## Architecture
- Shared pure contract/parser helpers may live at `src/adapters/vscode/model-intent.ts` (new); extension bundles that helper, not CLI/filesystem control plane.
- Separate extension compilation under `extensions/vscode-model-bindings/`; extension external `vscode` never enters core CLI closure.
- Frozen producer/consumer contract, not broad framework or compatibility shims.

## Related code files
- Read/plan updates: `src/adapters/vscode/{models.ts,agents.ts,adapter.ts,names.ts,inventory.ts,metadata.ts,index.ts}`; `.evcrate/targets/vscode/manifest.json`; `src/cli/{arguments.ts,types.ts,dispatch.ts}`.
- Created in Phase 02: `src/adapters/vscode/{model-intent.ts,companion-package-contracts.ts,companion-cli-contracts.ts}`; `extensions/vscode-model-bindings/{package.json,tsconfig.json,vscode.proposed.chatPromptFiles.d.ts,src/runtime-contracts.ts,src/diagnostics-contracts.ts,src/contracts.ts}`; `tests/vscode-companion/contracts.test.mjs`.
- Created implementation freeze report in this plan's `reports/interface-freeze.md`; updated proposed design with actual gate conclusions.
- Delete here: none; obsolete map deletion belongs to Phase 03.

## Implementation Steps
1. Read Phase 01 support/native receipts. Freeze extension ID/version, editor/Copilot tuple, `extensionKind`, local-only supported URI/authority rules (rejecting SSH/dev-container/WSL without silent local HOME/editor fallback) and activation events. No broad engine semver range masquerading as qualification.
2. Freeze `agent-intent-v1`, audit-v2, bindings-v1, runtime-diagnostics-v1 and CLI install-notice-v1 exact fields from design. Define canonical actor ID, source tier, template path/hash, reference provenance; no model versions in intent.
3. Specify invalid schema/hash handling and version mismatch, including republish with newer template schema or older extension. No permissive legacy map parser.
4. Freeze whole-installation precedence, invalid-project behavior (no silent fallback to HOME), multi-root explicit window selection, cross-scope binding resolution (`root actor override → user-default actor override → canonical inherit omission → root tier → user-default tier → unresolved`, where explicit actor `inherit` omits `model` and clearing a root override reveals the lower layer) and local profile/root/window authority partitioning.
5. Freeze local instance/window namespaces, Phase-01-calibrated shared persistent and per-instance storage budgets, and evidence-bound safe reclamation across restored chat/two windows. Neither window reload nor extension-host restart authorizes deleting old URI resources; when safe automatic reclamation is unproven, budget exhaustion blocks new derivation without deleting uncertain referenced resources and directs to manual cleanup only after all editor windows/processes using the storage are fully closed (preserving bindings and published files, with warning that restored chats may reference removed generations).
6. Freeze exact checkout source/tool receipt inputs and separate explicit packed-layout verifier contract, missing-file behavior, VSIX embedded build identity/version immutability and source/overlay snapshot freshness. Keep seven external release assets and existing schema shapes.
7. Freeze CLI flags and mutual exclusions, eligible operations, request-file semantics, local editor/profile target (refusing unsupported remote contexts before launching any local installer), deadline/output limits, `install-notice-v1` stderr notice and exit code `5` when an explicitly requested post-commit companion install fails or requires manual setup (preserving committed publication on stdout, with no rollback or blind publication retry). Existing settings registration stays separate.
8. Build strict pure parsers/contracts and real extension package manifest; do not create empty runtime methods. Compile contracts via dedicated extension tsconfig and existing core build after writers finish.
9. Record integration owner/file boundaries. Phases 03/04 may overlap after this freeze; 07 follows real extension runtime completion; CLI 08 follows packaging 07.

## Todo list
- [x] Native support and extension identity defined (live editor qualification deferred per user gate amendment).
- [x] Intent/binding/audit/notice schemas defined and implemented.
- [x] Root precedence/trust and lifecycle contracts defined and implemented.
- [x] Package snapshot and CLI consent boundaries defined and implemented.
- [x] Contract parsers compiled and boundary cases exercised.

## Success Criteria
- Adapter, extension, packaging and CLI implementers can consume the same field definitions without guessing.
- Strict boundary smoke rejects unknown schema, unsafe path/hash and selector collision; valid intent survives round-trip without canonical changes.
- No caller relies on the obsolete hardcoded native model map after planned migration.

## Risk Assessment
- Shared code can drag CLI imports into extension or `vscode` into core. Mitigate pure imports and closure verification.
- Live native Phase 01 editor checks are deferred to Phase 09 real-case verification per the 2026-10-12 user gate amendment; final release qualification remains gated on those live native checks.

## Security Considerations
- Model identity is data, not executable input; strict bounded JSON, no path-based dynamic imports.
- Workspace trust/root approval and normal host tool policy remain authoritative.

## Next steps
- Phase 03 templates and Phase 04 extension/root/provider implementation can proceed with disjoint writers; parent coordinates shared contract changes. Root `package.json` companion script wiring belongs to Phase 07 (`verification-matrix.md:36`).

## Unresolved questions
- Live native editor verification of cross-source plugin hook attribution (`local-hook-bridge.cjs`), live host selector matching (`name (vendor)`) and child subagent model inheritance, mid-session cached-selection race and explicit reselection/window-reload recovery, live multi-window/restored-chat URI retention budget calibration, and profile disabled-state/build-identity inspection remains deferred to Phase 09 real-case verification per user gate amendment (see [interface freeze report](./reports/interface-freeze.md)). Non-blocking Cycle 2 review items (`W-A` canonical idempotent root identity, `W-B` leaf module split for `contracts.ts` ↔ `diagnostics-contracts.ts`, `W-C` diagnostics actor cap and status/reason coherence) are tracked for Phase 04 runtime integration.
