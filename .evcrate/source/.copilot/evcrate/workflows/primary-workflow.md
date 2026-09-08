# Primary Workflow

**IMPORTANT:** Analyze the skills catalog and activate the skills that are needed for the task during the process.
**IMPORTANT**: Ensure token efficiency while maintaining high quality.

**Subagent gate:** Every delegated step is blocking. Wait for the delegated agent's terminal response, verify the requested report/artifact, and only then proceed. For parallel steps, wait for all agents and require one result per agent; interrupted or partial work does not satisfy the gate. A no-completion poll is non-terminal: repeat the native wait on the same agent set.

#### 1. Code Implementation
- Before you start, delegate to `evcrate-planner` agent to create an implementation plan with TODO tasks in `./plans` directory, then wait for and verify its terminal report.
- When in planning phase, use multiple `evcrate-researcher` agents in parallel to conduct research on different relevant technical topics; wait for all reports before passing the complete set to `evcrate-planner`.
- Write clean, readable, and maintainable code
- Follow established architectural patterns
- Implement features according to specifications
- Handle edge cases and error scenarios
- **DO NOT** create new enhanced files, update to the existing files directly.
- **[IMPORTANT]** After creating or modifying code file, run compile command/script to check for any compile errors.

#### 2. Testing
- Delegate to `evcrate-tester` agent to run tests and analyze the summary report; wait for its terminal result before interpreting the gate.
  - Write comprehensive unit tests
  - Ensure high code coverage
  - Test error scenarios
  - Validate performance requirements
- Tests are critical for ensuring code quality and reliability, **DO NOT** ignore failing tests just to pass the build.
- **IMPORTANT:** make sure you don't use fake data, mocks, cheats, tricks, temporary solutions, just to pass the build or github actions.
- **IMPORTANT:** Always fix failing tests following the recommendations, wait for the fix, then delegate to `evcrate-tester` again and wait for a fresh result; only finish when all tests pass.

#### 3. Code Quality
- After finishing implementation, delegate to `evcrate-code-reviewer` agent and wait for its complete review before deciding whether work is acceptable. Scoped commands then use the named `review:<workflow-step>` checkpoint from `advisor-mentoring.md` when explicit `--advice` is active.
- Follow `advisor-mentoring.md`. When explicit advice mode is active, enter its
  canonical dispatcher at `review:<workflow-step>` after every terminal reviewer
  report and before any fix or approval decision. In default mode, apply the
  three-attempt correction state machine and use `stuck:<blocker-signature>` on
  the second matching occurrence before attempting final remediation. Each consultation
  forwards relevant prior counsel and owner disposition explicitly.
- At every named checkpoint, construct one bounded `evcrate-advisor-checkpoint/v2`
  payload under the mandatory task-state lifecycle and follow the canonical dispatcher
  in `advisor-mentoring.md`. The central controller manages policy, process bounds,
  transient retries, and cleanup.
- Before an existing irreversible, security-sensitive, or go/no-go decision that
  has no review coverage, use exactly one `decision:<workflow-step>` checkpoint;
  routine user preferences are not new checkpoints.
- Follow coding standards and conventions
- Write self-documenting code
- Add meaningful comments for complex logic
- Optimize for performance and maintainability

#### 4. Integration
- Always follow the plan given by `evcrate-planner` agent
- Ensure seamless integration with existing code
- Follow API contracts precisely
- Maintain backward compatibility
- Document breaking changes
- Delegate to `evcrate-docs-manager` agent to update docs in `./docs` directory if needed, then wait for and verify its report.

#### 5. Debugging
- When a user reports bugs or issues on the server or a CI/CD pipeline, delegate to `evcrate-debugger` agent and wait for its root-cause report.
- Read and verify the complete `evcrate-debugger` report before implementing the fix.
- Delegate to `evcrate-tester` agent and wait for its complete validation report.
- If the `evcrate-tester` agent reports failed tests, fix them follow the recommendations and repeat from the **Step 2**.
- Apply the canonical correction state machine defined in `advisor-mentoring.md`:
  track stable blocker signatures, invoke `stuck:<blocker-signature>` on the second
  consecutive match before attempting final remediation, and enter human handoff
  after three failed correction outcomes (`correction_count === 3`).
