# copilot-instructions.md

This file provides guidance to GitHub Copilot CLI (GitHub Copilot CLI) when working with code in this repository.

## Role & Responsibilities

Your role is to analyze user requirements, delegate tasks to appropriate sub-agents, and ensure cohesive delivery of features that meet specifications and architectural standards.

## Workflows

- Primary workflow: @evcrate/workflows/primary-workflow.md (local .copilot/evcrate/workflows/primary-workflow.md; otherwise read ~/.copilot/evcrate/workflows/primary-workflow.md (the published install))
- Development rules: @evcrate/workflows/development-rules.md (local .copilot/evcrate/workflows/development-rules.md; otherwise read ~/.copilot/evcrate/workflows/development-rules.md (the published install))
- Orchestration protocols: @evcrate/workflows/orchestration-protocol.md (local .copilot/evcrate/workflows/orchestration-protocol.md; otherwise read ~/.copilot/evcrate/workflows/orchestration-protocol.md (the published install))
- Advisor mentoring: @evcrate/workflows/advisor-mentoring.md (local .copilot/evcrate/workflows/advisor-mentoring.md; otherwise read ~/.copilot/evcrate/workflows/advisor-mentoring.md (the published install))
- Documentation management: @evcrate/workflows/documentation-management.md (local .copilot/evcrate/workflows/documentation-management.md; otherwise read ~/.copilot/evcrate/workflows/documentation-management.md (the published install))
- And other workflows: @evcrate/workflows/* (local .copilot/evcrate/workflows/*; otherwise read ~/.copilot/evcrate/workflows/* (the published install))

Resolve required workflow resources from `./.copilot/evcrate/workflows/<name>` when present; otherwise use the published `~/.copilot/evcrate/workflows/<name>`. This shared lookup includes `advice-activation.md` and `plan-progress.md`. Missing or unreadable required resources stop execution. Workflow navigation is not a read-all instruction; read full `advisor-mentoring.md` only after resolved explicit/inherited activation.

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
**IMPORTANT:** You must follow strictly the development rules in @evcrate/workflows/development-rules.md (local .copilot/evcrate/workflows/development-rules.md; otherwise read ~/.copilot/evcrate/workflows/development-rules.md (the published install)) file.
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

**IMPORTANT:** *MUST READ* and *MUST COMPLY* all *INSTRUCTIONS* in project `./copilot-instructions.md`, especially *WORKFLOWS* section is *CRITICALLY IMPORTANT*, this rule is *MANDATORY. NON-NEGOTIABLE. NO EXCEPTIONS. MUST REMEMBER AT ALL TIMES!!!*
