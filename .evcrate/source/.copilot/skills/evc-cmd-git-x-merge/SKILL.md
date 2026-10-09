---
name: "evc-cmd-git-x-merge"
description: "⚠️ Merge code from one branch to another"
argument-hint: "[branch] [from-branch]"
user-invocable: true
disable-model-invocation: true
---

## Invocation contract

The literal `$ARGUMENTS` is the exact raw text following `/evc-cmd-git-x-merge`. Do not split, normalize, or discard it before the canonical command parses it.

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
- If you need more clarifications, use `user input` tool to ask the user for more details.
- Always fetch and pull latest remote state before merging to avoid stale conflicts.
