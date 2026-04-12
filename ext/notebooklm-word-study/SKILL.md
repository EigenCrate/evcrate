---
name: notebooklm-word-study
description: Automate vocabulary research via NotebookLM CLI. Use when studying words/phrases through real-world sources (newspapers, research papers), generating structured word lists with definitions and example sentences, or running iterative research loops to build vocabulary notebooks.
---

# NotebookLM Word Study Skill

Automates vocabulary research: runs iterative web research per word+topic, filters sources, then extracts definitions and example sentences via NotebookLM chat.

## Prerequisites

Install and authenticate notebooklm-py — see [README.md](./README.md).

```bash
notebooklm --version   # verify CLI available
notebooklm auth check  # verify session
```

## Quick Start

```bash
# 1. Create or select notebook
notebooklm create "Word Study: resilience"
notebooklm use <notebook_id>

# 2. Run research rounds (5-6 per word+topic)
notebooklm source add-research "resilience psychology" --mode fast --import-all

# 3. Extract word data
notebooklm ask "Find sentences using 'resilience' in the sources. Provide each sentence and its source." --json

# 4. List sources for verification
notebooklm source list --json
```

## Workflow Modes

| Mode | Description |
|---|---|
| **Auto** | Claude judges source quality by title/URL, imports/removes automatically |
| **Semi-auto** | Claude presents ranked list, user confirms keep/remove via AskUserQuestion |

## Key Commands

| Task | Command |
|---|---|
| List notebooks | `notebooklm list --json` |
| Create notebook | `notebooklm create "title"` |
| Set active notebook | `notebooklm use <id>` |
| Research + import | `notebooklm source add-research "<query>" --import-all` |
| Check research status | `notebooklm research status --json` |
| Wait + import async | `notebooklm research wait --import-all --json` |
| List sources | `notebooklm source list --json` |
| Delete source | `notebooklm source delete <id> -y` |
| Ask / extract | `notebooklm ask "<question>" --json` |

## References

- [CLI Patterns](./references/notebooklm-cli-patterns.md) — detailed command options
- [Workflow](./references/word-study-workflow.md) — step-by-step research loop
- [Output Format](./references/output-format.md) — markdown word list template
