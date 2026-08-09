---
name: "cmd-git-pr"
description: "Create a pull request"
---

# cmd_git_pr

Command Path: /git:pr

Description: Create a pull request

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

### Step 1: Ensure remote is synced
```bash
git fetch origin
git push -u origin HEAD  # Push current branch if not pushed
```

### Step 2: Analyze REMOTE diff (CRITICAL)
**IMPORTANT:** Always compare REMOTE branches, not local:
```bash
# Get commits between remote branches (what PR will actually contain)
git log origin/{TO_BRANCH}...origin/{FROM_BRANCH} --oneline

# Get file diff between remote branches
git diff origin/{TO_BRANCH}...origin/{FROM_BRANCH} --stat
git diff origin/{TO_BRANCH}...origin/{FROM_BRANCH}
```

**DO NOT use:**
- `git diff {TO_BRANCH}...HEAD` (includes unpushed local changes)
- `git diff --cached` (staged local changes)
- `git status` (local working tree state)

**IMPORTANT:** Merge `main` (or default branch) into $2 branch and resolve any conflicts.

### Step 3: Generate PR content from remote diff
Based on the REMOTE diff analysis:
- **Title:** Conventional commit format from the primary change (no version/release numbers)
- **Body:** Summary of changes that exist ON REMOTE, not local WIP

### Step 4: Create PR
```bash
gh pr create --base {TO_BRANCH} --head {FROM_BRANCH} --title "..." --body "..."
```

## Notes
- If `gh` command is not available, instruct the user to install and authorize GitHub CLI first.
- If local has unpushed commits, push first before analyzing diff.
- PR content must reflect REMOTE state since PRs are based on remote branches.
