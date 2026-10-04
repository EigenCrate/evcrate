---
name: cmd-fix-types
description: Fix type errors
user-invocable: true
disable-model-invocation: true
---

Run `bun run typecheck` or `tsc` or `npx tsc` and fix all type errors.

## Rules
- Fix all of type errors and repeat the process until there are no more type errors.
- Do not use `any` just to pass the type check.
