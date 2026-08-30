---
name: "evcrate-cmd-preview"
description: "Path to markdown file, plan directory, or plans collection"
argument-hint: ""
user-invocable: true
disable-model-invocation: true
---

## Invocation contract

The literal `$ARGUMENTS` is the exact raw text following `/evcrate-cmd-preview`. Do not split, normalize, or discard it before the canonical command parses it.

Before executing this command, read these EVCrate workflow assets:
- `@evcrate/workflows/advisor-mentoring.md`
- `@evcrate/workflows/advisory-interview.md`
- `@evcrate/workflows/development-rules.md`
- `@evcrate/workflows/documentation-management.md`
- `@evcrate/workflows/orchestration-protocol.md`
- `@evcrate/workflows/primary-workflow.md`

Universal viewer using `markdown-novel-viewer` skill - pass ANY path and see it rendered nicely.

## Usage

- `/evcrate-cmd-preview <file.md>` - View markdown file in novel-reader UI
- `/evcrate-cmd-preview <directory/>` - Browse directory contents
- `/evcrate-cmd-preview --stop` - Stop running server

## Examples

```bash
/evcrate-cmd-preview plans/my-plan/plan.md     # View markdown file
/evcrate-cmd-preview plans/                    # Browse plans directory
/evcrate-cmd-preview docs/                     # Browse docs directory
/evcrate-cmd-preview any/path/to/file.md      # View any markdown file
/evcrate-cmd-preview any/path/                 # Browse any directory
```

## Execution

**IMPORTANT:** Run server as GitHub Copilot CLI background task using `run_in_background: true` with the Bash tool. This makes the server visible in `/tasks` and manageable via `KillShell`.

Check if this script is located in the current workspace or in `$HOME/.copilot/skills/markdown-novel-viewer` directory:
- If in current workspace: `$SKILL_DIR_PATH` = `./.copilot/skills/markdown-novel-viewer/`
- If in home directory: `$SKILL_DIR_PATH` = `$HOME/.copilot/skills/markdown-novel-viewer/`

### Stop Server

If `--stop` flag is provided:

```bash
node $SKILL_DIR_PATH/scripts/server.cjs --stop
```

### Start Server

Otherwise, run the `markdown-novel-viewer` server as CC background task with `--foreground` flag (keeps process alive for CC task management):

```bash
# Determine if path is file or directory
INPUT_PATH="{{path}}"
if [[ -d "$INPUT_PATH" ]]; then
  # Directory mode - browse
  node $SKILL_DIR_PATH/scripts/server.cjs \
    --dir "$INPUT_PATH" \
    --host 0.0.0.0 \
    --open \
    --foreground
else
  # File mode - view markdown
  node $SKILL_DIR_PATH/scripts/server.cjs \
    --file "$INPUT_PATH" \
    --host 0.0.0.0 \
    --open \
    --foreground
fi
```

**Critical:** When calling the Bash tool:
- Set `run_in_background: true` to run as CC background task
- Set `timeout: 300000` (5 minutes) to prevent premature termination
- Parse JSON output and report URL to user

Example Bash tool call:
```json
{
  "command": "node .copilot/skills/markdown-novel-viewer/scripts/server.cjs --dir \"path\" --host 0.0.0.0 --open --foreground",
  "run_in_background": true,
  "timeout": 300000,
  "description": "Start preview server in background"
}
```

After starting, parse the JSON output (e.g., `{"success":true,"url":"http://localhost:3456/view?file=...","networkUrl":"http://192.168.1.x:3456/view?file=..."}`) and report:
- Local URL for browser access
- Network URL for remote device access (if available)
- Inform user that server is now running as CC background task (visible in `/tasks`)

**CRITICAL:** MUST display the FULL URL including path and query string (e.g., `http://localhost:3456/view?file=/path/to/file.md`). NEVER truncate to just `host:port` (e.g., `http://localhost:3456`). The full URL is required for direct file access.
