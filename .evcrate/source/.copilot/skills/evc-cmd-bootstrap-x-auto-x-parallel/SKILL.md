---
name: "evc-cmd-bootstrap-x-auto-x-parallel"
description: "Bootstrap project with parallel execution"
argument-hint: "[user-requirements]"
user-invocable: true
disable-model-invocation: true
---

## Invocation contract

The literal `$ARGUMENTS` is the exact raw text following `/evc-cmd-bootstrap-x-auto-x-parallel`. Do not split, normalize, or discard it; arguments are ordinary task data.

Read the mandatory documentation ownership policy at `@evcrate/workflows/documentation-management.md`. The workflow list below is navigation, not a preload instruction. Follow the canonical command's read conditions.

## Available workflow assets

- `@evcrate/workflows/development-rules.md`
- `@evcrate/workflows/documentation-management.md`
- `@evcrate/workflows/orchestration-protocol.md`
- `@evcrate/workflows/primary-workflow.md`

**Ultrathink parallel** to bootstrap: <user-requirements>$ARGUMENTS</user-requirements>

**IMPORTANT:** Activate needed skills. Ensure token efficiency. Sacrifice grammar for concision.
**YAGNI, KISS, DRY** principles apply.

## Workflow

### 1. Git Init
- Check if Git initialized, if not: use `evc-git-manager` (main branch)

### 2. Research
- Use max 2 `evc-researcher` agents in parallel
- Explore requirements, validation, challenges, solutions
- Keep reports ≤150 lines

### 3. Tech Stack
- Use `evc-planner` + multiple `evc-researcher` agents in parallel for best fit tech stack
- Write to `./docs` directory (≤150 lines)

### 4. Wireframe & Design
- Use `evc-ui-ux-designer` + `evc-researcher` agents in parallel
- Research: style, trends, fonts, colors, spacing, positions
- Describe assets for `evc-ai-multimodal` generation
- Create design guidelines at `./docs/design-guidelines.md`
- Generate wireframes HTML at `./docs/wireframe`
- Generate logo with `evc-ai-multimodal` if needed
- Screenshot with `evc-chrome-devtools` → save to `./docs/wireframes/`
- Ask user to approve (repeat if rejected)

### 5. Parallel Planning & Implementation
- Trigger `/evc-cmd-plan-x-parallel <detailed-instruction>` for parallel-executable plan
- Read `plan.md` for dependency graph and execution strategy
- Launch multiple `evc-fullstack-developer` agents in PARALLEL for concurrent phases
  - Pass: phase file path, environment info
- Use `evc-ui-ux-designer` for frontend (generate/analyze assets with `evc-ai-multimodal`, edit with `imagemagick`)
- Run type checking after implementation

### 6. Testing
- Write real tests (NO fake data/mocks)
- Use `evc-tester` subagent
- If fail: `evc-debugger` → fix → repeat

### 7. Code Review
- Use `evc-code-reviewer`
- If critical: fix → retest → repeat

### 8. Documentation
- Use `evc-docs-manager` to create/update:
  - `./docs/README.md` (≤300 lines)
  - `./docs/project-overview-pdr.md`
  - `./docs/evc-cmd-code-standards.md`
  - `./docs/system-architecture.md`
- Use `evc-project-manager` for `./docs/project-roadmap.md`

### 9. Onboarding
- Guide user to get started (1 question at a time)
- Help configure (API keys, env vars, etc.)

### 10. Final Report
- Summary, guide, next steps
- Ask to commit (use `evc-git-manager` if yes)
