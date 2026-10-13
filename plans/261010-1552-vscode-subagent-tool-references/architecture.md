# Implemented architecture: VS Code frontmatter tool references

Status: implemented and Linux-qualified (`1.140.0` / Copilot Chat `0.68.0`, candidate tree `81792bf29a3233edce95a2e604e7596064b4127d75d8792e5af7a0ff8ccd680b`); Windows native qualification, incident closure, and production deployment remain blocked pending affected-host verification and operator rollout authorization. Parent plan: [plan.md](./plan.md). Decision: [agreed brainstorm](../reports/brainstorm-261010-1552-vscode-subagent-tool-references.md).

## Boundary

Canonical Claude tool intent -> existing VS Code mapper (`src/adapters/vscode/metadata-tools.ts`) -> generated agent frontmatter (`.evcrate/source/.evcrate-vscode/com.github.copilot/agents/*.agent.md`) and declaration audit (`evcrate/agent-tool-audit.json`) -> existing publisher -> host `LanguageModelToolsService` reference resolution -> direct/custom-subagent runtime -> ordinary PreToolUse/PostToolUse hook policy (`tool-inputs.ts` and `runtime-sources.ts`) -> grounded report.

No new service, permission broker, extension, runtime registry discovery during build, broad tool set (`edit`, `execute`, `agent`), or automatic fallback. `mapAgentTools` remains the sole frontmatter projection authority. `agent-tool-audit.json` records build-time frontmatter declarations, never effective host runtime grants.

## Distinct tool namespaces and mapping contract

Four namespaces remain strictly separated:
1. **Canonical source tool intent**: authoring names (`Read`, `Glob`, `Grep`, `LS`, `Bash`, `BashOutput`, `KillBash`, `KillShell`, `Task`, `TodoWrite`, `Edit`, `Write`, `MultiEdit`).
2. **Host frontmatter tool references**: declarations emitted in `.agent.md` frontmatter and resolved by `LanguageModelToolsService` on pinned VS Code `1.140.0` / Copilot Chat `0.68.0`:
   - `Read` -> `['read/readFile']`
   - `Glob` -> `['search/fileSearch']`
   - `Grep` -> `['search/textSearch']`
   - `LS` -> `['search/listDirectory']`
   - `Bash` -> `['runInTerminal']`
   - `BashOutput` -> `['getTerminalOutput']`
   - `KillBash` / `KillShell` -> `['killTerminal']`
   - `Task` -> `['agent/runSubagent']`
   - `TodoWrite` -> `['todo']`
   - `Edit` -> `['editFiles']`
   - `Write` -> `['createFile', 'editFiles']`
   - `MultiEdit` -> `['multiReplaceString']` (broad `applyPatch` is not granted)
3. **Model-facing invocation names**: LLM tool schemas and body prose references (e.g., `copilot_readFile`, `manage_todo_list`).
4. **Hook event identities and operand normalization**: PreToolUse/PostToolUse tool names and input schemas (`filePath`, `FilePath`, `path`, `file_path`, `target_file`, `TargetFile` normalized identically in `src/adapters/vscode/tool-inputs.ts`, `src/adapters/vscode/runtime-sources.ts`, and emitted `evcrate/runtime/local-tool-inputs.cjs`).

## Invariants

- Correct frontmatter names only; do not globally rename model-facing invocation names or hook input identities.
- Keep explicit-empty (`tools: none` / `tools: []` -> `mapped: []`, `agents: []`, `canDelegate: false`), omitted tools (`hasExplicitTools: false` -> frontmatter omits `tools`, `agents: ['*']`, `canDelegate: true`), unsupported-only tools (remain empty rather than inheriting), and outgoing delegation (`canDelegate` derived from source `Task` intent, independent of output spelling) distinct across all 18 generated agents.
- Host-denied and host-absent tools remain distinct outcomes; neither permits terminal bypass. `todo` resolves for direct agents while the host runtime (`runSubagentTool.ts`) disables `manage_todo_list` in child subagents.
- Scout's terminal capability means its read-only workflow is an instruction and hook-policy constraint (`node_modules/` and `.evcrateignore` blocked; `.env` privacy-gated), not an OS sandbox.
- Default publication is inert and never mutates editor settings unless the operator explicitly opts into surgical `chat.pluginLocations` registration (`--register-vscode-settings` or interactive TTY prompt); `--no-register-vscode-settings` suppresses registration, and `evcrate recover` never mutates user `settings.json`.

## Evidence and rollout gate

- Pinned support target: VS Code `1.140.0` (`07f806f999227108933c2e30515b26eecc1fda74`) and GitHub Copilot Chat `0.68.0` (`tests/fixtures/vscode-local/tool-references.json`, digest `34c174a4f195e03c826bda327ab0b6b93277a1f06a3810b9ef32a49ef0bc98c2`). No older-version support promise.
- Linux x64 native delegation/permissions ([native-qualification.md](./reports/native-qualification.md), 11/11 PASS: N01–N10, W04) and end-to-end documentation workflow ([docs-workflow-qualification.md](./reports/docs-workflow-qualification.md), 3/3 PASS: W01–W03) are qualified against immutable candidate tree `81792bf29a3233edce95a2e604e7596064b4127d75d8792e5af7a0ff8ccd680b`.
- Windows Local remains `BLOCKED` (host unavailable in Linux workstation environment). Reviewed-candidate handoff ([candidate-handoff.md](./reports/candidate-handoff.md)) is complete; Windows acceptance, incident closure, and production deployment remain blocked until affected-host Windows verification on the pinned release pair and explicit operator rollout authorization.
