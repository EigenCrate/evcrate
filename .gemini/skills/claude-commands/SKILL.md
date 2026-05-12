---
name: claude-commands
description: "Use when the user asks to run, inspect, or adapt a migrated Claude Code slash command such as /code, /plan, /fix, /test, /docs, /design, /git, /scout, /skill, /cook, or /bootstrap in Gemini CLI."
---

# Claude Commands

Use `references/commands/` as reusable prompt recipes for migrated Claude Code commands.
Gemini CLI already exposes native slash commands from `.gemini/commands`, so keep using
those for direct execution. Use this skill when you need the command semantics as a
reference workflow, when adapting a Claude command to Gemini, or when another agent needs
the command instructions as skill context instead of invoking a slash command directly.

When the user asks for a migrated Claude command, or explicitly mentions this skill with a
command name:
1. Read `references/workflows/development-rules.md`, `references/workflows/orchestration-protocol.md`, `references/workflows/primary-workflow.md`, and `references/workflows/documentation-management.md` as the governing workflow context.
2. Map the requested command path to `references/commands/<command>.md`.
3. Read that command reference file.
4. Substitute any user arguments for `{{args}}`.
5. Either invoke the equivalent native Gemini slash command from `.gemini/commands`, or execute the command intent directly by following the reference instructions.

Invocation examples:
- `Use claude-commands to inspect /plan`
- `Use claude-commands to adapt /fix/test to Gemini`
- `Use claude-commands as reference for /docs/update`

## Available Commands

- `/ask`: Answer technical and architectural questions.
- `/bootstrap/auto/fast`:  Quickly bootstrap a new project automatically
- `/bootstrap/auto/parallel`:  Bootstrap project with parallel execution
- `/bootstrap/auto`: Bootstrap a new project automatically
- `/bootstrap`:  Bootstrap a new project step by step
- `/brainstorm`: Brainstorm a feature
- `/code/auto`:  [AUTO] Start coding & testing an existing plan ("trust me bro")
- `/code/no-test`: Start coding an existing plan (no testing)
- `/code/parallel`: Execute parallel or sequential phases based on plan structure
- `/code`:  Start coding & testing an existing plan
- `/coding-level`: Migrated Claude command
- `/content/cro`: Analyze the current content and optimize for conversion
- `/content/enhance`: Analyze the current copy issues and enhance it
- `/content/fast`: Write creative & smart copy [FAST]
- `/content/good`: Write good creative & smart copy [GOOD]
- `/cook/auto/fast`: No research. Only scout, plan & implement ["trust me bro"]
- `/cook/auto/parallel`:  Plan parallel phases & execute with fullstack-developer agents
- `/cook/auto`: Implement a feature automatically ("trust me bro")
- `/cook`:  Implement a feature [step by step]
- `/debug`: Debugging technical issues and providing solutions.
- `/design/3d`: Create immersive interactive 3D designs with Three.js
- `/design/describe`: Describe a design based on screenshot/video
- `/design/fast`: Create a quick design
- `/design/good`: Create an immersive design
- `/design/screenshot`: Create a design based on screenshot
- `/design/video`: Create a design based on video
- `/docs/init`:   Analyze the codebase and create initial documentation
- `/docs/summarize`: Analyze the codebase and update documentation
- `/docs/update`:  Analyze the codebase and update documentation
- `/fix/ci`: Analyze Github Actions logs and fix issues
- `/fix/fast`: Analyze and fix small issues [FAST]
- `/fix/hard`:  Use subagents to plan and fix hard issues
- `/fix/logs`: Analyze logs and fix issues
- `/fix/parallel`: Analyze & fix issues with parallel fullstack-developer agents
- `/fix/test`: Run test suite and fix issues
- `/fix/types`: Fix type errors
- `/fix/ui`: Analyze and fix UI issues
- `/fix`: Analyze and fix issues [INTELLIGENT ROUTING]
- `/git/cm`: Stage all files and create a commit.
- `/git/cp`: Stage, commit and push all code in the current branch
- `/git/merge`: ⚠️ Merge code from one branch to another
- `/git/pr`: Create a pull request
- `/integrate/polar`: Implement payment integration with Polar.sh
- `/integrate/sepay`: Implement payment integration with SePay.vn
- `/journal`: Write some journal entries.
- `/plan/archive`: Write journal entries and archive specific plans or all plans
- `/plan/ci`: Analyze Github Actions logs and provide a plan to fix the issues
- `/plan/cro`: Create a CRO plan for the given content
- `/plan/fast`: No research. Only analyze and create an implementation plan
- `/plan/hard`:  Research, analyze, and create an implementation plan
- `/plan/parallel`:  Create detailed plan with parallel-executable phases
- `/plan/two`:   Research & create an implementation plan with 2 approaches
- `/plan/validate`: Validate plan with critical questions interview
- `/plan`:  Intelligent plan creation with prompt enhancement
- `/preview`: Path to file or directory to preview
- `/review/codebase/parallel`:  Ultrathink edge cases, then parallel verify with code-reviewers
- `/review/codebase`:  Scan & analyze the codebase.
- `/scout/ext`: Use external agentic tools to scout given directories
- `/scout`: Scout given directories to respond to the user's requests
- `/skill/add`: Add new reference files or scripts to a skill
- `/skill/create`: Create a new agent skill
- `/skill/fix-logs`: Fix the agent skill based on `logs.txt` file.
- `/skill/optimize/auto`: Optimize an existing agent skill [auto]
- `/skill/optimize`: Optimize an existing agent skill
- `/skill/plan`: Plan to create a new agent skill
- `/test/ui`: Run UI tests on a website & generate a detailed report.
- `/test`: Run tests locally and analyze the summary report.
- `/use-mcp`: Utilize tools of Model Context Protocol (MCP) servers
- `/watzup`: Review recent changes and wrap up the work
- `/worktree`: Create isolated git worktree for parallel development
