---
name: cmd_fix_logs
description: Analyze logs and fix issues
---
# cmd_fix_logs

Command Path: /fix/logs

Description: Analyze logs and fix issues

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

**IMPORTANT:** Analyze the skills catalog and activate the skills that are needed for the task during the process.

## Mission
<issue>{{args}}</issue>

## Workflow
1. Check if `./logs.txt` exists:
   - If missing, set up permanent log piping in project's script config (`package.json`, `Makefile`, `pyproject.toml`, etc.):
     - **Bash/Unix**: append `2>&1 | tee logs.txt`
     - **PowerShell**: append `*>&1 | Tee-Object logs.txt`
   - Run the command to generate logs
2. Use `debugger` subagent to analyze `./logs.txt` and find root causes:
   - Use `Grep` with `head_limit: 30` to read only last 30 lines (avoid loading entire file)
   - If insufficient context, increase `head_limit` as needed
3. Use `scout` subagent to analyze the codebase and find the exact location of the issues, then report back to main agent.
4. Use `planner` subagent to create an implementation plan based on the reports, then report back to main agent.
5. Start implementing the fix based the reports and solutions.
6. Use `tester` agent to test the fix and make sure it works, then report back to main agent.
7. Use `code-reviewer` subagent to quickly review the code changes and make sure it meets requirements, then report back to main agent.
8. If there are issues or failed tests, repeat from step 3.
9. After finishing, respond back to user with a summary of the changes and explain everything briefly, guide user to get started and suggest the next steps.
