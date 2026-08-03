---
name: cmd_use-mcp
description: Utilize tools of Model Context Protocol (MCP) servers
---
# cmd_use-mcp

Command Path: /use-mcp

Description: Utilize tools of Model Context Protocol (MCP) servers

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

Execute MCP operations via **Gemini CLI** to preserve context budget.

## Execution Steps

1. **Execute task via Gemini CLI** (using stdin pipe for MCP support):
   ```bash
   # IMPORTANT: Use stdin piping, NOT -p flag (deprecated, skips MCP init)
   echo "{{args}}. Return JSON only per GEMINI.md instructions." | gemini -y -m gemini-2.5-flash
   ```

2. **Fallback to mcp-manager subagent** (if Gemini CLI unavailable):
   - Use `mcp-manager` subagent to discover and execute tools
   - If the subagent got issues with the scripts of `mcp-management` skill, use `mcp-builder` skill to fix them
   - **DO NOT** create ANY new scripts
   - The subagent can only use MCP tools if any to achieve this task
   - If the subagent can't find any suitable tools, just report it back to the main agent to move on to the next step

## Important Notes

- **MUST use stdin piping** - the deprecated `-p` flag skips MCP initialization
- Use `-y` flag to auto-approve tool execution
- **GEMINI.md auto-loaded**: Gemini CLI automatically loads `GEMINI.md` from project root, enforcing JSON-only response format
- **Parseable output**: Responses are structured JSON: `{"server":"name","tool":"name","success":true,"result":<data>,"error":null}`

## Anti-Pattern (DO NOT USE)

```bash
# BROKEN - deprecated -p flag skips MCP server connections!
gemini -y -m gemini-2.5-flash -p "..."
```
