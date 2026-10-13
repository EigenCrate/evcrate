# VS Code Local advisor — design contracts

Status: proposed, not implemented. User-approved product boundaries; host-specific feasibility gated by Phase 01. Parent design authority: this file overrides research recommendations when they differ. All implementation paths below are proposed unless identified as existing.

## 1. Scope, names and invariants

- Extension root: `extensions/vscode-advisor/`; extension ID `eigencrate.evcrate-advisor`; independent private VSIX, version `0.1.0` initially. No public publish in this plan.
- Supported acceptance: **Linux x64 and Windows x64**, trusted local **single-folder** workspaces. macOS, remote/WSL/container, web/virtual, empty windows and multi-root are unsupported and refused before collection/inference/setup.
- Execution surface: built-in **Local / Agent**, not Agent Host Copilot/CLI, Ask mode, or a replacement participant. Public tool APIs may expose the tool to other callers: require a chat invocation token, but do not claim the opaque token attests a specific harness. Only Local is qualified.
- Public stable VS Code extension APIs; documented Local hooks remain Preview. Candidate engine/type baseline `1.140.0`, pinned and validated in Phase 01; no invented/proposed ambient declarations.
- Registered tool name `evc-advisor_ask`; prompt reference `evcAdvisor`; display name `Ask Advisor`. Treat these as native tool identifiers, not canonical EVCrate agent/command resource names.
- No OMP dependency, `xd://` shim, HTTP/MCP gateway, model credentials, telemetry, automatic retry/fallback, executor replacement, editing tool, or forced review gate.
- Existing EVCrate companion, generated plugin, seven adapters, publication/recovery, and exact-seven release assets remain unchanged.
- Existing lifecycle/prompt concepts may be adapted from Pi with MIT notices. Do not import Pi/OMP runtime packages or the other extension's source.

## 2. Final artifacts and user journey

Artifacts: installable `evcrate-advisor-0.1.0.vsix`, its SHA-256 and qualification receipts, operator/privacy docs, focused automated tests and authenticated two-platform Local evidence. Source remains in `extensions/`; VSIX output in `.cache/evcrate/vscode-advisor-package/`, outside package inputs.

Journey:
1. User installs private VSIX. Activation registers tool/commands only; no model request, prompt-file write, or Git scan.
2. `evcrate.advisor.configure` shows disclosure policy, selects exact available Copilot model, obtains VS Code authorization, and records settings. Cancellation before confirmation preserves prior values.
3. `evcrate.advisor.enableWorkspace` validates support/trust and external Node, previews exact workspace changes and gets consent; installs startup guidance and marks this workspace enabled.
4. User starts a **new Local Agent session**, enables/selects the advisor tool if needed. First prompt triggers startup guidance before the model response.
5. Executor invokes tool with explicit context and optional draft/question/evidence requests; confirmation explains model and effective disclosure. One selected-model review returns in the same chat.
6. `evcrate.advisor.disableWorkspace` immediately refuses future tool requests and updates startup snapshot to disabled without deleting user files. Existing in-flight work is cancelled.
7. `evcrate.advisor.removeWorkspaceGuidance` removes unchanged owned startup assets only, leaving preferences/user files. User then uninstalls if desired.

Additional commands: `evcrate.advisor.selectModel`, `evcrate.advisor.showStatus`, `evcrate.advisor.repairWorkspaceGuidance`. Native QuickPick/settings/output channel only; no webview, custom sidebar, manual parallel chat, or raw payload history.

## 3. Model access and invocation contract

- Enumerate `vscode.lm.selectChatModels({vendor:'copilot'})` from a user gesture; no hardcoded model family, sorting by imagined capability, cheapest/newest inference, or tool-calling-capability filter. A tool-free reviewer does not need tool calling.
- Persist exact vendor+model ID, display name for UI only, in application-scoped user settings. Resolve exact ID on each consultation; unavailable ID => `MODEL_UNAVAILABLE`, never another model.
- Initial setup action must establish access as supported by host; if consent requires first request, use a user-approved explicit connectivity check with a disclosed tiny prompt, not a hidden inference. Phase 01 must settle actual authorization behavior.
- `prepareInvocation` discloses responding model and effective Git/file/rule settings, with residual secrecy warning. The host's Always Allow does not widen stored egress policy.
- `invoke` revalidates trust, enablement, exact model, immutable input and policy snapshot. `toolInvocationToken` is passed only to host tool APIs if needed, never treated as history or model authorization.
- Model messages use public `LanguageModelChatMessage.User` instruction plus distinct labelled untrusted material. Do not use `System` or proposed `languageModelSystem`.
- Supply **no tools** in `sendRequest`. Advisor cannot act on files or recursively consult.
- At most one application-level `sendRequest` per invocation. Provider-internal behavior is outside this guarantee.
- One in-flight consultation per extension host; concurrent attempt => `BUSY` before collection. No queue or shared response state.
- Linked cancellation covers preparation, child Git processes, token counting and stream; 120-second application deadline from invocation start. Always dispose timers/token sources and release active slot.
- If trust, enablement, selected model or disclosure policy changes before dispatch: zero sends and `POLICY_CHANGED`; during inference cancel remaining work. Already-sent data cannot be recalled.
- Actual executor model is unknown: report `independence: unknown`. No fake same-model enforcement or automatic complementary-model selection.

## 4. Tool input and response

Strict JSON object, unknown keys rejected:

```ts
interface AdvisorInput {
  context: string; // required, nonblank explicit objective/constraints/evidence
  question?: string;
  draft?: string; // executor claims, not verification proof
  gitContext?: 'none' | 'summary' | 'full';
  includeTrackedFiles?: string[];
  includeUntracked?: string[];
}
```

- Context describes objective, decision/current work, constraints, performed checks and remaining uncertainty. `{}` is invalid; no parent transcript is reconstructed.
- No absolute root argument. Admitted workspace is authoritative. Exact relative attachment paths, at most 16 unique paths combined, each <=1,024 UTF-8 bytes; reject globs, traversal, ambiguous separator forms, `.git`, symlinks, directories, submodules, ignored untracked files and unsupported binary/image content.
- Tool input schema uses explicit descriptions and limits; runtime validates too. No `followUpTo`, images, force/screening fields, tool-policy claims or cached previous payload.
- Success: one `LanguageModelToolResult` with a `LanguageModelTextPart` containing a compact metadata header and advisor Markdown. Do not depend on an undocumented structured-result API.
- Header: status (`ok` or `incomplete`), selected model ID/name, independence unknown, requested/effective Git level and collection status, source counts, omission/truncation notices. Source labels are sanitized, bounded, redacted; no raw withheld content.
- Output max 32 KiB UTF-8 of advisor content; stop stream consumption/cancel at cap, mark `incomplete`. Empty or failed stream is an error, not a successful review. Keep metadata within a separate 4 KiB bound.
- Errors use stable short code + safe human message; no raw provider payload, question, prompt, token, absolute sensitive filename or stack in chat/logs. Partial output after failure is not returned as `ok`.
- Error codes: `NOT_CONFIGURED`, `WORKSPACE_DISABLED`, `UNTRUSTED_WORKSPACE`, `UNSUPPORTED_HOST`, `INVALID_INPUT`, `EMPTY_CONTEXT`, `INVALID_POLICY`, `UNSAFE_PATH`, `UNSUPPORTED_CONTENT`, `DISCLOSURE_DENIED`, `CONTEXT_TOO_LARGE`, `REDACTION_FAILED`, `POLICY_CHANGED`, `MODEL_UNAVAILABLE`, `CONSENT_DENIED`, `BUSY`, `CANCELLED`, `TIMEOUT`, `PROVIDER_ERROR`, `EMPTY_RESPONSE`.

## 5. Configuration and disclosure authority

Namespace `evcrate.advisor`. Field suffixes retain Pi names where they genuinely mean the same thing. All model and disclosure settings application/user-only; resolve inspected global values/defaults, not merged workspace values. Workspace data cannot disable redaction, enable attachments, raise limits or select a model. Report ignored workspace overrides in status.

| Setting | Default | Semantics |
|---|---|---|
| `modelId` | unset | Exact Copilot model; setup required |
| `contextMaxChars` | 15000 | Shared explicit-context/Git UTF-16-unit budget; 0..60000 |
| `advisorGitContext` | `summary` | User ceiling: `off`, `summary`, `full` |
| `advisorGitContextMaxChars` | 20000 | 0..60000; effective Git cap also half shared budget |
| `advisorRedactSecrets` | `true` | Approved change from Pi false; common-pattern reduction, not guarantee |
| `advisorAgentsMdContext` | `true` | Read root `AGENTS.md` and optional chosen global rule source |
| `globalRulesFile` | unset | Exact user-chosen local regular text file; no silent `~/.pi` reads |
| `advisorTrackedFileContent` | `false` | Permission class for exact tracked attachments |
| `advisorUntrackedContent` | `false` | Separate permission class for exact untracked attachments |
| `advisorPlanGate` | `true` | Advisory startup wording only, never execution enforcement |
| `advisorFailureGate` | `true` | Advise after two equivalent failures; no loop detector |
| `advisorCompletionGate` | `true` | Recommend review of substantial completion; never blocks Stop |

Workspace enablement and startup ownership receipt are unsynced extension workspace state. No privacy configuration in workspace snapshot is authoritative. Optional `.vscode/advisor-preferences.md` is read-only input, <=8 KiB, never created automatically. Project/global rules <=8 KiB each, <=16 KiB combined; preferences are untrusted lower-priority guidance. No history/tool policy, same-model guard, outcome ledger or unsupported no-op setting is exposed.

`contextMaxChars=0` omits the context region and Git, not question/draft/attachments/rules. Input context remains required to prevent empty automatic-review calls. Send only if meaningful question, draft or approved task evidence remains; rules/preferences alone are insufficient. Explicitly report withheld context. User cap zero never means unlimited.

## 6. Context pipeline and bounds

1. Validate complete raw input and policy before repository reads. Required strings <=256 Ki UTF-16 units and <=1 MiB UTF-8 each; aggregate raw input/collected source bytes <=4 MiB. Reject oversized explicit input before redaction; withhold oversized optional files entirely.
2. Resolve a single trusted local canonical workspace. A repository may be absent: explicit-context-only consultation remains useful. If Git top-level differs from workspace root, withhold Git/rules outside root and report `repository-scope-mismatch`; never collect parent/sibling repo data. File attachments require exact admitted repository membership.
3. Read complete bounded regular UTF-8 sources, not raw arbitrary prefixes. Reject symlink/reparse traversal, unsafe ancestors and file-kind mismatches; compare opened file identity and metadata before/after. On detected races, withhold/refuse. Trusted workspace is the threat boundary; do not claim portable immunity to hostile concurrent filesystem replacement.
4. Redact all accepted outbound text before caps, including question, draft, source labels, filenames, preferences and rules. Escape untrusted delimiters after redaction. If redaction fails, fail before dispatch. Test secrets crossing truncation boundaries. Never log raw text.
5. Git requested level defaults to user ceiling; `none→off`. Effective level is the narrower setting/request. `off` does no Git collection unless necessary for explicitly permitted attachments; membership checks never imply Git disclosure.
6. `summary` contains changed paths/status/line counts, no patch/hunk headers. `full` additionally includes tracked patch against HEAD covering staged and unstaged work; untracked bodies still require explicit attachment consent. Use explicit empty-tree comparison for unborn repos. Collection failure never means clean tree.
7. Git processes use argument arrays, no shell, sanitized `GIT_*` overrides, no network/fetch/submodule helper, no external diff/textconv/fsmonitor/pager, literal pathspecs, NUL-delimited membership. Shared 5-second collection deadline and 4 MiB aggregate raw bound; kill children on cancel/overflow. Worktree mode and Windows executable resolution are native qualification cases.
8. Effective Git cap `min(advisorGitContextMaxChars, floor(contextMaxChars/2))`: default 7500. Remaining shared chars go to explicit context. Render whole labelled regions; respect budgets after escaping and never split Unicode pairs/encoded delimiters.
9. Other Pi-derived caps outside shared budget: draft 8 KiB, attachments 8 KiB each/24 KiB combined, rules 8 KiB each/16 KiB combined, preferences 8 KiB. Question cap 8 KiB is a new bound. Text attachments use per-call exact paths under user permissions, not Pi's prior-review consume-once permit; this deviation is user-approved.
10. Whole serialized request <=128 KiB UTF-8. Use public model token counting to validate complete messages against `maxInputTokens`; no chars/4 assurance. Apply declared omission priority: preferences, global rules, project rules, attachment tail items, Git, draft, explicit-context tail. Preserve instruction, focus, meaningful task evidence and omission notices; if minimum cannot fit, `CONTEXT_TOO_LARGE`. Re-render, do not cut serialized messages.
11. Recheck authority immediately before send. Record only bounded counts/status/timing/model metadata in memory and status output. No raw request/advice persistence, transcript reads or telemetry.

Explicit handoff is intentional disclosure: pasted file bodies/secret tool output cannot be reliably attributed to hidden source permissions. Explain this in the immutable tool description, startup guidance, setup and privacy docs. Collection flags control automatic collection, not magical filtering of arbitrary pasted material.

## 7. Startup guidance and ownership

Chosen delivery: dedicated native workspace hook `.github/hooks/evc-advisor.json`, not a second Agent Plugin and not modifications to canonical EVCrate hooks. Source template in the extension's `assets/`; this is runtime extension behavior, not a second harness instruction authority.

Owned workspace runtime files: `.vscode/evc-advisor/hook.cjs`, `snapshot.json`, and manifest above. Authoritative receipts in unsynced extension workspace state record canonical root, generation, schema and file hashes; workspace files/receipts never authorize deletion on their own. Snapshot contains only schema, canonical workspace identity, enabled flag and bounded advisory flags/text, no model credentials or privacy permissions.

Hook format:

```json
{"hooks":{"SessionStart":[{"type":"command","command":"<qualified platform command>","timeout":5}]}}
```

Runner success:

```json
{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"<bounded conditional advisor guidance>"}}
```

- Setup requires trusted supported root, available external Node, enabled Local hooks and explicit file-write consent. Diagnose `chat.useHooks`, `chat.hookFilesLocations` and enterprise policy; never change these automatically.
- Pin a user-approved external Node executable (minimum 22.19.0). Do not launch Electron `process.execPath` as Node. Resolve/validate executable without shell; reject shell launchers masquerading as the binary.
- Linux command uses POSIX single-quote escaping. Windows uses explicit PowerShell `-NoProfile -NonInteractive -EncodedCommand` whose UTF-16LE payload calls literal, apostrophe-escaped Node/runner paths; qualify installed shell and hooks execution on Windows. Reject NUL/newlines/control characters. No model text enters command construction.
- Runner reads <=64 KiB stdin with deadline; only Local `hook_event_name: SessionStart` is accepted. Match root against event cwd plus canonical path; never open transcript_path. Snapshot absent/corrupt/disabled/foreign event => `{}`, exit 0. Errors are bounded warnings, no blocking exit 2 or continuation control. Missing binary/runner is a host launch error, not a promised graceful skip.
- Guidance names actual registered tool and explicit context schema; recommend consequential plan/failure/completion reviews. Qualify: **if tool is available and enabled**. Missing tool => explain unavailable, continue normal work, never invent successful advice. Do not say empty `{}` is sufficient.
- Standalone hook cannot prove extension/tool liveness. Disabled/uninstalled extension may leave conditional guidance until explicit cleanup. Do not promise deactivation is an uninstall callback or parse extension directories to infer availability.
- Setup validates ALL destinations/ancestors and stored receipt; unmanaged collision => no overwrites. Stage payload/snapshot; install discovered manifest LAST. Receipt supports recovery of interrupted states; missing authoritative receipt => manual review, not adoption. Never overwrite edited files by matching a marker alone.
- Upgrade/repair validates hashes before replacement, disables/removes the owned manifest while replacing runner assets, then reinstalls last; interruptions cannot expose a half-updated active runner. Snapshot refresh and receipt revision are serialized per root. Across windows use a root-scoped exclusive lock; lock contention stops with actionable status, no automatic stale-lock deletion.
- Disable refuses tools immediately and atomically writes disabled snapshot after ownership check; changed snapshot is preserved and reported. Remove verifies all owned files first, unlinks unchanged manifest before other unchanged assets, preserves changed/unowned data, never recursively deletes parent dirs. Already-running hooks may finish; injected guidance is not retractable.
- Do not silently edit `.gitignore`. Setup warns about machine-specific paths and offers exact exclude guidance; users decide whether to exclude or commit. Copied workspace with foreign machine paths needs repair after validation, not silent execution trust.

## 8. Implementation module boundaries

| Owner | Proposed files / responsibility |
|---|---|
| Host/commands | `src/extension.ts`, `commands.ts`, `host-guard.ts`, `configuration.ts`, `status.ts` |
| Model/tool | `src/model-catalog.ts`, `model-access.ts`, `advisor-tool.ts`, `advisor-request.ts`, `advisor-response.ts` |
| Pure contracts | `src/contracts.ts`, `limits.ts`, `errors.ts`, `prompts.ts` |
| Evidence | `src/context-builder.ts`, `redaction.ts`, `safe-files.ts`, `git-context.ts`, `rules-context.ts`, `context-budget.ts` |
| Startup lifecycle | `src/startup-installation.ts`, `startup-ownership.ts`, `startup-command.ts`; `assets/session-start.cjs` |
| Package | `package.json`, lockfile, `tsconfig.json`, `.vscodeignore`, package README/license/notice |
| Tests | `tests/vscode-advisor/*.test.mjs`; native scripts in `scripts/` only if reused operator tooling warrants them |

Root prefix for rows 1–6 is `extensions/vscode-advisor/`. Keep files modular by responsibility, not one abstraction per field. Use normal Node test conventions; no runtime imports across extension/root boundaries.

## 9. Validation contract and support claim

Phase 01 must prove public tool-to-model path and startup injection on Linux before production implementation. User-approved Linux-first gate permits Windows feasibility during implementation; all Windows native checks remain mandatory by Phase 08. Final package qualification repeats both against final VSIX hashes. Automated tests protect policies/ownership/cancellation, not prompt wording or mocked forwarding. Real Local smoke verifies actual model/tool/guidance and operator surface. API docs, compile success, hook stdout alone, and prior companion receipts cannot substitute.

Unresolved product questions: none after scope/validation interviews. Technical gates: stable API/type availability, authorization at nested call, actual model availability/usage, Windows hook behavior, startup ordering, result limit and cross-profile ownership. Failure blocks the relevant gate: Linux feasibility before Phase 02, both-platform qualification before completion. Revise contracts explicitly rather than silently changing scope.
