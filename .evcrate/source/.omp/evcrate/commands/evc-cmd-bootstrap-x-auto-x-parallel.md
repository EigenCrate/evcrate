---
argument-hint: "[user-requirements]"
description: "Bootstrap project with parallel execution"
---


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
- Describe assets for `ai-multimodal` generation
- Create design guidelines at `./docs/design-guidelines.md`
- Generate wireframes HTML at `./docs/wireframe`
- Generate logo with `ai-multimodal` if needed
- Screenshot with `chrome-devtools` → save to `./docs/wireframes/`
- Ask user to approve (repeat if rejected)

### 5. Parallel Planning & Implementation
- Trigger `/evc-cmd-plan-x-parallel <detailed-instruction>` for parallel-executable plan
- Read `plan.md` for dependency graph and execution strategy
- Launch multiple `evc-fullstack-developer` agents in PARALLEL for concurrent phases
  - Pass: phase file path, environment info
- Use `evc-ui-ux-designer` for frontend (generate/analyze assets with `ai-multimodal`, edit with `imagemagick`)
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

**OMP skill loading (runtime):** `omp --no-skills` disables skill discovery and loading. When that flag is active, do not claim automatic skill activation: read each required migrated `SKILL.md` directly with the read tool from `./.omp/skills/<skill-name>/SKILL.md`, falling back to `~/.omp/agent/skills/<skill-name>/SKILL.md`. If the native file is absent, consult `./.omp/evcrate/skill-map.json` or `~/.omp/agent/evcrate/skill-map.json`, then read the archived package under `./.omp/evcrate/skills/` (or the published `~/.omp/agent/evcrate/skills/` path), then follow the instructions. Without `--no-skills`, use OMP's normal skill discovery.
