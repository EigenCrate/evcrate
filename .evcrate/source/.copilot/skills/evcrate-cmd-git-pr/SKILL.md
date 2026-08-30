---
name: "evcrate-cmd-git-pr"
description: "Create a pull request"
argument-hint: "[branch] [from-branch]"
user-invocable: true
disable-model-invocation: true
---

## Invocation contract

The literal `$ARGUMENTS` is the exact raw text following `/evcrate-cmd-git-pr`. Do not split, normalize, or discard it before the canonical command parses it.

Before executing this command, read these EVCrate workflow assets:
- `@evcrate/workflows/advisor-mentoring.md`
- `@evcrate/workflows/advisory-interview.md`
- `@evcrate/workflows/development-rules.md`
- `@evcrate/workflows/documentation-management.md`
- `@evcrate/workflows/orchestration-protocol.md`
- `@evcrate/workflows/primary-workflow.md`

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
