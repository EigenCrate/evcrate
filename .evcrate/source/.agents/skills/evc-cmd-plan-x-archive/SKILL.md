---
name: "evc-cmd-plan-x-archive"
description: "Write journal entries and archive specific plans or all plans"
---

# evc-cmd-plan-x-archive

Command Path: $evc-cmd-plan-x-archive

Description: Write journal entries and archive specific plans or all plans

Codex note: when this recipe says to run another `$evc-cmd-…` command, invoke the matching `evc-cmd-*` skill for that path.

For high-impact architecture, security, debugging, or review decisions, consider explicit `$advisor-strategy` use for current-session guidance; this pointer does not activate it.

## Subagent Completion Contract

Delegation is blocking by default. The parent agent must wait for each delegated agent's terminal response before starting dependent work, touching shared files, marking a step complete, or replying with a final result.

- Parallel prompt format: **spawn N agents; wait for all N to finish; collect one terminal result from each; then summarize**.
- Wait protocol: use the native agent wait/poll operation for the same agent set. **"No agents completed yet" is a non-terminal poll result; wait again.** Do not treat this as a timeout, sleep instead of polling, restart, interrupt, or advance the workflow.
- A polling interval or retry count is not a delegation deadline. Do not invent a wall-clock limit. Continue polling until a terminal result, explicit user stop, or an actual parent-runtime termination.
- Treat an interrupted, timed-out, missing, or partial result as a failed gate. Do not continue from partial output or silently restart it.
- Sequential prompt format: **run one agent; wait for its terminal response before continuing**.
- Every delegated prompt must define scope, file ownership, expected report, and validation signal.
- A spawn acknowledgement or file change does not mean completion; completion requires the terminal response and requested validation.
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

Before interpreting completion, apply `Plan progress and phase reconciliation`
in `.codex/workflows/advisor-mentoring.md` if present; otherwise read `~/.codex/workflows/advisor-mentoring.md` (the published install) regardless of the current mode flag.
For advice-controlled plans, read `progress.md` and reconcile receipts/run scope;
do not infer completion from frozen phase headers. Do not move, delete, rewrite
or stage captured plans/evidence or their immutable receipts: exclude those
plans from the archive candidates and provide read-only links instead. Ordinary
uncaptured plans retain the confirmation and archive behavior below.

### Step 2: Summarize the plans and document them with `$evc-cmd-journal` slash command
Use `request_user_input` tool to ask if user wants to document journal entries or not.
Skip this step if user selects "No".
If user selects "Yes":
- Analyze the information in previous steps.
- Use subagent workflow with `subagent_type="evc-journal-writer"` in parallel to document all plans.
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
- Stage and commit the changes (Use `$evc-cmd-git-x-cm` slash command)
- Commit and push the changes (Use `$evc-cmd-git-x-cp` slash command)
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
