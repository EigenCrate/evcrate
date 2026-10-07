---
name: "evcrate-cmd-plan-archive"
description: "Write journal entries and archive specific plans or all plans"
argument-hint: "[path-to-plan] (default: all plans)"
user-invocable: true
disable-model-invocation: true
---

## Invocation contract

The literal `$ARGUMENTS` is the exact raw text following `/evcrate-cmd-plan-archive`. Do not split, normalize, or discard it before the canonical command parses it.

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

## Your mission
Read and analyze the plans, then write journal entries and archive specific plans or all plans in the `plans` directory.

## Plan Resolution
1. If `$ARGUMENTS` provided → Use that path
2. Else read all plans in the `plans` directory

## Workflow

### Step 1: Read Plan Files

Read the plan directory:
- `plan.md` - Overview and phases list
- `phase-*.md` - 20 first lines of each phase file to understand the progress and status

Before interpreting completion, apply `Plan progress and phase reconciliation`
in `.copilot/evcrate/workflows/advisor-mentoring.md` regardless of the current mode flag.
For advice-controlled plans, read `progress.md` and reconcile receipts/run scope;
do not infer completion from frozen phase headers. Do not move, delete, rewrite
or stage captured plans/evidence or their immutable receipts: exclude those
plans from the archive candidates and provide read-only links instead. Ordinary
uncaptured plans retain the confirmation and archive behavior below.

### Step 2: Summarize the plans and document them with `/evcrate-cmd-journal` slash command
Use `user input` tool to ask if user wants to document journal entries or not.
Skip this step if user selects "No".
If user selects "Yes":
- Analyze the information in previous steps.
- Use agent tool with `subagent_type="evcrate-journal-writer"` in parallel to document all plans.
- Journal entries should be concise and focused on the most important events, key changes, impacts, and decisions.
- Keep journal entries in the `./docs/journals/` directory.

### Step 3: Ask user to confirm the action before archiving these plans
Use `user input` tool to ask if user wants to proceed with archiving these plans, select specific plans to archive or all completed plans only.
Use `user input` tool to ask if user wants to delete permanently or move to the `./plans/archive` directory.

### Step 4: Archive the plans
Start archiving the plans based on the user's choice:
- Move the plans to the `./plans/archive` directory.
- Delete the plans permanently: `rm -rf ./plans/<plan-1> ./plans/<plan-2> ...`

### Step 5: Ask if user wants to commit the changes
Use `user input` tool to ask if user wants to commit the changes with these options:
- Stage and commit the changes (Use `/evcrate-cmd-git-cm` slash command)
- Commit and push the changes (Use `/evcrate-cmd-git-cp` slash command)
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
