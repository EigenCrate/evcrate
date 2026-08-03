---
name: cmd_plan_archive
description: Write journal entries and archive specific plans or all plans
---
# cmd_plan_archive

Command Path: /plan/archive

Description: Write journal entries and archive specific plans or all plans

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

## Your mission
Read and analyze the plans, then write journal entries and archive specific plans or all plans in the `plans` directory.

## Plan Resolution
1. If `{{args}}` provided → Use that path
2. Else read all plans in the `plans` directory

## Workflow

### Step 1: Read Plan Files

Read the plan directory:
- `plan.md` - Overview and phases list
- `phase-*.md` - 20 first lines of each phase file to understand the progress and status

### Step 2: Summarize the plans and document them with `/journal` slash command
Use `request_user_input` tool to ask if user wants to document journal entries or not.
Skip this step if user selects "No".
If user selects "Yes":
- Analyze the information in previous steps.
- Use subagent workflow with `subagent_type="journal-writer"` in parallel to document all plans.
- Journal entries should be concise and focused on the most important events, key changes, impacts, and decisions.
- Keep journal entries in the `./docs/journals/` directory.

### Step 3: Ask user to confirm the action before archiving these plans
Use `request_user_input` tool to ask if user wants to proceed with archiving these plans, select specific plans to archive or all completed plans only.
Use `request_user_input` tool to ask if user wants to delete permanently or move to the `./plans/archive` directory.

### Step 4: Archive the plans
Start archiving the plans based on the user's choice:
- Move the plans to the `./plans/archive` directory.
- Delete the plans permanently: `rm -rf ./plans/<plan-1> ./plans/<plan-2> ...`

### Step 5: Ask if user wants to commit the changes
Use `request_user_input` tool to ask if user wants to commit the changes with these options:
- Stage and commit the changes (Use `/git/cm` slash command)
- Commit and push the changes (Use `/git/cp` slash command)
- Nah, I'll do it later

## Output
After archiving the plans, provide summary:
- Number of plans archived 
- Number of plans deleted permanently
- Table of plans that are archived or deleted (title, status, created date, LOC)
- Table of journal entries that are created (title, status, created date, LOC)

## Important Notes

**IMPORTANT:** Only ask questions about genuine decision points - don't manufacture artificial choices.
**IMPORTANT:** Sacrifice grammar for the sake of concision when writing outputs.
**IMPORTANT:** In the last summary report, list any unresolved questions at the end, if any.
**IMPORTANT:** Ensure token efficiency while maintaining high quality.
