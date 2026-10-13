# Phase 05 — Native delegation and permission qualification

## Context links
- [Plan](./plan.md); dependency [Phase 04](./phase-04-build-regenerate-and-stage.md).
- [Qualification matrix](./qualification-matrix.md), [host contract](./research/host-reference-contract.md).

## Overview
- Date: 2026-10-10. Priority: P1. Implementation: complete. Review: complete (Score: 8.5/10 — Approved with recommendations).
- Prove direct and delegated access in the actual Local harness while keeping permission restrictions intact.

## Key insights
- Successfully generating a plugin is not proof that the selected host loaded it or resolved its tools.
- A parent can work while a custom child fails because the child replaces tool selection with its explicit references.
- Todo is deliberately disabled in Local child sessions; do not count that expected restriction as a regression.
- Direct and delegated runs may select different models. Record actual models; do not silently attribute model differences to tool handoff.

## Requirements
- Execute N01–N10 and W04 on native Linux and Windows Local using Phase 01's pinned current supported release pair. No older-version compatibility qualification.
- Use a disposable profile/workspace; fixture plugin and production plugin must not collide under identical plugin identity.
- Preserve all denial/approval policies and source grants. No real repository editing by Scout.

## Architecture
- First qualify no-shell controls to isolate reference resolution; then qualify generated production Scout with actual EVCrate hooks.
- Fixture-only capture hooks do not prove production policy compatibility. Both surfaces are required.
- Candidate changes after a failure invalidate affected hash-bound results; regenerate and rerun only the changed behavior plus relevant security controls.

## Related code files
- Execute staged `com.github.copilot/agents/*.agent.md` and production runtime hooks from candidate roots.
- Use `scripts/qualification/redact-vscode-local-evidence.mjs` for evidence.
- Conditional fixes only in Phase 02/03 ownership: `metadata-tools.ts`, `tool-inputs.ts`, `runtime-sources.ts`, affected fixtures/tests.
- Create during execution: plan-local `reports/native-qualification.md` and sanitized evidence referenced by candidate hash.
- No manual edits to published/generated production agents.

## Implementation steps
1. Verify Phase 04 checks and freeze candidate identity. Verify editor/extension versions match Phase 01's selected pair; record Local profile/workspace/model and agent source. An upgrade requires operator approval, not silent installation.
2. Register the fixture plugin only in the disposable profile with operator approval; start fresh chat context. Materialize fresh fixture values without supplying answers in prompts.
3. Run direct and delegated reader cases. Require actual file discovery, text search and file read, exact returned fixture values and no mutation. Scope searches to avoid intentionally prohibited root-wide patterns.
4. Run deny-all direct and delegated controls. Capture disabled tools or host denial; verbal refusal without host evidence is inconclusive.
5. Run direct no-child control with valid agent tool plus empty `agents`. This isolates the outgoing allowlist from the global default that already prohibits nested delegation. Do not enable nesting.
6. Run a Task-bearing coordinator with an explicitly permitted child. Confirm a real child starts and returns grounded data; parent must not simulate its report.
7. Exercise explicit edit/create/overwrite/multi-edit and terminal capability-family controls on synthetic files/processes. Confirm operations use intended tools; inspect actual payloads and policy decisions. Do not infer edit success from placeholder registration.
8. Verify direct todo behavior and expected delegated todo restriction separately. Do not require a child todo call to pass this phase.
9. Switch the disposable profile to the generated production candidate; refresh host state and verify loaded Scout URI/hash. Repeat direct/delegated Scout and security-denial/approval cases with actual EVCrate policies.
10. If a benign operation reaches the hook but is rejected by a real schema mismatch, return to the bounded Phase 02/03 fix. Update both TypeScript normalization and generated runtime-source authority where applicable; never patch the installed bridge.
11. Repeat rows on the affected native Windows installation using the selected pair, after an operator-approved upgrade if needed. Preserve original-version evidence separately. If Windows is unavailable, mark its rows blocked; Linux Phase 06 work and reviewed-candidate preparation may proceed after their prerequisites pass, but this phase, Windows acceptance, incident closure and deployment remain incomplete.
12. Redact captures with the existing CLI:
    ```bash
    node scripts/qualification/redact-vscode-local-evidence.mjs --input "$RAW_EVENTS" --output "$SANITIZED_EVENTS"
    ```
    Review redacted content manually and retain explicit nonsecret candidate hashes in the receipt, because generic secret matching can scrub hash-like strings.
13. For any correct-profile/valid-reference/delegation-only failure, produce a minimal upstream reproduction with versions and exact errors. Keep cause unconfirmed until evidence isolates it.

## Todo list
- [x] Direct and delegated reader/Scout operations pass with traces.
- [x] Deny-all, no-child, and positive Task controls pass.
- [x] Edit and terminal capabilities exercised without privilege widening.
- [x] Existing policy denials/approvals preserved with native payloads.
- [x] Windows qualification recorded or explicitly blocked.
- [x] Redacted evidence tied to immutable candidate identity.

## Success criteria
- All required native rows pass on the declared host envelope; expected child-todo restriction recorded accurately.
- Effective references match loaded candidate; no shell fallback used for failed read/search/edit probes.
- User-reported incident is not called resolved from Linux-only evidence or merely changed configuration.

## Risk assessment
- Stale profile/cache: fresh session plus source URI/hash evidence, not an assumed reload effect.
- Model-bound edit tool availability: record actual model and enforce Phase 01 contract.
- Qualified references with incompatible hook schema: targeted fix and security regression, not suppression of errors.

## Security considerations
- Kill controls target only an execution-owned harmless process/terminal; never production services.
- Privacy probes use synthetic `.env` content, not actual credentials.
- Raw captures remain outside source control; no secret-bearing dumps in bug reports.

## Next steps
- Phase 06 may execute a platform's workflow rows once that platform's required Phase 05 rows pass. Windows unavailability does not block Linux evidence collection or later reviewed-candidate handoff; it still blocks overall completion, incident closure and deployment.
- Address code review recommendations (harness assertion rigor for N01/N03/N07/N08, negative control hook log consistency for N04) during follow-up qualification polish.
## Unresolved questions
- Availability and exact version of the native incident host must be supplied through operator evidence during execution.
