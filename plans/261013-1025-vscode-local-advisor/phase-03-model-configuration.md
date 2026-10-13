# Phase 03 — Model configuration, consent and commands

## Context links
- [Plan](plan.md); dependency [Phase 02](phase-02-package-and-contracts.md); [design sections 2–5](design-contracts.md).
- [VS Code LM guide](https://code.visualstudio.com/api/extension-guides/ai/language-model).
- Existing companion model catalog is reference only; its tool-capability filter is wrong for a tool-free advisor.

## Overview
- Date 2026-10-13. Priority P1. Implementation pending. Review pending.
- Implement truthful setup/configuration and model resolution without an automatic model request on activation.

## Key Insights
- Copilot enumeration does not promise all chat-picker models, cost-free requests, or prior authorization.
- Tool inputs do not reveal trusted executor model identity. Select advisor explicitly; report independence unknown.
- Egress configuration must not be escalated by repository `.vscode/settings.json`.

## Requirements
- `configure`, `selectModel`, `showStatus` commands; native QuickPick and ordinary settings surfaces.
- Exact model identity persistence; user-only configuration/consent; cancel preserves prior state.
- Disclosure defaults from contracts; Pi redaction deviation and explicit-handoff limitations visible.
- Existing selected model never silently replaced after disappearance or catalog change.

## Architecture
- `model-catalog.ts`: retrieve/deduplicate exact identities, display labels, never capability guesses.
- `model-access.ts`: resolve selected exact Copilot model and translate access errors.
- `configuration.ts`: inspect application/global values, reject invalid policies and ignore/report workspace overrides.
- `commands.ts`, `status.ts`: user gesture flows and bounded metadata diagnostics; no webview/analytics.

## Related code files
Create/modify under `/home/loidinh/WS/evcrate/extensions/vscode-advisor/`:
- `src/model-catalog.ts`, `src/model-access.ts`, `src/configuration.ts`, `src/commands.ts`, `src/status.ts`, `src/extension.ts`, `package.json`.
Create `/home/loidinh/WS/evcrate/tests/vscode-advisor/configuration.test.mjs`, `model-selection.test.mjs`, `command-state.test.mjs`.
Read only `/home/loidinh/WS/evcrate/extensions/vscode-model-bindings/src/model-catalog.ts` for precedent; no runtime import or changes.

## Implementation Steps
1. Declare application-scoped settings and exact defaults from design. Retrieve explicit global value/default through configuration inspection; do not trust merged workspace effective value. Validate numeric range, enum and path-source types.
2. Keep enabled-workspace state and future ownership receipt in unsynced `workspaceState`; do not register sensitive state for Settings Sync. Model/disclosure settings are user-controlled; snapshot files never authorize egress.
3. Build model picker from `selectChatModels({vendor:'copilot'})` during explicit user action. Include display name and vendor/ID; disambiguate duplicates by exact ID. Do not filter out non-tool-calling models or infer model strength by name.
4. Stage setup selections in memory: chosen model, privacy summary, explicit global-rule source if requested. User confirms final summary before persistence. Cancelling picker or disclosure review changes no saved settings/enablement.
5. Follow Phase 01 authorization findings. Let VS Code own consent UI; if a connectivity request is required, require explicit confirmation and disclose its fixed non-sensitive prompt. Never use user's source code for background setup validation.
6. Persist exact model ID only after valid selection. Handle authorization refusal or unavailable list with actionable explanation, not automatic retries or a default model.
7. Subscribe to model catalog/configuration changes for status invalidation; do not send requests or auto-select replacement. Resolve fresh exact model before each consultation. Missing model sets status unavailable and guides `selectModel`.
8. Expose default privacy explanation: summary sends names/status/counts; full sends tracked patch independently of attachment flags; root rules on; global source unset; files off; redaction on but imperfect; explicit pasted content is deliberate disclosure.
9. Status command reports installed extension/version, current support guard, selected/available model, workspace enablement, ignored workspace overrides, startup guidance health and known absence of live evidence. No raw prompts/responses, authorization tokens or full sensitive source paths.
10. Wire configuration events to cancellation notification for Phase 05 and startup refresh for Phase 06 using direct event subscription, not a new generic event bus. Dispose listeners on deactivate; no workspace writes until enabled.
11. Test dangerous precedence transitions (workspace enables files/full/disables redaction), invalid global setting, picker cancellation, model removal, repeated command, denied auth, and switch while request active. Verify actual state and no outgoing dispatch where required, not mock echo equality.
12. In isolated host exercise configure/selectModel/status visually, including cancel and denied permission. Capture only bounded metadata; run focused tests after integration.

## Todo list
- [ ] User-only settings and privacy defaults implemented.
- [ ] Exact model enumeration/selection without capability filter.
- [ ] Consent and cancellation semantics verified.
- [ ] Model removal/configuration changes remain truthful.
- [ ] Status UI excludes private content and false inference claims.
- [ ] Behavior tests and actual command surface exercised.

## Success Criteria
- No account key entry/storage outside host Copilot authorization.
- No request at extension activation/catalog refresh.
- Workspace settings cannot widen disclosure or alter advisor model.
- User cancellation preserves prior configuration; selected unavailable model is not substituted.
- Native commands render useful setup/diagnostics in an actual VS Code window.

## Risk Assessment
- Consent dialog may differ across target host builds: Phase 01 native contract wins.
- Settings policy can override user intent: surface effective administrator restrictions; never bypass.
- New catalog fields are not stable guarantees; use documented metadata only.

## Security Considerations
- Global rule file is an explicit user-selected authority, never a model-supplied absolute path.
- No contents in diagnostics/telemetry; keep errors sanitized.
- Disabling workspace or changing policy cancels outstanding future egress where still preventable.

## Next steps
Integrate with completed Phase 04 in Phase 05. Startup enable/repair/remove commands are implemented in Phase 06, not empty success handlers here.

## Unresolved questions
None beyond Phase 01's real authorization behavior. Do not invent executor-model detection.
