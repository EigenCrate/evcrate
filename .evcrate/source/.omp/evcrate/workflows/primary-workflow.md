# Primary Workflow

**IMPORTANT:** Analyze the skills catalog and activate the skills that are needed for the task during the process.
**IMPORTANT**: Ensure token efficiency while maintaining high quality.

**Subagent gate:** Every delegated step is blocking. Wait for the delegated agent's terminal response, verify the requested report/artifact, and only then proceed. For parallel steps, wait for all agents and require one result per agent; interrupted or partial work does not satisfy the gate. A no-completion poll is non-terminal: repeat the native wait on the same agent set.

#### 1. Code Implementation
- Before you start, delegate to `planner` agent to create an implementation plan with TODO tasks in `./plans` directory, then wait for and verify its terminal report.
- When in planning phase, use multiple `researcher` agents in parallel to conduct research on different relevant technical topics; wait for all reports before passing the complete set to `planner`.
- Write clean, readable, and maintainable code
- Follow established architectural patterns
- Implement features according to specifications
- Handle edge cases and error scenarios
- **DO NOT** create new enhanced files, update to the existing files directly.
- **[IMPORTANT]** After creating or modifying code file, run compile command/script to check for any compile errors.

#### 2. Testing
- Delegate to `tester` agent to run tests and analyze the summary report; wait for its terminal result before interpreting the gate.
  - Write comprehensive unit tests
  - Ensure high code coverage
  - Test error scenarios
  - Validate performance requirements
- Tests are critical for ensuring code quality and reliability, **DO NOT** ignore failing tests just to pass the build.
- **IMPORTANT:** make sure you don't use fake data, mocks, cheats, tricks, temporary solutions, just to pass the build or github actions.
- **IMPORTANT:** Always fix failing tests following the recommendations, wait for the fix, then delegate to `tester` again and wait for a fresh result; only finish when all tests pass.

#### 3. Code Quality
- After finishing implementation, delegate to `code-reviewer` agent and wait for its complete review before deciding whether work is acceptable. Scoped commands then use the named `review:<workflow-step>` checkpoint from `advisor-mentoring.md` when explicit `--advice` is active.
- Follow `advisor-mentoring.md`. When explicit advice mode is active, enter its
  canonical dispatcher exactly once after every terminal reviewer report and
  before any fix or approval decision. The native branch delegates to one fresh
  `advisor`; the external branch uses one adapter. Without explicit mode, use
  its two-occurrence stuck threshold and once-per-episode escalation. Each later
  consultation forwards relevant prior counsel and owner disposition explicitly.
- At every named checkpoint, construct one bounded
  `evcrate-advisor-checkpoint/v1` envelope and follow the canonical dispatcher
  marker in `advisor-mentoring.md`. The primary workflow does not resolve
  routes, choose providers/models/effort, invoke CLIs, or run native and
  external branches together.
- Before an existing irreversible, security-sensitive, or go/no-go decision that
  has no review coverage, use exactly one `decision:<workflow-step>` checkpoint;
  routine user preferences are not new checkpoints.
- Follow coding standards and conventions
- Write self-documenting code
- Add meaningful comments for complex logic
- Optimize for performance and maintainability

#### 4. Integration
- Always follow the plan given by `planner` agent
- Ensure seamless integration with existing code
- Follow API contracts precisely
- Maintain backward compatibility
- Document breaking changes
- Delegate to `docs-manager` agent to update docs in `./docs` directory if needed, then wait for and verify its report.

#### 5. Debugging
- When a user reports bugs or issues on the server or a CI/CD pipeline, delegate to `debugger` agent and wait for its root-cause report.
- Read and verify the complete `debugger` report before implementing the fix.
- Delegate to `tester` agent and wait for its complete validation report.
- If the `tester` agent reports failed tests, fix them follow the recommendations and repeat from the **Step 2**.
- Track stable blocker signatures as defined by `advisor-mentoring.md`. After the
  second consecutive match without progress, obtain one terminal `advisor`
  report before retrying; if that advised attempt returns the same blocker, stop
  and ask the user.

**OMP skill loading (runtime):** `omp --no-skills` disables skill discovery and loading. When that flag is active, do not claim automatic skill activation: read each required migrated `SKILL.md` directly with the read tool from `./.omp/skills/<skill-name>/SKILL.md`, falling back to `~/.omp/agent/skills/<skill-name>/SKILL.md`. If the native file is absent, consult `./.omp/evcrate/skill-map.json` or `~/.omp/agent/evcrate/skill-map.json`, then read the archived package under `./.omp/evcrate/skills/` (or the published `~/.omp/agent/evcrate/skills/` path), then follow the instructions. Without `--no-skills`, use OMP's normal skill discovery.
