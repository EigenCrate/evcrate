# Phase 01 — Native feasibility and support freeze

## Context links
- [Parent plan](plan.md); [design contracts](design-contracts.md); [native matrix](validation-matrix.md).
- [Official tool API](https://code.visualstudio.com/api/extension-guides/ai/tools), [LM API](https://code.visualstudio.com/api/extension-guides/ai/language-model), [Local hooks](https://code.visualstudio.com/docs/agents/reference/hooks-reference).
- Existing `/home/loidinh/WS/evcrate/docs/system-architecture.md`: companion evidence is not advisor qualification.

## Overview
- Date: 2026-10-13. Priority: P1 gate. Implementation: pending. Review: pending.
- Prove the two essential native mechanisms before committing to a production design: first-turn guidance and tool→second-model→same-chat return.
- This phase runs **during later implementation**, not now. No phase can substitute mocked success for missing native prerequisites.

## Key Insights
- Public APIs support extension tools and model calls; account entitlement and host timing remain runtime questions.
- Local hooks use `SessionStart` and `hookSpecificOutput.hookEventName`, not CLI lowercase event schemas.
- Current Linux CLI reports VS Code 1.140.0; default extension listing is empty. Other profiles not inspected. No authenticated Copilot claim.
- Windows has a separate shell/process/filesystem qualification requirement; Linux success is insufficient.

## Requirements
- Authorized Copilot account; exact target model selected by user; explicit permission for billable smoke calls.
- Linux x64 and Windows x64 desktop environments, trusted scratch workspaces, external Node >=22.19.0 and Git.
- Disposable VS Code user-data/extensions/profile directories; never mutate operator HOME settings or real project hooks for this spike.
- Record VS Code version+commit, Copilot extension version, OS, Node/Git/shell versions, requested/returned model identity, and source/package hash.

## Architecture
- Temporary minimal extension: registers the planned tool name, accepts explicit context, calls selected model without tools, returns text.
- Temporary Local startup hook: emits a unique benign first-session guidance marker plus correct tool reference.
- No EVCrate model-binding companion, proposed flags, transcript reader, gateway or extra provider key.
- These are disposable feasibility artifacts, not shipped placeholders. Record findings and remove scratch scaffolding after evidence is captured.

## Related code files
- Read existing: `/home/loidinh/WS/evcrate/extensions/vscode-model-bindings/package.json`, `/home/loidinh/WS/evcrate/src/adapters/vscode/hooks.ts`, `/home/loidinh/WS/evcrate/src/adapters/vscode/hook-protocol.ts`.
- Create later: plan-local `reports/native-feasibility.md` and `reports/support-matrix.md`.
- Temporary only: scratch extension, scratch `.github/hooks/evc-advisor.json`, runner and sanitized evidence outside production source.
- Modify on evidence: this phase, design contracts, support requirements. Do not silently change user scope.

## Implementation Steps
1. Inventory both native environments. Check current official API/type package and tool schema against the selected engine baseline; pin compatible versions. Do not fabricate ambient API declarations when a stable capability is absent.
2. Obtain authorized Copilot access in the disposable profile. Select **Local / Agent**, enable hooks and tool only through user-approved configuration. Record restrictions; a policy denial is a blocked gate, not a defect to bypass.
3. Load the minimal extension without proposed flags. Enumerate `vendor: copilot` models through a user-triggered command, choose exact model, and observe actual authorization flow. Determine whether enumeration or first send prompts consent.
4. From real Local chat, explicitly reference `#evcAdvisor` and submit a bounded review request. Verify handler runs, nested LM request succeeds, correct selected model object is used, result appears in same conversation, and executor continues independently.
5. Compare a lower-cost executor with the intended advisor if available. Record allowed/rejected combinations and any quota notice. No promise of native cost-tier bypass or access to every picker model.
6. Test `countTokens` on the actual message type and full request; verify `maxInputTokens` is usable. Record host tool-result tokenization constraints. No approximate-token fallback if guaranteed bounds cannot be established.
7. Install a disposable `SessionStart` hook using the documented envelope. Start a **new** Local chat, submit first prompt, inspect the host's supported debug/context surface to establish guidance arrived before first model response. Model repeating a marker alone is supporting evidence, not proof of exact system-role placement.
8. Repeat after window reload and in an existing chat. Document fresh-session-only guarantee. Verify enabled/disabled `chat.useHooks`, excluded hook location and tool-disabled behavior are accurately diagnosed.
9. Qualify Linux single-quote and Windows encoded PowerShell command paths: spaces, Unicode, apostrophes, dollar signs, ampersands, parentheses; malicious path text must not execute additional commands. Use harmless sentinels in scratch dirs.
10. Exercise cancellation during stream, selected-model unavailable/denied behavior, and extension disabled with hook still present. Confirm no automatic retry or false successful advice.
11. Record evidence per platform and scenario with timestamps and redacted logs/screenshots. Scrub secrets and conversation content not needed for the receipt. Do not infer Windows results from Linux.
12. Go/no-go review: approve exact supported tuple and startup command contract only after all essential native paths pass. If blocked by account/Windows/host API access, mark blocked and stop phases 02–08; document exact prerequisite and required rerun.
13. Remove temporary sources and scratch hook registrations; retain only sanitized receipts and deliberate reusable qualification tooling.

## Todo list
- [ ] Inventory supported host/API/type versions on both platforms.
- [ ] Establish user-authorized model access and exact selection.
- [ ] Prove real Local tool→advisor→same-chat return.
- [ ] Prove full-message token counting and output limits.
- [ ] Prove guidance reaches first fresh-session response.
- [ ] Qualify Linux and Windows command encoding/lifecycle.
- [ ] Record go/no-go and clean disposable artifacts.

## Success Criteria
- G01–G06 in validation matrix have PASS receipts on both platforms, tied to exact candidates.
- No internal API dependency, model proxy, hidden credential reuse or fabricated transcript access.
- Supported engine/types and external runtime requirements settled in contracts.
- Independent review accepts evidence; remaining uncertainty is listed, not hidden in a generic PASS.

## Risk Assessment
- Preview hook behavior can change: pin baseline and requalify upgrades.
- Subscription restrictions may make desired model pair unavailable: stop and ask for an authorized alternative; never silently change models.
- Missing Windows access blocks completion of this phase; it does not authorize Linux-only scope.

## Security Considerations
- Disposable isolated workspace; no secrets or private code in connectivity checks.
- No token scraping, security-setting bypass, proposed-API enabling or cloud deployment.
- Context debug evidence can contain sensitive content; record only sanitized proof.

## Next steps
If go: Phase 02. If no-go: update explicit blocker and revised design proposal; do not begin downstream implementation.

## Unresolved questions
Technical only: actual authorization flow, selected model availability, exact stable type baseline, output/token constraints and two-platform hook timing. This phase owns their resolution.
