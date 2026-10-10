---
name: "evc-cmd-help"
description: "EVCrate usage guide - just type naturally"
---

# evc-cmd-help

Command Path: $evc-cmd-help

Description: EVCrate usage guide - just type naturally

Codex note: when this recipe says to run another `$evc-cmd-…` command, invoke the matching `evc-cmd-*` skill for that path.

For high-impact architecture, security, debugging, or review decisions, consider explicit `$advisor-strategy` use for current-session guidance; this pointer does not activate it.

## Subagent Completion Contract

Delegation is blocking by default. The parent agent must wait for each delegated agent's terminal response before starting dependent work, touching shared files, marking a step complete, or replying with a final result.

- Parallel prompt format: **spawn N agents; wait for all N to finish; collect one terminal result from each; then summarize**.
- Wait protocol: use the native agent wait/poll operation for the same agent set. **"No agents completed yet" is a non-terminal poll result; wait again.** Do not treat this as a timeout, sleep instead of polling, restart, interrupt, or advance the workflow.
- A polling interval or retry count is not a delegation deadline. Do not invent a wall-clock limit. Continue polling until a terminal result, explicit user stop, or an actual parent-runtime termination.
- Treat an interrupted, timed-out, missing, or partial result as a failed gate. Do not continue from partial output or silently restart it.
- Sequential prompt format: **run one agent; wait for its terminal response before continuing**.
- Every delegated prompt must define scope, file ownership, expected report, and validation signal.
- A spawn acknowledgement or file change does not mean completion; completion requires the terminal response and requested validation.
Think harder.
All-in-one EVCrate guide. Run the script and present output based on type markers.

## Pre-Processing

**IMPORTANT: Always translate `{{args}}` to English before passing to script.**

The Python script only understands English keywords. If `{{args}}` is in another language:
1. Translate `{{args}}` to English
2. Pass the translated English string to the script

## Execution

```bash
python .codex/scripts/ev-help.py "{{args}}"
```

Resolve the script path against the selected project or HOME installation before
running it from another working directory. Its adjacent `scanner-layout.json`
selects that installation's command catalog and target identity; another
co-installed harness or the caller's working directory is never a fallback.

## Output Type Detection

The script outputs a type marker on the first line: `@EVCRATE_OUTPUT_TYPE:<type>`

**Read this marker and adjust your presentation accordingly:**

### `@EVCRATE_OUTPUT_TYPE:comprehensive-docs`

Full documentation (config, schema, setup guides).

**Presentation:**
1. Show the **COMPLETE** script output verbatim - every section, every code block
2. **THEN ADD** helpful context:
   - Real-world usage examples ("For example, if you're working on multiple projects...")
   - Common gotchas and tips ("Watch out for: ...")
   - Practical scenarios ("This is useful when...")
3. End with a specific follow-up question

**Example enhancement after showing full output:**
```
## Additional Tips

**When to use global vs local config:**
- Use global (~/.codex/.evcrate.json) for personal preferences like language, issue prefix style
- Use local (./.codex/.evcrate.json) for project-specific paths, naming conventions

**Common setup for teams:**
Each team member sets their locale globally, but projects share local config via git.

Need help setting up a specific configuration?
```

### `@EVCRATE_OUTPUT_TYPE:category-guide`

Workflow guides for command categories (fix, plan, cook, etc.).

**Presentation:**
1. Show the complete workflow and command list
2. **ADD** practical context:
   - When to use this workflow vs alternatives
   - Real example: "If you encounter a bug in authentication, start with..."
   - Transition tips between commands
3. Offer to help with a specific task

### `@EVCRATE_OUTPUT_TYPE:command-details`

Single command documentation.

**Presentation:**
1. Show full command info from script
2. **ADD**:
   - Concrete usage example with realistic input
   - When this command shines vs alternatives
   - Common flags or variations
3. Offer to run the command for them

### `@EVCRATE_OUTPUT_TYPE:search-results`

Search matches for a keyword.

**Presentation:**
1. Show all matches from script
2. **HELP** user navigate:
   - Group by relevance if many results
   - Suggest most likely match based on context
   - Offer to explain any specific command
3. Ask what they're trying to accomplish

### `@EVCRATE_OUTPUT_TYPE:task-recommendations`

Task-based command suggestions.

**Presentation:**
1. Show recommended commands from script
2. **EXPLAIN** the reasoning:
   - Why these commands fit the task
   - Suggested order of execution
   - What each step accomplishes
3. Offer to start with the first recommended command

## Key Principle

**Script output = foundation. Your additions = value-add.**

Never replace or summarize the script output. Always show it fully, then enhance with your knowledge and context.

## Important: Correct Workflows

- **`$evc-cmd-plan` → `$evc-cmd-code`**: Plan first, then execute the plan
- **`$evc-cmd-cook`**: Standalone - plans internally, no separate `$evc-cmd-plan` needed
- **NEVER** suggest `$evc-cmd-plan` → `$evc-cmd-cook` (cook has its own planning)

## Supported Harness Targets

EVCrate projects canonical resources into seven target harness formats:
1. `claude` (Anthropic Claude Code CLI)
2. `codex` (OpenAI Codex CLI with companion `.agents` root)
3. `antigravity` (Antigravity harness)
4. `pi` (Pi coding agent)
5. `omp` (OpenCode/OMP)
6. `copilot` (GitHub Copilot CLI)
7. `vscode` (VS Code Local Agent Plugins 1.0 bundle at `.evcrate-vscode/`)

### VS Code Local Support Boundaries

- **Plugin Bundle**: Generated at `.evcrate/source/.evcrate-vscode/`, published to project or HOME `.evcrate-vscode/`.
- **Plugin Identity**: `evcrate-local`.
- **Command Syntax**: Projects slash commands as manual skills named like every other target (e.g., `$evc-cmd-plan`), forwarding arguments directly.
- **Activation**: User-controlled via VS Code's `chat.pluginLocations` setting; publication never touches editor configuration.
- **Scope Recovery**: `evcrate recover --scope project|home` restores managed files without touching editor settings or user workspaces.
- **Qualification**: Local bundle/helper execution does not establish native VS Code GUI qualification.
