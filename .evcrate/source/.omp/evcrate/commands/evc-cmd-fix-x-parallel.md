---
argument-hint: "[issues]"
description: "Analyze & fix issues with parallel fullstack-developer agents"
---


**Ultrathink parallel** to fix: <issues>$ARGUMENTS</issues>

**IMPORTANT:** Activate needed skills. Ensure token efficiency. Sacrifice grammar for concision.

## Workflow

### 1. Issue Analysis
- Use `evc-debugger` subagent to analyze root causes
- Use `/evc-cmd-scout-x-ext` to find related files
- Categorize issues by scope/area (frontend, backend, auth, payments, etc.)
- Identify dependencies between issues

### 2. Parallel Fix Planning
- Trigger `/evc-cmd-plan-x-parallel <detailed-fix-instructions>` for parallel-executable fix plan
- Wait for plan with dependency graph, execution strategy, file ownership matrix
- Group independent fixes for parallel execution
- Sequential fixes for dependent issues

### 3. Parallel Fix Implementation
- Read `plan.md` for dependency graph
- Launch multiple `evc-fullstack-developer` agents in PARALLEL for independent fixes
  - Example: "Fix auth + Fix payments + Fix UI" → launch 3 agents simultaneously
  - Pass phase file path: `{plan-dir}/phase-XX-*.md`
  - Include environment info
- Wait for all parallel fixes complete before dependent fixes
- Sequential fixes: launch one agent at a time

### 4. Testing
- Use `evc-tester` subagent for full test suite
- NO fake data/mocks/cheats
- Verify all issues resolved
- If fail: use `evc-debugger`, fix, repeat

### 5. Code Review
- Use `evc-code-reviewer` for all changes
- Verify fixes don't introduce regressions
- If critical issues: fix, retest

### 6. Project Management & Docs
- If approved: use `evc-project-manager` + `evc-docs-manager` in parallel
- Update plan files, docs, roadmap
- If rejected: fix and repeat

### 7. Final Report
- Summary of all fixes from parallel phases
- Verification status per issue
- Ask to commit (use `evc-git-manager` if yes)

**Example:** Fix 1 (auth) + Fix 2 (payments) + Fix 3 (UI) → Launch 3 fullstack-developer agents → Wait → Fix 4 (integration) sequential

**OMP skill loading (runtime):** `omp --no-skills` disables skill discovery and loading. When that flag is active, do not claim automatic skill activation: read each required migrated `SKILL.md` directly with the read tool from `./.omp/skills/<skill-name>/SKILL.md`, falling back to `~/.omp/agent/skills/<skill-name>/SKILL.md`. If the native file is absent, consult `./.omp/evcrate/skill-map.json` or `~/.omp/agent/evcrate/skill-map.json`, then read the archived package under `./.omp/evcrate/skills/` (or the published `~/.omp/agent/evcrate/skills/` path), then follow the instructions. Without `--no-skills`, use OMP's normal skill discovery.
