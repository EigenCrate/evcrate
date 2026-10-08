---
name: "cmd-worktree"
description: "Create isolated git worktree for parallel development"
---

# cmd_worktree

Command Path: /worktree

Description: Create isolated git worktree for parallel development

Codex note: when this recipe says to run another `/...` command, invoke the matching `cmd_*` skill for that path.

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
Create an isolated git worktree for parallel feature development.

## Workflow

### Step 1: Get Repository Info

```bash
node .codex/scripts/worktree.cjs info --json
```

**Response fields:**
- `repoType`: "monorepo" or "standalone"
- `baseBranch`: detected base branch
- `projects`: array of {name, path} for monorepo
- `envFiles`: array of .env* files found
- `dirtyState`: boolean

### Step 2: Gather Info via request_user_input

**Detect branch prefix from user's description:**
- Keywords "fix", "bug", "error", "issue" → prefix = `fix`
- Keywords "refactor", "restructure", "rewrite" → prefix = `refactor`
- Keywords "docs", "documentation", "readme" → prefix = `docs`
- Keywords "test", "spec", "coverage" → prefix = `test`
- Keywords "chore", "cleanup", "deps" → prefix = `chore`
- Keywords "perf", "performance", "optimize" → prefix = `perf`
- Everything else → prefix = `feat`

**For MONOREPO:** Use request_user_input if project not specified:
```javascript
// If user said "/worktree add auth" but multiple projects exist
request_user_input({
  questions: [{
    header: "Project",
    question: "Which project should the worktree be created for?",
    options: projects.map(p => ({ label: p.name, description: p.path })),
    multiSelect: false
  }]
})
```

**For env files:** Always ask which to copy:
```javascript
request_user_input({
  questions: [{
    header: "Env files",
    question: "Which environment files should be copied to the worktree?",
    options: envFiles.map(f => ({ label: f, description: "Copy to worktree" })),
    multiSelect: true
  }]
})
```

### Step 3: Convert Description to Slug

- "add authentication system" → `add-auth`
- "fix login bug" → `login-bug`
- Remove filler words, kebab-case, max 50 chars

### Step 4: Execute Command

**Monorepo:**
```bash
node .codex/scripts/worktree.cjs create "<PROJECT>" "<SLUG>" --prefix <TYPE> --env "<FILES>"
```

**Standalone:**
```bash
node .codex/scripts/worktree.cjs create "<SLUG>" --prefix <TYPE> --env "<FILES>"
```

**Options:**
- `--base` - Base branch to branch off from (e.g. main, develop)
- `--prefix` - Branch type: feat|fix|refactor|docs|test|chore|perf
- `--env` - Comma-separated .env files to copy
- `--plan` - Plan directory or file to copy (auto-detected if omitted)
- `--no-plan` - Disable automatic plan directory copying
- `--json` - Output JSON for parsing
- `--dry-run` - Preview without executing
## Commands

| Command | Usage | Description |
|---------|-------|-------------|
| `create` | `create [project] <feature>` | Create new worktree |
| `remove` | `remove <name-or-path>` | Remove worktree and branch |
| `info` | `info` | Get repo info |
| `list` | `list` | List existing worktrees |

## Error Codes

| Code | Meaning | Action |
|------|---------|--------|
| `MISSING_ARGS` | Missing project/feature for monorepo | Ask for both |
| `MISSING_FEATURE` | No feature name (standalone) | Ask for feature |
| `PROJECT_NOT_FOUND` | Project not in .gitmodules | Show available projects |
| `MULTIPLE_PROJECTS_MATCH` | Ambiguous project name | Use request_user_input |
| `MULTIPLE_WORKTREES_MATCH` | Ambiguous worktree for remove | Use request_user_input |
| `BRANCH_CHECKED_OUT` | Branch in use elsewhere | Suggest different name |
| `WORKTREE_EXISTS` | Path already exists | Suggest use or remove |
| `WORKTREE_CREATE_FAILED` | Git command failed | Show git error |
| `WORKTREE_REMOVE_FAILED` | Cannot remove worktree | Check uncommitted changes |

## Example Session

```
User: /worktree fix the login validation bug

Codex: [Runs: node .codex/scripts/worktree.cjs info --json]
        [Detects: standalone repo, envFiles: [".env.example"]]
        [Detects prefix from "fix" keyword: fix]
        [Converts slug: "login-validation-bug"]

Codex: [Uses request_user_input for env files]
        "Which environment files should be copied?"
        Options: .env.example

User: .env.example

Codex: [Runs: node .codex/scripts/worktree.cjs create "login-validation-bug" --prefix fix --env ".env.example"]

Output: Worktree created at ../worktrees/myrepo-login-validation-bug
        Branch: fix/login-validation-bug
```
