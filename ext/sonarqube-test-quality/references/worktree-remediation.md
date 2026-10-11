# Optional Worktree Remediation

Worktree isolation is optional and opt-in only. Default review and remediation operate in the requested existing checkout. Load this procedure only when the user explicitly requests an isolated worktree.

## Decision Table

| Mode | Condition | Action |
|---|---|---|
| Default / Off | No explicit worktree request (dirty files or existing metadata are not opt-in) | Operate in active checkout. Preserve unrelated edits; pause on conflicting target edits. Do not create branches or worktrees. |
| Incomplete Opt-In | Opt-in requested, but user omitted branch name, destination path, or both | Stop immediately. Prompt user for exact missing input(s). Never auto-generate branch name, suffix, sibling directory, or substitute path. Create nothing while incomplete. |
| Complete Opt-In | User explicitly supplied both exact branch name and destination path | Validate inputs and collisions. Create worktree at literal user path anchored to source SHA. Confine edits and tests to fix tree. |

## Isolation Boundaries and Invariants

- **Shared Refs and Services**: Worktrees share `.git` refs, remotes, tags, host processes, ports, and Sonar credentials. Working directory and index are isolated, not OS or network environments.
- **No Transferred Authorization**: Source branch push-to-scan or CI authorizations never apply to a fix branch or worktree. Pushing requires explicit destination remote and branch approval.
- **No Implicit Actions**: Never auto-commit, merge into source, set upstream tracking (`-u`), or auto-remove worktrees.

## Opt-In Setup Procedure

Execute only when the user explicitly opts in and provides both branch name and destination path:

```bash
SOURCE_ROOT="$(git rev-parse --show-toplevel)"
SOURCE_BRANCH="$(git branch --show-current)"
SOURCE_SHA="$(git rev-parse HEAD)"

# 1. Parameter guards: bind explicit user inputs (no derivation from HEAD)
: "${FIX_BRANCH:?Error: FIX_BRANCH must be explicitly supplied by user}"
: "${FIX_PATH:?Error: FIX_PATH must be explicitly supplied by user}"
if test -e "$FIX_PATH" || test -L "$FIX_PATH"; then
  echo "Error: Target path '$FIX_PATH' already exists"; exit 1
fi
TARGET_PATH="$(realpath -m "$FIX_PATH")"

# 2. Collision and nesting validation: stop without selecting alternatives
git check-ref-format --branch "$FIX_BRANCH" >/dev/null || {
  echo "Error: Invalid branch name '$FIX_BRANCH'"; exit 1;
}
git rev-parse --verify --quiet "refs/heads/$FIX_BRANCH" && {
  echo "Error: Branch '$FIX_BRANCH' already exists"; exit 1;
}
if test -e "$TARGET_PATH" || test -L "$TARGET_PATH"; then
  echo "Error: Target path '$TARGET_PATH' already exists"; exit 1;
fi

case "$TARGET_PATH" in
  "$SOURCE_ROOT"|"$SOURCE_ROOT"/*)
    echo "Error: Target path cannot overwrite or nest inside active checkout: $SOURCE_ROOT"; exit 1 ;;
esac

while IFS= read -r -d '' record; do
  case "$record" in
    "worktree "*)
      wt="$(realpath -m "${record#worktree }")"
      case "$TARGET_PATH" in
        "$wt"|"$wt"/*) echo "Error: Target path nests inside existing worktree: $wt"; exit 1 ;;
      esac
      case "$wt" in
        "$TARGET_PATH"/*) echo "Error: Existing worktree nests inside target path: $wt"; exit 1 ;;
      esac
      ;;
  esac
done < <(git worktree list --porcelain -z)

# 3. Create worktree using exact user values from recorded source SHA
git worktree add -b "$FIX_BRANCH" "$TARGET_PATH" "$SOURCE_SHA" || {
  echo "Error: Failed to create worktree"; exit 1;
}

# 4. Verify CWD and context
cd "$TARGET_PATH" || {
  echo "Error: Failed to change directory to '$TARGET_PATH'"; exit 1;
}
test "$(git rev-parse --show-toplevel)" = "$(pwd -P)" || { echo "Directory mismatch"; exit 1; }
test "$(git branch --show-current)" = "$FIX_BRANCH" || { echo "Branch mismatch"; exit 1; }
```

## Execution and Cleanup Boundaries

- **Execution Confinement**: Make all code edits, Maven builds, and test runs inside `$TARGET_PATH`. Retain the requested source Sonar selector (`projectKey:<key>, branch:<branch>` or `PR:<id>`); do not query the fix branch as original source.
- **Target Conflicts**: Pause for user direction if uncommitted source changes touch files requiring remediation.
- **Safe Cleanup**: Retain worktree by default for user review. Remove only after delivery upon explicit user authorization:
```bash
git -C "$SOURCE_ROOT" worktree remove "$TARGET_PATH"
```
