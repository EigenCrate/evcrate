---
name: cmd_fix_types
description: ⚡ Fix type errors
---
# cmd_fix_types

Command Path: /fix/types

Description: ⚡ Fix type errors

Run `bun run typecheck` or `tsc` or `npx tsc` and fix all type errors.

## Rules
- Fix all of type errors and repeat the process until there are no more type errors.
- Do not use `any` just to pass the type check.