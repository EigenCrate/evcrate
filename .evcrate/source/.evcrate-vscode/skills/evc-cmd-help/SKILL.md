---
name: evc-cmd-help
description: EVCrate usage guide - just type naturally
user-invocable: true
disable-model-invocation: true
argument-hint: "[category|command|task description]"
---

Think harder.
All-in-one EVCrate guide. Run the script and present output based on type markers.

## Pre-Processing

**IMPORTANT: Always translate `$ARGUMENTS` to English before passing to script.**

The Python script only understands English keywords. If `$ARGUMENTS` is in another language:
1. Translate `$ARGUMENTS` to English
2. Pass the translated English string to the script

## Execution

```bash
python .evcrate-vscode/evcrate/scripts/ev-help.py "$ARGUMENTS"
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
- Use global (~/.evcrate-vscode/.evcrate.json) for personal preferences like language, issue prefix style
- Use local (./.evcrate-vscode/.evcrate.json) for project-specific paths, naming conventions

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

- **`/evc-cmd-plan` → `/evc-cmd-code`**: Plan first, then execute the plan
- **`/evc-cmd-cook`**: Standalone - plans internally, no separate `/evc-cmd-plan` needed
- **NEVER** suggest `/evc-cmd-plan` → `/evc-cmd-cook` (cook has its own planning)

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
- **Command Syntax**: Projects slash commands as manual skills named like every other target (e.g., `/evc-cmd-plan`), forwarding arguments directly.
- **Activation**: User-controlled via VS Code's `chat.pluginLocations` setting; publication never touches editor configuration.
- **Scope Recovery**: `evcrate recover --scope project|home` restores managed files without touching editor settings or user workspaces.
- **Qualification**: Local bundle/helper execution does not establish native VS Code GUI qualification.
