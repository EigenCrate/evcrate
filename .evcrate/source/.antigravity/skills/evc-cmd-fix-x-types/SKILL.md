---
name: evc-cmd-fix-x-types
description: Fix type errors
---
# evc-cmd-fix-x-types

Command Path: /evc-cmd-fix-x-types

Description: Fix type errors

---
description: "Fix type errors"
---

Run `bun run typecheck` or `tsc` or `npx tsc` and fix all type errors.

## Rules
- Fix all of type errors and repeat the process until there are no more type errors.
- Do not use `any` just to pass the type check.