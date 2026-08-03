---
name: cmd_kanban
description: Plans directory (default: ./plans)
---
# cmd_kanban

Command Path: /kanban

Description: Plans directory (default: ./plans)

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

Plans dashboard with progress tracking and timeline visualization.

## Usage

- `/kanban` - View dashboard for ./plans directory
- `/kanban plans/` - View dashboard for specific directory
- `/kanban --stop` - Stop running server

## Features

- Plan cards with progress bars
- Phase status breakdown (completed, in-progress, pending)
- Timeline/Gantt visualization
- Activity heatmap
- Issue and branch links

## Execution

**IMPORTANT:** Run server as Codex CLI background task using `run_in_background: true` with the Bash tool. This makes the server visible in `/tasks` and manageable via `KillShell`.

Check if this script is located in the current workspace or in `$HOME/.agents/skills/plans-kanban` directory:
- If in current workspace: `$SKILL_DIR_PATH` = `./.agents/skills/plans-kanban/`
- If in home directory: `$SKILL_DIR_PATH` = `$HOME/.agents/skills/plans-kanban/`

### Stop Server

If `--stop` flag is provided:

```bash
node $SKILL_DIR_PATH/scripts/server.cjs --stop
```

### Start Server

Otherwise, run the kanban server as CC background task with `--foreground` flag (keeps process alive for CC task management):

```bash
# Determine plans directory
INPUT_DIR="{{dir}}"
PLANS_DIR="${INPUT_DIR:-./plans}"

# Start kanban dashboard
node $SKILL_DIR_PATH/scripts/server.cjs \
  --dir "$PLANS_DIR" \
  --host 0.0.0.0 \
  --open \
  --foreground
```

**Critical:** When calling the Bash tool:
- Set `run_in_background: true` to run as CC background task
- Set `timeout: 300000` (5 minutes) to prevent premature termination
- Parse JSON output and report URL to user

Example Bash tool call:
```json
{
  "command": "node .agents/skills/plans-kanban/scripts/server.cjs --dir \"./plans\" --host 0.0.0.0 --open --foreground",
  "run_in_background": true,
  "timeout": 300000,
  "description": "Start kanban server in background"
}
```

After starting, parse the JSON output (e.g., `{"success":true,"url":"http://localhost:3500/kanban?dir=...","networkUrl":"http://192.168.1.x:3500/kanban?dir=..."}`) and report:
- Local URL for browser access
- Network URL for remote device access (if available)
- Inform user that server is now running as CC background task (visible in `/tasks`)

**CRITICAL:** MUST display the FULL URL including path and query string. NEVER truncate to just `host:port`. The full URL is required for direct access.

## Future Plans

The `/kanban` command will evolve into **VibeKanban-inspired** AI agent orchestration:

### Phase 1 (Current - MVP)
- ✅ Task board with progress tracking
- ✅ Visual representation of plans/tasks
- ✅ Click to view plan details

### Phase 2 (Worktree Integration)
- Create tasks → spawn git worktrees
- Assign agents to tasks
- Track agent progress per worktree

### Phase 3 (Full Orchestration)
- Parallel agent execution monitoring
- Code diff/review interface
- PR creation workflow
- Agent output streaming
- Conflict detection

Track progress: https://github.com/claudekit/claudekit-engineer/issues/189
