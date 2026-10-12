# Phase 08 — Consented postpublish installation

## Context links
- [Plan](./plan.md); [design contracts](./design-contracts.md); [package phase](./phase-07-vsix-and-build-integration.md).
- Dependencies: Phase 02 CLI contract and Phase 07 verified VSIX packaging.

## Overview
- Date: 2026-10-12; priority P1; implementation DONE (100%; completed 2026-10-12); Review Cycle 2 evaluated (Score: 7/10, 0 Critical Issues; user approved); 41/41 primary tests pass; live native install smoke and live race/cancellation proof deferred to Phase 09 per user gate amendment.
- Offer installing exact companion bytes only after successful VS Code publication, without claiming rollback or activation.

## Key Insights
- Existing settings registration is a separate consented CLI post-action; reuse this boundary, not core publication.
- Extension installation, enablement, trust, proposal permission and current-window activation differ.
- `--list-extensions` proves presence/version, not necessarily disabled/profile activation state.

## Requirements
- Default-No TTY offer; explicit install/no-install flags and exact local editor/profile target; reject unsupported remote contexts (SSH/dev-container/WSL) without routing into local editor installation.
- CI/JSON/non-TTY never imply consent; an explicitly requested post-commit companion install that fails or requires manual setup returns exit code `5` with committed publication preserved on stdout and companion status on stderr (no rollback or blind publication retry).
- Preserve disabled state, user registration/settings and bindings; no `--force`, editor restart or persistent proposal edits.

## Architecture
- `coordinateVscodeCompanionInstallation` runs adjacent to existing postpublish settings coordinator after validated committed resource outcome.
- Reuse processRunner with argument arrays, cancellation/deadline/output bounds; descriptor/hash checked immediately before process launch.
- Core ResourceResult stdout remains exact; bounded stderr notice carries companion status and explicit exit override.

## Related code files
- Create: `src/cli/vscode-companion-installation.ts`, narrowly needed `vscode-companion-prompt.ts`; verification helper reuse from Phase 07.
- Modify: `src/cli/{arguments.ts,types.ts,dispatch.ts,main.ts,output.ts}` only flags/post-action notice/exit seams; preserve `vscode-settings-registration.ts` semantics.
- Read: `src/cli/process-runner.ts`, `src/distribution/{vscode-settings.ts,build-resolution.ts,publication-plan.ts}`.
- Modify tests: `tests/cli/{arguments.test.mjs,dispatch.test.mjs,publication.test.mjs,vscode-settings-registration.test.mjs}`; create install-behavior suite under `tests/cli/`.
- Protocol schemas, publication engine/journal/recovery: intentionally unchanged.

## Implementation Steps
1. Add proposed flags with explicit legal operations/request-file rules. Reject positive/negative collision, non-vscode selection and irrelevant editor/profile options before mutation. Dry-run may parse consent configuration but never launch installer.
2. Gate coordinator on actual committed VS Code publication with verified artifact path; never run for failed apply, preview, build, check or recover. Order settings and install post-actions independently; do not roll back authorized settings if installation declined.
3. Resolve selected editor executable as bounded canonical executable and verify version/help capabilities; select exact local profile/host from explicit target or qualified safe local discovery. Reject unsupported remote contexts/authorities (SSH/dev-container/WSL) and ambiguous targets before launching any local installer rather than routing into a local editor or guessing a primary profile.
4. Verify committed VSIX descriptor/digest/build identity and compatibility; copy through checked regular-file handles into this install instance's private no-symlink stage, then hash/inspect staged bytes. Show identity/hash/staged path/target and separate proposal permission in default-No prompt. Concurrent republish cannot replace staged installer bytes.
5. Existing installation is a no-op only with exact version AND qualified installed build identity. Matching version alone reports identity-unverified/manual setup; same-version/different-byte dev rebuild must never pass exact-candidate proof. Preserve disabled/unknown state; explicit upgrade consent cannot silently enable or force. Use native-proven identity/profile inspection or remain blocked.
6. Run processRunner against private staged path with qualified local profile arguments, deadline/stream bounds and cancellation. Hold stage until installer process confirmed exited; cleanup only this instance-owned stage. No shell concatenation/direct mutable published-path consumption.
7. Emit `install-notice-v1` stderr status and publication-committed fact. When companion installation was explicitly requested and fails or requires manual setup after committed publication (including identity-unverified or unsupported remote context), return exit code `5` while keeping the committed `ResourceResult` on stdout and emitting `install-notice-v1` on stderr; never roll back committed resources, replace stdout with an error envelope or encourage blind publication retry (remediation retries only the separately authorized companion install/setup, while pre-mutation CLI validation errors keep standard pre-commit failure handling). Implicit/interactive declined or skipped offers leave publication exit `0` with truthful guidance.
8. Print separate launch guidance for `--enable-proposed-api=eigencrate.evcrate-model-bindings`; never rewrite `argv.json`/trust/settings enablement or restart current editor. Do not claim installed extension activated.
9. Add outcomes for refusal/CI/JSON/opt-in/committed-only, tamper, same version different identity, version-only unverified, unsupported remote context rejection (never launching local installer), publication-path replacement during install, stage ownership/cancel, profile mismatch/disabled, timeout/process failure and committed stdout plus stderr `install-notice-v1` with exit `5` on requested failure/manual setup. Inject process boundary for deterministic outcomes; native proof separate.
10. Exercise actual isolated local publication/install and failed install; verify installed identity, disabled/profile state, proposal-disabled launch and exit `5` on requested post-commit failure/manual-setup-required. Race republish with install and prove exact staged bytes consumed. Manual profile/setup guidance is not automatic-install acceptance for required local tuples; unresolved required local tuple stays blocked.

## Todo list
- [x] Flags/eligibility and target selection implemented (flags, pre-mutation validation, remote-context refusal, relative-PATH and absolute executable resolution; fail-closed on invalid targets).
- [x] Independent consent prompt/state preservation implemented (default-No prompt with staged path/profile/proposal flag, installed build identity check via receipt/descriptor, dev rebuild mismatch reporting manual-setup-required exit 5).
- [x] Verified bounded process launch implemented (argv arrays, deadline/stream bounds, private stage, safe fd regular-file copy, post-install presence/version re-probe verification, uncaught exception guard).
- [x] Separate machine/TTY status and exit behavior implemented (stdout preserved, `install-notice-v1` stderr, exit 5 on requested failure/manual-setup).
- [ ] Actual publication/install/failure smoke passed (live native editor qualification and live race/cancellation proof deferred to Phase 09 per user gate amendment).
- [x] Docs/changelog/README for new flags.

## Success Criteria
- Refusal/noninteractive defaults cause no extension install, setting enablement or proposal mutation.
- Exact selected profile receives verified bytes only after commit; disabled/unknown state never silently changed.
- Explicitly requested post-commit install failure or manual-setup-required state returns exit `5` with committed publication preserved on stdout, companion status on stderr, no rollback, no blind publication retry and no false activation claim.

## Risk Assessment
- Native install can affect profile/enablement state implicitly. If Phase 01 cannot establish preservation, manual user-operated path is mandatory and automatic installer gate stays blocked.
- CLI invoked from an unsupported remote context (SSH/dev-container/WSL) could target a local editor if unchecked; enforce explicit authority/environment guards that refuse local installation fallback and return exit `5` when post-commit install was explicitly requested.

## Security Considerations
- Paths/profile are argv data, never shell syntax; no arbitrary editor executable from untrusted source metadata.
- Consent is main-user-owned; prompts/content cannot authorize installation, trust or API bypass.

## Next steps
- Phase 09 exercises final CLI and VSIX candidate across full acceptance matrix.

## Unresolved questions
- Exact disabled/profile inspection requires native evidence. Unknown state cannot be treated as absent/enabled.
