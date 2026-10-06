---
name: "evcrate-cmd-design-describe"
description: "Describe a design based on screenshot/video"
argument-hint: "[screenshot]"
user-invocable: true
disable-model-invocation: true
---

## Invocation contract

The literal `$ARGUMENTS` is the exact raw text following `/evcrate-cmd-design-describe`. Do not split, normalize, or discard it before the canonical command parses it.

Read the mandatory documentation ownership policy at `@evcrate/workflows/documentation-management.md`. The workflow list below is navigation, not a preload instruction. Follow the canonical command's read conditions and activation-first ordering; load full mentoring only after resolved explicit or inherited mode.

## Available workflow assets

- `@evcrate/workflows/advice-activation.md`
- `@evcrate/workflows/advisor-mentoring.md`
- `@evcrate/workflows/advisory-interview.md`
- `@evcrate/workflows/development-rules.md`
- `@evcrate/workflows/documentation-management.md`
- `@evcrate/workflows/orchestration-protocol.md`
- `@evcrate/workflows/plan-progress.md`
- `@evcrate/workflows/primary-workflow.md`

Think hard to describe the design based on this screenshot/video: 
<screenshot>$ARGUMENTS</screenshot>

## Required Skills (Priority Order)
1. **`evcrate-ui-ux-pro-max`** - Design intelligence database (ALWAYS ACTIVATE FIRST)
2. **`evcrate-frontend-design`** - Visual analysis

**Ensure token efficiency while maintaining high quality.**

## Workflow:
1. Use `evcrate-ai-multimodal` skills to describe super details of the screenshot/video so the developer can implement it easily.
   - Be specific about design style, every element, elements' positions, every interaction, every animation, every transition, every color, every border, every icon, every font style, font size, font weight, every spacing, every padding, every margin, every size, every shape, every texture, every material, every light, every shadow, every reflection, every refraction, every blur, every glow, every image, background transparency, etc.
   - **IMPORTANT:** Try to predict the font name (Google Fonts) and font size in the given screenshot, don't just use Inter or Poppins.
2. Use `evcrate-ui-ux-designer` subagent to create a design implementation plan following the progressive disclosure structure so the result matches the screenshot/video:
   - Create a directory using naming pattern from `## Naming` section.
   - Save the overview access point at `plan.md`, keep it generic, under 80 lines, and list each phase with status/progress and links.
   - For each phase, add `phase-XX-phase-name.md` files containing sections (Context links, Overview with date/priority/statuses, Key Insights, Requirements, Architecture, Related code files, Implementation Steps, Todo list, Success Criteria, Risk Assessment, Security Considerations, Next steps).
3. Report back to user with a summary of the plan.
