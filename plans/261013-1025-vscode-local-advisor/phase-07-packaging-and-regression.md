# Phase 07 — VSIX packaging and integrated regression gate

## Context links
- [Plan](plan.md); dependency [Phase 06](phase-06-startup-guidance.md); [design](design-contracts.md).
- Existing `/home/loidinh/WS/evcrate/package.json`, `/home/loidinh/WS/evcrate/scripts/build-typescript.mjs`, `/home/loidinh/WS/evcrate/scripts/build-vscode-companion.mjs` (reference, not reuse target).

## Overview
- Date 2026-10-13. Priority P1. Implementation pending. Review pending.
- Package actual completed extension and enforce deterministic policy/lifecycle regressions before final native qualification.

## Key Insights
- Existing custom companion ZIP builder is hardcoded to its product/proposed API and projection overlay; do not clone/generalize it for this feature.
- Standard pinned VSIX tooling is sufficient; byte-for-byte reproducibility is not claimed unless implemented and verified.
- Core release contract stays seven assets. This is separately built/manual-installed private VSIX, not an eighth release artifact.

## Requirements
- Pinned local `@vscode/vsce`; no runtime dependency on package checkout, Pi, OMP or companion.
- Explicit package allowlist, accurate README/privacy/license, VSIX SHA-256 and build/source metadata.
- Full focused suite followed by affected repository checks; real install smoke from built package.
- No fake lint evidence: root `npm run lint` is echo-only and is not a quality gate.

## Architecture
- Root scripts delegate build/package/test to isolated advisor package.
- Packaging input runtime under `extensions/vscode-advisor/dist`; output `.cache/evcrate/vscode-advisor-package/evcrate-advisor-<version>.vsix`.
- Test policy/IO/ownership/cancellation behavior with real disposable filesystem/Git fixtures and controlled model streams. Native model requests only in operator qualification, never routine CI.

## Related code files
Modify `/home/loidinh/WS/evcrate/extensions/vscode-advisor/package.json`, package lockfile, `.vscodeignore`; add extension packaging scripts only if standard CLI + existing build driver is insufficient.
Modify `/home/loidinh/WS/evcrate/package.json`: finalize `build:vscode-advisor`, `test:vscode-advisor`, `package:vscode-advisor`, add focused advisor test gate to `npm test` without invoking external model access.
Create `/home/loidinh/WS/evcrate/tests/vscode-advisor/packaging.test.mjs` only for consumer-visible runtime closure/install hazards, not copy/text assertions.
Create operator docs `/home/loidinh/WS/evcrate/docs/vscode-advisor.md` and package `extensions/vscode-advisor/README.md` during implementation.
No edits to release orchestration, target manifests, canonical registry, existing companion build/VSIX or automatic installer flags.

## Implementation Steps
1. Pin packaging dependency in independent lockfile. Establish reproducible installation command (`npm ci --prefix extensions/vscode-advisor`) and build path. Document root dependency prerequisite for the existing compiler driver.
2. Package only compiled runtime, standalone hook asset, manifest, README/license/notices. Verify no maps with sensitive paths if unnecessary, source test fixtures, credentials, local snapshots, user receipts, caches or previously generated VSIX.
3. Run pinned local packaging executable with `--no-dependencies` only when package is proven runtime dependency-free. If dependencies exist, include/bundle their real runtime closure deliberately; do not hide missing imports with the flag.
4. Confirm minimum engine matches Phase 01 and real `@types/vscode`; `enabledApiProposals` absent; activation entries/contribution IDs match runtime registrations. Do not put compilation stubs in package to make installation pass.
5. Emit VSIX SHA-256 and a small build receipt with extension/version, source revision or dirty-state disclosure, host-independent build inputs identity and tool versions. Evidence binds exact bytes; do not claim clean git commit if working tree differs.
6. Run focused tests once after all phase code merges: contract rejection, scope/trust, config precedence, Git policies, safe reads, redaction/budgets, cancellation/races, startup ownership and command encoding. Remove tests pinned to prompt wording or internal wiring.
7. Run affected root build/test suites and distribution check if relevant sources changed; final repository `npm test`, `npm run release:check`, `npm run distribute:check` verify no regressions to existing contracts. Record pre-existing failures distinctly; never fabricate PASS or silently narrow failed scope.
8. Install the actual packaged VSIX in disposable user-data/extensions directories. Open a real VS Code window and exercise configure/status/enable/disable/remove, not only CLI extension listing. Verify compiled hook asset resolves when source checkout is absent.
9. Run upgrade from one package candidate to a changed same-product candidate with owned assets, then verify user-edited hook conflict is preserved; do not force reinstall over unverified ownership.
10. Write operator guide covering exact prerequisites, install command, setup and consent, Local-vs-Copilot harness distinction, first new session, `#evcAdvisor`, defaults/privacy deviations, output limits, missing model/quota, disabled hook, update/repair, unowned collision and remove-before-uninstall.
11. Review license adaptation from Pi; include copyright/license where code/prompt text reused. Keep explanation accurate: redaction ON is deviation, no transcript/image/prior-permit parity, independence unknown, no hard gate.
12. Code/security review against design and validation matrix; close actionable findings before Phase 08. Package again only if review changed runtime bytes and use the new digest for all final evidence.

## Todo list
- [ ] Pinned private VSIX build and package allowlist.
- [ ] Runtime closure and package digest receipt.
- [ ] Integrated deterministic privacy/lifecycle suite.
- [ ] Affected repository regression gates.
- [ ] Actual packaged extension install/commands smoke.
- [ ] Operator/privacy/license documentation and review.

## Success Criteria
- VSIX works without source checkout or proposed flags and carries actual runtime/hook assets.
- Focused tests cover plausible user-visible boundary failures; no live-provider CI dependency.
- Existing release/distribution/companion contracts remain unchanged.
- Packaging/security review closed; final candidate digest frozen for Phase 08.

## Risk Assessment
- Stale generated JS can package old behavior: clean compiler-owned outputs and verify closure before packaging.
- Machine-local VSIX path inside package glob can recursively bloat archive: output outside inputs and explicit exclusions.
- Changing final bytes invalidates native qualification receipts; track digest carefully.

## Security Considerations
- Never publish to Marketplace or GitHub automatically in this phase.
- No keys/tokens/raw prompts/advice/receipts in package.
- Setup only mutates consented workspace-owned paths; install itself writes no project hooks.

## Next steps
Phase 08 real authenticated Linux+Windows acceptance against final VSIX. Passing automated tests is not sufficient to deliver the product.

## Unresolved questions
None. Public release/integrated EVCrate distribution explicitly outside this plan.
