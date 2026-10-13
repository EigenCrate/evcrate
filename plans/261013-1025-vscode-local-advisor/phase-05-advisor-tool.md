# Phase 05 — Native advisor tool and request lifecycle

## Context links
- [Plan](plan.md); dependencies [Phase 03](phase-03-model-configuration.md) and [Phase 04](phase-04-context-and-privacy.md).
- [Design sections 3–6](design-contracts.md); [official extension tools](https://code.visualstudio.com/api/extension-guides/ai/tools).

## Overview
- Date 2026-10-13. Priority P1. Implementation pending. Review pending.
- Deliver the real one-shot advisor round trip inside existing Local chat. No replacement participant or dispatch URI.

## Key Insights
- Registration metadata teaches invocation schema; SessionStart guidance later explains when to use it.
- Advisor instructions use supported User messages, not System role or executor prompt patching.
- No trusted executor model identity; second-opinion usefulness is distinct from provable model independence.

## Requirements
- Native registered `evc-advisor_ask`, reference `evcAdvisor`, selected Copilot model, same-chat result.
- Honest consent/failure/cancellation and no hidden fallback/retry/tool recursion.
- Workspace enablement guards all requests; UI approval does not waive disclosure ceilings.
- Explicit output caps and incomplete/failed status semantics.

## Architecture
- `advisor-tool.ts`: schema-aware `prepareInvocation`/`invoke`, state gate, active-request ownership.
- `advisor-request.ts`: compose final public message objects, count tokens, perform one request.
- `advisor-response.ts`: consume bounded stream, safe metadata/result/error rendering.
- Thin `extension.ts` registers and disposes everything; no global mutable cross-session transcript.

## Related code files
Create under `/home/loidinh/WS/evcrate/extensions/vscode-advisor/src/`:
- `advisor-tool.ts`, `advisor-request.ts`, `advisor-response.ts`.
Modify `extension.ts`, `prompts.ts`, `commands.ts`, `status.ts` and package manifest in same extension.
Create `/home/loidinh/WS/evcrate/tests/vscode-advisor/advisor-lifecycle.test.mjs`, `advisor-response.test.mjs`.
No changes to core EVCrate tools, OMP routing, existing model bindings or generated harness.

## Implementation Steps
1. Declare `contributes.languageModelTools` with exact name/reference, description, strict input schema and `canBeReferencedInPrompt`. Describe required objective/evidence, advisory-only role, egress boundaries and absent automatic history. No promise that `{}` works or model always differs.
2. Register tool through `vscode.lm.registerTool`. Own registration disposal and active-request state within this extension instance. Tool configuration selection by user remains separate from registration.
3. `prepareInvocation` resolves supported/trusted workspace and displays model plus effective disclosure categories. No repository collection/model request in preparation UI. Tool confirmation may be bypassed by host Always Allow but runtime ceilings still apply.
4. `invoke` checks configured model, enabled workspace, trusted supported root, nonempty chat token, valid input and BUSY state before collection. Require an explicitly enabled scratch workspace during this phase; Phase 06 replaces any temporary test setup with production enable command.
5. Create linked cancellation and 120-second deadline. Acquire one active slot; reject concurrent invocation without queue. All exits release/dispose exactly once, including errors before request, token-count rejection and stream failures.
6. Resolve current selected model exactly; prepare context through Phase 04; construct role instructions and untrusted evidence with public User messages only. No `tools`, recursive tool handling or `System` role supplied.
7. Recheck enablement/trust/model/policy immediately before send. Call selected model's `sendRequest` once; policy/trust changes during request cancel it. Do not catch errors to retry with another model, larger context, or provider.
8. Accumulate bounded text stream preserving valid Unicode. Empty response => `EMPTY_RESPONSE`; excessive output => cancel and return `incomplete` with clear cap notice; provider/cancel/deadline failure => error, never `ok` or generated substitute critique.
9. Return public `LanguageModelToolResult` with text metadata header and advisor Markdown. Metadata lists selected model, independence unknown, disclosure/omission status and relevant caution. Only `ok` denotes a completed review; no deterministic PASS inferred from content wording.
10. Sanitize provider errors into bounded codes/messages. Keep only in-memory counts/timing/state; no payload or advice logging, outcome ledger, billing estimate or fabricated zero cost.
11. Exercise state transitions with deferred streams: cancellation before prepare/during Git/before send/during stream; policy revocation; concurrent call; late chunk after cancellation; malformed/empty provider response; missing model. Assert send counts and observable results, not forwarding implementation details.
12. Run actual Local scenario with deliberately flawed small candidate and explicit `#evcAdvisor`; observe chosen model response and main executor continuing. Verify advisor has no editing tools; do not require exact critique wording or treat model correctness as deterministic.

## Todo list
- [ ] Native contribution schema and registration.
- [ ] Disclosure confirmation and all runtime guards.
- [ ] One-shot model request with no tools/fallback.
- [ ] Active/cancel/deadline/revocation state machine.
- [ ] Bounded complete/incomplete/error response rendering.
- [ ] Behavior regressions and real Local interaction recorded.

## Success Criteria
- Real selected Copilot model returns critique inside original Local conversation.
- Invalid/disabled/untrusted/cancelled-pre-send states send zero requests; accepted invocation sends at most one at application level.
- No editing, nested consultation or alternative provider call is available to advisor.
- Stream failure never becomes successful review; cleanup allows subsequent explicit request.

## Risk Assessment
- Caller can omit evidence or misreport tests; preserve unverified-claim labels and omissions.
- Host can hide/disable tool; status/startup guidance must not claim registration equals availability.
- Provider stream internals can differ; use only supported parts and Phase 01 observed behavior.

## Security Considerations
- Do not interpret advice as executable command, file write, policy update or permission grant.
- Tool result untrusted output may contain markdown; render through host text API without executable extension HTML.
- Cancellation cannot retract data already sent; docs must say so.

## Next steps
Phase 06 integrates real workspace enablement and fresh-session guidance. Remove any temporary phase-specific enablement fixture; do not ship test-only commands or bypasses.

## Unresolved questions
None after native gate. If host does not support nested LM request reliably, stop and revise architecture instead of adding a hidden proxy.
