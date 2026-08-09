---
name: "cmd-skill-plan"
description: "Plan to create a new agent skill"
---

# cmd_skill_plan

Command Path: /skill:plan

Description: Plan to create a new agent skill

Codex note: when this recipe says to run another `/...` command, invoke the matching `cmd_*` skill for that path.

For high-impact architecture, security, debugging, or review decisions, consider explicit `$advisor-strategy` use for current-session guidance; this pointer does not activate it.

## Subagent Completion Contract

Delegation is blocking by default. The parent agent must wait for each delegated agent's terminal response before starting dependent work, touching shared files, marking a step complete, or replying with a final result.

- Parallel prompt format: **spawn N agents; wait for all N to finish; collect one terminal result from each; then summarize**.
- Wait protocol: use the native agent wait/poll operation for the same agent set. **"No agents completed yet" is a non-terminal poll result; wait again.** Do not treat it as a timeout, sleep instead of polling, restart, interrupt, or advance the workflow.
- A polling interval or retry count is not a delegation deadline. Do not invent a wall-clock limit (including 180 seconds) for a blocking gate. Continue polling until a terminal result, explicit user stop, or an actual parent-runtime termination.
- Treat an interrupted, timed-out, missing, or partial result as a failed gate. Do not continue from partial work or silently skip/restart the agent.
- Sequential prompt format: **run one agent; wait for its terminal result; verify the report/artifacts; then run the next agent**.
- Every delegated prompt must define scope, file ownership, expected report/artifact, and validation signal.
- A spawn acknowledgement, progress event, or file change does not mean the agent completed. Completion requires the terminal response and requested validation.
- If the parent runtime ends before completion, preserve the agent identity and report the gate as incomplete; never fabricate a result or launch a replacement.

Think harder.
First: Activate `skill-creator` and `codex-cli` skills.
Use `docs-seeker` skills to search for documentation if needed.
Employ `sequential-thinking` or `problem-solving` skills for complex problem-solving that requires structured analysis
Finally, when creating a plan, activate `planning` skill.

## Arguments
SKILL: $1 (default: `*`)
PROMPT: $2 (default: empty)

## Your mission
Propose a plan to create a new skill in `.agents/skills/${SKILL}` directory. 
When you finish, ask user to review your plan:
- If the user approve: Write down a plan follow "Output Requirements", then ask user if they want to start implementing.
- If the user reject: Revise the plan or ask more questions to clarify more about the user's request (ask one question at the time), then repeat the review process.

## Additional instructions
<additional-instructions>$PROMPT</additional-instructions>

## Your Approach
1. **Question Everything**: Ask probing questions to fully understand the user's request, constraints, and true objectives. Don't assume - clarify until you're 100% certain.
2. **Brutal Honesty**: Provide frank, unfiltered feedback about ideas. If something is unrealistic, over-engineered, or likely to cause problems, say so directly. Your job is to prevent costly mistakes.
3. **Explore Alternatives**: Always consider multiple approaches. Present 2-3 viable solutions with clear pros/cons, explaining why one might be superior.
4. **Challenge Assumptions**: Question the user's initial approach. Often the best solution is different from what was originally envisioned.
5. **Consider All Stakeholders**: Evaluate impact on end users, developers, operations team, and business objectives.

## Output Requirements
An output implementation plan must also follow the progressive disclosure structure:
- Always keep in mind that `SKILL.md` and reference files should be token consumption efficient, so that **progressive disclosure** can be leveraged at best.
- `SKILL.md` is always short and concise, straight to the point, treat it as a quick reference guide.
- Create a directory using naming pattern from `## Naming` section.
- Save the overview access point at `plan.md`, keep it generic, under 80 lines, and list each phase with status/progress and links.
- For each phase, add `phase-XX-phase-name.md` files containing sections (Context links, Overview with date/priority/statuses, Key Insights, Requirements, Architecture, Related code files, Implementation Steps, Todo list, Success Criteria, Risk Assessment, Security Considerations, Next steps).

**IMPORTANT:**
- Analyze the given task and use `request_user_input` tool to ask for more details if needed.
- Ensure token consumption efficiency while maintaining high quality.
- Skills are not documentation, they are practical instructions for Codex CLI to use the tools, packages, plugins or APIs to achieve the tasks.
- Each skill teaches Codex how to perform a specific development task, not what a tool does.
- Codex CLI can activate multiple skills automatically to achieve the user's request.
