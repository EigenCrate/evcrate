---
name: "cmd-git-merge"
description: "⚠️ Merge code from one branch to another"
---

# cmd_git_merge

Command Path: /git/merge

Description: ⚠️ Merge code from one branch to another

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

## Variables

TO_BRANCH: $1 (defaults to `main`)
FROM_BRANCH: $2 (defaults to current branch)

## Workflow

### Step 1: Sync with remote (CRITICAL)
```bash
git fetch origin
git checkout {TO_BRANCH}
git pull origin {TO_BRANCH}
```

### Step 2: Merge from REMOTE tracking branch
```bash
# Use origin/{FROM_BRANCH} to merge remote state, not local WIP
git merge origin/{FROM_BRANCH} --no-ff -m "merge: {FROM_BRANCH} into {TO_BRANCH}"
```

**Why `origin/{FROM_BRANCH}`:** Ensures merging only committed+pushed changes, not local uncommitted work.

### Step 3: Resolve conflicts if any
- If conflicts exist, resolve them manually
- After resolution: `git add . && git commit`

### Step 4: Push merged result
```bash
git push origin {TO_BRANCH}
```

## Notes
- If `gh` command is not available, instruct the user to install and authorize GitHub CLI first.
- If you need more clarifications, use `request_user_input` tool to ask the user for more details.
- Always fetch and pull latest remote state before merging to avoid stale conflicts.
