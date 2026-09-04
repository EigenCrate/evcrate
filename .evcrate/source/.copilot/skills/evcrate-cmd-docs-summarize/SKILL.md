---
name: "evcrate-cmd-docs-summarize"
description: "Analyze the codebase and update documentation"
argument-hint: "[focused-topics] [should-scan-codebase]"
user-invocable: true
disable-model-invocation: true
---

## Invocation contract

The literal `$ARGUMENTS` is the exact raw text following `/evcrate-cmd-docs-summarize`. Do not split, normalize, or discard it before the canonical command parses it.

Before executing this command, read these EVCrate workflow assets:
- `@evcrate/workflows/advisor-mentoring.md`
- `@evcrate/workflows/advisory-interview.md`
- `@evcrate/workflows/development-rules.md`
- `@evcrate/workflows/documentation-management.md`
- `@evcrate/workflows/orchestration-protocol.md`
- `@evcrate/workflows/primary-workflow.md`

Use `evcrate-docs-manager` agent to analyze the codebase based on `docs/codebase-summary.md` and respond with a summary report.

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
