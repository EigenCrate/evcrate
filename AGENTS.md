# AGENTS.md

This file provides shared repository agent guidance. Canonical instruction authority is `.evcrate/source/.claude/AGENTS.md`.

## Role & Responsibilities

Your role is to analyze user requirements, delegate tasks to appropriate sub-agents, and ensure cohesive delivery of features that meet specifications and architectural standards.

## Workflows
- Primary workflow: `./.omp/evcrate/workflows/primary-workflow.md` or `./.claude/workflows/primary-workflow.md` if present; fallback to checked-in `./.evcrate/source/.claude/workflows/primary-workflow.md`
- Development rules: `./.omp/evcrate/workflows/development-rules.md` or `./.claude/workflows/development-rules.md` if present; fallback to checked-in `./.evcrate/source/.claude/workflows/development-rules.md`
- Orchestration protocols: `./.omp/evcrate/workflows/orchestration-protocol.md` or `./.claude/workflows/orchestration-protocol.md` if present; fallback to checked-in `./.evcrate/source/.claude/workflows/orchestration-protocol.md`
- Documentation management: `./.omp/evcrate/workflows/documentation-management.md` or `./.claude/workflows/documentation-management.md` if present; fallback to checked-in `./.evcrate/source/.claude/workflows/documentation-management.md`
- And other workflows: `./.evcrate/source/.claude/workflows/*` (or active harness `./.omp/evcrate/workflows/*`)

Resolve required workflow resources from active harness path (`./.omp/evcrate/workflows/<name>`, published `~/.omp/agent/evcrate/workflows/<name>`, etc.) when present; otherwise fallback to checked-in canonical sources under `./.evcrate/source/.claude/workflows/<name>`. This lookup includes `plan-progress.md` and `advisory-interview.md`. Missing or unreadable required resources stop execution. Workflow navigation is not a read-all instruction; read only workflows required by the current task.

## Subagent Completion Contract

Delegation is synchronous unless a workflow explicitly says otherwise. After spawning or calling a subagent, remain in the parent turn and wait for its terminal response before continuing. Do not start dependent work, edit shared files, mark a step complete, or give a final answer while the subagent is still running.

- For parallel work, state: **spawn N agents, wait for all N terminal results, then synthesize**. Collect one result per requested agent.
- Use the native agent wait/poll operation for the same agent set. **"No agents completed yet" is a non-terminal poll result; wait again.** Do not treat it as a timeout, sleep instead of polling, restart, interrupt, or advance the workflow.
- A polling interval or retry count is not a delegation deadline. Do not invent a wall-clock limit (including 180 seconds) for a blocking gate. Continue polling until a terminal result, explicit user stop, or actual parent-runtime termination.
- A missing, interrupted, timed-out, or partial result is an incomplete gate. Stop and report it; do not continue from partial output or silently restart it.
- For sequential work, invoke one agent, wait for its result, verify its report/artifacts, then pass the verified result to the next agent.
- Every subagent prompt must include its scope, file ownership, required output, and completion/validation signal.
- A spawn acknowledgement, progress event, or changed file is not completion; completion requires the terminal response plus the requested report/artifact and validation status.
- If the parent runtime ends before completion, preserve the agent identity and report the gate as incomplete; never fabricate a result or launch a replacement.

**IMPORTANT:** Analyze the skills catalog and activate the skills that are needed for the task during the process.
**IMPORTANT:** Follow development rules in the active harness (e.g. `./.omp/evcrate/workflows/development-rules.md`) or canonical `./.evcrate/source/.claude/workflows/development-rules.md`.
**IMPORTANT:** Before you plan or proceed any implementation, always read the `./README.md` file first to get context.
**IMPORTANT:** Sacrifice grammar for the sake of concision when writing reports.
**IMPORTANT:** In reports, list any unresolved questions at the end, if any.
**IMPORTANT**: For `YYMMDD` dates, use `bash -c 'date +%y%m%d'` instead of model knowledge. Else, if using PowerShell (Windows), replace command with `Get-Date -UFormat "%y%m%d"`.

## Documentation Management

We keep all important docs in `./docs` folder and keep updating them, structure like below:

```
./docs
├── project-overview-pdr.md
├── code-standards.md
├── codebase-summary.md
├── system-architecture.md
├── project-roadmap.md
├── project-changelog.md
├── project-changelog-archive.md
├── pi-native-migration.md
├── snyk-expert-cli.md
└── upgrade-backup-and-leftover-guidance.md
```

**IMPORTANT:** Read and comply with instructions in the active target instructions (e.g. `./.omp/evcrate/AGENTS.md`, `.claude/rules/AGENTS.md`) or canonical `.evcrate/source/.claude/AGENTS.md`. The WORKFLOWS section is mandatory across all agent harnesses.

**OMP runtime notes:** When running under OMP with `omp --no-skills`, automatic skill activation is disabled: read required migrated `SKILL.md` directly from `./.omp/skills/<skill-name>/SKILL.md` (fallback `~/.omp/agent/skills/<skill-name>/SKILL.md` or `./.omp/evcrate/skills/`). Under standard OMP, use normal skill discovery.
