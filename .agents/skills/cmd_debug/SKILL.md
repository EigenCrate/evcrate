---
name: cmd_debug
description: ⚡⚡ Debugging technical issues and providing solutions.
---
# cmd_debug

Command Path: /debug

Description: ⚡⚡ Debugging technical issues and providing solutions.

Codex note: when this recipe says to run another `/...` command, invoke the matching `cmd_*` skill for that path.

For high-impact architecture, security, debugging, or review decisions, consider explicit `$advisor-strategy` use for current-session guidance; this pointer does not activate it.

**Reported Issues**:
 {{args}}

Use the `debugger` subagent to find the root cause of the issues, then analyze and explain the reports to the user.

**IMPORTANT**: **Do not** implement the fix automatically.
**IMPORTANT:** Analyze the skills catalog and activate the skills that are needed for the task during the process.
**IMPORTANT:** Sacrifice grammar for the sake of concision when writing outputs.
