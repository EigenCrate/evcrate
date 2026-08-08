---
name: "cmd-evcrate-help"
description: "EVCrate usage guide - just type naturally"
---

# cmd_evcrate-help

Command Path: /evcrate-help

Description: EVCrate usage guide - just type naturally

Codex note: when this recipe says to run another `/...` command, invoke the matching `cmd_*` skill for that path.

For high-impact architecture, security, debugging, or review decisions, consider explicit `$advisor-strategy` use for current-session guidance; this pointer does not activate it.

## Subagent Completion Contract

Delegation is blocking by default. The parent agent must wait for each delegated agent's terminal response before starting dependent work, touching shared files, marking a step complete, or replying with a final result.

- Parallel prompt format: **spawn N agents; wait for all N to finish; collect one terminal result from each; then summarize**.
- Wait protocol: use the native agent wait/poll operation for the same agent set. **"No agents completed yet" is a non-terminal poll result; wait again.** Do not treat it as a timeout, sleep instead of polling, restart, interrupt, or advance the workflow.
- A polling interval or retry count is not a delegation deadline. Do not invent a wall-clock limit (including 180 seconds) for a blocking gate. Continue polling until a terminal result, explicit user stop, or an actual parent-runtime termination.
- Treat an interrupted, timed-out, missing, or partial result as a failed gate. Do not continue from partial work or silently skip/restart the agent.
- Sequential prompt format: **run one agent; wait for its terminal result; verify the report/artifacts; then run the next agent**.
- Every delegated prompt must define scope, file ownership, expected report/artifact, and validation signal.
- A spawn acknowledgement, progress event, or file change does not mean the agent completed. Completion requires the terminal response and requested validation.
- If the parent runtime ends before completion, preserve the agent identity and report the gate as incomplete; never fabricate a result or launch a replacement.

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

- **`/plan` → Use the matching `cmd_*` skill to run `/code`**: Plan first, then execute the plan
- **`/cook`**: Standalone - plans internally, no separate `/plan` needed
- **NEVER** suggest `/plan` → Use the matching `cmd_*` skill to run `/cook` (cook has its own planning)
