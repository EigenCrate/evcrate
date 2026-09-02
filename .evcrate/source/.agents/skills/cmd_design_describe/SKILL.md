---
name: "cmd-design-describe"
description: "Describe a design based on screenshot/video"
---

# cmd_design_describe

Command Path: /design:describe

Description: Describe a design based on screenshot/video

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
Think hard to describe the design based on this screenshot/video: 
<screenshot>{{args}}</screenshot>

## Required Skills (Priority Order)
1. **`ui-ux-pro-max`** - Design intelligence database (ALWAYS ACTIVATE FIRST)
2. **`frontend-design`** - Visual analysis

**Ensure token efficiency while maintaining high quality.**

## Workflow:
1. Use `ai-multimodal` skills to describe super details of the screenshot/video so the developer can implement it easily.
   - Be specific about design style, every element, elements' positions, every interaction, every animation, every transition, every color, every border, every icon, every font style, font size, font weight, every spacing, every padding, every margin, every size, every shape, every texture, every material, every light, every shadow, every reflection, every refraction, every blur, every glow, every image, background transparency, etc.
   - **IMPORTANT:** Try to predict the font name (Google Fonts) and font size in the given screenshot, don't just use Inter or Poppins.
2. Use `ui-ux-designer` subagent to create a design implementation plan following the progressive disclosure structure so the result matches the screenshot/video:
   - Create a directory using naming pattern from `## Naming` section.
   - Save the overview access point at `plan.md`, keep it generic, under 80 lines, and list each phase with status/progress and links.
   - For each phase, add `phase-XX-phase-name.md` files containing sections (Context links, Overview with date/priority/statuses, Key Insights, Requirements, Architecture, Related code files, Implementation Steps, Todo list, Success Criteria, Risk Assessment, Security Considerations, Next steps).
3. Report back to user with a summary of the plan.
