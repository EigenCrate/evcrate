# Host reference contract — integrated findings

## Review disposition

Parent corrected the initial research: Copilot extension metadata is not the complete host registry. VS Code core registers terminal, delegation, and todo tools. Their absence from extension `package.json` does not mean unsupported. Initial recommendations to drop Bash/Task/TodoWrite are rejected. No implementation performed.

## Evidence baseline

- Local Linux VS Code 1.140.0, commit `07f806f999227108933c2e30515b26eecc1fda74`; Copilot Chat 0.68.0.
- Installed `/usr/share/code/resources/app/extensions/copilot/package.json` contains extension registrations and tool-set membership.
- Pinned core `getToolAliases` / `toToolAndToolSetEnablementMap` resolves reference names and declared aliases, not arbitrary model-facing names or extension IDs.
- Native Windows incident configuration remains unknown. Metadata/source analysis is not native chat qualification.

## Existing alias inventory and implementation contract

| Source intent | Existing output | Host reference evidence | Planned disposition |
|---|---|---|---|
| Read | `read_file` | `read/readFile` | Correct frontmatter reference |
| Glob | `file_search` | `search/fileSearch` | Correct frontmatter reference |
| Grep | `grep_search` | `search/textSearch` | Correct frontmatter reference |
| LS | `file_search` | `search/listDirectory` registered separately | Prefer listing capability after payload/policy qualification; no unrelated search group |
| Bash | `run_in_terminal` | Core `runInTerminal`; legacy `runCommands/runInTerminal` | Preserve terminal intent with valid reference; do not drop |
| BashOutput | `run_in_terminal` | Core `getTerminalOutput` | Existing runner alias is an approximation; verify terminal-ID/output semantics before cutover |
| KillBash / KillShell | `run_in_terminal` | Core `killTerminal` | Verify termination semantics; no arbitrary process-control subsystem |
| Task | `runSubagent` | Core tool registered in `agent` set; `agent/runSubagent` is documented; old simple name aliases agent set | Emit explicit delegation tool and preserve canDelegate; `agents` alone is insufficient |
| TodoWrite | `manage_todo_list` | Core reference `todo`, legacy `todos`; model ID remains `manage_todo_list` | Keep direct-agent capability; document host disables it for Local subagents |
| Edit / MultiEdit | `edit_file` | `editFiles` reference exists but is declared a placeholder; concrete `replaceString`, `multiReplaceString`, `insertEdit`, `applyPatch` also exist | Qualify actual model-specific editing expansion before selecting minimal references |
| Write | `edit_file` | `edit/createFile` creates new files only; edit selectors handle existing files | Must cover both creation and replacement; createFile alone is not sufficient |

Prefer qualified names when membership is verified. Recognized simple core names are safer than invented qualified names. Do not require qualified spelling where the tool has no corresponding set membership.

## Edit capability gate

The extension's `copilot_editFiles` registration has `modelDescription: This is a placeholder tool, do not use` and no input schema. It may be a selector for downstream model-specific edit tools; this investigation has not verified that expansion. Do not describe it as a callable edit tool or a proven replacement.

Concrete registration descriptions establish:
- `createFile`: new file only; explicitly not for editing existing files.
- `replaceString`: existing-file replacement; controlled by `github.copilot.chat.disableReplaceTool`.
- `multiReplaceString`: repeated existing-file replacements; same setting condition.
- `insertEdit`: existing-file code edits.
- `applyPatch`: add/update/delete text files; broader operation set than replacement-only intent.

Phase 01 must freeze narrow edit references by observing effective tools under the supported selected model and exercising create + replacement + multi-edit. If one source tool requires multiple explicit references, a static readonly array mapping is acceptable; no broad edit tool set or speculative host/model abstraction. Permission expansion beyond canonical intent requires a decision, not silent fallback.

## Delegation and todo constraints

- Changing Task output to `agent/runSubagent` requires updating `canDelegate` logic, currently tied to the old output spelling. Source Task intent should determine the flag after successful mapping.
- Keep `agents: []` for leaf agents; do not delete the delegation tool from coordinators.
- `runSubagentTool.ts` deliberately disables `manage_todo_list` for child sessions. This is not a reason to strip `todo` from definitions also used directly.
- Frontmatter `todo` and model-facing prose `manage_todo_list` are different valid names in their respective namespaces.

## Sources

Pinned root for every source below: `https://github.com/microsoft/vscode/blob/07f806f999227108933c2e30515b26eecc1fda74/`.

- [Reference resolver](https://github.com/microsoft/vscode/blob/07f806f999227108933c2e30515b26eecc1fda74/src/vs/workbench/contrib/chat/browser/tools/languageModelToolsService.ts#L1594-L1669)
- [Delegation registration/resolution](https://github.com/microsoft/vscode/blob/07f806f999227108933c2e30515b26eecc1fda74/src/vs/workbench/contrib/chat/common/tools/builtinTools/runSubagentTool.ts)
- [Core registration and agent set](https://github.com/microsoft/vscode/blob/07f806f999227108933c2e30515b26eecc1fda74/src/vs/workbench/contrib/chat/common/tools/builtinTools/tools.ts)
- [Todo reference](https://github.com/microsoft/vscode/blob/07f806f999227108933c2e30515b26eecc1fda74/src/vs/workbench/contrib/chat/common/tools/builtinTools/manageTodoListTool.ts)
- [Terminal execution reference](https://github.com/microsoft/vscode/blob/07f806f999227108933c2e30515b26eecc1fda74/src/vs/workbench/contrib/terminalContrib/chatAgentTools/browser/tools/runInTerminalTool.ts#L95-L96)
- [Terminal output reference](https://github.com/microsoft/vscode/blob/07f806f999227108933c2e30515b26eecc1fda74/src/vs/workbench/contrib/terminalContrib/chatAgentTools/browser/tools/getTerminalOutputTool.ts)
- [Terminal termination reference](https://github.com/microsoft/vscode/blob/07f806f999227108933c2e30515b26eecc1fda74/src/vs/workbench/contrib/terminalContrib/chatAgentTools/browser/tools/killTerminalTool.ts)
- [Local subagent documentation](https://code.visualstudio.com/docs/agents/run/subagents)

## Unresolved questions

- Native edit selector expansion and model-specific effective tool lists remain a Phase 01 blocker for edit mapping selection.
- Actual terminal/output/kill hook identities and operand semantics need qualification before replacing approximations.
- Exact Windows host version, resolved Scout source, and failure trace remain unavailable.
