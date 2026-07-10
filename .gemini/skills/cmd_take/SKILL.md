---
name: cmd_take
description: Take a feature from another project with compare, copy, improve, and port modes
---
# cmd_take

Command Path: /take

Description: Take a feature from another project with compare, copy, improve, and port modes

## Your mission

Take a feature from another project into the current project without blind copy-paste.

<request>
{{args}}
</request>

## Command Contract

`/devkit:take` transfers a feature safely by understanding the source project, the current project, and the assumptions between them before any implementation.

Default mode: `port`.

Canonical command shape:

```text
/devkit:take [mode] <source-repo-or-path> <feature> [local-notes]
```

Modes:
- `compare`: analyze source and local project only. No implementation.
- `copy`: direct copy only when contracts match and user explicitly confirms after risk review.
- `improve`: use source as reference, then implement a better local version.
- `port`: adapt or reimplement in the current stack and architecture.

## Required Gates

1. Read `README.md`, `CLAUDE.md`, and relevant docs/workflows before planning.
2. Analyze skills and commands catalogs. Use `python3 .gemini/scripts/generate_catalogs.py --skills` and `python3 .gemini/scripts/generate_catalogs.py --commands` when available.
3. Identify mode. If omitted, use `port`.
4. If source repo/path or feature destination is unclear, ask concise questions before continuing.
5. Scout source and current project before proposing implementation details.
6. For non-compare modes, create a concrete plan before implementation.
7. Run `/plan:validate` before any implementation.
8. Implement only after validation decisions are resolved.

Mode stop rules:
- `compare`: stop after Recon, Map, Analyze, and Challenge. Report findings and do not create an implementation plan unless the user asks for another mode.
- `copy`: stop after Plan until the user explicitly approves direct copying after seeing risks and rejected alternatives.
- `improve` and `port`: continue to Validate, then Execute only after validation is resolved.

## Recon

Find what the source feature actually does:
- entrypoints, routes, UI screens, commands, background jobs
- source files and module boundaries
- user-visible behavior and acceptance criteria
- tests, fixtures, and setup needed to run it

For GitHub or large source repos, use `repomix` when useful. Prefer focused include patterns over packing irrelevant files.

## Map

Create a transfer map:
- core logic and data flow
- state model, persistence, schema, migrations
- API contracts, auth, permissions, sessions
- config, environment variables, secrets, feature flags
- dependency matrix and version assumptions
- tests and validation commands

Also map current project equivalents. Do not assume names, auth, data models, or conventions match.

## Analyze

Explain why the source implementation works:
- architectural decisions
- implicit contracts
- lifecycle assumptions
- framework/runtime assumptions
- failure and edge-case behavior

Separate reusable ideas from code that is tightly coupled to the source project.

## Challenge

Challenge every transplant risk:
- source auth vs local auth
- source data model vs local data model
- dependency or framework mismatch
- naming and folder convention mismatch
- hidden config or service dependency
- test strategy mismatch
- security, privacy, performance, and maintainability risks

If the source approach creates local debt, prefer `port` or `improve` over `copy`.

## Plan

Create a plan that states:
- chosen mode and reason
- source behavior to preserve
- source implementation parts to reuse, adapt, or reject
- local files likely to change
- tests to add or run
- migration/config/onboarding needs
- known unresolved questions

For `copy`, present risk summary and ask for explicit confirmation before direct copying.

If mode is `compare`, stop here with an analysis report. Do not continue to Validate or Execute.

## Validate

Before implementation, run `/plan:validate` with the created plan. Use the validation answers to update the plan or stop if decisions are unresolved.

Do not treat validation as optional for non-compare modes.

If mode is `copy`, validation does not replace explicit user approval for direct copying.

## Execute

Implement according to local architecture:
- follow local naming, file structure, patterns, and test style
- keep changes scoped to the feature
- add or update real tests
- run compile/typecheck/tests relevant to changed code
- use `code-reviewer` after implementation

Final report must include:
- chosen mode
- source repo/path and feature
- what was reused, adapted, rejected
- tests/checks run
- unresolved questions, if any

## Important Notes

**IMPORTANT:** Analyze the skills catalog and activate the skills that are needed for the task during the process.
**IMPORTANT:** Sacrifice grammar for the sake of concision when writing reports.
**IMPORTANT:** In reports, list any unresolved questions at the end, if any.
**IMPORTANT:** Do not copy code until the source assumptions and local project fit are understood.
