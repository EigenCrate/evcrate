---
name: "evcrate-cmd-skill-fix-logs"
description: "Fix the agent skill based on `logs.txt` file."
argument-hint: "[prompt-or-path-to-skill]"
user-invocable: true
disable-model-invocation: true
---

## Invocation contract

The literal `$ARGUMENTS` is the exact raw text following `/evcrate-cmd-skill-fix-logs`. Do not split, normalize, or discard it before the canonical command parses it.

Before executing this command, read these EVCrate workflow assets:
- `@evcrate/workflows/advisor-mentoring.md`
- `@evcrate/workflows/advisory-interview.md`
- `@evcrate/workflows/development-rules.md`
- `@evcrate/workflows/documentation-management.md`
- `@evcrate/workflows/orchestration-protocol.md`
- `@evcrate/workflows/primary-workflow.md`

Think harder.
Use `skill-creator` and `evcrate-copilot-cli` skills.
Use `evcrate-docs-seeker` skills to search for documentation if needed.

## Your mission
Fix the agent skill based on the current `logs.txt` file (in the project root directory).

## Requirements
<user-prompt>$ARGUMENTS</user-prompt>

## Rules of Skill Fixing:
Base on the requirements:
- If you're given nothing, use `user input` tool for clarifications and `evcrate-researcher` subagent to research about the topic.
- If you're given an URL, it's documentation page, use `Explorer` subagent to explore every internal link and report back to main agent, don't skip any link.
- If you receive a lot of URLs, use multiple `Explorer` subagents to explore them in parallel, then report back to main agent.
- If you receive a lot of files, use multiple `Explorer` subagents to explore them in parallel, then report back to main agent.
- If you're given a Github URL, use [`evcrate-repomix`](https://repomix.com/guide/usage) command to summarize ([install it](https://repomix.com/guide/installation) if needed) and spawn multiple `Explorer` subagents to explore it in parallel, then report back to main agent.
