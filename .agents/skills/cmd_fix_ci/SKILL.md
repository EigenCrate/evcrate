---
name: cmd_fix_ci
description: ⚡ Analyze Github Actions logs and fix issues
---
# cmd_fix_ci

Command Path: /fix/ci

Description: ⚡ Analyze Github Actions logs and fix issues

Codex note: when this recipe says to run another `/...` command, invoke the matching `cmd_*` skill for that path.

For high-impact architecture, security, debugging, or review decisions, consider explicit `$advisor-strategy` use for current-session guidance; this pointer does not activate it.

## Github Actions URL
<url>{{args}}</url>

## Workflow
1. Use `debugger` subagent to read the github actions logs with `gh` command, analyze and find the root cause of the issues and report back to main agent.
2. Start implementing the fix based the reports and solutions.
3. Use `tester` agent to test the fix and make sure it works, then report back to main agent.
4. If there are issues or failed tests, repeat from step 2.
5. After finishing, respond back to user with a summary of the changes and explain everything briefly, guide user to get started and suggest the next steps.

## Notes
- If `gh` command is not available, instruct the user to install and authorize GitHub CLI first.
