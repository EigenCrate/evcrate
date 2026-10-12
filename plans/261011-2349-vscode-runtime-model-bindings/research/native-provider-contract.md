# Native provider contract research

Planning evidence only. No native editor proof. Both background research slices completed; parent checked key API declarations.

**Scope reconciliation:** The [Validation Summary](../plan.md#validation-summary) supersedes remote-placement and unconditional future-invocation gates below. Required companion qualification is local project/HOME, multi-root and profiles; remote research is historical, not a support claim. Cached selections may execute an unintended model until explicit reselection/reload; native race/recovery evidence and refreshed-selection, trust, restriction and hook correctness remain required. Each live session requires approval for the exact isolated profile/workspace, selected models and invocation scope. Native checks remain NOT RUN.

## Pinned sources

- [Proposed resource/provider API](https://github.com/microsoft/vscode/blob/07f806f999227108933c2e30515b26eecc1fda74/src/vscode-dts/vscode.proposed.chatPromptFiles.d.ts)
- [Stable catalog declarations](https://github.com/microsoft/vscode/blob/07f806f999227108933c2e30515b26eecc1fda74/src/vscode-dts/vscode.d.ts#L20242-L20312)
- [Stable catalog refresh event](https://github.com/microsoft/vscode/blob/07f806f999227108933c2e30515b26eecc1fda74/src/vscode-dts/vscode.d.ts#L20738-L20770)
- [Exact host matcher](https://github.com/microsoft/vscode/blob/07f806f999227108933c2e30515b26eecc1fda74/src/vs/workbench/contrib/chat/common/languageModels.ts#L376-L381)
- [Subagent resolution](https://github.com/microsoft/vscode/blob/07f806f999227108933c2e30515b26eecc1fda74/src/vs/workbench/contrib/chat/common/tools/builtinTools/runSubagentTool.ts#L560-L620)
- [Proposal deployment](https://code.visualstudio.com/api/advanced-topics/using-proposed-api)

## Parent-verified facts

1. `ChatResource` provider input contains `uri`, optional `when`, optional `sessionTypes`. It has no input `pluginUri`/`source` override.
2. `ChatCustomAgent` output has `source`, `extensionId`, `pluginUri`; this does not grant an extension permission to masquerade as a plugin. Attribution/hook behavior needs native qualification.
3. `LanguageModelChat` exposes `vendor`, opaque `id`, `name`, `family`, `version`. Persist `(vendor,id)` identity; compute exact qualified selector from current name/vendor. A unique ID does not guarantee a unique name selector.
4. Stable `lm.onDidChangeChatModels` exists in this pinned build. Re-query after changes; no polling loop needed.
5. `selectChatModels()` may return empty/multiple models. The explicit consent mandate in the inspected stable declarations belongs to `sendRequest()`, not `selectChatModels()`. User-initiated initial discovery is conservative product policy; do not claim every catalog read necessarily prompts for consent.
6. The companion does not call `sendRequest()` or `countTokens()` to configure models. Native qualification may require authorized test invocations and separate access/quota evidence.

## Historical report facts to requalify

The brainstorm records VS Code 1.140.0 commit `07f806f999227108933c2e30515b26eecc1fda74`, bundled Copilot Chat 0.68.0. This is the first candidate for Phase 01, not an automatically supported version range. It records exact case-sensitive display-name matching, ordinary plugin alias failure, subagent parent fallback and explicit-tool-model errors. Provider-backed actors must independently prove those behaviors on the selected host.

## Conservative design

- Pin proposed declarations and supported host tuple; unsupported hosts get setup guidance, no silent static fallback.
- Concrete files under `ExtensionContext.storageUri` or partitioned `globalStorageUri`; never `.evcrate-vscode/resolved-agents` or any published root.
- `registerCustomAgentProvider` owns only actors; existing plugin owns supporting hooks/skills/workflows.
- Preserve/rebase structured reference paths and prove plugin-level hooks operate for extension-attributed actors. Do not introduce a second hook registration owner as an assumed repair.
- Use `onDidChangeCustomAgents` for inventory refresh, `lm.onDidChangeChatModels` for catalog invalidation, configuration/file watchers for other inputs.
- Read provider context as opaque unless a pinned public contract establishes folder identity. Multi-root must not select the first folder.
- Remote host placement/schemes derive from actual extension-host evidence; do not assume all remote files use `file:` or `vscode-remote:` exclusively.

## Research corrections

Rejected preliminary recommendations to write derived resources inside the projection, assume remote URI schemes, poll for catalog changes, or treat catalog denial behavior as established. These would violate immutability or overstate the API contract. Project/HOME storage paths use context URIs, never OS hardcoded global-storage paths.

## Phase 01 stop gates

Provider discovery exactly once; actual direct/subagent identity; native empty-tool/leaf delegation restrictions; hooks and reference bases; future-invocation refresh/removal races; trust and proposal-disabled states; project/HOME/multi-root/remote placement. A failure blocks static cutover and requires user-approved design/support changes.

## Unresolved questions

Can extension-attributed agents preserve the existing plugin's hook/reference semantics? Can selected-agent removal still invoke a stale actor or silently choose another model? Can one provider expose distinct root policies without ambiguous multi-root names? These require native proof, not another source-only assertion.
