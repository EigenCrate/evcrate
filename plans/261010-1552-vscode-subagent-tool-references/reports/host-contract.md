# Host Reference Contract and Baseline

- **Date:** 2026-10-10
- **Plan:** `plans/261010-1552-vscode-subagent-tool-references/plan.md`
- **Phase:** Phase 01 — Host contract and baseline
- **Status:** Complete (Frozen baseline)
- **Branch:** `fix/vscode-subagent-tool-references`
- **Commit:** `36c68bb4fd11327769adc7d836900436b2042165`
- **CWD / Worktree:** `/home/loidinh/WS/evcrate`

---

## 1. Environment & Pinned Host Target

The qualification target is pinned to the exact current supported release pair verified on the host workstation:

| Component | Pinned Version / Identifier | Provenance / Evidence |
|---|---|---|
| **Editor** | VS Code `1.140.0` | `code --version` stdout |
| **Editor Commit** | `07f806f999227108933c2e30515b26eecc1fda74` | `code --version` stdout (x64) |
| **Extension** | GitHub Copilot Chat `0.68.0` (`copilot-chat`) | `/usr/share/code/resources/app/extensions/copilot/package.json` |
| **Core Source Ref** | `microsoft/vscode@07f806f999227108933c2e30515b26eecc1fda74` | GitHub repository tree at pinned commit |
| **Node.js** | `v24.16.0` (x64) | Local runtime binary |
| **Host OS** | Linux `7.1.10-200.fc44.x86_64` | Local workstation environment |

---

## 2. Inventory of Accepted References Across All 13 Mapper Capabilities

VS Code tool references are resolved by `LanguageModelToolsService.getToolAliases` and `toToolAndToolSetEnablementMap`. Tools originate from two distinct registration authorities:
1. **VS Code Core Built-in Tools** (terminal, task delegation, todo list)
2. **Copilot Extension Contributions** (filesystem, search, editing, web, notebooks)

### Complete 13-Capability Reference Matrix

| # | Source Intent | Existing Mapper Output | Host Tool Reference | Qualified Set Name | Model-Facing Name | Input Schema Required Parameters | Semantic Disposition |
|---|---|---|---|---|---|---|---|
| 1 | `Read` | `read_file` | `read/readFile` (or `readFile`) | `read` | `copilot_readFile` / `readFile` | `filePath` (string, 1-based `startLine`, `endLine`) | **Direct equivalent.** Correct frontmatter reference to `read/readFile`. |
| 2 | `Glob` | `file_search` | `search/fileSearch` (or `fileSearch`) | `search` | `copilot_findFiles` / `fileSearch` | `query` (string, glob pattern), optional `maxResults` | **Direct equivalent.** Correct frontmatter reference to `search/fileSearch`. |
| 3 | `Grep` | `grep_search` | `search/textSearch` (or `textSearch`) | `search` | `copilot_findTextInFiles` / `textSearch` | `query` (string), `isRegexp` (bool), optional `includePattern` | **Direct equivalent.** Correct frontmatter reference to `search/textSearch`. |
| 4 | `LS` | `file_search` | `search/listDirectory` (or `listDirectory`) | `search` | `copilot_listDirectory` / `listDirectory` | `path` (string, absolute directory path) | **Preferred listing capability.** Distinct from search glob; maps to `search/listDirectory`. |
| 5 | `Bash` | `run_in_terminal` | `runInTerminal` | Core `terminal` | `run_in_terminal` | `command` (string) | **Direct equivalent.** Core reference is `runInTerminal`; preserve terminal execution intent. |
| 6 | `BashOutput` | `run_in_terminal` | `getTerminalOutput` | Core `terminal` | `getTerminalOutput` | Terminal session / ID reference | **Semantic approximation.** Current mapper approximates to terminal runner; core tool is `getTerminalOutput`. |
| 7 | `KillBash` | `run_in_terminal` | `killTerminal` | Core `terminal` | `killTerminal` | Terminal session / ID reference | **Semantic approximation.** Current mapper approximates to terminal runner; core tool is `killTerminal`. |
| 8 | `KillShell` | `run_in_terminal` | `killTerminal` | Core `terminal` | `killTerminal` | Terminal session / ID reference | **Semantic approximation.** Alias to KillBash. |
| 9 | `Task` | `runSubagent` | `agent/runSubagent` (or `runSubagent`) | Core `agent` | `runSubagent` | Subagent query / prompt / name | **Direct equivalent.** Core delegation tool. **Inviolable constraint:** `canDelegate` must stay `true`. |
| 10 | `TodoWrite` | `manage_todo_list` | `todo` (legacy `todos`) | Core `builtin` | `manage_todo_list` | `action`, todo item details | **Direct equivalent.** Frontmatter reference is `todo`; model ID remains `manage_todo_list`. Disabled by host in child subagents. |
| 11 | `Edit` | `edit_file` | `editFiles` (placeholder) / concrete edit tools | `edit` | `replaceString`, `applyPatch`, etc. | `filePath`, `oldString`, `newString` (or patch string) | **Edit gate.** `editFiles` is a selector; concrete tools are `replaceString`, `insertEdit`, `applyPatch`. |
| 12 | `Write` | `edit_file` | `createFile` / `replaceString` | `edit` | `copilot_createFile` | `filePath`, `content` | `createFile` creates new files only; replacing existing files requires edit tools. |
| 13 | `MultiEdit` | `edit_file` | `multiReplaceString` / `applyPatch` | `edit` | `copilot_multiReplaceString` | `replacements: [{filePath, oldString, newString}]` | **Concrete multi-edit tool.** |

---

## 3. Invariant Semantics: Delegation, Inheritance & Permissions

### A. Subagent Delegation (`Task` -> `canDelegate`)
- In `src/adapters/vscode/metadata-tools.ts`, `canDelegate` is evaluated based on whether the mapped tool is `runSubagent`.
- If the mapped string changes (e.g. to `agent/runSubagent`), the `canDelegate` check must be updated accordingly:
  ```ts
  if (native === 'runSubagent' || native === 'agent/runSubagent') {
    canDelegate = true;
  }
  ```
- **Invariant:** Coordinator agents (`evc-planner`, `evc-project-manager`, etc.) must have `canDelegate = true` and `agents: ['*']`. Leaf agents (`evc-scout`, `evc-advisor`) must have `agents: []` and cannot delegate.

### B. Tool Inheritance vs. Explicit Restrictions
- **Omitted `tools` field** (e.g. `evc-docs-manager.md`): Inherits host capabilities. Result: `hasExplicitTools: false`, `isExplicitNone: false`, `canDelegate: true`. Frontmatter must NOT emit `tools: []`.
- **Explicit `tools: []` or `tools: none`** (e.g. `evc-advisor.md`, `contract-deny-all`): Explicitly denies all tools. Result: `hasExplicitTools: true`, `isExplicitNone: true`, `mapped: []`, `agents: []`, `canDelegate: false`.
- **Explicit nonempty tools** (e.g. `evc-scout.md`): Emits mapped tools; if `Task` is omitted, emits `agents: []` to prevent delegation.

### C. Child Session Todo Restriction
- Host source `runSubagentTool.ts` intentionally removes `manage_todo_list` from tools provided to child subagents.
- Direct agents may still declare and use `todo`; subagents running under `runSubagent` cannot invoke `manage_todo_list`.

---

## 4. Hook Normalization & Parameter Differences

A critical finding in Copilot Chat 0.68.0 contributions is that **host tool schemas use `filePath`, not `path`**:

| Host Tool | Parameter Name in Host Contribution Schema | Parameter Name in Current `tool-inputs.ts` |
|---|---|---|
| `readFile` (`copilot_readFile`) | `filePath` (required string) | `path`, `file_path`, `target_file`, `TargetFile` |
| `createFile` (`copilot_createFile`) | `filePath` (required string) | `path`, `file_path`, `target_file`, `TargetFile` |
| `replaceString` (`copilot_replaceString`) | `filePath` (required string) | `path`, `file_path`, `target_file`, `TargetFile` |
| `insertEdit` (`copilot_insertEdit`) | `filePath` (required string) | `path`, `file_path`, `target_file`, `TargetFile` |
| `multiReplaceString` | `replacements[].filePath` | `files[].path` |
| `listDirectory` (`copilot_listDirectory`) | `path` (required string) | `path` |

### Required Normalization in `tool-inputs.ts` & `LOCAL_TOOL_INPUTS_SOURCE`
To prevent `unqualified` rejections when Copilot invokes native tools, the normalizer must accept `filePath` and `FilePath`:
```ts
const rawPath = toolInput.filePath ?? toolInput.FilePath ?? toolInput.path ?? toolInput.file_path ?? toolInput.target_file ?? toolInput.TargetFile;
```
This fix must be reflected in both TypeScript source (`src/adapters/vscode/tool-inputs.ts`) and runtime bundle source (`src/adapters/vscode/runtime-sources.ts:LOCAL_TOOL_INPUTS_SOURCE`) during Phase 02.

---

## 5. Failure Classification Taxonomy

All future qualification and test failures must be classified into one of the following seven mutually exclusive categories:

1. `reference_unresolved`: Frontmatter reference name is rejected or unrecognized by `LanguageModelToolsService` (e.g. old `read_file` instead of `read/readFile`).
2. `profile_mismatch`: Feature disabled by user/extension configuration (e.g. `config.github.copilot.chat.disableReplaceTool`).
3. `tool_absent`: Tool is not registered by core or any active extension.
4. `policy_denied`: Tool execution blocked by PreToolUse hook policy (e.g. Scout directory pattern `node_modules/` or sensitive file `.env`).
5. `model_unsupported`: Selected LLM model lacks tool-calling capabilities.
6. `execution_error`: Tool failed during invocation (e.g. ENOENT, bad line range, syntax error).
7. `self_report_unverified`: Model claims tool failed without actual tool invocation trace or host denial event.

---

## 6. Windows Unknowns and Platform Boundary

The native Windows incident configuration remains unverified in this local session:
- Windows VS Code exact build, commit, and Copilot Chat version are unknown.
- Windows loaded Scout URI and original failure trace are historical and unverified.
- **Decision:** As established in plan validation, Linux native qualification and automated checks permit reviewed-candidate handoff, but incident closure and production deployment remain strictly blocked until affected-host Windows evidence is captured on the pinned release pair. No automatic or speculative Windows parity is inferred.

---

## 7. Frozen Baseline & Phase Contract

1. **No production code changes were made in Phase 01.**
2. All 13 canonical mapper entries have explicit host references and semantic decisions documented above.
3. Frontmatter cutover in Phase 02 will use:
   - `read` -> `read/readFile`
   - `glob` -> `search/fileSearch`
   - `grep` -> `search/textSearch`
   - `ls` -> `search/listDirectory`
   - `bash` -> `runInTerminal`
   - `bashoutput` -> `getTerminalOutput` (or preserve runner alias with clear contract)
   - `killbash` / `killshell` -> `killTerminal` (or preserve runner alias with clear contract)
   - `task` -> `agent/runSubagent` (with `canDelegate` preserved)
   - `todowrite` -> `todo`
   - `edit` -> `editFiles` (placeholder selector) or concrete edit tool references
   - `write` -> `createFile` / edit reference
   - `multiedit` -> `multiReplaceString` / `applyPatch`
4. Hook normalization for `filePath` is recorded as a mandatory paired implementation requirement in Phase 02.
