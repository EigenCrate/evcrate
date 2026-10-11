---
name: evc-cmd-cook-x-auto-x-parallel
description: Plan parallel phases & execute with fullstack-developer agents
---
# evc-cmd-cook-x-auto-x-parallel

Command Path: /evc-cmd-cook-x-auto-x-parallel

Description: Plan parallel phases & execute with fullstack-developer agents

---
description: "Plan parallel phases & execute with fullstack-developer agents"
argument-hint: "[tasks]"
---

**Ultrathink parallel** to implement: <tasks>$ARGUMENTS</tasks>

**IMPORTANT:** Activate needed skills. Ensure token efficiency. Sacrifice grammar for concision.

## Positioning

Use this only when work can be split into independent phases with clear dependencies and file ownership. If ownership, acceptance criteria, or side effects are unclear, run base `/evc-cmd-cook` first.

## Workflow

### 1. Preflight & Research
- Scout codebase with `/evc-cmd-scout-x-ext` before planning
- Define output, acceptance criteria, scope boundary, side-effect risks, and testing strategy
- Use max 2 `evc-researcher` agents in parallel if tasks complex
- Keep reports ≤150 lines

### 2. Parallel Planning
- Trigger `/evc-cmd-plan-x-parallel <detailed-instruction>`
- Wait for plan with:
  - dependency graph
  - execution strategy
  - file ownership matrix
  - side-effect review checklist
  - per-phase success criteria
- Do not proceed if any parallel phase has overlapping file ownership

### 3. Parallel Implementation
- Read `plan.md` for dependency graph
- Launch multiple `evc-fullstack-developer` agents in PARALLEL for concurrent phases
  - Example: "Phases 1-3 parallel" → launch 3 agents simultaneously
  - Pass phase file path: `{plan-dir}/phase-XX-*.md`
  - Include environment info
- Wait for all parallel phases complete before dependent phases
- Sequential phases: launch one agent at a time

### 4. Testing
- Use `evc-tester` subagent for full test suite
- NO fake data/mocks/cheats
- If fail: use `evc-debugger`, fix, repeat

### 5. Code Review
- Use `evc-code-reviewer` for all changes
- If critical issues: fix, retest, rerun review

### 6. Project Management & Docs
- If approved: use `evc-project-manager` + `evc-docs-manager` in parallel
- Update plan files, docs, roadmap
- If rejected: fix and repeat

### 7. Final Report
- Summary of all parallel phases
- Guide to get started
- Ask to commit (use `evc-git-manager` if yes)

**Example:** Phases 1-3 parallel → Launch 3 fullstack-developer agents → Wait → Phase 4 sequential
