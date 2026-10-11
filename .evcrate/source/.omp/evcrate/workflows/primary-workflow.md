# Primary Workflow

**IMPORTANT:** Analyze the skills catalog and activate the skills that are needed for the task during the process.
**IMPORTANT**: Ensure token efficiency while maintaining high quality.

**Subagent gate:** Every delegated step is blocking. Wait for the delegated agent's terminal response, verify the requested report/artifact, and only then proceed. For parallel steps, wait for all agents and require one result per agent; interrupted or partial work does not satisfy the gate. A no-completion poll is non-terminal: repeat the native wait on the same agent set.

#### 1. Code Implementation
- Before you start, delegate to `evc-planner` agent to create an implementation plan with TODO tasks in `./plans` directory, then wait for and verify its terminal report.
- When in planning phase, use multiple `evc-researcher` agents in parallel to conduct research on different relevant technical topics; wait for all reports before passing the complete set to `evc-planner`.
- Write clean, readable, and maintainable code
- Follow established architectural patterns
- Implement features according to specifications
- Handle edge cases and error scenarios
- **DO NOT** create new enhanced files, update to the existing files directly.
- **[IMPORTANT]** After creating or modifying code file, run compile command/script to check for any compile errors.

#### 2. Testing
- Delegate to `evc-tester` agent to run tests and analyze the summary report; wait for its terminal result before interpreting the gate.
  - Write comprehensive unit tests
  - Ensure high code coverage
  - Test error scenarios
  - Validate performance requirements
- Tests are critical for ensuring code quality and reliability, **DO NOT** ignore failing tests just to pass the build or github actions.
- **IMPORTANT:** make sure you don't use fake data, mocks, cheats, tricks, temporary solutions, just to pass the build or github actions.
- **IMPORTANT:** Always fix failing tests following the recommendations, wait for the fix, then delegate to `evc-tester` again and wait for a fresh result; only finish when all tests pass.

#### 3. Code Quality
- After finishing implementation, delegate to `evc-code-reviewer` agent and wait for its complete review before deciding whether work is acceptable.
- Follow coding standards and conventions
- Write self-documenting code
- Add meaningful comments for complex logic
- Optimize for performance and maintainability

#### 4. Integration
- Always follow the plan given by `evc-planner` agent
- Ensure seamless integration with existing code
- Follow API contracts precisely
- Maintain backward compatibility
- Document breaking changes
- Delegate to `evc-docs-manager` agent to update docs in `./docs` directory if needed, then wait for and verify its report.

#### 5. Debugging
- When a user reports bugs or issues on the server or a CI/CD pipeline, delegate to `evc-debugger` agent and wait for its root-cause report.
- Read and verify the complete `evc-debugger` report before implementing the fix.
- Delegate to `evc-tester` agent and wait for its complete validation report.
- If the `evc-tester` agent reports failed tests, fix them following the recommendations, wait for the fix, then delegate to `evc-tester` again and wait for a fresh result; only finish when all tests pass.

**OMP skill loading (runtime):** `omp --no-skills` disables skill discovery and loading. When that flag is active, do not claim automatic skill activation: read each required migrated `SKILL.md` directly with the read tool from `./.omp/skills/<skill-name>/SKILL.md`, falling back to `~/.omp/agent/skills/<skill-name>/SKILL.md`. If the native file is absent, consult `./.omp/evcrate/skill-map.json` or `~/.omp/agent/evcrate/skill-map.json`, then read the archived package under `./.omp/evcrate/skills/` (or the published `~/.omp/agent/evcrate/skills/` path), then follow the instructions. Without `--no-skills`, use OMP's normal skill discovery.
