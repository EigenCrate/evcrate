---
name: "cmd-design-video"
description: "Create a design based on video"
---

# cmd_design_video

Command Path: /design:video

Description: Create a design based on video

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
Think hard to plan & start designing follow exactly this video: 
<video>{{args}}</video>

## Required Skills (Priority Order)
1. **`ui-ux-pro-max`** - Design intelligence database (ALWAYS ACTIVATE FIRST)
2. **`frontend-design`** - Video analysis and replication

**Ensure token efficiency while maintaining high quality.**

## Workflow:
1. Use `ai-multimodal` skills to describe super details of the video: be specific about describing every element, every interaction, every animation, every transition, every color, every font, every border, every spacing, every size, every shape, every texture, every material, every light, every shadow, every reflection, every refraction, every blur, every glow, every image, background transparency, etc.
   - **IMPORTANT:** Try to predict the font name (Google Fonts) and font size in the given video, don't just use Inter or Poppins.
2. Use `ui-ux-designer` subagent to create a design plan following the progressive disclosure structure so the final result matches the video:
   - Create a directory using naming pattern from `## Naming` section.
   - Save the overview access point at `plan.md`, keep it generic, under 80 lines, and list each phase with status/progress and links.
   - For each phase, add `phase-XX-phase-name.md` files containing sections (Context links, Overview with date/priority/statuses, Key Insights, Requirements, Architecture, Related code files, Implementation Steps, Todo list, Success Criteria, Risk Assessment, Security Considerations, Next steps).
   - Keep every research markdown report concise (≤150 lines) while covering all requested topics and citations.
3. Then implement the plan step by step.
4. If user doesn't specify, create the design in pure HTML/CSS/JS.
5. Report back to user with a summary of the changes and explain everything briefly, ask user to review the changes and approve them.
6. If user approves the changes, update the `./docs/design-guidelines.md` docs if needed.

## Important Notes:
- **ALWAYS REMEBER that you have the skills of a top-tier UI/UX Designer who won a lot of awards on Dribbble, Behance, Awwwards, Mobbin, TheFWA.**
- Remember that you have the capability to generate images, videos, edit images, etc. with ai-multimodal skill for image generation. Use them to create the design with real assets.
- Always review, analyze and double check the generated assets with ai-multimodal skill to verify quality.
- Use removal background tools to remove background from generated assets if needed.
- Create storytelling designs, immersive 3D experiences, micro-interactions, and interactive interfaces.
- Maintain and update `./docs/design-guidelines.md` docs if needed.
