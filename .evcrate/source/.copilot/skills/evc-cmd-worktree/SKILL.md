---
name: "evc-cmd-worktree"
description: "Create isolated git worktree for parallel development"
argument-hint: "[feature-description] OR [project] [feature] (monorepo) [--base <branch>] [--plan <path>]"
user-invocable: true
disable-model-invocation: true
---

## Invocation contract

The literal `$ARGUMENTS` is the exact raw text following `/evc-cmd-worktree`. Do not split, normalize, or discard it before the canonical command parses it.

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

Create an isolated git worktree for parallel feature development.

## Workflow

### Step 1: Get Repository Info

```bash
node .copilot/evcrate/scripts/worktree.cjs info --json
```

**Response fields:**
- `repoType`: "monorepo" or "standalone"
- `baseBranch`: detected base branch
- `projects`: array of {name, path} for monorepo
- `envFiles`: array of .env* files found
- `dirtyState`: boolean

### Step 2: Gather Info via user input

**Detect branch prefix from user's description:**
- Keywords "fix", "bug", "error", "issue" → prefix = `fix`
- Keywords "refactor", "restructure", "rewrite" → prefix = `refactor`
- Keywords "docs", "documentation", "readme" → prefix = `docs`
- Keywords "test", "spec", "coverage" → prefix = `test`
- Keywords "chore", "cleanup", "deps" → prefix = `chore`
- Keywords "perf", "performance", "optimize" → prefix = `perf`
- Everything else → prefix = `feat`

**For MONOREPO:** Use user input if project not specified:
```javascript
// If user said "/evc-cmd-worktree add auth" but multiple projects exist
user input({
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
user input({
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
node .copilot/evcrate/scripts/worktree.cjs create "<PROJECT>" "<SLUG>" --prefix <TYPE> --env "<FILES>"
```

**Standalone:**
```bash
node .copilot/evcrate/scripts/worktree.cjs create "<SLUG>" --prefix <TYPE> --env "<FILES>"
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
| `MULTIPLE_PROJECTS_MATCH` | Ambiguous project name | Use user input |
| `MULTIPLE_WORKTREES_MATCH` | Ambiguous worktree for remove | Use user input |
| `BRANCH_CHECKED_OUT` | Branch in use elsewhere | Suggest different name |
| `WORKTREE_EXISTS` | Path already exists | Suggest use or remove |
| `WORKTREE_CREATE_FAILED` | Git command failed | Show git error |
| `WORKTREE_REMOVE_FAILED` | Cannot remove worktree | Check uncommitted changes |

## Example Session

```
User: /evc-cmd-worktree fix the login validation bug

Claude: [Runs: node .copilot/evcrate/scripts/worktree.cjs info --json]
        [Detects: standalone repo, envFiles: [".env.example"]]
        [Detects prefix from "fix" keyword: fix]
        [Converts slug: "login-validation-bug"]

Claude: [Uses user input for env files]
        "Which environment files should be copied?"
        Options: .env.example

User: .env.example

Claude: [Runs: node .copilot/evcrate/scripts/worktree.cjs create "login-validation-bug" --prefix fix --env ".env.example"]

Output: Worktree created at ../worktrees/myrepo-login-validation-bug
        Branch: fix/login-validation-bug
```
