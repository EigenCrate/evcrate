---
name: "evcrate-cmd-use-mcp"
description: "Utilize tools of Model Context Protocol (MCP) servers"
argument-hint: "[task]"
user-invocable: true
disable-model-invocation: true
---

## Invocation contract

The literal `$ARGUMENTS` is the exact raw text following `/evcrate-cmd-use-mcp`. Do not split, normalize, or discard it before the canonical command parses it.

Read the mandatory documentation ownership policy at `@evcrate/workflows/documentation-management.md`. The workflow list below is navigation, not a preload instruction. Follow the canonical command's read conditions and activation-first ordering; load full mentoring only after resolved explicit or inherited mode.

## Available workflow assets

- `@evcrate/workflows/advice-activation.md`
- `@evcrate/workflows/advisor-mentoring.md`
- `@evcrate/workflows/advisory-interview.md`
- `@evcrate/workflows/development-rules.md`
- `@evcrate/workflows/documentation-management.md`
- `@evcrate/workflows/orchestration-protocol.md`
- `@evcrate/workflows/plan-progress.md`
- `@evcrate/workflows/primary-workflow.md`

Execute MCP operations via **Gemini CLI** to preserve context budget.

## Execution Steps

1. **Execute task via Gemini CLI** (using stdin pipe for MCP support):
   ```bash
   # IMPORTANT: Use stdin piping, NOT -p flag (deprecated, skips MCP init)
   echo "$ARGUMENTS. Return JSON only per GEMINI.md instructions." | gemini -y -m gemini-2.5-flash
   ```

2. **Fallback to mcp-manager subagent** (if Gemini CLI unavailable):
   - Use `evcrate-mcp-manager` subagent to discover and execute tools
   - If the subagent got issues with the scripts of `evcrate-mcp-management` skill, use `evcrate-mcp-builder` skill to fix them
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
