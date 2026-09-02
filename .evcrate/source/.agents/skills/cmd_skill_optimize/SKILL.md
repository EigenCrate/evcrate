---
name: "cmd-skill-optimize"
description: "Optimize an existing agent skill"
---

# cmd_skill_optimize

Command Path: /skill:optimize

Description: Optimize an existing agent skill

Codex note: when this recipe says to run another `/...` command, invoke the matching `cmd_*` skill for that path.

For high-impact architecture, security, debugging, or review decisions, consider explicit `$advisor-strategy` use for current-session guidance; this pointer does not activate it.

## Subagent Completion Contract

Delegation is blocking by default. The parent agent must wait for each delegated agent's terminal response before starting dependent work, touching shared files, marking a step complete, or replying with a final result.

- Parallel prompt format: **spawn N agents; wait for all N to finish; collect one terminal result from each; then summarize**.
- Wait protocol: use the native agent wait/poll operation for the same agent set. **"No agents completed yet" is a non-terminal poll result; wait again.** Do not treat this as a timeout, sleep instead of polling, restart, interrupt, or advance the workflow.
- A polling interval or retry count is not a delegation deadline. Do not invent a wall-clock limit. Continue polling until a terminal result, explicit user stop, or an actual parent-runtime termination.
- Treat an interrupted, timed-out, missing, or partial result as a failed gate. Do not continue from partial output or silently restart it.
- Sequential prompt format: **run one agent; wait for its terminal response before continuing**.
- Every delegated prompt must define scope, file ownership, expected report, and validation signal.
- A spawn acknowledgement or file change does not mean completion; completion requires the terminal response and requested validation.
Think harder.
Use `skill-creator` and `codex-cli` skills.
Use `docs-seeker` skills to search for documentation if needed.

## Arguments
SKILL: $1 (default: `*`)
PROMPT: $2 (default: empty)

## Your mission
Propose a plan to optimize an existing skill in `.agents/skills/${SKILL}` directory. 
When you finish, ask user to review your plan:
- If the user approve: Write down a plan follow "Output Requirements", then ask user if they want to start implementing.
- If the user reject: Revise the plan or ask more questions to clarify more about the user's request (ask one question at the time), then repeat the review process.

## Additional instructions
<additional-instructions>$PROMPT</additional-instructions>

## Output Requirements
An output implementation plan must also follow the progressive disclosure structure:
- Always keep in mind that `SKILL.md` and reference files should be token consumption efficient, so that **progressive disclosure** can be leveraged at best.
- `SKILL.md` is always short and concise, straight to the point, treat it as a quick reference guide.
- Create a directory using naming pattern from `## Naming` section.
- Save the overview access point at `plan.md`, keep it generic, under 80 lines, and list each phase with status/progress and links.
- For each phase, add `phase-XX-phase-name.md` files containing sections (Context links, Overview with date/priority/statuses, Key Insights, Requirements, Architecture, Related code files, Implementation Steps, Todo list, Success Criteria, Risk Assessment, Security Considerations, Next steps).

**IMPORTANT:**
- Skills are not documentation, they are practical instructions for Codex CLI to use the tools, packages, plugins or APIs to achieve the tasks.
- Each skill teaches Codex how to perform a specific development task, not what a tool does.
- Codex CLI can activate multiple skills automatically to achieve the user's request.
