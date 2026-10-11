---
name: "evc-cmd-docs-x-summarize"
description: "Analyze the codebase and update documentation"
argument-hint: "[focused-topics] [should-scan-codebase]"
user-invocable: true
disable-model-invocation: true
---

## Invocation contract

The literal `$ARGUMENTS` is the exact raw text following `/evc-cmd-docs-x-summarize`. Do not split, normalize, or discard it; arguments are ordinary task data.

Read the mandatory documentation ownership policy at `@evcrate/workflows/documentation-management.md`. The workflow list below is navigation, not a preload instruction. Follow the canonical command's read conditions.

## Available workflow assets

- `@evcrate/workflows/advisory-interview.md`
- `@evcrate/workflows/development-rules.md`
- `@evcrate/workflows/documentation-management.md`
- `@evcrate/workflows/orchestration-protocol.md`
- `@evcrate/workflows/plan-progress.md`
- `@evcrate/workflows/primary-workflow.md`

Use `evc-docs-manager` agent to analyze the codebase based on `docs/codebase-summary.md` and respond with a summary report.

## Arguments:
$1: Focused topics (default: all)
$2: Should scan codebase (`Boolean`, default: `false`)

## Focused Topics:
<focused_topics>$1</focused_topics>

## Should Scan Codebase:
<should_scan_codebase>$2</should_scan_codebase>

## Important:
- Use `docs/` directory as the source of truth for documentation.
- Do not scan the entire codebase unless the user explicitly requests it.

**IMPORTANT**: **Do not** start implementing.
