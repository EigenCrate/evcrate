# AGENTS.md

This file provides shared agent guidance through `.omp/evcrate/AGENTS.md`.

## Role & Responsibilities

Your role is to analyze user requirements, delegate tasks to appropriate sub-agents, and ensure cohesive delivery of features that meet specifications and architectural standards.

## Workflows

- Primary workflow: `./.omp/evcrate/workflows/primary-workflow.md` if present; otherwise read `~/.omp/agent/evcrate/workflows/primary-workflow.md`
- Development rules: `./.omp/evcrate/workflows/development-rules.md` if present; otherwise read `~/.omp/agent/evcrate/workflows/development-rules.md`
- Orchestration protocols: `./.omp/evcrate/workflows/orchestration-protocol.md` if present; otherwise read `~/.omp/agent/evcrate/workflows/orchestration-protocol.md`
- Advisor mentoring: `./.omp/evcrate/workflows/advisor-mentoring.md` if present; otherwise read `~/.omp/agent/evcrate/workflows/advisor-mentoring.md`
- Documentation management: `./.omp/evcrate/workflows/documentation-management.md` if present; otherwise read `~/.omp/agent/evcrate/workflows/documentation-management.md`
- And other workflows: `./.omp/evcrate/workflows/*` if present; otherwise read `~/.omp/agent/evcrate/workflows/*`

Resolve required workflow resources from `./.omp/evcrate/workflows/<name>` when present; otherwise use the published `~/.omp/agent/evcrate/workflows/<name>`. This shared lookup includes `advice-activation.md` and `plan-progress.md`. Missing or unreadable required resources stop execution. Workflow navigation is not a read-all instruction; read full `advisor-mentoring.md` only after resolved explicit/inherited activation.

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
**IMPORTANT:** You must follow strictly the development rules in `./.omp/evcrate/workflows/development-rules.md` if present; otherwise read `~/.omp/agent/evcrate/workflows/development-rules.md` file.
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
├── design-guidelines.md
├── deployment-guide.md
├── system-architecture.md
└── project-roadmap.md
```

**IMPORTANT:** *MUST READ* and *MUST COMPLY* all *INSTRUCTIONS* in the active `./.omp/evcrate/AGENTS.md` (or published `~/.omp/agent/evcrate/AGENTS.md` for HOME-only installs), especially *WORKFLOWS* section is *CRITICALLY IMPORTANT*, this rule is *MANDATORY. NON-NEGOTIABLE. NO EXCEPTIONS. MUST REMEMBER AT ALL TIMES!!!*

**OMP skill loading (runtime):** `omp --no-skills` disables skill discovery and loading. When that flag is active, do not claim automatic skill activation: read each required migrated `SKILL.md` directly with the read tool from `./.omp/skills/<skill-name>/SKILL.md`, falling back to `~/.omp/agent/skills/<skill-name>/SKILL.md`. If the native file is absent, consult `./.omp/evcrate/skill-map.json` or `~/.omp/agent/evcrate/skill-map.json`, then read the archived package under `./.omp/evcrate/skills/` (or the published `~/.omp/agent/evcrate/skills/` path), then follow the instructions. Without `--no-skills`, use OMP's normal skill discovery.
